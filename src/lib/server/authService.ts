// src/lib/server/authService.ts
// Autenticação server-side do "backend guardião".
// - Senhas guardadas com hash bcrypt (nunca em texto puro).
// - Sessão via token assinado com HMAC-SHA256 (sem dependência externa de JWT).
// - Login valida contra a coleção 'users' no Firestore usando o Admin SDK.
// - Migração transparente: usuários legados com senha em texto puro são re-hasheados no
//   primeiro login bem-sucedido.

import bcrypt from "bcryptjs";
import crypto from "crypto";
import { getAdminDb } from "./db";

const BCRYPT_ROUNDS = 10;
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 horas

// Segredo de assinatura da sessão. DEVE vir de env em produção.
function getSessionSecret(): string {
  const s = process.env.SESSION_SECRET;
  if (s && s.length >= 16) return s;
  if (process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET não configurado no servidor (defina uma string aleatória forte).");
  }
  // Dev: segredo fraco fixo apenas para desenvolvimento local.
  return "dev-only-insecure-session-secret-change-me";
}

export interface SessionUser {
  id: string;
  username: string;
  role: "admin" | "client" | "marketing";
  name: string;
  clientId?: string;
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlDecode(input: string): Buffer {
  return Buffer.from(input.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

/** Cria um token de sessão assinado contendo o usuário e a expiração. */
export function createSessionToken(user: SessionUser): string {
  const payload = { u: user, exp: Date.now() + SESSION_TTL_MS };
  const body = b64url(JSON.stringify(payload));
  const sig = b64url(crypto.createHmac("sha256", getSessionSecret()).update(body).digest());
  return `${body}.${sig}`;
}

/** Valida o token; retorna o usuário da sessão ou null se inválido/expirado. */
export function verifySessionToken(token: string | undefined | null): SessionUser | null {
  if (!token || typeof token !== "string" || !token.includes(".")) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = b64url(crypto.createHmac("sha256", getSessionSecret()).update(body).digest());
  // Comparação em tempo constante
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(b64urlDecode(body).toString("utf8"));
    if (!payload || typeof payload.exp !== "number" || payload.exp < Date.now()) return null;
    return payload.u as SessionUser;
  } catch {
    return null;
  }
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

function looksHashed(value: string): boolean {
  // Hashes bcrypt começam com $2a$/$2b$/$2y$
  return typeof value === "string" && /^\$2[aby]\$/.test(value);
}

/**
 * Autentica username+senha contra a coleção 'users'.
 * Retorna o SessionUser em caso de sucesso, ou null se as credenciais forem inválidas.
 * Re-hasheia senhas legadas em texto puro no primeiro login válido.
 */
export async function authenticate(username: string, password: string): Promise<SessionUser | null> {
  if (!username || !password) return null;
  const db = getAdminDb();
  const clean = username.trim().toLowerCase();

  const snap = await db.collection("users").get();
  let matchDoc: (typeof snap.docs)[number] | null = null;
  for (const d of snap.docs) {
    const u = d.data();
    if ((u.username || "").trim().toLowerCase() === clean) { matchDoc = d; break; }
  }
  if (!matchDoc) return null;

  const data = matchDoc.data();
  const stored = data.passwordHash || "";
  let ok = false;

  if (looksHashed(stored)) {
    ok = await bcrypt.compare(password, stored);
  } else {
    // Usuário legado: senha em texto puro. Compara literal e migra para hash se bater.
    ok = stored === password;
    if (ok) {
      try {
        const newHash = await hashPassword(password);
        await matchDoc.ref.set({ passwordHash: newHash }, { merge: true });
      } catch { /* migração best-effort; não bloqueia o login */ }
    }
  }
  if (!ok) return null;

  const user: SessionUser = {
    id: matchDoc.id,
    username: data.username,
    role: data.role,
    name: data.name,
  };
  if (data.clientId) user.clientId = data.clientId;
  return user;
}
