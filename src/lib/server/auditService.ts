// src/lib/server/auditService.ts
//
// Trilha de auditoria append-only para operações sobre dados pessoais.
// Atende ao art. 37 da LGPD (registro das operações de tratamento).
//
// A coleção 'audit_logs' NÃO entra na allowlist de /api/data — não é acessível
// nem editável pela API genérica, apenas gravada por este serviço no servidor.

import { getAdminDb } from "./db";

// Coleções cujas alterações contêm ou tocam dados pessoais e devem ser auditadas.
const AUDITED_COLLECTIONS = new Set<string>([
  "users", "clients", "projects", "transactions", "documents",
  "contracts", "office_transactions", "labor_payments", "labor_contracts",
]);

export function shouldAudit(collection: string): boolean {
  return AUDITED_COLLECTIONS.has(collection);
}

export async function writeAuditLog(entry: {
  actorId: string;
  actorRole: string;
  action: "create" | "update" | "delete";
  collection: string;
  docId: string;
  ip?: string;
}): Promise<void> {
  try {
    if (!shouldAudit(entry.collection)) return;
    // ID único do registro de auditoria (timestamp + aleatório) — a camada de dados
    // usa doc(id).set(), não add().
    const logId = `audit-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    await getAdminDb().collection("audit_logs").doc(logId).set({
      ...entry,
      at: new Date().toISOString(),
    }, { merge: true });
  } catch {
    // A auditoria nunca deve quebrar a operação principal.
  }
}
