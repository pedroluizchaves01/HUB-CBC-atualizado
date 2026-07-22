import React, { useState, useMemo, useEffect } from 'react';
import { Client, Project, Transaction, TransactionCategory, TransactionStatus, ProjectType, ProjectStatus, ProjectDocument, DocumentClass, DocumentStatus, MaterialItem, Contract, User } from '../types';
import { 
  Users, 
  Layers, 
  TrendingUp, 
  Plus, 
  Trash2, 
  Edit, 
  LogOut, 
  DollarSign, 
  Briefcase, 
  PiggyBank, 
  Filter, 
  Search, 
  Clock, 
  CheckCircle, 
  AlertTriangle, 
  FileText, 
  Sliders, 
  Building,
  UserCheck,
  ChevronRight,
  Info,
  Printer,
  Download,
  Sun,
  CloudRain,
  Cloud,
  Camera,
  Calendar,
  Eye,
  Maximize2,
  Minimize2,
  X,
  ExternalLink,
  Megaphone,
  Send,
  Settings,
  Database,
  FileSignature,
  Kanban
} from 'lucide-react';
import { motion } from 'motion/react';
import { PlanningMaterials } from './PlanningMaterials';
import { PlanningSchedule } from './PlanningSchedule';
import { PlanningLaborPayments } from './PlanningLaborPayments';
import AcompanhamentoFinanceiro from './AcompanhamentoFinanceiro';
import AcompanhamentoFisico from './AcompanhamentoFisico';
import QuotationMaps from './QuotationMaps';
import { OfficeManagement } from './OfficeManagement';
import { MarketingManagement } from './MarketingManagement';
import { subscribeCollection, saveDoc, removeDoc } from '../lib/firebaseDb';
import { uploadFileToFirebase } from '../lib/firebaseStorage';
import { getTelegramConfig, buildTelegramFileName } from '../lib/telegramService';
import { TelegramSettings } from './TelegramSettings';
import ContractGeneration from './ContractGeneration';
import Demandas from './Demandas';
import NotificationBell from './NotificationBell';


interface AdminDashboardProps {
  role?: string;
  clients: Client[];
  projects: Project[];
  transactions: Transaction[];
  documents: ProjectDocument[];
  contracts: Contract[];
  users: User[];
  onLogout: () => void;
  onAddClient: (client: Client, pass: string) => Promise<void>;
  onEditClient: (client: Client, pass?: string) => Promise<void>;
  onDeleteClient: (id: string) => Promise<void>;
  onAddProject: (project: Project) => Promise<void>;
  onEditProject: (project: Project) => Promise<void>;
  onDeleteProject: (id: string) => Promise<void>;
  onAddTransaction: (tx: Transaction) => Promise<void>;
  onEditTransaction: (tx: Transaction) => Promise<void>;
  onDeleteTransaction: (id: string) => Promise<void>;
  onAddDocument: (doc: ProjectDocument) => Promise<void>;
  onEditDocument: (doc: ProjectDocument) => Promise<void>;
  onDeleteDocument: (id: string) => Promise<void>;
  onAddContract: (contract: Contract) => Promise<void>;
  onEditContract: (contract: Contract) => Promise<void>;
  onDeleteContract: (id: string) => Promise<void>;
}

type TabType = 'resumo' | 'clientes' | 'projetos' | 'escritorio' | 'marketing' | 'classe_administrativo' | 'classe_planejamento' | 'classe_acompanhamento' | 'contratos' | 'demandas' | 'telegram';

export default function AdminDashboard({
  role,
  clients,
  projects,
  transactions,
  documents,
  contracts,
  users,
  onLogout,
  onAddClient,
  onEditClient,
  onDeleteClient,
  onAddProject,
  onEditProject,
  onDeleteProject,
  onAddTransaction,
  onEditTransaction,
  onDeleteTransaction,
  onAddDocument,
  onEditDocument,
  onDeleteDocument,
  onAddContract,
  onEditContract,
  onDeleteContract
}: AdminDashboardProps) {
  // Navigation State
  const [activeTab, setActiveTab] = useState<TabType>(role === 'marketing' ? 'marketing' : 'resumo');
  const [selectedDashboardProjId, setSelectedDashboardProjId] = useState<string | null>(null);
  const [selectedDashboardClientId, setSelectedDashboardClientId] = useState<string | null>(null);
  const [selectedDocProjectId, setSelectedDocProjectId] = useState<string>('all');
  const [activeDocClassTab, setActiveDocClassTab] = useState<DocumentClass>('administrativo');

  // Selected project for the 3 Class Modules
  const [selectedClassProjectId, setSelectedClassProjectId] = useState<string>(
    projects.length > 0 ? projects[0].id : ''
  );

  // Block-specific selections and collapse states for planning
  const [cronogramaProjectId, setCronogramaProjectId] = useState<string>(
    projects.length > 0 ? projects[0].id : ''
  );
  const [materiaisProjectId, setMateriaisProjectId] = useState<string>(
    projects.length > 0 ? projects[0].id : ''
  );
  const [laborProjectId, setLaborProjectId] = useState<string>(
    projects.length > 0 ? projects[0].id : ''
  );
  const [isCronogramaCollapsed, setIsCronogramaCollapsed] = useState<boolean>(false);
  const [isMateriaisCollapsed, setIsMateriaisCollapsed] = useState<boolean>(false);
  const [isLaborCollapsed, setIsLaborCollapsed] = useState<boolean>(false);

  // Synchronize project selection states when projects load or change from Firestore
  useEffect(() => {
    if (projects.length > 0) {
      const firstProjId = projects[0].id;
      const validProjectIds = projects.map(p => p.id);

      if (!selectedClassProjectId || !validProjectIds.includes(selectedClassProjectId)) {
        setSelectedClassProjectId(firstProjId);
      }
      if (!cronogramaProjectId || !validProjectIds.includes(cronogramaProjectId)) {
        setCronogramaProjectId(firstProjId);
      }
      if (!materiaisProjectId || !validProjectIds.includes(materiaisProjectId)) {
        setMateriaisProjectId(firstProjId);
      }
      if (!laborProjectId || !validProjectIds.includes(laborProjectId)) {
        setLaborProjectId(firstProjId);
      }
    }
  }, [projects, selectedClassProjectId, cronogramaProjectId, materiaisProjectId, laborProjectId]);

  // Default values
  const INITIAL_MATERIALS = [
    { id: 'mat-1', projectId: 'project-1', name: 'Cimento CP II - Votoran', quantity: '50 sacos', unit: 'sacos', unitValue: 35, supplier: 'Comercial Gerdau', estimatedValue: 1750, orderDate: '2026-02-22', deliveryDate: '2026-02-25', notes: 'Estocagem organizada no galpão.' },
    { id: 'mat-2', projectId: 'project-1', name: 'Porcelanato Técnico Crema Retificado', quantity: '120 m²', unit: 'm²', unitValue: 123.33, supplier: 'Portobello Shop', estimatedValue: 14800, orderDate: '2026-03-10', deliveryDate: '2026-03-20', notes: 'Específico para áreas de alto tráfego.' },
    { id: 'mat-3', projectId: 'project-1', name: 'Gesso Acartonado Drywall RU', quantity: '80 chapas', unit: 'chapas', unitValue: 52.5, supplier: 'Leroy Merlin', estimatedValue: 4200, orderDate: '2026-03-22', deliveryDate: '2026-03-24', notes: 'Gesso verde, resistente à umidade, para banheiros.' },
    { id: 'mat-4', projectId: 'project-2', name: 'Madeira MLC Vigas Estruturais', quantity: '18 vigas', unit: 'vigas', unitValue: 10277.78, supplier: 'Amata MLC', estimatedValue: 185000, orderDate: '2026-04-05', deliveryDate: '2026-04-28', notes: 'Vigas prontas para ancoragem metálica.' },
    { id: 'mat-5', projectId: 'project-2', name: 'Telha Termoacústica Sanduíche', quantity: '420 m²', unit: 'm²', unitValue: 85.71, supplier: 'Perfilor S.A.', estimatedValue: 36000, orderDate: '2026-06-20', deliveryDate: '2026-07-15', notes: 'Isolamento termoacústico para a cobertura principal.' }
  ];

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
    { id: 'reg-1-4', projectId: 'project-1', name: 'Certificado de Habite-se Especial', status: 'Pendente', date: '', notes: 'Ficará para após conclusão da fase civil mestre.' },

    { id: 'reg-2-1', projectId: 'project-2', name: 'Licença Ambiental CETESB', status: 'Emitido', date: '2026-03-18', notes: 'Autorização deferida para supressão vegetal pontual.' },
    { id: 'reg-2-2', projectId: 'project-2', name: 'Alvará de Construção Bragança Paulista', status: 'Emitido', date: '2026-03-24', notes: 'Alvará de obras residenciais assinado.' },
    { id: 'reg-2-3', projectId: 'project-2', name: 'Autorização Administrativa do Condomínio Quinta da Baroneza', status: 'Emitido', date: '2026-03-15', notes: 'Aprovado em comissão de arquitetura do condomínio.' }
  ];

  const INITIAL_WEEKLY_LOGS = [
    {
      id: 'wl-1-1',
      projectId: 'project-1',
      date: '2026-02-25',
      weekLabel: 'Semana 1 - Demolições',
      description: 'Demolição de alvenarias internas na recepção concluída. Início da remoção do piso cerâmico antigo. Caçambas para descarte de entulho devidamente posicionadas e licenciadas.',
      phaseProgressions: { 'phase-1-1': 50, 'phase-1-2': 0, 'phase-1-3': 0, 'phase-1-4': 0 },
      photos: [
        { id: 'p-1-1', url: 'https://images.unsplash.com/photo-1581094288338-2314dddb7eed?auto=format&fit=crop&w=400&q=80', name: 'demolicao_recepcao.jpg' }
      ]
    },
    {
      id: 'wl-1-2',
      projectId: 'project-1',
      date: '2026-03-05',
      weekLabel: 'Semana 2 - Limpeza Geral',
      description: 'Limpeza e demolição concluídas com sucesso. O canteiro está totalmente desimpedido para a entrada das equipes de hidráulica civil.',
      phaseProgressions: { 'phase-1-1': 100, 'phase-1-2': 0, 'phase-1-3': 0, 'phase-1-4': 0 },
      photos: [
        { id: 'p-1-2', url: 'https://images.unsplash.com/photo-1590069261209-f8e9b8642343?auto=format&fit=crop&w=400&q=80', name: 'canteiro_limpo.jpg' }
      ]
    },
    {
      id: 'wl-1-3',
      projectId: 'project-1',
      date: '2026-03-15',
      weekLabel: 'Semana 3 - Hidráulica Inicial',
      description: 'Rasgos em paredes de consultórios concluídos. Instalação das prumadas centrais e ramais de cobre de água fria/quente executados com êxito.',
      phaseProgressions: { 'phase-1-1': 100, 'phase-1-2': 50, 'phase-1-3': 0, 'phase-1-4': 0 },
      photos: [
        { id: 'p-1-3', url: 'https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=400&q=80', name: 'tubulacao_cobre.jpg' }
      ]
    },
    {
      id: 'wl-1-4',
      projectId: 'project-1',
      date: '2026-03-25',
      weekLabel: 'Semana 4 - Hidráulica Concluída',
      description: 'Testes de estanqueidade e pressão concluídos em todos os ramais de hidráulica. Aprovação total sem vazamentos detetados. Início da infraestrutura de elétrica geral.',
      phaseProgressions: { 'phase-1-1': 100, 'phase-1-2': 100, 'phase-1-3': 10, 'phase-1-4': 0 },
      photos: [
        { id: 'p-1-4', url: 'https://images.unsplash.com/photo-1581094794329-c8112a89af12?auto=format&fit=crop&w=400&q=80', name: 'teste_pressao.jpg' }
      ]
    },
    {
      id: 'wl-1-5',
      projectId: 'project-1',
      date: '2026-04-10',
      weekLabel: 'Semana 5 - Elétrica & Drywall',
      description: 'Passagem de eletrodutos flexíveis e fiação principal em andamento. Chapeamento das faces internas das paredes in drywall iniciada nos consultórios 1 e 2.',
      phaseProgressions: { 'phase-1-1': 100, 'phase-1-2': 100, 'phase-1-3': 60, 'phase-1-4': 0 },
      photos: [
        { id: 'p-1-5', url: 'https://images.unsplash.com/photo-1621905251189-08b45d6a269e?auto=format&fit=crop&w=400&q=80', name: 'chapeamento_drywall.jpg' }
      ]
    },
    {
      id: 'wl-1-6',
      projectId: 'project-1',
      date: '2026-04-20',
      weekLabel: 'Semana 6 - Acabamentos Iniciais',
      description: 'Paredes em drywall 85% concluídas. Instalação das caixas de elétrica prontas. Início do assentamento de porcelanato técnico retificado na recepção.',
      phaseProgressions: { 'phase-1-1': 100, 'phase-1-2': 100, 'phase-1-3': 85, 'phase-1-4': 20 },
      photos: [
        { id: 'p-1-6', url: 'https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=400&q=80', name: 'piso_recepcao.jpg' }
      ]
    }
  ];

  // States with raw data
  const [materialsList, setMaterialsListState] = useState<any[]>([]);
  const [dailyLogs, setDailyLogsState] = useState<any[]>([]);
  const [timelinePhases, setTimelinePhasesState] = useState<any[]>([]);
  const [punchLists, setPunchListsState] = useState<any[]>([]);
  const [regulatorySteps, setRegulatoryStepsState] = useState<any[]>([]);
  const [physicalWeeklyLogs, setPhysicalWeeklyLogsState] = useState<any[]>([]);

  // Subscriptions to Firestore
  React.useEffect(() => {
    const unsubMaterials = subscribeCollection('materials', setMaterialsListState, INITIAL_MATERIALS, 'cbc_materials_v2');
    const unsubDailyLogs = subscribeCollection('daily_logs', setDailyLogsState, INITIAL_DAILY_LOGS, 'cbc_daily_logs_v2');
    const unsubTimeline = subscribeCollection('timeline_phases', setTimelinePhasesState, INITIAL_TIMELINE_PHASES, 'cbc_timeline_phases_v2');
    const unsubPunch = subscribeCollection('punch_lists', setPunchListsState, INITIAL_PUNCH_LISTS, 'cbc_punch_lists_v2');
    const unsubReg = subscribeCollection('regulatory_steps', setRegulatoryStepsState, INITIAL_REGULATORY_STEPS, 'cbc_regulatory_steps_v2');
    const unsubWeekly = subscribeCollection('weekly_logs', setPhysicalWeeklyLogsState, INITIAL_WEEKLY_LOGS, 'cbc_physical_weekly_logs_v2');

    return () => {
      unsubMaterials();
      unsubDailyLogs();
      unsubTimeline();
      unsubPunch();
      unsubReg();
      unsubWeekly();
    };
  }, []);

  // Navegação via clique em notificação: abre a aba correspondente à coleção alterada
  // e, quando aplicável, seleciona o projeto do item. Componentes específicos (ex.:
  // QuotationMaps) também escutam 'cbc:navigate' para focar o item exato.
  React.useEffect(() => {
    const COLLECTION_TO_TAB: Record<string, TabType> = {
      clients: 'clientes',
      projects: 'projetos',
      documents: 'classe_administrativo',
      contracts: 'contratos',
      demands: 'demandas',
      office_transactions: 'escritorio',
      office_leads: 'escritorio',
      marketing_outbound: 'marketing',
      marketing_posts: 'marketing',
      marketing_press: 'marketing',
      materials: 'classe_planejamento',
      labor_contracts: 'classe_planejamento',
      labor_payments: 'classe_planejamento',
      transactions: 'classe_acompanhamento',
      daily_logs: 'classe_acompanhamento',
      timeline_phases: 'classe_acompanhamento',
      punch_lists: 'classe_acompanhamento',
      weekly_logs: 'classe_acompanhamento',
      regulatory_steps: 'classe_acompanhamento',
      quotation_maps: 'classe_acompanhamento',
      unified_suppliers: 'classe_acompanhamento',
      unified_materials: 'classe_acompanhamento',
    };
    const onNavigate = (e: Event) => {
      const detail = (e as CustomEvent).detail as { collection?: string; entityId?: string; projectId?: string | null };
      if (!detail?.collection) return;
      const tab = COLLECTION_TO_TAB[detail.collection];
      if (!tab) return;
      if (detail.projectId) setSelectedClassProjectId(detail.projectId);
      setActiveTab(tab);
    };
    window.addEventListener('cbc:navigate', onNavigate);
    return () => window.removeEventListener('cbc:navigate', onNavigate);
  }, []);

  // Generic updater to Firestore helper
  const syncToFirestore = async (collectionName: string, prevList: any[], nextList: any[]) => {
    try {
      const prevIds = prevList.map(x => x.id);
      const nextIds = nextList.map(x => x.id);
      const deletedIds = prevIds.filter(id => !nextIds.includes(id));

      for (const id of deletedIds) {
        await removeDoc(collectionName, id);
      }

      for (const item of nextList) {
        const prevItem = prevList.find(x => x.id === item.id);
        if (!prevItem || JSON.stringify(prevItem) !== JSON.stringify(item)) {
          await saveDoc(collectionName, item.id, item);
        }
      }
    } catch (err) {
      console.error(`Erro ao sincronizar ${collectionName} com o Firestore:`, err);
    }
  };

  // Dispatchers exposed as normal state functions to preserve nested child behaviors
  const setMaterialsList = (action: any) => {
    const nextList = typeof action === 'function' ? action(materialsList) : action;
    setMaterialsListState(nextList);
    syncToFirestore('materials', materialsList, nextList);
  };

  const setDailyLogs = (action: any) => {
    const nextList = typeof action === 'function' ? action(dailyLogs) : action;
    setDailyLogsState(nextList);
    syncToFirestore('daily_logs', dailyLogs, nextList);
  };

  const setTimelinePhases = (action: any) => {
    const nextList = typeof action === 'function' ? action(timelinePhases) : action;
    setTimelinePhasesState(nextList);
    syncToFirestore('timeline_phases', timelinePhases, nextList);
  };

  const setPunchLists = (action: any) => {
    const nextList = typeof action === 'function' ? action(punchLists) : action;
    setPunchListsState(nextList);
    syncToFirestore('punch_lists', punchLists, nextList);
  };

  const setRegulatorySteps = (action: any) => {
    const nextList = typeof action === 'function' ? action(regulatorySteps) : action;
    setRegulatoryStepsState(nextList);
    syncToFirestore('regulatory_steps', regulatorySteps, nextList);
  };

  const setPhysicalWeeklyLogs = (action: any) => {
    const nextList = typeof action === 'function' ? action(physicalWeeklyLogs) : action;
    setPhysicalWeeklyLogsState(nextList);
    syncToFirestore('weekly_logs', physicalWeeklyLogs, nextList);
  };



  // AI schedule auto-fill states
  const [aiPlanningFile, setAiPlanningFile] = useState<File | null>(null);
  const [aiPlanningLoading, setAiPlanningLoading] = useState<boolean>(false);
  const [aiPlanningError, setAiPlanningError] = useState<string | null>(null);
  const [aiPlanningStep, setAiPlanningStep] = useState<string>('');
  const [extractedPhases, setExtractedPhases] = useState<any[] | null>(null);
  const [isAiConfirmOpen, setIsAiConfirmOpen] = useState<boolean>(false);

  const handleAiPlanningUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const file = files[0];
      const validExtensions = ['.pdf', '.xlsx', '.xls'];
      const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
      if (validExtensions.includes(ext) || file.type === 'application/pdf') {
        setAiPlanningFile(file);
        setAiPlanningError(null);
      } else {
        setAiPlanningError('Formato inválido. Envie apenas arquivos PDF ou Excel (.pdf, .xlsx, .xls)');
        setAiPlanningFile(null);
      }
    }
  };

  const handleProcessPlanningWithAi = async () => {
    if (!aiPlanningFile) return;

    setAiPlanningLoading(true);
    setAiPlanningError(null);
    setAiPlanningStep('Lendo arquivo...');

    const steps = [
      'Lendo arquivo e decodificando conteúdo...',
      'Processando dados com a Inteligência Artificial Gemini...',
      'Mapeando etapas de obra e identificando prazos...',
      'Calculando custos previstos e reais das etapas...',
      'Organizando cronograma físico-financeiro...'
    ];

    let stepIndex = 0;
    const interval = setInterval(() => {
      if (stepIndex < steps.length - 1) {
        stepIndex++;
        setAiPlanningStep(steps[stepIndex]);
      }
    }, 4000);

    try {
      // Read file as base64
      const reader = new FileReader();
      const filePromise = new Promise<string>((resolve, reject) => {
        reader.onload = (event) => {
          const result = event.target?.result as string;
          resolve(result.split(',')[1]);
        };
        reader.onerror = (error) => reject(error);
        reader.readAsDataURL(aiPlanningFile);
      });

      const base64Data = await filePromise;
      let mimeType = aiPlanningFile.type;
      if (!mimeType) {
        if (aiPlanningFile.name.endsWith('.pdf')) mimeType = 'application/pdf';
        else if (aiPlanningFile.name.endsWith('.xlsx')) mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        else if (aiPlanningFile.name.endsWith('.xls')) mimeType = 'application/vnd.ms-excel';
      }

      const response = await fetch('/api/planning/parse-document', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          fileBase64: base64Data,
          mimeType,
          fileName: aiPlanningFile.name
        })
      });

      clearInterval(interval);

      if (!response.ok) {
        let serverMessage = 'Falha no servidor ao analisar o arquivo.';
        try {
          const errJson = await response.json();
          if (errJson?.error) serverMessage = errJson.error;
        } catch {}
        throw new Error(serverMessage);
      }

      const data = await response.json();
      if (data.success && data.phases) {
        setExtractedPhases(data.phases);
        setIsAiConfirmOpen(true);
      } else {
        throw new Error('Nenhuma etapa pôde ser extraída pela IA. Tente outro arquivo.');
      }
    } catch (err: any) {
      clearInterval(interval);
      console.error(err);
      setAiPlanningError(err.message || 'Houve um erro ao processar o arquivo com IA. Por favor, verifique se o arquivo não está corrompido ou tente novamente.');
    } finally {
      setAiPlanningLoading(false);
    }
  };

  const handleApplyAiPhases = (shouldReplace: boolean) => {
    if (!extractedPhases) return;

    // Build timeline phase objects with unique IDs, linked to the active cronogramaProjectId
    const newPhases = extractedPhases.map((p, idx) => ({
      id: `phase-ai-${Date.now()}-${idx}`,
      projectId: cronogramaProjectId,
      name: p.name || 'Fase sem nome',
      startDate: p.startDate || new Date().toISOString().split('T')[0],
      endDate: p.endDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      progress: p.progress !== undefined ? Number(p.progress) : 0,
      costPrev: p.costPrev !== undefined ? Number(p.costPrev) : 0,
      costReal: p.costReal !== undefined ? Number(p.costReal) : 0,
      monthlyProgress: p.monthlyProgress || {}
    }));

    if (shouldReplace) {
      // Replace only the active project's phases
      setTimelinePhases(prev => [
        ...prev.filter(ph => ph.projectId !== cronogramaProjectId),
        ...newPhases
      ]);
    } else {
      // Append to the active project's phases
      setTimelinePhases(prev => [...prev, ...newPhases]);
    }

    // Reset states
    setExtractedPhases(null);
    setAiPlanningFile(null);
    setIsAiConfirmOpen(false);
  };

  // Form input states
  const [contractForm, setContractForm] = useState({
    object: 'Execução de reforma civil comercial, forro acústico, rede hidráulica de consultórios e pintura fina de acabamento',
    paymentTerms: '30% entrada em contrato, 30% na entrega de Drywall/divisórias, 40% na entrega de chaves com vistoria.',
    penalties: 'Multa de 2% por atraso injustificado superior a 5 dias úteis, e juros de 1% ao mês.',
    isGenerated: false,
    isSigned: false
  });

  const [logInput, setLogInput] = useState({
    date: new Date().toISOString().split('T')[0],
    weather: 'Ensolarado',
    workforce: 5,
    description: '',
    loggedBy: 'Eng. Chaves'
  });

  const [punchInput, setPunchInput] = useState({
    task: '',
    priority: 'Média' as 'Baixa' | 'Média' | 'Alta'
  });

  const [phaseInput, setPhaseInput] = useState({
    name: '',
    startDate: new Date().toISOString().split('T')[0],
    endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    progress: 0,
    costPrev: '',
    costReal: '0',
    monthlyProgress: {} as Record<string, number>
  });

  const [bufferSlider, setBufferSlider] = useState<number>(10); // default 10% contingency buffer

  // States for administrative document uploading
  const [selectedPdfFile, setSelectedPdfFile] = useState<File | null>(null);
  const [pdfUploadError, setPdfUploadError] = useState<string | null>(null);
  const [selectedDocCategory, setSelectedDocCategory] = useState<string>('contrato');

  const [editingAdminDoc, setEditingAdminDoc] = useState<ProjectDocument | null>(null);
  const [adminDocName, setAdminDocName] = useState<string>('');
  const [adminDocDesc, setAdminDocDesc] = useState<string>('');

  // In-memory files storage for downloads, preview state, and full-screen schedule editing
  const [fileBlobs, setFileBlobs] = useState<Record<string, File>>({});
  const [previewDoc, setPreviewDoc] = useState<ProjectDocument | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isFullScreenEditOpen, setIsFullScreenEditOpen] = useState<boolean>(false);

  useEffect(() => {
    if (previewDoc) {
      const realFile = fileBlobs[previewDoc.id];
      if (realFile) {
        const url = URL.createObjectURL(realFile);
        setPreviewUrl(url);
        return () => {
          URL.revokeObjectURL(url);
        };
      } else if (previewDoc.fileUrl) {
        setPreviewUrl(previewDoc.fileUrl);
        return undefined;
      }
    }
    setPreviewUrl(null);
    return undefined;
  }, [previewDoc, fileBlobs]);

  // Custom alert/confirm popups to bypass iframe blocks and enhance UX
  const [adminDocDeleteConfirm, setAdminDocDeleteConfirm] = useState<{ isOpen: boolean; docId: string; docName: string } | null>(null);
  const [adminDocSaveConfirm, setAdminDocSaveConfirm] = useState<{ isOpen: boolean; isEdit: boolean; payload: any } | null>(null);
  const [saveDocStatus, setSaveDocStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [saveDocError, setSaveDocError] = useState<string | null>(null);

  // Automatically reset status when save modal is closed or opened
  useEffect(() => {
    if (adminDocSaveConfirm?.isOpen) {
      setSaveDocStatus('idle');
      setSaveDocError(null);
    }
  }, [adminDocSaveConfirm]);

  // Planning Tab States
  const [planningViewMode, setPlanningViewMode] = useState<'analytical' | 'synthetic'>('analytical');
  const [editingPhase, setEditingPhase] = useState<any | null>(null);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState<boolean>(false);
  const [printType, setPrintType] = useState<'analytical' | 'synthetic' | 'both'>('both');
  const [phaseDeleteConfirm, setPhaseDeleteConfirm] = useState<{ isOpen: boolean; phaseId: string; phaseName: string } | null>(null);
  const [phaseSaveConfirm, setPhaseSaveConfirm] = useState<{ isOpen: boolean; isEdit: boolean; payload: any } | null>(null);
  const [phaseFormError, setPhaseFormError] = useState<string | null>(null);

  const handleCancelAdminDocEdit = () => {
    setEditingAdminDoc(null);
    setAdminDocName('');
    setAdminDocDesc('');
    setSelectedPdfFile(null);
    setPdfUploadError(null);
  };

  const handleDownloadDoc = (doc: ProjectDocument) => {
    const realFile = fileBlobs[doc.id];
    if (realFile) {
      const url = URL.createObjectURL(realFile);
      const a = document.createElement('a');
      a.href = url;
      a.download = realFile.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      return;
    }

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
    content += `ID DO DOCUMENTO: ${doc.id}\n`;
    content += `NOME DO ARQUIVO: ${doc.fileName || 'documento.pdf'}\n`;
    content += `TÍTULO: ${doc.name}\n`;
    content += `DESCRIÇÃO: ${doc.description || 'Sem descrição cadastrada.'}\n`;
    content += `CATEGORIA: ${doc.category ? doc.category.toUpperCase() : 'OUTROS'}\n`;
    content += `MÓDULO DE TRABALHO: ADMINISTRATIVO\n`;
    content += `DATA DE EMISSÃO: ${doc.uploadedAt}\n`;
    content += `STATUS DE HOMOLOGAÇÃO: ${doc.status ? doc.status.toUpperCase() : 'APROVADO'}\n\n`;
    content += `--------------------------------------------------\n`;
    content += `TERMO DE COMPROMISSO E CONFORMIDADE DE DOCUMENTO\n`;
    content += `--------------------------------------------------\n\n`;
    
    if (doc.category === 'contrato') {
      content += `Pelo presente instrumento de Contrato de Prestação de Serviços Técnicos de Arquitetura e Engenharia Civil, de um lado CHAVES BRITES CORREA (doravante contratada) e do outro lado o CONTRATANTE identificado no escopo do projeto ativo, pactuam e ajustam os termos gerais de remuneração, direitos, obrigações de ambas as partes, e prazos vinculados ao respectivo cronograma físico-financeiro planejado.\n\n`;
      content += `O presente contrato encontra-se devidamente assinado, digitalizado, e indexado em conformidade com as normas regulamentares vigentes.\n`;
    } else if (doc.category === 'alvara') {
      content += `A PREFEITURA MUNICIPAL, através do Departamento de Licenciamento de Obras e Adequação de Layout Comercial, concede o presente ALVARÁ DE EXECUÇÃO E REFORMA, autorizando o início e desenvolvimento dos trabalhos técnicos no imóvel de referência em conformidade com os projetos aprovados e sob responsabilidade técnica declarada.\n`;
    } else if (doc.category === 'rrt') {
      content += `CONSELHO DE ARQUITETURA E URBANISMO (CAU) / CONSELHO REGIONAL DE ENGENHARIA E AGRONOMIA (CREA)\n\n`;
      content += `Guia de Registro de Responsabilidade Técnica (RRT/ART) devidamente emitida, recolhida e homologada sob os termos da legislação federal, ratificando a responsabilidade técnica pelas fases de projeto arquitetônico, estrutural, instalações e fiscalização de execução de obra civil.\n`;
    } else if (doc.category === 'orcamento') {
      content += `PLANILHA ORÇAMENTÁRIA TÉCNICA DETALHADA CONSOLIDADA\n\n`;
      content += `Apresenta o orçamento analítico detalhado com composição de custos unitários de insumos, materiais especiais de engenharia civil, encargos sociais, e cronograma estimado de desembolso.\n`;
    } else {
      content += `Este documento administrativo e legal oficial encontra-se devidamente indexado e arquivado nesta pasta para fins de consulta, auditoria, conformidade fiscal e comprovação regulamentar perante órgãos competentes.\n`;
    }
    
    content += `\n--------------------------------------------------\n`;
    content += `Autenticado digitalmente via Plataforma Integrada Chaves Brites Correa.\n`;
    content += `Chave de Segurança: SHA-${doc.id.toUpperCase()}-${Date.now()}\n`;
    content += `==================================================\n`;

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = doc.fileName || `${doc.name.toLowerCase().replace(/\s+/g, '_')}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleStartAdminDocEdit = (doc: ProjectDocument) => {
    setEditingAdminDoc(doc);
    setAdminDocName(doc.name);
    setAdminDocDesc(doc.description || '');
    setSelectedDocCategory(doc.category);
    setSelectedPdfFile(null);
    setPdfUploadError(null);
  };

  const hasContract = (projId: string) => {
    return documents.some(d => 
      d.projectId === projId && 
      d.class === 'administrativo' && 
      (d.category === 'contrato' || d.name.toLowerCase().includes('contrato'))
    );
  };


  // Client CRUD State
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [clientForm, setClientForm] = useState({
    name: '',
    email: '',
    phone: '',
    username: '',
    password: ''
  });
  const [clientError, setClientError] = useState<string | null>(null);
  const [clientSuccess, setClientSuccess] = useState<string | null>(null);

  // Project CRUD State
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [projectForm, setProjectForm] = useState({
    name: '',
    clientId: '',
    type: 'obra' as ProjectType,
    status: 'execucao' as ProjectStatus,
    budget: '',
    startDate: '',
    location: '',
    area: '',
    description: ''
  });

  // Transaction CRUD State
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [txForm, setTxForm] = useState({
    projectId: '',
    description: '',
    category: 'materiais' as TransactionCategory,
    value: '',
    date: '',
    supplier: '',
    status: 'pago' as TransactionStatus,
    notes: '',
    receiptName: ''
  });

  // Document CRUD State
  const [editingDoc, setEditingDoc] = useState<ProjectDocument | null>(null);
  const [docForm, setDocForm] = useState({
    projectId: '',
    name: '',
    description: '',
    class: 'administrativo' as DocumentClass,
    fileName: '',
    status: 'desenvolvimento' as DocumentStatus
  });
  const [docSearch, setDocSearch] = useState('');

  // Global Listing States (Searches & Filters)
  const [clientSearch, setClientSearch] = useState('');
  const [projectSearch, setProjectSearch] = useState('');
  const [projectTypeFilter, setProjectTypeFilter] = useState('all');
  const [projectStatusFilter, setProjectStatusFilter] = useState('all');

  const [txSearch, setTxSearch] = useState('');
  const [txProjectFilter, setTxProjectFilter] = useState('all');
  const [txCategoryFilter, setTxCategoryFilter] = useState('all');
  const [txStatusFilter, setTxStatusFilter] = useState('all');

  // Math Metrics
  const metrics = useMemo(() => {
    const totalBudget = projects.reduce((acc, p) => acc + p.budget, 0);
    const totalSpent = transactions.reduce((acc, t) => acc + t.value, 0);
    const totalPaid = transactions.filter(t => t.status === 'pago').reduce((acc, t) => acc + t.value, 0);
    const totalPending = transactions.filter(t => t.status === 'pendente').reduce((acc, t) => acc + t.value, 0);
    const percentSpent = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0;
    const remaining = totalBudget - totalSpent;

    return { totalBudget, totalSpent, totalPaid, totalPending, percentSpent, remaining };
  }, [projects, transactions]);

  // Client lists mapping to projects
  const clientsWithProjects = useMemo(() => {
    return clients.map(c => {
      const pList = projects.filter(p => p.clientId === c.id);
      const totalAllocated = pList.reduce((acc, p) => acc + p.budget, 0);
      const projectIds = pList.map(p => p.id);
      const spent = transactions.filter(t => projectIds.includes(t.projectId)).reduce((acc, t) => acc + t.value, 0);
      
      return {
        ...c,
        projectCount: pList.length,
        totalAllocated,
        spent
      };
    });
  }, [clients, projects, transactions]);

  // Filtered Clients list
  const filteredClients = useMemo(() => {
    return clientsWithProjects.filter(c => {
      return c.name.toLowerCase().includes(clientSearch.toLowerCase()) ||
             c.username.toLowerCase().includes(clientSearch.toLowerCase()) ||
             c.email.toLowerCase().includes(clientSearch.toLowerCase());
    });
  }, [clientsWithProjects, clientSearch]);

  // Projects list matching clients
  const projectsWithClients = useMemo(() => {
    return projects.map(p => {
      const client = clients.find(c => c.id === p.clientId);
      const txs = transactions.filter(t => t.projectId === p.id);
      const spent = txs.reduce((acc, t) => acc + t.value, 0);
      const paid = txs.filter(t => t.status === 'pago').reduce((acc, t) => acc + t.value, 0);
      const pending = txs.filter(t => t.status === 'pendente').reduce((acc, t) => acc + t.value, 0);
      
      return {
        ...p,
        clientName: client ? client.name : 'Cliente não localizado',
        spent,
        paid,
        pending
      };
    });
  }, [projects, clients, transactions]);

  // Filtered Projects
  const filteredProjects = useMemo(() => {
    return projectsWithClients.filter(p => {
      const matchesSearch = p.name.toLowerCase().includes(projectSearch.toLowerCase()) ||
                            p.clientName.toLowerCase().includes(projectSearch.toLowerCase());
      const matchesType = projectTypeFilter === 'all' || p.type === projectTypeFilter;
      const matchesStatus = projectStatusFilter === 'all' || p.status === projectStatusFilter;

      return matchesSearch && matchesType && matchesStatus;
    });
  }, [projectsWithClients, projectSearch, projectTypeFilter, projectStatusFilter]);

  // Filtered Transactions
  const filteredTransactions = useMemo(() => {
    return transactions.map(t => {
      const project = projects.find(p => p.id === t.projectId);
      return {
        ...t,
        projectName: project ? project.name : 'Desconhecido'
      };
    }).filter(t => {
      const matchesSearch = t.description.toLowerCase().includes(txSearch.toLowerCase()) ||
                            t.supplier.toLowerCase().includes(txSearch.toLowerCase());
      const matchesProject = txProjectFilter === 'all' || t.projectId === txProjectFilter;
      const matchesCategory = txCategoryFilter === 'all' || t.category === txCategoryFilter;
      const matchesStatus = txStatusFilter === 'all' || t.status === txStatusFilter;

      return matchesSearch && matchesProject && matchesCategory && matchesStatus;
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [transactions, projects, txSearch, txProjectFilter, txCategoryFilter, txStatusFilter]);

  // Helpers for category visualizers
  const categoryChartData = useMemo(() => {
    const categories: Record<TransactionCategory, number> = {
      materiais: 0,
      mao_de_obra: 0,
      projetos_complementares: 0,
      taxas: 0,
      decoracao: 0,
      outros: 0
    };

    transactions.forEach(t => {
      if (categories[t.category] !== undefined) {
        categories[t.category] += t.value;
      }
    });

    const total = Object.values(categories).reduce((acc, val) => acc + val, 0) || 1;

    return Object.keys(categories).map(catKey => {
      const value = categories[catKey as TransactionCategory];
      return {
        category: catKey as TransactionCategory,
        value,
        percent: (value / total) * 100
      };
    });
  }, [transactions]);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };

  const getProjectPeriods = (projectPhases: any[]) => {
    if (projectPhases.length === 0) {
      // Return 6 months starting from current month
      const list: { key: string; label: string; year: number; month: number }[] = [];
      const now = new Date();
      for (let i = 0; i < 6; i++) {
        const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
        const y = d.getFullYear();
        const m = d.getMonth();
        const key = `${y}-${String(m + 1).padStart(2, '0')}`;
        const label = d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }).replace('.', '');
        const capitalizedLabel = label.charAt(0).toUpperCase() + label.slice(1);
        list.push({ key, label: capitalizedLabel, year: y, month: m });
      }
      return list;
    }

    let minDate = new Date();
    let maxDate = new Date();
    let hasDates = false;

    projectPhases.forEach(p => {
      if (p.startDate && p.endDate) {
        const start = new Date(p.startDate);
        const end = new Date(p.endDate);
        if (!hasDates) {
          minDate = start;
          maxDate = end;
          hasDates = true;
        } else {
          if (start < minDate) minDate = start;
          if (end > maxDate) maxDate = end;
        }
      }
    });

    if (!hasDates) {
      minDate = new Date();
      maxDate = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000);
    }

    const startYear = minDate.getFullYear();
    const startMonth = minDate.getMonth();
    const endYear = maxDate.getFullYear();
    const endMonth = maxDate.getMonth();

    const list: { key: string; label: string; year: number; month: number }[] = [];
    let currYear = startYear;
    let currMonth = startMonth;

    while (currYear < endYear || (currYear === endYear && currMonth <= endMonth)) {
      const key = `${currYear}-${String(currMonth + 1).padStart(2, '0')}`;
      const d = new Date(currYear, currMonth, 1);
      const label = d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }).replace('.', '');
      const capitalizedLabel = label.charAt(0).toUpperCase() + label.slice(1);
      list.push({ key, label: capitalizedLabel, year: currYear, month: currMonth });

      currMonth++;
      if (currMonth > 11) {
        currMonth = 0;
        currYear++;
      }
    }

    return list;
  };

  const getPhaseMonths = (startStr: string, endStr: string) => {
    if (!startStr || !endStr) return [];
    const start = new Date(startStr + 'T00:00:00');
    const end = new Date(endStr + 'T23:59:59');
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) return [];
    
    const list: { key: string; label: string; year: number; month: number }[] = [];
    let currYear = start.getFullYear();
    let currMonth = start.getMonth();
    const endYear = end.getFullYear();
    const endMonth = end.getMonth();
    
    while (currYear < endYear || (currYear === endYear && currMonth <= endMonth)) {
      const key = `${currYear}-${String(currMonth + 1).padStart(2, '0')}`;
      const d = new Date(currYear, currMonth, 1);
      const label = d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }).replace('.', '');
      const capitalizedLabel = label.charAt(0).toUpperCase() + label.slice(1);
      list.push({ key, label: capitalizedLabel, year: currYear, month: currMonth });
      
      currMonth++;
      if (currMonth > 11) {
        currMonth = 0;
        currYear++;
      }
    }
    return list;
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

  // Client submit handler
  const handleClientSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setClientError(null);
    setClientSuccess(null);

    const { name, email, phone, username, password } = clientForm;

    if (!name.trim() || !email.trim() || !username.trim()) {
      setClientError('Preencha os campos obrigatórios (Nome, E-mail e Usuário).');
      return;
    }

    if (!editingClient && !password) {
      setClientError('Para novos cadastros, a senha de acesso é obrigatória.');
      return;
    }

    try {
      if (editingClient) {
        // Editing Mode
        const updated: Client = {
          ...editingClient,
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim(),
          username: username.trim()
        };
        await onEditClient(updated, password);
        setClientSuccess(`Cliente "${name}" atualizado com sucesso.`);
        setEditingClient(null);
      } else {
        // Creating Mode
        const newClient: Client = {
          id: `client-${Date.now()}`,
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim(),
          username: username.trim().toLowerCase(),
          createdAt: new Date().toISOString().split('T')[0]
        };
        await onAddClient(newClient, password);
        setClientSuccess(`Cliente "${name}" cadastrado e liberado para login.`);
      }

      // Reset Form
      setClientForm({ name: '', email: '', phone: '', username: '', password: '' });
    } catch (err) {
      if (err instanceof Error) {
        setClientError(err.message);
      } else {
        setClientError('Ocorreu um erro ao salvar o cliente.');
      }
    }
  };

  // Client edit triggers
  const startEditClient = (c: Client) => {
    setEditingClient(c);
    setClientForm({
      name: c.name,
      email: c.email,
      phone: c.phone,
      username: c.username,
      password: '' // leave empty to not change, or enter new
    });
    setActiveTab('clientes');
    setClientError(null);
    setClientSuccess(null);
  };

  const cancelEditClient = () => {
    setEditingClient(null);
    setClientForm({ name: '', email: '', phone: '', username: '', password: '' });
  };

  // Project Submit
  const handleProjectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const { name, clientId, type, status, budget, startDate, location, area, description } = projectForm;

    if (!name.trim() || !clientId || !budget || !startDate) {
      alert('Por favor, preencha todos os campos obrigatórios do projeto.');
      return;
    }

    const budgetVal = parseFloat(budget);
    if (isNaN(budgetVal) || budgetVal <= 0) {
      alert('Insira um orçamento válido maior que zero.');
      return;
    }

    try {
      if (editingProject) {
        const updated: Project = {
          ...editingProject,
          name: name.trim(),
          clientId,
          type,
          status,
          budget: budgetVal,
          startDate,
          location: location.trim() || 'Não informada',
          area: area ? parseFloat(area) : undefined,
          description: description.trim()
        };
        await onEditProject(updated);
        setEditingProject(null);
      } else {
        const newProj: Project = {
          id: `project-${Date.now()}`,
          name: name.trim(),
          clientId,
          type,
          status,
          budget: budgetVal,
          startDate,
          location: location.trim() || 'Não informada',
          area: area ? parseFloat(area) : undefined,
          description: description.trim()
        };
        await onAddProject(newProj);
      }

      // Reset
      setProjectForm({
        name: '',
        clientId: '',
        type: 'obra',
        status: 'execucao',
        budget: '',
        startDate: '',
        location: '',
        area: '',
        description: ''
      });
    } catch (err) {
      console.error(err);
      alert('Ocorreu um erro ao salvar o projeto.');
    }
  };

  const startEditProject = (p: Project) => {
    setEditingProject(p);
    setProjectForm({
      name: p.name,
      clientId: p.clientId,
      type: p.type,
      status: p.status,
      budget: p.budget.toString(),
      startDate: p.startDate,
      location: p.location,
      area: p.area ? p.area.toString() : '',
      description: p.description
    });
    setTxForm(prev => ({ ...prev, projectId: p.id })); // auto-select project in transaction tab
    setActiveTab('projetos');
  };

  const cancelEditProject = () => {
    setEditingProject(null);
    setProjectForm({
      name: '',
      clientId: '',
      type: 'obra',
      status: 'execucao',
      budget: '',
      startDate: '',
      location: '',
      area: '',
      description: ''
    });
  };

  // Transaction Submit
  const handleTxSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const { projectId, description, category, value, date, supplier, status, notes, receiptName } = txForm;

    if (!projectId || !description.trim() || !value || !date || !supplier.trim()) {
      alert('Por favor, preencha todos os campos obrigatórios da despesa.');
      return;
    }

    const valueNum = parseFloat(value);
    if (isNaN(valueNum) || valueNum <= 0) {
      alert('Valor da despesa deve ser superior a zero.');
      return;
    }

    try {
      if (editingTx) {
        const updated: Transaction = {
          ...editingTx,
          projectId,
          description: description.trim(),
          category,
          value: valueNum,
          date,
          supplier: supplier.trim(),
          status,
          notes: notes.trim() || undefined,
          receiptName: receiptName.trim() || undefined
        };
        await onEditTransaction(updated);
        setEditingTx(null);
      } else {
        const newTx: Transaction = {
          id: `tx-${Date.now()}`,
          projectId,
          description: description.trim(),
          category,
          value: valueNum,
          date,
          supplier: supplier.trim(),
          status,
          notes: notes.trim() || undefined,
          receiptName: receiptName.trim() || undefined
        };
        await onAddTransaction(newTx);
      }

      // Reset Form
      setTxForm({
        projectId: projectId, // preserve active project selection
        description: '',
        category: 'materiais',
        value: '',
        date: new Date().toISOString().split('T')[0],
        supplier: '',
        status: 'pago',
        notes: '',
        receiptName: ''
      });
    } catch (err) {
      console.error(err);
      alert('Ocorreu um erro ao salvar o lançamento.');
    }
  };



  // Document Handlers
  const handleDocSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const { projectId, name, description, class: docClass, fileName, status } = docForm;
    if (!projectId || !name.trim()) {
      alert('Por favor, selecione um projeto e insira o nome do documento.');
      return;
    }

    try {
      if (editingDoc) {
        const updated: ProjectDocument = {
          ...editingDoc,
          projectId,
          name: name.trim(),
          description: description.trim(),
          class: docClass,
          fileName: fileName.trim() || undefined,
          status
        };
        await onEditDocument(updated);
        setEditingDoc(null);
      } else {
        const newDoc: ProjectDocument = {
          id: `doc-${Date.now()}`,
          projectId,
          name: name.trim(),
          description: description.trim(),
          class: docClass,
          fileName: fileName.trim() || undefined,
          uploadedAt: new Date().toISOString().split('T')[0],
          status
        };
        await onAddDocument(newDoc);
      }

      // Reset Form
      setDocForm({
        projectId: projectId, // preserve active project selection
        name: '',
        description: '',
        class: docClass,
        fileName: '',
        status: 'desenvolvimento'
      });
    } catch (err) {
      console.error(err);
      alert('Ocorreu um erro ao salvar o documento.');
    }
  };

  const startEditDoc = (doc: ProjectDocument) => {
    setEditingDoc(doc);
    setDocForm({
      projectId: doc.projectId,
      name: doc.name,
      description: doc.description,
      class: doc.class,
      fileName: doc.fileName || '',
      status: doc.status
    });
    setActiveTab('classe_administrativo');
  };

  const cancelEditDoc = () => {
    setEditingDoc(null);
    setDocForm({
      projectId: '',
      name: '',
      description: '',
      class: 'administrativo',
      fileName: '',
      status: 'desenvolvimento'
    });
  };

  return (
    <div className="min-h-screen bg-[#F4F6FA] text-[#0F172A] flex flex-col md:flex-row font-sans selection:bg-[#FF5A35]/15 relative overflow-hidden theme-light">
      {/* Motor de automação de Demandas: roda no servidor (src/lib/server/demandAutomation.ts),
          independente de qualquer admin estar logado. Nada a montar aqui no cliente. */}
      <div className="grid-bg"></div>
      
      {/* Decorative ambient background glows */}
      <div className="bg-glow-orange top-[-100px] left-[-50px] opacity-25"></div>
      <div className="bg-glow-purple bottom-[150px] left-[150px] opacity-15"></div>

      {/* SIDE NAV BAR - Elegant & Minimalist Sidebar */}
      <aside className="w-full md:w-64 bg-[#090D16]/90 backdrop-blur-md text-[#F8FAFC] flex-shrink-0 flex flex-col justify-between p-6 z-20 border-r border-white/5 print:hidden">
        <div className="space-y-8">
          
          {/* Logo and branding */}
          <div className="relative">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#FF5A35] to-[#7C3AED] text-white flex items-center justify-center font-bold text-xs shadow-lg shadow-[#FF5A35]/20">
                CBC
              </div>
              <div>
                <h1 className="font-sans font-bold text-xs tracking-[0.12em] uppercase text-white leading-tight">
                  CHAVES BRITES CORREA
                </h1>
                <p className="font-sans text-[8px] tracking-[0.2em] uppercase text-slate-400 mt-0.5">
                  ARQUITETURA &amp; ENGENHARIA
                </p>
              </div>
            </div>
            <div className="w-full h-[1px] bg-white/5 mt-6"></div>
          </div>

          {/* User profile identifier */}
          <div className="bg-white/[0.02] border border-white/5 p-4 rounded-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-2 h-2 rounded-full bg-[#FF5A35] animate-ping m-3"></div>
            <div className="absolute top-0 right-0 w-2 h-2 rounded-full bg-[#FF5A35] m-3"></div>
            <span className="text-[8px] font-mono uppercase tracking-wider text-slate-500 block">
              {role === 'marketing' ? 'Sessão Marketing' : 'Sessão Administrador'}
            </span>
            <span className="text-[11px] font-mono text-white font-bold mt-1.5 block truncate">
              {role === 'marketing' ? 'TIME DE MARKETING' : 'CHAVES BRITES CORREA'}
            </span>
            <span className="text-[9px] text-slate-400 block mt-0.5">
              {role === 'marketing' ? 'Campanhas e Divulgação' : 'Gestão de Custos Globais'}
            </span>
          </div>

          {/* Navigation Links */}
          <nav className="space-y-1">
            <span className="text-[8px] font-mono text-slate-500 uppercase tracking-widest block mb-2 px-2">Menu do Painel</span>
            
            {role !== 'marketing' && (
              <>
                <button
                  id="nav_btn_resumo"
                  onClick={() => setActiveTab('resumo')}
                  className={`w-full flex items-center justify-between px-3 py-2.5 text-xs font-mono uppercase tracking-wider transition-all rounded-xl text-left cursor-pointer ${
                    activeTab === 'resumo' 
                      ? 'bg-gradient-to-r from-[#FF5A35]/15 to-[#7C3AED]/5 text-white border-l-2 border-[#FF5A35]' 
                      : 'text-slate-400 hover:text-white hover:bg-white/[0.02]'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <TrendingUp size={14} className={activeTab === 'resumo' ? 'text-[#FF5A35]' : 'text-slate-400'} />
                    <span className={activeTab === 'resumo' ? 'font-bold' : ''}>Painel Resumo</span>
                  </div>
                  <ChevronRight size={12} className="opacity-40" />
                </button>

                <button
                  id="nav_btn_clientes"
                  onClick={() => setActiveTab('clientes')}
                  className={`w-full flex items-center justify-between px-3 py-2.5 text-xs font-mono uppercase tracking-wider transition-all rounded-xl text-left cursor-pointer ${
                    activeTab === 'clientes' 
                      ? 'bg-gradient-to-r from-[#FF5A35]/15 to-[#7C3AED]/5 text-white border-l-2 border-[#FF5A35]' 
                      : 'text-slate-400 hover:text-white hover:bg-white/[0.02]'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Users size={14} className={activeTab === 'clientes' ? 'text-[#FF5A35]' : 'text-slate-400'} />
                    <span className={activeTab === 'clientes' ? 'font-bold' : ''}>Clientes ({clients.length})</span>
                  </div>
                  <ChevronRight size={12} className="opacity-40" />
                </button>

                <button
                  id="nav_btn_projetos"
                  onClick={() => setActiveTab('projetos')}
                  className={`w-full flex items-center justify-between px-3 py-2.5 text-xs font-mono uppercase tracking-wider transition-all rounded-xl text-left cursor-pointer ${
                    activeTab === 'projetos' 
                      ? 'bg-gradient-to-r from-[#FF5A35]/15 to-[#7C3AED]/5 text-white border-l-2 border-[#FF5A35]' 
                      : 'text-slate-400 hover:text-white hover:bg-white/[0.02]'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Briefcase size={14} className={activeTab === 'projetos' ? 'text-[#FF5A35]' : 'text-slate-400'} />
                    <span className={activeTab === 'projetos' ? 'font-bold' : ''}>Obras / Projetos ({projects.length})</span>
                  </div>
                  <ChevronRight size={12} className="opacity-40" />
                </button>

                <button
                  id="nav_btn_escritorio"
                  onClick={() => setActiveTab('escritorio')}
                  className={`w-full flex items-center justify-between px-3 py-2.5 text-xs font-mono uppercase tracking-wider transition-all rounded-xl text-left cursor-pointer ${
                    activeTab === 'escritorio' 
                      ? 'bg-gradient-to-r from-[#FF5A35]/15 to-[#7C3AED]/5 text-white border-l-2 border-[#FF5A35]' 
                      : 'text-slate-400 hover:text-white hover:bg-white/[0.02]'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Building size={14} className={activeTab === 'escritorio' ? 'text-[#FF5A35]' : 'text-slate-400'} />
                    <span className={activeTab === 'escritorio' ? 'font-bold' : ''}>Gestão do Escritório</span>
                  </div>
                  <ChevronRight size={12} className="opacity-40" />
                </button>
              </>
            )}

            <button
              id="nav_btn_marketing"
              onClick={() => setActiveTab('marketing')}
              className={`w-full flex items-center justify-between px-3 py-2.5 text-xs font-mono uppercase tracking-wider transition-all rounded-xl text-left cursor-pointer ${
                activeTab === 'marketing' 
                  ? 'bg-gradient-to-r from-[#FF5A35]/15 to-[#7C3AED]/5 text-white border-l-2 border-[#FF5A35]' 
                  : 'text-slate-400 hover:text-white hover:bg-white/[0.02]'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Megaphone size={14} className={activeTab === 'marketing' ? 'text-[#FF5A35]' : 'text-slate-400'} />
                <span className={activeTab === 'marketing' ? 'font-bold' : ''}>Marketing Digital</span>
              </div>
              <ChevronRight size={12} className="opacity-40" />
            </button>

            {role !== 'marketing' && (
              <>
                <div className="pt-4 pb-1">
                  <span className="text-[8px] font-mono text-slate-500 uppercase tracking-widest block mb-1 px-2">Módulos de Trabalho</span>
                </div>

                <button
                  id="nav_btn_classe_admin"
                  onClick={() => setActiveTab('classe_administrativo')}
                  className={`w-full flex items-center justify-between px-3 py-2.5 text-xs font-mono uppercase tracking-wider transition-all rounded-xl text-left cursor-pointer ${
                    activeTab === 'classe_administrativo' 
                      ? 'bg-gradient-to-r from-[#FF5A35]/15 to-[#7C3AED]/5 text-white border-l-2 border-[#FF5A35] font-bold' 
                      : 'text-slate-400 hover:text-white hover:bg-white/[0.02]'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <FileText size={14} className={activeTab === 'classe_administrativo' ? 'text-[#FF5A35]' : 'text-slate-400'} />
                    <span>1. Administrativo</span>
                  </div>
                  <ChevronRight size={12} className="opacity-40" />
                </button>

                <button
                  id="nav_btn_classe_planejamento"
                  onClick={() => setActiveTab('classe_planejamento')}
                  className={`w-full flex items-center justify-between px-3 py-2.5 text-xs font-mono uppercase tracking-wider transition-all rounded-xl text-left cursor-pointer ${
                    activeTab === 'classe_planejamento' 
                      ? 'bg-gradient-to-r from-[#FF5A35]/15 to-[#7C3AED]/5 text-white border-l-2 border-[#FF5A35] font-bold' 
                      : 'text-slate-400 hover:text-white hover:bg-white/[0.02]'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Sliders size={14} className={activeTab === 'classe_planejamento' ? 'text-[#FF5A35]' : 'text-slate-400'} />
                    <span>2. Planejamento</span>
                  </div>
                  <ChevronRight size={12} className="opacity-40" />
                </button>

                <button
                  id="nav_btn_classe_acompanhamento"
                  onClick={() => setActiveTab('classe_acompanhamento')}
                  className={`w-full flex items-center justify-between px-3 py-2.5 text-xs font-mono uppercase tracking-wider transition-all rounded-xl text-left cursor-pointer ${
                    activeTab === 'classe_acompanhamento' 
                      ? 'bg-gradient-to-r from-[#FF5A35]/15 to-[#7C3AED]/5 text-white border-l-2 border-[#FF5A35] font-bold' 
                      : 'text-slate-400 hover:text-white hover:bg-white/[0.02]'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <TrendingUp size={14} className={activeTab === 'classe_acompanhamento' ? 'text-[#FF5A35]' : 'text-slate-400'} />
                    <span>3. Acompanhamento</span>
                  </div>
                  <ChevronRight size={12} className="opacity-40" />
                </button>

                <button
                  id="nav_btn_contratos"
                  onClick={() => setActiveTab('contratos')}
                  className={`w-full flex items-center justify-between px-3 py-2.5 text-xs font-mono uppercase tracking-wider transition-all rounded-xl text-left cursor-pointer ${
                    activeTab === 'contratos' 
                      ? 'bg-gradient-to-r from-[#FF5A35]/15 to-[#7C3AED]/5 text-white border-l-2 border-[#FF5A35] font-bold' 
                      : 'text-slate-400 hover:text-white hover:bg-white/[0.02]'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <FileSignature size={14} className={activeTab === 'contratos' ? 'text-[#FF5A35]' : 'text-slate-400'} />
                    <span>4. Contratos</span>
                  </div>
                  <ChevronRight size={12} className="opacity-40" />
                </button>

                <button
                  id="nav_btn_demandas"
                  onClick={() => setActiveTab('demandas')}
                  className={`w-full flex items-center justify-between px-3 py-2.5 text-xs font-mono uppercase tracking-wider transition-all rounded-xl text-left cursor-pointer ${
                    activeTab === 'demandas' 
                      ? 'bg-gradient-to-r from-[#FF5A35]/15 to-[#7C3AED]/5 text-white border-l-2 border-[#FF5A35] font-bold' 
                      : 'text-slate-400 hover:text-white hover:bg-white/[0.02]'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Kanban size={14} className={activeTab === 'demandas' ? 'text-[#FF5A35]' : 'text-slate-400'} />
                    <span>5. Demandas</span>
                  </div>
                  <ChevronRight size={12} className="opacity-40" />
                </button>
              </>
            )}
          </nav>

          {role !== 'marketing' && (
            <div className="mt-6 pt-4 border-t border-white/5 space-y-1">
              <span className="text-[8px] font-mono text-slate-500 uppercase tracking-widest block mb-2 px-2">Configuração do Sistema</span>
              <button
                id="nav_btn_telegram"
                onClick={() => setActiveTab('telegram')}
                className={`w-full flex items-center justify-between px-3 py-2.5 text-xs font-mono uppercase tracking-wider transition-all rounded-xl text-left cursor-pointer ${
                  activeTab === 'telegram' 
                    ? 'bg-gradient-to-r from-[#FF5A35]/15 to-[#7C3AED]/5 text-white border-l-2 border-[#FF5A35]' 
                    : 'text-slate-400 hover:text-white hover:bg-white/[0.02]'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Database size={14} className={activeTab === 'telegram' ? 'text-[#FF5A35]' : 'text-slate-400'} />
                  <span className={activeTab === 'telegram' ? 'font-bold' : ''}>Banco de Dados</span>
                </div>
                <ChevronRight size={12} className="opacity-40" />
              </button>
            </div>
          )}

        </div>

        {/* Bottom signout */}
        <div className="mt-8 pt-6 border-t border-white/5">
          <button
            id="admin_logout_btn"
            onClick={onLogout}
            className="w-full flex items-center gap-2.5 text-slate-400 hover:text-white text-xs font-mono uppercase tracking-wider py-2 px-1 transition-all text-left cursor-pointer"
          >
            <LogOut size={14} className="text-slate-400 hover:text-white" />
            <span>Encerrar Painel</span>
          </button>
          <p className="text-[8px] font-mono text-slate-600 uppercase tracking-widest mt-4">CBC OFFICE TOOL v1.0</p>
        </div>
      </aside>

      {/* MAIN CONTAINER */}
      <div className="flex-grow flex flex-col min-h-screen overflow-y-auto relative z-10">
        
        {/* Top bar for general branding info */}
        <header className="bg-[#090D16]/40 border-b border-white/5 px-6 py-4 flex items-center justify-between flex-shrink-0 backdrop-blur-md print:hidden">
          <div>
            <span className="text-[9px] font-mono text-slate-500 uppercase tracking-widest block">Ambiente compartilhado</span>
            <h2 className="text-xs font-bold text-white uppercase tracking-wider">Centro de Custo &amp; Gestão de Obras</h2>
          </div>
          <div className="flex items-center gap-4 text-xs">
            {role !== 'marketing' && <NotificationBell />}
            <span className="font-mono text-slate-400 uppercase text-[9px] px-2.5 py-1 bg-white/5 border border-white/10 rounded-full">TIME CORPORATIVO</span>
          </div>
        </header>

        {/* Dashboard Pages based on active Tab */}
        <div className="flex-grow p-6 md:p-8 space-y-8 max-w-7xl w-full mx-auto">
          
          {/* ============================================================== */}
          {/* TAB 1: RESUMO (GENERAL EXECUTIVE DASHBOARD) */}
          {/* ============================================================== */}
          {activeTab === 'resumo' && (
            <div className="space-y-8">
              
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-stone-200 pb-5">
                <div>
                  <h2 className="font-serif text-xl md:text-2xl text-stone-900 tracking-tight">Painel Resumo • Chaves Brites Correa</h2>
                  <p className="text-xs text-stone-500 mt-1">Visão geral unificada dos canteiros de obras e parceiros comerciais ativos.</p>
                </div>
                <div className="flex flex-wrap items-center gap-2.5">
                  <button
                    onClick={() => {
                      setEditingClient(null);
                      setClientForm({
                        name: '',
                        email: '',
                        phone: '',
                        username: '',
                        password: ''
                      });
                      setClientError(null);
                      setClientSuccess(null);
                      setActiveTab('clientes');
                    }}
                    className="bg-[#1E1E1E] text-white px-3.5 py-2 text-[10px] font-mono uppercase tracking-widest hover:bg-stone-800 transition-all cursor-pointer border border-stone-900 flex items-center gap-1.5"
                  >
                    <span>+ Cadastrar Novo Cliente</span>
                  </button>
                  <button
                    onClick={() => {
                      setEditingProject(null);
                      setProjectForm({
                        name: '',
                        clientId: '',
                        type: 'obra',
                        status: 'execucao',
                        budget: '',
                        startDate: '',
                        location: '',
                        area: '',
                        description: ''
                      });
                      setActiveTab('projetos');
                    }}
                    className="bg-white text-stone-900 px-3.5 py-2 text-[10px] font-mono uppercase tracking-widest hover:bg-stone-100 transition-all cursor-pointer border border-stone-300 flex items-center gap-1.5"
                  >
                    <span>+ Cadastrar Nova Obra/Projeto</span>
                  </button>
                </div>
              </div>



              {/* THE TWO COLUMNS AS REQUESTED */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                
                {/* COLUMN 1: PROJETOS / OBRAS */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b border-stone-200 pb-2">
                    <h3 className="font-serif text-lg text-stone-900 flex items-center gap-2">
                      <Briefcase size={16} className="text-stone-500" />
                      Projetos / Obras
                    </h3>
                    <span className="bg-stone-100 text-stone-600 font-mono text-[10px] px-2 py-0.5 border border-stone-200">
                      {projects.length} registros
                    </span>
                  </div>

                  <div className="space-y-2.5">
                    {projects.map(p => {
                      const isExpanded = selectedDashboardProjId === p.id;
                      const clientName = clients.find(c => c.id === p.clientId)?.name || 'Cliente Geral';
                      const remains = p.budget - (transactions.filter(t => t.projectId === p.id).reduce((sum, t) => sum + t.value, 0));
                      
                      return (
                        <div 
                          key={p.id}
                          className={`border transition-all duration-200 overflow-hidden cursor-pointer ${
                            isExpanded 
                              ? 'bg-white border-stone-900 shadow-sm' 
                              : 'bg-stone-50 border-stone-200 hover:border-stone-400'
                          }`}
                          onClick={() => setSelectedDashboardProjId(isExpanded ? null : p.id)}
                        >
                          {/* Minimized head: Title and 1-line description */}
                          <div className="p-4 flex items-center justify-between gap-4">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <h4 className="font-serif font-semibold text-xs text-stone-900 tracking-tight truncate">
                                  {p.name}
                                </h4>
                                {!hasContract(p.id) && (
                                  <span className="inline-flex items-center gap-0.5 text-[8px] font-mono font-bold uppercase tracking-wider bg-red-100 text-red-800 border border-red-300 px-1.5 py-0.2" title="Falta Contrato Obrigatório">
                                    ⚠️ PENDÊNCIA
                                  </span>
                                )}
                              </div>
                              {/* 1 line description below each title */}
                              <p className="text-[11px] text-stone-500 truncate mt-0.5 font-sans leading-normal">
                                {p.description || "Sem descrição cadastrada para este canteiro."}
                              </p>
                              {!hasContract(p.id) && (
                                <p className="text-[10px] text-red-700 font-medium font-sans mt-1">
                                  Contrato mínimo obrigatório pendente de anexo!
                                </p>
                              )}
                            </div>
                            <div className="flex-shrink-0 text-stone-400">
                              {isExpanded ? (
                                <span className="text-[10px] font-mono text-stone-800 uppercase tracking-widest border border-stone-800 px-1.5 py-0.5 bg-stone-50">Ativo</span>
                              ) : (
                                <div className="flex items-center gap-2">
                                  {!hasContract(p.id) && (
                                    <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" title="Notificação pendente" />
                                  )}
                                  <span className="text-[10px] font-mono text-stone-400 uppercase tracking-widest">Ver Detalhes</span>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Expanded Details Section */}
                          {isExpanded && (
                            <motion.div 
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: 'auto' }}
                              transition={{ duration: 0.2 }}
                              className="border-t border-stone-100 bg-[#FCFBF9] p-4 space-y-4 text-xs text-stone-700"
                              onClick={(e) => e.stopPropagation() /* Prevent collapse when clicking details content */}
                            >
                              {/* Notificações do Centro de Projeto / Obra */}
                              <div className="bg-white border border-stone-200 p-3 space-y-2">
                                <h5 className="font-mono text-[9px] uppercase tracking-widest text-stone-500 font-bold flex items-center gap-1.5 border-b border-stone-100 pb-1">
                                  <span>Painel de Notificações do Centro</span>
                                </h5>
                                {!hasContract(p.id) ? (
                                  <div className="flex items-start gap-2 text-[11px] text-amber-850 bg-amber-50/50 border border-amber-200 p-2.5">
                                    <span className="text-amber-600 mt-0.5 flex-shrink-0">⚠️</span>
                                    <div>
                                      <p className="font-bold text-amber-950 text-xs">Falta Documento Mínimo Obrigatório</p>
                                      <p className="text-stone-600 text-[10px] mt-0.5 leading-relaxed">
                                        Este centro de custo não possui o contrato homologado anexado. Por favor, acesse a aba administrativa de anexos e envie o contrato de prestação de serviços no formato PDF para regularizar esta pendência administrativa.
                                      </p>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="text-[10.5px] text-stone-600 py-1 flex items-center gap-1.5">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                    <span>Status regularizado: <strong>Contrato Homologado em conformidade.</strong> Nenhuma outra pendência ativa para este centro de custo.</span>
                                  </div>
                                )}
                              </div>

                              <div className="grid grid-cols-2 gap-4">
                                <div>
                                  <span className="text-[9px] font-mono text-stone-400 uppercase tracking-wider block">Descrição do Escopo</span>
                                  <p className="mt-1 font-sans text-[11px] leading-relaxed text-stone-800">
                                    {p.description || "Nenhum escopo específico cadastrado pelo arquiteto."}
                                  </p>
                                </div>
                                <div>
                                  <span className="text-[9px] font-mono text-stone-400 uppercase tracking-wider block">Localização / Endereço</span>
                                  <p className="mt-1 font-sans text-[11px] text-stone-800">
                                    📍 {p.location || "Local não informado pelo escritório"}
                                  </p>
                                </div>
                              </div>

                              <div className="grid grid-cols-3 gap-2 pt-3 border-t border-stone-100">
                                <div>
                                  <span className="text-[9px] font-mono text-stone-400 uppercase tracking-wider block">Status da Obra</span>
                                  <span className="inline-block mt-1 px-2 py-0.5 font-mono text-[9px] uppercase bg-stone-100 text-stone-700 border">
                                    {p.status}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-[9px] font-mono text-stone-400 uppercase tracking-wider block">Orçamento Contratado</span>
                                  <span className="font-semibold text-stone-900 block mt-1 font-mono">{formatCurrency(p.budget)}</span>
                                </div>
                                <div>
                                  <span className="text-[9px] font-mono text-stone-400 uppercase tracking-wider block">Saldo do Canteiro</span>
                                  <span className={`font-semibold block mt-1 font-mono ${remains >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                                    {formatCurrency(remains)}
                                  </span>
                                </div>
                              </div>

                              {/* Classes de Trabalho / Ferramentas do Centro */}
                              <div className="pt-4 mt-3 border-t border-stone-200">
                                <h5 className="font-serif text-xs text-stone-900 mb-2.5 flex items-center gap-1.5 font-bold">
                                  <Layers size={13} className="text-stone-500" />
                                  Módulos Operacionais do Projeto
                                </h5>
                                
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                  {/* MODULO 1: ADMINISTRATIVO */}
                                  <div className="bg-[#FAF9F6] border border-stone-200 p-3 hover:border-stone-400 transition-all flex flex-col justify-between">
                                    <div>
                                      <div className="flex items-center justify-between mb-1">
                                        <span className="font-mono text-[9px] uppercase tracking-wider text-stone-500 font-semibold">1. Administrativo</span>
                                        <FileText size={12} className="text-stone-400" />
                                      </div>
                                      <p className="text-[10px] text-stone-600 leading-normal">
                                        Minutas e contratos, alvarás de prefeitura, responsabilidades técnicas RRT/ART e documentação fiscal.
                                      </p>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedClassProjectId(p.id);
                                        setActiveTab('classe_administrativo');
                                      }}
                                      className="mt-3 w-full bg-white hover:bg-stone-100 border border-stone-300 py-1.5 text-[9px] font-mono uppercase tracking-wider text-stone-900 text-center font-bold cursor-pointer transition-all"
                                    >
                                      Acessar Painel Admin →
                                    </button>
                                  </div>

                                  {/* MODULO 2: PLANEJAMENTO */}
                                  <div className="bg-[#FAF9F6] border border-stone-200 p-3 hover:border-stone-400 transition-all flex flex-col justify-between">
                                    <div>
                                      <div className="flex items-center justify-between mb-1">
                                        <span className="font-mono text-[9px] uppercase tracking-wider text-stone-500 font-semibold">2. Planejamento</span>
                                        <Sliders size={12} className="text-stone-400" />
                                      </div>
                                      <p className="text-[10px] text-stone-600 leading-normal">
                                        Cronogramas físico-financeiros interativos, controle de fases do canteiro e simulação de buffers de contingência.
                                      </p>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedClassProjectId(p.id);
                                        setActiveTab('classe_planejamento');
                                      }}
                                      className="mt-3 w-full bg-white hover:bg-stone-100 border border-stone-300 py-1.5 text-[9px] font-mono uppercase tracking-wider text-stone-900 text-center font-bold cursor-pointer transition-all"
                                    >
                                      Ver Cronograma →
                                    </button>
                                  </div>

                                  {/* MODULO 3: ACOMPANHAMENTO */}
                                  <div className="bg-[#FAF9F6] border border-stone-200 p-3 hover:border-stone-400 transition-all flex flex-col justify-between">
                                    <div>
                                      <div className="flex items-center justify-between mb-1">
                                        <span className="font-mono text-[9px] uppercase tracking-wider text-stone-500 font-semibold">3. Acompanhamento</span>
                                        <TrendingUp size={12} className="text-stone-400" />
                                      </div>
                                      <p className="text-[10px] text-stone-600 leading-normal">
                                        Diário de Obra Digital (RDO), punch-list de vistorias e correções técnicas, relatórios fotográficos.
                                      </p>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedClassProjectId(p.id);
                                        setActiveTab('classe_acompanhamento');
                                      }}
                                      className="mt-3 w-full bg-white hover:bg-stone-100 border border-stone-300 py-1.5 text-[9px] font-mono uppercase tracking-wider text-stone-900 text-center font-bold cursor-pointer transition-all"
                                    >
                                      Diário & Vistoria RDO →
                                    </button>
                                  </div>
                                </div>
                              </div>

                              <div className="pt-3 border-t border-stone-100 flex justify-between items-center">
                                <span className="text-[10px] text-stone-400">Cliente Proprietário: <strong className="text-stone-700">{clientName}</strong></span>
                                <button
                                  onClick={() => {
                                    startEditProject(p);
                                  }}
                                  className="text-[10px] font-mono text-[#1E1E1E] uppercase tracking-wider underline hover:text-stone-600 cursor-pointer"
                                >
                                  Editar Parâmetros →
                                </button>
                              </div>
                            </motion.div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* COLUMN 2: CLIENTES */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b border-stone-200 pb-2">
                    <h3 className="font-serif text-lg text-stone-900 flex items-center gap-2">
                      <Users size={16} className="text-stone-500" />
                      Clientes Cadastrados
                    </h3>
                    <span className="bg-stone-100 text-stone-600 font-mono text-[10px] px-2 py-0.5 border border-stone-200">
                      {clients.length} registros
                    </span>
                  </div>

                  <div className="space-y-2.5">
                    {clients.map(c => {
                      const isExpanded = selectedDashboardClientId === c.id;
                      const linkedProjects = projects.filter(p => p.clientId === c.id);
                      
                      return (
                        <div 
                          key={c.id}
                          className={`border transition-all duration-200 overflow-hidden cursor-pointer ${
                            isExpanded 
                              ? 'bg-white border-stone-900 shadow-sm' 
                              : 'bg-stone-50 border-stone-200 hover:border-stone-400'
                          }`}
                          onClick={() => setSelectedDashboardClientId(isExpanded ? null : c.id)}
                        >
                          {/* Minimized head: Title and 1-line description */}
                          <div className="p-4 flex items-center justify-between gap-4">
                            <div className="min-w-0 flex-1">
                              <h4 className="font-serif font-semibold text-xs text-stone-900 tracking-tight truncate">
                                {c.name}
                              </h4>
                              {/* 1 line description below each title */}
                              <p className="text-[11px] text-stone-500 truncate mt-0.5 font-sans leading-normal">
                                {c.email || "Sem e-mail de contato configurado."} • {c.phone || "Sem telefone."}
                              </p>
                            </div>
                            <div className="flex-shrink-0 text-stone-400">
                              {isExpanded ? (
                                <span className="text-[10px] font-mono text-stone-800 uppercase tracking-widest border border-stone-800 px-1.5 py-0.5 bg-stone-50">Ativo</span>
                              ) : (
                                <span className="text-[10px] font-mono text-stone-400 uppercase tracking-widest">Ver Detalhes</span>
                              )}
                            </div>
                          </div>

                          {/* Expanded Details Section */}
                          {isExpanded && (
                            <motion.div 
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: 'auto' }}
                              transition={{ duration: 0.2 }}
                              className="border-t border-stone-100 bg-[#FCFBF9] p-4 space-y-4 text-xs text-stone-700"
                              onClick={(e) => e.stopPropagation() /* Prevent collapse when clicking details content */}
                            >
                              <div className="grid grid-cols-2 gap-4">
                                <div>
                                  <span className="text-[9px] font-mono text-stone-400 uppercase tracking-wider block mb-1.5">Centros de Custo ({linkedProjects.length})</span>
                                  {linkedProjects.length === 0 ? (
                                    <p className="text-[11px] text-stone-500 italic">Nenhum centro de custo ativo para este cliente.</p>
                                  ) : (
                                    <ul className="space-y-1">
                                      {linkedProjects.map(proj => (
                                        <li key={proj.id} className="flex items-center gap-1.5 text-[11px] font-medium text-stone-800">
                                          <span className="w-1.5 h-1.5 rounded-full bg-stone-400"></span>
                                          {proj.name}
                                        </li>
                                      ))}
                                    </ul>
                                  )}
                                </div>
                                <div>
                                  <span className="text-[9px] font-mono text-stone-400 uppercase tracking-wider block">Informações Breves de Contato</span>
                                  <div className="mt-1 space-y-1 text-[11px] text-stone-800">
                                    <p><strong>E-mail:</strong> {c.email}</p>
                                    <p><strong>WhatsApp:</strong> {c.phone || "Não cadastrado"}</p>
                                    <p><strong>Conta de Login:</strong> <span className="font-mono bg-stone-100 border px-1">{c.username}</span></p>
                                  </div>
                                </div>
                              </div>

                              <div className="pt-2 border-t border-stone-100 flex justify-between items-center text-[10px]">
                                <span className="text-stone-400">Cadastrado no CBC Office em: {c.createdAt}</span>
                                <button
                                  onClick={() => {
                                    startEditClient(c);
                                  }}
                                  className="font-mono text-[#1E1E1E] uppercase tracking-wider underline hover:text-stone-600 cursor-pointer"
                                >
                                  Editar Credenciais e Cadastro →
                                </button>
                              </div>
                            </motion.div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

              </div>

            </div>
          )}

          {/* ============================================================== */}
          {/* TAB 2: CLIENTES (MANAGE CLIENTS & CREDENTIALS) */}
          {/* ============================================================== */}
          {activeTab === 'clientes' && (
            <div className="space-y-8">
              
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h2 className="font-serif text-xl md:text-2xl text-stone-900">Gerenciamento de Clientes e Acessos</h2>
                  <p className="text-xs text-stone-500 mt-1">Criação de usuários e senhas para que os clientes visualizem seus respectivos centros de custo</p>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                
                {/* Client Creation Form */}
                <div className="bg-white border border-stone-200 p-6 space-y-6 h-fit">
                  <div>
                    <h3 className="font-serif text-base text-stone-900">
                      {editingClient ? 'Atualizar Dados do Cliente' : 'Cadastrar Novo Cliente'}
                    </h3>
                    <p className="text-xs text-stone-500 mt-1">
                      {editingClient ? 'Modifique os dados ou redefina a senha' : 'Gere as credenciais e informe os dados para o cliente acessar.'}
                    </p>
                  </div>

                  <form onSubmit={handleClientSubmit} className="space-y-4">
                    
                    {clientError && (
                      <div className="bg-red-50 border-l-2 border-red-500 text-red-700 p-3 text-xs">
                        {clientError}
                      </div>
                    )}

                    {clientSuccess && (
                      <div className="bg-emerald-50 border-l-2 border-emerald-500 text-emerald-700 p-3 text-xs">
                        {clientSuccess}
                      </div>
                    )}

                    <div>
                      <label className="block text-[10px] font-mono uppercase tracking-widest text-stone-500 mb-1">Nome Completo / Empresa *</label>
                      <input
                        type="text"
                        className="w-full bg-[#F4F4F3] border border-stone-200 py-2 px-3 text-xs focus:outline-none focus:border-stone-400 focus:bg-white rounded-none"
                        placeholder="Ex: Dra. Helena Souza"
                        value={clientForm.name}
                        onChange={(e) => setClientForm({ ...clientForm, name: e.target.value })}
                        required
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[10px] font-mono uppercase tracking-widest text-stone-500 mb-1">E-mail de Contato *</label>
                        <input
                          type="email"
                          className="w-full bg-[#F4F4F3] border border-stone-200 py-2 px-3 text-xs focus:outline-none focus:border-stone-400 focus:bg-white rounded-none"
                          placeholder="Ex: helena@exemplo.com"
                          value={clientForm.email}
                          onChange={(e) => setClientForm({ ...clientForm, email: e.target.value })}
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-mono uppercase tracking-widest text-stone-500 mb-1">Telefone / WhatsApp</label>
                        <input
                          type="text"
                          className="w-full bg-[#F4F4F3] border border-stone-200 py-2 px-3 text-xs focus:outline-none focus:border-stone-400 focus:bg-white rounded-none"
                          placeholder="Ex: (11) 99999-8888"
                          value={clientForm.phone}
                          onChange={(e) => setClientForm({ ...clientForm, phone: e.target.value })}
                        />
                      </div>
                    </div>

                    <div className="border-t border-stone-100 pt-4 space-y-4">
                      <span className="text-[10px] font-mono text-stone-400 uppercase tracking-widest block">Credenciais de Login</span>
                      
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-[10px] font-mono uppercase tracking-widest text-stone-500 mb-1">Usuário *</label>
                          <input
                            type="text"
                            className="w-full bg-[#F4F4F3] border border-stone-200 py-2 px-3 text-xs focus:outline-none focus:border-stone-400 focus:bg-white rounded-none"
                            placeholder="Nome de login (Ex: helena)"
                            value={clientForm.username}
                            onChange={(e) => setClientForm({ ...clientForm, username: e.target.value })}
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-mono uppercase tracking-widest text-stone-500 mb-1">
                            {editingClient ? 'Redefinir Senha' : 'Senha de Acesso *'}
                          </label>
                          <input
                            type="text"
                            className="w-full bg-[#F4F4F3] border border-stone-200 py-2 px-3 text-xs focus:outline-none focus:border-stone-400 focus:bg-white rounded-none"
                            placeholder={editingClient ? 'Mantenha em branco para não alterar' : 'Senha de acesso (Case-sensitive)'}
                            value={clientForm.password}
                            onChange={(e) => setClientForm({ ...clientForm, password: e.target.value })}
                            required={!editingClient}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-2.5 pt-4">
                      <button
                        type="submit"
                        id="client_submit_btn"
                        className="flex-grow bg-[#1E1E1E] text-white hover:bg-stone-800 py-2.5 px-4 text-xs font-mono uppercase tracking-wider transition-all rounded-none cursor-pointer text-center flex items-center justify-center gap-1.5"
                      >
                        <UserCheck size={13} />
                        {editingClient ? 'Salvar Edição' : 'Cadastrar e Liberar'}
                      </button>
                      
                      {editingClient && (
                        <button
                          type="button"
                          id="client_cancel_btn"
                          onClick={cancelEditClient}
                          className="bg-white border border-stone-200 text-stone-600 hover:text-stone-800 py-2.5 px-3 text-xs font-mono uppercase tracking-wider transition-all rounded-none cursor-pointer"
                        >
                          Cancelar
                        </button>
                      )}
                    </div>

                  </form>
                </div>

                {/* Clients Directory */}
                <div className="bg-white border border-stone-200 p-6 lg:col-span-2 space-y-6">
                  
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-stone-100">
                    <div>
                      <h3 className="font-serif text-base text-stone-900">Diretório de Clientes</h3>
                      <p className="text-xs text-stone-500 mt-1">Busque clientes cadastrados e gerencie suas permissões de visualização</p>
                    </div>

                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 flex items-center pl-2.5 text-stone-400 pointer-events-none">
                        <Search size={12} />
                      </span>
                      <input
                        type="text"
                        placeholder="Buscar cliente..."
                        value={clientSearch}
                        onChange={(e) => setClientSearch(e.target.value)}
                        className="bg-[#F4F4F3] border border-stone-200 py-1.5 pl-8 pr-3 text-xs w-48 focus:outline-none focus:border-stone-400 focus:bg-white transition-all rounded-none font-sans"
                      />
                    </div>
                  </div>

                  {filteredClients.length === 0 ? (
                    <div className="text-center py-12 border border-dashed border-stone-200 text-stone-500 text-xs">
                      Nenhum cliente cadastrado com os critérios buscados.
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {filteredClients.map(c => (
                        <div 
                          key={c.id} 
                          id={`client_card_${c.id}`}
                          className="border border-stone-200 p-4 hover:border-stone-400 transition-all space-y-4"
                        >
                          <div className="flex justify-between items-start">
                            <div>
                              <h4 className="font-serif text-sm text-stone-900 font-semibold">{c.name}</h4>
                              <p className="text-[10px] font-mono text-stone-400 uppercase mt-0.5">Cadastrado em {c.createdAt}</p>
                            </div>
                            <div className="flex items-center gap-1">
                              <button
                                id={`edit_client_btn_${c.id}`}
                                onClick={() => startEditClient(c)}
                                className="w-8 h-8 flex items-center justify-center text-stone-400 hover:text-[#1E1E1E] hover:bg-stone-50 transition-all rounded-none cursor-pointer"
                                title="Editar dados e senha"
                              >
                                <Edit size={13} />
                              </button>
                              <button
                                id={`delete_client_btn_${c.id}`}
                                onClick={() => {
                                  if (confirm(`Deseja realmente excluir o cliente "${c.name}"? Isso apagará todos os seus projetos e lançamentos associados de forma irreversível!`)) {
                                    onDeleteClient(c.id);
                                  }
                                }}
                                className="w-8 h-8 flex items-center justify-center text-red-400 hover:text-red-700 hover:bg-red-50 transition-all rounded-none cursor-pointer"
                                title="Excluir cliente"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-3 border-t border-stone-100 text-[11px] text-stone-600">
                            <div>
                              <span className="font-mono text-[9px] text-stone-400 uppercase tracking-wider block">Usuário de Login</span>
                              <span className="font-mono bg-stone-50 border border-stone-200 px-1.5 py-0.5 font-medium">{c.username}</span>
                            </div>
                            <div>
                              <span className="font-mono text-[9px] text-stone-400 uppercase tracking-wider block">Projetos Ativos</span>
                              <span className="font-semibold text-stone-800">{c.projectCount} centro(s) de custo</span>
                            </div>
                            <div>
                              <span className="font-mono text-[9px] text-stone-400 uppercase tracking-wider block">Total Lançado</span>
                              <span className="font-semibold text-stone-800">{formatCurrency(c.spent)}</span>
                            </div>
                          </div>

                          <div className="text-[11px] text-stone-500 space-y-0.5">
                            <p><strong>Email:</strong> {c.email}</p>
                            {c.phone && <p><strong>Telefone:</strong> {c.phone}</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                </div>

              </div>

            </div>
          )}

          {/* ============================================================== */}
          {/* TAB 3: OBRAS E PROJETOS (MANAGE PROJECTS) */}
          {/* ============================================================== */}
          {activeTab === 'projetos' && (
            <div className="space-y-8">
              
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h2 className="font-serif text-xl md:text-2xl text-stone-900">Gerenciamento de Obras e Projetos</h2>
                  <p className="text-xs text-stone-500 mt-1">Configuração de novos canteiros de obra, contratos técnicos e orçamentos gerais</p>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                
                {/* Project Form */}
                <div className="bg-white border border-stone-200 p-6 space-y-6 h-fit">
                  <div>
                    <h3 className="font-serif text-base text-stone-900">
                      {editingProject ? 'Atualizar Obra / Projeto' : 'Nova Obra / Projeto'}
                    </h3>
                    <p className="text-xs text-stone-500 mt-1">
                      {editingProject ? 'Ajuste os parâmetros contratuais da obra' : 'Adicione um novo centro de custo e defina a verba aprovada.'}
                    </p>
                  </div>

                  <form onSubmit={handleProjectSubmit} className="space-y-4">
                    
                    <div>
                      <label className="block text-[10px] font-mono uppercase tracking-widest text-stone-500 mb-1">Título do Projeto *</label>
                      <input
                        type="text"
                        className="w-full bg-[#F4F4F3] border border-stone-200 py-2 px-3 text-xs focus:outline-none focus:border-stone-400 focus:bg-white rounded-none"
                        placeholder="Ex: Reforma de Interiores Clínica OralMed"
                        value={projectForm.name}
                        onChange={(e) => setProjectForm({ ...projectForm, name: e.target.value })}
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-mono uppercase tracking-widest text-stone-500 mb-1">Cliente Vinculado *</label>
                      <select
                        className="w-full bg-[#F4F4F3] border border-stone-200 py-2 px-3 text-xs focus:outline-none focus:border-stone-400 focus:bg-white rounded-none"
                        value={projectForm.clientId}
                        onChange={(e) => setProjectForm({ ...projectForm, clientId: e.target.value })}
                        required
                      >
                        <option value="">Selecione o cliente...</option>
                        {clients.map(c => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[10px] font-mono uppercase tracking-widest text-stone-500 mb-1">Tipo de Centro *</label>
                        <select
                          className="w-full bg-[#F4F4F3] border border-stone-200 py-2 px-3 text-xs focus:outline-none focus:border-stone-400 focus:bg-white rounded-none"
                          value={projectForm.type}
                          onChange={(e) => setProjectForm({ ...projectForm, type: e.target.value as ProjectType })}
                          required
                        >
                          <option value="obra">Obra (Canteiro)</option>
                          <option value="projeto">Projeto Técnico</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] font-mono uppercase tracking-widest text-stone-500 mb-1">Status Atual *</label>
                        <select
                          className="w-full bg-[#F4F4F3] border border-stone-200 py-2 px-3 text-xs focus:outline-none focus:border-stone-400 focus:bg-white rounded-none"
                          value={projectForm.status}
                          onChange={(e) => setProjectForm({ ...projectForm, status: e.target.value as ProjectStatus })}
                          required
                        >
                          <option value="planejamento">Planejamento</option>
                          <option value="execucao">Em Andamento</option>
                          <option value="concluido">Concluído</option>
                          <option value="suspenso">Suspenso</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[10px] font-mono uppercase tracking-widest text-stone-500 mb-1">Orçamento Aprovado *</label>
                        <div className="relative">
                          <span className="absolute inset-y-0 left-0 flex items-center pl-2.5 pointer-events-none text-stone-400 text-xs font-mono">R$</span>
                          <input
                            type="number"
                            step="0.01"
                            className="w-full bg-[#F4F4F3] border border-stone-200 py-2 pl-8 pr-3 text-xs focus:outline-none focus:border-stone-400 focus:bg-white rounded-none font-mono"
                            placeholder="0.00"
                            value={projectForm.budget}
                            onChange={(e) => setProjectForm({ ...projectForm, budget: e.target.value })}
                            required
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-[10px] font-mono uppercase tracking-widest text-stone-500 mb-1">Área Estimada (m²)</label>
                        <input
                          type="number"
                          className="w-full bg-[#F4F4F3] border border-stone-200 py-2 px-3 text-xs focus:outline-none focus:border-stone-400 focus:bg-white rounded-none font-mono"
                          placeholder="Ex: 350"
                          value={projectForm.area}
                          onChange={(e) => setProjectForm({ ...projectForm, area: e.target.value })}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4">
                      <div>
                        <label className="block text-[10px] font-mono uppercase tracking-widest text-stone-500 mb-1">Data de Início *</label>
                        <input
                          type="date"
                          className="w-full bg-[#F4F4F3] border border-stone-200 py-2 px-3 text-xs focus:outline-none focus:border-stone-400 focus:bg-white rounded-none font-mono"
                          value={projectForm.startDate}
                          onChange={(e) => setProjectForm({ ...projectForm, startDate: e.target.value })}
                          required
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] font-mono uppercase tracking-widest text-stone-500 mb-1">Endereço / Localização</label>
                      <input
                        type="text"
                        className="w-full bg-[#F4F4F3] border border-stone-200 py-2 px-3 text-xs focus:outline-none focus:border-stone-400 focus:bg-white rounded-none"
                        placeholder="Ex: Condomínio Quinta da Baroneza"
                        value={projectForm.location}
                        onChange={(e) => setProjectForm({ ...projectForm, location: e.target.value })}
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-mono uppercase tracking-widest text-stone-500 mb-1">Descrição do Escopo</label>
                      <textarea
                        className="w-full bg-[#F4F4F3] border border-stone-200 py-2 px-3 text-xs focus:outline-none focus:border-stone-400 focus:bg-white rounded-none h-20 resize-none"
                        placeholder="Descreva resumidamente os limites do projeto..."
                        value={projectForm.description}
                        onChange={(e) => setProjectForm({ ...projectForm, description: e.target.value })}
                      />
                    </div>

                    <div className="flex gap-2.5 pt-4">
                      <button
                        type="submit"
                        id="project_submit_btn"
                        className="flex-grow bg-[#1E1E1E] text-white hover:bg-stone-800 py-2.5 px-4 text-xs font-mono uppercase tracking-wider transition-all rounded-none cursor-pointer text-center flex items-center justify-center gap-1.5"
                      >
                        <Plus size={13} />
                        {editingProject ? 'Salvar Edição' : 'Criar Centro de Custo'}
                      </button>
                      
                      {editingProject && (
                        <button
                          type="button"
                          id="project_cancel_btn"
                          onClick={cancelEditProject}
                          className="bg-white border border-stone-200 text-stone-600 hover:text-stone-800 py-2.5 px-3 text-xs font-mono uppercase tracking-wider transition-all rounded-none cursor-pointer"
                        >
                          Cancelar
                        </button>
                      )}
                    </div>

                  </form>
                </div>

                {/* Projects Grid Directory */}
                <div className="bg-white border border-stone-200 p-6 lg:col-span-2 space-y-6">
                  
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-stone-100">
                    <div>
                      <h3 className="font-serif text-base text-stone-900">Listagem de Projetos e Verbas</h3>
                      <p className="text-xs text-stone-500 mt-1">Status financeiro particular de cada obra ativa</p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <div className="relative">
                        <span className="absolute inset-y-0 left-0 flex items-center pl-2.5 text-stone-400 pointer-events-none">
                          <Search size={12} />
                        </span>
                        <input
                          type="text"
                          placeholder="Buscar projeto/cliente..."
                          value={projectSearch}
                          onChange={(e) => setProjectSearch(e.target.value)}
                          className="bg-[#F4F4F3] border border-stone-200 py-1.5 pl-8 pr-3 text-xs w-44 focus:outline-none focus:border-stone-400 focus:bg-white transition-all rounded-none font-sans"
                        />
                      </div>

                      <select
                        value={projectTypeFilter}
                        onChange={(e) => setProjectTypeFilter(e.target.value)}
                        className="bg-[#F4F4F3] border border-stone-200 py-1.5 px-2 text-xs focus:outline-none focus:border-stone-400 transition-all rounded-none font-sans"
                      >
                        <option value="all">Tipos</option>
                        <option value="obra">Obra</option>
                        <option value="projeto">Projeto</option>
                      </select>
                    </div>
                  </div>

                  {filteredProjects.length === 0 ? (
                    <div className="text-center py-12 border border-dashed border-stone-200 text-stone-500 text-xs">
                      Nenhuma obra cadastrada.
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {filteredProjects.map(p => {
                        const pctSpent = p.budget > 0 ? (p.spent / p.budget) * 100 : 0;
                        const remains = p.budget - p.spent;
                        
                        return (
                          <div 
                            key={p.id} 
                            id={`project_card_${p.id}`}
                            className="border border-stone-200 p-5 space-y-4 hover:border-stone-400 transition-all"
                          >
                            <div className="flex justify-between items-start gap-4">
                              <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                  <span className="inline-block px-1.5 py-0.5 font-mono text-[8px] uppercase bg-stone-100 text-stone-700 border">
                                    {p.type === 'obra' ? 'Obra' : 'Projeto'}
                                  </span>
                                  <span className={`inline-block px-1.5 py-0.5 font-mono text-[8px] uppercase border ${
                                    p.status === 'execucao' ? 'bg-[#EBF7EE] text-[#245D3B] border-[#245D3B]/20' : 'bg-stone-100 text-stone-700'
                                  }`}>
                                    {p.status}
                                  </span>
                                </div>
                                <h4 className="font-serif text-base text-stone-950 font-semibold">{p.name}</h4>
                                <p className="text-xs text-stone-500"><strong>Cliente:</strong> {p.clientName}</p>
                              </div>

                              <div className="flex items-center gap-1">
                                <button
                                  id={`edit_project_btn_${p.id}`}
                                  onClick={() => startEditProject(p)}
                                  className="w-8 h-8 flex items-center justify-center text-stone-400 hover:text-[#1E1E1E] hover:bg-stone-50 transition-all rounded-none cursor-pointer"
                                  title="Editar Obra"
                                >
                                  <Edit size={13} />
                                </button>
                                <button
                                  id={`delete_project_btn_${p.id}`}
                                  onClick={() => {
                                    if (confirm(`Deseja realmente deletar a obra "${p.name}"? Todos os lançamentos financeiros vinculados também serão permanentemente excluídos!`)) {
                                      onDeleteProject(p.id);
                                    }
                                  }}
                                  className="w-8 h-8 flex items-center justify-center text-red-400 hover:text-red-700 hover:bg-red-50 transition-all rounded-none cursor-pointer"
                                  title="Deletar Obra"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            </div>

                            {/* Financial Progress representation */}
                            <div className="space-y-2.5 pt-3 border-t border-stone-100">
                              <div className="flex justify-between text-[11px] text-stone-600">
                                <span>Progresso dos Lançamentos:</span>
                                <span className="font-mono font-semibold text-stone-800">
                                  {pctSpent.toFixed(1)}% do teto
                                </span>
                              </div>
                              <div className="w-full h-2 bg-stone-100 rounded-none overflow-hidden">
                                <div 
                                  className={`h-full transition-all duration-500 ${pctSpent > 100 ? 'bg-red-600' : 'bg-stone-700'}`} 
                                  style={{ width: `${Math.min(100, pctSpent)}%` }}
                                ></div>
                              </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-[11px] pt-1">
                              <div>
                                <span className="text-stone-400 block font-mono text-[9px] uppercase tracking-wider">Verba Aprovada</span>
                                <span className="font-semibold text-stone-900">{formatCurrency(p.budget)}</span>
                              </div>
                              <div>
                                <span className="text-stone-400 block font-mono text-[9px] uppercase tracking-wider">Despesas Lançadas</span>
                                <span className="font-semibold text-stone-900">{formatCurrency(p.spent)}</span>
                              </div>
                              <div>
                                <span className="text-stone-400 block font-mono text-[9px] uppercase tracking-wider">Saldo Restante</span>
                                <span className={`font-semibold ${remains >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                                  {formatCurrency(remains)}
                                </span>
                              </div>
                            </div>

                            {p.location && (
                              <p className="text-[10px] text-stone-400 font-sans mt-2 italic">📍 Endereço: {p.location}</p>
                            )}

                          </div>
                        );
                      })}
                    </div>
                  )}

                </div>

              </div>

            </div>
          )}

          {/* ============================================================== */}
          {/* TAB 5: CLASSES DE TRABALHO - 1. ADMINISTRATIVO */}
          {/* ============================================================== */}
          {activeTab === 'classe_administrativo' && (
            <div className="space-y-6">
              
              {/* Header */}
              <div className="border-b border-stone-200 pb-5">
                <h2 className="font-serif text-xl md:text-2xl text-stone-900 tracking-tight">1. Gestão e Documentação Administrativa</h2>
                <p className="text-xs text-stone-500 mt-1">
                  Gerencie minutas de contratos do escritório, licenciamentos, taxas municipais, certificados RRT/ART e documentação fiscal.
                </p>
              </div>

              {/* Shared Project Switcher Header */}
              <div className="bg-stone-100 border border-stone-200 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <span className="text-[9px] font-mono uppercase tracking-widest text-stone-500 block">Obra / Centro de Custo Ativo</span>
                  <h3 className="font-serif text-base text-stone-900 mt-1 font-bold">
                    {projects.find(p => p.id === selectedClassProjectId)?.name || "Nenhum projeto cadastrado"}
                  </h3>
                </div>
                <div>
                  <select
                    value={selectedClassProjectId}
                    onChange={(e) => {
                      setSelectedClassProjectId(e.target.value);
                      // Reset generated contract view
                      setContractForm(prev => ({ ...prev, isGenerated: false, isSigned: false }));
                    }}
                    className="bg-white border border-stone-300 py-1.5 px-3 text-xs focus:outline-none focus:border-stone-400 transition-all rounded-none font-sans font-medium"
                  >
                    {projects.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Pasta de Documentos Oficiais */}
              <div className="bg-white border border-stone-200 p-6 space-y-6">
                <div className="border-b border-stone-100 pb-4">
                  <h3 className="font-serif text-base text-stone-950 font-bold flex items-center gap-2">
                    <Layers size={18} className="text-stone-600" />
                    Pasta de Documentos Oficiais
                  </h3>
                  <p className="text-xs text-stone-500 mt-1">
                    Gestão centralizada de arquivos oficiais e obrigações administrativas associadas a este centro de custo.
                  </p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  {/* Painel Esquerdo: Anexo de Documentos */}
                  <div className="space-y-4">
                    <div className="bg-[#FAF9F6] p-5 border border-stone-200 space-y-4">
                      <div>
                        <h4 className="font-serif text-xs font-bold text-stone-900 tracking-tight">
                          {editingAdminDoc ? "Alterar / Substituir Documento" : "Anexar Novo Documento"}
                        </h4>
                        <p className="text-[10px] text-stone-500 mt-0.5">
                          {editingAdminDoc 
                            ? "Altere os metadados ou envie um novo arquivo PDF para substituir o atual." 
                            : "Envie arquivos obrigatórios ou complementares exclusivamente em formato PDF."}
                        </p>
                      </div>

                      <form onSubmit={(e) => {
                        e.preventDefault();
                        
                        if (!adminDocName.trim()) return;
                        
                        if (!editingAdminDoc && !selectedPdfFile) {
                          setPdfUploadError('Por favor, selecione ou arraste um arquivo PDF obrigatório.');
                          return;
                        }

                        // Build the document object payload
                        const payload = editingAdminDoc ? {
                          ...editingAdminDoc,
                          name: adminDocName.trim(),
                          description: adminDocDesc.trim(),
                          category: selectedDocCategory,
                          fileName: selectedPdfFile ? selectedPdfFile.name : editingAdminDoc.fileName,
                          fileNameChanged: !!selectedPdfFile
                        } : {
                          id: `doc-${Date.now()}`,
                          projectId: selectedClassProjectId,
                          name: adminDocName.trim(),
                          description: adminDocDesc.trim(),
                          class: 'administrativo' as DocumentClass,
                          category: selectedDocCategory,
                          fileName: selectedPdfFile!.name,
                          uploadedAt: new Date().toISOString().split('T')[0],
                          status: 'aprovado' as DocumentStatus
                        };

                        setAdminDocSaveConfirm({
                          isOpen: true,
                          isEdit: !!editingAdminDoc,
                          payload
                        });
                      }} className="space-y-3.5">
                        <div>
                          <label className="text-[9px] font-mono uppercase tracking-wider text-stone-500 block mb-1 font-bold">Categoria do Documento</label>
                          <select
                            value={selectedDocCategory}
                            onChange={(e) => setSelectedDocCategory(e.target.value)}
                            className="w-full bg-white border border-stone-200 py-2 px-3 text-xs focus:outline-none focus:border-stone-400 transition-all rounded-none"
                          >
                            <option value="contrato">Contrato Técnico Homologado (Mínimo Obrigatório)</option>
                            <option value="alvara">Alvará de Reforma / Obra</option>
                            <option value="rrt">RRT / ART de Responsabilidade</option>
                            <option value="orcamento">Orçamento Técnico Consolidado</option>
                            <option value="fiscal">Documentação Fiscal / Recibos</option>
                            <option value="outros">Outros Documentos Administrativos</option>
                          </select>
                        </div>

                        <div>
                          <label className="text-[9px] font-mono uppercase tracking-wider text-stone-500 block mb-1 font-bold">Título do Documento</label>
                          <input
                            type="text"
                            name="doc_name"
                            value={adminDocName}
                            onChange={(e) => setAdminDocName(e.target.value)}
                            placeholder="Ex: Contrato de Prestação de Serviços"
                            className="w-full bg-white border border-stone-200 py-2 px-3 text-xs focus:outline-none focus:border-stone-400 transition-all rounded-none font-sans"
                            required
                          />
                        </div>

                        <div>
                          <label className="text-[9px] font-mono uppercase tracking-wider text-stone-500 block mb-1 font-bold">Descrição Curta</label>
                          <input
                            type="text"
                            name="doc_desc"
                            value={adminDocDesc}
                            onChange={(e) => setAdminDocDesc(e.target.value)}
                            placeholder="Ex: Regulamenta prazos, honorários e entregáveis"
                            className="w-full bg-white border border-stone-200 py-2 px-3 text-xs focus:outline-none focus:border-stone-400 transition-all rounded-none font-sans"
                          />
                        </div>

                        {/* Dual File Upload System (Local File & Camera) */}
                        <div>
                          <label className="text-[9px] font-mono uppercase tracking-wider text-stone-500 block mb-1 font-bold">
                            {editingAdminDoc ? "Substituir Arquivo / Documento (Opcional)" : "Anexo do Documento"}
                          </label>
                          
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-1">
                            <button
                              type="button"
                              onClick={() => document.getElementById('pdf-file-picker')?.click()}
                              className="flex items-center justify-center gap-2 border-2 border-dashed border-stone-300 hover:border-stone-500 bg-white hover:bg-[#FAF9F6] py-3.5 px-3 text-[10px] font-mono uppercase font-bold tracking-wider text-stone-800 transition-all cursor-pointer group"
                            >
                              <Layers size={13} className="text-stone-500 group-hover:text-stone-800" />
                              <span>Adicionar Arquivo Local</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => document.getElementById('camera-file-picker')?.click()}
                              className="flex items-center justify-center gap-2 border-2 border-dashed border-stone-300 hover:border-stone-500 bg-white hover:bg-[#FAF9F6] py-3.5 px-3 text-[10px] font-mono uppercase font-bold tracking-wider text-stone-800 transition-all cursor-pointer group"
                            >
                              <Camera size={13} className="text-stone-500 group-hover:text-stone-800" />
                              <span>Tirar Foto</span>
                            </button>
                          </div>

                          <input
                            id="pdf-file-picker"
                            type="file"
                            accept=".pdf,image/*,.xlsx,.xls,.doc,.docx"
                            onChange={(e) => {
                              setPdfUploadError(null);
                              const files = e.target.files;
                              if (files && files.length > 0) {
                                const file = files[0];
                                if (file.size > 5 * 1024 * 1024) {
                                  setPdfUploadError('O tamanho do arquivo excede o limite de 5MB por documento.');
                                  setSelectedPdfFile(null);
                                  return;
                                }
                                const allowedExtensions = ['.pdf', '.png', '.jpg', '.jpeg', '.xlsx', '.xls', '.csv', '.doc', '.docx'];
                                const isAllowed = allowedExtensions.some(ext => file.name.toLowerCase().endsWith(ext)) || file.type.startsWith('image/') || file.type === 'application/pdf';
                                if (isAllowed) {
                                  setSelectedPdfFile(file);
                                } else {
                                  setPdfUploadError('Formato inválido. Envie arquivos PDF, Imagens, Planilha Excel ou Documento Word.');
                                  setSelectedPdfFile(null);
                                }
                              }
                            }}
                            className="hidden"
                          />

                          <input
                            id="camera-file-picker"
                            type="file"
                            accept="image/*"
                            capture="environment"
                            onChange={(e) => {
                              setPdfUploadError(null);
                              const files = e.target.files;
                              if (files && files.length > 0) {
                                const file = files[0];
                                if (file.size > 5 * 1024 * 1024) {
                                  setPdfUploadError('O tamanho do arquivo excede o limite de 5MB por documento.');
                                  setSelectedPdfFile(null);
                                  return;
                                }
                                setSelectedPdfFile(file);
                              }
                            }}
                            className="hidden"
                          />

                          {/* Selected File Status */}
                          {selectedPdfFile ? (
                            <div className="bg-emerald-50 border border-emerald-200 p-3 mt-3 flex items-center justify-between text-xs">
                              <div className="flex items-center gap-2 truncate">
                                <span className="text-sm">📄</span>
                                <div className="truncate">
                                  <p className="font-bold text-emerald-900 truncate">{selectedPdfFile.name}</p>
                                  <p className="text-[9px] font-mono text-emerald-700">{(selectedPdfFile.size / 1024).toFixed(1)} KB • Pronto para salvar</p>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => setSelectedPdfFile(null)}
                                className="text-red-600 hover:text-red-800 text-[10px] font-mono uppercase font-bold"
                              >
                                Limpar
                              </button>
                            </div>
                          ) : editingAdminDoc ? (
                            <div className="bg-stone-50 border border-stone-200 p-3 mt-3 text-xs">
                              <div className="flex items-center gap-2">
                                <span className="text-emerald-600 text-sm">✓</span>
                                <div>
                                  <p className="font-semibold text-stone-700">Manter arquivo existente: {editingAdminDoc.fileName}</p>
                                  <p className="text-[9px] text-stone-400">Substitua o arquivo usando os botões acima se desejar.</p>
                                </div>
                              </div>
                            </div>
                          ) : null}

                          {pdfUploadError && (
                            <p className="text-[10px] text-red-600 mt-2.5 font-mono">{pdfUploadError}</p>
                          )}
                        </div>

                        <div className="flex gap-2">
                          {editingAdminDoc && (
                            <button
                              type="button"
                              onClick={handleCancelAdminDocEdit}
                              className="flex-1 bg-stone-100 hover:bg-stone-200 border border-stone-300 text-stone-700 py-2.5 px-3 text-[10px] font-mono uppercase tracking-wider cursor-pointer font-bold transition-all"
                            >
                              Cancelar
                            </button>
                          )}
                          <button
                            type="submit"
                            className="flex-2 bg-stone-900 text-white hover:bg-stone-800 py-2.5 px-3 text-[10px] font-mono uppercase tracking-wider cursor-pointer font-bold transition-all border border-transparent hover:border-stone-900 shadow-sm"
                          >
                            {editingAdminDoc ? "Salvar Alterações" : "Salvar e Vincular PDF"}
                          </button>
                        </div>
                      </form>
                    </div>
                  </div>

                  {/* Painel Direito: Lista de Documentos Oficial */}
                  <div className="space-y-4 flex flex-col justify-between">
                    <div>
                      <h4 className="font-serif text-xs font-bold text-stone-900 tracking-tight mb-3">Histórico e Arquivos Vinculados</h4>
                      
                      <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
                        {documents.filter(d => d.projectId === selectedClassProjectId && d.class === 'administrativo').length === 0 ? (
                          <div className="text-center py-12 border border-dashed border-stone-200 text-stone-400 text-xs">
                            Nenhum arquivo administrativo cadastrado para este centro de custo.
                          </div>
                        ) : (
                          documents.filter(d => d.projectId === selectedClassProjectId && d.class === 'administrativo').map(doc => (
                            <div key={doc.id} className="bg-stone-50 border border-stone-200 p-3.5 flex items-start justify-between gap-3 hover:bg-stone-100/50 transition-all">
                              <div className="min-w-0 flex-1 space-y-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <h5 className="font-sans font-bold text-xs text-stone-900 truncate">{doc.name}</h5>
                                  <span className={`inline-block px-1.5 py-0.5 text-[8px] font-mono font-bold uppercase border ${
                                    doc.category === 'contrato' ? 'bg-amber-50 text-amber-800 border-amber-200' :
                                    doc.category === 'alvara' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' :
                                    doc.category === 'rrt' ? 'bg-blue-50 text-blue-800 border-blue-200' :
                                    doc.category === 'orcamento' ? 'bg-purple-50 text-purple-800 border-purple-200' :
                                    doc.category === 'fiscal' ? 'bg-stone-100 text-stone-800 border-stone-300' :
                                    'bg-stone-50 text-stone-600 border border-stone-200'
                                  }`}>
                                    {doc.category === 'contrato' ? 'Contrato Mínimo' :
                                     doc.category === 'alvara' ? 'Alvará/Obra' :
                                     doc.category === 'rrt' ? 'RRT/ART' :
                                     doc.category === 'orcamento' ? 'Orçamento' :
                                     doc.category === 'fiscal' ? 'Fiscal/Recibo' :
                                     'Outros'}
                                  </span>
                                </div>
                                <p className="text-[10.5px] text-stone-600 leading-normal">{doc.description || 'Sem descrição detalhada.'}</p>
                                <div className="flex items-center gap-2 text-[9px] font-mono text-stone-400 flex-wrap">
                                  <span>📄 {doc.fileName}</span>
                                  <span>•</span>
                                  <span>Enviado em: {doc.uploadedAt}</span>
                                </div>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => setPreviewDoc(doc)}
                                  className="text-stone-500 hover:text-stone-900 hover:bg-stone-200/50 p-1.5 rounded transition-all cursor-pointer flex-shrink-0"
                                  title="Visualizar anexo"
                                >
                                  <Eye size={13} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDownloadDoc(doc)}
                                  className="text-stone-500 hover:text-[#1E1E1E] hover:bg-stone-200/50 p-1.5 rounded transition-all cursor-pointer flex-shrink-0"
                                  title="Baixar anexo"
                                >
                                  <Download size={13} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleStartAdminDocEdit(doc)}
                                  className="text-stone-400 hover:text-stone-900 p-1.5 hover:bg-stone-200/50 rounded transition-all cursor-pointer flex-shrink-0"
                                  title="Alterar metadados / Substituir arquivo"
                                >
                                  <Edit size={13} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setAdminDocDeleteConfirm({
                                      isOpen: true,
                                      docId: doc.id,
                                      docName: doc.name
                                    });
                                  }}
                                  className="text-stone-400 hover:text-red-600 p-1 hover:bg-red-50/50 rounded transition-all cursor-pointer flex-shrink-0"
                                  title="Excluir arquivo"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    {/* Status de Conformidade */}
                    <div className="pt-4 border-t border-stone-100">
                      {documents.some(d => d.projectId === selectedClassProjectId && d.class === 'administrativo' && d.category === 'contrato') ? (
                        <div className="bg-emerald-50/50 border border-emerald-200 p-3 text-[11px] text-emerald-800 flex items-center gap-2">
                          <span className="text-emerald-600 text-xs font-bold">✓</span>
                          <span><strong>Conformidade Contratual Ativa:</strong> O contrato mínimo obrigatório está anexado e validado.</span>
                        </div>
                      ) : (
                        <div className="bg-amber-50/50 border border-amber-200 p-3 text-[11px] text-amber-800 flex items-start gap-2">
                          <span className="text-amber-600 text-xs font-bold mt-0.5">⚠️</span>
                          <div>
                            <span className="font-bold block">Contrato Obrigatório Pendente</span>
                            <span className="text-stone-600 text-[10px] leading-relaxed mt-0.5 block">Anexe o contrato de prestação de serviços na categoria "Contrato Técnico Homologado" para liberar o canteiro.</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

            </div>
          )}

          {/* ============================================================== */}
          {/* TAB 6: CLASSES DE TRABALHO - 2. PLANEJAMENTO */}
          {/* ============================================================== */}
          {activeTab === 'classe_planejamento' && (
            <div className="space-y-6">
              <div className="border-b border-stone-200 pb-5 mb-4">
                <h2 className="font-serif text-xl md:text-2xl text-stone-900 tracking-tight">
                  Planejamento e Suprimentos
                </h2>
                <p className="text-xs text-stone-500 mt-1">
                  Gerencie o cronograma físico-financeiro com preenchimento inteligente por IA, organize a programação de pedidos de materiais por obra e controle a programação de pagamentos de mão de obra.
                </p>
              </div>

              <PlanningSchedule
                timelinePhases={timelinePhases}
                setTimelinePhases={setTimelinePhases}
                projects={projects}
                transactions={transactions}
                cronogramaProjectId={cronogramaProjectId}
                setCronogramaProjectId={setCronogramaProjectId}
                isCronogramaCollapsed={isCronogramaCollapsed}
                setIsCronogramaCollapsed={setIsCronogramaCollapsed}
                formatCurrency={formatCurrency}
              />

              <PlanningMaterials
                materialsList={materialsList}
                setMaterialsList={setMaterialsList}
                projects={projects}
                materiaisProjectId={materiaisProjectId}
                setMateriaisProjectId={setMateriaisProjectId}
                isMateriaisCollapsed={isMateriaisCollapsed}
                setIsMateriaisCollapsed={setIsMateriaisCollapsed}
                formatCurrency={formatCurrency}
              />

              <PlanningLaborPayments
                projects={projects}
                laborProjectId={laborProjectId}
                setLaborProjectId={setLaborProjectId}
                isLaborCollapsed={isLaborCollapsed}
                setIsLaborCollapsed={setIsLaborCollapsed}
                formatCurrency={formatCurrency}
              />
            </div>
          )}

          {/* ============================================================== */}
          {/* TAB 7: CLASSES DE TRABALHO - 3. ACOMPANHAMENTO */}
          {/* ============================================================== */}
          {activeTab === 'classe_acompanhamento' && (
            <div className="space-y-6">
              
              {/* Header */}
              <div className="border-b border-stone-200 pb-5">
                <h2 className="font-serif text-xl md:text-2xl text-stone-900 tracking-tight">3. Acompanhamento Diário &amp; Vistorias</h2>
                <p className="text-xs text-stone-500 mt-1">
                  Registre diários de obra (RDO), acompanhe listas de correção de detalhes e publique o memorial fotográfico de evolução técnica.
                </p>
              </div>

              {/* Shared Project Switcher Header */}
              <div className="bg-stone-100 border border-stone-200 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <span className="text-[9px] font-mono uppercase tracking-widest text-stone-500 block">Obra / Centro de Custo Ativo</span>
                  <h3 className="font-serif text-base text-stone-900 mt-1 font-bold">
                    {projects.find(p => p.id === selectedClassProjectId)?.name || "Nenhum projeto cadastrado"}
                  </h3>
                </div>
                <div>
                  <select
                    value={selectedClassProjectId}
                    onChange={(e) => setSelectedClassProjectId(e.target.value)}
                    className="bg-white border border-stone-300 py-1.5 px-3 text-xs focus:outline-none focus:border-stone-400 transition-all rounded-none font-sans font-medium"
                  >
                    {projects.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Módulo Financeiro com Leitura Inteligente de NF e Telegram Storage */}
              {selectedClassProjectId && (
                <AcompanhamentoFinanceiro
                  projectId={selectedClassProjectId}
                  project={projects.find(p => p.id === selectedClassProjectId)}
                  transactions={transactions}
                  addTransaction={onAddTransaction}
                  editTransaction={onEditTransaction}
                  deleteTransaction={onDeleteTransaction}
                />
              )}

              {/* Módulo de Acompanhamento Físico da Obra */}
              {selectedClassProjectId && (
                <AcompanhamentoFisico
                  projectId={selectedClassProjectId}
                  project={projects.find(p => p.id === selectedClassProjectId)}
                  timelinePhases={timelinePhases}
                  setTimelinePhases={setTimelinePhases}
                  weeklyLogs={physicalWeeklyLogs}
                  addWeeklyLog={(log) => setPhysicalWeeklyLogs(prev => [...prev, log])}
                  deleteWeeklyLog={(id) => setPhysicalWeeklyLogs(prev => prev.filter(log => log.id !== id))}
                  transactions={transactions}
                />
              )}

              {/* Módulo de Mapas de Cotação Comparativo */}
              {selectedClassProjectId && (
                <QuotationMaps
                  projectId={selectedClassProjectId}
                  project={projects.find(p => p.id === selectedClassProjectId)}
                  readOnly={false}
                  clientName={
                    (() => {
                      const proj = projects.find(p => p.id === selectedClassProjectId);
                      const cl = clients.find(c => c.id === proj?.clientId);
                      return cl?.name || "Cliente";
                    })()
                  }
                  addTransaction={onAddTransaction}
                />
              )}

            </div>
          )}

          {/* ============================================================== */}
          {/* TAB: CONTRATOS - GERAÇÃO DE MINUTAS */}
          {/* ============================================================== */}
          {activeTab === 'contratos' && (
            <ContractGeneration
              clients={clients}
              projects={projects}
              contracts={contracts}
              onAddContract={onAddContract}
              onEditContract={onEditContract}
              onDeleteContract={onDeleteContract}
            />
          )}

          {/* ============================================================== */}
          {/* TAB: DEMANDAS - CRM INTERNO EM QUADRO KANBAN */}
          {/* ============================================================== */}
          {activeTab === 'demandas' && (
            <Demandas
              clients={clients}
              projects={projects}
              users={users}
            />
          )}

          {/* ============================================================== */}
          {/* TAB: OFFICE MANAGEMENT / GESTÃO DO ESCRITÓRIO */}
          {/* ============================================================== */}
          {activeTab === 'escritorio' && (
            <OfficeManagement
              clients={clients}
              onAddClient={onAddClient}
            />
          )}

          {activeTab === 'marketing' && (
            <MarketingManagement />
          )}

          {activeTab === 'telegram' && (
            <TelegramSettings />
          )}

        </div>
      </div>

      {/* Custom Overlays/Alert Modals for Document Changes and Deletions */}
      {adminDocDeleteConfirm?.isOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white border border-stone-200 max-w-md w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-start gap-3">
              <span className="p-2 bg-red-100 text-red-800 text-lg font-bold flex-shrink-0">⚠️</span>
              <div>
                <h3 className="font-serif text-base font-bold text-stone-900">Confirmar Exclusão de Documento</h3>
                <p className="text-xs text-stone-500 mt-1 leading-relaxed">
                  Tem certeza absoluta de que deseja excluir o documento <strong>"{adminDocDeleteConfirm.docName}"</strong> permanentemente? Esta ação removerá o arquivo associado e não poderá ser desfeita.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-2 font-mono text-[10px] uppercase">
              <button
                type="button"
                onClick={() => setAdminDocDeleteConfirm(null)}
                className="bg-stone-100 hover:bg-stone-200 text-stone-700 px-4 py-2 border border-stone-300 font-bold cursor-pointer transition-all"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  onDeleteDocument(adminDocDeleteConfirm.docId);
                  if (editingAdminDoc?.id === adminDocDeleteConfirm.docId) {
                    handleCancelAdminDocEdit();
                  }
                  setAdminDocDeleteConfirm(null);
                }}
                className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 font-bold cursor-pointer transition-all"
              >
                Confirmar Exclusão
              </button>
            </div>
          </div>
        </div>
      )}

      {adminDocSaveConfirm?.isOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white border border-stone-200 max-w-md w-full p-6 space-y-4 shadow-xl">
            {saveDocStatus === 'loading' ? (
              <div className="flex flex-col items-center justify-center py-8 text-center space-y-4">
                <div className="w-10 h-10 border-4 border-stone-200 border-t-stone-900 rounded-full animate-spin"></div>
                <div className="space-y-1">
                  <h4 className="font-serif text-sm font-bold text-stone-900">Processando Envio</h4>
                  <p className="text-xs text-stone-500 max-w-xs leading-relaxed">
                    Aguarde enquanto o arquivo é carregado e os dados são gravados com segurança no Firestore...
                  </p>
                </div>
              </div>
            ) : saveDocStatus === 'success' ? (
              <div className="flex flex-col items-center justify-center py-6 text-center space-y-3">
                <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center text-xl font-bold border border-emerald-200 shadow-xs">
                  ✓
                </div>
                <div className="space-y-1">
                  <h4 className="font-serif text-sm font-bold text-stone-900">Salvo com Sucesso!</h4>
                  <p className="text-xs text-stone-500 max-w-xs leading-relaxed">
                    O documento foi vinculado ao projeto e está disponível imediatamente.
                  </p>
                  {saveDocError && (
                    <div className="bg-stone-50 border border-stone-200 p-2.5 mt-3 text-left">
                      <p className="text-[9px] font-mono font-semibold uppercase tracking-wider text-amber-700">Nota técnica (Sessão Local):</p>
                      <p className="text-[10px] text-stone-600 leading-normal mt-0.5">{saveDocError}</p>
                    </div>
                  )}
                </div>
              </div>
            ) : saveDocStatus === 'error' ? (
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <span className="p-2 bg-red-50 text-red-700 text-lg font-bold flex-shrink-0 font-mono border border-red-200">✗</span>
                  <div>
                    <h3 className="font-serif text-base font-bold text-stone-900">Falha ao Gravar Documento</h3>
                    <p className="text-xs text-stone-500 mt-1 leading-relaxed">
                      Ocorreu um erro no servidor ao tentar salvar o documento no Firebase.
                    </p>
                  </div>
                </div>
                
                <div className="bg-red-50 border border-red-200 p-3 text-left">
                  <p className="text-[9px] font-mono font-semibold uppercase tracking-wider text-red-700">Detalhes do erro:</p>
                  <p className="text-[10px] text-red-900 leading-normal mt-0.5 font-mono break-all max-h-32 overflow-y-auto">{saveDocError}</p>
                </div>

                <div className="flex justify-end gap-3 pt-2 font-mono text-[10px] uppercase">
                  <button
                    type="button"
                    onClick={() => {
                      setAdminDocSaveConfirm(null);
                      setSaveDocStatus('idle');
                      setSaveDocError(null);
                    }}
                    className="bg-stone-100 hover:bg-stone-200 text-stone-700 px-4 py-2 border border-stone-300 font-bold cursor-pointer transition-all"
                  >
                    Fechar
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      // Trigger retry
                      setSaveDocStatus('idle');
                      setSaveDocError(null);
                    }}
                    className="bg-stone-900 hover:bg-stone-800 text-white px-4 py-2 font-bold cursor-pointer transition-all"
                  >
                    Tentar Novamente
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-start gap-3">
                  <span className="p-2 bg-stone-100 text-stone-800 text-lg font-bold flex-shrink-0 font-mono">✓</span>
                  <div>
                    <h3 className="font-serif text-base font-bold text-stone-900">
                      {adminDocSaveConfirm.isEdit ? "Confirmar Alterações" : "Confirmar Novo Envio"}
                    </h3>
                    <p className="text-xs text-stone-500 mt-1 leading-relaxed">
                      {adminDocSaveConfirm.isEdit 
                        ? `Deseja salvar as alterações no documento "${adminDocSaveConfirm.payload.name}"? ${adminDocSaveConfirm.payload.fileNameChanged ? "O arquivo PDF original será substituído pelo novo arquivo carregado." : "O arquivo PDF existente será mantido."}`
                        : `Deseja salvar e vincular o documento "${adminDocSaveConfirm.payload.name}" ao projeto?`}
                    </p>
                  </div>
                </div>
                <div className="flex justify-end gap-3 pt-2 font-mono text-[10px] uppercase">
                  <button
                    type="button"
                    onClick={() => setAdminDocSaveConfirm(null)}
                    className="bg-stone-100 hover:bg-stone-200 text-stone-700 px-4 py-2 border border-stone-300 font-bold cursor-pointer transition-all"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      setSaveDocStatus('loading');
                      setSaveDocError(null);
                      try {
                        const payload = { ...adminDocSaveConfirm.payload };
                        
                        let storageUrl = payload.fileUrl || '';
                        let warningMsg = null;

                        if (selectedPdfFile) {
                          const config = await getTelegramConfig();
                          const relatedProject = projects?.find(p => p.id === payload.projectId);
                          const projectName = relatedProject?.name || 'Geral';
                          const docDate = payload.uploadedAt ? payload.uploadedAt.split('T')[0] : new Date().toISOString().split('T')[0];
                          const formattedName = buildTelegramFileName(config.fileNamePattern, {
                            centro: projectName,
                            data: docDate,
                            fornecedor: 'Administração',
                            descricao: payload.name || payload.description || 'Documento Administrativo',
                            extension: selectedPdfFile.name
                          });
                          const uploadResult = await uploadFileToFirebase(
                            selectedPdfFile,
                            `documents/${payload.id}/${formattedName}`
                          );
                          storageUrl = uploadResult.url;
                          if (uploadResult.error) {
                            warningMsg = uploadResult.error;
                          }
                        }

                        payload.fileUrl = storageUrl;
                        payload.fileName = selectedPdfFile ? selectedPdfFile.name : payload.fileName;

                        if (adminDocSaveConfirm.isEdit) {
                          await onEditDocument(payload);
                          if (selectedPdfFile) {
                            setFileBlobs(prev => ({ ...prev, [payload.id]: selectedPdfFile }));
                          }
                        } else {
                          await onAddDocument(payload);
                          if (selectedPdfFile) {
                            setFileBlobs(prev => ({ ...prev, [payload.id]: selectedPdfFile }));
                          }
                        }

                        setSaveDocStatus('success');
                        if (warningMsg) {
                          setSaveDocError(warningMsg);
                        }

                        // Automatically close after success
                        setTimeout(() => {
                          setAdminDocName('');
                          setAdminDocDesc('');
                          setSelectedPdfFile(null);
                          setPdfUploadError(null);
                          setEditingAdminDoc(null);
                          setAdminDocSaveConfirm(null);
                          setSaveDocStatus('idle');
                          setSaveDocError(null);
                        }, 1800);

                      } catch (err: any) {
                        console.error('Erro ao salvar o documento no Firestore:', err);
                        setSaveDocStatus('error');
                        setSaveDocError(err.message || 'Erro de rede ou permissão insuficiente ao gravar no Firestore.');
                      }
                    }}
                    className="bg-stone-900 hover:bg-stone-800 text-white px-4 py-2 font-bold cursor-pointer transition-all"
                  >
                    Confirmar e Salvar
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Custom Overlays/Alert Modals for Planning Phase Changes and Deletions */}
      {phaseSaveConfirm?.isOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white border border-stone-200 max-w-md w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-start gap-3">
              <span className="p-2 bg-stone-100 text-stone-800 text-lg font-bold flex-shrink-0 font-mono">✓</span>
              <div>
                <h3 className="font-serif text-base font-bold text-stone-900">
                  {phaseSaveConfirm.isEdit ? "Confirmar Alterações na Etapa" : "Confirmar Nova Etapa"}
                </h3>
                <p className="text-xs text-stone-500 mt-1 leading-relaxed">
                  {phaseSaveConfirm.isEdit 
                    ? `Deseja salvar as alterações na etapa de planejamento "${phaseSaveConfirm.payload.name}"?`
                    : `Deseja cadastrar e adicionar a etapa de planejamento "${phaseSaveConfirm.payload.name}" ao cronograma?`}
                </p>
                <div className="mt-3 bg-stone-50 border border-stone-200 p-3 font-mono text-[10px] space-y-1">
                  <p><strong>Custo Previsto:</strong> {formatCurrency(phaseSaveConfirm.payload.costPrev)}</p>
                  <p><strong>Custo Realizado:</strong> {formatCurrency(phaseSaveConfirm.payload.costReal)}</p>
                  <p><strong>Período:</strong> {phaseSaveConfirm.payload.startDate} até {phaseSaveConfirm.payload.endDate}</p>
                  <p><strong>Progresso Físico Geral:</strong> {phaseSaveConfirm.payload.progress}%</p>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-2 font-mono text-[10px] uppercase">
              <button
                type="button"
                onClick={() => setPhaseSaveConfirm(null)}
                className="bg-stone-100 hover:bg-stone-200 text-stone-700 px-4 py-2 border border-stone-300 font-bold cursor-pointer transition-all"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  const p = phaseSaveConfirm.payload;
                  if (phaseSaveConfirm.isEdit) {
                    setTimelinePhases(prev => prev.map(item => item.id === p.id ? p : item));
                    setEditingPhase(null);
                  } else {
                    setTimelinePhases(prev => [...prev, p]);
                  }
                  // Clean form
                  setPhaseFormError(null);
                  setPhaseInput({
                    name: '',
                    startDate: new Date().toISOString().split('T')[0],
                    endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                    progress: 0,
                    costPrev: '',
                    costReal: '0',
                    monthlyProgress: {}
                  });
                  setPhaseSaveConfirm(null);
                }}
                className="bg-[#1E1E1E] hover:bg-stone-800 text-white px-4 py-2 font-bold cursor-pointer transition-all"
              >
                Confirmar e Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      {phaseDeleteConfirm?.isOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white border border-stone-200 max-w-md w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-start gap-3">
              <span className="p-2 bg-red-100 text-red-800 text-lg font-bold flex-shrink-0">⚠️</span>
              <div>
                <h3 className="font-serif text-base font-bold text-stone-900">Confirmar Exclusão de Etapa</h3>
                <p className="text-xs text-stone-500 mt-1 leading-relaxed">
                  Tem certeza absoluta de que deseja excluir a etapa de planejamento <strong>"{phaseDeleteConfirm.phaseName}"</strong>? Esta ação removerá a etapa do cronograma físico-financeiro analítico e sintético permanentemente e não poderá ser desfeita.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-2 font-mono text-[10px] uppercase">
              <button
                type="button"
                onClick={() => setPhaseDeleteConfirm(null)}
                className="bg-stone-100 hover:bg-stone-200 text-stone-700 px-4 py-2 border border-stone-300 font-bold cursor-pointer transition-all"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  setTimelinePhases(prev => prev.filter(item => item.id !== phaseDeleteConfirm.phaseId));
                  if (editingPhase?.id === phaseDeleteConfirm.phaseId) {
                    setEditingPhase(null);
                    setPhaseInput({
                      name: '',
                      startDate: new Date().toISOString().split('T')[0],
                      endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                      progress: 0,
                      costPrev: '',
                      costReal: '0',
                      monthlyProgress: {}
                    });
                  }
                  setPhaseDeleteConfirm(null);
                }}
                className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 font-bold cursor-pointer transition-all"
              >
                Confirmar Exclusão
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 📁 MODAL DE VISUALIZAÇÃO DE ANEXO (DOCUMENT PREVIEW POPUP) */}
      {previewDoc && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/75 backdrop-blur-xs p-4">
          <div className="bg-[#FAF9F6] border border-stone-300 w-full max-w-5xl h-[85vh] flex flex-col shadow-2xl overflow-hidden font-sans">
            
            {/* Header */}
            <div className="bg-[#1E1E1E] text-white px-6 py-4 flex items-center justify-between border-b border-stone-800">
              <div className="flex items-center gap-3">
                <span className="p-1.5 bg-stone-800 text-stone-200 border border-stone-700 text-[9px] font-mono font-bold uppercase tracking-wider">
                  {previewDoc.category?.toUpperCase() || 'ANEXO'}
                </span>
                <div>
                  <h3 className="font-serif text-xs md:text-sm font-bold tracking-tight text-stone-100">{previewDoc.name}</h3>
                  <p className="text-[9px] text-stone-400 font-mono mt-0.5">
                    ID do Documento: {previewDoc.id}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleDownloadDoc(previewDoc)}
                  className="bg-stone-800 hover:bg-stone-700 text-stone-200 hover:text-white px-3 py-1.5 font-mono text-[9px] uppercase tracking-wider font-bold transition-all flex items-center gap-1.5 border border-stone-700 cursor-pointer"
                >
                  <Download size={12} />
                  Baixar Arquivo
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewDoc(null)}
                  className="bg-stone-800 hover:bg-stone-700 text-stone-200 hover:text-white p-1.5 font-mono text-xs font-bold transition-all border border-stone-700 cursor-pointer"
                  title="Fechar"
                >
                  <X size={14} />
                </button>
              </div>
            </div>

            {/* Content Body */}
            <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
              
              {/* Left Column: Metadata & Details */}
              <div className="w-full md:w-80 bg-stone-100 border-r border-stone-200 p-5 overflow-y-auto space-y-6 flex-shrink-0">
                <div>
                  <span className="block text-[8px] font-mono uppercase tracking-widest text-stone-400 font-bold mb-3">
                    Metadados da Pasta
                  </span>
                  
                  <div className="border border-stone-200 divide-y divide-stone-200 bg-white font-mono text-[10px]">
                    <div className="p-2.5 flex justify-between items-center">
                      <span className="text-stone-500 font-sans">Categoria:</span>
                      <span className="font-bold text-stone-900 uppercase">{previewDoc.category || 'Outros'}</span>
                    </div>
                    <div className="p-2.5 flex justify-between items-center">
                      <span className="text-stone-500 font-sans">Classe:</span>
                      <span className="font-bold text-stone-900 uppercase">
                        {(previewDoc.class as string) === 'fiscal' ? 'Fiscalização' : 
                         (previewDoc.class as string) === 'tecnico' ? 'Técnico' : 
                         (previewDoc.class as string) === 'financeiro' ? 'Financeiro' : 'Administrativo'}
                      </span>
                    </div>
                    <div className="p-2.5 flex justify-between items-center">
                      <span className="text-stone-500 font-sans">Status:</span>
                      <span className={`px-2 py-0.5 text-[8px] font-bold uppercase rounded-sm ${
                        (previewDoc.status as string) === 'aprovado' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' :
                        (previewDoc.status as string) === 'pendente' ? 'bg-amber-50 text-amber-800 border border-amber-200' :
                        (previewDoc.status as string) === 'rejeitado' ? 'bg-red-50 text-red-800 border border-red-200' :
                        'bg-purple-50 text-purple-800 border border-purple-200'
                      }`}>
                        {previewDoc.status}
                      </span>
                    </div>
                    <div className="p-2.5 flex justify-between items-center">
                      <span className="text-stone-500 font-sans">Enviado em:</span>
                      <span className="text-stone-700">{previewDoc.uploadedAt}</span>
                    </div>
                    <div className="p-2.5 flex flex-col gap-1">
                      <span className="text-stone-500 font-sans">Arquivo Físico:</span>
                      <span className="text-stone-700 truncate font-sans text-[9px] font-medium" title={previewDoc.fileName || 'documento_digital.pdf'}>
                        {previewDoc.fileName || 'documento_digital.pdf'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <span className="block text-[8px] font-mono uppercase tracking-widest text-stone-400 font-bold">
                    Descrição / Observações
                  </span>
                  <div className="bg-stone-50 border border-stone-200 p-4 font-sans text-xs text-stone-600 leading-relaxed rounded-xs italic">
                    {previewDoc.description || 'Nenhuma descrição ou observação adicional foi registrada para este documento técnico.'}
                  </div>
                </div>

                {/* Authenticity Certificate Box */}
                <div className="bg-stone-50 border border-stone-200 p-4 text-[10px] space-y-2 font-mono">
                  <span className="font-bold text-stone-800 font-serif block uppercase tracking-wider">
                    Certificação Digital
                  </span>
                  <div className="text-stone-500 space-y-1 text-[9px]">
                    <p><strong>Hash:</strong> SHA-256: e3b0c442...</p>
                    <p><strong>Responsável:</strong> Eng. Pedro L. Chaves</p>
                    <p><strong>Assinatura:</strong> ICP-Brasil Credenciado</p>
                  </div>
                  <div className="pt-2 border-t border-stone-200 flex items-center gap-2">
                    {/* Tiny CSS Barcode/QR visualization */}
                    <div className="w-10 h-10 bg-white border border-stone-300 flex flex-wrap p-0.5 shrink-0 opacity-80">
                      {Array.from({ length: 16 }).map((_, i) => (
                        <div
                          key={i}
                          className={`w-2 h-2 ${
                            (i * 7 + 13) % 5 === 0 || (i * 3) % 4 === 1 ? 'bg-stone-900' : 'bg-transparent'
                          }`}
                        />
                      ))}
                    </div>
                    <span className="text-[8px] leading-tight text-stone-400 uppercase font-sans">
                      Documento integrado ao banco de dados Chaves Brites Correa.
                    </span>
                  </div>
                </div>
              </div>

              {/* Right Column: Interactive Canvas or User Upload Preview */}
              <div className="flex-1 bg-stone-200 p-6 overflow-y-auto flex justify-center items-start">
                {(fileBlobs[previewDoc.id] || previewDoc.fileUrl) ? (
                  // User has uploaded a real file or there is a cloud link
                  <div className="w-full max-w-3xl space-y-4">
                    {((fileBlobs[previewDoc.id] && fileBlobs[previewDoc.id].type.startsWith('image/')) || 
                      (previewDoc.fileUrl && previewDoc.fileUrl.match(/\.(jpeg|jpg|gif|png|webp)/i))) ? (
                      <div className="bg-white p-4 border border-stone-300 shadow-md">
                        <span className="block text-[9px] font-mono text-stone-400 uppercase mb-2">
                          Visualização de Imagem Anexada
                        </span>
                        <img
                          src={previewUrl || ''}
                          alt={previewDoc.name}
                          className="max-h-[60vh] mx-auto object-contain"
                        />
                      </div>
                    ) : (
                      <div className="space-y-6 w-full max-w-2xl">
                        <div className="bg-white border border-stone-300 shadow-lg p-8 flex flex-col items-center justify-center text-center space-y-6 relative overflow-hidden">
                          {/* Decorative border line */}
                          <div className="absolute top-0 left-0 right-0 h-1.5 bg-red-750"></div>
                          
                          {/* PDF Document Visual */}
                          <div className="w-20 h-24 bg-red-50 border-2 border-red-200 rounded-lg flex flex-col items-center justify-between p-3 relative shadow-sm mt-4">
                            <span className="text-[10px] font-mono font-bold text-red-700 bg-red-100 px-1.5 py-0.5 rounded uppercase tracking-wider">
                              PDF
                            </span>
                            <div className="space-y-1 w-full">
                              <div className="h-1 bg-red-200 rounded w-5/6 mx-auto"></div>
                              <div className="h-1 bg-red-200 rounded w-4/6 mx-auto"></div>
                              <div className="h-1 bg-red-200 rounded w-5/6 mx-auto"></div>
                            </div>
                            <span className="text-xs">📄</span>
                          </div>

                          <div className="space-y-2">
                            <h4 className="font-serif text-sm font-bold text-stone-900">
                              {fileBlobs[previewDoc.id] ? fileBlobs[previewDoc.id].name : (previewDoc.fileName || previewDoc.name)}
                            </h4>
                            <p className="text-[10px] font-mono text-stone-500 uppercase tracking-wider">
                              {fileBlobs[previewDoc.id] 
                                ? `Tamanho: ${(fileBlobs[previewDoc.id].size / 1024).toFixed(1)} KB • Formato: PDF Digitalizado`
                                : `Arquivo disponível para visualização e download na nuvem`}
                            </p>
                          </div>

                          {/* Helper Info */}
                          <div className="bg-stone-50 border border-stone-200 p-4 text-left text-xs text-stone-600 font-sans max-w-md mx-auto rounded-none leading-relaxed">
                            <p className="font-bold text-stone-850 flex items-center gap-1.5 mb-1">
                              <span className="text-stone-500">ℹ️</span> Restrições de Sandbox Ativas
                            </p>
                            <p>
                              Para garantir a segurança dos dados e contornar bloqueios de visualização de arquivos em iframes do navegador, utilize as opções abaixo para visualizar ou salvar o documento.
                            </p>
                          </div>

                          {/* Primary Action Buttons */}
                          <div className="flex flex-col sm:flex-row gap-3 w-full max-w-md justify-center pt-2">
                            <a
                              href={previewUrl || ''}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="bg-red-700 hover:bg-red-800 text-white font-mono text-[10px] font-bold py-3 px-5 uppercase tracking-wider transition-all flex items-center justify-center gap-2 shadow-sm border border-transparent cursor-pointer text-center"
                            >
                              <ExternalLink size={12} />
                              Visualizar em Nova Aba
                            </a>
                            <button
                              type="button"
                              onClick={() => handleDownloadDoc(previewDoc)}
                              className="bg-stone-900 hover:bg-stone-800 text-white font-mono text-[10px] font-bold py-3 px-5 uppercase tracking-wider transition-all flex items-center justify-center gap-2 shadow-sm cursor-pointer text-center"
                            >
                              <Download size={12} />
                              Baixar Arquivo PDF
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  // No real file (rendered Mock Official Document Page)
                  <div className="bg-white border border-stone-300 shadow-lg w-full max-w-2xl p-10 font-serif space-y-8 min-h-[75vh] relative text-stone-900 overflow-hidden">
                    
                    {/* Watermark Logo */}
                    <div className="absolute inset-0 flex items-center justify-center opacity-[0.03] select-none pointer-events-none">
                      <div className="text-center font-serif text-[72px] font-bold rotate-12 tracking-widest uppercase">
                        CBC ENGENHARIA
                      </div>
                    </div>

                    {/* Official Document Header */}
                    <div className="text-center space-y-2 border-b-2 border-stone-900 pb-5">
                      <div className="font-mono text-[9px] tracking-widest uppercase text-stone-500 font-bold">
                        República Federativa do Brasil
                      </div>
                      <h4 className="font-bold text-sm uppercase tracking-wider font-serif text-stone-900">
                        CHAVES BRITES CORREA LTDA
                      </h4>
                      <p className="text-[10px] font-mono text-stone-600 uppercase tracking-wide">
                        Engenharia de Infraestrutura e Gestão de Obras Civis
                      </p>
                      <div className="text-[8px] text-stone-400 font-mono">
                        CGC/CNPJ nº 48.151.623/0001-42 | Registro CREA/CAU nº 1048-A SP
                      </div>
                    </div>

                    {/* Document Title block */}
                    <div className="text-center space-y-1">
                      <h3 className="font-bold text-sm md:text-base uppercase tracking-widest font-serif text-stone-950 underline decoration-1 underline-offset-4 leading-normal">
                        {previewDoc.category === 'contrato' ? 'Instrumento Particular de Contrato de Prestação de Serviços' :
                         previewDoc.category === 'alvara' ? 'Certidão de Licenciamento Municipal / Alvará de Obra' :
                         previewDoc.category === 'rrt' ? 'Registro de Responsabilidade Técnica / Anotação Técnica' :
                         previewDoc.category === 'orcamento' ? 'Planilha Orçamentária Consolidada / Memória de Cálculo' :
                         'Certidão Administrativa de Homologação de Documento'}
                      </h3>
                      <p className="text-[10px] font-mono text-stone-500 uppercase">
                        Código de Controle: DOC-{previewDoc.id.substring(0, 8).toUpperCase()}
                      </p>
                    </div>

                    {/* Styled Content according to document type */}
                    <div className="text-xs space-y-5 leading-relaxed font-sans text-stone-800">
                      
                      {previewDoc.category === 'contrato' && (
                        <div className="space-y-4 text-[11px]">
                          <p>
                            <strong>CONTRATANTE:</strong> CHAVES BRITES CORREA LTDA, sediada na Av. Paulista, São Paulo/SP, neste ato representada por seu corpo de engenharia civil diretivo.
                          </p>
                          <p>
                            <strong>CONTRATADO:</strong> Empresa parceira subempreiteira homologada no sistema de compras e suprimentos da contratante, responsável pela execução dos serviços civis correlatos.
                          </p>
                          <p className="font-serif font-bold text-stone-950 uppercase text-[9px] tracking-wide border-b border-stone-200 pb-1 mt-4">
                            CLÁUSULA PRIMEIRA - DO OBJETO
                          </p>
                          <p>
                            O presente instrumento tem como objeto a prestação de serviços de engenharia civil, abrangendo mão de obra qualificada, fornecimento de materiais básicos e equipamentos para a execução da obra designada como <strong>"{projects.find(p => p.id === previewDoc.projectId)?.name || 'Projeto de Infraestrutura'}"</strong>.
                          </p>
                          <p className="font-serif font-bold text-stone-950 uppercase text-[9px] tracking-wide border-b border-stone-200 pb-1 mt-4">
                            CLÁUSULA SEGUNDA - DOS PRAZOS E CONDIÇÕES
                          </p>
                          <p>
                            O cronograma físico-financeiro analítico acordado entre as partes deverá ser rigorosamente cumprido, sob pena de aplicação de multa contratual de 1% (um por cento) por dia de atraso injustificado sobre o valor da etapa inadimplente.
                          </p>
                        </div>
                      )}

                      {previewDoc.category === 'alvara' && (
                        <div className="space-y-4 text-[11px] bg-amber-50/20 p-4 border border-amber-200/50">
                          <p className="text-center font-bold text-stone-950 uppercase text-[10px]">
                            CERTIDÃO DE AUTORIZAÇÃO Nº 2026/SP-4589
                          </p>
                          <p>
                            A Secretaria Municipal de Urbanismo e Licenciamento certifica que o projeto técnico referente à obra <strong>"{projects.find(p => p.id === previewDoc.projectId)?.name || 'Obra Comercial'}"</strong> encontra-se devidamente aprovado quanto aos parâmetros edilícios, ambientais e de zoneamento urbano.
                          </p>
                          <div className="grid grid-cols-2 gap-4 font-mono text-[10px] bg-white p-3 border border-stone-200">
                            <div>
                              <span className="block text-stone-400 text-[8px] uppercase font-bold">Responsável Técnico</span>
                              <strong className="text-stone-800">Eng. Civil Responsável</strong>
                            </div>
                            <div>
                              <span className="block text-stone-400 text-[8px] uppercase font-bold">Área Total do Lote</span>
                              <strong className="text-stone-800">1.480,50 m²</strong>
                            </div>
                            <div>
                              <span className="block text-stone-400 text-[8px] uppercase font-bold">Número do Processo</span>
                              <strong className="text-stone-800">958.421.2026-SP</strong>
                            </div>
                            <div>
                              <span className="block text-stone-400 text-[8px] uppercase font-bold">Validade Licença</span>
                              <strong className="text-stone-800">06/07/2028</strong>
                            </div>
                          </div>
                          <p className="text-[10px] text-stone-500 italic">
                            *Esta licença deverá ser mantida em local visível na entrada do canteiro de obras para efeito de fiscalização permanente.
                          </p>
                        </div>
                      )}

                      {previewDoc.category === 'rrt' && (
                        <div className="space-y-4 text-[11px] border border-stone-200 p-4 bg-stone-50">
                          <p className="font-bold text-center uppercase tracking-wide text-stone-900 border-b border-stone-200 pb-2">
                            REGISTRO DE RESPONSABILIDADE TÉCNICA - CAU / CREA
                          </p>
                          <p>
                            Este documento comprova o recolhimento das taxas e o registro formal da autoria e da responsabilidade técnica pelos serviços descritos abaixo:
                          </p>
                          <div className="space-y-2 font-mono text-[10px]">
                            <p><strong>Profissional:</strong> Dr. Pedro Luiz Chaves Brites Correa</p>
                            <p><strong>Título Profissional:</strong> Engenheiro Civil Sênior & Diretor Técnico</p>
                            <p><strong>Atividade Contratada:</strong> Direção Técnica de Obra, Coordenação de Equipes e Gestão do Cronograma Físico-Financeiro.</p>
                            <p><strong>Local da Obra:</strong> Condomínio Logístico Integrado - Setor A</p>
                          </div>
                        </div>
                      )}

                      {previewDoc.category === 'orcamento' && (
                        <div className="space-y-4">
                          <p>
                            Resumo consolidado de custos, quantitativos e taxas de BDI (Benefícios e Despesas Indiretas) calculadas para o projeto corrente:
                          </p>
                          <table className="w-full text-[10px] font-mono border border-stone-200 text-left">
                            <thead>
                              <tr className="bg-stone-100 uppercase text-stone-600 border-b border-stone-200">
                                <th className="p-2 border-r border-stone-200">Item</th>
                                <th className="p-2 border-r border-stone-200">Descrição</th>
                                <th className="p-2 border-r border-stone-200 text-right">Percentual</th>
                                <th className="p-2 text-right">Subtotal Estimado</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-stone-150">
                              <tr>
                                <td className="p-2 border-r border-stone-200">1.0</td>
                                <td className="p-2 border-r border-stone-200">Serviços Preliminares & Projetos</td>
                                <td className="p-2 border-r border-stone-200 text-right">12.5%</td>
                                <td className="p-2 text-right font-medium">R$ 156.400,00</td>
                              </tr>
                              <tr>
                                <td className="p-2 border-r border-stone-200">2.0</td>
                                <td className="p-2 border-r border-stone-200">Infraestrutura e Fundações</td>
                                <td className="p-2 border-r border-stone-200 text-right">24.0%</td>
                                <td className="p-2 text-right font-medium">R$ 300.288,00</td>
                              </tr>
                              <tr>
                                <td className="p-2 border-r border-stone-200">3.0</td>
                                <td className="p-2 border-r border-stone-200">Superestrutura e Alvenaria</td>
                                <td className="p-2 border-r border-stone-200 text-right">38.5%</td>
                                <td className="p-2 text-right font-medium">R$ 481.712,00</td>
                              </tr>
                              <tr>
                                <td className="p-2 border-r border-stone-200">4.0</td>
                                <td className="p-2 border-r border-stone-200">Instalações, Acabamentos & BDI</td>
                                <td className="p-2 border-r border-stone-200 text-right">25.0%</td>
                                <td className="p-2 text-right font-medium">R$ 312.800,00</td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      )}

                      {!['contrato', 'alvara', 'rrt', 'orcamento'].includes(previewDoc.category || '') && (
                        <div className="space-y-4">
                          <p>
                            Certificamos, para os devidos fins de direito, que o documento anexado sob o título de <strong>"{previewDoc.name}"</strong> foi devidamente protocolado, analisado e homologado pelo gestor técnico de suprimentos.
                          </p>
                          <p>
                            O referido anexo destina-se a fins puramente administrativos, de registro e controle de progresso das tarefas executivas e de engenharia desta empresa.
                          </p>
                        </div>
                      )}

                    </div>

                    {/* Official Signatures section */}
                    <div className="pt-10 grid grid-cols-2 gap-8 text-center text-[10px] font-sans">
                      <div className="space-y-1">
                        <div className="border-t border-stone-400 pt-1 text-stone-700">
                          Assinatura Digitalizada do Gestor
                        </div>
                        <div className="text-[8px] font-mono text-stone-400">
                          CBC - Departamento de Engenharia
                        </div>
                      </div>
                      <div className="space-y-1">
                        <div className="border-t border-stone-400 pt-1 text-stone-700">
                          Visto da Diretoria Técnica
                        </div>
                        <div className="text-[8px] font-mono text-stone-400">
                          CREA: 489574-SP
                        </div>
                      </div>
                    </div>

                  </div>
                )}
              </div>

            </div>

          </div>
        </div>
      )}

    </div>
  );
}
