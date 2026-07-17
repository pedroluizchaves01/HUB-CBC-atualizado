// src/lib/server/firebaseAdmin.ts
// OBSOLETO — mantido apenas como ponte de compatibilidade.
//
// O banco de dados do "backend guardião" deixou de ser o Firestore e passou a ser o
// Postgres (Supabase). Toda a lógica vive agora em ./db.ts. Este arquivo reexporta as
// funções esperadas por eventuais imports antigos, para não quebrar nada.
// Pode ser removido quando não houver mais nenhum import apontando para cá.

export { getAdminDb, isDbConfigured, ensureSchema } from "./db";

/** Compat: versão booleana síncrona não é mais possível (o Postgres é assíncrono).
 *  Use isDbConfigured() (assíncrona) de ./db. Mantido para não quebrar imports. */
export async function isAdminConfigured(): Promise<boolean> {
  const { isDbConfigured } = await import("./db");
  return isDbConfigured();
}
