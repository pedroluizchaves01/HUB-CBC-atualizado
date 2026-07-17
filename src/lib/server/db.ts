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

function getPool(): Pool {
  if (pool) return pool;
  const url = process.env.DATABASE_URL;
  if (!url || !url.trim()) throw new Error(NO_URL_MSG);
  pool = new Pool({
    connectionString: url,
    // Supabase exige TLS; não validamos a CA (o pooler usa cert gerenciado).
    ssl: { rejectUnauthorized: false },
    max: 8,
    idleTimeoutMillis: 30_000,
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
      }
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
  }

  async delete(): Promise<void> {
    await ensureSchema();
    const t = tableName(this.collection);
    await getPool().query(`DELETE FROM ${t} WHERE id = $1`, [this.id]);
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
    await ensureSchema();
    const t = tableName(this.collection);
    const r = await getPool().query(`SELECT id, data FROM ${t}`);
    const docs = r.rows.map((row) => ({
      id: row.id,
      data: () => row.data,
      ref: new DocRef(this.collection, row.id),
    }));
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
