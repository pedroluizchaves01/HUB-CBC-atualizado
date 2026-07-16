import { initializeApp } from 'firebase/app';
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, User, signOut } from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

const provider = new GoogleAuthProvider();
// Request Google Drive, Contacts, and User profile scopes
provider.addScope('https://www.googleapis.com/auth/drive.file');
provider.addScope('https://www.googleapis.com/auth/userinfo.email');
provider.addScope('https://www.googleapis.com/auth/userinfo.profile');
provider.addScope('https://www.googleapis.com/auth/contacts.readonly');

let isSigningIn = false;
let cachedAccessToken: string | null = null;

// Mock user for automatic activation
export const mockUser = {
  email: 'chavesbritescorrea@gmail.com',
  displayName: 'Chaves Brites Correa Construtora',
  photoURL: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?w=100&h=100&fit=crop&crop=faces',
  uid: 'mock-cbc-admin-123',
  emailVerified: true,
  isAnonymous: false,
  metadata: {},
  providerData: [],
  refreshToken: '',
  tenantId: null,
  delete: async () => {},
  getIdToken: async () => 'mock_id_token',
  getIdTokenResult: async () => ({}) as any,
  reload: async () => {},
  toJSON: () => ({}),
} as unknown as User;

export const mockAccessToken = 'mock_google_access_token_cbc_123';

// Initialize auth state listener
export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  const storedToken = sessionStorage.getItem('cbc_google_access_token');
  const storedUserRaw = sessionStorage.getItem('cbc_google_user');
  
  if (storedToken && storedUserRaw) {
    try {
      const parsed = JSON.parse(storedUserRaw);
      const initialUser = {
        ...mockUser,
        email: parsed.email || mockUser.email,
        displayName: parsed.displayName || mockUser.displayName,
        photoURL: parsed.photoURL || mockUser.photoURL,
      } as unknown as User;
      cachedAccessToken = storedToken;
      if (onAuthSuccess) {
        onAuthSuccess(initialUser, storedToken);
      }
    } catch (e) {
      cachedAccessToken = null;
      if (onAuthFailure) onAuthFailure();
    }
  } else {
    cachedAccessToken = null;
    if (onAuthFailure) onAuthFailure();
  }

  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      if (!cachedAccessToken) {
        cachedAccessToken = sessionStorage.getItem('cbc_google_access_token');
      }
      if (cachedAccessToken) {
        if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
      } else {
        if (onAuthFailure) onAuthFailure();
      }
    } else {
      const sToken = sessionStorage.getItem('cbc_google_access_token');
      if (!sToken) {
        cachedAccessToken = null;
        if (onAuthFailure) onAuthFailure();
      }
    }
  });
};

// Start Google sign-in popup flow
export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Falha ao obter o token de acesso do Google.');
    }

    cachedAccessToken = credential.accessToken;
    sessionStorage.setItem('cbc_google_access_token', credential.accessToken);
    sessionStorage.setItem('cbc_google_user', JSON.stringify({
      email: result.user.email,
      displayName: result.user.displayName,
      photoURL: result.user.photoURL,
    }));
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    console.error('Erro no login com Google:', error);
    // Não mascarar falha de login com um usuário/token falso.
    // Propaga o erro para a UI mostrar uma mensagem real ao usuário.
    throw new Error('Não foi possível conectar com sua conta Google. Tente novamente.');
  } finally {
    isSigningIn = false;
  }
};

export const enterDemoMode = async (email: string, targetFolder: string): Promise<{ user: User; accessToken: string }> => {
  const customUser = {
    ...mockUser,
    email: email,
    displayName: email.split('@')[0],
  } as unknown as User;
  
  const customToken = `manual_connected_token_${Date.now()}`;
  cachedAccessToken = customToken;
  sessionStorage.setItem('cbc_google_access_token', customToken);
  sessionStorage.setItem('cbc_google_user', JSON.stringify({
    email: customUser.email,
    displayName: customUser.displayName,
    photoURL: customUser.photoURL,
  }));
  if (targetFolder) {
    sessionStorage.setItem('cbc_google_target_folder', targetFolder);
  }
  
  return { user: customUser, accessToken: customToken };
};

export const getAccessToken = async (): Promise<string | null> => {
  if (!cachedAccessToken) {
    cachedAccessToken = sessionStorage.getItem('cbc_google_access_token');
  }
  return cachedAccessToken;
};

export const logoutGoogle = async () => {
  try {
    await signOut(auth);
  } catch (e) {
    // Ignore
  }
  cachedAccessToken = null;
  sessionStorage.removeItem('cbc_google_access_token');
  sessionStorage.removeItem('cbc_google_user');
  sessionStorage.removeItem('cbc_google_target_folder');
};
