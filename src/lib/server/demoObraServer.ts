// src/lib/server/demoObraServer.ts
// Carrega e remove a OBRA DEMONSTRATIVA (cliente + centro de custo fictícios) no banco.
//
// Segurança dos dados reais:
//  - todo registro fictício tem id começando com "demo-" (e projectId = demo-obra-albuquerque);
//  - a remoção apaga SOMENTE esses registros;
//  - o carregamento não toca em fornecedores unificados nem em preços médios (unified_*),
//    para não contaminar o histórico real de cotações.

import crypto from "crypto";
import * as dataService from "./dataService";
import { getAdminDb } from "./db";
import { buildDemoObra } from "../demo/buildDemoObra";
import { DEMO_IDS, DEMO_PREFIX } from "../demo/catalog";

// Coleções gravadas pela obra demonstrativa.
const DEMO_COLLECTIONS = [
  "clients", "projects", "timeline_phases", "weekly_logs", "daily_logs", "unproductive_days",
  "materials", "quotation_maps", "transactions", "labor_contracts", "labor_payments",
  "measurements", "documents", "regulatory_steps", "punch_lists",
];

// Coleções vasculhadas na remoção (inclui o que o usuário possa ter criado dentro da obra demo).
const PURGE_COLLECTIONS = [...DEMO_COLLECTIONS, "users", "contracts"];

function isDemoDoc(d: any): boolean {
  return (
    (typeof d?.id === "string" && d.id.startsWith(DEMO_PREFIX)) ||
    d?.projectId === DEMO_IDS.project ||
    d?.clientId === DEMO_IDS.client
  );
}

export async function demoStatus(): Promise<{ loaded: boolean; counts: Record<string, number>; username: string; clientName?: string }> {
  const projects = await dataService.listCollection("projects");
  const demoProject = projects.find((p: any) => p.id === DEMO_IDS.project);
  if (!demoProject) return { loaded: false, counts: {}, username: DEMO_IDS.username };

  const counts: Record<string, number> = {};
  for (const col of DEMO_COLLECTIONS) {
    const docs = await dataService.listCollection(col);
    counts[col] = docs.filter(isDemoDoc).length;
  }
  const clients = await dataService.listCollection("clients");
  const c = clients.find((x: any) => x.id === DEMO_IDS.client);
  return { loaded: true, counts, username: DEMO_IDS.username, clientName: c?.name };
}

/** Remove toda a obra demonstrativa. Devolve quantos registros foram apagados. */
export async function removeDemo(): Promise<{ removed: number }> {
  let removed = 0;
  for (const col of PURGE_COLLECTIONS) {
    const docs = await dataService.listCollection(col);
    for (const d of docs) {
      if (!isDemoDoc(d)) continue;
      await dataService.deleteDocById(col, d.id);
      removed += 1;
    }
  }
  return { removed };
}

/**
 * Carrega (ou recarrega) a obra demonstrativa. Se já existir, apaga e recria os registros
 * fictícios — mas preserva a senha do usuário demo; a senha só é devolvida na primeira criação.
 */
export async function loadDemo(): Promise<{
  counts: Record<string, number>;
  credentials: { username: string; password: string } | null;
  summary: { totalSpent: number; budget: number };
}> {
  const data = buildDemoObra();

  // Preserva o usuário (e a senha) se ele já existir; remove o resto da versão anterior.
  // (leitura direta: getDocById esconde o passwordHash dos usuários por segurança)
  let previousHash = "";
  try {
    const snap = await getAdminDb().collection("users").doc(DEMO_IDS.user).get();
    if (snap.exists) previousHash = String((snap.data() || {}).passwordHash || "");
  } catch { /* sem usuário anterior */ }
  await removeDemo();

  for (const [collection, docs] of Object.entries(data.collections)) {
    const CHUNK = 250;
    for (let i = 0; i < docs.length; i += CHUNK) {
      await dataService.batchSet(
        collection,
        docs.slice(i, i + CHUNK).map((d: any) => ({ id: d.id, data: d })),
      );
    }
  }

  // Usuário cliente (para mostrar a visão do cliente). Senha aleatória, hasheada no servidor.
  const { hashPassword } = await import("./authService");
  let credentials: { username: string; password: string } | null = null;
  if (previousHash) {
    // Recria o registro mantendo o hash anterior (a senha já informada continua valendo).
    await dataService.setDocById("users", DEMO_IDS.user, {
      id: DEMO_IDS.user, username: DEMO_IDS.username, role: "client", name: data.client.name,
      clientId: DEMO_IDS.client, passwordHash: previousHash,
    });
  } else {
    const password = crypto.randomBytes(9).toString("base64url");
    await dataService.setDocById("users", DEMO_IDS.user, {
      id: DEMO_IDS.user, username: DEMO_IDS.username, role: "client", name: data.client.name,
      clientId: DEMO_IDS.client, passwordHash: await hashPassword(password),
    });
    credentials = { username: DEMO_IDS.username, password };
  }

  return {
    counts: data.summary.counts,
    credentials,
    summary: { totalSpent: data.summary.totalSpent, budget: data.summary.budget },
  };
}
