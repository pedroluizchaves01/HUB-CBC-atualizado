import React, { useState, useEffect } from 'react';
import { 
  Users, 
  Plus, 
  Trash2, 
  Edit3, 
  Calendar, 
  DollarSign, 
  CheckCircle2, 
  Clock, 
  Printer, 
  FileText, 
  TrendingUp, 
  Percent, 
  ChevronDown, 
  ChevronUp, 
  X,
  CreditCard
} from 'lucide-react';
import { Project } from '../types';
import { subscribeCollection, saveDoc, removeDoc } from '../lib/firebaseDb';

export interface LaborContract {
  id: string;
  projectId: string;
  supplier: string;
  scope: string; // Resumo do contrato/escopo
  contractValue: number;
  notes?: string;
}

export interface LaborPayment {
  id: string;
  projectId: string;
  contractId: string; // Associated contract
  supplier: string; // Fornecedor correspondente
  paymentDate: string;
  value: number;
  description: string; // Descrição ou Parcela
  notes?: string;
}

interface PlanningLaborPaymentsProps {
  projects: Project[];
  laborProjectId: string;
  setLaborProjectId: (id: string) => void;
  isLaborCollapsed: boolean;
  setIsLaborCollapsed: (collapsed: boolean) => void;
  formatCurrency: (value: number) => string;
}

export const PlanningLaborPayments: React.FC<PlanningLaborPaymentsProps> = ({
  projects,
  laborProjectId,
  setLaborProjectId,
  isLaborCollapsed,
  setIsLaborCollapsed,
  formatCurrency
}) => {
  const [contracts, setContracts] = useState<LaborContract[]>([]);
  const [payments, setPayments] = useState<LaborPayment[]>([]);

  const INITIAL_LABOR_CONTRACTS = [
    {
      id: 'con-1',
      projectId: 'proj-1', // Fallback to first project or will map
      supplier: 'Aliança Estruturas Ltda',
      scope: 'Execução de Fundação e Estrutura de Concreto Armado',
      contractValue: 120000,
      notes: 'Incluso fôrmas, armação e lançamento de concreto. Cronograma de 4 meses.'
    },
    {
      id: 'con-2',
      projectId: 'proj-1',
      supplier: 'Gesso & Arte Interiores',
      scope: 'Forro de Gesso Drywall e Sancas Decorativas',
      contractValue: 35000,
      notes: 'Materiais inclusos pela contratada.'
    },
    {
      id: 'con-3',
      projectId: 'proj-2',
      supplier: 'Instaladora Norte-Sul',
      scope: 'Instalações Hidrossanitárias e Elétricas Prediais',
      contractValue: 85000,
      notes: 'Tubulação Tigre e cabos Prysmian. Testes de pressão inclusos.'
    }
  ];

  const INITIAL_LABOR_PAYMENTS = [
    {
      id: 'pay-1',
      projectId: 'proj-1',
      contractId: 'con-1',
      supplier: 'Aliança Estruturas Ltda',
      paymentDate: '2026-07-15',
      value: 30000,
      description: 'Sinal de Entrada + Medição de Escavação',
      notes: 'Transferência bancária autorizada pelo financeiro.'
    },
    {
      id: 'pay-2',
      projectId: 'proj-1',
      contractId: 'con-1',
      supplier: 'Aliança Estruturas Ltda',
      paymentDate: '2026-08-15',
      value: 30000,
      description: '2ª Medição - Concretagem de Pilares do Térreo',
      notes: 'Sujeito a medição do engenheiro de campo.'
    },
    {
      id: 'pay-3',
      projectId: 'proj-1',
      contractId: 'con-2',
      supplier: 'Gesso & Arte Interiores',
      paymentDate: '2026-09-01',
      value: 10500,
      description: 'Entrada de 30% do contrato'
    }
  ];

  useEffect(() => {
    const unsubContracts = subscribeCollection('labor_contracts', setContracts, INITIAL_LABOR_CONTRACTS, 'cbc_labor_contracts');
    const unsubPayments = subscribeCollection('labor_payments', setPayments, INITIAL_LABOR_PAYMENTS, 'cbc_labor_payments');

    return () => {
      unsubContracts();
      unsubPayments();
    };
  }, []);

  // Handle default project binding on mount if needed
  useEffect(() => {
    if (!laborProjectId && projects.length > 0) {
      setLaborProjectId(projects[0].id);
    }
  }, [projects, laborProjectId, setLaborProjectId]);

  // Mapeamento derivado dos projectId dos mocks para os ids efetivos dos projetos.
  // Feito no momento de filtrar (sem mutar o state, que o snapshot sobrescreveria).
  const resolveProjectId = (projectId: string) => {
    if (projects.length === 0) return projectId;
    const firstId = projects[0].id;
    const secondId = projects[1]?.id || firstId;
    if (projectId === 'proj-1' && firstId !== 'proj-1') return firstId;
    if (projectId === 'proj-2' && secondId !== 'proj-2') return secondId;
    return projectId;
  };

  // Filtering variables
  const activeContracts = contracts.filter(c => resolveProjectId(c.projectId) === laborProjectId);
  const activePayments = payments.filter(p => resolveProjectId(p.projectId) === laborProjectId);

  // Forms state
  const [isContractFormOpen, setIsContractFormOpen] = useState(false);
  const [editingContract, setEditingContract] = useState<LaborContract | null>(null);
  const [contractForm, setContractForm] = useState({
    supplier: '',
    scope: '',
    contractValue: '',
    notes: ''
  });
  const [contractError, setContractError] = useState<string | null>(null);

  const [isPaymentFormOpen, setIsPaymentFormOpen] = useState(false);
  const [editingPayment, setEditingPayment] = useState<LaborPayment | null>(null);
  const [paymentForm, setPaymentForm] = useState({
    contractId: '',
    paymentDate: '',
    value: '',
    description: '',
    notes: ''
  });
  const [paymentError, setPaymentError] = useState<string | null>(null);

  const [isPrintOpen, setIsPrintOpen] = useState(false);

  // Helpers to get contract for a payment
  const getContractForPayment = (payment: LaborPayment) => {
    return contracts.find(c => c.id === payment.contractId);
  };

  // Calculate statistics per project
  const totalContractsValue = activeContracts.reduce((sum, c) => sum + c.contractValue, 0);
  const totalScheduledValue = activePayments.reduce((sum, p) => sum + p.value, 0);
  const globalProgressPercent = totalContractsValue > 0 ? (totalScheduledValue / totalContractsValue) * 100 : 0;

  // Contracts detailed summaries
  const contractSummaries = activeContracts.map(c => {
    const associatedPayments = activePayments.filter(p => p.contractId === c.id);
    const totalScheduled = associatedPayments.reduce((sum, p) => sum + p.value, 0);
    const percentOfContract = c.contractValue > 0 ? (totalScheduled / c.contractValue) * 100 : 0;
    const balanceRemaining = c.contractValue - totalScheduled;

    return {
      contract: c,
      totalScheduled,
      percentOfContract,
      balanceRemaining,
      paymentsCount: associatedPayments.length
    };
  });

  // Contract Form Handlers
  const handleStartContractAdd = () => {
    setEditingContract(null);
    setContractForm({
      supplier: '',
      scope: '',
      contractValue: '',
      notes: ''
    });
    setContractError(null);
    setIsContractFormOpen(true);
  };

  const handleStartContractEdit = (c: LaborContract) => {
    setEditingContract(c);
    setContractForm({
      supplier: c.supplier,
      scope: c.scope,
      contractValue: c.contractValue.toString(),
      notes: c.notes || ''
    });
    setContractError(null);
    setIsContractFormOpen(true);
  };

  const handleSaveContract = async (e: React.FormEvent) => {
    e.preventDefault();
    const { supplier, scope, contractValue, notes } = contractForm;

    if (!supplier.trim()) return setContractError('Nome do fornecedor é obrigatório.');
    if (!scope.trim()) return setContractError('Resumo do escopo é obrigatório.');
    
    const valueNum = parseFloat(contractValue);
    if (isNaN(valueNum) || valueNum <= 0) {
      return setContractError('Insira um valor de contrato válido maior que zero.');
    }

    try {
      if (editingContract) {
        // Edit existing
        const updatedContract: LaborContract = {
          ...editingContract,
          supplier: supplier.trim(),
          scope: scope.trim(),
          contractValue: valueNum,
          notes: notes.trim() || undefined
        };
        await saveDoc('labor_contracts', editingContract.id, updatedContract);

        // Propagate supplier name update to existing payments for consistency
        const linkedPayments = payments.filter(p => p.contractId === editingContract.id);
        for (const p of linkedPayments) {
          await saveDoc('labor_payments', p.id, { supplier: supplier.trim() });
        }
      } else {
        // Create new
        const contractId = `con-${Date.now()}`;
        const newContract: LaborContract = {
          id: contractId,
          projectId: laborProjectId,
          supplier: supplier.trim(),
          scope: scope.trim(),
          contractValue: valueNum,
          notes: notes.trim() || undefined
        };
        await saveDoc('labor_contracts', contractId, newContract);
      }

      setIsContractFormOpen(false);
      setEditingContract(null);
    } catch (err: any) {
      console.error("Erro ao salvar contrato:", err);
      setContractError("Falha ao salvar contrato no banco de dados.");
    }
  };

  const handleDeleteContract = async (id: string) => {
    if (confirm('Tem certeza que deseja excluir este contrato? Todos os pagamentos vinculados também serão excluídos.')) {
      try {
        await removeDoc('labor_contracts', id);
        const linkedPayments = payments.filter(p => p.contractId === id);
        for (const p of linkedPayments) {
          await removeDoc('labor_payments', p.id);
        }
      } catch (err: any) {
        console.error("Erro ao deletar contrato:", err);
      }
    }
  };

  // Payment Form Handlers
  const handleStartPaymentAdd = () => {
    setEditingPayment(null);
    setPaymentForm({
      contractId: activeContracts[0]?.id || '',
      paymentDate: new Date().toISOString().split('T')[0],
      value: '',
      description: '',
      notes: ''
    });
    setPaymentError(null);
    setIsPaymentFormOpen(true);
  };

  const handleStartPaymentEdit = (p: LaborPayment) => {
    setEditingPayment(p);
    setPaymentForm({
      contractId: p.contractId,
      paymentDate: p.paymentDate,
      value: p.value.toString(),
      description: p.description,
      notes: p.notes || ''
    });
    setPaymentError(null);
    setIsPaymentFormOpen(true);
  };

  const handleSavePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    const { contractId, paymentDate, value, description, notes } = paymentForm;

    if (!contractId) return setPaymentError('Selecione um contrato de mão de obra.');
    if (!paymentDate) return setPaymentError('Selecione a data planejada.');
    if (!description.trim()) return setPaymentError('A descrição da parcela é obrigatória.');

    const valueNum = parseFloat(value);
    if (isNaN(valueNum) || valueNum <= 0) {
      return setPaymentError('Insira um valor de pagamento válido maior que zero.');
    }

    const selectedContract = contracts.find(c => c.id === contractId);
    if (!selectedContract) return setPaymentError('Contrato não encontrado.');

    try {
      if (editingPayment) {
        const updatedPayment: LaborPayment = {
          ...editingPayment,
          contractId,
          supplier: selectedContract.supplier,
          paymentDate,
          value: valueNum,
          description: description.trim(),
          notes: notes.trim() || undefined
        };
        await saveDoc('labor_payments', editingPayment.id, updatedPayment);
      } else {
        const paymentId = `pay-${Date.now()}`;
        const newPayment: LaborPayment = {
          id: paymentId,
          projectId: laborProjectId,
          contractId,
          supplier: selectedContract.supplier,
          paymentDate,
          value: valueNum,
          description: description.trim(),
          notes: notes.trim() || undefined
        };
        await saveDoc('labor_payments', paymentId, newPayment);
      }

      setIsPaymentFormOpen(false);
      setEditingPayment(null);
    } catch (err: any) {
      console.error("Erro ao salvar pagamento:", err);
      setPaymentError("Falha ao salvar pagamento no banco de dados.");
    }
  };

  const handleDeletePayment = async (id: string) => {
    if (confirm('Deseja realmente remover esta programação de pagamento?')) {
      try {
        await removeDoc('labor_payments', id);
      } catch (err: any) {
        console.error("Erro ao excluir pagamento:", err);
      }
    }
  };

  // Get active project name
  const currentProjectName = projects.find(p => p.id === laborProjectId)?.name || 'Obra Geral';

  return (
    <div className="bg-white border border-stone-200 shadow-xs mb-6">
      
      {/* Header bar */}
      <div 
        onClick={() => setIsLaborCollapsed(!isLaborCollapsed)}
        className="bg-stone-50 border-b border-stone-200 px-5 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer hover:bg-stone-100/40 transition-all select-none"
      >
        <div className="flex items-center gap-3">
          <span className="text-stone-500 font-mono text-xs">
            {isLaborCollapsed ? '▶' : '▼'}
          </span>
          <div>
            <h3 className="font-serif text-base text-stone-900 font-bold flex items-center gap-2">
              <Users size={18} className="text-stone-600" />
              Programação de Pagamento de Mão de Obra
            </h3>
            <p className="text-xs text-stone-500 mt-0.5">
              Cadastre os contratos de prestadores de serviços e planeje as parcelas de pagamento futuras antes de iniciar a obra, garantindo previsão financeira para o cliente.
            </p>
          </div>
        </div>

        {/* Project Selector */}
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <span className="text-[10px] font-mono uppercase tracking-wider text-stone-500 font-bold">Obra / Cliente:</span>
          <select
            value={laborProjectId}
            onChange={(e) => setLaborProjectId(e.target.value)}
            className="bg-white border border-stone-300 py-1 px-2.5 text-xs focus:outline-none focus:border-stone-500 transition-all rounded-none font-sans font-medium"
          >
            {projects.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Main Collapsible Panel */}
      {!isLaborCollapsed && (
        <div className="p-5 space-y-6">

          {/* Quick Info & Main Actions Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-stone-150 pb-4">
            <div className="font-serif text-sm font-bold text-stone-850">
              Gestão de Contratos e Programação Física de Pagamentos
            </div>
            
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setIsPrintOpen(true)}
                className="bg-white hover:bg-stone-50 text-stone-800 border border-stone-250 py-1.5 px-3.5 text-[10px] font-mono uppercase tracking-wider font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                title="Imprimir relatório físico-financeiro de Mão de Obra em A4"
              >
                <Printer size={13} />
                <span>Imprimir A4</span>
              </button>

              <button
                type="button"
                onClick={handleStartContractAdd}
                className="bg-white hover:bg-stone-50 text-stone-900 border border-stone-300 py-1.5 px-3.5 text-[10px] font-mono uppercase tracking-wider font-bold transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <Plus size={13} className="text-stone-500" />
                <span>Novo Contrato</span>
              </button>

              <button
                type="button"
                onClick={handleStartPaymentAdd}
                disabled={activeContracts.length === 0}
                className="bg-stone-950 hover:bg-stone-850 text-white py-1.5 px-3.5 text-[10px] font-mono uppercase tracking-wider font-bold transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Plus size={13} />
                <span>Programar Pagamento</span>
              </button>
            </div>
          </div>

          {/* SECTION 1: CONTRACTS LIST & SUMMARIES */}
          <div className="space-y-4">
            <h4 className="font-serif text-xs font-bold uppercase tracking-wider text-stone-400 flex items-center gap-2">
              <FileText size={14} />
              1. Resumo dos Contratos de Mão de Obra
            </h4>

            {activeContracts.length === 0 ? (
              <div className="border border-dashed border-stone-250 p-6 text-center text-stone-400 text-xs font-sans">
                Nenhum contrato cadastrado nesta obra. Comece adicionando um contrato (ex: Empreiteiro Geral, Eletricista, Pintor) para programar suas parcelas de pagamento.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {contractSummaries.map(({ contract, totalScheduled, percentOfContract, balanceRemaining, paymentsCount }) => (
                  <div key={contract.id} className="border border-stone-200 bg-white shadow-xs p-4 flex flex-col justify-between space-y-4 hover:border-stone-300 transition-all">
                    
                    {/* Header */}
                    <div className="space-y-1">
                      <div className="flex justify-between items-start gap-2">
                        <h5 className="font-sans font-bold text-stone-900 text-[13px] tracking-tight">{contract.supplier}</h5>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            onClick={() => handleStartContractEdit(contract)}
                            className="p-1 text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-all cursor-pointer"
                            title="Editar Contrato"
                          >
                            <Edit3 size={12} />
                          </button>
                          <button
                            onClick={() => handleDeleteContract(contract.id)}
                            className="p-1 text-stone-400 hover:text-red-600 hover:bg-red-50 transition-all cursor-pointer"
                            title="Excluir Contrato"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                      <p className="text-[11px] text-stone-600 line-clamp-2 leading-relaxed">{contract.scope}</p>
                      {contract.notes && (
                        <p className="text-[10px] text-stone-400 italic">Obs: {contract.notes}</p>
                      )}
                    </div>

                    {/* Progress tracking bars */}
                    <div className="space-y-2 pt-2 border-t border-stone-100">
                      
                      {/* Financial values overview */}
                      <div className="flex justify-between text-[11px] font-sans font-medium text-stone-800">
                        <span>Valor Total Contratado:</span>
                        <span className="font-bold font-mono text-stone-950">{formatCurrency(contract.contractValue)}</span>
                      </div>

                      {/* Payment progress */}
                      <div className="space-y-1">
                        <div className="flex justify-between text-[9px] text-stone-500 font-mono">
                          <span>Programado: {formatCurrency(totalScheduled)} ({percentOfContract.toFixed(1)}%)</span>
                          <span>Saldo a Programar: {formatCurrency(balanceRemaining)}</span>
                        </div>
                        
                        {/* Unified progress bar for scheduled payments */}
                        <div className="w-full bg-stone-100 h-2 overflow-hidden flex">
                          <div className="bg-stone-900 h-full transition-all" style={{ width: `${Math.min(percentOfContract, 100)}%` }} title={`Programado: ${percentOfContract.toFixed(1)}%`} />
                        </div>
                      </div>

                      {/* Secondary Info */}
                      <div className="flex justify-between items-center text-[10px] text-stone-500 font-mono pt-1">
                        <span>{paymentsCount} parcelas cadastradas</span>
                      </div>

                    </div>

                  </div>
                ))}
              </div>
            )}
          </div>

          {/* SECTION 2: PAYMENTS SCHEDULE TABLE */}
          <div className="space-y-4 pt-4 border-t border-stone-150">
            <h4 className="font-serif text-xs font-bold uppercase tracking-wider text-stone-400 flex items-center gap-2">
              <CreditCard size={14} />
              2. Programação de Pagamentos de Mão de Obra
            </h4>

            {activePayments.length === 0 ? (
              <div className="border border-dashed border-stone-250 p-8 text-center text-stone-400 text-xs font-sans bg-stone-50/20">
                Nenhuma parcela de pagamento programada ainda. Clique em "Programar Pagamento" acima para agendar.
              </div>
            ) : (
              <div className="overflow-x-auto border border-stone-200">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-stone-50 font-mono text-[9px] uppercase tracking-wider text-stone-500 border-b border-stone-200">
                      <th className="p-3 w-12 text-center">#</th>
                      <th className="p-3">Fornecedor / Prestador</th>
                      <th className="p-3">Descrição / Parcela</th>
                      <th className="p-3 w-32 text-center">Data Prevista</th>
                      <th className="p-3 w-40 text-right">Valor da Parcela</th>
                      <th className="p-3 w-44 text-right">% do Contrato</th>
                      <th className="p-3 w-20 text-center">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-150 font-sans">
                    {activePayments.map((p, idx) => {
                      const associatedContract = getContractForPayment(p);
                      const contractVal = associatedContract?.contractValue || 0;
                      const paymentPercent = contractVal > 0 ? (p.value / contractVal) * 100 : 0;

                      return (
                        <tr key={p.id} className="hover:bg-stone-50/50 align-middle">
                          
                          {/* Index cell */}
                          <td className="p-3 text-center font-mono text-stone-400">
                            {idx + 1}
                          </td>

                          {/* Supplier & scope */}
                          <td className="p-3">
                            <span className="font-bold text-stone-900 block">{p.supplier}</span>
                            {associatedContract && (
                              <span className="text-[10px] text-stone-400 line-clamp-1">Contrato: {associatedContract.scope}</span>
                            )}
                          </td>

                          {/* Description & notes */}
                          <td className="p-3">
                            <span className="font-medium text-stone-850">{p.description}</span>
                            {p.notes && (
                              <span className="text-[10px] text-stone-500 block italic mt-0.5">{p.notes}</span>
                            )}
                          </td>

                          {/* Date */}
                          <td className="p-3 text-center font-mono text-stone-600">
                            {new Date(p.paymentDate + 'T00:00:00').toLocaleDateString('pt-BR')}
                          </td>

                          {/* Payment Value */}
                          <td className="p-3 text-right font-mono font-bold text-stone-900">
                            {formatCurrency(p.value)}
                          </td>

                          {/* Percent relative to Contract */}
                          <td className="p-3 text-right font-mono">
                            {associatedContract ? (
                              <div className="space-y-0.5">
                                <span className="font-bold text-stone-800">{paymentPercent.toFixed(1)}%</span>
                                <span className="text-[9px] text-stone-400 block">de {formatCurrency(contractVal)}</span>
                              </div>
                            ) : (
                              <span className="text-stone-300 italic">Sem contrato</span>
                            )}
                          </td>

                          {/* Actions */}
                          <td className="p-3 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <button
                                onClick={() => handleStartPaymentEdit(p)}
                                className="p-1 text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-all cursor-pointer"
                                title="Editar Lançamento"
                              >
                                <Edit3 size={12} />
                              </button>
                              <button
                                onClick={() => handleDeletePayment(p.id)}
                                className="p-1 text-stone-400 hover:text-red-600 hover:bg-red-50 transition-all cursor-pointer"
                                title="Excluir Lançamento"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </td>

                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

        </div>
      )}

      {/* MODAL 1: ADD / EDIT CONTRACT */}
      {isContractFormOpen && (
        <div className="fixed inset-0 z-50 bg-stone-950/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-stone-200 shadow-xl max-w-md w-full p-6 text-left">
            <div className="flex justify-between items-start border-b border-stone-150 pb-3 mb-4">
              <h4 className="font-serif text-sm font-bold text-stone-900 uppercase">
                {editingContract ? 'Editar Contrato de Mão de Obra' : 'Adicionar Contrato de Mão de Obra'}
              </h4>
              <button 
                onClick={() => setIsContractFormOpen(false)}
                className="text-stone-400 hover:text-stone-600 focus:outline-none cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSaveContract} className="space-y-4 text-xs font-sans">
              
              {contractError && (
                <div className="p-2.5 bg-red-50 border border-red-200 text-red-700 text-[11px] font-sans">
                  {contractError}
                </div>
              )}

              <div className="space-y-1">
                <label className="block font-mono uppercase tracking-wider text-[9px] text-stone-400 font-bold">Fornecedor / Empreiteiro</label>
                <input
                  type="text"
                  placeholder="Nome do fornecedor ou equipe responsável"
                  value={contractForm.supplier}
                  onChange={(e) => setContractForm(prev => ({ ...prev, supplier: e.target.value }))}
                  className="w-full border border-stone-300 p-2 text-xs focus:outline-none focus:border-stone-500 rounded-none"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="block font-mono uppercase tracking-wider text-[9px] text-stone-400 font-bold">Escopo do Serviço / Resumo do Contrato</label>
                <input
                  type="text"
                  placeholder="Ex: Execução de instalações elétricas completas"
                  value={contractForm.scope}
                  onChange={(e) => setContractForm(prev => ({ ...prev, scope: e.target.value }))}
                  className="w-full border border-stone-300 p-2 text-xs focus:outline-none focus:border-stone-500 rounded-none"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="block font-mono uppercase tracking-wider text-[9px] text-stone-400 font-bold">Valor Total do Contrato (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="0,00"
                  value={contractForm.contractValue}
                  onChange={(e) => setContractForm(prev => ({ ...prev, contractValue: e.target.value }))}
                  className="w-full border border-stone-300 p-2 text-xs font-mono focus:outline-none focus:border-stone-500 rounded-none"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="block font-mono uppercase tracking-wider text-[9px] text-stone-400 font-bold">Observações / Condições (Opcional)</label>
                <textarea
                  placeholder="Informações adicionais como forma de pagamento ou prazos..."
                  value={contractForm.notes}
                  onChange={(e) => setContractForm(prev => ({ ...prev, notes: e.target.value }))}
                  rows={2}
                  className="w-full border border-stone-300 p-2 text-xs focus:outline-none focus:border-stone-500 rounded-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-stone-150">
                <button
                  type="button"
                  onClick={() => setIsContractFormOpen(false)}
                  className="border border-stone-300 hover:bg-stone-50 text-stone-700 py-1.5 px-4 font-mono uppercase text-[9px] tracking-wider font-bold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="bg-stone-900 hover:bg-stone-850 text-white py-1.5 px-4 font-mono uppercase text-[9px] tracking-wider font-bold cursor-pointer"
                >
                  Salvar Contrato
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: ADD / EDIT PAYMENT */}
      {isPaymentFormOpen && (
        <div className="fixed inset-0 z-50 bg-stone-950/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-stone-200 shadow-xl max-w-md w-full p-6 text-left">
            <div className="flex justify-between items-start border-b border-stone-150 pb-3 mb-4">
              <h4 className="font-serif text-sm font-bold text-stone-900 uppercase">
                {editingPayment ? 'Editar Programação de Pagamento' : 'Programar Pagamento de Mão de Obra'}
              </h4>
              <button 
                onClick={() => setIsPaymentFormOpen(false)}
                className="text-stone-400 hover:text-stone-600 focus:outline-none cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSavePayment} className="space-y-4 text-xs font-sans">
              
              {paymentError && (
                <div className="p-2.5 bg-red-50 border border-red-200 text-red-700 text-[11px] font-sans">
                  {paymentError}
                </div>
              )}

              <div className="space-y-1">
                <label className="block font-mono uppercase tracking-wider text-[9px] text-stone-400 font-bold">Vincular ao Contrato</label>
                <select
                  value={paymentForm.contractId}
                  onChange={(e) => setPaymentForm(prev => ({ ...prev, contractId: e.target.value }))}
                  className="w-full border border-stone-300 p-2 text-xs focus:outline-none focus:border-stone-500 rounded-none bg-white font-medium"
                  required
                >
                  {activeContracts.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.supplier} ({formatCurrency(c.contractValue)})
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="block font-mono uppercase tracking-wider text-[9px] text-stone-400 font-bold">Descrição da Parcela / Medição</label>
                <input
                  type="text"
                  placeholder="Ex: 1ª Parcela - 20% Sinal ou Medição Fundações"
                  value={paymentForm.description}
                  onChange={(e) => setPaymentForm(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full border border-stone-300 p-2 text-xs focus:outline-none focus:border-stone-500 rounded-none"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block font-mono uppercase tracking-wider text-[9px] text-stone-400 font-bold">Valor Planejado (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0,00"
                    value={paymentForm.value}
                    onChange={(e) => setPaymentForm(prev => ({ ...prev, value: e.target.value }))}
                    className="w-full border border-stone-300 p-2 text-xs font-mono focus:outline-none focus:border-stone-500 rounded-none"
                    required
                  />
                  {/* Real-time percentage indicator if contract is loaded */}
                  {(() => {
                    const selectedContract = contracts.find(c => c.id === paymentForm.contractId);
                    const valNum = parseFloat(paymentForm.value) || 0;
                    if (selectedContract && valNum > 0 && selectedContract.contractValue > 0) {
                      const percent = (valNum / selectedContract.contractValue) * 100;
                      return (
                        <span className="text-[10px] text-emerald-600 block mt-1 font-mono">
                          Representa <strong className="font-bold">{percent.toFixed(1)}%</strong> do contrato.
                        </span>
                      );
                    }
                    return null;
                  })()}
                </div>

                <div className="space-y-1">
                  <label className="block font-mono uppercase tracking-wider text-[9px] text-stone-400 font-bold">Data Planejada</label>
                  <input
                    type="date"
                    value={paymentForm.paymentDate}
                    onChange={(e) => setPaymentForm(prev => ({ ...prev, paymentDate: e.target.value }))}
                    className="w-full border border-stone-300 p-2 text-xs font-mono focus:outline-none focus:border-stone-500 rounded-none"
                    required
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="block font-mono uppercase tracking-wider text-[9px] text-stone-400 font-bold">Observações Internas (Opcional)</label>
                <textarea
                  placeholder="Informações bancárias, observações de liberação ou medições..."
                  value={paymentForm.notes}
                  onChange={(e) => setPaymentForm(prev => ({ ...prev, notes: e.target.value }))}
                  rows={2}
                  className="w-full border border-stone-300 p-2 text-xs focus:outline-none focus:border-stone-500 rounded-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-stone-150">
                <button
                  type="button"
                  onClick={() => setIsPaymentFormOpen(false)}
                  className="border border-stone-300 hover:bg-stone-50 text-stone-700 py-1.5 px-4 font-mono uppercase text-[9px] tracking-wider font-bold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="bg-stone-900 hover:bg-stone-850 text-white py-1.5 px-4 font-mono uppercase text-[9px] tracking-wider font-bold cursor-pointer"
                >
                  Confirmar Programação
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* A4 Portrait Print Preview Modal */}
      {isPrintOpen && (
        <div className="fixed inset-0 z-50 bg-stone-900/80 backdrop-blur-xs overflow-y-auto p-4 md:p-8 flex flex-col items-center justify-start print-root-container print:p-0 print:bg-white print:static print:overflow-visible">
          
          {/* Controls bar */}
          <div className="w-full max-w-[210mm] bg-white border border-stone-200 p-4 mb-4 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-md print:hidden font-sans">
            <div>
              <h4 className="font-serif text-sm font-bold text-stone-900 flex items-center gap-2">
                <Printer size={16} /> Relatório de Pagamentos de Mão de Obra
              </h4>
              <p className="text-[10px] text-stone-500 mt-0.5">
                Formato A4 Retrato oficial com resumo de contratos e cronograma de parcelas.
              </p>
            </div>
            
            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              <button
                type="button"
                onClick={() => setIsPrintOpen(false)}
                className="bg-stone-100 hover:bg-stone-200 text-stone-700 py-1.5 px-4 text-[10px] font-mono uppercase tracking-wider transition-all cursor-pointer border border-stone-250 font-bold font-mono"
              >
                Fechar
              </button>
              
              <button
                type="button"
                onClick={() => window.print()}
                className="bg-stone-900 hover:bg-stone-850 text-white py-1.5 px-5 text-[10px] font-mono uppercase tracking-wider font-bold transition-all cursor-pointer flex items-center gap-1.5 font-mono"
              >
                <Printer size={13} />
                <span>Imprimir / PDF</span>
              </button>
            </div>
          </div>

          {/* Sheet layout */}
          <div 
            id="a4-print-area"
            className="w-full max-w-[210mm] min-h-[297mm] bg-white text-stone-900 p-[15mm] md:p-[20mm] shadow-2xl relative text-left border border-stone-200 flex flex-col justify-between print:shadow-none print:border-none print:p-0 print:m-0 print:w-full print:min-h-0"
            style={{ boxSizing: "border-box" }}
          >
            {/* Embedded styles to clean viewport */}
            <style dangerouslySetInnerHTML={{ __html: `
              @media print {
                body {
                  background: white !important;
                  color: black !important;
                }
                #root > div:not(.print-root-container),
                .fixed:not(.print-root-container),
                header, nav, footer, sidebar, button, .print\\:hidden {
                  display: none !important;
                }
                .print-root-container {
                  position: absolute !important;
                  left: 0 !important;
                  top: 0 !important;
                  width: 100% !important;
                  height: auto !important;
                  padding: 0 !important;
                  margin: 0 !important;
                  background: white !important;
                  overflow: visible !important;
                  z-index: 9999999 !important;
                }
                #a4-print-area {
                  width: 100% !important;
                  max-width: 100% !important;
                  min-height: 0 !important;
                  padding: 0 !important;
                  margin: 0 !important;
                  border: none !important;
                  box-shadow: none !important;
                  background: white !important;
                  color: black !important;
                }
                @page {
                  size: A4 portrait;
                  margin: 15mm;
                }
              }
            `}} />

            {/* Content body */}
            <div className="space-y-6">
              
              {/* Header block */}
              <div className="border-b-2 border-stone-900 pb-4">
                <div className="flex justify-between items-start gap-4">
                  <div>
                    <h1 className="font-serif text-lg font-extrabold uppercase tracking-wide text-stone-950">
                      Chaves Brites Correa Construtora
                    </h1>
                    <p className="text-[9px] font-mono uppercase tracking-widest text-stone-500 mt-0.5">
                      Planejamento, Gestão e Engenharia de Obras
                    </p>
                  </div>
                  <div className="text-right font-mono text-[9px] text-stone-500 space-y-0.5">
                    <div>CHAVES BRITES CORREA CONSTRUTORA LTDA</div>
                    <div>CRONOGRAMA DE PAGAMENTOS DE PRESTADORES</div>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-y-1 items-center justify-between text-[10px] border-t border-stone-200 pt-3 text-stone-800 font-sans">
                  <div>
                    <span className="font-bold">Obra / Projeto:</span> {currentProjectName}
                  </div>
                  <div>
                    <span className="font-bold">Data de Emissão:</span> {new Date().toLocaleDateString('pt-BR')}
                  </div>
                  <div>
                    <span className="font-bold">Status da Obra:</span> PLANEJAMENTO FINANCEIRO
                  </div>
                </div>
              </div>

              {/* Title label */}
              <div className="text-center py-2 bg-stone-50 border-y border-stone-200">
                <h2 className="font-serif text-xs font-bold uppercase tracking-wider text-stone-900">
                  Relatório Oficial - Contratos e Programação de Mão de Obra
                </h2>
              </div>

              {/* Top numerical cards for printing */}
              <div className="grid grid-cols-3 gap-4 bg-stone-50/50 p-3 border border-stone-200 text-xs">
                <div>
                  <span className="block text-[8px] font-mono uppercase text-stone-400 font-bold">Total em Contratos</span>
                  <span className="font-mono font-bold text-stone-900 text-[13px]">{formatCurrency(totalContractsValue)}</span>
                </div>
                <div>
                  <span className="block text-[8px] font-mono uppercase text-stone-400 font-bold">Total Programado Futuro</span>
                  <span className="font-mono font-bold text-stone-950 text-[13px]">{formatCurrency(totalScheduledValue)}</span>
                </div>
                <div>
                  <span className="block text-[8px] font-mono uppercase text-stone-400 font-bold">Proporção Programada</span>
                  <span className="font-mono font-bold text-emerald-800 text-[13px]">{globalProgressPercent.toFixed(1)}%</span>
                </div>
              </div>

              {/* Print Section 1: Contracts */}
              <div className="space-y-2">
                <h3 className="font-serif text-[11px] font-bold uppercase tracking-wider border-b border-stone-300 pb-1 text-stone-850">
                  1. Situação dos Contratos Firmados
                </h3>
                
                {activeContracts.length === 0 ? (
                  <p className="text-[10px] italic text-stone-400">Nenhum contrato ativo cadastrado.</p>
                ) : (
                  <table className="w-full border-collapse text-[9px] border border-stone-200">
                    <thead>
                      <tr className="bg-stone-100 text-[8px] font-mono uppercase text-stone-600 text-left border-b border-stone-200">
                        <th className="p-1.5 border-r border-stone-200">Prestador / Empreiteiro</th>
                        <th className="p-1.5 border-r border-stone-200">Escopo do Serviço</th>
                        <th className="p-1.5 text-right border-r border-stone-200 w-24">Valor Contrato</th>
                        <th className="p-1.5 text-right border-r border-stone-200 w-24">Total Programado</th>
                        <th className="p-1.5 text-right border-r border-stone-200 w-24">A Programar</th>
                        <th className="p-1.5 text-right w-16">Proporção</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-200">
                      {contractSummaries.map(({ contract, totalScheduled, percentOfContract, balanceRemaining }) => (
                        <tr key={contract.id} className="align-top">
                          <td className="p-1.5 font-bold text-stone-950 border-r border-stone-200">{contract.supplier}</td>
                          <td className="p-1.5 text-stone-600 border-r border-stone-200">{contract.scope}</td>
                          <td className="p-1.5 text-right font-mono border-r border-stone-200">{formatCurrency(contract.contractValue)}</td>
                          <td className="p-1.5 text-right font-mono border-r border-stone-200">{formatCurrency(totalScheduled)}</td>
                          <td className="p-1.5 text-right font-mono border-r border-stone-200">{formatCurrency(balanceRemaining)}</td>
                          <td className="p-1.5 text-right font-mono font-bold">{percentOfContract.toFixed(1)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Print Section 2: Payments Schedule */}
              <div className="space-y-2 pt-2">
                <h3 className="font-serif text-[11px] font-bold uppercase tracking-wider border-b border-stone-300 pb-1 text-stone-850">
                  2. Cronograma de Parcelas Planejadas
                </h3>

                {activePayments.length === 0 ? (
                  <p className="text-[10px] italic text-stone-400">Nenhum pagamento planejado.</p>
                ) : (
                  <table className="w-full border-collapse text-[9px] border border-stone-200">
                    <thead>
                      <tr className="bg-stone-100 text-[8px] font-mono uppercase text-stone-600 text-left border-b border-stone-200">
                        <th className="p-1.5 text-center border-r border-stone-200 w-8">#</th>
                        <th className="p-1.5 border-r border-stone-200">Fornecedor</th>
                        <th className="p-1.5 border-r border-stone-200">Descrição da Parcela</th>
                        <th className="p-1.5 text-center border-r border-stone-200 w-20">Data Prevista</th>
                        <th className="p-1.5 text-right border-r border-stone-200 w-24">Valor da Parcela</th>
                        <th className="p-1.5 text-right w-16">% Contrato</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-200">
                      {activePayments.map((p, idx) => {
                        const contract = getContractForPayment(p);
                        const percent = contract && contract.contractValue > 0 ? (p.value / contract.contractValue) * 100 : 0;
                        return (
                          <tr key={p.id} className="align-middle">
                            <td className="p-1.5 text-center border-r border-stone-200 font-mono text-stone-500">
                              {idx + 1}
                            </td>
                            <td className="p-1.5 border-r border-stone-200 font-medium">{p.supplier}</td>
                            <td className="p-1.5 border-r border-stone-200">{p.description}</td>
                            <td className="p-1.5 text-center border-r border-stone-200 font-mono">{new Date(p.paymentDate + 'T00:00:00').toLocaleDateString('pt-BR')}</td>
                            <td className="p-1.5 text-right font-mono font-bold border-r border-stone-200">{formatCurrency(p.value)}</td>
                            <td className="p-1.5 text-right font-mono">{contract ? `${percent.toFixed(1)}%` : '-'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>

            </div>

            {/* Signature fields and footers */}
            <div className="pt-12 space-y-8 mt-12">
              <div className="grid grid-cols-2 gap-8 text-[9px] font-sans text-center">
                <div className="space-y-1">
                  <div className="border-t border-stone-400 pt-1.5 w-48 mx-auto text-stone-700">
                    Engenharia e Planejamento
                  </div>
                  <div className="text-stone-400 text-[8px] font-mono">Chaves Brites Correa Construtora</div>
                </div>
                <div className="space-y-1">
                  <div className="border-t border-stone-400 pt-1.5 w-48 mx-auto text-stone-700">
                    Diretoria / Financeiro
                  </div>
                  <div className="text-stone-400 text-[8px] font-mono">Chaves Brites Correa Construtora</div>
                </div>
              </div>

              <div className="border-t border-stone-200 pt-3 flex justify-between items-center text-[8px] font-mono text-stone-400">
                <div>Chaves Brites Correa Construtora • Gestão Físico-Financeira de Obras de Alto Padrão</div>
                <div>Página 1 de 1</div>
              </div>
            </div>

          </div>

        </div>
      )}

    </div>
  );
};
