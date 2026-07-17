import { useState, useEffect } from 'react';
import { User, Client, Project, Transaction, ProjectDocument } from './types';
import { INITIAL_USERS, INITIAL_CLIENTS, INITIAL_PROJECTS, INITIAL_TRANSACTIONS, INITIAL_DOCUMENTS } from './initialData';
import { subscribeCollection, saveDoc, removeDoc } from './lib/firebaseDb';
import { apiSend, setSessionToken, getSessionToken, ApiError } from './lib/apiClient';

export function useStore() {
  const [users, setUsers] = useState<User[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [documents, setDocuments] = useState<ProjectDocument[]>([]);

  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    const saved = sessionStorage.getItem('cbc_current_user');
    return saved ? JSON.parse(saved) : null;
  });

  // Real-time synchronization listeners (via backend guardião)
  useEffect(() => {
    const unsubUsers = subscribeCollection('users', setUsers, INITIAL_USERS, 'cbc_users');
    const unsubClients = subscribeCollection('clients', setClients, INITIAL_CLIENTS, 'cbc_clients');
    const unsubProjects = subscribeCollection('projects', setProjects, INITIAL_PROJECTS, 'cbc_projects');
    const unsubTransactions = subscribeCollection('transactions', setTransactions, INITIAL_TRANSACTIONS, 'cbc_transactions');
    const unsubDocuments = subscribeCollection('documents', setDocuments, INITIAL_DOCUMENTS, 'cbc_documents');

    return () => {
      unsubUsers();
      unsubClients();
      unsubProjects();
      unsubTransactions();
      unsubDocuments();
    };
  }, []);

  // Sessão do app: só é considerada válida se houver token de sessão do backend.
  // Isso impede forjar 'cbc_current_user' no storage sem um token assinado pelo servidor.
  useEffect(() => {
    if (currentUser && getSessionToken()) {
      sessionStorage.setItem('cbc_current_user', JSON.stringify(currentUser));
    } else if (!currentUser) {
      sessionStorage.removeItem('cbc_current_user');
    }
  }, [currentUser]);

  // Ao montar, se há usuário salvo mas nenhum token de sessão, descarta a sessão (não confiável).
  useEffect(() => {
    if (currentUser && !getSessionToken()) {
      setCurrentUser(null);
      sessionStorage.removeItem('cbc_current_user');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Login real: valida no backend (bcrypt + sessão assinada). Nenhuma senha é comparada no cliente.
  const login = async (usernameInput: string, passwordInput: string): Promise<{ success: boolean; error?: string; user?: User }> => {
    try {
      const resp = await apiSend('/api/auth/login', 'POST', {
        username: usernameInput.trim(),
        password: passwordInput,
      });
      if (!resp?.user || !resp?.token) {
        return { success: false, error: 'Resposta inválida do servidor.' };
      }
      setSessionToken(resp.token);
      const user = resp.user as User;
      setCurrentUser(user);
      return { success: true, user };
    } catch (err: any) {
      const msg = err instanceof ApiError
        ? err.message
        : 'Não foi possível conectar ao servidor. Tente novamente.';
      return { success: false, error: msg };
    }
  };

  const logout = async () => {
    try { await apiSend('/api/auth/logout', 'POST', {}); } catch { /* ignora */ }
    setSessionToken(null);
    setCurrentUser(null);
  };

  // Admin capabilities
  const addClient = async (newClient: Client, passwordInput: string) => {
    const cleanUsername = newClient.username.trim().toLowerCase();
    const usernameTaken = users.some(u => u.username.trim().toLowerCase() === cleanUsername);
    if (usernameTaken) {
      throw new Error(`O usuário "${newClient.username}" já está cadastrado.`);
    }

    // Salva o cliente (via backend)
    await saveDoc('clients', newClient.id, newClient);

    // Cria o usuário vinculado com senha HASHEADA no backend (nunca em texto puro).
    await apiSend('/api/users/upsert', 'POST', {
      id: `user-${Date.now()}`,
      username: newClient.username,
      role: 'client',
      name: newClient.name,
      clientId: newClient.id,
      password: passwordInput,
    });
  };

  const editClient = async (updatedClient: Client, newPassword?: string) => {
    const cleanUsername = updatedClient.username.trim().toLowerCase();
    const linkedUser = users.find(u => u.clientId === updatedClient.id);

    // Valida duplicidade: nenhum OUTRO usuário (id != linkedUser.id) pode usar o mesmo username.
    const usernameTaken = users.some(
      u => u.id !== linkedUser?.id && u.username.trim().toLowerCase() === cleanUsername
    );
    if (usernameTaken) {
      throw new Error(`O usuário "${updatedClient.username}" já está cadastrado.`);
    }

    await saveDoc('clients', updatedClient.id, updatedClient);

    // Atualiza o usuário vinculado. A senha (se informada) é hasheada no backend.
    if (linkedUser) {
      await apiSend('/api/users/upsert', 'POST', {
        id: linkedUser.id,
        username: updatedClient.username,
        role: linkedUser.role,
        name: updatedClient.name,
        clientId: linkedUser.clientId,
        // Só envia password quando o admin definiu uma nova; senão o backend mantém a atual.
        password: newPassword && newPassword.trim() !== '' ? newPassword : undefined,
      });
    }
  };

  // Remoção defensiva: ignora falhas de "item já inexistente" para não abortar a cascata.
  // Erros reais (rede/permissão) continuam sendo logados.
  const safeRemove = async (collection: string, id: string) => {
    try {
      await removeDoc(collection, id);
    } catch (err) {
      console.warn(`Falha ao remover ${collection}/${id} na cascata (ignorado):`, err);
    }
  };

  // LIMITAÇÃO CONHECIDA: a cascata abaixo é calculada a partir do estado LOCAL (users/projects/
  // transactions/documents), que pode estar desatualizado em relação ao backend. Itens criados por
  // outro cliente/aba após a última sincronização podem NÃO ser incluídos na cascata, deixando órfãos.
  // A solução robusta seria uma Cloud Function fazendo a cascata server-side; por ora, tornamos a
  // remoção defensiva (safeRemove) para não falhar quando um item já não existir.
  const deleteClient = async (clientId: string) => {
    const clientToDelete = clients.find(c => c.id === clientId);
    if (!clientToDelete) return;

    await safeRemove('clients', clientId);

    const linkedUser = users.find(u => u.clientId === clientId);
    if (linkedUser) {
      await safeRemove('users', linkedUser.id);
    }

    const clientProjects = projects.filter(p => p.clientId === clientId);
    const clientProjectIds = clientProjects.map(p => p.id);

    for (const p of clientProjects) {
      await safeRemove('projects', p.id);
    }

    const transactionsToDelete = transactions.filter(t => clientProjectIds.includes(t.projectId));
    for (const t of transactionsToDelete) {
      await safeRemove('transactions', t.id);
    }

    const documentsToDelete = documents.filter(d => clientProjectIds.includes(d.projectId));
    for (const d of documentsToDelete) {
      await safeRemove('documents', d.id);
    }
  };

  const addProject = async (newProject: Project) => {
    await saveDoc('projects', newProject.id, newProject);
  };

  const editProject = async (updatedProject: Project) => {
    await saveDoc('projects', updatedProject.id, updatedProject);
  };

  // LIMITAÇÃO CONHECIDA: assim como em deleteClient, a cascata usa o estado LOCAL de transactions/
  // documents, que pode estar defasado em relação ao backend, podendo deixar órfãos. A cascata usa
  // safeRemove para permanecer defensiva (não falha se um item já não existir).
  const deleteProject = async (projectId: string) => {
    await safeRemove('projects', projectId);

    const transactionsToDelete = transactions.filter(t => t.projectId === projectId);
    for (const t of transactionsToDelete) {
      await safeRemove('transactions', t.id);
    }

    const documentsToDelete = documents.filter(d => d.projectId === projectId);
    for (const d of documentsToDelete) {
      await safeRemove('documents', d.id);
    }
  };

  const addTransaction = async (newTx: Transaction) => {
    await saveDoc('transactions', newTx.id, newTx);
  };

  const editTransaction = async (updatedTx: Transaction) => {
    await saveDoc('transactions', updatedTx.id, updatedTx);
  };

  const deleteTransaction = async (txId: string) => {
    await removeDoc('transactions', txId);
  };

  const addDocument = async (newDoc: ProjectDocument) => {
    await saveDoc('documents', newDoc.id, newDoc);
  };

  const editDocument = async (updatedDoc: ProjectDocument) => {
    await saveDoc('documents', updatedDoc.id, updatedDoc);
  };

  const deleteDocument = async (docId: string) => {
    await removeDoc('documents', docId);
  };

  return {
    users,
    clients,
    projects,
    transactions,
    documents,
    currentUser,
    login,
    logout,
    addClient,
    editClient,
    deleteClient,
    addProject,
    editProject,
    deleteProject,
    addTransaction,
    editTransaction,
    deleteTransaction,
    addDocument,
    editDocument,
    deleteDocument
  };
}
