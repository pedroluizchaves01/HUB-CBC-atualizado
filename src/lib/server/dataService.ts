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
  // Medições (boletins de medição por período)
  "measurements",
  // Ambiente de Projetos (arquitetura/engenharia) — independente da obra
  "arch_projects",
  // Marketing
  "marketing_outbound", "marketing_posts", "marketing_press", "marketing_settings",
  // Cotações
  "unified_suppliers", "unified_materials", "quotation_maps",
  // Demandas (CRM interno / kanban)
  "demands", "demand_templates", "demand_settings",
  // Notificações internas
  "notifications",
  // Agenda (compromissos + modelos de lembrete reutilizáveis)
  "appointments", "reminder_templates",
]);

// Coleções que só o admin/marketing podem ler/escrever (não são de cliente).
// A coleção 'users' contém credenciais — nunca é exposta por este serviço (ver getCollection).
export const ADMIN_ONLY_COLLECTIONS = new Set<string>([
  "office_transactions", "office_leads", "labor_contracts", "labor_payments",
  "marketing_outbound", "marketing_posts", "marketing_press", "marketing_settings",
  "unified_suppliers", "unified_materials", "settings",
  // Contratos são gerados e geridos apenas pelo admin por enquanto (sem visão do cliente ainda).
  "contracts",
  // Demandas: uso interno da equipe, sem visão do cliente.
  "demands", "demand_templates", "demand_settings",
  // Notificações: cada admin só acessa as suas (filtragem extra em listCollectionForUser).
  "notifications",
  // Agenda: uso interno da equipe. Cliente não enxerga os compromissos do escritório.
  "appointments", "reminder_templates",
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
    // Credenciais nunca saem em claro por este endpoint genérico. O doc settings/whatsapp
    // é lido pela UI através de /api/whatsapp/config, que devolve versão mascarada.
    const {
      botToken,
      evolutionApiKey, cloudAccessToken, twilioAuthToken,
      ...safe
    } = doc;
    return {
      ...safe,
      botTokenSet: !!botToken,
      evolutionApiKeySet: !!evolutionApiKey,
      cloudAccessTokenSet: !!cloudAccessToken,
      twilioAuthTokenSet: !!twilioAuthToken,
    };
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
  userId?: string;
}

// Coleções ligadas a um projeto (têm campo projectId) — usadas para filtrar por cliente.
const PROJECT_SCOPED = new Set<string>([
  "transactions", "documents", "materials", "daily_logs", "timeline_phases",
  "punch_lists", "weekly_logs", "regulatory_steps", "measurements",
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

  // 'notifications' é sempre filtrada pelo destinatário, mesmo para admin — cada um só
  // enxerga as próprias notificações, nunca as dos outros dois sócios.
  if (collection === "notifications") {
    if (!req.userId) return [];
    return all.filter((n: any) => n.recipientUserId === req.userId);
  }

  if (req.role !== "client") return all;

  const clientId = req.clientId;
  if (!clientId) return [];

  if (collection === "clients") return all.filter((d) => d.id === clientId);
  if (collection === "projects") return all.filter((d) => d.clientId === clientId);
  // Projetos de arquitetura: ligados ao cliente diretamente por clientId (não por projectId de obra).
  if (collection === "arch_projects") return all.filter((d) => d.clientId === clientId);

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
  // Demais escritas de cliente (ex.: comprovantes) são permitidas; a checagem de POSSE
  // do documento específico é feita por assertCanWriteDoc (abaixo).
}

/**
 * Verifica se o solicitante pode escrever/excluir ESTE documento específico.
 * Corrige o IDOR de escrita/exclusão: além da regra de coleção/papel, para 'client'
 * confirma que o registro pertence a um projeto do próprio cliente (ou ao próprio
 * cliente, em 'clients'/'projects'). Admin e marketing seguem só a regra de coleção.
 */
export async function assertCanWriteDoc(
  collection: string,
  id: string,
  req: Requester,
  incomingData?: any,
): Promise<void> {
  // 1) Regra de coleção/papel (lança se a coleção for proibida ao papel).
  assertCanWrite(collection, req);

  // 2) Admin e marketing (nas coleções deles) não precisam de checagem de posse.
  if (req.role !== "client") return;

  const clientId = req.clientId;
  if (!clientId) throw new Error("Você não tem permissão para alterar estes dados.");

  // 3) Coleções ligadas a projeto: o doc existente E o novo projectId devem ser do cliente.
  if (PROJECT_SCOPED.has(collection)) {
    const projects = await listCollection("projects");
    const myProjectIds = new Set(
      projects.filter((p) => p.clientId === clientId).map((p) => p.id),
    );
    const existing = await getDocById(collection, id).catch(() => null);
    if (existing && !myProjectIds.has(existing.projectId)) {
      throw new Error("Você não tem permissão para alterar estes dados.");
    }
    // Impede "mover" o registro para um projeto que não é do cliente (ou criar já em outro).
    if (incomingData && incomingData.projectId && !myProjectIds.has(incomingData.projectId)) {
      throw new Error("Projeto inválido para este cliente.");
    }
    return;
  }

  // 4a) 'arch_projects': o cliente dono pode escrever (aprovar/comentar nas fases).
  if (collection === "arch_projects") {
    const existing = await getDocById(collection, id).catch(() => null);
    if (existing && existing.clientId !== clientId) {
      throw new Error("Você não tem permissão para alterar estes dados.");
    }
    if (incomingData && incomingData.clientId && incomingData.clientId !== clientId) {
      throw new Error("Você não tem permissão para alterar estes dados.");
    }
    return;
  }

  // 4) 'projects': só o próprio projeto do cliente.
  if (collection === "projects") {
    const existing = await getDocById(collection, id).catch(() => null);
    if (existing && existing.clientId !== clientId) {
      throw new Error("Você não tem permissão para alterar estes dados.");
    }
    if (incomingData && incomingData.clientId && incomingData.clientId !== clientId) {
      throw new Error("Você não tem permissão para alterar estes dados.");
    }
    return;
  }

  // 5) 'clients': só o próprio registro.
  if (collection === "clients") {
    if (id !== clientId) throw new Error("Você não tem permissão para alterar estes dados.");
    return;
  }

  // 6) Qualquer outra coleção não coberta: negar por padrão para 'client'.
  throw new Error("Você não tem permissão para alterar estes dados.");
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
