// src/lib/firebaseDb.ts
// (nome mantido por compatibilidade de imports — NÃO usa Firebase; fala com o backend
// guardião /api/data/*, que persiste em Postgres/Supabase.)
//
// MUDANÇAS IMPORTANTES DESTA VERSÃO:
// 1. POLLING AGRUPADO: em vez de 1 requisição por coleção a cada 8s (que estourava o
//    rate limit do servidor quando havia várias abas/pessoas no mesmo IP), TODAS as
//    coleções assinadas são buscadas em UMA única chamada GET /api/data-bundle.
// 2. GRAVAÇÃO CONFIÁVEL: saveDoc/removeDoc agora fazem novas tentativas automáticas
//    (backoff exponencial) em caso de erro transitório (429/5xx/rede). Se mesmo assim
//    falhar, o erro é PROPAGADO e um aviso visível é disparado — nunca mais falha muda.
// 3. INDICADOR DE SAÚDE: quando o polling falha repetidamente, um evento global
//    'cbc:sync-status' é emitido para a UI poder avisar "dados desatualizados".

import { apiGet, apiSend, ApiError } from "./apiClient";

export enum OperationType {
  CREATE = "create", UPDATE = "update", DELETE = "delete",
  LIST = "list", GET = "get", WRITE = "write",
}

const POLL_INTERVAL_MS = 8000;
const WRITE_RETRIES = 4;            // tentativas totais de gravação
const RETRY_BASE_DELAY_MS = 1000;   // 1s, 2s, 4s...

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function isTransient(err: unknown): boolean {
  if (err instanceof ApiError) {
    return err.status === 429 || err.status >= 500;
  }
  // Erros de rede (fetch rejeitado) não são ApiError
  return true;
}

function emitSyncStatus(ok: boolean, detail?: string) {
  try {
    window.dispatchEvent(new CustomEvent("cbc:sync-status", { detail: { ok, detail } }));
  } catch { /* ambiente sem window/CustomEvent */ }
}

function notifySaveFailure(collection: string, err: unknown) {
  const msg = err instanceof ApiError ? err.message : "Falha de conexão com o servidor.";
  try {
    window.dispatchEvent(new CustomEvent("cbc:save-error", { detail: { collection, message: msg } }));
  } catch { /* ignore */ }
  // Aviso direto e inequívoco ao usuário — melhor um alert do que perda silenciosa de dados.
  try {
    alert(
      `⚠️ NÃO FOI POSSÍVEL SALVAR suas alterações (${collection}).\n\n` +
      `Motivo: ${msg}\n\n` +
      `Suas alterações continuam apenas NESTA TELA. Verifique a conexão e tente salvar de novo ` +
      `(refaça a última ação) antes de fechar ou atualizar a página.`
    );
  } catch { /* ignore */ }
}

async function sendWithRetry(path: string, method: string, body?: any): Promise<any> {
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < WRITE_RETRIES; attempt++) {
    try {
      return await apiSend(path, method, body);
    } catch (err) {
      lastErr = err;
      // 401/403/400 não adianta repetir; só transientes.
      if (!isTransient(err)) throw err;
      if (attempt < WRITE_RETRIES - 1) {
        await sleep(RETRY_BASE_DELAY_MS * Math.pow(2, attempt));
      }
    }
  }
  throw lastErr;
}

// ---------------------------------------------------------------------------
// Escrita
// ---------------------------------------------------------------------------

/** Salva/atualiza um documento via backend, com retry. Propaga o erro se esgotar. */
export const saveDoc = async (collectionName: string, id: string, data: any) => {
  try {
    await sendWithRetry(
      `/api/data/${encodeURIComponent(collectionName)}/${encodeURIComponent(id)}`,
      "PUT",
      { data }
    );
    // Gravação ok: força um refresh rápido para os outros assinantes desta aba.
    schedulePollSoon();
  } catch (error) {
    console.error(`Erro ao salvar ${collectionName}/${id}:`, error);
    notifySaveFailure(collectionName, error);
    throw error instanceof Error ? error : new Error(String(error));
  }
};

/** Exclui um documento via backend, com retry. Propaga o erro se esgotar. */
export const removeDoc = async (collectionName: string, id: string) => {
  try {
    await sendWithRetry(
      `/api/data/${encodeURIComponent(collectionName)}/${encodeURIComponent(id)}`,
      "DELETE"
    );
    schedulePollSoon();
  } catch (error) {
    console.error(`Erro ao excluir ${collectionName}/${id}:`, error);
    notifySaveFailure(collectionName, error);
    throw error instanceof Error ? error : new Error(String(error));
  }
};

// ---------------------------------------------------------------------------
// Leitura: gerenciador central de polling (uma requisição para todas as coleções)
// ---------------------------------------------------------------------------

interface Subscriber {
  id: number;
  onUpdate: (data: any[]) => void;
}

interface CollectionEntry {
  subscribers: Subscriber[];
  lastSerialized: string;
  localStorageKey?: string;
}

const registry = new Map<string, CollectionEntry>();
let subIdCounter = 0;
let pollTimer: ReturnType<typeof setTimeout> | null = null;
let pollInFlight = false;
let consecutiveFailures = 0;
let stoppedByAuth = false;

function schedulePoll(delay: number) {
  if (pollTimer) clearTimeout(pollTimer);
  pollTimer = setTimeout(runPoll, delay);
}

/** Agenda um poll quase imediato (usado após gravações bem-sucedidas). */
function schedulePollSoon() {
  if (stoppedByAuth || registry.size === 0) return;
  schedulePoll(400);
}

async function runPoll() {
  if (pollInFlight || stoppedByAuth || registry.size === 0) return;
  pollInFlight = true;
  const names = Array.from(registry.keys());
  try {
    const resp = await apiGet(`/api/data-bundle?names=${encodeURIComponent(names.join(","))}`);
    const collections: Record<string, any[]> = resp?.collections || {};
    for (const name of names) {
      const entry = registry.get(name);
      if (!entry) continue;
      const items = collections[name];
      if (!Array.isArray(items)) continue; // coleção negada/com erro: mantém estado atual
      const serialized = JSON.stringify(items);
      if (serialized !== entry.lastSerialized) {
        entry.lastSerialized = serialized;
        for (const s of entry.subscribers) {
          try { s.onUpdate(items); } catch (e) { console.error(e); }
        }
        if (entry.localStorageKey) {
          try { localStorage.setItem(entry.localStorageKey, serialized); } catch { /* quota */ }
        }
      }
    }
    consecutiveFailures = 0;
    emitSyncStatus(true);
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      // Sessão expirada: para o polling; o app redireciona ao login.
      stoppedByAuth = true;
      pollInFlight = false;
      return;
    }
    consecutiveFailures++;
    console.warn(`Polling de dados falhou (${consecutiveFailures}x):`, err);
    if (consecutiveFailures >= 2) {
      emitSyncStatus(false, err instanceof ApiError ? err.message : "Sem conexão com o servidor.");
    }
  } finally {
    pollInFlight = false;
    if (!stoppedByAuth && registry.size > 0) {
      // Backoff leve quando o servidor está reclamando (ex.: 429), até 30s.
      const delay = consecutiveFailures > 0
        ? Math.min(POLL_INTERVAL_MS * (consecutiveFailures + 1), 30_000)
        : POLL_INTERVAL_MS;
      schedulePoll(delay);
    }
  }
}

/** Permite reativar o polling após um novo login (ex.: chamado pelo useStore). */
export function restartDataSync() {
  stoppedByAuth = false;
  consecutiveFailures = 0;
  if (registry.size > 0) schedulePoll(0);
}

/**
 * Assina uma coleção. Entrega imediatamente o cache local (se houver) e passa a
 * receber atualizações do polling agrupado. Retorna função de unsubscribe.
 * (Assinatura pública idêntica à versão anterior — nenhum componente precisa mudar.)
 */
export const subscribeCollection = (
  collectionName: string,
  onUpdate: (data: any[]) => void,
  _defaultData: any[],
  localStorageKey?: string
) => {
  const sub: Subscriber = { id: ++subIdCounter, onUpdate };

  let entry = registry.get(collectionName);
  if (!entry) {
    entry = { subscribers: [], lastSerialized: "", localStorageKey };
    registry.set(collectionName, entry);
  }
  if (localStorageKey && !entry.localStorageKey) entry.localStorageKey = localStorageKey;
  entry.subscribers.push(sub);

  // 1. Entrega imediata: último dado conhecido nesta sessão OU cache do localStorage.
  if (entry.lastSerialized) {
    try { onUpdate(JSON.parse(entry.lastSerialized)); } catch { /* ignore */ }
  } else if (entry.localStorageKey) {
    try {
      const saved = localStorage.getItem(entry.localStorageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) onUpdate(parsed);
      }
    } catch { /* cache inválido, ignora */ }
  }

  // 2. Garante que o loop de polling está rodando (poll imediato para nova coleção).
  schedulePoll(0);

  return () => {
    const e = registry.get(collectionName);
    if (!e) return;
    e.subscribers = e.subscribers.filter((s) => s.id !== sub.id);
    if (e.subscribers.length === 0) registry.delete(collectionName);
    if (registry.size === 0 && pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
  };
};
