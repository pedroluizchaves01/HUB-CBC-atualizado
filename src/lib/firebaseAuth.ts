import { initializeApp } from 'firebase/app';
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, User, signOut } from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

const provider = new GoogleAuthProvider();
// Escopos mínimos para o Google Drive (arquivos criados pelo app) e o perfil.
// 'contacts.readonly' é usado para importar contatos como fornecedores em Cotações.
provider.addScope('https://www.googleapis.com/auth/drive.file');
provider.addScope('https://www.googleapis.com/auth/userinfo.email');
provider.addScope('https://www.googleapis.com/auth/userinfo.profile');
provider.addScope('https://www.googleapis.com/auth/contacts.readonly');

// SEGURANÇA: o access token OAuth do Google é mantido APENAS em memória (volátil).
// Não é mais persistido em sessionStorage — isso evita que um XSS o exfiltre do storage
// e reduz a janela de exposição (o token é reobtido via login quando necessário).
let cachedAccessToken: string | null = null;

// Guardamos apenas dados NÃO sensíveis do perfil (nome/e-mail/foto) para exibição,
// nunca o token. Isso permite reidratar a UI sem manter credencial em disco.
const PROFILE_KEY = 'cbc_google_user';

/**
 * Inicializa o listener de auth do Google. O token vive só em memória, então após um reload
 * o usuário precisa reconectar o Google (Drive) — os dados do app seguem via sessão do backend.
 */
export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user && cachedAccessToken) {
      if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
    } else {
      if (onAuthFailure) onAuthFailure();
    }
  });
};

/** Inicia o fluxo de login com o Google (popup). O token fica só em memória. */
export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Falha ao obter o token de acesso do Google.');
    }
    cachedAccessToken = credential.accessToken;
    try {
      sessionStorage.setItem(PROFILE_KEY, JSON.stringify({
        email: result.user.email,
        displayName: result.user.displayName,
        photoURL: result.user.photoURL,
      }));
    } catch { /* storage indisponível */ }
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    console.error('Erro no login com Google:', error);
    throw new Error('Não foi possível conectar com sua conta Google. Tente novamente.');
  }
};

/** Retorna o access token do Google (só em memória). Null se o usuário não conectou o Google nesta sessão. */
export const getAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken;
};

export const logoutGoogle = async () => {
  try {
    await signOut(auth);
  } catch {
    // Ignora
  }
  cachedAccessToken = null;
  try { sessionStorage.removeItem(PROFILE_KEY); } catch { /* ignore */ }
};
