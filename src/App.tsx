import React from 'react';
import { useStore } from './useStore';
import Login from './components/Login';
import AdminDashboard from './components/AdminDashboard';
import ClientDashboard from './components/ClientDashboard';
import EnvironmentSelect from './components/EnvironmentSelect';
import ProjectEnvironment from './components/ProjectEnvironment';
import EnvironmentSwitcher from './components/EnvironmentSwitcher';

export default function App() {
  // Ambiente escolhido após o login ('projeto' | 'obra'). Persistido na sessão
  // para sobreviver a recarregamentos, mas limpo ao sair.
  const [env, setEnvState] = React.useState<'projeto' | 'obra' | null>(
    () => (sessionStorage.getItem('cbc_env') as 'projeto' | 'obra' | null) || null
  );
  const setEnv = (e: 'projeto' | 'obra' | null) => {
    if (e) sessionStorage.setItem('cbc_env', e);
    else sessionStorage.removeItem('cbc_env');
    setEnvState(e);
  };

  const {
    users,
    clients,
    projects,
    transactions,
    currentUser,
    login,
    logout: rawLogout,
    addClient,
    editClient,
    deleteClient,
    addProject,
    editProject,
    deleteProject,
    addTransaction,
    editTransaction,
    deleteTransaction,
    documents,
    addDocument,
    editDocument,
    deleteDocument,
    contracts,
    addContract,
    editContract,
    deleteContract
  } = useStore();

  // Logout também limpa o ambiente escolhido.
  const logout = () => {
    sessionStorage.removeItem('cbc_env');
    setEnvState(null);
    rawLogout();
  };

  // If no user is logged in, show the clean login page
  if (!currentUser) {
    const handleLoginAttempt = (username: string, pb: string, rememberMe: boolean) => login(username, pb, rememberMe);
    return <Login onLogin={handleLoginAttempt} />;
  }

  // Após o login, a pessoa escolhe entre os ambientes Projeto e Obra.
  // A escolha vive em sessionStorage para não perder ao recarregar, mas some ao sair.
  const environment = env;
  if (!environment) {
    return (
      <EnvironmentSelect
        userName={currentUser.name}
        onSelect={(e) => setEnv(e)}
        onLogout={logout}
      />
    );
  }

  // Ambiente PROJETO — novo, independente. Recebe o papel para futura diferenciação.
  if (environment === 'projeto') {
    return (
      <ProjectEnvironment
        role={currentUser.role}
        userName={currentUser.name}
        currentUserId={currentUser.id}
        clientId={currentUser.clientId}
        clients={clients}
        obras={projects}
        onAddObra={addProject}
        onLogout={logout}
        onSwitchEnvironment={() => setEnv('obra')}
        onGoToSelect={() => setEnv(null)}
      />
    );
  }

  // Ambiente OBRA — tudo que já existe. (environment === 'obra')

  // Admin & Marketing View
  if (currentUser.role === 'admin' || currentUser.role === 'marketing') {
    return (
      <>
      <AdminDashboard
        role={currentUser.role}
        currentUserId={currentUser.id}
        clients={clients}
        projects={projects}
        transactions={transactions}
        users={users}
        documents={documents}
        contracts={contracts}
        onLogout={logout}
        onAddClient={addClient}
        onEditClient={editClient}
        onDeleteClient={deleteClient}
        onAddProject={addProject}
        onEditProject={editProject}
        onDeleteProject={deleteProject}
        onAddTransaction={addTransaction}
        onEditTransaction={editTransaction}
        onDeleteTransaction={deleteTransaction}
        onAddDocument={addDocument}
        onEditDocument={editDocument}
        onDeleteDocument={deleteDocument}
        onAddContract={addContract}
        onEditContract={editContract}
        onDeleteContract={deleteContract}
      />
      <EnvironmentSwitcher
        current="obra"
        onGoProjeto={() => setEnv('projeto')}
        onGoObra={() => setEnv('obra')}
        onGoSelect={() => setEnv(null)}
      />
      </>
    );
  }

  // Client View
  if (currentUser.role === 'client') {
    const linkedClient = clients.find(c => c.id === currentUser.clientId);
    
    if (!linkedClient) {
      // Gracefully handle if the client registry was deleted by admin
      return (
        <div className="min-h-screen bg-[#111113] text-[#EAEAEB] font-mono flex flex-col items-center justify-center p-6 text-center">
          <div className="max-w-md bg-[#18181A] border-2 border-[#EAEAEB] p-8 space-y-4">
            <h3 className="font-oswald text-lg text-[#FF5A00] uppercase tracking-wider">Cadastro Suspenso</h3>
            <p className="text-xs text-[#EAEAEB]/70 leading-relaxed">
              As informações associadas ao seu usuário não foram localizadas. É possível que o cadastro tenha sido atualizado ou suspenso pelo time de engenharia.
            </p>
            <button
              onClick={logout}
              className="mt-4 bg-[#FF5A00] text-[#111113] px-5 py-2 text-xs font-bold uppercase tracking-wider cursor-pointer"
            >
              Voltar ao Login
            </button>
          </div>
        </div>
      );
    }

    return (
      <>
      <ClientDashboard
        client={linkedClient}
        projects={projects}
        transactions={transactions}
        documents={documents}
        onLogout={logout}
        onAddTransaction={addTransaction}
      />
      <EnvironmentSwitcher
        current="obra"
        onGoProjeto={() => setEnv('projeto')}
        onGoObra={() => setEnv('obra')}
        onGoSelect={() => setEnv(null)}
      />
      </>
    );
  }

  // Fallback
  return (
    <div className="min-h-screen bg-[#111113] text-[#EAEAEB] font-mono flex flex-col items-center justify-center p-6 text-center">
      <div className="max-w-md bg-[#18181A] border-2 border-[#EAEAEB] p-8 space-y-4">
        <h3 className="font-oswald text-lg text-[#FF5A00] uppercase tracking-wider">Falha de Autenticação</h3>
        <p className="text-xs text-[#EAEAEB]/70">Formato de perfil não identificado pelo sistema.</p>
        <button
          onClick={logout}
          className="mt-2 bg-[#FF5A00] text-[#111113] px-4 py-2 text-xs font-bold uppercase tracking-wider cursor-pointer"
        >
          Sair
        </button>
      </div>
    </div>
  );
}
