// scripts/seed-data.ts
// Semeia as coleções de dados de negócio (não-sensíveis) no Firestore, uma única vez.
// Antes, o seeding acontecia no onSnapshot do frontend; com o backend guardião, ele passa
// a ser um passo explícito e idempotente. Só grava se a coleção estiver vazia.
//
// Uso: FIREBASE_SERVICE_ACCOUNT='{...}' npx tsx scripts/seed-data.ts

import { getAdminDb } from "../src/lib/server/firebaseAdmin";
import {
  INITIAL_CLIENTS, INITIAL_PROJECTS, INITIAL_TRANSACTIONS, INITIAL_DOCUMENTS,
} from "../src/initialData";

const COLLECTIONS: Array<{ name: string; data: any[] }> = [
  { name: "clients", data: INITIAL_CLIENTS as any[] },
  { name: "projects", data: INITIAL_PROJECTS as any[] },
  { name: "transactions", data: INITIAL_TRANSACTIONS as any[] },
  { name: "documents", data: INITIAL_DOCUMENTS as any[] },
];

async function seedCollection(name: string, data: any[]): Promise<string> {
  const db = getAdminDb();
  const col = db.collection(name);
  const existing = await col.limit(1).get();
  if (!existing.empty) return `PULADO ${name}: já contém dados.`;

  const batch = db.batch();
  for (const item of data) {
    const id = item.id || col.doc().id;
    batch.set(col.doc(id), { ...item, id }, { merge: true });
  }
  await batch.commit();
  return `OK ${name}: ${data.length} documentos semeados.`;
}

async function main() {
  for (const { name, data } of COLLECTIONS) {
    console.log(await seedCollection(name, data));
  }
  process.exit(0);
}

main().catch((e) => { console.error("Falha no seed de dados:", e); process.exit(1); });
