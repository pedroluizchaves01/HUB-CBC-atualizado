// src/lib/firebaseAuth.ts
// STUB — o Firebase foi totalmente removido do projeto (migração concluída para
// Supabase/Postgres via backend guardião). Este arquivo mantém a MESMA interface
// pública do módulo antigo para que os componentes que ainda importam initAuth /
// googleSignIn / getAccessToken continuem compilando, mas sem nenhuma dependência
// do SDK do Firebase e sem funcionalidade de "Login com Google" (não utilizada).
//
// Se um dia quiserem reativar importação de contatos/Drive do Google, o caminho
// recomendado é OAuth via backend (Google Identity Services), não Firebase.

export type GoogleUser = { displayName?: string | null; email?: string | null } | null;

/**
 * Antes: escutava o estado de autenticação do Firebase.
 * Agora: sinaliza imediatamente "não autenticado" (onAuthFailure) e retorna um
 * unsubscribe no-op. Mesma assinatura do módulo original.
 */
export const initAuth = (
  onAuthSuccess?: (user: NonNullable<GoogleUser>, token: string) => void,
  onAuthFailure?: () => void
): (() => void) => {
  try { onAuthFailure?.(); } catch { /* ignore */ }
  return () => { /* no-op */ };
};

/** Login com Google desativado (recurso não utilizado). */
export const googleSignIn = async (): Promise<{ user: GoogleUser; accessToken: string } | null> => {
  alert('A integração com conta Google foi desativada neste sistema.');
  return null;
};

/** Sem sessão Google — sempre null. */
export const getAccessToken = async (): Promise<string | null> => null;

export const logoutGoogle = async (): Promise<void> => { /* no-op */ };
