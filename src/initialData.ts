import { User, Client, Project, Transaction, ProjectDocument, Contract } from './types';

// IMPORTANTE: nenhum passwordHash/senha é versionado aqui. As senhas são definidas
// no backend (scripts/seed-users.ts, a partir de variáveis de ambiente) e guardadas
// com hash bcrypt no Firestore. Este arquivo vai para o bundle público, então não
// pode conter credencial alguma. O campo passwordHash fica vazio (nunca é usado no cliente).
export const INITIAL_USERS: User[] = [
  { id: 'admin-1', username: 'CHAVES BRITES CORREA', passwordHash: '', role: 'admin', name: 'Chaves Brites Correa' },
  { id: 'user-marketing-1', username: 'MKTCBC', passwordHash: '', role: 'marketing', name: 'Equipe de Marketing' },
  { id: 'user-client-1', username: 'oralmed', passwordHash: '', role: 'client', name: 'Clínica OralMed', clientId: 'client-1' },
  { id: 'user-client-2', username: 'roberto', passwordHash: '', role: 'client', name: 'Cliente Exemplo 2', clientId: 'client-2' },
  { id: 'user-client-3', username: 'bosque', passwordHash: '', role: 'client', name: 'Residencial Bosque', clientId: 'client-3' }
];

// DADOS DE EXEMPLO — fictícios. E-mails em domínios .example e telefones no padrão de
// documentação para deixar claro que NÃO são dados reais (minimização, LGPD art. 12).
// Ao usar em produção, substitua pelos dados reais dos clientes via o painel admin.
export const INITIAL_CLIENTS: Client[] = [
  {
    id: 'client-1',
    name: 'Cliente Exemplo — Clínica',
    email: 'contato@cliente-exemplo.example',
    phone: '(11) 40000-0001',
    username: 'oralmed',
    createdAt: '2026-02-10'
  },
  {
    id: 'client-2',
    name: 'Cliente Exemplo — Residencial',
    email: 'contato2@cliente-exemplo.example',
    phone: '(11) 40000-0002',
    username: 'roberto',
    createdAt: '2026-03-15'
  },
  {
    id: 'client-3',
    name: 'Cliente Exemplo — Condomínio',
    email: 'contato3@cliente-exemplo.example',
    phone: '(11) 40000-0003',
    username: 'bosque',
    createdAt: '2026-05-02'
  }
];

export const INITIAL_PROJECTS: Project[] = [
  {
    id: 'project-1',
    name: 'Reforma de Interiores Clínica OralMed',
    clientId: 'client-1',
    type: 'obra',
    status: 'execucao',
    budget: 180000,
    startDate: '2026-02-20',
    location: 'Av. Paulista, 1200 - Cj 42, São Paulo - SP',
    area: 110,
    description: 'Readequação de fluxos clínicos, recepção integrada, 3 consultórios odontológicos com infraestrutura hidráulica especializada, copa dos funcionários e lavabos com acessibilidade plena (NBR 9050).'
  },
  {
    id: 'project-2',
    name: 'Casa de Campo - Cliente Exemplo',
    clientId: 'client-2',
    type: 'obra',
    status: 'execucao',
    budget: 1250000,
    startDate: '2026-03-20',
    location: 'Condomínio Quinta da Baroneza, Bragança Paulista - SP',
    area: 450,
    description: 'Residência unifamiliar sustentável de alto padrão. Estrutura em madeira engenheirada (MLC) e concreto aparente, com sistema integrado de captação de água pluvial e usina fotovoltaica.'
  },
  {
    id: 'project-3',
    name: 'Projetos de Arquitetura Executivo e Detalhamento',
    clientId: 'client-2',
    type: 'projeto',
    status: 'concluido',
    budget: 65000,
    startDate: '2026-03-01',
    endDate: '2026-05-10',
    location: 'Condomínio Quinta da Baroneza, Bragança Paulista - SP',
    area: 450,
    description: 'Fase de elaboração técnica dos projetos executivos detalhados: paginações de piso, detalhamento de marcenaria, forros, iluminação (luminotécnico), e especificações de acabamentos.'
  },
  {
    id: 'project-4',
    name: 'Projeto Executivo Luminotécnico e Acústico - Bosque',
    clientId: 'client-3',
    type: 'projeto',
    status: 'planejamento',
    budget: 45000,
    startDate: '2026-05-15',
    location: 'Al. Lorena, 340, Jardins, São Paulo - SP',
    area: 240,
    description: 'Detalhamento luminotécnico cênico e consultoria de isolamento e tratamento acústico para o novo Salão Gourmet e de Eventos do Condomínio.'
  }
];

export const INITIAL_TRANSACTIONS: Transaction[] = [
  // OralMed (project-1) - Budget 180.000
  {
    id: 'tx-101',
    projectId: 'project-1',
    description: 'Demolição de paredes de alvenaria e remoção de entulho',
    category: 'mao_de_obra',
    value: 8500,
    date: '2026-02-25',
    supplier: 'Empreiteira Santos & Silva',
    status: 'pago',
    notes: 'Inclusas caçambas de descarte legalizado.',
    receiptName: 'recibo_santos_silva_demolicao.pdf'
  },
  {
    id: 'tx-102',
    projectId: 'project-1',
    description: 'Tubulações de cobre e conexões de ar comprimido e vácuo',
    category: 'materiais',
    value: 14200,
    date: '2026-03-05',
    supplier: 'Central Hidráulica & Cobre',
    status: 'pago',
    notes: 'Materiais especiais conforme normas da ANVISA para clínicas.',
    receiptName: 'nota_fiscal_33410_cobre.pdf'
  },
  {
    id: 'tx-103',
    projectId: 'project-1',
    description: 'Instalação elétrica dos pontos de cadeira e bombas de vácuo',
    category: 'mao_de_obra',
    value: 12000,
    date: '2026-03-15',
    supplier: 'Eletrificadora Paulista Ltda',
    status: 'pago',
    notes: 'Garantia de 2 anos sobre a infraestrutura elétrica dos consultórios.',
    receiptName: 'recibo_instalacao_eletrica_cadeiras.pdf'
  },
  {
    id: 'tx-104',
    projectId: 'project-1',
    description: 'Porcelanato técnico Retificado 90x90cm cinza e argamassa',
    category: 'materiais',
    value: 18450,
    date: '2026-04-02',
    supplier: 'Portobello Shop Paulista',
    status: 'pago',
    notes: 'Porcelanato de alto tráfego com resistência química.',
    receiptName: 'nf_portobello_porcelanato_90x90.pdf'
  },
  {
    id: 'tx-105',
    projectId: 'project-1',
    description: 'Mão de obra para assentamento de piso e revestimento cerâmico',
    category: 'mao_de_obra',
    value: 9800,
    date: '2026-04-12',
    supplier: 'Azulejistas de Elite SP',
    status: 'pago',
    notes: 'Assentamento nivelado com junta seca de 1.5mm.',
    receiptName: 'rec_azulejistas_elite.pdf'
  },
  {
    id: 'tx-106',
    projectId: 'project-1',
    description: 'Móveis sob medida para recepção e consultório 1',
    category: 'decoracao',
    value: 35000,
    date: '2026-04-20',
    supplier: 'Marcenaria Conceito Fino',
    status: 'pendente',
    notes: 'Sinal de 50% pago. Restante na montagem final agendada para Julho.',
    receiptName: 'contrato_marcenaria_sinal50.pdf'
  },
  {
    id: 'tx-107',
    projectId: 'project-1',
    description: 'Taxa de alvará de reforma e fiscalização de obras (RRT)',
    category: 'taxas',
    value: 1850,
    date: '2026-02-18',
    supplier: 'Prefeitura de São Paulo / CAU-SP',
    status: 'pago',
    notes: 'RRT de autoria e execução emitidas pelo escritório.',
    receiptName: 'rrt_paga_cau_sp.pdf'
  },
  {
    id: 'tx-108',
    projectId: 'project-1',
    description: 'Luminárias embutidas de LED No-Glare para consultórios',
    category: 'materiais',
    value: 7400,
    date: '2026-05-10',
    supplier: 'Lumen Design & Co.',
    status: 'pendente',
    notes: 'Faturamento para 30 dias.',
    receiptName: 'orcamento_luminarias_led_embutidas.pdf'
  },

  // Cliente Exemplo - Casa de Campo (project-2) - Budget 1.250.000
  {
    id: 'tx-201',
    projectId: 'project-2',
    description: 'Serviço de terraplenagem e acerto de taludes',
    category: 'mao_de_obra',
    value: 28000,
    date: '2026-03-28',
    supplier: 'Terraforte Tratores & Terraplenagem',
    status: 'pago',
    notes: 'Movimentação de terra conforme projeto altimétrico.',
    receiptName: 'nf_terraforte_acerto_taludes.pdf'
  },
  {
    id: 'tx-202',
    projectId: 'project-2',
    description: 'Sapata corrida e blocos de fundação (Concreto usinado Fck 30Mpa)',
    category: 'materiais',
    value: 94300,
    date: '2026-04-15',
    supplier: 'Engemix Concretos SP',
    status: 'pago',
    notes: 'Fornecimento de 32m³ de concreto bombeável com laudos.',
    receiptName: 'nf_engemix_concreto_fck30.pdf'
  },
  {
    id: 'tx-203',
    projectId: 'project-2',
    description: 'Estrutura de Madeira MLC (Sinal de fabricação)',
    category: 'materiais',
    value: 180000,
    date: '2026-05-02',
    supplier: 'Amata MLC Soluções em Madeira',
    status: 'pago',
    notes: 'Primeira parcela de fabricação das vigas e pilares laminados colados.',
    receiptName: 'contrato_amata_mlc_sinal.pdf'
  },
  {
    id: 'tx-204',
    projectId: 'project-2',
    description: 'Montagem estrutural da MLC - Equipe especializada',
    category: 'mao_de_obra',
    value: 42000,
    date: '2026-05-18',
    supplier: 'Carpintaria Baroneza S/A',
    status: 'pendente',
    notes: 'A ser faturado conforme início da montagem mecânica.',
    receiptName: 'cronograma_pagamento_montagem_mlc.pdf'
  },
  {
    id: 'tx-205',
    projectId: 'project-2',
    description: 'Projeto complementar de cálculo estrutural de fundação',
    category: 'projetos_complementares',
    value: 22000,
    date: '2026-03-22',
    supplier: 'Calculistas Associados Ltda',
    status: 'pago',
    notes: 'Dimensionamento geotécnico integrado com a estrutura de madeira MLC.',
    receiptName: 'recibo_calculo_estrutural.pdf'
  },
  {
    id: 'tx-206',
    projectId: 'project-2',
    description: 'Taxa de licenciamento ambiental e aprovação de condomínio',
    category: 'taxas',
    value: 4800,
    date: '2026-03-20',
    supplier: 'CETESB / Adm Quinta da Baroneza',
    status: 'pago',
    notes: 'Alvará ambiental para supressão vegetal pontual aprovado.',
    receiptName: 'guia_recolhimento_cetesb_ok.pdf'
  },

  // Cliente Exemplo - Projetos Executivos Detalhamento (project-3) - Budget 65.000
  {
    id: 'tx-301',
    projectId: 'project-3',
    description: 'Desenvolvimento do modelo BIM 3D (Revit Architecture)',
    category: 'projetos_complementares',
    value: 25000,
    date: '2026-03-10',
    supplier: 'BIM Tech Consultoria',
    status: 'pago',
    notes: 'Modelo executivo compatibilizado com estrutural e hidráulica.',
    receiptName: 'nota_servico_bim_tech_3d.pdf'
  },
  {
    id: 'tx-302',
    projectId: 'project-3',
    description: 'Consultoria de Design de Interiores e Marcenaria',
    category: 'projetos_complementares',
    value: 15000,
    date: '2026-04-05',
    supplier: 'Chaves Brites Correa - Freelancer Partner',
    status: 'pago',
    notes: 'Especificação técnica de detalhes e plantas de montagem de marcenaria.',
    receiptName: 'recibo_interiores_parceiro.pdf'
  },
  {
    id: 'tx-303',
    projectId: 'project-3',
    description: 'Plotagens de desenhos de obras em grandes formatos (A0/A1)',
    category: 'outros',
    value: 1200,
    date: '2026-05-02',
    supplier: 'Gráfica Plotar Rapidez',
    status: 'pago',
    notes: 'Cadernos de detalhamento enviados físicos para o canteiro.',
    receiptName: 'recibo_plotagem_cadernos.pdf'
  }
];

export const INITIAL_CONTRACTS: Contract[] = [];

export const INITIAL_DOCUMENTS: ProjectDocument[] = [
  // project-1: Reforma de Interiores Clínica OralMed
  {
    id: 'doc-101',
    projectId: 'project-1',
    name: 'Contrato de Prestação de Serviços de Arquitetura',
    description: 'Contrato firmado regulando escopo de reforma, honorários de acompanhamento técnico e prazos de entrega.',
    class: 'administrativo',
    fileName: 'contrato_prestacao_servicos_oralmed_assinado.pdf',
    uploadedAt: '2026-02-12',
    status: 'aprovado',
    category: 'contrato'
  },
  {
    id: 'doc-102',
    projectId: 'project-1',
    name: 'Alvará de Reforma e Execução da Prefeitura',
    description: 'Guia de deferimento municipal para obras civis comerciais com readequação de layout na Av. Paulista.',
    class: 'administrativo',
    fileName: 'alvara_reforma_pmsp_2026_88.pdf',
    uploadedAt: '2026-02-18',
    status: 'aprovado',
    category: 'alvara'
  },
  {
    id: 'doc-103',
    projectId: 'project-1',
    name: 'Estudo Preliminar - Layout de Consultórios',
    description: 'Distribuição dos 3 consultórios clínicos, fluxos de desinfecção e recepção para validação da equipe médica.',
    class: 'planejamento',
    fileName: 'Estudo_Preliminar_Layout_V3.pdf',
    uploadedAt: '2026-02-22',
    status: 'aprovado'
  },
  {
    id: 'doc-104',
    projectId: 'project-1',
    name: 'Detalhamento Técnico de Hidráulica Clínica',
    description: 'Caminho das tubulações de água, esgoto e tubulação de vácuo especial para os equipos odontológicos.',
    class: 'planejamento',
    fileName: 'Detalhamento_Hidraulica_Odonto_REV2.dwg',
    uploadedAt: '2026-03-02',
    status: 'aprovado'
  },
  {
    id: 'doc-105',
    projectId: 'project-1',
    name: 'Diário de Obra - Semana 1 e 2',
    description: 'Relatório resumindo a demolição inicial, remoção de entulhos em caçambas e demarcação de dry-wall.',
    class: 'acompanhamento',
    fileName: 'Relatorio_RDO_Semanas_1_2.pdf',
    uploadedAt: '2026-03-10',
    status: 'aprovado'
  },
  {
    id: 'doc-106',
    projectId: 'project-1',
    name: 'Checklist de Entrega de Infraestrutura Elétrica',
    description: 'Ensaios de isolamento e posicionamento de pontos elétricos de piso sob as cadeiras clínicas.',
    class: 'acompanhamento',
    fileName: 'Checklist_Teste_Instalacao_Eletrica.pdf',
    uploadedAt: '2026-03-18',
    status: 'revisao'
  },

  // project-2: Casa de Campo - Cliente Exemplo
  {
    id: 'doc-201',
    projectId: 'project-2',
    name: 'Licença Ambiental Provisória - CETESB',
    description: 'Autorização ambiental para supressão vegetal pontual e movimentação de terra em condomínio residencial.',
    class: 'administrativo',
    fileName: 'cetesb_licenca_ambiental_v77.pdf',
    uploadedAt: '2026-03-18',
    status: 'aprovado',
    category: 'alvara'
  },
  {
    id: 'doc-202',
    projectId: 'project-2',
    name: 'Cronograma Físico-Financeiro Consolidado',
    description: 'Estimativa de evolução física mensal integrada ao fluxo de liberação de pagamentos por marcos da obra.',
    class: 'planejamento',
    fileName: 'Cronograma_Geral_Mestre_CasaCampo.xlsx',
    uploadedAt: '2026-03-22',
    status: 'revisao'
  },
  {
    id: 'doc-203',
    projectId: 'project-2',
    name: 'Relatório Fotográfico - Terraplenagem e Fundação',
    description: 'Evidências do acerto de taludes, ensaio de penetração e início da concretagem das sapatas.',
    class: 'acompanhamento',
    fileName: 'Relatorio_Fotografico_Fundaçoes_Sinal.pdf',
    uploadedAt: '2026-04-18',
    status: 'aprovado'
  },

  // project-3: Projetos de Arquitetura Executivo - Roberto
  {
    id: 'doc-301',
    projectId: 'project-3',
    name: 'Registro de Responsabilidade Técnica (RRT) - CAU',
    description: 'Guia oficial emitida no CAU-SP referente ao projeto executivo de detalhamento arquitetônico.',
    class: 'administrativo',
    fileName: 'rrt_cau_detalhamento_executivo.pdf',
    uploadedAt: '2026-03-02',
    status: 'aprovado',
    category: 'rrt'
  },
  {
    id: 'doc-302',
    projectId: 'project-3',
    name: 'Caderno Executivo de Marcenaria',
    description: 'Pranchas finais contendo vistas, cortes, detalhamento de dobradiças, gaveteiros e amostragem de padrões Mdf.',
    class: 'planejamento',
    fileName: 'Caderno_Marcenaria_Executiva_Completo.pdf',
    uploadedAt: '2026-04-15',
    status: 'aprovado'
  },
  {
    id: 'doc-303',
    projectId: 'project-3',
    name: 'Ata de Compatibilização de Projetos 3D',
    description: 'Registro de reunião técnica ajustando interferências entre furação de vigas MLC e dutos de climatização.',
    class: 'acompanhamento',
    fileName: 'Ata_Reuniao_Compatibilizacao_Revit.pdf',
    uploadedAt: '2026-04-08',
    status: 'aprovado'
  },

  // project-4: Projeto Executivo Luminotécnico e Acústico - Bosque
  {
    id: 'doc-401',
    projectId: 'project-4',
    name: 'Contrato de Projeto Executivo do Salão de Festas',
    description: 'Honorários de projeto luminotécnico cênico e tratamento acústico do condomínio.',
    class: 'administrativo',
    fileName: 'contrato_luminotecnico_bosque.pdf',
    uploadedAt: '2026-05-10',
    status: 'aprovado',
    category: 'contrato'
  },
  {
    id: 'doc-402',
    projectId: 'project-4',
    name: 'Estudo de Simulação Acústica Computacional',
    description: 'Simulação tridimensional avaliando reverberação média e isolamento técnico em dB para eventos festivos.',
    class: 'planejamento',
    fileName: 'Estudo_Reverberacao_Simulacao_Acustica.pdf',
    uploadedAt: '2026-05-28',
    status: 'desenvolvimento'
  },
  {
    id: 'doc-403',
    projectId: 'project-4',
    name: 'Ata de Alinhamento com Corpo de Síndicos',
    description: 'Deliberações preliminares sobre limites de ruídos e especificações estéticas das luminárias embutidas.',
    class: 'acompanhamento',
    fileName: 'Ata_Reuniao_Alinhamento_Sindicos.pdf',
    uploadedAt: '2026-05-20',
    status: 'aprovado'
  }
];

