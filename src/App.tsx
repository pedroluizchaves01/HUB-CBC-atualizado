import React from 'react';
import { useStore } from './useStore';
import Login from './components/Login';
import AdminDashboard from './components/AdminDashboard';
import ClientDashboard from './components/ClientDashboard';

export default function App() {
  const {
    clients,
    projects,
    transactions,
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
    documents,
    addDocument,
    editDocument,
    deleteDocument
  } = useStore();

  // If no user is logged in, show the clean login page
  if (!currentUser) {
    const handleLoginAttempt = (username: string, pb: string) => login(username, pb);
    return <Login onLogin={handleLoginAttempt} />;
  }

  // Admin & Marketing View
  if (currentUser.role === 'admin' || currentUser.role === 'marketing') {
    return (
      <AdminDashboard
        role={currentUser.role}
        clients={clients}
        projects={projects}
        transactions={transactions}
        documents={documents}
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
      />
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
      <ClientDashboard
        client={linkedClient}
        projects={projects}
        transactions={transactions}
        documents={documents}
        onLogout={logout}
        onAddTransaction={addTransaction}
      />
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
