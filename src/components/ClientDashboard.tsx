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
  Eye,
  X
} from 'lucide-react';
import { motion } from 'motion/react';
import AcompanhamentoFisico from './AcompanhamentoFisico';
import UnproductiveDaysCard from './UnproductiveDaysCard';
import QuotationMaps from './QuotationMaps';
import ClientAcompanhamentoDashboard from './ClientAcompanhamentoDashboard';
import ClientFinanceTable from './ClientFinanceTable';
import ClientLaborContracts from './ClientLaborContracts';
import { subscribeCollection } from '../lib/firebaseDb';
import { generateClientContractPdf } from '../lib/pdfReports';
import { formatDateBR } from '../lib/formatDate';


interface ClientDashboardProps {
  client: Client;
  projects: Project[];
  transactions: Transaction[];
  documents: ProjectDocument[];
  onLogout: () => void;
  onAddTransaction: (tx: Transaction) => void;
}

export default function ClientDashboard({ client, projects, transactions, documents, onLogout, onAddTransaction }: ClientDashboardProps) {
  // Obras deste cliente: dono principal (clientId) OU dono adicional numa obra
  // compartilhada (clientIds). Sem isso, o segundo cliente vinculado a um centro
  // de custo compartilhado nunca via a obra, mesmo o backend já enviando os dados.
  const clientProjects = useMemo(() => {
    return projects.filter(p => p.clientId === client.id || (Array.isArray(p.clientIds) && p.clientIds.includes(client.id)));
  }, [projects, client.id]);

  // Selected project state
  const [selectedProjectId, setSelectedProjectId] = useState<string>(() => {
    return clientProjects.length > 0 ? clientProjects[0].id : '';
  });

  // Active Document class tab (Administrativo, Planejamento, Acompanhamento) —
  // começa em "acompanhamento": é onde ficam as primeiras informações que o
  // cliente quer ver (progresso da obra e investimento), não a parte documental.
  const [activeDocClassTab, setActiveDocClassTab] = useState<DocumentClass>('acompanhamento');

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
  const [measurements, setMeasurements] = useState<any[]>([]);
  const [regulatorySteps, setRegulatorySteps] = useState<any[]>([]);
  const [unproductiveDays, setUnproductiveDays] = useState<any[]>([]);

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
    const unsubMeasurements = subscribeCollection('measurements', setMeasurements, [], 'cbc_measurements_v1');
    const unsubReg = subscribeCollection('regulatory_steps', setRegulatorySteps, INITIAL_REGULATORY_STEPS, 'cbc_regulatory_steps_v2');
    const unsubUnproductive = subscribeCollection('unproductive_days', setUnproductiveDays, [], 'cbc_unproductive_days_v1');

    return () => {
      unsubDailyLogs();
      unsubTimeline();
      unsubPunch();
      unsubWeekly();
      unsubMeasurements();
      unsubReg();
      unsubUnproductive();
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
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[length:var(--ui-text-xs)] font-mono uppercase bg-emerald-50 text-emerald-800 border border-emerald-200">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
            Quitado
          </span>
        );
      case 'pendente':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[length:var(--ui-text-xs)] font-mono uppercase bg-amber-50 text-amber-800 border border-amber-200">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
            A pagar
          </span>
        );
      case 'reembolsado':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[length:var(--ui-text-xs)] font-mono uppercase bg-blue-50 text-blue-800 border border-blue-200">
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
    <div
      className="client-portal min-h-screen text-[#18181b] font-sans selection:bg-[#FF5A35]/15 relative overflow-hidden theme-light"
      style={{ background: 'linear-gradient(160deg, #d6d9de 0%, #eef0f3 45%, #d1d4da 100%)' }}
    >
      {/* Grade decorativa sutil — igual à tela de seleção de ambiente */}
      <div className="absolute inset-0 pointer-events-none" style={{
        backgroundImage:
          'linear-gradient(to right, rgba(0,0,0,0.025) 1px, transparent 1px),' +
          'linear-gradient(to bottom, rgba(0,0,0,0.025) 1px, transparent 1px)',
        backgroundSize: '48px 48px',
      }} />
      {/* Brilhos ambiente — mesma dupla grafite + laranja da seleção de ambiente */}
      <div className="absolute pointer-events-none" style={{
        width: 600, height: 600, top: -180, left: -140,
        background: 'radial-gradient(circle, rgba(24,24,27,0.08) 0%, transparent 70%)',
      }} />
      <div className="absolute pointer-events-none" style={{
        width: 650, height: 650, bottom: -200, right: -160,
        background: 'radial-gradient(circle, #FF5A3520 0%, transparent 70%)',
      }} />

      {/* Header Branding — cartão de vidro claro, mesma linguagem visual do resto do app */}
      <header className="client-header sticky top-3 z-40 mx-3 px-5 py-3.5 relative rounded-[20px]" style={{
        background: 'rgba(255,255,255,0.7)',
        backdropFilter: 'blur(20px) saturate(160%)',
        WebkitBackdropFilter: 'blur(20px) saturate(160%)',
        border: '1px solid rgba(255,255,255,0.7)',
        boxShadow: '0 10px 28px -14px rgba(15,23,42,0.18)',
      }}>
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs flex-shrink-0" style={{
              background: 'linear-gradient(135deg, #3f3f46, #000000)',
              border: '1px solid rgba(255,255,255,0.14)',
              boxShadow: '0 6px 16px rgba(0,0,0,0.25)',
              color: '#fff',
            }}>
              CBC
            </div>
            <div>
              {/* .theme-light já força h1/h2 para #0F172A (escuro) — não precisa de cor própria aqui. */}
              <h1 className="font-sans font-bold text-sm tracking-[0.1em] uppercase leading-tight">
                Chaves Brites Correa
              </h1>
              <p className="font-mono text-[10px] tracking-[0.18em] uppercase mt-0.5">
                Arquitetura &amp; Engenharia
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between md:justify-end gap-4">
            <div className="text-left md:text-right">
              <p className="text-[10px] font-mono uppercase tracking-widest">Acesso do Cliente</p>
              <p className="text-xs"><b>{client.name}</b></p>
            </div>
            <button
              id="logout_btn"
              onClick={onLogout}
              className="flex items-center gap-2 px-3.5 py-2 rounded-full text-xs font-mono uppercase tracking-wider transition-colors hover:bg-white cursor-pointer"
              style={{ color: '#52525b', background: 'rgba(255,255,255,0.5)', border: '1px solid rgba(0,0,0,0.08)' }}
            >
              <LogOut size={13} style={{ color: '#FF5A35' }} />
              Sair
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto px-3 md:px-6 py-6 relative z-10">
        
        {/* Project Selection Tabs */}
        {clientProjects.length > 1 && (
          <div className="mb-6 pb-4 border-b border-stone-200/70">
            <span className="text-[10px] font-mono uppercase tracking-widest text-stone-400 block mb-3 px-1">Selecione o Centro de Custo / Obra</span>
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
                  className={`px-4 py-2.5 text-xs font-mono uppercase tracking-wider transition-all rounded-xl border cursor-pointer ${
                    selectedProjectId === p.id
                      ? 'bg-gradient-to-r from-[#FF5A35] to-[#E04824] text-white border-transparent shadow-lg shadow-[#FF5A35]/20 font-semibold'
                      : 'bg-white/70 text-stone-500 border-stone-200 hover:border-stone-300 hover:text-stone-800'
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
          <div className="bg-white/70 border border-stone-200 p-12 text-center my-12 rounded-2xl">
            <h3 className="text-lg font-bold text-stone-900">Nenhum Centro de Custo Disponível</h3>
            <p className="text-xs text-stone-500 mt-2">Seu cadastro está ativo, porém o time técnico ainda não liberou obras ou projetos vinculados.</p>
            <p className="text-xs text-[#FF5A35] mt-1 font-mono uppercase text-[length:var(--ui-text-xs)] tracking-wider">Entre em contato com o escritório para vincular seus custos.</p>
          </div>
        ) : !selectedProject ? (
          <div className="text-center p-12 text-stone-400 font-mono text-xs">Carregando dados...</div>
        ) : (
          <div className="space-y-4">
            
            {/* Resumo compacto do centro de custo — nome, status, local, área, início,
                consumo financeiro e avisos, tudo numa única faixa para reduzir o scroll
                que antes era necessário para ver essas informações separadas. */}
            <div className="bg-white/85 backdrop-blur-sm border border-stone-200/70 rounded-2xl p-4 relative overflow-hidden" style={{ boxShadow: '0 10px 28px -18px rgba(15,23,42,0.18)' }}>
              <div className="flex flex-col lg:flex-row justify-between items-start gap-5">
                <div className="space-y-2.5 flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex px-2 py-0.5 text-[10px] font-mono uppercase rounded-md bg-stone-100 text-stone-600 border border-stone-200">
                      {selectedProject.type === 'obra' ? 'Execução de Obra' : 'Desenvolvimento de Projeto'}
                    </span>
                    <span className={`inline-flex px-2 py-0.5 text-[10px] font-mono uppercase rounded-md border ${
                      selectedProject.status === 'execucao' ? 'bg-[#EBF7EE] text-[#245D3B] border-[#245D3B]/20' :
                      selectedProject.status === 'concluido' ? 'bg-[#EEF2F6] text-[#204060] border-[#204060]/20' :
                      'bg-stone-100 text-stone-600 border-stone-200'
                    }`}>
                      {selectedProject.status === 'planejamento' ? 'Planejamento' :
                       selectedProject.status === 'execucao' ? 'Em Andamento' :
                       selectedProject.status === 'concluido' ? 'Concluído' : 'Suspenso'}
                    </span>
                    {!hasContract && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-mono uppercase rounded-md bg-amber-50 text-amber-800 border border-amber-200">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" /> Pendência
                      </span>
                    )}
                  </div>

                  <h2 className="text-xl md:text-2xl font-bold text-stone-900 leading-tight">{selectedProject.name}</h2>

                  <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-stone-500 pt-1">
                    <span className="flex items-center gap-1.5"><MapPin size={13} className="text-stone-400 flex-shrink-0" /> <span className="truncate max-w-[220px]" title={selectedProject.location}>{selectedProject.location}</span></span>
                    {selectedProject.area && (
                      <span className="flex items-center gap-1.5"><Layers size={13} className="text-stone-400 flex-shrink-0" /> {selectedProject.area} m²</span>
                    )}
                    <span className="flex items-center gap-1.5"><Calendar size={13} className="text-stone-400 flex-shrink-0" /> Iniciada em {formatDateBR(selectedProject.startDate)}</span>
                  </div>
                </div>

                {/* Anel de progresso + consumo financeiro */}
                <div className="flex items-center gap-3 rounded-xl p-3.5 w-full lg:w-auto flex-shrink-0" style={{ background: '#FF5A350d', border: '1px solid #FF5A3520' }}>
                  <div className="relative w-16 h-16 flex-shrink-0">
                    <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                      <path className="text-stone-200" strokeWidth="3" stroke="currentColor" fill="none"
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                      <path strokeWidth="3" strokeDasharray={`${Math.min(100, summary.percentSpent)}, 100`} strokeLinecap="round"
                        stroke="#FF5A35" fill="none"
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-xs font-bold text-stone-800">{summary.percentSpent.toFixed(0)}%</span>
                    </div>
                  </div>
                  <div className="min-w-0">
                    <span className="text-[10px] font-mono text-stone-400 uppercase tracking-widest block">Consumo Financeiro</span>
                    <p className="text-xs text-stone-600 mt-0.5 max-w-[180px]">{summary.percentSpent.toFixed(1)}% de {formatCurrency(selectedProject.budget)}</p>
                  </div>
                </div>
              </div>

              {/* Linha de aviso — compacta, dentro do mesmo cartão */}
              <div className={`mt-4 pt-4 border-t border-stone-100 flex items-start gap-2 text-xs ${!hasContract ? 'text-amber-800' : 'text-[#245D3B]'}`}>
                {!hasContract ? (
                  <>
                    <span className="mt-0.5">⚠️</span>
                    <span><strong>Contrato técnico pendente de anexo.</strong> Entre em contato com a equipe da Chaves Brites Correa para regularização.</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={14} style={{ color: '#059669' }} className="flex-shrink-0 mt-0.5" />
                    <span><strong>Tudo em dia!</strong> O contrato técnico foi anexado e está homologado.</span>
                  </>
                )}
              </div>
            </div>

            {/* Seleção de categoria — cards coloridos, no mesmo estilo da tela de
                seleção de ambiente, em vez de abas de texto simples. */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {([
                { key: 'acompanhamento' as DocumentClass, label: 'Acompanhamento', desc: 'Progresso da obra e investimentos', Icon: Activity, color: '#FF5A35' },
                { key: 'planejamento' as DocumentClass, label: 'Planejamento', desc: 'Cronograma, orçamento e arquivos técnicos', Icon: Clock, color: '#B08A3E' },
                { key: 'administrativo' as DocumentClass, label: 'Administrativo', desc: 'Contrato, licenças e documentos', Icon: FileText, color: '#4D5E6F' },
              ]).map(cat => {
                const count = documents.filter(d => d.projectId === selectedProjectId && d.class === cat.key).length;
                const active = activeDocClassTab === cat.key;
                const Icon = cat.Icon;
                return (
                  <button
                    key={cat.key}
                    type="button"
                    onClick={() => setActiveDocClassTab(cat.key)}
                    className="group relative text-left rounded-2xl p-4 cursor-pointer transition-all duration-300"
                    style={{
                      background: active ? '#fff' : 'rgba(255,255,255,0.6)',
                      border: `1px solid ${active ? cat.color + '55' : 'rgba(0,0,0,0.08)'}`,
                      boxShadow: active
                        ? `0 14px 30px -12px ${cat.color}40, inset 0 1px 0 rgba(255,255,255,0.7)`
                        : '0 4px 14px -8px rgba(15,23,42,0.1)',
                      transform: active ? 'translateY(-2px)' : 'none',
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <span className="inline-flex items-center justify-center w-10 h-10 rounded-xl flex-shrink-0 transition-transform duration-300 group-hover:scale-105" style={{ background: cat.color + '1f' }}>
                        <Icon size={18} style={{ color: cat.color }} />
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-bold text-stone-900">{cat.label}</span>
                          <span className="text-[10px] font-mono text-stone-400">({count})</span>
                        </div>
                        <p className="text-[11px] text-stone-500 truncate">{cat.desc}</p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="space-y-4 pt-1">

                {/* Sub Tab: ADMINISTRATIVO */}
                {activeDocClassTab === 'administrativo' && (
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    
                    {/* Tool 1: Contract View */}
                    <div className="bg-white border border-stone-200 rounded-2xl p-5 space-y-3">
                      <div className="border-b border-stone-100 pb-2.5">
                        <h3 className="font-serif text-sm text-stone-950 font-bold flex items-center gap-1.5">
                          <FileText size={15} className="text-stone-600" />
                          Contrato Digital do Projeto
                        </h3>
                        <p className="text-[length:var(--ui-text-xs)] text-stone-500 mt-0.5">Consulte a via homologada de prestação de serviços técnicos.</p>
                      </div>

                      <div className="border border-stone-200 p-4 bg-[#FCFBF9] space-y-3 font-serif relative overflow-hidden text-[length:var(--ui-text-xs)] text-stone-800 shadow-inner">
                        {/* Watermark */}
                        <div className="absolute inset-0 flex items-center justify-center opacity-[0.03] pointer-events-none select-none">
                          <span className="font-sans font-black text-6xl tracking-widest text-stone-900 rotate-12">CBC</span>
                        </div>

                        <div className="text-center border-b border-stone-200 pb-2">
                          <span className="font-sans text-[length:var(--ui-text-xs)] font-bold tracking-widest text-stone-500 block">CHAVES BRITES CORREA</span>
                          <span className="text-[length:var(--ui-text-xs)] font-bold">MINUTA DE CONTRATO PRESTAÇÃO DE SERVIÇOS</span>
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
                          <div className="text-[length:var(--ui-text-xs)] font-bold tracking-widest uppercase text-emerald-700">✓ ASSINADO DIGITALMENTE</div>
                          <p className="text-[length:var(--ui-text-xs)] mt-0.5 text-emerald-600 font-mono">HASH: SHA256.{selectedProjectId}.CBC.AUTENTICADO</p>
                        </div>

                        <div className="pt-2 flex justify-end gap-1.5 font-sans">
                          <button
                            type="button"
                            onClick={() => generateClientContractPdf({
                              projectName: selectedProject.name,
                              budgetLabel: formatCurrency(selectedProject.budget),
                              object: contractForm.object,
                              paymentTerms: contractForm.paymentTerms,
                              penalties: contractForm.penalties,
                              signed: contractForm.isSigned,
                            })}
                            className="bg-[#18181b] hover:bg-black text-white px-3 py-1.5 rounded-full text-[length:var(--ui-text-xs)] font-mono uppercase flex items-center gap-1 cursor-pointer transition-colors"
                          >
                            Download
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Tool 2: Licenses */}
                    <div className="bg-white border border-stone-200 rounded-2xl p-5 space-y-3">
                      <div className="border-b border-stone-100 pb-2.5">
                        <h3 className="font-serif text-sm text-stone-950 font-bold flex items-center gap-1.5">
                          <CheckCircle2 size={15} className="text-stone-600" />
                          Licenciamentos e Registros Técnicos
                        </h3>
                        <p className="text-[length:var(--ui-text-xs)] text-stone-500 mt-0.5">Acompanhe a liberação das ARTs, RRTs e alvarás municipais da obra.</p>
                      </div>

                      <div className="space-y-3">
                        {regulatorySteps.filter(s => s.projectId === selectedProjectId).length === 0 ? (
                          <div className="text-center py-8 text-stone-400 text-xs italic">
                            Nenhum licenciamento registrado para esta obra.
                          </div>
                        ) : (
                          regulatorySteps.filter(s => s.projectId === selectedProjectId).map(step => (
                            <div key={step.id} className="bg-stone-50 border border-stone-150 rounded-xl p-3 space-y-1.5">
                              <div className="flex justify-between items-center">
                                <h4 className="font-sans font-bold text-xs text-stone-900">{step.name}</h4>
                                <span className={`text-[length:var(--ui-text-xs)] font-mono uppercase tracking-wider py-0.5 px-2 rounded-full border ${
                                  step.status === 'Emitido'
                                    ? 'bg-emerald-50 text-emerald-800 border-emerald-300 font-bold'
                                    : step.status === 'Sob Análise'
                                      ? 'bg-amber-50 text-amber-800 border-amber-300 font-bold'
                                      : 'bg-stone-100 text-stone-500 border-stone-300'
                                }`}>
                                  {step.status}
                                </span>
                              </div>
                              <p className="text-[length:var(--ui-text-xs)] text-stone-600 italic">"{step.notes || 'Sem observações.'}"</p>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    {/* Tool 3: Admin Files */}
                    <div className="bg-white border border-stone-200 rounded-2xl p-5 space-y-3">
                      <div className="border-b border-stone-100 pb-2.5">
                        <h3 className="font-serif text-sm text-stone-950 font-bold flex items-center gap-1.5">
                          <Layers size={15} className="text-stone-600" />
                          Repositório Administrativo
                        </h3>
                        <p className="text-[length:var(--ui-text-xs)] text-stone-500 mt-0.5">Acesse notas fiscais, taxas pagas e recibos emitidos pelo escritório.</p>
                      </div>

                      <div className="space-y-2">
                        {documents.filter(d => d.projectId === selectedProjectId && d.class === 'administrativo').length === 0 ? (
                          <div className="text-center py-10 border border-dashed border-stone-200 text-stone-400 text-xs">
                            Nenhum arquivo administrativo publicado.
                          </div>
                        ) : (
                          documents.filter(d => d.projectId === selectedProjectId && d.class === 'administrativo').map(doc => (
                            <div key={doc.id} className="bg-stone-50 border border-stone-200 rounded-xl p-3 space-y-2">
                              <div className="flex items-center justify-between gap-1">
                                <h4 className="font-sans font-bold text-xs text-stone-900">{doc.name}</h4>
                                <span className="text-[8.5px] font-mono text-stone-400">{doc.uploadedAt}</span>
                              </div>
                              <p className="text-[length:var(--ui-text-xs)] text-stone-500 leading-normal">{doc.description}</p>
                              {doc.fileName && (
                                <div className="bg-white border border-stone-100 p-1.5 flex items-center justify-between font-mono text-[length:var(--ui-text-xs)] text-stone-600">
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
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    
                    {/* Tool 1: Gantt Schedule view */}
                    <div className="bg-white border border-stone-200 rounded-2xl p-5 lg:col-span-2 space-y-4">
                      <div className="border-b border-stone-100 pb-2.5">
                        <h3 className="font-serif text-sm text-stone-950 font-bold flex items-center gap-1.5">
                          <Clock size={15} className="text-stone-600" />
                          Acompanhamento do Cronograma (Gantt de Etapas)
                        </h3>
                        <p className="text-[length:var(--ui-text-xs)] text-stone-500 mt-0.5">Visualize a evolução das etapas físicas e financeiras da sua obra.</p>
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
                              <div key={phase.id} className="bg-stone-50 border border-stone-200 rounded-xl p-4 space-y-2.5">
                                <div className="flex justify-between items-center text-xs">
                                  <div>
                                    <h4 className="font-sans font-bold text-stone-900">{phase.name}</h4>
                                    <span className="text-[length:var(--ui-text-xs)] font-mono text-stone-400">Duração planejada: {phase.startDate} a {phase.endDate}</span>
                                  </div>
                                  <span className="bg-stone-200 text-stone-800 font-mono text-[length:var(--ui-text-xs)] font-bold px-2 py-0.5 rounded-full">{phase.progress}% Concluído</span>
                                </div>

                                <div className="w-full bg-stone-200 h-1.5 rounded-full overflow-hidden">
                                  <div 
                                    className="bg-stone-700 h-full transition-all duration-500"
                                    style={{ width: `${phase.progress}%` }}
                                  />
                                </div>

                                <div className="grid grid-cols-2 gap-4 text-[length:var(--ui-text-xs)] font-mono pt-1">
                                  <div>
                                    <span className="text-stone-400 block text-[length:var(--ui-text-xs)] uppercase">Custo Estimado</span>
                                    <span className="text-stone-800 font-bold">{formatCurrency(phase.costPrev)}</span>
                                  </div>
                                  <div>
                                    <span className="text-stone-400 block text-[length:var(--ui-text-xs)] uppercase">Custo Realizado Atual</span>
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
                      <div className="bg-white border border-stone-200 rounded-2xl p-5 space-y-3">
                        <div className="border-b border-stone-100 pb-2.5">
                          <h3 className="font-serif text-sm text-stone-950 font-bold flex items-center gap-1.5">
                            <TrendingUp size={15} className="text-stone-600" />
                            Saúde Orçamentária
                          </h3>
                          <p className="text-[length:var(--ui-text-xs)] text-stone-500 mt-0.5">Análise de cumprimento do orçamento e provisão de contingência.</p>
                        </div>

                        {(() => {
                          const budget = selectedProject.budget;
                          const totalSpent = projectTransactions.reduce((acc, t) => acc + t.value, 0);
                          const bufferVal = (budget * bufferSlider) / 100;
                          const currentBalance = budget - totalSpent;
                          const isClosed = selectedProject.status === 'concluido';
                          const isWarning = !isClosed && currentBalance < bufferVal;

                          return (
                            <div className="space-y-4">
                              <div className="bg-stone-50 border border-stone-150 rounded-xl p-3.5 space-y-2 font-mono text-[10.5px]">
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

                              {isClosed && currentBalance >= 0 ? (
                                <div className="border border-emerald-200 bg-emerald-50 p-3 text-emerald-900 text-[length:var(--ui-text-xs)] leading-relaxed flex gap-1.5">
                                  <CheckCircle2 size={14} style={{ color: '#059669' }} className="flex-shrink-0 mt-0.5" />
                                  <p>
                                    <strong>Obra encerrada dentro do orçamento:</strong> custo final {budget > 0 ? ((currentBalance / budget) * 100).toFixed(1).replace('.', ',') : '0'}% abaixo do valor contratado (economia de {formatCurrency(currentBalance)}).
                                  </p>
                                </div>
                              ) : isWarning ? (
                                <div className="border border-red-200 bg-red-50 p-3 text-red-900 text-[length:var(--ui-text-xs)] leading-relaxed flex gap-1.5">
                                  <Info size={14} style={{ color: '#dc2626' }} className="flex-shrink-0 mt-0.5" />
                                  <p>
                                    <strong>Alerta do Escritório:</strong> O saldo da obra está abaixo da margem de contingência estipulada de {bufferSlider}%. Nossos engenheiros estão otimizando recursos.
                                  </p>
                                </div>
                              ) : (
                                <div className="border border-emerald-200 bg-emerald-50 p-3 text-emerald-900 text-[length:var(--ui-text-xs)] leading-relaxed flex gap-1.5">
                                  <CheckCircle2 size={14} style={{ color: '#059669' }} className="flex-shrink-0 mt-0.5" />
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
                      <div className="bg-white border border-stone-200 rounded-2xl p-5 space-y-3">
                        <div className="border-b border-stone-100 pb-2.5">
                          <h3 className="font-serif text-sm text-stone-950 font-bold flex items-center gap-1.5">
                            <Layers size={15} className="text-stone-600" />
                            Arquivos de Planejamento
                          </h3>
                          <p className="text-[length:var(--ui-text-xs)] text-stone-500 mt-0.5">Projetos civis, plantas de prefeitura e cronogramas completos.</p>
                        </div>

                        <div className="space-y-2">
                          {documents.filter(d => d.projectId === selectedProjectId && d.class === 'planejamento').length === 0 ? (
                            <div className="text-center py-8 text-stone-400 text-xs italic">
                              Nenhum memorial descritivo publicado.
                            </div>
                          ) : (
                            documents.filter(d => d.projectId === selectedProjectId && d.class === 'planejamento').map(doc => (
                              <div key={doc.id} className="bg-stone-50 border border-stone-200 rounded-xl p-2.5 space-y-1">
                                <h4 className="font-sans font-bold text-xs text-stone-900">{doc.name}</h4>
                                <p className="text-[length:var(--ui-text-xs)] text-stone-500">{doc.description}</p>
                                {doc.fileName && (
                                  <button 
                                    type="button"
                                    onClick={() => setPreviewDoc(doc)} 
                                    className="text-stone-800 underline hover:text-stone-600 font-mono text-[length:var(--ui-text-xs)] block pt-1 cursor-pointer bg-transparent border-0 p-0 text-left"
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

                    {/* Contratos de mão de obra do centro de custo */}
                    {selectedProjectId && (
                      <div className="mt-6">
                        <ClientLaborContracts projectId={selectedProjectId} />
                      </div>
                    )}

                  </div>
                )}

                {/* Sub Tab: ACOMPANHAMENTO */}
                {activeDocClassTab === 'acompanhamento' && (
                  <div className="space-y-4">
                    {/* Painel visual e didático — a visão principal do cliente. */}
                    {selectedProjectId && selectedProject && (
                      <ClientAcompanhamentoDashboard
                        project={selectedProject}
                        transactions={projectTransactions}
                        phases={timelinePhases.filter((p: any) => p.projectId === selectedProjectId)}
                        measurements={measurements.filter((mm: any) => mm.projectId === selectedProjectId && mm.released)}
                      />
                    )}

                    {/* Tabela financeira detalhada com filtros e agrupamento */}
                    {selectedProjectId && (
                      <ClientFinanceTable transactions={projectTransactions} />
                    )}

                    {/* Detalhamento técnico — recolhido por padrão, para quem quiser aprofundar. */}
                    {selectedProjectId && (
                      <details className="group bg-white border border-stone-200 rounded-2xl overflow-hidden">
                        <summary className="cursor-pointer select-none px-6 py-4 flex items-center justify-between hover:bg-stone-50 transition-colors">
                          <span className="text-sm font-semibold text-stone-700">Ver detalhamento técnico completo</span>
                          <span className="text-[length:var(--ui-text-xs)] font-mono uppercase tracking-widest text-stone-400 group-open:hidden">Abrir ▾</span>
                          <span className="text-[length:var(--ui-text-xs)] font-mono uppercase tracking-widest text-stone-400 hidden group-open:inline">Fechar ▴</span>
                        </summary>
                        <div className="border-t border-stone-150 p-4 space-y-6">
                          <UnproductiveDaysCard
                            projectId={selectedProjectId}
                            days={unproductiveDays.filter((d: any) => d.projectId === selectedProjectId)}
                            onAdd={() => {}}
                            onRemove={() => {}}
                            readOnly={true}
                          />
                          <AcompanhamentoFisico
                            projectId={selectedProjectId}
                            project={projects.find(p => p.id === selectedProjectId)}
                            timelinePhases={timelinePhases}
                            weeklyLogs={physicalWeeklyLogs}
                            readOnly={true}
                            transactions={transactions}
                          />
                          <QuotationMaps
                            projectId={selectedProjectId}
                            project={projects.find(p => p.id === selectedProjectId)}
                            readOnly={true}
                            clientName={client.name}
                            addTransaction={onAddTransaction}
                          />
                        </div>
                      </details>
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
            className="w-full max-w-md bg-white border border-stone-200 rounded-2xl p-6 md:p-8 shadow-2xl relative"
          >
            <div className="flex justify-between items-start mb-6">
              <div>
                <span className="text-[length:var(--ui-text-xs)] font-mono text-stone-400 uppercase tracking-widest block">Detalhes do Custo</span>
                <h4 className="font-serif text-lg text-stone-900 mt-1">Lançamento Consolidado</h4>
              </div>
              <button
                id="close_modal_btn"
                onClick={() => setSelectedTx(null)}
                className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-stone-400 hover:text-stone-800 hover:bg-stone-100 transition-colors cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="border-b border-stone-100 pb-3">
                <p className="text-[length:var(--ui-text-xs)] font-mono text-stone-400 uppercase tracking-wider">Descrição</p>
                <p className="font-semibold text-stone-900 mt-0.5">{selectedTx.description}</p>
              </div>

              <div className="grid grid-cols-2 gap-4 border-b border-stone-100 pb-3">
                <div>
                  <p className="text-[length:var(--ui-text-xs)] font-mono text-stone-400 uppercase tracking-wider">Valor do Lançamento</p>
                  <p className="text-sm font-semibold text-stone-900 mt-0.5">{formatCurrency(selectedTx.value)}</p>
                </div>
                <div>
                  <p className="text-[length:var(--ui-text-xs)] font-mono text-stone-400 uppercase tracking-wider">Status do Pagamento</p>
                  <div className="mt-1">{getStatusBadge(selectedTx.status)}</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 border-b border-stone-100 pb-3">
                <div>
                  <p className="text-[length:var(--ui-text-xs)] font-mono text-stone-400 uppercase tracking-wider">Data do Lançamento</p>
                  <p className="text-stone-800 mt-0.5">{formatDateBR(selectedTx.date)}</p>
                </div>
                <div>
                  <p className="text-[length:var(--ui-text-xs)] font-mono text-stone-400 uppercase tracking-wider">Categoria</p>
                  <p className="text-stone-800 mt-0.5 font-medium">{getCategoryLabel(selectedTx.category)}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 border-b border-stone-100 pb-3">
                <div>
                  <p className="text-[length:var(--ui-text-xs)] font-mono text-stone-400 uppercase tracking-wider">Fornecedor / Prestador</p>
                  <p className="text-stone-800 mt-0.5">{selectedTx.supplier}</p>
                </div>
                <div>
                  <p className="text-[length:var(--ui-text-xs)] font-mono text-stone-400 uppercase tracking-wider">Nº NF / Comprovante</p>
                  <p className="text-stone-800 mt-0.5 font-mono">{selectedTx.invoiceNumber || '—'}</p>
                </div>
              </div>

              {selectedTx.notes && (
                <div className="border-b border-stone-100 pb-3">
                  <p className="text-[length:var(--ui-text-xs)] font-mono text-stone-400 uppercase tracking-wider">Observações Técnicas</p>
                  <p className="text-stone-600 mt-0.5 italic">{selectedTx.notes}</p>
                </div>
              )}

              <div>
                <p className="text-[length:var(--ui-text-xs)] font-mono text-stone-400 uppercase tracking-wider">Comprovante / Nota Fiscal</p>
                {selectedTx.receiptName ? (
                  <div className="mt-2 bg-stone-50 border border-stone-200 rounded-lg p-2.5 flex items-center justify-between">
                    <div className="flex items-center gap-2 max-w-[70%]">
                      <FileText size={14} className="text-stone-400 flex-shrink-0" />
                      <span className="font-mono text-[length:var(--ui-text-xs)] text-stone-600 truncate" title={selectedTx.receiptName}>{selectedTx.receiptName}</span>
                    </div>
                    {(selectedTx.receiptUrl || selectedTx.receiptBase64) ? (
                      <a
                        href={selectedTx.receiptUrl || selectedTx.receiptBase64}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[length:var(--ui-text-xs)] font-mono uppercase bg-[#18181b] text-white px-2.5 py-1 rounded-full font-bold hover:bg-black transition-colors cursor-pointer"
                      >
                        Abrir Nota ↗
                      </a>
                    ) : (
                      <span className="text-[length:var(--ui-text-xs)] font-mono uppercase text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">Auditado</span>
                    )}
                  </div>
                ) : (
                  <p className="text-stone-400 mt-1 italic text-[length:var(--ui-text-xs)]">Sem comprovante anexado a esta via.</p>
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
            className="w-full max-w-4xl bg-stone-100 border border-stone-200 rounded-2xl overflow-hidden shadow-2xl relative flex flex-col md:flex-row max-h-[90vh]"
          >
            {/* Left Column: Metadata & Technical Information */}
            <div className="w-full md:w-80 bg-[#1E1E1E] text-stone-300 p-6 flex flex-col justify-between font-mono text-[length:var(--ui-text-xs)] flex-shrink-0">
              <div className="space-y-6">
                <div className="border-b border-stone-800 pb-4">
                  <span className="text-[length:var(--ui-text-xs)] text-[#FF5A35] font-bold uppercase tracking-widest">Via do Cliente</span>
                  <h3 className="font-serif text-sm font-bold text-white mt-1 break-words">{previewDoc.name}</h3>
                  <p className="text-[length:var(--ui-text-xs)] text-stone-500 mt-1 uppercase font-mono">ID: {previewDoc.id}</p>
                </div>

                <div className="space-y-4">
                  <div>
                    <span className="text-stone-500 block uppercase tracking-wider text-[length:var(--ui-text-xs)]">Descrição do Anexo</span>
                    <p className="text-stone-300 mt-1 font-sans text-xs leading-relaxed">{previewDoc.description || 'Nenhum memorial ou descrição extra fornecida pela equipe técnica.'}</p>
                  </div>

                  <div>
                    <span className="text-stone-500 block uppercase tracking-wider text-[length:var(--ui-text-xs)]">Metadados Administrativos</span>
                    <div className="mt-1.5 space-y-1.5 text-[length:var(--ui-text-xs)] text-stone-400">
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
                <span className="text-[length:var(--ui-text-xs)] text-stone-500 block uppercase">Chaves Brites Correa</span>
                <button
                  type="button"
                  onClick={() => setPreviewDoc(null)}
                  className="w-full bg-stone-800 hover:bg-stone-700 text-stone-200 hover:text-white py-2 px-4 rounded-full uppercase tracking-wider font-bold transition-colors text-[length:var(--ui-text-xs)] cursor-pointer border-0"
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
                      <span className="block text-[length:var(--ui-text-xs)] font-mono text-stone-400 uppercase mb-2">Visualização de Imagem Anexada</span>
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
                        <span className="text-[length:var(--ui-text-xs)] font-mono font-bold text-red-700 bg-red-100 px-1 py-0.5 rounded uppercase tracking-wider">PDF</span>
                        <div className="space-y-1 w-full">
                          <div className="h-1 bg-red-200 rounded w-5/6 mx-auto"></div>
                          <div className="h-1 bg-red-200 rounded w-4/6 mx-auto"></div>
                        </div>
                        <span className="text-xs">📄</span>
                      </div>

                      <div className="space-y-1.5">
                        <h4 className="font-serif text-sm font-bold text-stone-900">{previewDoc.fileName || previewDoc.name}</h4>
                        <p className="text-[length:var(--ui-text-xs)] font-mono text-stone-500 uppercase tracking-wider">Arquivo disponível para download e visualização digital</p>
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
                          className="bg-red-700 hover:bg-red-800 text-white font-mono text-[length:var(--ui-text-xs)] font-bold py-2.5 px-4 rounded-full uppercase tracking-wider transition-colors flex items-center justify-center gap-2 shadow-xs cursor-pointer text-center"
                        >
                          <ExternalLink size={12} />
                          Visualizar em Nova Aba
                        </a>
                        <button
                          type="button"
                          onClick={() => handleDownloadDoc(previewDoc)}
                          className="bg-[#18181b] hover:bg-black text-white font-mono text-[length:var(--ui-text-xs)] font-bold py-2.5 px-4 rounded-full uppercase tracking-wider transition-colors flex items-center justify-center gap-2 shadow-xs cursor-pointer text-center"
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
                    <div className="font-mono text-[length:var(--ui-text-xs)] tracking-widest uppercase text-stone-500 font-bold">República Federativa do Brasil</div>
                    <h4 className="font-bold text-xs uppercase tracking-wider font-serif text-stone-900">CHAVES BRITES CORREA LTDA</h4>
                    <p className="text-[length:var(--ui-text-xs)] font-mono text-stone-600 uppercase tracking-wide">Engenharia de Infraestrutura e Gestão de Obras Civis</p>
                  </div>

                  <div className="space-y-4">
                    <div className="bg-stone-50 p-4 border border-stone-200">
                      <h3 className="font-serif text-xs font-bold uppercase tracking-wider text-stone-800 border-b border-stone-200 pb-1.5 mb-2">Comunicação Oficial Interna</h3>
                      <p className="text-[length:var(--ui-text-xs)] leading-relaxed text-stone-700 font-serif whitespace-pre-line">{previewDoc.description || 'Não há detalhes adicionais cadastrados.'}</p>
                    </div>

                    <div className="flex justify-between items-end pt-10 font-mono text-[length:var(--ui-text-xs)] text-stone-400">
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
          <p className="font-mono text-[length:var(--ui-text-xs)] uppercase tracking-widest text-[#73736E]">
            © {new Date().getFullYear()} CHAVES BRITES CORREA. TODOS OS DIREITOS RESERVADOS.
          </p>
          <div className="flex items-center gap-2 text-[length:var(--ui-text-xs)] font-mono text-stone-400">
            <CheckCircle2 size={12} style={{ color: '#10b981' }} />
            Vias auditadas e integradas com o centro de custo
          </div>
        </div>
      </footer>
    </div>
  );
}
