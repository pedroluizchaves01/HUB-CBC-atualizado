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
// Cache de coleções em memória
// ---------------------------------------------------------------------------
// Antes, cada polling do frontend (a cada 8s, por aba) relia TODAS as tabelas inteiras
// no Postgres — centenas de GB de tráfego de saída do Supabase por mês para ~8 MB de
// dados. Agora a leitura completa de uma coleção fica em memória e só volta ao banco quando:
//   (a) alguma gravação nesta mesma instância altera a coleção (invalidação imediata), ou
//   (b) passa CACHE_TTL_MS (cobre alterações feitas fora do backend: seeds, painel do Supabase).
//
// PREMISSA: o backend roda em UMA instância (Coolify). Com várias réplicas, cada uma teria
// o próprio cache e veria gravações das outras só após o TTL.

const CACHE_TTL_MS = 5 * 60_000;
// Identifica este processo: versões de antes de um restart nunca coincidem com as novas.
const BOOT_ID = Date.now().toString(36);

interface CacheEntry {
  rows: Array<{ id: string; data: any }>;
  loadedAt: number;
}

const collectionCache = new Map<string, CacheEntry>();
const inflightLoads = new Map<string, Promise<CacheEntry>>();
const collectionVersions = new Map<string, number>();

function bumpVersion(collection: string): void {
  collectionVersions.set(collection, (collectionVersions.get(collection) || 0) + 1);
}

/** Descarta o cache de uma coleção após uma gravação e avança sua versão. */
function invalidateCollection(collection: string): void {
  collectionCache.delete(collection);
  bumpVersion(collection);
}

/**
 * Versão atual de uma coleção. Muda a cada gravação e a cada recarga pelo TTL.
 * O /api/data-bundle usa isso para não reenviar coleções que o navegador já tem.
 */
export function getCollectionVersion(collection: string): string {
  return `${BOOT_ID}.${collectionVersions.get(collection) || 0}`;
}

async function loadCollectionRows(collection: string): Promise<CacheEntry> {
  const cached = collectionCache.get(collection);
  if (cached && Date.now() - cached.loadedAt < CACHE_TTL_MS) return cached;

  // Várias requisições simultâneas pedindo a mesma coleção compartilham UMA consulta.
  const pending = inflightLoads.get(collection);
  if (pending) return pending;

  const versionAtStart = collectionVersions.get(collection) || 0;
  const load = (async () => {
    await ensureSchema();
    const t = tableName(collection);
    const r = await getPool().query(`SELECT id, data FROM ${t}`);
    const entry: CacheEntry = { rows: r.rows, loadedAt: Date.now() };
    // Só guarda se ninguém gravou na coleção durante a consulta (evita cache velho).
    if ((collectionVersions.get(collection) || 0) === versionAtStart) {
      if (cached) bumpVersion(collection); // recarga pelo TTL: o conteúdo pode ter mudado
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
        await client.query(
          `DO $$ BEGIN
             IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
               EXECUTE 'REVOKE ALL ON ${t} FROM anon, authenticated';
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
    await ensureSchema();
    const t = tableName(this.collection);
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
    invalidateCollection(this.collection);
  }

  async delete(): Promise<void> {
    await ensureSchema();
    const t = tableName(this.collection);
    await getPool().query(`DELETE FROM ${t} WHERE id = $1`, [this.id]);
    invalidateCollection(this.collection);
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
