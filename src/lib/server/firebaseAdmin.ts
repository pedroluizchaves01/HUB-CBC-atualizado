// src/lib/server/firebaseAdmin.ts
// Inicialização do Firebase Admin SDK — SOMENTE backend. Nunca importar em componentes React.
// O Admin SDK ignora as regras de segurança do Firestore (acesso privilegiado), por isso
// TODO acesso a dados do app passa a ser mediado pelo backend ("backend guardião"):
// o navegador nunca fala direto com o Firestore.
//
// Credencial (em ordem de preferência):
//   1. FIREBASE_SERVICE_ACCOUNT  — JSON da service account (string) na env var
//   2. GOOGLE_APPLICATION_CREDENTIALS — caminho para o arquivo JSON (padrão do Google SDK)
//   3. applicationDefault() — quando roda em infra Google (Cloud Run etc.)
// A chave privada é um segredo de servidor e JAMAIS vai para o bundle do frontend.

import { initializeApp, cert, applicationDefault, getApps, App } from "firebase-admin/app";
import { getFirestore, Firestore } from "firebase-admin/firestore";
import appletConfig from "../../../firebase-applet-config.json";

let cachedDb: Firestore | null = null;
let initError: string | null = null;

function hasCredential(): boolean {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  return !!(raw && raw.trim().startsWith("{")) ||
    !!process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    // Em infra Google (Cloud Run/GCE) a credencial vem do metadata server.
    !!process.env.K_SERVICE || !!process.env.FUNCTION_TARGET || !!process.env.GAE_ENV;
}

function buildApp(): App {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  const projectId = appletConfig.projectId;

  if (raw && raw.trim().startsWith("{")) {
    const svc = JSON.parse(raw);
    return initializeApp({ credential: cert(svc), projectId: svc.project_id || projectId });
  }
  // Caminho para GOOGLE_APPLICATION_CREDENTIALS ou infra Google.
  return initializeApp({ credential: applicationDefault(), projectId });
}

/**
 * Retorna o Firestore admin, ou lança um erro claro se a credencial não estiver configurada.
 * A base de dados usa o databaseId customizado do projeto (mesmo do frontend).
 */
const NO_CRED_MSG =
  "Firebase Admin não configurado no servidor. Defina FIREBASE_SERVICE_ACCOUNT (JSON da " +
  "service account) ou GOOGLE_APPLICATION_CREDENTIALS. Veja DEPLOY.md.";

export function getAdminDb(): Firestore {
  if (cachedDb) return cachedDb;
  if (initError) throw new Error(initError);
  // Sem credencial explícita, NÃO tentamos inicializar: o applicationDefault() rejeitaria
  // de forma assíncrona ao primeiro uso e poderia derrubar o processo. Falhamos cedo e claro.
  if (!hasCredential()) {
    initError = NO_CRED_MSG;
    throw new Error(initError);
  }
  try {
    const app = getApps().length ? getApps()[0] : buildApp();
    const db = getFirestore(app, appletConfig.firestoreDatabaseId);
    // O Admin SDK não permite reconfigurar settings após o primeiro uso; ignore se já setado.
    try { db.settings({ ignoreUndefinedProperties: true }); } catch { /* já inicializado */ }
    cachedDb = db;
    return db;
  } catch (e: any) {
    initError =
      "Firebase Admin não configurado no servidor. Defina a variável de ambiente " +
      "FIREBASE_SERVICE_ACCOUNT (JSON da service account) ou GOOGLE_APPLICATION_CREDENTIALS. " +
      "Detalhe: " + (e?.message || e);
    throw new Error(initError);
  }
}

/** Indica se o Admin SDK está utilizável (para health-check e mensagens de boot). */
export function isAdminConfigured(): boolean {
  try { getAdminDb(); return true; } catch { return false; }
}
