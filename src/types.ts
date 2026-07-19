export type UserRole = 'admin' | 'client' | 'marketing';

export interface User {
  id: string;
  username: string;
  passwordHash: string; // Plain for simple validation but stored securely
  role: UserRole;
  name: string;
  clientId?: string; // Links to the Client entity if role is 'client'
}

export interface Client {
  id: string;
  name: string;
  email: string;
  phone: string;
  username: string; // Matches user.username
  createdAt: string;
}

export type ProjectType = 'obra' | 'projeto';
export type ProjectStatus = 'planejamento' | 'execucao' | 'concluido' | 'suspenso';

export interface Project {
  id: string;
  name: string;
  clientId: string;
  type: ProjectType;
  status: ProjectStatus;
  budget: number;
  startDate: string;
  endDate?: string;
  location: string;
  area?: number; // m²
  description: string;
}

export type TransactionCategory = 
  | 'materiais' 
  | 'mao_de_obra' 
  | 'projetos_complementares' 
  | 'taxas' 
  | 'decoracao' 
  | 'outros';

export type TransactionStatus = 'pago' | 'pendente' | 'reembolsado';

export interface Transaction {
  id: string;
  projectId: string;
  description: string;
  category: TransactionCategory;
  value: number;
  date: string;
  supplier: string;
  status: TransactionStatus;
  notes?: string;
  receiptName?: string; // simulated attached receipt file
  receiptBase64?: string; // stored base64 content so the user can always view/download it even without Drive!
  receiptUrl?: string; // stored Firebase Storage URL
  invoiceNumber?: string; // NF or proof of payment number
}

export type DocumentClass = 'administrativo' | 'planejamento' | 'acompanhamento';
export type DocumentStatus = 'desenvolvimento' | 'revisao' | 'aprovado';

export interface ProjectDocument {
  id: string;
  projectId: string;
  name: string;
  description: string;
  class: DocumentClass;
  fileUrl?: string;
  fileName?: string;
  uploadedAt: string;
  status: DocumentStatus;
  category?: string;
}

export interface MaterialItem {
  id: string;
  projectId: string;
  name: string;
  quantity: string;
  unit?: string;
  unitValue?: number;
  supplier: string;
  estimatedValue: number; // Storing total value here for backward compatibility
  orderDate: string;
  deliveryDate?: string;
  status?: 'cotacao' | 'pedido' | 'entregue' | 'atrasado';
  notes?: string;
}

export interface PhysicalWeeklyLog {
  id: string;
  projectId: string;
  date: string; // YYYY-MM-DD
  weekLabel: string; // e.g. "Semana 1", "Semana de 06/07"
  description: string; // descrição dos serviços executados
  phaseProgressions: Record<string, number>; // phaseId -> progress percentage (0-100)
  photos: {
    id: string;
    url: string; // base64 or drive webViewLink
    name: string;
    description?: string;
  }[];
}

export interface QuotationItem {
  id: string;
  name: string;
  unit: string;
  quantity: number;
}

export interface QuotationSupplier {
  id: string;
  name: string;
  phone: string;
  email: string;
  paymentTerms: string;
  deliveryFee: number;
  deliveryTime: string;
  itemPrices: Record<string, number>; // itemId -> unit price (number)
}

export interface QuotationMap {
  id: string;
  projectId: string;
  number: number;
  title: string;
  date: string;
  status: 'rascunho' | 'pendente' | 'aprovado' | 'rejeitado' | 'pago';
  items: QuotationItem[];
  suppliers: QuotationSupplier[];
  selectedSupplierId?: string;
  authorizedAt?: string;
  authorizedBy?: string;
  observations?: string;
  invoiceNumber?: string;
  invoiceUrl?: string;
  invoiceScannedData?: {
    supplier: string;
    value: number;
    date: string;
    category: string;
    description: string;
  };
}

export interface MarketingCampaign {
  id: string;
  name: string;
  platform: string;
  budget: number;
  spent: number;
  leadsCount: number;
  status: 'planejado' | 'ativo' | 'concluido';
  startDate: string;
  notes?: string;
}

export interface MarketingPost {
  id: string;
  title: string;
  platform: string;
  publishDate: string;
  status: 'a_fazer' | 'em_producao' | 'revisao' | 'agendado' | 'publicado';
  caption?: string;
  images?: string[];
}

export interface MarketingOutbound {
  id: string;
  name: string;
  type: 'captacao' | 'contato' | 'evento' | 'brinde';
  contact: string;
  date: string;
  status: 'planejado' | 'em_andamento' | 'realizado' | 'cancelado';
  cost: number;
  notes?: string;
}

export interface MarketingPress {
  id: string;
  title: string;
  vehicle: string;
  date: string;
  status: 'rascunho' | 'enviado' | 'revisao' | 'publicado';
  url?: string;
  notes?: string;
}

export interface MarketingSettings {
  id: string;
  outboundUrl?: string;
  socialUrl?: string;
  pressUrl?: string;
}

// ============ CONTRATOS ============

export type ContractType = 'gerenciamento_obra' | 'projeto_arquitetura' | 'empreitada_mao_de_obra';

export type ContractStatus = 'rascunho' | 'gerado' | 'assinado' | 'cancelado';

export interface ContractPersonData {
  name: string;
  cpfCnpj: string;
  address: string;
  qualification?: string; // ex: "brasileiro, casado" — texto livre extra de qualificação civil
}

// Campos de formulário preenchidos pelo usuário para gerar o contrato.
// Nem todos são usados em todos os tipos — cada template usa o subconjunto pertinente.
export interface ContractFormData {
  // Contratante principal
  contratanteId?: string; // se veio de um Client já cadastrado
  contratante: ContractPersonData;

  // Segundo contratante solidário (opcional — ex.: cônjuge), usado no modelo de empreitada
  contratanteSolidario?: ContractPersonData;

  // Objeto / imóvel
  localObjeto: string; // endereço da obra
  cepObjeto?: string;
  areaM2: string;
  descricaoImovel?: string; // especificações de pavimentos/ambientes (texto livre)

  // Financeiro
  valorTotal: string; // string formatada em reais, ex "76.000,00"
  valorTotalExtenso?: string;
  percentualHonorarios?: string; // usado no gerenciamento de obra
  valorEntrada?: string;
  numeroParcelas?: string;
  valorParcela?: string;
  formaPagamento?: string; // texto livre extra (ex: parcelas quinzenais)

  // Prazo
  prazoExecucao: string; // ex: "10 (dez) meses" ou "30 (trinta) dias corridos"

  // Escopo (texto livre editável — pré-preenchido pelo template, ajustável por contrato)
  escopoServicos: string;

  // Específico — Empreitada de mão de obra
  contratado?: ContractPersonData; // empreiteiro/executor
  encarregadoExecucao?: string; // nome (se diferente do contratado)
  responsavelTecnico?: ContractPersonData; // interveniente-fiscalizadora
  responsavelTecnicoCargo?: string; // ex: "Eng. ..., CREA/MS nº ..."
  itensExcluidos?: string; // texto livre, serviços excluídos do escopo

  // Data e local de assinatura
  localAssinatura: string;
  dataAssinatura: string; // YYYY-MM-DD

  observacoes?: string;
}

export interface Contract {
  id: string;
  projectId: string;
  type: ContractType;
  number: number;
  status: ContractStatus;
  createdAt: string;
  updatedAt?: string;
  data: ContractFormData;
}



