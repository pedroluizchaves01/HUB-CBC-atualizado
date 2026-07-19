// src/lib/server/dataService.ts
// Camada de dados do "backend guardião": todo CRUD do Firestore passa por aqui, via Admin SDK.
// O frontend NUNCA acessa o Firestore direto — chama os endpoints /api/data/* que usam este módulo.

import { getAdminDb } from "./db";

// Allowlist de coleções permitidas. Qualquer coleção fora desta lista é rejeitada,
// para o endpoint genérico não virar um acesso arbitrário ao banco.
export const ALLOWED_COLLECTIONS = new Set<string>([
  // Núcleo
  "users", "clients", "projects", "transactions", "documents", "contracts",
  // Sistema/config
  "system_status", "settings",
  // Físico / obra
  "daily_logs", "timeline_phases", "punch_lists", "weekly_logs", "regulatory_steps", "materials",
  // Escritório
  "office_transactions", "office_leads",
  // Mão de obra
  "labor_contracts", "labor_payments",
  // Marketing
  "marketing_outbound", "marketing_posts", "marketing_press", "marketing_settings",
  // Cotações
  "unified_suppliers", "unified_materials", "quotation_maps",
]);

// Coleções que só o admin/marketing podem ler/escrever (não são de cliente).
// A coleção 'users' contém credenciais — nunca é exposta por este serviço (ver getCollection).
export const ADMIN_ONLY_COLLECTIONS = new Set<string>([
  "office_transactions", "office_leads", "labor_contracts", "labor_payments",
  "marketing_outbound", "marketing_posts", "marketing_press", "marketing_settings",
  "unified_suppliers", "unified_materials", "settings",
  // Contratos são gerados e geridos apenas pelo admin por enquanto (sem visão do cliente ainda).
  "contracts",
]);

export function assertAllowed(collection: string): void {
  if (!ALLOWED_COLLECTIONS.has(collection)) {
    throw new Error(`Coleção não permitida: ${collection}`);
  }
}

function sanitize(data: any): any {
  // Remove undefined (Firestore rejeita) preservando null.
  return JSON.parse(JSON.stringify(data, (_k, v) => (v === undefined ? null : v)));
}

/** Nunca devolve passwordHash de usuários para o frontend. */
function stripSecrets(collection: string, doc: any): any {
  if (collection === "users" && doc && typeof doc === "object") {
    const { passwordHash, ...safe } = doc;
    return safe;
  }
  if (collection === "settings" && doc && typeof doc === "object") {
    // Config do Telegram nunca sai com o token em claro.
    const { botToken, ...safe } = doc;
    return { ...safe, botTokenSet: !!botToken };
  }
  return doc;
}

export async function listCollection(collection: string): Promise<any[]> {
  assertAllowed(collection);
  const db = getAdminDb();
  const snap = await db.collection(collection).get();
  return snap.docs.map((d) => stripSecrets(collection, { id: d.id, ...d.data() }));
}

export interface Requester {
  role: "admin" | "client" | "marketing";
  clientId?: string;
}

// Coleções ligadas a um projeto (têm campo projectId) — usadas para filtrar por cliente.
const PROJECT_SCOPED = new Set<string>([
  "transactions", "documents", "materials", "daily_logs", "timeline_phases",
  "punch_lists", "weekly_logs", "regulatory_steps",
]);

/**
 * Lista uma coleção respeitando o papel do solicitante.
 * - admin/marketing: veem tudo.
 * - client: só enxerga dados do próprio clientId (projetos, e itens dos seus projetos).
 *   Coleções administrativas (financeiro do escritório, leads, marketing, etc.) e 'users'
 *   são negadas para clientes.
 */
export async function listCollectionForUser(collection: string, req: Requester): Promise<any[]> {
  assertAllowed(collection);

  // 'users' nunca é listada por clientes (contém dados de outros usuários).
  if (collection === "users" && req.role === "client") {
    throw new Error("Acesso negado.");
  }
  if (ADMIN_ONLY_COLLECTIONS.has(collection) && req.role === "client") {
    throw new Error("Acesso negado.");
  }

  const all = await listCollection(collection);
  if (req.role !== "client") return all;

  const clientId = req.clientId;
  if (!clientId) return [];

  if (collection === "clients") return all.filter((d) => d.id === clientId);
  if (collection === "projects") return all.filter((d) => d.clientId === clientId);

  if (PROJECT_SCOPED.has(collection)) {
    // Descobre os projetos do cliente e filtra os itens por projectId.
    const projects = await listCollection("projects");
    const myProjectIds = new Set(projects.filter((p) => p.clientId === clientId).map((p) => p.id));
    return all.filter((d) => myProjectIds.has(d.projectId));
  }

  // Coleções neutras (ex.: settings mascarada) — clientes não acessam por padrão.
  return [];
}

/** Verifica se o solicitante pode escrever/excluir nesta coleção. */
export function assertCanWrite(collection: string, req: Requester): void {
  assertAllowed(collection);
  if (req.role === "admin") return;
  if (req.role === "marketing") {
    // Marketing só escreve nas coleções de marketing.
    if (collection.startsWith("marketing_")) return;
    throw new Error("Você não tem permissão para alterar estes dados.");
  }
  // client: sem escrita nas coleções administrativas, users, settings.
  if (collection === "users" || collection === "settings" || ADMIN_ONLY_COLLECTIONS.has(collection)) {
    throw new Error("Você não tem permissão para alterar estes dados.");
  }
  // Demais escritas de cliente (ex.: comprovantes) são permitidas; a associação ao
  // projeto/cliente é garantida pela UI + validação de projectId poderia ser reforçada aqui.
}

export async function getDocById(collection: string, id: string): Promise<any | null> {
  assertAllowed(collection);
  const db = getAdminDb();
  const snap = await db.collection(collection).doc(id).get();
  if (!snap.exists) return null;
  return stripSecrets(collection, { id: snap.id, ...snap.data() });
}

export async function setDocById(collection: string, id: string, data: any): Promise<void> {
  assertAllowed(collection);
  if (!id || typeof id !== "string" || id.length > 200) {
    throw new Error("ID de documento inválido.");
  }
  const db = getAdminDb();
  await db.collection(collection).doc(id).set(sanitize(data), { merge: true });
}

export async function deleteDocById(collection: string, id: string): Promise<void> {
  assertAllowed(collection);
  const db = getAdminDb();
  await db.collection(collection).doc(id).delete();
}

/** Escrita em lote (para seeding e cascatas). */
export async function batchSet(collection: string, docs: Array<{ id: string; data: any }>): Promise<void> {
  assertAllowed(collection);
  const db = getAdminDb();
  const batch = db.batch();
  for (const { id, data } of docs) {
    batch.set(db.collection(collection).doc(id), sanitize(data), { merge: true });
  }
  await batch.commit();
}
