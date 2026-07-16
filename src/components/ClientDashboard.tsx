import React, { useState, useMemo, useEffect } from 'react';
import { Project, Transaction, Client, TransactionCategory, ProjectDocument, DocumentClass } from '../types';
import { 
  LogOut, 
  Search, 
  Filter, 
  DollarSign, 
  TrendingUp, 
  Activity, 
  MapPin, 
  Layers, 
  Calendar, 
  FileText, 
  CheckCircle2, 
  Clock, 
  ArrowUpRight,
  Info,
  Camera,
  ExternalLink,
  Download,
  Eye
} from 'lucide-react';
import { motion } from 'motion/react';
import AcompanhamentoFisico from './AcompanhamentoFisico';
import QuotationMaps from './QuotationMaps';
import { subscribeCollection } from '../lib/firebaseDb';


interface ClientDashboardProps {
  client: Client;
  projects: Project[];
  transactions: Transaction[];
  documents: ProjectDocument[];
  onLogout: () => void;
  onAddTransaction: (tx: Transaction) => void;
}

export default function ClientDashboard({ client, projects, transactions, documents, onLogout, onAddTransaction }: ClientDashboardProps) {
  // Find projects belonging to this client
  const clientProjects = useMemo(() => {
    return projects.filter(p => p.clientId === client.id);
  }, [projects, client.id]);

  // Selected project state
  const [selectedProjectId, setSelectedProjectId] = useState<string>(() => {
    return clientProjects.length > 0 ? clientProjects[0].id : '';
  });

  // Active Document class tab (Administrativo, Planejamento, Acompanhamento)
  const [activeDocClassTab, setActiveDocClassTab] = useState<DocumentClass>('administrativo');

  // Synchronize selectedProjectId when clientProjects load or update from Firestore
  useEffect(() => {
    if (clientProjects.length > 0) {
      const validProjectIds = clientProjects.map(p => p.id);
      if (!selectedProjectId || !validProjectIds.includes(selectedProjectId)) {
        setSelectedProjectId(clientProjects[0].id);
      }
    }
  }, [clientProjects, selectedProjectId]);

  const selectedProject = useMemo(() => {
    return clientProjects.find(p => p.id === selectedProjectId) || null;
  }, [clientProjects, selectedProjectId]);

  // Filter & Search states for transactions
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  
  // Selected transaction for detail popover
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);

  // Document preview states for client portal
  const [previewDoc, setPreviewDoc] = useState<any | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (previewDoc) {
      if (previewDoc.fileUrl) {
        setPreviewUrl(previewDoc.fileUrl);
      } else {
        setPreviewUrl(null);
      }
    } else {
      setPreviewUrl(null);
    }
  }, [previewDoc]);

  // Read shared database structures from Firestore for real-time synchronization with the Admin Team
  const [dailyLogs, setDailyLogs] = useState<any[]>([]);
  const [timelinePhases, setTimelinePhases] = useState<any[]>([]);
  const [punchLists, setPunchLists] = useState<any[]>([]);
  const [physicalWeeklyLogs, setPhysicalWeeklyLogs] = useState<any[]>([]);
  const [regulatorySteps, setRegulatorySteps] = useState<any[]>([]);

  useEffect(() => {
    const INITIAL_DAILY_LOGS = [
      { id: 'log-1', projectId: 'project-1', date: '2026-06-15', weather: 'Ensolarado', workforce: 8, description: 'Início da colocação de drywall nos consultórios 1 e 2. Instalação hidráulica concluída sem vazamentos.', loggedBy: 'Eng. Chaves' },
      { id: 'log-2', projectId: 'project-1', date: '2026-06-16', workforce: 6, weather: 'Chuvoso', description: 'Trabalhos internos de fiação e cabeamento de rede. Entrega do porcelanato técnico retificado com sucesso.', loggedBy: 'Arq. Brites' },
      { id: 'log-3', projectId: 'project-2', date: '2026-06-10', workforce: 12, weather: 'Nublado', description: 'Montagem mecânica das primeiras vigas de madeira MLC estrutural concluída. Teste de prumo das bases aprovado.', loggedBy: 'Eng. Correa' }
    ];

    const INITIAL_TIMELINE_PHASES = [
      { id: 'phase-1-1', projectId: 'project-1', name: 'Demolição & Limpeza', startDate: '2026-02-20', endDate: '2026-03-05', progress: 100, costPrev: 10000, costReal: 9500 },
      { id: 'phase-1-2', projectId: 'project-1', name: 'Infraestrutura Hidráulica', startDate: '2026-03-06', endDate: '2026-03-25', progress: 100, costPrev: 15000, costReal: 16200 },
      { id: 'phase-1-3', projectId: 'project-1', name: 'Elétrica & Drywall', startDate: '2026-03-26', endDate: '2026-04-20', progress: 85, costPrev: 28000, costReal: 24000 },
      { id: 'phase-1-4', projectId: 'project-1', name: 'Acabamentos & Pintura', startDate: '2026-04-21', endDate: '2026-05-15', progress: 20, costPrev: 35000, costReal: 5000 },
      { id: 'phase-2-1', projectId: 'project-2', name: 'Terraplenagem & Fundação', startDate: '2026-03-20', endDate: '2026-04-30', progress: 100, costPrev: 120000, costReal: 118000 },
      { id: 'phase-2-2', projectId: 'project-2', name: 'Montagem Estrutural MLC', startDate: '2026-05-01', endDate: '2026-06-15', progress: 90, costPrev: 220000, costReal: 222000 },
      { id: 'phase-2-3', projectId: 'project-2', name: 'Alvenarias & Cobertura', startDate: '2026-06-16', endDate: '2026-08-30', progress: 15, costPrev: 450000, costReal: 42000 }
    ];

    const INITIAL_PUNCH_LISTS = [
      { id: 'p-1', projectId: 'project-1', task: 'Ajuste de rejunte no consultório 1', priority: 'Baixa', checked: false },
      { id: 'p-2', projectId: 'project-1', task: 'Fixação de espelhos de tomadas recepção', priority: 'Baixa', checked: true },
      { id: 'p-3', projectId: 'project-1', task: 'Revisar tubulação de vácuo especial bomba 2', priority: 'Alta', checked: false },
      { id: 'p-4', projectId: 'project-2', task: 'Lixamento de manchas de cimento em viga MLC norte', priority: 'Média', checked: false },
      { id: 'p-5', projectId: 'project-2', task: 'Impermeabilização extra das sapatas inferiores', priority: 'Alta', checked: true }
    ];

    const INITIAL_REGULATORY_STEPS = [
      { id: 'reg-1-1', projectId: 'project-1', name: 'Alvará de Reforma Municipal', status: 'Emitido', date: '2026-02-18', notes: 'Alvará nº 2026/88 deferido sem exigências.' },
      { id: 'reg-1-2', projectId: 'project-1', name: 'Registro de Responsabilidade RRT', status: 'Emitido', date: '2026-02-20', notes: 'Registrado sob nº CAU-223190.' },
      { id: 'reg-1-3', projectId: 'project-1', name: 'Vistoria Parcial de Bombeiros', status: 'Sob Análise', date: '', notes: 'Protocolado junto ao Corpo de Bombeiros.' },
      { id: 'reg-2-1', projectId: 'project-2', name: 'Licença Ambiental Prévia (LP)', status: 'Emitido', date: '2026-01-10', notes: 'Licença concedida pela CETESB conforme relatório.' },
      { id: 'reg-2-2', projectId: 'project-2', name: 'Alvará de Construção Civil', status: 'Emitido', date: '2026-03-12', notes: 'Alvará de obra nova emitido sob protocolo municipal.' }
    ];

    const unsubDailyLogs = subscribeCollection('daily_logs', setDailyLogs, INITIAL_DAILY_LOGS, 'cbc_daily_logs_v2');
    const unsubTimeline = subscribeCollection('timeline_phases', setTimelinePhases, INITIAL_TIMELINE_PHASES, 'cbc_timeline_phases_v2');
    const unsubPunch = subscribeCollection('punch_lists', setPunchLists, INITIAL_PUNCH_LISTS, 'cbc_punch_lists_v2');
    const unsubWeekly = subscribeCollection('weekly_logs', setPhysicalWeeklyLogs, [], 'cbc_physical_weekly_logs_v2');
    const unsubReg = subscribeCollection('regulatory_steps', setRegulatorySteps, INITIAL_REGULATORY_STEPS, 'cbc_regulatory_steps_v2');

    return () => {
      unsubDailyLogs();
      unsubTimeline();
      unsubPunch();
      unsubWeekly();
      unsubReg();
    };
  }, []);

  const [contractForm, setContractForm] = useState({
    object: 'Execução integral de obra de engenharia/arquitetura conforme detalhado no memorial descritivo homologado.',
    paymentTerms: 'Entrada de 30% na assinatura do contrato, 40% divididos em parcelas mensais medidas por medição física, e 30% na entrega das chaves.',
    penalties: 'Multa de 2% por atraso injustificado, rescisão imediata em caso de descumprimento das normas técnicas da ABNT.',
    isGenerated: true,
    isSigned: true
  });

  const [bufferSlider] = useState<number>(15);

  const hasContract = useMemo(() => {
    if (!selectedProjectId) return true;
    return documents.some(d => 
      d.projectId === selectedProjectId && 
      d.class === 'administrativo' && 
      (d.category === 'contrato' || d.name.toLowerCase().includes('contrato'))
    );
  }, [documents, selectedProjectId]);

  // Get transactions for selected project
  const projectTransactions = useMemo(() => {
    if (!selectedProjectId) return [];
    return transactions
      .filter(t => t.projectId === selectedProjectId)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [transactions, selectedProjectId]);

  // Financial summary
  const summary = useMemo(() => {
    if (!selectedProject) return { total: 0, paid: 0, pending: 0, percentSpent: 0, remaining: 0 };
    
    const total = projectTransactions.reduce((acc, t) => acc + t.value, 0);
    const paid = projectTransactions.filter(t => t.status === 'pago').reduce((acc, t) => acc + t.value, 0);
    const pending = projectTransactions.filter(t => t.status === 'pendente').reduce((acc, t) => acc + t.value, 0);
    const percentSpent = selectedProject.budget > 0 ? (total / selectedProject.budget) * 100 : 0;
    const remaining = selectedProject.budget - total;

    return { total, paid, pending, percentSpent, remaining };
  }, [selectedProject, projectTransactions]);

  // Spending by category
  const categoryTotals = useMemo(() => {
    const totals: Record<TransactionCategory, number> = {
      materiais: 0,
      mao_de_obra: 0,
      projetos_complementares: 0,
      taxas: 0,
      decoracao: 0,
      outros: 0
    };

    projectTransactions.forEach(t => {
      if (totals[t.category] !== undefined) {
        totals[t.category] += t.value;
      }
    });

    return totals;
  }, [projectTransactions]);

  // Filtered transactions
  const filteredTransactions = useMemo(() => {
    return projectTransactions.filter(t => {
      const matchesSearch = 
        t.description.toLowerCase().includes(searchTerm.toLowerCase()) || 
        t.supplier.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesCategory = categoryFilter === 'all' || t.category === categoryFilter;
      const matchesStatus = statusFilter === 'all' || t.status === statusFilter;

      return matchesSearch && matchesCategory && matchesStatus;
    });
  }, [projectTransactions, searchTerm, categoryFilter, statusFilter]);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };

  const getCategoryLabel = (cat: TransactionCategory) => {
    const labels: Record<TransactionCategory, string> = {
      materiais: 'Materiais de Construção',
      mao_de_obra: 'Mão de Obra e Serviços',
      projetos_complementares: 'Projetos Complementares',
      taxas: 'Taxas e Licenças',
      decoracao: 'Decoração e Acabamentos',
      outros: 'Outros Custos / Diversos'
    };
    return labels[cat];
  };

  const getCategoryColor = (cat: TransactionCategory) => {
    const colors: Record<TransactionCategory, string> = {
      materiais: '#B5A893', // Warm Taupe
      mao_de_obra: '#6B7A6C', // Sage Green
      projetos_complementares: '#4D5E6F', // Steel Blue
      taxas: '#9F7C56', // Bronze
      decoracao: '#C08A7C', // Terracotta
      outros: '#787873' // Stone Grey
    };
    return colors[cat];
  };

  const getStatusBadge = (status: 'pago' | 'pendente' | 'reembolsado') => {
    switch (status) {
      case 'pago':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-mono uppercase bg-emerald-50 text-emerald-800 border border-emerald-200">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
            Quitado
          </span>
        );
      case 'pendente':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-mono uppercase bg-amber-50 text-amber-800 border border-amber-200">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
            A pagar
          </span>
        );
      case 'reembolsado':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-mono uppercase bg-blue-50 text-blue-800 border border-blue-200">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
            Reembolsado
          </span>
        );
    }
  };

  const handleDownloadDoc = (doc: any) => {
    if (doc.fileUrl) {
      const a = document.createElement('a');
      a.href = doc.fileUrl;
      a.download = doc.fileName || doc.name;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      return;
    }

    // Dynamic generation of text/PDF mock document
    let content = `==================================================\n`;
    content += `         SISTEMA CHAVES BRITES CORREA - ARQUIVO OFICIAL\n`;
    content += `==================================================\n\n`;
    content += `Nome do Documento: ${doc.name}\n`;
    content += `ID: ${doc.id}\n`;
    content += `Projeto ID: ${doc.projectId}\n`;
    content += `Descrição: ${doc.description || 'Nenhuma'}\n`;
    content += `Enviado em: ${doc.uploadedAt}\n`;
    content += `Classe: ${doc.class}\n`;
    content += `Assinado por: Diretoria de Obras CBC\n\n`;
    content += `Este documento foi autenticado em ambiente de nuvem\ne sua via original está registrada para auditoria técnica.\n`;

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${doc.name}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-[#F4F6FA] text-[#0F172A] font-sans selection:bg-[#FF5A35]/15 relative overflow-hidden theme-light">
      <div className="grid-bg"></div>
      
      {/* Ambient backgrounds */}
      <div className="bg-glow-orange top-[-100px] left-[-50px] opacity-20"></div>
      <div className="bg-glow-purple bottom-[150px] right-[50px] opacity-15"></div>

      {/* Header Branding */}
      <header className="sticky top-0 z-40 bg-[#090D16]/90 border-b border-white/5 backdrop-blur-md px-6 py-4 relative z-10">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#FF5A35] to-[#7C3AED] text-white flex items-center justify-center font-bold text-xs shadow-lg shadow-[#FF5A35]/20">
                CBC
              </div>
              <div>
                <h1 className="font-sans font-bold text-sm tracking-[0.12em] uppercase text-white leading-tight">
                  CHAVES BRITES CORREA
                </h1>
                <p className="font-sans text-[8px] tracking-[0.2em] uppercase text-slate-400 mt-0.5">
                  ARQUITETURA &amp; ENGENHARIA
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between md:justify-end gap-6 border-t md:border-t-0 pt-3 md:pt-0 border-white/5">
            <div className="text-left md:text-right">
              <p className="text-[8px] font-mono text-slate-500 uppercase tracking-widest">Acesso do Cliente</p>
              <p className="text-xs font-bold text-white">{client.name}</p>
            </div>
            <button 
              id="logout_btn"
              onClick={onLogout}
              className="flex items-center gap-2 border border-white/10 px-3.5 py-1.5 rounded-xl text-xs font-mono uppercase tracking-wider text-slate-300 hover:text-white hover:border-white/30 hover:bg-white/5 transition-all cursor-pointer"
            >
              <LogOut size={13} className="text-[#FF5A35]" />
              Sair
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto px-6 py-8 relative z-10">
        
        {/* Project Selection Tabs */}
        {clientProjects.length > 1 && (
          <div className="mb-8 border-b border-white/5 pb-4">
            <span className="text-[8px] font-mono uppercase tracking-widest text-slate-500 block mb-3 px-1">Selecione o Centro de Custo / Obra</span>
            <div className="flex flex-wrap gap-2">
              {clientProjects.map(p => (
                <button
                  key={p.id}
                  id={`project_tab_${p.id}`}
                  onClick={() => {
                    setSelectedProjectId(p.id);
                    setSearchTerm('');
                    setCategoryFilter('all');
                    setStatusFilter('all');
                  }}
                  className={`px-4 py-2.5 text-xs font-mono uppercase tracking-wider transition-all rounded-xl border ${
                    selectedProjectId === p.id 
                      ? 'bg-gradient-to-r from-[#FF5A35] to-[#E04824] text-white border-none shadow-lg shadow-[#FF5A35]/15 font-semibold' 
                      : 'bg-white/5 text-slate-400 border-white/5 hover:border-white/20 hover:text-white'
                  }`}
                >
                  {p.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* If no projects exist */}
        {clientProjects.length === 0 ? (
          <div className="bg-white/5 border border-white/10 p-12 text-center my-12 rounded-2xl">
            <h3 className="text-lg font-bold text-white">Nenhum Centro de Custo Disponível</h3>
            <p className="text-xs text-slate-400 mt-2">Seu cadastro está ativo, porém o time técnico ainda não liberou obras ou projetos vinculados.</p>
            <p className="text-xs text-[#FF5A35] mt-1 font-mono uppercase text-[10px] tracking-wider">Entre em contato com o escritório para vincular seus custos.</p>
          </div>
        ) : !selectedProject ? (
          <div className="text-center p-12 text-slate-400 font-mono text-xs">Carregando dados...</div>
        ) : (
          <div className="space-y-8">
            
            {/* Project Overview Card */}
            <div className="bg-white border border-stone-200 p-6 md:p-8 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-24 h-24 pointer-events-none opacity-[0.03] bg-[radial-gradient(#000_1px,transparent_1px)] bg-[size:10px_10px]"></div>
              
              <div className="flex flex-col lg:flex-row justify-between items-start gap-6">
                <div className="space-y-4 max-w-2xl">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="inline-flex px-2 py-0.5 text-[9px] font-mono uppercase bg-stone-100 text-stone-700 border border-stone-300">
                      {selectedProject.type === 'obra' ? 'Execução de Obra' : 'Desenvolvimento de Projeto'}
                    </span>
                    <span className={`inline-flex px-2 py-0.5 text-[9px] font-mono uppercase ${
                      selectedProject.status === 'execucao' ? 'bg-[#EBF7EE] text-[#245D3B]' :
                      selectedProject.status === 'concluido' ? 'bg-[#EEF2F6] text-[#204060]' :
                      'bg-stone-100 text-stone-600'
                    } border border-current/25`}>
                      {selectedProject.status === 'planejamento' ? 'Planejamento' :
                       selectedProject.status === 'execucao' ? 'Em Andamento' :
                       selectedProject.status === 'concluido' ? 'Concluído' : 'Suspenso'}
                    </span>
                  </div>

                  <h2 className="font-serif text-xl md:text-2xl text-stone-900 leading-tight">{selectedProject.name}</h2>
                  <p className="text-xs text-stone-600 leading-relaxed font-sans">{selectedProject.description}</p>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-4 border-t border-stone-100">
                    <div className="flex items-center gap-2.5 text-stone-600">
                      <MapPin size={14} className="text-stone-400 flex-shrink-0" />
                      <div className="text-xs">
                        <p className="text-[9px] font-mono text-stone-400 uppercase tracking-wider">Localização</p>
                        <p className="truncate max-w-[200px]" title={selectedProject.location}>{selectedProject.location}</p>
                      </div>
                    </div>
                    {selectedProject.area && (
                      <div className="flex items-center gap-2.5 text-stone-600">
                        <Layers size={14} className="text-stone-400 flex-shrink-0" />
                        <div className="text-xs">
                          <p className="text-[9px] font-mono text-stone-400 uppercase tracking-wider">Área Construída</p>
                          <p>{selectedProject.area} m²</p>
                        </div>
                      </div>
                    )}
                    <div className="flex items-center gap-2.5 text-stone-600">
                      <Calendar size={14} className="text-stone-400 flex-shrink-0" />
                      <div className="text-xs">
                        <p className="text-[9px] font-mono text-stone-400 uppercase tracking-wider">Iniciada em</p>
                        <p>{new Date(selectedProject.startDate).toLocaleDateString('pt-BR')}</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Circular ring percent for execution */}
                <div className="flex items-center gap-4 bg-[#FBFBFA] border border-stone-100 p-4 w-full lg:w-auto">
                  <div className="relative w-20 h-20 flex-shrink-0">
                    <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                      <path
                        className="text-stone-200"
                        strokeWidth="2.5"
                        stroke="currentColor"
                        fill="none"
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      />
                      <path
                        className="text-stone-700 transition-all duration-1000"
                        strokeWidth="2.5"
                        strokeDasharray={`${Math.min(100, summary.percentSpent)}, 100`}
                        strokeLinecap="round"
                        stroke="currentColor"
                        fill="none"
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-sm font-semibold text-stone-800">{summary.percentSpent.toFixed(1)}%</span>
                      <span className="text-[7px] font-mono text-stone-400 uppercase">utilizado</span>
                    </div>
                  </div>
                  <div>
                    <span className="text-[10px] font-mono text-stone-400 uppercase tracking-widest block">Consumo Financeiro</span>
                    <h4 className="text-sm font-semibold text-stone-800 mt-1">Investido vs. Previsto</h4>
                    <p className="text-xs text-stone-500 mt-0.5">Sua obra gastou {summary.percentSpent.toFixed(1)}% do orçamento total aprovado de {formatCurrency(selectedProject.budget)}.</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Avisos e Notificações do Centro de Custo */}
            <div className="bg-white border border-stone-200 p-5 space-y-3">
              <h3 className="font-serif text-sm font-bold text-stone-900 flex items-center gap-1.5">
                <span className={`inline-block w-2 h-2 rounded-full ${!hasContract ? 'bg-red-500 animate-pulse' : 'bg-emerald-500'}`}></span>
                Avisos e Notificações do Canteiro
              </h3>
              {!hasContract ? (
                <div className="bg-amber-50/50 border border-amber-200 p-4 flex items-start gap-3">
                  <span className="inline-flex items-center justify-center p-1.5 bg-amber-100 text-amber-800 rounded-none flex-shrink-0 mt-0.5 text-xs font-bold">
                    ⚠️
                  </span>
                  <div>
                    <p className="text-xs font-bold text-amber-950">Documento Mínimo Obrigatório Pendente: Contrato Técnico de Prestação de Serviços</p>
                    <p className="text-[11px] text-stone-600 mt-0.5 leading-relaxed">
                      Identificamos que o contrato assinado ou a minuta regulamentar desta obra/projeto ainda não foi vinculada ao sistema. 
                      Enquanto essa pendência persistir, seu centro de custo exibirá status de pendência documental. Entre em contato com a equipe de arquitetura ou aguarde o anexo pelo time administrativo da Chaves Brites Correa para regularização.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="text-[11px] text-[#245D3B] bg-emerald-50/50 border border-emerald-200 p-3 flex items-center gap-2">
                  <span className="inline-flex items-center justify-center p-1 bg-emerald-100 text-emerald-800 rounded-none text-xs">
                    ✓
                  </span>
                  <span><strong>Todas as obrigações administrativas estão em dia!</strong> O contrato técnico obrigatório foi anexado e está homologado na pasta administrativa.</span>
                </div>
              )}
            </div>

            {/* Top-level Navigation: Administrativo / Planejamento / Acompanhamento */}
            <div className="flex border-b border-stone-200 gap-1 pb-px overflow-x-auto">
              {(['administrativo', 'planejamento', 'acompanhamento'] as DocumentClass[]).map(dcClass => {
                const count = documents.filter(d => d.projectId === selectedProjectId && d.class === dcClass).length;
                return (
                  <button
                    key={dcClass}
                    type="button"
                    onClick={() => setActiveDocClassTab(dcClass)}
                    className={`px-6 py-3 text-xs font-mono uppercase tracking-wider transition-all border-b-2 -mb-px cursor-pointer flex items-center gap-2 ${
                      activeDocClassTab === dcClass
                        ? 'border-[#1E1E1E] text-[#1E1E1E] font-bold'
                        : 'border-transparent text-stone-400 hover:text-stone-700'
                    }`}
                  >
                    {dcClass === 'administrativo' ? (
                      <>
                        <FileText size={13} />
                        <span>📄 Administrativo</span>
                      </>
                    ) : dcClass === 'planejamento' ? (
                      <>
                        <Clock size={13} />
                        <span>📋 Planejamento</span>
                      </>
                    ) : (
                      <>
                        <Activity size={13} />
                        <span>📈 Acompanhamento</span>
                      </>
                    )}
                    <span className="text-[10px] opacity-60 font-mono">({count})</span>
                  </button>
                );
              })}
            </div>

            <div className="space-y-6 pt-4">

                {/* Sub Tab: ADMINISTRATIVO */}
                {activeDocClassTab === 'administrativo' && (
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    
                    {/* Tool 1: Contract View */}
                    <div className="bg-white border border-stone-200 p-6 space-y-4">
                      <div className="border-b border-stone-100 pb-2.5">
                        <h3 className="font-serif text-sm text-stone-950 font-bold flex items-center gap-1.5">
                          <FileText size={15} className="text-stone-600" />
                          Contrato Digital do Projeto
                        </h3>
                        <p className="text-[11px] text-stone-500 mt-0.5">Consulte a via homologada de prestação de serviços técnicos.</p>
                      </div>

                      <div className="border border-stone-200 p-4 bg-[#FCFBF9] space-y-3 font-serif relative overflow-hidden text-[10px] text-stone-800 shadow-inner">
                        {/* Watermark */}
                        <div className="absolute inset-0 flex items-center justify-center opacity-[0.03] pointer-events-none select-none">
                          <span className="font-sans font-black text-6xl tracking-widest text-stone-900 rotate-12">CBC</span>
                        </div>

                        <div className="text-center border-b border-stone-200 pb-2">
                          <span className="font-sans text-[8px] font-bold tracking-widest text-stone-500 block">CHAVES BRITES CORREA</span>
                          <span className="text-[10px] font-bold">MINUTA DE CONTRATO PRESTAÇÃO DE SERVIÇOS</span>
                        </div>

                        <p className="leading-relaxed text-[9.5px]">
                          <strong>CONTRATANTE:</strong> Proprietário associado à obra <strong>{selectedProject.name}</strong>.<br />
                          <strong>CONTRATADA:</strong> Chaves Brites Correa Arquitetura e Engenharia.
                        </p>

                        <p className="leading-relaxed text-[9.5px]">
                          <strong>CLÁUSULA 1ª:</strong> {contractForm.object}
                        </p>

                        <p className="leading-relaxed text-[9.5px]">
                          <strong>CLÁUSULA 2ª (ORÇAMENTO):</strong> Valor global estimado de <strong>{formatCurrency(selectedProject.budget)}</strong> em conformidade com as seguintes condições: <em>{contractForm.paymentTerms}</em>.
                        </p>

                        <p className="leading-relaxed text-[9.5px]">
                          <strong>CLÁUSULA 3ª:</strong> {contractForm.penalties}
                        </p>

                        <div className="mt-2 border border-emerald-500 bg-emerald-50/50 p-2 text-center text-emerald-800 font-sans">
                          <div className="text-[9px] font-bold tracking-widest uppercase text-emerald-700">✓ ASSINADO DIGITALMENTE</div>
                          <p className="text-[7px] mt-0.5 text-emerald-600 font-mono">HASH: SHA256.{selectedProjectId}.CBC.AUTENTICADO</p>
                        </div>

                        <div className="pt-2 flex justify-end gap-1.5 font-sans">
                          <button
                            type="button"
                            onClick={() => alert('Download do contrato em PDF simulado com sucesso.')}
                            className="bg-stone-100 hover:bg-stone-200 border border-stone-300 text-stone-700 px-2 py-1 text-[8px] font-mono uppercase flex items-center gap-1 cursor-pointer"
                          >
                            Download
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Tool 2: Licenses */}
                    <div className="bg-white border border-stone-200 p-6 space-y-4">
                      <div className="border-b border-stone-100 pb-2.5">
                        <h3 className="font-serif text-sm text-stone-950 font-bold flex items-center gap-1.5">
                          <CheckCircle2 size={15} className="text-stone-600" />
                          Licenciamentos e Registros Técnicos
                        </h3>
                        <p className="text-[11px] text-stone-500 mt-0.5">Acompanhe a liberação das ARTs, RRTs e alvarás municipais da obra.</p>
                      </div>

                      <div className="space-y-3">
                        {regulatorySteps.filter(s => s.projectId === selectedProjectId).length === 0 ? (
                          <div className="text-center py-8 text-stone-400 text-xs italic">
                            Nenhum licenciamento registrado para esta obra.
                          </div>
                        ) : (
                          regulatorySteps.filter(s => s.projectId === selectedProjectId).map(step => (
                            <div key={step.id} className="bg-stone-50 border border-stone-150 p-3 space-y-1.5">
                              <div className="flex justify-between items-center">
                                <h4 className="font-sans font-bold text-xs text-stone-900">{step.name}</h4>
                                <span className={`text-[8px] font-mono uppercase tracking-wider py-0.5 px-1.5 border ${
                                  step.status === 'Emitido'
                                    ? 'bg-emerald-50 text-emerald-800 border-emerald-300 font-bold'
                                    : step.status === 'Sob Análise'
                                      ? 'bg-amber-50 text-amber-800 border-amber-300 font-bold'
                                      : 'bg-stone-100 text-stone-500 border-stone-300'
                                }`}>
                                  {step.status}
                                </span>
                              </div>
                              <p className="text-[10px] text-stone-600 italic">"{step.notes || 'Sem observações.'}"</p>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    {/* Tool 3: Admin Files */}
                    <div className="bg-white border border-stone-200 p-6 space-y-4">
                      <div className="border-b border-stone-100 pb-2.5">
                        <h3 className="font-serif text-sm text-stone-950 font-bold flex items-center gap-1.5">
                          <Layers size={15} className="text-stone-600" />
                          Repositório Administrativo
                        </h3>
                        <p className="text-[11px] text-stone-500 mt-0.5">Acesse notas fiscais, taxas pagas e recibos emitidos pelo escritório.</p>
                      </div>

                      <div className="space-y-2">
                        {documents.filter(d => d.projectId === selectedProjectId && d.class === 'administrativo').length === 0 ? (
                          <div className="text-center py-10 border border-dashed border-stone-200 text-stone-400 text-xs">
                            Nenhum arquivo administrativo publicado.
                          </div>
                        ) : (
                          documents.filter(d => d.projectId === selectedProjectId && d.class === 'administrativo').map(doc => (
                            <div key={doc.id} className="bg-stone-50 border border-stone-200 p-3 space-y-2">
                              <div className="flex items-center justify-between gap-1">
                                <h4 className="font-sans font-bold text-xs text-stone-900">{doc.name}</h4>
                                <span className="text-[8.5px] font-mono text-stone-400">{doc.uploadedAt}</span>
                              </div>
                              <p className="text-[10px] text-stone-500 leading-normal">{doc.description}</p>
                              {doc.fileName && (
                                <div className="bg-white border border-stone-100 p-1.5 flex items-center justify-between font-mono text-[9px] text-stone-600">
                                  <span className="truncate max-w-[150px]">{doc.fileName}</span>
                                  <button 
                                    type="button"
                                    onClick={() => setPreviewDoc(doc)} 
                                    className="text-stone-900 underline hover:text-stone-700 font-bold cursor-pointer bg-transparent border-0 p-0 font-sans"
                                  >
                                    Visualizar
                                  </button>
                                </div>
                              )}
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                  </div>
                )}

                {/* Sub Tab: PLANEJAMENTO */}
                {activeDocClassTab === 'planejamento' && (
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    
                    {/* Tool 1: Gantt Schedule view */}
                    <div className="bg-white border border-stone-200 p-6 lg:col-span-2 space-y-5">
                      <div className="border-b border-stone-100 pb-2.5">
                        <h3 className="font-serif text-sm text-stone-950 font-bold flex items-center gap-1.5">
                          <Clock size={15} className="text-stone-600" />
                          Acompanhamento do Cronograma (Gantt de Etapas)
                        </h3>
                        <p className="text-[11px] text-stone-500 mt-0.5">Visualize a evolução das etapas físicas e financeiras da sua obra.</p>
                      </div>

                      <div className="space-y-4">
                        {timelinePhases.filter(ph => ph.projectId === selectedProjectId).length === 0 ? (
                          <div className="text-center py-8 text-stone-400 text-xs italic">
                            Nenhuma etapa planejada cadastrada para esta obra.
                          </div>
                        ) : (
                          timelinePhases.filter(ph => ph.projectId === selectedProjectId).map(phase => {
                            const isOver = phase.costReal > phase.costPrev;
                            return (
                              <div key={phase.id} className="bg-stone-50 border border-stone-200 p-4 space-y-2.5">
                                <div className="flex justify-between items-center text-xs">
                                  <div>
                                    <h4 className="font-sans font-bold text-stone-900">{phase.name}</h4>
                                    <span className="text-[9px] font-mono text-stone-400">Duração planejada: {phase.startDate} a {phase.endDate}</span>
                                  </div>
                                  <span className="bg-stone-200 text-stone-800 font-mono text-[10px] font-bold px-1.5 py-0.5">{phase.progress}% Concluído</span>
                                </div>

                                <div className="w-full bg-stone-200 h-1.5 rounded-full overflow-hidden">
                                  <div 
                                    className="bg-stone-700 h-full transition-all duration-500"
                                    style={{ width: `${phase.progress}%` }}
                                  />
                                </div>

                                <div className="grid grid-cols-2 gap-4 text-[10px] font-mono pt-1">
                                  <div>
                                    <span className="text-stone-400 block text-[8px] uppercase">Custo Estimado</span>
                                    <span className="text-stone-800 font-bold">{formatCurrency(phase.costPrev)}</span>
                                  </div>
                                  <div>
                                    <span className="text-stone-400 block text-[8px] uppercase">Custo Realizado Atual</span>
                                    <span className={`font-bold ${isOver ? 'text-red-700' : 'text-stone-800'}`}>
                                      {formatCurrency(phase.costReal)}
                                      {isOver && ' ⚠️ Excesso'}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>

                    {/* Tool 2: Contingency gauge & files */}
                    <div className="space-y-6">
                      
                      {/* Budget Health */}
                      <div className="bg-white border border-stone-200 p-6 space-y-4">
                        <div className="border-b border-stone-100 pb-2.5">
                          <h3 className="font-serif text-sm text-stone-950 font-bold flex items-center gap-1.5">
                            <TrendingUp size={15} className="text-stone-600" />
                            Saúde Orçamentária
                          </h3>
                          <p className="text-[11px] text-stone-500 mt-0.5">Análise de cumprimento do orçamento e provisão de contingência.</p>
                        </div>

                        {(() => {
                          const budget = selectedProject.budget;
                          const totalSpent = projectTransactions.reduce((acc, t) => acc + t.value, 0);
                          const bufferVal = (budget * bufferSlider) / 100;
                          const currentBalance = budget - totalSpent;
                          const isWarning = currentBalance < bufferVal;

                          return (
                            <div className="space-y-4">
                              <div className="bg-stone-50 border border-stone-150 p-3.5 space-y-2 font-mono text-[10.5px]">
                                <div className="flex justify-between border-b border-stone-100 pb-1 text-stone-500">
                                  <span>VALOR CONTRATADO</span>
                                  <span className="text-stone-900 font-bold">{formatCurrency(budget)}</span>
                                </div>
                                <div className="flex justify-between border-b border-stone-100 pb-1 text-stone-500">
                                  <span>CUSTOS EXECUTADOS</span>
                                  <span className="text-stone-900 font-bold">{formatCurrency(totalSpent)}</span>
                                </div>
                                <div className="flex justify-between text-stone-500">
                                  <span>BUFFER DE RESERVA</span>
                                  <span className="text-amber-800 font-bold">{formatCurrency(bufferVal)} ({bufferSlider}%)</span>
                                </div>
                              </div>

                              {isWarning ? (
                                <div className="border border-red-200 bg-red-50 p-3 text-red-900 text-[10px] leading-relaxed flex gap-1.5">
                                  <Info size={14} className="text-red-600 flex-shrink-0 mt-0.5" />
                                  <p>
                                    <strong>Alerta do Escritório:</strong> O saldo da obra está abaixo da margem de contingência estipulada de {bufferSlider}%. Nossos engenheiros estão otimizando recursos.
                                  </p>
                                </div>
                              ) : (
                                <div className="border border-emerald-200 bg-emerald-50 p-3 text-emerald-900 text-[10px] leading-relaxed flex gap-1.5">
                                  <CheckCircle2 size={14} className="text-emerald-600 flex-shrink-0 mt-0.5" />
                                  <p>
                                    <strong>Conformidade Orçamentária:</strong> Margem de segurança de arquitetura e contingência civil operando em níveis ideais de segurança física.
                                  </p>
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </div>

                      {/* Planning files repository */}
                      <div className="bg-white border border-stone-200 p-6 space-y-4">
                        <div className="border-b border-stone-100 pb-2.5">
                          <h3 className="font-serif text-sm text-stone-950 font-bold flex items-center gap-1.5">
                            <Layers size={15} className="text-stone-600" />
                            Arquivos de Planejamento
                          </h3>
                          <p className="text-[11px] text-stone-500 mt-0.5">Projetos civis, plantas de prefeitura e cronogramas completos.</p>
                        </div>

                        <div className="space-y-2">
                          {documents.filter(d => d.projectId === selectedProjectId && d.class === 'planejamento').length === 0 ? (
                            <div className="text-center py-8 text-stone-400 text-xs italic">
                              Nenhum memorial descritivo publicado.
                            </div>
                          ) : (
                            documents.filter(d => d.projectId === selectedProjectId && d.class === 'planejamento').map(doc => (
                              <div key={doc.id} className="bg-stone-50 border border-stone-200 p-2.5 space-y-1">
                                <h4 className="font-sans font-bold text-xs text-stone-900">{doc.name}</h4>
                                <p className="text-[10px] text-stone-500">{doc.description}</p>
                                {doc.fileName && (
                                  <button 
                                    type="button"
                                    onClick={() => setPreviewDoc(doc)} 
                                    className="text-stone-800 underline hover:text-stone-600 font-mono text-[9px] block pt-1 cursor-pointer bg-transparent border-0 p-0 text-left"
                                  >
                                    Visualizar {doc.fileName}
                                  </button>
                                )}
                              </div>
                            ))
                          )}
                        </div>
                      </div>

                    </div>

                  </div>
                )}

                {/* Sub Tab: ACOMPANHAMENTO */}
                {activeDocClassTab === 'acompanhamento' && (
                  <div className="space-y-6">
                    {/* Acompanhamento Físico (Previsto x Executado) em modo leitura */}
                    {selectedProjectId && (
                      <AcompanhamentoFisico
                        projectId={selectedProjectId}
                        project={projects.find(p => p.id === selectedProjectId)}
                        timelinePhases={timelinePhases}
                        weeklyLogs={physicalWeeklyLogs}
                        readOnly={true}
                        transactions={transactions}
                      />
                    )}

                    {/* Módulo de Mapas de Cotação Comparativo em modo leitura / autorização */}
                    {selectedProjectId && (
                      <QuotationMaps
                        projectId={selectedProjectId}
                        project={projects.find(p => p.id === selectedProjectId)}
                        readOnly={true}
                        clientName={client.name}
                        addTransaction={onAddTransaction}
                      />
                    )}

                  </div>
                )}

              </div>

          </div>
        )}
      </main>

      {/* Transaction Detail Drawer/Modal */}
      {selectedTx && (
        <div className="fixed inset-0 z-50 bg-[#1E1E1E]/40 backdrop-blur-xs flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-md bg-white border border-stone-200 p-6 md:p-8 shadow-2xl relative"
          >
            <div className="flex justify-between items-start mb-6">
              <div>
                <span className="text-[9px] font-mono text-stone-400 uppercase tracking-widest block">Detalhes do Custo</span>
                <h4 className="font-serif text-lg text-stone-900 mt-1">Lançamento Consolidado</h4>
              </div>
              <button 
                id="close_modal_btn"
                onClick={() => setSelectedTx(null)}
                className="text-stone-400 hover:text-stone-800 text-xs font-mono uppercase tracking-widest cursor-pointer"
              >
                [ Fechar ]
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="border-b border-stone-100 pb-3">
                <p className="text-[10px] font-mono text-stone-400 uppercase tracking-wider">Descrição</p>
                <p className="font-semibold text-stone-900 mt-0.5">{selectedTx.description}</p>
              </div>

              <div className="grid grid-cols-2 gap-4 border-b border-stone-100 pb-3">
                <div>
                  <p className="text-[10px] font-mono text-stone-400 uppercase tracking-wider">Valor do Lançamento</p>
                  <p className="text-sm font-semibold text-stone-900 mt-0.5">{formatCurrency(selectedTx.value)}</p>
                </div>
                <div>
                  <p className="text-[10px] font-mono text-stone-400 uppercase tracking-wider">Status do Pagamento</p>
                  <div className="mt-1">{getStatusBadge(selectedTx.status)}</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 border-b border-stone-100 pb-3">
                <div>
                  <p className="text-[10px] font-mono text-stone-400 uppercase tracking-wider">Data do Lançamento</p>
                  <p className="text-stone-800 mt-0.5">{new Date(selectedTx.date).toLocaleDateString('pt-BR')}</p>
                </div>
                <div>
                  <p className="text-[10px] font-mono text-stone-400 uppercase tracking-wider">Categoria</p>
                  <p className="text-stone-800 mt-0.5 font-medium">{getCategoryLabel(selectedTx.category)}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 border-b border-stone-100 pb-3">
                <div>
                  <p className="text-[10px] font-mono text-stone-400 uppercase tracking-wider">Fornecedor / Prestador</p>
                  <p className="text-stone-800 mt-0.5">{selectedTx.supplier}</p>
                </div>
                <div>
                  <p className="text-[10px] font-mono text-stone-400 uppercase tracking-wider">Nº NF / Comprovante</p>
                  <p className="text-stone-800 mt-0.5 font-mono">{selectedTx.invoiceNumber || '—'}</p>
                </div>
              </div>

              {selectedTx.notes && (
                <div className="border-b border-stone-100 pb-3">
                  <p className="text-[10px] font-mono text-stone-400 uppercase tracking-wider">Observações Técnicas</p>
                  <p className="text-stone-600 mt-0.5 italic">{selectedTx.notes}</p>
                </div>
              )}

              <div>
                <p className="text-[10px] font-mono text-stone-400 uppercase tracking-wider">Comprovante / Nota Fiscal</p>
                {selectedTx.receiptName ? (
                  <div className="mt-2 bg-stone-50 border border-stone-200 p-2.5 flex items-center justify-between">
                    <div className="flex items-center gap-2 max-w-[70%]">
                      <FileText size={14} className="text-stone-400 flex-shrink-0" />
                      <span className="font-mono text-[10px] text-stone-600 truncate" title={selectedTx.receiptName}>{selectedTx.receiptName}</span>
                    </div>
                    {selectedTx.receiptName.startsWith('http') ? (
                      <a 
                        href={selectedTx.receiptName} 
                        target="_blank" 
                        rel="noopener noreferrer" 
                        className="text-[9px] font-mono uppercase bg-stone-900 text-white px-2 py-1 font-bold hover:bg-stone-800 transition-all cursor-pointer"
                      >
                        Abrir Nota ↗
                      </a>
                    ) : (
                      <span className="text-[9px] font-mono uppercase text-emerald-700 bg-emerald-50 px-1.5 border border-emerald-100">Auditado</span>
                    )}
                  </div>
                ) : (
                  <p className="text-stone-400 mt-1 italic text-[10px]">Sem comprovante anexado a esta via.</p>
                )}
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* Document Preview Overlay for Client */}
      {previewDoc && (
        <div className="fixed inset-0 z-[9999] bg-[#1E1E1E]/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-4xl bg-stone-100 border border-stone-200 shadow-2xl relative flex flex-col md:flex-row max-h-[90vh]"
          >
            {/* Left Column: Metadata & Technical Information */}
            <div className="w-full md:w-80 bg-[#1E1E1E] text-stone-300 p-6 flex flex-col justify-between font-mono text-[10px] flex-shrink-0">
              <div className="space-y-6">
                <div className="border-b border-stone-800 pb-4">
                  <span className="text-[9px] text-[#FF5A35] font-bold uppercase tracking-widest">Via do Cliente</span>
                  <h3 className="font-serif text-sm font-bold text-white mt-1 break-words">{previewDoc.name}</h3>
                  <p className="text-[8px] text-stone-500 mt-1 uppercase font-mono">ID: {previewDoc.id}</p>
                </div>

                <div className="space-y-4">
                  <div>
                    <span className="text-stone-500 block uppercase tracking-wider text-[8px]">Descrição do Anexo</span>
                    <p className="text-stone-300 mt-1 font-sans text-xs leading-relaxed">{previewDoc.description || 'Nenhum memorial ou descrição extra fornecida pela equipe técnica.'}</p>
                  </div>

                  <div>
                    <span className="text-stone-500 block uppercase tracking-wider text-[8px]">Metadados Administrativos</span>
                    <div className="mt-1.5 space-y-1.5 text-[9px] text-stone-400">
                      <p><strong className="text-stone-300">Publicado por:</strong> Engenharia CBC</p>
                      <p><strong className="text-stone-300">Data de Envio:</strong> {previewDoc.uploadedAt}</p>
                      <p><strong className="text-stone-300">Classificação:</strong> {previewDoc.class.toUpperCase()}</p>
                      {previewDoc.fileName && (
                        <p className="break-all"><strong className="text-stone-300">Nome de Origem:</strong> {previewDoc.fileName}</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-6 border-t border-stone-800 space-y-3">
                <span className="text-[8px] text-stone-500 block uppercase">Chaves Brites Correa</span>
                <button
                  type="button"
                  onClick={() => setPreviewDoc(null)}
                  className="w-full bg-stone-800 hover:bg-stone-700 text-stone-200 hover:text-white py-2 px-4 uppercase tracking-wider font-bold transition-all text-[9px] cursor-pointer border-0"
                >
                  Fechar Visualização
                </button>
              </div>
            </div>

            {/* Right Column: Visualizer Page */}
            <div className="flex-1 bg-stone-200 p-6 overflow-y-auto flex justify-center items-start min-h-[40vh] md:min-h-0">
              {previewDoc.fileUrl ? (
                <div className="w-full max-w-2xl space-y-4">
                  {/* If it's an image, display it directly */}
                  {previewDoc.fileUrl.match(/\.(jpeg|jpg|gif|png|webp)/i) || previewDoc.fileUrl.startsWith('data:image/') ? (
                    <div className="bg-white p-4 border border-stone-300 shadow-md">
                      <span className="block text-[8px] font-mono text-stone-400 uppercase mb-2">Visualização de Imagem Anexada</span>
                      <img
                        src={previewDoc.fileUrl}
                        alt={previewDoc.name}
                        referrerPolicy="no-referrer"
                        className="max-h-[55vh] mx-auto object-contain"
                      />
                    </div>
                  ) : (
                    /* PDF Document layout */
                    <div className="bg-white border border-stone-300 shadow-lg p-8 flex flex-col items-center justify-center text-center space-y-6 relative overflow-hidden">
                      <div className="absolute top-0 left-0 right-0 h-1.5 bg-red-700"></div>
                      
                      <div className="w-16 h-20 bg-red-50 border-2 border-red-200 rounded-lg flex flex-col items-center justify-between p-2.5 relative shadow-xs mt-4">
                        <span className="text-[9px] font-mono font-bold text-red-700 bg-red-100 px-1 py-0.5 rounded uppercase tracking-wider">PDF</span>
                        <div className="space-y-1 w-full">
                          <div className="h-1 bg-red-200 rounded w-5/6 mx-auto"></div>
                          <div className="h-1 bg-red-200 rounded w-4/6 mx-auto"></div>
                        </div>
                        <span className="text-xs">📄</span>
                      </div>

                      <div className="space-y-1.5">
                        <h4 className="font-serif text-sm font-bold text-stone-900">{previewDoc.fileName || previewDoc.name}</h4>
                        <p className="text-[9px] font-mono text-stone-500 uppercase tracking-wider">Arquivo disponível para download e visualização digital</p>
                      </div>

                      <div className="bg-stone-50 border border-stone-200 p-4 text-left text-xs text-stone-600 font-sans max-w-md mx-auto leading-relaxed">
                        <p className="font-bold text-stone-800 flex items-center gap-1.5 mb-1">
                          <span>ℹ️</span> Visualização Direta de Documento Activa
                        </p>
                        <p>
                          Como medida preventiva do navegador, você pode visualizar o anexo em uma aba externa dedicada ou baixar a cópia autenticada diretamente em seu dispositivo.
                        </p>
                      </div>

                      <div className="flex flex-col sm:flex-row gap-3 w-full max-w-md justify-center pt-2">
                        <a
                          href={previewDoc.fileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="bg-red-700 hover:bg-red-800 text-white font-mono text-[9px] font-bold py-2.5 px-4 uppercase tracking-wider transition-all flex items-center justify-center gap-2 shadow-xs cursor-pointer text-center"
                        >
                          <ExternalLink size={12} />
                          Visualizar em Nova Aba
                        </a>
                        <button
                          type="button"
                          onClick={() => handleDownloadDoc(previewDoc)}
                          className="bg-stone-900 hover:bg-stone-800 text-white font-mono text-[9px] font-bold py-2.5 px-4 uppercase tracking-wider transition-all flex items-center justify-center gap-2 shadow-xs cursor-pointer text-center"
                        >
                          <Download size={12} />
                          Baixar Arquivo PDF
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                /* Static Watermarked Official Document Mock */
                <div className="bg-white border border-stone-300 shadow-lg w-full max-w-2xl p-10 font-serif space-y-8 min-h-[60vh] relative text-stone-900 overflow-hidden text-left">
                  <div className="absolute inset-0 flex items-center justify-center opacity-[0.03] select-none pointer-events-none">
                    <div className="text-center font-serif text-[60px] font-bold rotate-12 tracking-widest uppercase">
                      CBC ENGENHARIA
                    </div>
                  </div>

                  <div className="text-center space-y-2 border-b-2 border-stone-900 pb-5">
                    <div className="font-mono text-[8px] tracking-widest uppercase text-stone-500 font-bold">República Federativa do Brasil</div>
                    <h4 className="font-bold text-xs uppercase tracking-wider font-serif text-stone-900">CHAVES BRITES CORREA LTDA</h4>
                    <p className="text-[9px] font-mono text-stone-600 uppercase tracking-wide">Engenharia de Infraestrutura e Gestão de Obras Civis</p>
                  </div>

                  <div className="space-y-4">
                    <div className="bg-stone-50 p-4 border border-stone-200">
                      <h3 className="font-serif text-xs font-bold uppercase tracking-wider text-stone-800 border-b border-stone-200 pb-1.5 mb-2">Comunicação Oficial Interna</h3>
                      <p className="text-[11px] leading-relaxed text-stone-700 font-serif whitespace-pre-line">{previewDoc.description || 'Não há detalhes adicionais cadastrados.'}</p>
                    </div>

                    <div className="flex justify-between items-end pt-10 font-mono text-[8px] text-stone-400">
                      <div>
                        <p>REGISTRO DE ARQUIVO: CBC-{previewDoc.id.toUpperCase()}</p>
                        <p>DATA DE EMISSÃO: {previewDoc.uploadedAt}</p>
                      </div>
                      <div className="text-right font-mono">
                        <p className="font-bold text-stone-600 uppercase">Assinado Eletronicamente</p>
                        <p>CHAVES BRITES CORREA</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}

      {/* Footer copyright */}
      <footer className="border-t border-stone-200 py-8 px-6 mt-16 bg-white">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="font-mono text-[9px] uppercase tracking-widest text-[#73736E]">
            © {new Date().getFullYear()} CHAVES BRITES CORREA. TODOS OS DIREITOS RESERVADOS.
          </p>
          <div className="flex items-center gap-2 text-[10px] font-mono text-stone-400">
            <CheckCircle2 size={12} className="text-emerald-500" />
            Vias auditadas e integradas com o centro de custo
          </div>
        </div>
      </footer>
    </div>
  );
}
