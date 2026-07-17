// src/lib/apiClient.ts
// Cliente HTTP do frontend para o "backend guardião". Guarda o token de sessão e o envia
// em toda requisição. O token também vai como cookie httpOnly (definido pelo backend),
// mas mantemos uma cópia em memória + sessionStorage para reidratar a sessão do app.

const SESSION_KEY = "cbc_session_token";

let sessionToken: string | null = null;

export function setSessionToken(token: string | null) {
  sessionToken = token;
  try {
    if (token) sessionStorage.setItem(SESSION_KEY, token);
    else sessionStorage.removeItem(SESSION_KEY);
  } catch { /* sessionStorage indisponível */ }
}

export function getSessionToken(): string | null {
  if (sessionToken) return sessionToken;
  try { sessionToken = sessionStorage.getItem(SESSION_KEY); } catch { /* ignore */ }
  return sessionToken;
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
