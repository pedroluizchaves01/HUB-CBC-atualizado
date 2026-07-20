// src/lib/apiClient.ts
// Cliente HTTP do frontend para o "backend guardião". Guarda o token de sessão e o envia
// em toda requisição. O token também vai como cookie httpOnly (definido pelo backend),
// mas mantemos uma cópia em memória + storage do navegador para reidratar a sessão do app.
//
// Por padrão o token vive em sessionStorage (some ao fechar a aba/navegador). Quando o
// usuário marca "manter conectado" no login, guardamos em localStorage também, para que a
// sessão sobreviva a fechar e reabrir o navegador (até a expiração do token no servidor).

const SESSION_KEY = "cbc_session_token";
const REMEMBER_FLAG_KEY = "cbc_session_remember";

let sessionToken: string | null = null;

export function setSessionToken(token: string | null, remember: boolean = false) {
  sessionToken = token;
  try {
    if (token) {
      if (remember) {
        localStorage.setItem(SESSION_KEY, token);
        localStorage.setItem(REMEMBER_FLAG_KEY, "1");
        sessionStorage.removeItem(SESSION_KEY);
      } else {
        sessionStorage.setItem(SESSION_KEY, token);
        localStorage.removeItem(SESSION_KEY);
        localStorage.removeItem(REMEMBER_FLAG_KEY);
      }
    } else {
      sessionStorage.removeItem(SESSION_KEY);
      localStorage.removeItem(SESSION_KEY);
      localStorage.removeItem(REMEMBER_FLAG_KEY);
    }
  } catch { /* storage indisponível */ }
}

export function getSessionToken(): string | null {
  if (sessionToken) return sessionToken;
  try {
    sessionToken = sessionStorage.getItem(SESSION_KEY) || localStorage.getItem(SESSION_KEY);
  } catch { /* ignore */ }
  return sessionToken;
}

export function wasRememberedSession(): boolean {
  try { return localStorage.getItem(REMEMBER_FLAG_KEY) === "1"; } catch { return false; }
}

function authHeaders(extra?: Record<string, string>): Record<string, string> {
  const h: Record<string, string> = { ...(extra || {}) };
  const t = getSessionToken();
  if (t) h["Authorization"] = `Bearer ${t}`;
  return h;
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}

async function handle(res: Response): Promise<any> {
  const text = await res.text();
  let data: any = null;
  if (text) { try { data = JSON.parse(text); } catch { data = { error: text }; } }
  if (!res.ok) {
    throw new ApiError((data && data.error) || `Erro ${res.status}`, res.status);
  }
  return data;
}

export async function apiGet(path: string): Promise<any> {
  const res = await fetch(path, { headers: authHeaders(), credentials: "same-origin" });
  return handle(res);
}

export async function apiSend(path: string, method: string, body?: any): Promise<any> {
  const res = await fetch(path, {
    method,
    headers: authHeaders({ "Content-Type": "application/json" }),
    credentials: "same-origin",
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return handle(res);
}
