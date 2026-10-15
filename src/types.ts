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
  // Dados para contrato (preenchem automaticamente a qualificação do CONTRATANTE)
  cpfCnpj?: string;
  address?: string;       // endereço residencial/sede em uma linha (rua, nº, bairro, cidade - UF)
  cep?: string;
  nationality?: string;   // ex.: "brasileiro", "brasileira"
  maritalStatus?: string; // ex.: "casado(a)", "solteiro(a)", "união estável"
  profession?: string;
}

export type ProjectType = 'obra' | 'projeto';
export type ProjectStatus = 'planejamento' | 'execucao' | 'concluido' | 'suspenso';

export interface Project {
  id: string;
  name: string;
  clientId: string;          // cliente principal (dono)
  clientIds?: string[];      // donos adicionais (obra compartilhada entre clientes)
  type: ProjectType;
  status: ProjectStatus;
  budget: number;
  startDate: string;
  endDate?: string;
  location: string;
  area?: number; // m² (área do projeto arquitetônico / da obra)
  areaInteriores?: number; // m² (área do projeto de interiores, quando diferente da arquitetônica)
  cep?: string;
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

// Boletim de Medição — documento formal de avanço da obra por período.
// Dia improdutivo: dia em que a obra não teve trabalho (chuva, feriado, etc.).
// Um clique para hoje, ou escolha de outra data. Conta automaticamente.
export interface UnproductiveDay {
  id: string;
  projectId: string;
  date: string;       // YYYY-MM-DD
  reason?: string;     // motivo opcional (ex.: "Chuva")
  createdBy?: string;  // quem registrou
  createdAt: string;   // ISO — quando foi lançado
}

export interface MeasurementBulletin {
  id: string;
  projectId: string;
  number: string;                  // "01", "02"... (editável)
  periodStart: string;             // YYYY-MM-DD
  periodEnd: string;
  emissionDate: string;            // YYYY-MM-DD
  summaryText: string;             // resumo editável da situação geral
  responsibleTechnical: string;    // nome do responsável técnico
  // Percentuais (editáveis; preenchidos automaticamente na criação)
  physicalProgressPeriod: number;
  physicalProgressTotal: number;
  financialProgressPeriod: number;
  financialProgressTotal: number;
  spentPeriod: number;
  spentTotal: number;
  // Comparativo previsto (cronograma) x realizado (acompanhamento) no período.
  physicalPlannedPeriod?: number;   // % avanço físico PREVISTO no período
  financialPlannedPeriod?: number;  // % avanço financeiro PREVISTO no período (do orçamento)
  costPlannedPeriod?: number;       // R$ previsto para o período (cronograma)
  // Dias improdutivos DENTRO do período desta medição (snapshot — não muda depois).
  unproductiveDaysPeriod?: { date: string; reason?: string }[];
  // Fotos com legendas editáveis (base64 ou url)
  photos: { id: string; url: string; caption: string }[];
  // Snapshot dos dados usados (para o documento não mudar depois)
  phaseProgress: { name: string; progressStart: number; progressEnd: number }[];
  // Snapshot dos pagamentos de mão de obra do período (gravado na criação pelo admin,
  // para que o cliente possa ver no PDF sem acessar a coleção sensível labor_payments).
  laborPaymentsSnapshot?: {
    supplier: string; description: string; paymentDate: string;
    value: number; contractValue: number; contractPaidTotal: number;
  }[];
  // Snapshot dos gastos do período (mesma lógica: documento imutável e autossuficiente).
  expensesSnapshot?: {
    date: string; description: string; category: string; supplier: string; value: number;
  }[];
  released: boolean;               // se true, o cliente vê esta medição
  createdAt: string;
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
  // itemId -> true quando o item é "Incluso" (R$ 0,00 de propósito, embutido no preço de outro item).
  // Sem marcação, preço vazio/0 significa "Não cotado".
  includedItems?: Record<string, boolean>;
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
  // Escolhas manuais do arquiteto que sobrepõem a recomendação automática:
  //  - manualItemChoices: itemId -> supplierId eleito como "melhor preço" daquele item
  //  - manualRecommendedSupplierId: fornecedor eleito como "recomendado" (menor custo global)
  manualItemChoices?: Record<string, string>;
  manualRecommendedSupplierId?: string;
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

export type ContractType =
  | 'gerenciamento_obra'
  | 'projeto_arquitetura'
  | 'projeto_arquitetura_interiores'
  | 'empreitada_mao_de_obra';

export type ContractStatus = 'rascunho' | 'gerado' | 'enviado_assinatura' | 'assinado' | 'cancelado';

// Situação do envelope de assinatura eletrônica (ClickSign).
//  - running: enviado, aguardando assinaturas
//  - closed: todas as assinaturas concluídas
//  - canceled: envio cancelado
//  - expired: prazo de assinatura esgotado
export type ContractSignatureStatus = 'running' | 'closed' | 'canceled' | 'expired';

export interface ContractSignerState {
  key: string;            // identificador estável no HUB (ex.: contratante, cbc, testemunha-1)
  papel: string;          // rótulo exibido (ex.: "Contratante", "Testemunha")
  name: string;
  email: string;
  signerId?: string;      // id do signatário no ClickSign
  signed: boolean;
  signedAt?: string;      // ISO
  refused?: boolean;
  refusedAt?: string;
}

// Registro da assinatura eletrônica. Preenchido APENAS pelo servidor (envio + webhook);
// a gravação genérica de contratos preserva este bloco (ver PUT /api/data/contracts).
export interface ContractSignature {
  provider: 'clicksign';
  environment: 'sandbox' | 'production';
  envelopeId: string;
  documentId: string;
  status: ContractSignatureStatus;
  sentAt: string;
  sentBy?: string;
  pdfSha256?: string;       // hash do PDF enviado (trilha de auditoria)
  signers: ContractSignerState[];
  closedAt?: string;
  lastEventAt?: string;
  signedPdfUrl?: string;    // cópia arquivada no HUB (após a conclusão)
  signedPdfFileName?: string;
  archiveError?: string;
  processedEvents?: string[]; // chaves de eventos já tratados (idempotência do webhook)
}

export interface ContractPersonData {
  name: string;
  cpfCnpj: string;
  address: string;
  qualification?: string; // ex: "brasileiro, casado" — texto livre extra de qualificação civil
  email?: string; // usado no contrato e, futuramente, como destinatário da assinatura eletrônica
  phone?: string;
}

// Quando uma parcela do contrato deve ser cobrada.
//  - assinatura: no ato da assinatura do contrato
//  - etapa_aprovada / etapa_entregue: marco de uma etapa do projeto (etapaKey)
//  - data: vencimento em data pré-estabelecida
export type PaymentTrigger = 'assinatura' | 'etapa_aprovada' | 'etapa_entregue' | 'data';

export interface ContractPayment {
  id: string;
  descricao: string;        // rótulo livre, ex.: "Sinal / Parcela 1"
  valor: string;            // reais formatados, ex.: "9.660,00"
  gatilho: PaymentTrigger;
  etapaKey?: string;        // chave da etapa (mesmas chaves de phaseTemplates) quando o gatilho é de etapa
  dataVencimento?: string;  // YYYY-MM-DD quando o gatilho é 'data'
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

  // Específico — Projeto de Arquitetura e Interiores
  servicosIncluidos?: ('arquitetonico' | 'interiores')[]; // define quais blocos de escopo e etapas entram
  areaInterioresM2?: string;
  ambientesInteriores?: string; // ex.: "Sala de Estar, Cozinha, Suíte Master..."
  prazoDias?: string; // número de dias ininterruptos (gera o texto de prazoExecucao)
  diasAprovacaoTacita?: string; // dias corridos para aprovar/revisar cada etapa (padrão 7)
  pagamentos?: ContractPayment[]; // parcelas estruturadas (base para cobranças automáticas)
  testemunhas?: ContractPersonData[]; // até 2 testemunhas (opcional; entram como assinantes)
}

// Situação de uma parcela do contrato na cobrança pelo Cora.
export type ChargeStatus =
  | 'aguardando_gatilho'     // ainda não chegou a hora (assinatura/etapa/data)
  | 'aguardando_confirmacao' // etapa atingida: o admin precisa confirmar a emissão
  | 'emitindo'               // emissão em andamento (reserva anti-duplicidade)
  | 'emitida'
  | 'paga'
  | 'vencida'
  | 'cancelada'
  | 'erro';

// Cobrança de UMA parcela (ContractPayment). Gerida pelo servidor (emissão, webhook, varredura).
export interface ContractCharge {
  paymentId: string;          // id da parcela em data.pagamentos
  descricao: string;
  valorCents: number;
  gatilho: PaymentTrigger;
  etapaKey?: string;
  dataVencimento?: string;    // YYYY-MM-DD combinado no contrato (gatilho 'data')
  status: ChargeStatus;
  gatilhoAtingidoEm?: string; // quando a etapa foi atingida
  dueDate?: string;           // vencimento do boleto emitido (YYYY-MM-DD)
  coraInvoiceId?: string;
  environment?: 'stage' | 'production';
  boletoUrl?: string;
  linhaDigitavel?: string;
  pixEmv?: string;            // Pix copia e cola
  emitidaEm?: string;
  pagaEm?: string;
  valorPagoCents?: number;
  canceladaEm?: string;
  enviadaWhatsAppEm?: string;
  lastError?: string;
  lastCheckAt?: string;
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

  // PDF salvo no sistema para consulta/edição futura (independente do download local)
  pdfUrl?: string;
  pdfFileName?: string;
  pdfSavedAt?: string; // ISO date do último salvamento

  // Assinatura eletrônica (ClickSign) — gerida pelo servidor
  signature?: ContractSignature;

  // Cobranças das parcelas (Banco Cora) — geridas pelo servidor
  charges?: ContractCharge[];
}



