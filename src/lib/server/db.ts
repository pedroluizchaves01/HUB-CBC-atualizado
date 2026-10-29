// src/lib/server/db.ts
// Camada de banco de dados — Postgres (Supabase) via driver `pg`.
//
// Este módulo substitui o antigo firebaseAdmin.ts. Em vez do Firestore, os dados vivem
// em Postgres, mas expomos uma API deliberadamente parecida com a do Firestore
// (collection().doc().get()/set()/delete(), batch, etc.) para que dataService.ts,
// authService.ts e telegramServer.ts mudem o mínimo possível.
//
// Modelo de dados: cada "coleção" do Firestore vira uma tabela `(id TEXT PK, data JSONB)`.
// O documento inteiro é guardado no JSONB `data` (com o campo id também dentro, por
// compatibilidade). Isso preserva o formato schemaless que o app já usava.
//
// Conexão: process.env.DATABASE_URL (connection string do Supabase, pooler porta 6543).

import { Pool, PoolClient } from "pg";
import { ALLOWED_COLLECTIONS } from "./dataService";

let pool: Pool | null = null;
let initPromise: Promise<void> | null = null;

const NO_URL_MSG =
  "Banco de dados não configurado no servidor. Defina DATABASE_URL (connection string do " +
  "Supabase/Postgres). Veja DEPLOY.md.";

/** Nome de tabela seguro para uma coleção (a coleção já é validada pela allowlist). */
function tableName(collection: string): string {
  if (!/^[a-z0-9_]+$/i.test(collection)) {
    throw new Error(`Nome de coleção inválido: ${collection}`);
  }
  return `c_${collection.toLowerCase()}`;
}

// ---------------------------------------------------------------------------
// Cache de coleções em memória, invalidado por VERSÃO do banco
// ---------------------------------------------------------------------------
// Cada tabela c_* tem um gatilho que incrementa sua linha em `cbc_table_versions` a cada
// INSERT/UPDATE/DELETE/TRUNCATE — venha a alteração do backend, de um script ou do painel
// do Supabase. O servidor guarda a leitura completa de cada coleção em memória e só volta
// a ler a tabela quando a versão dela no banco muda.
//
// Para saber se algo mudou, o servidor lê a tabela de versões inteira (34 linhas, poucos
// bytes) no máximo uma vez a cada VERSION_CHECK_INTERVAL_MS, e só quando alguém precisa
// dos dados. Com o sistema parado, nada é lido.
//
// Rede de segurança: se a checagem de versões falhar (ex.: tabela ausente), cada coleção
// volta a ser relida no máximo a cada MAX_CACHE_AGE_MS. Gravações feitas pelo próprio
// backend atualizam o cache na hora (no lugar, sem reler a tabela — ver applyLocalWrite;
// na dúvida, descartam o cache), em qualquer caso.
//
// PREMISSA: o backend roda em UMA instância (Coolify). Mesmo com mais de uma, as versões
// do banco fariam cada réplica perceber as gravações das outras em até 30 s.

const VERSION_CHECK_INTERVAL_MS = 30_000;
const MAX_CACHE_AGE_MS = 6 * 60 * 60_000;
const VERSIONS_TABLE = "cbc_table_versions";
// Identifica este processo: versões de antes de um restart nunca coincidem com as novas.
const BOOT_ID = Date.now().toString(36);

interface CacheEntry {
  rows: Array<{ id: string; data: any }>;
  loadedAt: number;
  /** Versão da tabela no banco no momento da leitura; null = desconhecida. */
  dbVersion: string | null;
}

const collectionCache = new Map<string, CacheEntry>();
const inflightLoads = new Map<string, Promise<CacheEntry>>();
const collectionVersions = new Map<string, number>();

// Última fotografia da tabela de versões (nome da tabela → versão).
let dbVersionsSnapshot: Map<string, string> | null = null;
let dbVersionsCheckedAt = 0;
let dbVersionsInflight: Promise<Map<string, string> | null> | null = null;
let dbVersionsWarned = false;

function bumpVersion(collection: string): void {
  collectionVersions.set(collection, (collectionVersions.get(collection) || 0) + 1);
}

/** Descarta o cache de uma coleção após uma gravação e avança sua versão. */
function invalidateCollection(collection: string): void {
  collectionCache.delete(collection);
  bumpVersion(collection);
}

// Quanto cada gravação avança a versão da tabela (ver applyLocalWrite).
const UPSERT_VERSION_STEP = 2;
const DELETE_VERSION_STEP = 1;

/**
 * Após gravar/excluir UM documento, atualiza o cache em memória no lugar em vez de
 * descartá-lo — assim a próxima leitura não precisa baixar a tabela inteira do banco
 * (era a principal fonte de egress: cada salvamento automático de um projeto relia
 * toda a c_arch_projects).
 *
 * Só aplica no lugar se a versão da tabela no banco avançou EXATAMENTE o que esta
 * gravação avança (`versionStep`) desde a leitura em cache — ou seja, a única alteração
 * foi esta. Atenção: um upsert (INSERT ... ON CONFLICT DO UPDATE) dispara os gatilhos de
 * comando de INSERT E de UPDATE, então avança 2; um DELETE avança 1. Qualquer outra situação
 * (gravação concorrente, alteração externa, cache trocado durante a espera, checagem
 * falhou) descarta o cache, como antes. A versão para os navegadores só avança depois
 * que o cache já reflete a gravação, para nenhum navegador guardar dado velho com
 * a versão nova.
 *
 * change = null → exclusão; senão o payload gravado (merge = mescla rasa, igual ao `||` do JSONB).
 */
async function applyLocalWrite(
  collection: string,
  id: string,
  change: { payload: any; merge: boolean } | null,
  versionStep: number,
): Promise<void> {
  const cached = collectionCache.get(collection);
  try {
    if (!cached || cached.dbVersion === null) {
      collectionCache.delete(collection);
      return;
    }
    let newVersion: string | null = null;
    try {
      const v = await getPool().query(
        `SELECT version::text AS version FROM ${VERSIONS_TABLE} WHERE table_name = $1`,
        [tableName(collection)]
      );
      newVersion = v.rows[0]?.version ?? null;
    } catch { /* sem versão confiável: descarta abaixo */ }

    if (
      newVersion === null ||
      collectionCache.get(collection) !== cached ||
      BigInt(newVersion) !== BigInt(cached.dbVersion) + BigInt(versionStep)
    ) {
      collectionCache.delete(collection);
      return;
    }

    let rows: Array<{ id: string; data: any }>;
    if (change === null) {
      rows = cached.rows.filter((r) => r.id !== id);
    } else {
      // Mesmo formato que o Postgres devolveria (undefined some, Date vira string...).
      const stored = JSON.parse(JSON.stringify(change.payload));
      const idx = cached.rows.findIndex((r) => r.id === id);
      const data = change.merge && idx >= 0 ? { ...cached.rows[idx].data, ...stored } : stored;
      rows = cached.rows.slice();
      if (idx >= 0) rows[idx] = { id, data };
      else rows.push({ id, data });
    }
    collectionCache.set(collection, { rows, loadedAt: cached.loadedAt, dbVersion: newVersion });
  } catch {
    collectionCache.delete(collection);
  } finally {
    bumpVersion(collection);
  }
}

/**
 * Versão atual de uma coleção (para o navegador). Muda a cada gravação e a cada
 * recarga causada por alteração externa. O /api/data-bundle usa isso para não
 * reenviar coleções que o navegador já tem.
 */
export function getCollectionVersion(collection: string): string {
  return `${BOOT_ID}.${collectionVersions.get(collection) || 0}`;
}

/**
 * Versões atuais de todas as tabelas no banco, com no máximo uma consulta a cada
 * VERSION_CHECK_INTERVAL_MS. Retorna null se a checagem falhar (o cache usa o teto de idade).
 */
async function getDbVersions(): Promise<Map<string, string> | null> {
  if (dbVersionsSnapshot && Date.now() - dbVersionsCheckedAt < VERSION_CHECK_INTERVAL_MS) {
    return dbVersionsSnapshot;
  }
  if (dbVersionsInflight) return dbVersionsInflight;
  dbVersionsInflight = (async () => {
    try {
      await ensureSchema();
      const r = await getPool().query(`SELECT table_name, version::text AS version FROM ${VERSIONS_TABLE}`);
      dbVersionsSnapshot = new Map(r.rows.map((row: any) => [row.table_name, row.version]));
      dbVersionsCheckedAt = Date.now();
      dbVersionsWarned = false;
      return dbVersionsSnapshot;
    } catch (e: any) {
      if (!dbVersionsWarned) {
        console.warn("[cache] Checagem de versões falhou; usando teto de 6 h:", e?.message || e);
        dbVersionsWarned = true;
      }
      dbVersionsSnapshot = null;
      return null;
    } finally {
      dbVersionsInflight = null;
    }
  })();
  return dbVersionsInflight;
}

async function isCacheFresh(collection: string, cached: CacheEntry): Promise<boolean> {
  if (Date.now() - cached.loadedAt >= MAX_CACHE_AGE_MS) return false;
  const versions = await getDbVersions();
  if (!versions || cached.dbVersion === null) return true; // sem versões: vale o teto de idade
  const current = versions.get(tableName(collection)) ?? "0";
  // "<=" e não "===": a fotografia de versões pode ser até 30 s mais antiga que esta
  // leitura (ex.: logo após uma gravação do próprio backend). Só uma versão MAIOR no
  // banco indica alteração que o cache ainda não tem.
  return BigInt(current) <= BigInt(cached.dbVersion);
}

async function loadCollectionRows(collection: string): Promise<CacheEntry> {
  const cached = collectionCache.get(collection);
  if (cached && (await isCacheFresh(collection, cached))) return cached;

  // Várias requisições simultâneas pedindo a mesma coleção compartilham UMA consulta.
  const pending = inflightLoads.get(collection);
  if (pending) return pending;

  const versionAtStart = collectionVersions.get(collection) || 0;
  const load = (async () => {
    await ensureSchema();
    const t = tableName(collection);
    // A versão é lida ANTES dos dados: se algo mudar entre as duas leituras, a próxima
    // checagem vê uma versão maior e relê — nunca fica um cache velho marcado como novo.
    let dbVersion: string | null = null;
    try {
      const v = await getPool().query(
        `SELECT version::text AS version FROM ${VERSIONS_TABLE} WHERE table_name = $1`, [t]
      );
      dbVersion = v.rows[0]?.version ?? "0";
    } catch { /* sem tabela de versões: segue com teto de idade */ }
    const r = await getPool().query(`SELECT id, data FROM ${t}`);
    const entry: CacheEntry = { rows: r.rows, loadedAt: Date.now(), dbVersion };
    // Só guarda se ninguém gravou na coleção durante a consulta (evita cache velho).
    if ((collectionVersions.get(collection) || 0) === versionAtStart) {
      if (cached) bumpVersion(collection); // recarga por mudança externa: avisa os navegadores
      collectionCache.set(collection, entry);
    }
    return entry;
  })().finally(() => {
    inflightLoads.delete(collection);
  });
  inflightLoads.set(collection, load);
  return load;
}

function getPool(): Pool {
  if (pool) return pool;
  const url = process.env.DATABASE_URL;
  if (!url || !url.trim()) throw new Error(NO_URL_MSG);
  pool = new Pool({
    connectionString: url,
    // Supabase exige TLS; não validamos a CA (o pooler usa cert gerenciado).
    ssl: { rejectUnauthorized: false },
    max: 8,
    // Mantém conexões ociosas por 5 min para não reabrir sessão no pooler a cada ciclo.
    idleTimeoutMillis: 300_000,
    connectionTimeoutMillis: 15_000,
    // O pooler do Supabase em modo "transaction" não suporta prepared statements
    // nomeados persistentes; o driver `pg` usa statements sem nome por padrão, então
    // isso já é compatível. Mantido explícito para clareza.
  });
  pool.on("error", (err) => {
    console.error("Erro inesperado no pool do Postgres:", err);
  });
  return pool;
}

/**
 * Garante que todas as tabelas das coleções permitidas existam. Idempotente.
 * Roda uma vez no primeiro acesso (e é chamada explicitamente no boot do server).
 */
export function ensureSchema(): Promise<void> {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    const p = getPool();
    const client = await p.connect();
    try {
      // Tabela de versões + função do gatilho (ver "Cache ... por VERSÃO" acima).
      await client.query(
        `CREATE TABLE IF NOT EXISTS ${VERSIONS_TABLE} (
           table_name TEXT PRIMARY KEY,
           version    BIGINT NOT NULL DEFAULT 0,
           updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
         )`
      );
      await client.query(`ALTER TABLE ${VERSIONS_TABLE} ENABLE ROW LEVEL SECURITY`);
      await client.query(
        `CREATE OR REPLACE FUNCTION cbc_bump_table_version() RETURNS trigger
           LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
         BEGIN
           INSERT INTO ${VERSIONS_TABLE} (table_name, version, updated_at)
                VALUES (TG_TABLE_NAME, 1, now())
           ON CONFLICT (table_name)
             DO UPDATE SET version = ${VERSIONS_TABLE}.version + 1, updated_at = now();
           RETURN NULL;
         END $fn$`
      );
      for (const col of ALLOWED_COLLECTIONS) {
        const t = tableName(col);
        await client.query(
          `CREATE TABLE IF NOT EXISTS ${t} (
             id   TEXT PRIMARY KEY,
             data JSONB NOT NULL DEFAULT '{}'::jsonb
           )`
        );
        // Segurança: tabelas nunca ficam expostas à API pública do Supabase (PostgREST).
        // O backend conecta como dono das tabelas e não é afetado pelo RLS.
        await client.query(`ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY`);
        // Gatilho por COMANDO (não por linha): um custo fixo mínimo por gravação.
        await client.query(
          `CREATE OR REPLACE TRIGGER cbc_version_bump
             AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON ${t}
             FOR EACH STATEMENT EXECUTE FUNCTION cbc_bump_table_version()`
        );
        await client.query(
          `DO $$ BEGIN
             IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
               EXECUTE 'REVOKE ALL ON ${t}, ${VERSIONS_TABLE} FROM anon, authenticated';
             END IF;
           END $$`
        );
      }
      // Notificações são sempre lidas por destinatário (ver listNotificationsForRecipient).
      await client.query(
        `CREATE INDEX IF NOT EXISTS idx_notifications_recipient
           ON c_notifications ((data->>'recipientUserId'))`
      );
    } finally {
      client.release();
    }
  })().catch((e) => {
    // Se falhar, permite nova tentativa numa próxima chamada.
    initPromise = null;
    throw e;
  });
  return initPromise;
}

// ---------------------------------------------------------------------------
// API estilo Firestore (subconjunto usado pelo app)
// ---------------------------------------------------------------------------

export interface DocSnapshot {
  id: string;
  exists: boolean;
  data(): any;
}

export interface QueryDocSnapshot {
  id: string;
  data(): any;
  ref: DocRef;
}

class DocRef {
  constructor(public readonly collection: string, public id: string) {}

  async get(): Promise<DocSnapshot> {
    const t = tableName(this.collection);
    // Coleção já em cache e em dia: responde da memória (sem ida ao banco). Antes, cada
    // gravação pela API lia o documento atual direto do banco.
    const cached = collectionCache.get(this.collection);
    if (cached && (await isCacheFresh(this.collection, cached))) {
      const row = cached.rows.find((r) => r.id === this.id);
      if (!row) return { id: this.id, exists: false, data: () => undefined };
      const data = structuredClone(row.data);
      return { id: this.id, exists: true, data: () => data };
    }
    await ensureSchema();
    const r = await getPool().query(`SELECT data FROM ${t} WHERE id = $1`, [this.id]);
    if (r.rowCount === 0) {
      return { id: this.id, exists: false, data: () => undefined };
    }
    const data = r.rows[0].data;
    return { id: this.id, exists: true, data: () => data };
  }

  /** set com merge:true (default) faz upsert mesclando; merge:false substitui. */
  async set(value: any, opts?: { merge?: boolean }): Promise<void> {
    await ensureSchema();
    const t = tableName(this.collection);
    const merge = opts?.merge !== false;
    const payload = { ...value, id: this.id };
    if (merge) {
      await getPool().query(
        `INSERT INTO ${t} (id, data) VALUES ($1, $2::jsonb)
           ON CONFLICT (id) DO UPDATE SET data = ${t}.data || EXCLUDED.data`,
        [this.id, JSON.stringify(payload)]
      );
    } else {
      await getPool().query(
        `INSERT INTO ${t} (id, data) VALUES ($1, $2::jsonb)
           ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data`,
        [this.id, JSON.stringify(payload)]
      );
    }
    await applyLocalWrite(this.collection, this.id, { payload, merge }, UPSERT_VERSION_STEP);
  }

  async delete(): Promise<void> {
    await ensureSchema();
    const t = tableName(this.collection);
    await getPool().query(`DELETE FROM ${t} WHERE id = $1`, [this.id]);
    await applyLocalWrite(this.collection, this.id, null, DELETE_VERSION_STEP);
  }
}

class CollectionRef {
  constructor(private collection: string) {}

  doc(id?: string): DocRef {
    // Sem id: gera um id aleatório estável (sem depender de Math.random em runtime crítico).
    const finalId = id && id.length ? id : cryptoRandomId();
    return new DocRef(this.collection, finalId);
  }

  async get(): Promise<{ docs: QueryDocSnapshot[]; empty: boolean }> {
    tableName(this.collection); // valida o nome antes de usar o cache
    const { rows } = await loadCollectionRows(this.collection);
    // Cada chamador recebe uma CÓPIA: nenhum código altera o cache por referência.
    const docs = rows.map((row) => {
      const data = structuredClone(row.data);
      return {
        id: row.id,
        data: () => data,
        ref: new DocRef(this.collection, row.id),
      };
    });
    return { docs, empty: docs.length === 0 };
  }

  /** Equivalente ao .limit(1).get() do Firestore, usado pelos seeds para checar vazio. */
  limit(n: number) {
    const collection = this.collection;
    return {
      async get(): Promise<{ docs: QueryDocSnapshot[]; empty: boolean }> {
        await ensureSchema();
        const t = tableName(collection);
        const r = await getPool().query(`SELECT id, data FROM ${t} LIMIT $1`, [n]);
        const docs = r.rows.map((row) => ({
          id: row.id,
          data: () => row.data,
          ref: new DocRef(collection, row.id),
        }));
        return { docs, empty: docs.length === 0 };
      },
    };
  }
}

/** Operações em lote (equivalente ao WriteBatch do Firestore). */
class Batch {
  private ops: Array<{ ref: DocRef; value: any; merge: boolean }> = [];

  set(ref: DocRef, value: any, opts?: { merge?: boolean }): Batch {
    this.ops.push({ ref, value, merge: opts?.merge !== false });
    return this;
  }

  async commit(): Promise<void> {
    if (this.ops.length === 0) return;
    await ensureSchema();
    const client: PoolClient = await getPool().connect();
    try {
      await client.query("BEGIN");
      for (const { ref, value, merge } of this.ops) {
        const t = tableName(ref.collection);
        const payload = { ...value, id: ref.id };
        if (merge) {
          await client.query(
            `INSERT INTO ${t} (id, data) VALUES ($1, $2::jsonb)
               ON CONFLICT (id) DO UPDATE SET data = ${t}.data || EXCLUDED.data`,
            [ref.id, JSON.stringify(payload)]
          );
        } else {
          await client.query(
            `INSERT INTO ${t} (id, data) VALUES ($1, $2::jsonb)
               ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data`,
            [ref.id, JSON.stringify(payload)]
          );
        }
      }
      await client.query("COMMIT");
      for (const c of new Set(this.ops.map((o) => o.ref.collection))) invalidateCollection(c);
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }
}

class Database {
  collection(name: string): CollectionRef {
    return new CollectionRef(name);
  }
  batch(): Batch {
    return new Batch();
  }
}

/**
 * Notificações de UM destinatário, filtradas no próprio Postgres (com índice), mais
 * recentes primeiro. Evita baixar as notificações de todos os usuários a cada polling.
 * Não passa pelo cache de coleção: a consulta já é pequena e indexada.
 */
export async function listNotificationsForRecipient(
  recipientUserId: string,
  limit = 100,
): Promise<Array<{ id: string; data: any }>> {
  await ensureSchema();
  const r = await getPool().query(
    `SELECT id, data FROM c_notifications
      WHERE data->>'recipientUserId' = $1
      ORDER BY CASE WHEN data->>'createdAt' ~ '^\\d{4}-\\d{2}-\\d{2}'
                    THEN data->>'createdAt' END DESC NULLS LAST
      LIMIT $2`,
    [recipientUserId, limit]
  );
  return r.rows;
}

/**
 * Limpeza periódica: remove notificações lidas há mais de 30 dias e não lidas há mais
 * de 90 dias. Retorna quantas foram apagadas.
 */
export async function purgeOldNotifications(): Promise<number> {
  await ensureSchema();
  const r = await getPool().query(
    `DELETE FROM c_notifications
      WHERE (data->>'createdAt') ~ '^\\d{4}-\\d{2}-\\d{2}'
        AND (
          ((data->>'read')::boolean IS TRUE AND (data->>'createdAt')::timestamptz < now() - interval '30 days')
          OR (data->>'createdAt')::timestamptz < now() - interval '90 days'
        )`
  );
  if ((r.rowCount || 0) > 0) invalidateCollection("notifications");
  return r.rowCount || 0;
}

const singletonDb = new Database();

/** Retorna o "banco" (API estilo Firestore sobre Postgres). Lança se DATABASE_URL faltar. */
export function getDb(): Database {
  // Valida cedo a existência da URL para dar erro claro (paralelo ao getAdminDb antigo).
  getPool();
  return singletonDb;
}

/** Mantido por compatibilidade com chamadas antigas (era getAdminDb no firebaseAdmin). */
export function getAdminDb(): Database {
  return getDb();
}

/** Health-check: o banco está configurado e alcançável? */
export async function isDbConfigured(): Promise<boolean> {
  try {
    const url = process.env.DATABASE_URL;
    if (!url || !url.trim()) return false;
    await getPool().query("SELECT 1");
    return true;
  } catch {
    return false;
  }
}

// Gera um id aleatório no estilo do Firestore (20 chars alfanuméricos).
function cryptoRandomId(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { randomBytes } = require("crypto") as typeof import("crypto");
  const bytes = randomBytes(20);
  let out = "";
  for (let i = 0; i < 20; i++) out += chars[bytes[i] % chars.length];
  return out;
}
