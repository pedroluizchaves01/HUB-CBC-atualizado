// scripts/setup-supabase.ts
// Passo único de configuração do banco Supabase/Postgres:
//   1) testa a conexão,
//   2) cria todas as tabelas (ensureSchema),
//   3) provisiona os usuários iniciais com senha hasheada (a partir das envs de senha).
//
// Uso (Git Bash), tudo numa linha só:
//   DATABASE_URL='postgresql://...' \
//   ADMIN_PASSWORD='...' MARKETING_PASSWORD='...' \
//   CLIENT_ORALMED_PASSWORD='...' CLIENT_ROBERTO_PASSWORD='...' CLIENT_BOSQUE_PASSWORD='...' \
//   npx tsx scripts/setup-supabase.ts
//
// Não imprime a connection string nem senhas.

import { getAdminDb, ensureSchema, isDbConfigured } from "../src/lib/server/db";
import { hashPassword } from "../src/lib/server/authService";

interface SeedUser {
  id: string; username: string; role: "admin" | "client" | "marketing"; name: string; clientId?: string;
  passwordEnv: string;
}

const SEED_USERS: SeedUser[] = [
  { id: "admin-1", username: "CHAVES BRITES CORREA", role: "admin", name: "Chaves Brites Correa", passwordEnv: "ADMIN_PASSWORD" },
  { id: "user-marketing-1", username: "MKTCBC", role: "marketing", name: "Equipe de Marketing", passwordEnv: "MARKETING_PASSWORD" },
  { id: "user-client-1", username: "oralmed", role: "client", name: "Clínica OralMed", clientId: "client-1", passwordEnv: "CLIENT_ORALMED_PASSWORD" },
  { id: "user-client-2", username: "roberto", role: "client", name: "Cliente Exemplo 2", clientId: "client-2", passwordEnv: "CLIENT_ROBERTO_PASSWORD" },
  { id: "user-client-3", username: "bosque", role: "client", name: "Residencial Bosque", clientId: "client-3", passwordEnv: "CLIENT_BOSQUE_PASSWORD" },
];

async function main() {
  console.log("1) Testando conexão com o banco...");
  const ok = await isDbConfigured();
  if (!ok) {
    console.error("   ❌ Não foi possível conectar. Confira a DATABASE_URL (senha, host, porta 6543).");
    process.exit(1);
  }
  console.log("   ✅ Conexão OK.");

  console.log("2) Criando as tabelas (idempotente)...");
  await ensureSchema();
  console.log("   ✅ Tabelas prontas.");

  console.log("3) Provisionando usuários...");
  const db = getAdminDb();
  let created = 0, skipped = 0;
  for (const u of SEED_USERS) {
    const pw = process.env[u.passwordEnv];
    if (!pw || pw.trim().length < 6) {
      console.warn(`   PULADO ${u.username}: defina ${u.passwordEnv} (mínimo 6 caracteres).`);
      skipped++;
      continue;
    }
    const doc: any = { id: u.id, username: u.username, role: u.role, name: u.name, passwordHash: await hashPassword(pw) };
    if (u.clientId) doc.clientId = u.clientId;
    await db.collection("users").doc(u.id).set(doc, { merge: true });
    console.log(`   OK ${u.username} (${u.role}) provisionado.`);
    created++;
  }

  console.log(`\n✅ Concluído: ${created} usuários provisionados, ${skipped} pulados. Banco pronto para uso.`);
  process.exit(0);
}

main().catch((e) => { console.error("❌ Falha na configuração:", e?.message || e); process.exit(1); });
