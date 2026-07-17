// src/lib/firebaseDb.ts
// ATENÇÃO: este módulo NÃO acessa mais o Firestore diretamente.
// Todo o acesso a dados passa pelo "backend guardião" (endpoints /api/data/*), que valida
// a sessão e usa o Admin SDK no servidor. O navegador nunca fala com o Firestore.
// As assinaturas (saveDoc / removeDoc / subscribeCollection) foram preservadas para não
// exigir mudança nos componentes que já as consomem.

import { apiGet, apiSend, ApiError } from "./apiClient";

// Mantido por compatibilidade de tipos com código legado que importava OperationType.
export enum OperationType {
  CREATE = "create", UPDATE = "update", DELETE = "delete",
  LIST = "list", GET = "get", WRITE = "write",
}

/** Salva/atualiza um documento via backend. */
export const saveDoc = async (collectionName: string, id: string, data: any) => {
  try {
    await apiSend(`/api/data/${encodeURIComponent(collectionName)}/${encodeURIComponent(id)}`, "PUT", { data });
  } catch (error) {
    console.error(`Erro ao salvar ${collectionName}/${id}:`, error);
    throw error instanceof Error ? error : new Error(String(error));
  }
};

/** Exclui um documento via backend. */
export const removeDoc = async (collectionName: string, id: string) => {
  try {
    await apiSend(`/api/data/${encodeURIComponent(collectionName)}/${encodeURIComponent(id)}`, "DELETE");
  } catch (error) {
    console.error(`Erro ao excluir ${collectionName}/${id}:`, error);
    throw error instanceof Error ? error : new Error(String(error));
  }
};

const POLL_INTERVAL_MS = 8000;

/**
 * Assina uma coleção. Como o acesso agora é via backend (sem WebSocket), usamos polling leve:
 * busca imediata + atualização periódica. Mantém o cache em localStorage para carregamento
 * instantâneo e resiliência offline, exatamente como antes.
 *
 * Retorna uma função de unsubscribe.
 */
export const subscribeCollection = (
  collectionName: string,
  onUpdate: (data: any[]) => void,
  defaultData: any[],
  localStorageKey?: string
) => {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastSerialized = "";

  // 1. Entrega imediata do cache local (se houver) para não piscar a tela.
  if (localStorageKey) {
    try {
      const saved = localStorage.getItem(localStorageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) { lastSerialized = saved; onUpdate(parsed); }
      }
    } catch { /* cache inválido, ignora */ }
  }

  const poll = async () => {
    if (stopped) return;
    try {
      const resp = await apiGet(`/api/data/${encodeURIComponent(collectionName)}`);
      const items: any[] = Array.isArray(resp?.items) ? resp.items : [];
      const serialized = JSON.stringify(items);
      if (serialized !== lastSerialized) {
        lastSerialized = serialized;
        onUpdate(items);
        if (localStorageKey) {
          try { localStorage.setItem(localStorageKey, serialized); } catch { /* quota */ }
        }
      }
    } catch (err) {
      // 401 => sessão expirou: não insiste em loop; deixa o app redirecionar ao login.
      if (err instanceof ApiError && err.status === 401) {
        stopped = true;
        return;
      }
      // Outros erros: mantém o último estado conhecido (cache/local) e tenta de novo depois.
      if (!lastSerialized && localStorageKey) {
        try {
          const saved = localStorage.getItem(localStorageKey);
          if (saved) { const p = JSON.parse(saved); if (Array.isArray(p)) onUpdate(p); }
        } catch { /* ignore */ }
      }
    } finally {
      if (!stopped) timer = setTimeout(poll, POLL_INTERVAL_MS);
    }
  };

  poll();

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
};
