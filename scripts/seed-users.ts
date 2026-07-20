// scripts/seed-users.ts
// Provisiona os usuários iniciais no banco (Postgres/Supabase) com senha HASHEADA (bcrypt).
// As senhas vêm de variáveis de ambiente — nunca do código versionado.
//
// Uso:
//   DATABASE_URL='postgresql://...' \
//   ADMIN_PEDRO_PASSWORD='...' ADMIN_VINICIUS_PASSWORD='...' ADMIN_LEONARDO_PASSWORD='...' \
//   MARKETING_PASSWORD='...' CLIENT_ORALMED_PASSWORD='...' \
//   npx tsx scripts/seed-users.ts
//
// Se uma senha não for informada, o usuário correspondente é PULADO (não recebe senha fraca).
//
// NOTA — reconfiguração de acessos admin (3 sócios, logins distintos):
// O antigo login único "CHAVES BRITES CORREA" (id admin-1) foi reaproveitado para o sócio
// Pedro Chaves (mesmo id, novo username/nome). Os outros dois sócios ganham contas novas.
// Rodar este script novamente é seguro (idempotente, faz merge por id).

import { getAdminDb } from "../src/lib/server/db";
import { hashPassword } from "../src/lib/server/authService";

interface SeedUser {
  id: string; username: string; role: "admin" | "client" | "marketing"; name: string; clientId?: string;
  passwordEnv: string;
}

const SEED_USERS: SeedUser[] = [
  // Sócios — admin, logins distintos a partir de agora.
  { id: "admin-1", username: "Pedro Chaves", role: "admin", name: "Pedro Chaves", passwordEnv: "ADMIN_PEDRO_PASSWORD" },
  { id: "admin-2", username: "Vinicius Brites", role: "admin", name: "Vinicius Brites", passwordEnv: "ADMIN_VINICIUS_PASSWORD" },
  { id: "admin-3", username: "Leonardo Correa", role: "admin", name: "Leonardo Correa", passwordEnv: "ADMIN_LEONARDO_PASSWORD" },

  { id: "user-marketing-1", username: "MKTCBC", role: "marketing", name: "Equipe de Marketing", passwordEnv: "MARKETING_PASSWORD" },
  { id: "user-client-1", username: "oralmed", role: "client", name: "Clínica OralMed", clientId: "client-1", passwordEnv: "CLIENT_ORALMED_PASSWORD" },
  { id: "user-client-2", username: "roberto", role: "client", name: "Cliente Exemplo 2", clientId: "client-2", passwordEnv: "CLIENT_ROBERTO_PASSWORD" },
  { id: "user-client-3", username: "bosque", role: "client", name: "Residencial Bosque", clientId: "client-3", passwordEnv: "CLIENT_BOSQUE_PASSWORD" },
];

async function main() {
  const db = getAdminDb();
  let created = 0, skipped = 0;

  for (const u of SEED_USERS) {
    const pw = process.env[u.passwordEnv];
    if (!pw || pw.trim().length < 6) {
      console.warn(`PULADO ${u.username}: defina ${u.passwordEnv} (mínimo 6 caracteres) para provisionar.`);
      skipped++;
      continue;
    }
    const doc: any = { id: u.id, username: u.username, role: u.role, name: u.name, passwordHash: await hashPassword(pw) };
    if (u.clientId) doc.clientId = u.clientId;
    await db.collection("users").doc(u.id).set(doc, { merge: true });
    console.log(`OK ${u.username} (${u.role}) provisionado com senha hasheada.`);
    created++;
  }

  console.log(`\nConcluído: ${created} provisionados, ${skipped} pulados.`);
  process.exit(0);
}

main().catch((e) => { console.error("Falha no seed de usuários:", e); process.exit(1); });
