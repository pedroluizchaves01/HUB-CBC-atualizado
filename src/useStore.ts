import { useState, useEffect } from 'react';
import { User, Client, Project, Transaction, ProjectDocument } from './types';
import { INITIAL_USERS, INITIAL_CLIENTS, INITIAL_PROJECTS, INITIAL_TRANSACTIONS, INITIAL_DOCUMENTS } from './initialData';
import { subscribeCollection, saveDoc, removeDoc } from './lib/firebaseDb';
import { ensureDefaultTelegramConfig } from './lib/telegramService';

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

  // Real-time synchronization listeners with automatic seeding
  useEffect(() => {
    ensureDefaultTelegramConfig().catch(err => console.error('Erro ao garantir configuração padrão do Telegram:', err));
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

  // Auto-heal/sync missing default users from INITIAL_USERS (e.g. newly added roles like Marketing)
  useEffect(() => {
    if (users.length > 0) {
      INITIAL_USERS.forEach(async (defaultUser) => {
        const exists = users.some(
          u => u.username.trim().toLowerCase() === defaultUser.username.trim().toLowerCase()
        );
        if (!exists) {
          console.log(`Auto-seeding missing default user: ${defaultUser.username}`);
          try {
            await saveDoc('users', defaultUser.id, defaultUser);
          } catch (err) {
            console.error(`Failed to auto-seed missing user ${defaultUser.username}:`, err);
          }
        }
      });
    }
  }, [users]);

  // Sync current user login session
  useEffect(() => {
    if (currentUser) {
      sessionStorage.setItem('cbc_current_user', JSON.stringify(currentUser));
    } else {
      sessionStorage.removeItem('cbc_current_user');
    }
  }, [currentUser]);

  // Case-insensitive username comparison, case-sensitive password comparison
  const login = (usernameInput: string, passwordInput: string): { success: boolean; error?: string; user?: User } => {
    const cleanUsername = usernameInput.trim().toLowerCase();
    
    let matchedUser = users.find(
      u => u.username.trim().toLowerCase() === cleanUsername
    );

    // If not found in the sync'd state, fallback to hardcoded INITIAL_USERS for instant availability
    if (!matchedUser) {
      const fallbackUser = INITIAL_USERS.find(
        u => u.username.trim().toLowerCase() === cleanUsername
      );
      if (fallbackUser && fallbackUser.passwordHash === passwordInput) {
        // Trigger a save so it populates on Firestore
        saveDoc('users', fallbackUser.id, fallbackUser).catch(err => {
          console.error('Error seeding user on demand:', err);
        });
        matchedUser = fallbackUser;
      }
    }

    if (!matchedUser) {
      return { success: false, error: 'Usuário ou senha incorretos ou cadastro não localizado.' };
    }

    if (matchedUser.passwordHash !== passwordInput) {
      return { success: false, error: 'Usuário ou senha incorretos ou cadastro não localizado.' };
    }

    setCurrentUser(matchedUser);
    ensureDefaultTelegramConfig().catch(err => console.error('Erro ao vincular Telegram automaticamente:', err));
    return { success: true, user: matchedUser };
  };

  const logout = () => {
    setCurrentUser(null);
  };

  // Admin capabilities
  const addClient = async (newClient: Client, passwordInput: string) => {
    const cleanUsername = newClient.username.trim().toLowerCase();
    const usernameTaken = users.some(u => u.username.trim().toLowerCase() === cleanUsername);
    if (usernameTaken) {
      throw new Error(`O usuário "${newClient.username}" já está cadastrado.`);
    }

    // Save client to Firestore
    await saveDoc('clients', newClient.id, newClient);

    // Create and save links user
    const newUser: User = {
      id: `user-${Date.now()}`,
      username: newClient.username,
      passwordHash: passwordInput,
      role: 'client',
      name: newClient.name,
      clientId: newClient.id
    };
    await saveDoc('users', newUser.id, newUser);
  };

  const editClient = async (updatedClient: Client, newPassword?: string) => {
    await saveDoc('clients', updatedClient.id, updatedClient);
    
    // Update linked user
    const linkedUser = users.find(u => u.clientId === updatedClient.id);
    if (linkedUser) {
      const updatedUser: User = {
        ...linkedUser,
        name: updatedClient.name,
        username: updatedClient.username,
        passwordHash: newPassword && newPassword.trim() !== '' ? newPassword : linkedUser.passwordHash
      };
      await saveDoc('users', updatedUser.id, updatedUser);
    }
  };

  const deleteClient = async (clientId: string) => {
    const clientToDelete = clients.find(c => c.id === clientId);
    if (!clientToDelete) return;

    await removeDoc('clients', clientId);

    const linkedUser = users.find(u => u.clientId === clientId);
    if (linkedUser) {
      await removeDoc('users', linkedUser.id);
    }

    const clientProjects = projects.filter(p => p.clientId === clientId);
    const clientProjectIds = clientProjects.map(p => p.id);

    for (const p of clientProjects) {
      await removeDoc('projects', p.id);
    }

    const transactionsToDelete = transactions.filter(t => clientProjectIds.includes(t.projectId));
    for (const t of transactionsToDelete) {
      await removeDoc('transactions', t.id);
    }

    const documentsToDelete = documents.filter(d => clientProjectIds.includes(d.projectId));
    for (const d of documentsToDelete) {
      await removeDoc('documents', d.id);
    }
  };

  const addProject = async (newProject: Project) => {
    await saveDoc('projects', newProject.id, newProject);
  };

  const editProject = async (updatedProject: Project) => {
    await saveDoc('projects', updatedProject.id, updatedProject);
  };

  const deleteProject = async (projectId: string) => {
    await removeDoc('projects', projectId);

    const transactionsToDelete = transactions.filter(t => t.projectId === projectId);
    for (const t of transactionsToDelete) {
      await removeDoc('transactions', t.id);
    }

    const documentsToDelete = documents.filter(d => d.projectId === projectId);
    for (const d of documentsToDelete) {
      await removeDoc('documents', d.id);
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
