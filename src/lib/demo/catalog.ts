// src/lib/demo/catalog.ts
// Catálogo ESTÁTICO da obra demonstrativa (dados fictícios): etapas do cronograma, empreiteiros,
// pedidos de compra, despesas diversas, documentos, licenças e pendências.
// Nenhuma pessoa, empresa ou documento aqui é real — nomes e valores são inventados.

import { addDays, diffDays, weekday } from './util';

export const DEMO_PREFIX = 'demo-';
export const DEMO_IDS = {
  client: 'demo-client-albuquerque',
  project: 'demo-obra-albuquerque',
  user: 'demo-user-albuquerque',
  username: 'cliente.exemplo',
};

export const DEMO_START = '2025-01-06';
export const DEMO_END = '2026-03-31';          // fim do prazo contratado (e dos lançamentos de encerramento)
export const DEMO_DELIVERY = '2026-03-06';     // entrega real da obra (25 dias antes do prazo)
export const DEMO_BUDGET = 1200000;
export const DEMO_AREA = 250;

export type PhaseKey =
  | 'adm' | 'prel' | 'terra' | 'fund' | 'estr' | 'alv' | 'cob' | 'ele' | 'hid' | 'imp'
  | 'reb' | 'esq' | 'ges' | 'pis' | 'pin' | 'mar' | 'esp' | 'ext' | 'ent';

export interface PhaseDef {
  key: PhaseKey;
  name: string;
  planStart: string; planEnd: string;   // linha de base (cronograma contratado)
  actStart: string; actEnd: string;     // execução real
  overrun: number;                      // custo real / custo previsto (ex.: 1.08 = estouro de 8%)
  stage: string;                        // chave da imagem ilustrativa
}

// Linha de base (planejado): 06/01/2025 → 31/03/2026. Execução real: 06/01/2025 → 06/03/2026 (adiantada).
// As datas abaixo (actStart/actEnd) são o planejado; a execução real é derivada com shiftEarly().
const BASE_PHASES: PhaseDef[] = [
  { key: 'adm',  name: 'Administração Local e Gerenciamento da Obra', planStart: '2025-01-06', planEnd: '2026-02-27', actStart: '2025-01-06', actEnd: '2026-03-31', overrun: 0.96, stage: 'canteiro' },
  { key: 'prel', name: 'Serviços Preliminares, Projetos Complementares e Canteiro', planStart: '2025-01-06', planEnd: '2025-02-07', actStart: '2025-01-06', actEnd: '2025-02-14', overrun: 0.95, stage: 'canteiro' },
  { key: 'terra', name: 'Movimentação de Terra e Locação da Obra', planStart: '2025-01-27', planEnd: '2025-02-14', actStart: '2025-02-03', actEnd: '2025-02-21', overrun: 0.92, stage: 'terraplenagem' },
  { key: 'fund', name: 'Fundações (estacas, blocos e vigas baldrame)', planStart: '2025-02-10', planEnd: '2025-03-21', actStart: '2025-02-17', actEnd: '2025-04-04', overrun: 0.94, stage: 'fundacao' },
  { key: 'estr', name: 'Estrutura de Concreto Armado (pilares, vigas e lajes)', planStart: '2025-03-17', planEnd: '2025-05-30', actStart: '2025-03-31', actEnd: '2025-06-13', overrun: 0.93, stage: 'estrutura' },
  { key: 'alv',  name: 'Alvenaria e Vedações', planStart: '2025-05-12', planEnd: '2025-07-04', actStart: '2025-05-26', actEnd: '2025-07-18', overrun: 0.95, stage: 'alvenaria' },
  { key: 'cob',  name: 'Cobertura e Telhado', planStart: '2025-06-23', planEnd: '2025-07-25', actStart: '2025-07-07', actEnd: '2025-08-08', overrun: 0.91, stage: 'cobertura' },
  { key: 'ele',  name: 'Instalações Elétricas e Dados', planStart: '2025-06-16', planEnd: '2025-08-22', actStart: '2025-06-30', actEnd: '2025-09-05', overrun: 0.96, stage: 'instalacoes' },
  { key: 'hid',  name: 'Instalações Hidrossanitárias e Gás', planStart: '2025-06-16', planEnd: '2025-08-15', actStart: '2025-06-30', actEnd: '2025-08-29', overrun: 0.93, stage: 'instalacoes' },
  { key: 'imp',  name: 'Impermeabilização', planStart: '2025-07-28', planEnd: '2025-08-15', actStart: '2025-08-11', actEnd: '2025-08-29', overrun: 0.9, stage: 'instalacoes' },
  { key: 'reb',  name: 'Reboco, Contrapiso e Regularizações', planStart: '2025-07-14', planEnd: '2025-09-12', actStart: '2025-07-28', actEnd: '2025-09-26', overrun: 0.94, stage: 'reboco' },
  { key: 'esq',  name: 'Esquadrias de Alumínio, Vidros e Guarda-corpos', planStart: '2025-09-01', planEnd: '2025-10-31', actStart: '2025-09-15', actEnd: '2025-11-21', overrun: 0.92, stage: 'esquadrias' },
  { key: 'ges',  name: 'Gesso, Forros e Sancas', planStart: '2025-09-15', planEnd: '2025-10-24', actStart: '2025-09-29', actEnd: '2025-11-14', overrun: 0.93, stage: 'gesso' },
  { key: 'pis',  name: 'Pisos, Revestimentos e Bancadas', planStart: '2025-09-29', planEnd: '2025-12-12', actStart: '2025-10-14', actEnd: '2026-01-16', overrun: 0.93, stage: 'pisos' },
  { key: 'pin',  name: 'Pintura Interna e Externa', planStart: '2025-11-03', planEnd: '2026-01-16', actStart: '2025-11-24', actEnd: '2026-02-13', overrun: 0.9, stage: 'pintura' },
  { key: 'mar',  name: 'Marcenaria, Louças e Metais', planStart: '2025-11-24', planEnd: '2026-02-06', actStart: '2025-12-15', actEnd: '2026-03-06', overrun: 0.94, stage: 'marcenaria' },
  { key: 'esp',  name: 'Instalações Especiais (ar-condicionado, automação e iluminação)', planStart: '2025-11-10', planEnd: '2026-01-30', actStart: '2025-12-01', actEnd: '2026-02-27', overrun: 0.92, stage: 'marcenaria' },
  { key: 'ext',  name: 'Área Externa, Paisagismo e Piscina', planStart: '2025-10-06', planEnd: '2026-02-13', actStart: '2025-10-20', actEnd: '2026-03-13', overrun: 0.93, stage: 'externa' },
  { key: 'ent',  name: 'Limpeza Final, Vistorias e Entrega', planStart: '2026-02-16', planEnd: '2026-02-27', actStart: '2026-03-16', actEnd: '2026-03-31', overrun: 0.88, stage: 'entrega' },
];

/** Antecipa uma data da linha de base: 0 dia no início da obra, até 25 dias no fim (sempre em dia útil). */
export function shiftEarly(d: string): string {
  if (d <= DEMO_START) return d;
  const total = diffDays(DEMO_START, DEMO_END);
  const f = Math.min(1, diffDays(DEMO_START, d) / total);
  let x = addDays(d, -Math.round(25 * f));
  const w = weekday(x);
  if (w === 6) x = addDays(x, -1);
  if (w === 0) x = addDays(x, -2);
  return x;
}

export const PHASES: PhaseDef[] = BASE_PHASES.map(p => ({
  ...p,
  planStart: p.actStart, planEnd: p.actEnd,
  actStart: shiftEarly(p.actStart), actEnd: shiftEarly(p.actEnd),
}));

// ---------------------------------------------------------------------------
// Empreiteiros / subcontratos (contratos de mão de obra)
// ---------------------------------------------------------------------------

/** Passo de pagamento: pct do contrato; at = 'sinal' | 'fim' | % da janela do contrato (medição). */
export interface PayStep { pct: number; at: 'sinal' | 'fim' | number; label: string }

export interface ContractDef {
  key: string;
  phase: PhaseKey;
  supplier: string;
  scope: string;
  value: number;                 // valor base do contrato
  aditivo?: { value: number; label: string; at: number };
  notes: string;
  category?: 'mao_de_obra' | 'decoracao';
  win?: [string, string];        // janela própria (padrão: datas reais da etapa)
  pay: PayStep[];
  invoiceKind?: string;          // "NFS-e", "Recibo"...
}

const STD4: PayStep[] = [
  { pct: 20, at: 'sinal', label: 'Sinal / mobilização' },
  { pct: 30, at: 35, label: '1ª medição (35% executado)' },
  { pct: 30, at: 75, label: '2ª medição (75% executado)' },
  { pct: 20, at: 'fim', label: 'Parcela final — conclusão e aceite' },
];

export const CONTRACTS: ContractDef[] = [
  { key: 'terra', phase: 'terra', supplier: 'Terraplena Campo Grande Serviços Ltda', scope: 'Movimentação de terra, nivelamento do platô, compactação e bota-fora de entulho (retroescavadeira, caminhões e operadores)', value: 12900, notes: 'Contrato por empreitada global. Inclui locação de maquinário e combustível. Bota-fora com CTR.', pay: [{ pct: 40, at: 'sinal', label: 'Sinal / mobilização das máquinas' }, { pct: 60, at: 'fim', label: 'Parcela final — platô liberado' }] },
  { key: 'fund', phase: 'fund', supplier: 'Alicerce Fundações e Estacas Ltda', scope: 'Estacas tipo broca, blocos de coroamento e vigas baldrame (mão de obra, equipamentos e armação)', value: 24050, notes: 'Material (aço e concreto) fornecido pelo contratante via mapas de cotação. Mão de obra e equipamentos por conta da contratada.', pay: [{ pct: 30, at: 'sinal', label: 'Sinal / início das estacas' }, { pct: 40, at: 50, label: '2ª parcela — blocos concluídos (50%)' }, { pct: 30, at: 'fim', label: 'Parcela final — baldrames concluídos' }] },
  { key: 'estr', phase: 'estr', supplier: 'Pilar Estruturas — Mestre Antônio Barros', scope: 'Fôrmas, armação, concretagem e desforma da estrutura de concreto armado (térreo, pavimento superior e cobertura)', value: 46300, aditivo: { value: 3750, label: 'Aditivo nº 1 — marquise da entrada e viga de transição não prevista', at: 85 }, notes: 'Concreto usinado e aço comprados pelo contratante. Equipe de 8 oficiais. Aditivo nº 1 aprovado pelo cliente em 02/06/2025.', pay: [{ pct: 15, at: 'sinal', label: 'Sinal / mobilização' }, { pct: 25, at: 25, label: '1ª medição — pilares do térreo' }, { pct: 25, at: 50, label: '2ª medição — laje do piso superior' }, { pct: 20, at: 75, label: '3ª medição — pilares e vigas do superior' }, { pct: 15, at: 'fim', label: 'Parcela final — laje de cobertura e desforma' }] },
  { key: 'alv', phase: 'alv', supplier: 'Empreitada Mestre José Aparecido (Alvenaria)', scope: 'Alvenaria de vedação com bloco cerâmico, vergas, contravergas e encunhamento', value: 16450, notes: 'Pago por medição de m² executado. Material por conta do contratante.', pay: [{ pct: 20, at: 'sinal', label: 'Sinal' }, { pct: 30, at: 40, label: '1ª medição — alvenaria do térreo' }, { pct: 30, at: 80, label: '2ª medição — alvenaria do superior' }, { pct: 20, at: 'fim', label: 'Parcela final — encunhamento e aceite' }] },
  { key: 'cob', phase: 'cob', supplier: 'Metalúrgica Santa Clara Ltda', scope: 'Fornecimento e montagem da estrutura metálica da cobertura (tesouras, terças e contraventamentos) e instalação das telhas', value: 23150, notes: 'Estrutura em aço galvanizado com projeto e ART da contratada. Telhas termoacústicas compradas à parte.', pay: [{ pct: 30, at: 'sinal', label: 'Sinal / fabricação da estrutura' }, { pct: 40, at: 60, label: '2ª parcela — estrutura montada' }, { pct: 30, at: 'fim', label: 'Parcela final — telhas e rufos instalados' }] },
  { key: 'ele', phase: 'ele', supplier: 'Eletro Pantanal Instalações Elétricas', scope: 'Instalações elétricas, cabeamento estruturado, SPDA e quadros de distribuição (mão de obra e acessórios de fixação)', value: 15650, aditivo: { value: 2050, label: 'Aditivo nº 1 — 38 pontos extras solicitados pelo cliente (gourmet e jardim)', at: 70 }, notes: 'Material elétrico comprado pelo contratante. Entrega de memorial e as-built.', pay: STD4 },
  { key: 'hid', phase: 'hid', supplier: 'Hidro Sul Instalações Hidráulicas', scope: 'Instalações de água fria/quente, esgoto, águas pluviais, gás e interligação do aquecedor solar (mão de obra)', value: 13350, notes: 'Teste de estanqueidade presenciado pela fiscalização. Material por conta do contratante.', pay: STD4 },
  { key: 'imp', phase: 'imp', supplier: 'Imper Brasil Impermeabilizações', scope: 'Impermeabilização de áreas molhadas, terraço e reservatórios — fornecimento e aplicação (manta asfáltica e argamassa polimérica)', value: 15150, notes: 'Garantia de 5 anos. Teste de lâmina d’água por 72 horas antes da proteção mecânica.', pay: [{ pct: 40, at: 'sinal', label: 'Sinal / mobilização' }, { pct: 60, at: 'fim', label: 'Parcela final — teste de estanqueidade aprovado' }] },
  { key: 'reb', phase: 'reb', supplier: 'Reboco Rápido Revestimentos Ltda', scope: 'Chapisco, reboco interno e externo e contrapiso nivelado (mão de obra)', value: 18700, notes: 'Argamassas e agregados fornecidos pelo contratante. Tolerância de planicidade: 3 mm/2 m.', pay: STD4 },
  { key: 'esq', phase: 'esq', supplier: 'Pantanal Esquadrias e Vidros Ltda', scope: 'Fornecimento e instalação de esquadrias de alumínio, vidros laminados/temperados e guarda-corpos de vidro', value: 51600, aditivo: { value: 5600, label: 'Aditivo nº 1 — upgrade para vidro laminado acústico nos dormitórios (solicitado pelo cliente)', at: 45 }, notes: 'Linha Suprema com pintura eletrostática grafite. Prazo de fabricação de 25 dias. Garantia de 5 anos nas esquadrias.', pay: [{ pct: 40, at: 'sinal', label: 'Sinal / início da fabricação' }, { pct: 30, at: 40, label: '2ª parcela — entrega das esquadrias' }, { pct: 30, at: 'fim', label: 'Parcela final — instalação e vidros concluídos' }] },
  { key: 'ges', phase: 'ges', supplier: 'Forma Gesso Acabamentos', scope: 'Forros e sancas de gesso acartonado, cortineiros e negativos — material e mão de obra', value: 21350, notes: 'Placas ST e RU (áreas molhadas). Estrutura em perfis galvanizados.', pay: [{ pct: 30, at: 'sinal', label: 'Sinal' }, { pct: 40, at: 55, label: '2ª parcela — forro fechado (55%)' }, { pct: 30, at: 'fim', label: 'Parcela final — acabamento de juntas' }] },
  { key: 'pis', phase: 'pis', supplier: 'Assentamentos Mestre Valdir', scope: 'Assentamento de porcelanatos, revestimentos, rodapés, bancadas e soleiras (mão de obra)', value: 21350, notes: 'Pago por m² assentado. Tolerância de lippage 1 mm. Rejunte epóxi nas áreas molhadas.', pay: [{ pct: 15, at: 'sinal', label: 'Sinal' }, { pct: 25, at: 30, label: '1ª medição' }, { pct: 25, at: 60, label: '2ª medição' }, { pct: 20, at: 85, label: '3ª medição' }, { pct: 15, at: 'fim', label: 'Parcela final — rejuntes e limpeza' }] },
  { key: 'pin', phase: 'pin', supplier: 'Pintura Cores do Cerrado', scope: 'Preparo de superfícies, massa corrida, pintura interna e externa (mão de obra)', value: 16900, notes: 'Padrão de acabamento: 2 demãos de selador + 2 de tinta. Fachada com texturas aprovadas em amostra.', pay: STD4 },
  { key: 'mar', phase: 'mar', supplier: 'Atelier Ipê Marcenaria', scope: 'Marcenaria planejada: cozinha, lavanderia, closets, painéis ripados e home — projeto de detalhamento, fabricação e montagem', value: 39150, notes: 'MDF com acabamento laminado e lâmina natural. Ferragens com amortecimento. Garantia de 3 anos.', category: 'decoracao', pay: [{ pct: 40, at: 'sinal', label: 'Sinal / início da produção' }, { pct: 30, at: 50, label: '2ª parcela — produção concluída' }, { pct: 30, at: 'fim', label: 'Parcela final — montagem e ajustes' }] },
  { key: 'esp1', phase: 'esp', supplier: 'Clima Centro-Oeste Refrigeração', scope: 'Ar-condicionado split inverter (6 ambientes): fornecimento dos equipamentos, infraestrutura frigorígena e instalação', value: 20000, notes: 'Equipamentos de 9.000 a 24.000 BTU/h com garantia de fábrica de 12 meses.', win: ['2025-12-01', '2026-02-13'], pay: [{ pct: 50, at: 'sinal', label: 'Sinal — compra dos equipamentos' }, { pct: 50, at: 'fim', label: 'Parcela final — instalação e comissionamento' }] },
  { key: 'esp2', phase: 'esp', supplier: 'AutoCasa Automação Residencial', scope: 'Automação de iluminação e cortinas, CFTV (8 câmeras) e som ambiente — equipamentos, programação e treinamento', value: 11100, notes: 'Sistema com controle por aplicativo. Inclui treinamento do cliente e 6 meses de suporte.', win: ['2026-01-12', '2026-02-27'], pay: [{ pct: 50, at: 'sinal', label: 'Sinal — compra dos equipamentos' }, { pct: 50, at: 'fim', label: 'Parcela final — programação e entrega' }] },
  { key: 'ext1', phase: 'ext', supplier: 'Piscina Azul Cerrado', scope: 'Piscina de fibra 6 × 3 m com casa de máquinas, filtro e iluminação LED — fornecimento e instalação', value: 19600, notes: 'Escavação e base executadas pela contratada. Garantia de 10 anos na casca.', win: ['2025-10-20', '2025-12-19'], pay: [{ pct: 40, at: 'sinal', label: 'Sinal / pedido da piscina' }, { pct: 40, at: 50, label: '2ª parcela — entrega e assentamento' }, { pct: 20, at: 'fim', label: 'Parcela final — filtragem e enchimento' }] },
  { key: 'ext2', phase: 'ext', supplier: 'Serralheria Ferro & Arte', scope: 'Portão de pedestres e veículos (automatizado), gradil frontal e corrimão da escada externa', value: 10250, notes: 'Aço carbono com pintura epóxi preta fosca. Motor deslizante com garantia de 1 ano.', win: ['2025-12-01', '2026-01-30'], pay: [{ pct: 50, at: 'sinal', label: 'Sinal / fabricação' }, { pct: 50, at: 'fim', label: 'Parcela final — instalação e automação' }] },
  { key: 'ext3', phase: 'ext', supplier: 'Verde Vivo Paisagismo', scope: 'Execução do projeto paisagístico: plantio, forrações, irrigação automatizada e iluminação de jardim', value: 9800, notes: 'Mudas e substrato inclusos. Garantia de pega das mudas por 90 dias.', category: 'decoracao', win: ['2026-02-02', '2026-03-13'], pay: [{ pct: 30, at: 'sinal', label: 'Sinal' }, { pct: 40, at: 50, label: '2ª parcela — plantio concluído' }, { pct: 30, at: 'fim', label: 'Parcela final — irrigação e entrega' }] },
  { key: 'ent', phase: 'ent', supplier: 'Limpeza Pós-Obra Brilho Serviços', scope: 'Limpeza fina pós-obra de toda a edificação e área externa', value: 3750, notes: 'Equipe de 6 pessoas por 2 dias.', win: ['2026-03-23', '2026-03-27'], pay: [{ pct: 100, at: 'fim', label: 'Pagamento único — limpeza concluída' }] },
  { key: 'adm', phase: 'adm', supplier: 'Raimundo Souza — Mestre de Obras', scope: 'Administração local: mestre de obras e equipe de apoio (serventes, almoxarife e vigia diurno) por todo o período da obra', value: 62750, notes: 'Pagamento mensal conforme folha apurada no último dia útil. 15 meses de obra.', pay: [] },
];

// ---------------------------------------------------------------------------
// Fornecedores (para mapas de cotação e compras)
// ---------------------------------------------------------------------------

export interface SupplierInfo { phone: string; email: string; terms: string; fee: number; time: string }
const S = (phone: string, email: string, terms: string, fee: number, time: string): SupplierInfo => ({ phone, email, terms, fee, time });

export const SUPPLIERS: Record<string, SupplierInfo> = {
  'Depósito Pantanal Materiais de Construção': S('(67) 3300-1101', 'vendas@depositopantanal.example', 'Boleto 28 dias', 180, '48 horas'),
  'Casa do Construtor Campo Grande': S('(67) 3300-1102', 'orcamentos@casadoconstrutor.example', 'Boleto 21 dias', 150, '24 horas'),
  'Aços Centro-Oeste Distribuidora': S('(67) 3300-1103', 'comercial@acoscentrooeste.example', 'Boleto 28 dias', 450, '3 dias úteis'),
  'Siderúrgica Pantanal Aços': S('(67) 3300-1104', 'vendas@siderurgicapantanal.example', 'Boleto 21 dias', 520, '4 dias úteis'),
  'Ferro & Aço Campo Grande': S('(67) 3300-1105', 'contato@ferroeaco.example', 'À vista (Pix)', 380, '2 dias úteis'),
  'ConcreMS Concreto Usinado': S('(67) 3300-1106', 'comercial@concrems.example', 'Boleto 14 dias', 0, 'Programado (24 h)'),
  'Mix Concreto Cerrado': S('(67) 3300-1107', 'vendas@mixconcreto.example', 'Boleto 14 dias', 0, 'Programado (48 h)'),
  'Concreto Bom Sucesso': S('(67) 3300-1108', 'vendas@bomsucesso.example', 'Boleto 7 dias', 0, 'Programado (48 h)'),
  'Madeireira Três Marias': S('(67) 3300-1109', 'vendas@tresmarias.example', 'Boleto 14 dias', 220, '48 horas'),
  'Cerâmica Santa Luzia': S('(67) 3300-1110', 'vendas@ceramicasantaluzia.example', 'Boleto 28 dias', 380, '4 dias úteis'),
  'Cerâmica Vale Verde': S('(67) 3300-1111', 'comercial@ceramicavaleverde.example', 'Boleto 21 dias', 420, '5 dias úteis'),
  'Olaria Rio Pardo': S('(67) 3300-1112', 'contato@olariariopardo.example', 'À vista (Pix)', 300, '3 dias úteis'),
  'Telhas & Cia MS': S('(67) 3300-1113', 'orcamentos@telhasecia.example', '50% sinal + 50% na entrega', 650, '10 dias úteis'),
  'Perfis Termoacústicos Brasil': S('(67) 3300-1114', 'vendas@perfistermo.example', 'Boleto 28 dias', 780, '12 dias úteis'),
  'Cobertura Total Distribuidora': S('(67) 3300-1115', 'comercial@coberturatotal.example', 'Boleto 21 dias', 720, '8 dias úteis'),
  'Eletromar Materiais Elétricos': S('(67) 3300-1116', 'vendas@eletromar.example', 'Boleto 28 dias', 120, '48 horas'),
  'Casa da Fiação Elétrica': S('(67) 3300-1117', 'vendas@casadafiacao.example', 'Boleto 21 dias', 150, '48 horas'),
  'Voltagem Atacado Elétrico': S('(67) 3300-1118', 'contato@voltagem.example', 'À vista (Pix)', 100, '72 horas'),
  'HidroForte Tubos e Conexões': S('(67) 3300-1119', 'vendas@hidroforte.example', 'Boleto 28 dias', 140, '48 horas'),
  'Tubos Centro-Oeste': S('(67) 3300-1120', 'comercial@tuboscentrooeste.example', 'Boleto 21 dias', 160, '72 horas'),
  'Hidráulica Pantanal': S('(67) 3300-1121', 'vendas@hidraulicapantanal.example', 'À vista (Pix)', 120, '48 horas'),
  'Areial Rio Pardo Agregados': S('(67) 3300-1122', 'vendas@areialriopardo.example', 'Boleto 14 dias', 0, '24 horas'),
  'Casa de Pisos Cerrado': S('(67) 3300-1123', 'projetos@casadepisos.example', 'Boleto 30 dias', 600, '10 dias úteis'),
  'Porcelanatos Mato Grosso do Sul': S('(67) 3300-1124', 'vendas@porcelanatosms.example', 'Boleto 28 dias', 550, '12 dias úteis'),
  'Revestimentos Aurora': S('(67) 3300-1125', 'comercial@revestimentosaurora.example', '5% desconto à vista', 640, '15 dias úteis'),
  'Mármores e Granitos Pantanal': S('(67) 3300-1126', 'orcamentos@marmorespantanal.example', '50% sinal + 50% na entrega', 350, '15 dias úteis'),
  'Pedras Serra Azul': S('(67) 3300-1127', 'contato@pedrasserraazul.example', '50% sinal + 50% na entrega', 400, '18 dias úteis'),
  'Granitos & Quartzo Brasil': S('(67) 3300-1128', 'vendas@granitosquartzo.example', '50% sinal + 50% na entrega', 380, '20 dias úteis'),
  'Tintas Arco-Íris Distribuidora': S('(67) 3300-1129', 'vendas@tintasarcoiris.example', 'Boleto 21 dias', 90, '48 horas'),
  'Casa das Tintas Campo Grande': S('(67) 3300-1130', 'contato@casadastintas.example', 'Boleto 14 dias', 110, '48 horas'),
  'Cor & Cia Tintas': S('(67) 3300-1131', 'vendas@corecia.example', 'À vista (Pix)', 80, '72 horas'),
  'Louças e Metais Premium': S('(67) 3300-1132', 'projetos@loucasmetais.example', 'Boleto 28 dias', 300, '20 dias úteis'),
  'Banho & Cozinha Design': S('(67) 3300-1133', 'vendas@banhocozinha.example', 'Boleto 21 dias', 350, '25 dias úteis'),
  'Casa do Banheiro Cerrado': S('(67) 3300-1134', 'comercial@casadobanheiro.example', '5% desconto à vista', 380, '22 dias úteis'),
  'Lume Design Iluminação': S('(67) 3300-1135', 'projetos@lumedesign.example', 'Boleto 28 dias', 260, '18 dias úteis'),
  'Luz & Forma Iluminação': S('(67) 3300-1136', 'vendas@luzeforma.example', 'Boleto 21 dias', 290, '22 dias úteis'),
  'Estúdio Lumina': S('(67) 3300-1137', 'contato@estudiolumina.example', 'À vista (Pix)', 240, '20 dias úteis'),
  'Jardim Nobre Pedras e Paisagismo': S('(67) 3300-1138', 'vendas@jardimnobre.example', 'Boleto 14 dias', 520, '7 dias úteis'),
  'Pedras Naturais do Cerrado': S('(67) 3300-1139', 'vendas@pedrasnaturais.example', '50% sinal + 50% na entrega', 480, '10 dias úteis'),
  'Madeiras do Cerrado Decks': S('(67) 3300-1140', 'orcamentos@madeirasdecks.example', 'Boleto 21 dias', 360, '12 dias úteis'),
  'Persianas & Cortinas Studio': S('(67) 3300-1141', 'atendimento@persianasstudio.example', '50% sinal + 50% na instalação', 0, '20 dias úteis'),
  'Espelhos Reflex Vidraçaria': S('(67) 3300-1142', 'orcamentos@espelhosreflex.example', 'Pix na entrega', 0, '10 dias úteis'),
  'Disk Caçamba MS': S('(67) 3300-1143', 'atendimento@diskcacamba.example', 'À vista (Pix)', 0, 'No dia'),
  'Andaimes Centro-Oeste Locações': S('(67) 3300-1144', 'locacao@andaimescentrooeste.example', 'Boleto mensal', 0, 'No dia'),
  'Locamais Equipamentos': S('(67) 3300-1145', 'locacao@locamais.example', 'Boleto 7 dias', 0, 'No dia'),
};

// ---------------------------------------------------------------------------
// Pedidos de compra de materiais (cada pedido = 1 pagamento; os maiores têm mapa de cotação)
// ---------------------------------------------------------------------------

export type Item = [name: string, unit: string, qty: number, unitPrice: number];

export interface PODef {
  key: string;
  phase: PhaseKey;
  cat: 'materiais' | 'decoracao' | 'outros';
  title: string;                 // título do mapa de cotação / descrição do pedido
  date: string;                  // data do pedido
  lead: number;                  // prazo de entrega em dias corridos
  supplier: string;              // fornecedor escolhido
  items: Item[];
  freight?: number;
  pay?: number;                  // dias após a entrega para pagar (padrão por condição)
  map?: { rivals: [string, string]; factors?: [number, number]; pickIndex?: 0 | 1 | 2; why?: string };
  note?: string;
}

export const PURCHASES: PODef[] = [
  // ---- Serviços preliminares
  { key: 'canteiro', phase: 'prel', cat: 'materiais', title: 'Canteiro: tapume, placa de obra e kit de ligação provisória', date: '2025-01-08', lead: 2, supplier: 'Depósito Pantanal Materiais de Construção', pay: 0,
    items: [['Chapa de compensado resinado 2,20 × 1,10 m, 12 mm (tapume)', 'un', 24, 148], ['Pontalete de eucalipto tratado 8 × 8 cm × 3 m', 'un', 18, 36.5], ['Placa de obra em lona com impressão (2,0 × 1,2 m)', 'un', 1.0, 360], ['Caixa d’água de polietileno 1.000 L (provisória)', 'un', 1.0, 480], ['Kit padrão de entrada de energia provisório (poste, caixa e disjuntor)', 'kit', 1.0, 1040], ['Cadeado, correntes e dobradiças para portão do canteiro', 'kit', 1.0, 210]] },
  { key: 'epi', phase: 'prel', cat: 'materiais', title: 'EPIs, ferramentas manuais e sinalização do canteiro', date: '2025-01-13', lead: 1, supplier: 'Casa do Construtor Campo Grande', pay: 0,
    items: [['Capacete de segurança com jugular', 'un', 8, 32], ['Botina de segurança com biqueira de aço', 'par', 7, 94], ['Luva de raspa/vaqueta', 'par', 22, 14.5], ['Óculos de proteção incolor', 'un', 10, 16], ['Carrinho de mão com pneu e câmara', 'un', 3.0, 268], ['Pá, enxada, picareta e colher de pedreiro (kit)', 'kit', 4.0, 215], ['Trena, nível a laser de linha e mangueira de nível', 'kit', 1.0, 640], ['Extintor ABC 6 kg e placas de sinalização', 'kit', 1.0, 360]] },
  // ---- Terra
  { key: 'rachao', phase: 'terra', cat: 'materiais', title: 'Brita e rachão para acesso e regularização do platô', date: '2025-02-05', lead: 1, supplier: 'Areial Rio Pardo Agregados', pay: 7,
    items: [['Pedra rachão', 'm³', 13, 118], ['Brita nº 2', 'm³', 8, 142]] },
  // ---- Fundação
  { key: 'fund-aco', phase: 'fund', cat: 'materiais', title: 'Aço CA-50/CA-60 para fundações', date: '2025-02-14', lead: 3, supplier: 'Aços Centro-Oeste Distribuidora', pay: 28,
    map: { rivals: ['Siderúrgica Pantanal Aços', 'Ferro & Aço Campo Grande'], factors: [1.045, 1.075], why: 'Menor preço global, prazo compatível com o início das estacas.' },
    items: [['Vergalhão CA-50 Ø 12,5 mm (barra 12 m)', 'kg', 600, 7.62], ['Vergalhão CA-50 Ø 10 mm (barra 12 m)', 'kg', 440, 7.78], ['Vergalhão CA-50 Ø 8 mm (barra 12 m)', 'kg', 270, 8.05], ['Fio CA-60 Ø 5 mm (estribos)', 'kg', 230, 8.40], ['Arame recozido nº 18', 'kg', 35, 14.8], ['Espaçador plástico para armadura 25 mm', 'un', 500, 0.58]] },
  { key: 'fund-formas', phase: 'fund', cat: 'materiais', title: 'Madeira para fôrmas e escoramento — fundação', date: '2025-02-17', lead: 2, supplier: 'Madeireira Três Marias', pay: 14,
    items: [['Tábua de pinus 2,5 × 30 cm', 'm', 135, 21.5], ['Sarrafo de pinus 2,5 × 10 cm', 'm', 290, 6.3], ['Pontalete de eucalipto tratado 8 × 8 cm × 3 m', 'un', 54, 36.5], ['Prego 18 × 27', 'kg', 37, 15.9], ['Desmoldante para fôrmas (20 L)', 'un', 1.0, 289]] },
  { key: 'fund-agreg', phase: 'fund', cat: 'materiais', title: 'Cimento, areia, brita e impermeabilizante de baldrame', date: '2025-02-24', lead: 2, supplier: 'Depósito Pantanal Materiais de Construção', pay: 28,
    items: [['Cimento CP II-F-32 (saco 50 kg)', 'saco', 85, 37.9], ['Areia média lavada', 'm³', 12, 138], ['Brita nº 1', 'm³', 8, 145], ['Tinta betuminosa impermeabilizante (18 L)', 'un', 3.0, 289]] },
  { key: 'fund-conc', phase: 'fund', cat: 'materiais', title: 'Concreto usinado fck 30 MPa — blocos e baldrames', date: '2025-03-05', lead: 1, supplier: 'ConcreMS Concreto Usinado', pay: 14,
    map: { rivals: ['Mix Concreto Cerrado', 'Concreto Bom Sucesso'], factors: [1.04, 1.07], why: 'Melhor preço por m³ e usina a 7 km da obra.' },
    items: [['Concreto usinado fck 30 MPa, slump 12 ± 2 cm', 'm³', 20, 548], ['Bombeamento com lança (diária)', 'diária', 2.0, 1180]] },
  // ---- Estrutura
  { key: 'estr-aco', phase: 'estr', cat: 'materiais', title: 'Aço para pilares, vigas e lajes (térreo e superior)', date: '2025-04-01', lead: 3, supplier: 'Aços Centro-Oeste Distribuidora', pay: 28,
    map: { rivals: ['Siderúrgica Pantanal Aços', 'Ferro & Aço Campo Grande'], factors: [1.038, 1.062], why: 'Menor preço; fechamento de 8,5 t com travamento de preço por 30 dias.' },
    items: [['Vergalhão CA-50 Ø 16 mm (barra 12 m)', 'kg', 640, 7.35], ['Vergalhão CA-50 Ø 12,5 mm (barra 12 m)', 'kg', 1340, 7.42], ['Vergalhão CA-50 Ø 10 mm (barra 12 m)', 'kg', 1090, 7.62], ['Vergalhão CA-50 Ø 8 mm (barra 12 m)', 'kg', 640, 7.95], ['Vergalhão CA-50 Ø 6,3 mm (barra 12 m)', 'kg', 380, 8.22], ['Fio CA-60 Ø 5 mm (estribos)', 'kg', 550, 8.35], ['Arame recozido nº 18', 'kg', 85, 14.2], ['Espaçador plástico para armadura 25 mm', 'un', 1760, 0.5]] },
  { key: 'estr-madeira', phase: 'estr', cat: 'materiais', title: 'Madeira e compensado para fôrmas e escoramento', date: '2025-03-27', lead: 2, supplier: 'Madeireira Três Marias', pay: 14,
    items: [['Tábua de pinus 2,5 × 30 cm', 'm', 160, 21.9], ['Chapa de compensado resinado 2,20 × 1,10 m, 12 mm', 'un', 18, 168], ['Pontalete de eucalipto tratado 8 × 8 cm × 3 m', 'un', 59, 38.5], ['Prego 18 × 27', 'kg', 29, 15.9]] },
  { key: 'estr-conc1', phase: 'estr', cat: 'materiais', title: 'Concreto usinado fck 30 MPa — pilares e vigas do térreo', date: '2025-04-15', lead: 1, supplier: 'ConcreMS Concreto Usinado', pay: 14,
    map: { rivals: ['Mix Concreto Cerrado', 'Concreto Bom Sucesso'], factors: [1.05, 1.08], why: 'Preço registrado em 3 concretagens (térreo, superior e cobertura).' },
    items: [['Concreto usinado fck 30 MPa, slump 12 ± 2 cm', 'm³', 15, 552], ['Bombeamento com lança (diária)', 'diária', 1.0, 1040]] },
  { key: 'estr-laje', phase: 'estr', cat: 'materiais', title: 'Laje pré-moldada treliçada (vigotas e lajotas) — piso superior e cobertura', date: '2025-05-02', lead: 6, supplier: 'Cerâmica Santa Luzia', pay: 21,
    map: { rivals: ['Cerâmica Vale Verde', 'Olaria Rio Pardo'], factors: [1.06, 1.09], why: 'Menor preço com entrega em duas etapas.' },
    items: [['Vigota treliçada TR 12 (por metro)', 'm', 330, 14.9], ['Lajota cerâmica H-12', 'un', 1130, 2.38], ['Malha de aço para capa (tela Q-92)', 'un', 37, 112]] },
  { key: 'estr-conc2', phase: 'estr', cat: 'materiais', title: 'Concreto usinado fck 30 MPa — laje do piso superior', date: '2025-05-14', lead: 1, supplier: 'ConcreMS Concreto Usinado', pay: 14,
    items: [['Concreto usinado fck 30 MPa, slump 12 ± 2 cm', 'm³', 18, 552], ['Bombeamento com lança (diária)', 'diária', 1.0, 1040]] },
  { key: 'estr-agreg', phase: 'estr', cat: 'materiais', title: 'Cimento, areia e brita complementares da estrutura', date: '2025-04-10', lead: 2, supplier: 'Depósito Pantanal Materiais de Construção', pay: 28,
    items: [['Cimento CP II-F-32 (saco 50 kg)', 'saco', 65, 38.2], ['Areia média lavada', 'm³', 10, 140], ['Brita nº 1', 'm³', 7, 148]] },
  { key: 'estr-conc3', phase: 'estr', cat: 'materiais', title: 'Concreto usinado fck 30 MPa — pilares, vigas e laje de cobertura', date: '2025-06-03', lead: 1, supplier: 'ConcreMS Concreto Usinado', pay: 14,
    items: [['Concreto usinado fck 30 MPa, slump 12 ± 2 cm', 'm³', 14, 556], ['Bombeamento com lança (diária)', 'diária', 1.0, 1050]] },
  // ---- Alvenaria
  { key: 'alv-blocos', phase: 'alv', cat: 'materiais', title: 'Blocos cerâmicos, argamassa de assentamento e vergas', date: '2025-05-20', lead: 4, supplier: 'Cerâmica Santa Luzia', pay: 28,
    map: { rivals: ['Cerâmica Vale Verde', 'Olaria Rio Pardo'], factors: [1.05, 1.1], why: 'Melhor preço no milheiro; entrega paletizada em duas cargas.' },
    items: [['Bloco cerâmico de vedação 14 × 19 × 39 cm', 'un', 5250, 2.88], ['Bloco cerâmico de vedação 9 × 19 × 39 cm', 'un', 1600, 2.38], ['Argamassa de assentamento ensacada 20 kg', 'saco', 175, 11.9], ['Verga/contraverga pré-moldada 1,20 m', 'un', 90, 38], ['Cal hidratada CH-III 20 kg', 'saco', 49, 16.5]] },
  { key: 'alv-agreg', phase: 'alv', cat: 'materiais', title: 'Cimento e areia — alvenaria e encunhamento', date: '2025-06-12', lead: 2, supplier: 'Depósito Pantanal Materiais de Construção', pay: 28,
    items: [['Cimento CP II-F-32 (saco 50 kg)', 'saco', 45, 38.4], ['Areia média lavada', 'm³', 12, 142], ['Espuma expansiva de poliuretano p/ encunhamento (lata)', 'un', 18, 38.5]] },
  // ---- Cobertura
  { key: 'cob-telhas', phase: 'cob', cat: 'materiais', title: 'Telhas termoacústicas, cumeeiras, calhas e rufos', date: '2025-07-02', lead: 10, supplier: 'Telhas & Cia MS', pay: 0,
    map: { rivals: ['Perfis Termoacústicos Brasil', 'Cobertura Total Distribuidora'], factors: [1.07, 1.12], why: 'Menor preço global; telha PIR 30 mm com garantia de 10 anos.' },
    items: [['Telha termoacústica sanduíche PIR 30 mm trapezoidal', 'm²', 195, 128], ['Cumeeira termoacústica', 'm', 14, 94], ['Calha e rufo em chapa galvanizada nº 24 (corte 66 cm)', 'm', 37, 86], ['Kit de fixação e vedação (parafusos, fitas e selante)', 'kit', 1.0, 1290]] },
  // ---- Elétrica
  { key: 'ele-infra', phase: 'ele', cat: 'materiais', title: 'Infraestrutura elétrica: eletrodutos, caixas e quadros', date: '2025-07-08', lead: 2, supplier: 'Eletromar Materiais Elétricos', pay: 28,
    map: { rivals: ['Casa da Fiação Elétrica', 'Voltagem Atacado Elétrico'], factors: [1.05, 1.03], pickIndex: 0, why: 'Menor preço global e entrega parcelada conforme a obra.' },
    items: [['Eletroduto corrugado flexível Ø 25 mm (rolo 50 m)', 'rolo', 22, 142], ['Eletroduto corrugado flexível Ø 32 mm (rolo 50 m)', 'rolo', 7, 205], ['Eletroduto rígido roscável Ø 50 mm (barra 3 m)', 'un', 16, 38], ['Caixa de passagem 4×2, 4×4 e octogonal', 'un', 240, 3.7], ['Quadro de distribuição de embutir 36 disjuntores', 'un', 2.0, 845], ['Haste de aterramento 5/8" × 2,4 m com conector', 'un', 5.0, 96], ['Caixa de inspeção de aterramento', 'un', 2.0, 74]] },
  { key: 'ele-cabos', phase: 'ele', cat: 'materiais', title: 'Cabos e fios de cobre (energia e dados)', date: '2025-08-05', lead: 2, supplier: 'Casa da Fiação Elétrica', pay: 21,
    map: { rivals: ['Eletromar Materiais Elétricos', 'Voltagem Atacado Elétrico'], factors: [1.03, 1.06], why: 'Menor preço por rolo e cabos com selo Inmetro.' },
    items: [['Cabo flexível 750 V 2,5 mm² (rolo 100 m)', 'rolo', 13, 285], ['Cabo flexível 750 V 4 mm² (rolo 100 m)', 'rolo', 6.0, 440], ['Cabo flexível 750 V 6 mm² (rolo 100 m)', 'rolo', 4.0, 640], ['Cabo de cobre 10 mm² (por metro)', 'm', 75, 9.4], ['Cabo UTP Cat.6 (caixa 305 m)', 'cx', 3.0, 780], ['Cabo coaxial RG-6 (rolo 100 m)', 'rolo', 1.0, 230]] },
  { key: 'ele-acab', phase: 'ele', cat: 'materiais', title: 'Tomadas, interruptores e disjuntores (linha premium)', date: '2025-09-02', lead: 5, supplier: 'Eletromar Materiais Elétricos', pay: 28,
    map: { rivals: ['Casa da Fiação Elétrica', 'Voltagem Atacado Elétrico'], factors: [1.04, 1.09], why: 'Linha aprovada pela arquiteta com melhor condição comercial.' },
    items: [['Módulo tomada 2P+T 20 A', 'un', 135, 24.9], ['Módulo interruptor simples', 'un', 39, 22.5], ['Módulo interruptor paralelo', 'un', 18, 27], ['Placa 4×2 (3 módulos)', 'un', 100, 17.8], ['Placa 4×4 (6 módulos)', 'un', 25, 26.5], ['Disjuntor DIN monopolar 10–32 A', 'un', 22, 18.7], ['Disjuntor DIN bipolar/tripolar 40–63 A', 'un', 7, 62], ['DR bipolar 40 A / 30 mA', 'un', 4.0, 245], ['DPS classe II 275 V', 'un', 3.0, 138]] },
  // ---- Hidráulica
  { key: 'hid-tubos', phase: 'hid', cat: 'materiais', title: 'Tubos e conexões de água, esgoto e águas pluviais', date: '2025-07-10', lead: 2, supplier: 'HidroForte Tubos e Conexões', pay: 28,
    map: { rivals: ['Tubos Centro-Oeste', 'Hidráulica Pantanal'], factors: [1.05, 1.02], pickIndex: 0, why: 'Menor preço global; linha completa de conexões no mesmo fornecedor.' },
    items: [['Tubo PVC soldável Ø 25 mm (barra 6 m)', 'un', 49, 32.4], ['Tubo PVC soldável Ø 32 mm (barra 6 m)', 'un', 22, 58], ['Tubo PVC soldável Ø 50 mm (barra 6 m)', 'un', 8, 104], ['Tubo PVC esgoto Ø 100 mm (barra 6 m)', 'un', 29, 112], ['Tubo PVC esgoto Ø 50 mm e Ø 40 mm (barra 6 m)', 'un', 35, 54], ['Tubo PPR água quente Ø 25 mm (barra 4 m)', 'un', 18, 46], ['Conexões, joelhos, tês e luvas (lote)', 'lote', 1.0, 1900], ['Registros de gaveta e pressão (lote)', 'lote', 1.0, 1190]] },
  { key: 'hid-reserv', phase: 'hid', cat: 'materiais', title: 'Reservatórios, aquecedor solar, bomba e sistema de esgoto', date: '2025-08-04', lead: 6, supplier: 'HidroForte Tubos e Conexões', pay: 21,
    map: { rivals: ['Tubos Centro-Oeste', 'Hidráulica Pantanal'], factors: [1.06, 1.04], pickIndex: 0, why: 'Equipamentos com garantia de fábrica e entrega única.' },
    items: [['Caixa d’água de polietileno 5.000 L', 'un', 1.0, 3100], ['Sistema de aquecimento solar 500 L com 4 coletores', 'un', 1.0, 7640], ['Pressurizador de água', 'un', 1.0, 980], ['Fossa séptica + filtro anaeróbio + sumidouro pré-moldados', 'conj', 1.0, 4100], ['Caixas de gordura e de inspeção pré-moldadas', 'un', 5.0, 210]] },
  // ---- Reboco
  { key: 'reb-arg', phase: 'reb', cat: 'materiais', title: 'Cimento, cal e areia para chapisco e reboco', date: '2025-07-24', lead: 3, supplier: 'Depósito Pantanal Materiais de Construção', pay: 28,
    map: { rivals: ['Casa do Construtor Campo Grande', 'Areial Rio Pardo Agregados'], factors: [1.04, 1.02], pickIndex: 0, why: 'Menor preço global em pacote cimento + areia + cal.' },
    items: [['Cimento CP II-F-32 (saco 50 kg)', 'saco', 210, 37.8], ['Cal hidratada CH-III 20 kg', 'saco', 60, 16.5], ['Areia média lavada', 'm³', 27, 138], ['Areia fina lavada', 'm³', 14, 142]] },
  { key: 'reb-contrapiso', phase: 'reb', cat: 'materiais', title: 'Cimento e areia para contrapiso', date: '2025-08-28', lead: 2, supplier: 'Depósito Pantanal Materiais de Construção', pay: 28,
    items: [['Cimento CP II-F-32 (saco 50 kg)', 'saco', 100, 38.1], ['Areia média lavada', 'm³', 14, 140], ['Brita nº 0', 'm³', 6.0, 150]] },
  // ---- Pisos e revestimentos
  { key: 'pis-porcelanato', phase: 'pis', cat: 'materiais', title: 'Porcelanato retificado: sala, cozinha, circulação e dormitórios', date: '2025-10-06', lead: 14, supplier: 'Casa de Pisos Cerrado', pay: 30,
    map: { rivals: ['Porcelanatos Mato Grosso do Sul', 'Revestimentos Aurora'], factors: [1.05, 1.08], why: 'Mesmo lote/tonalidade garantido para toda a área e menor preço.' },
    items: [['Porcelanato acetinado retificado 90 × 90 cm (sala, cozinha e circulação)', 'm²', 120, 138], ['Porcelanato amadeirado retificado 60 × 120 cm (dormitórios)', 'm²', 42, 152], ['Rodapé de porcelanato 10 cm', 'm', 100, 18.5], ['Argamassa colante ACIII (saco 20 kg)', 'saco', 170, 28.9], ['Espaçadores e niveladores de piso (kit 500)', 'kit', 4.0, 98]] },
  { key: 'pis-revest', phase: 'pis', cat: 'materiais', title: 'Revestimentos de banheiros, cozinha e lavanderia', date: '2025-10-27', lead: 14, supplier: 'Porcelanatos Mato Grosso do Sul', pay: 28,
    map: { rivals: ['Casa de Pisos Cerrado', 'Revestimentos Aurora'], factors: [1.04, 1.1], pickIndex: 0, why: 'Menor preço dentre os lotes aprovados em amostra.' },
    items: [['Revestimento porcelanato 60 × 60 cm — banheiros e lavabos', 'm²', 90, 82], ['Revestimento 3D 30 × 90 cm — cozinha gourmet', 'm²', 18, 124], ['Porcelanato antiderrapante 60 × 60 cm — áreas molhadas', 'm²', 37, 79], ['Argamassa colante ACIII (saco 20 kg)', 'saco', 100, 28.9], ['Rejunte epóxi (kg)', 'kg', 34, 74], ['Perfis de acabamento em alumínio', 'm', 65, 9.8]] },
  { key: 'pis-bancadas', phase: 'pis', cat: 'materiais', title: 'Bancadas e soleiras: quartzo e granito', date: '2025-11-17', lead: 15, supplier: 'Mármores e Granitos Pantanal', pay: 0,
    map: { rivals: ['Pedras Serra Azul', 'Granitos & Quartzo Brasil'], factors: [1.06, 1.09], why: 'Melhor preço no m² do quartzo e prazo de 15 dias.' },
    items: [['Quartzo branco 2 cm (cozinha e ilha)', 'm²', 4.3, 1690], ['Granito São Gabriel polido (banheiros, lavabos e lavanderia)', 'm²', 8, 640], ['Soleiras e peitoris em granito', 'm', 32, 96], ['Cubas esculpidas em quartzo', 'un', 1.0, 860], ['Frontões, saias e rodabancas (execução)', 'm', 19, 120]] },
  // ---- Pintura
  { key: 'pin-tintas', phase: 'pin', cat: 'materiais', title: 'Tintas, selador e massas — pintura interna e externa', date: '2025-11-19', lead: 2, supplier: 'Tintas Arco-Íris Distribuidora', pay: 21,
    map: { rivals: ['Casa das Tintas Campo Grande', 'Cor & Cia Tintas'], factors: [1.05, 1.03], pickIndex: 0, why: 'Menor preço com 6% de desconto por volume.' },
    items: [['Tinta acrílica premium fosca branco neve (18 L)', 'balde', 8, 489], ['Tinta acrílica para fachada (18 L)', 'balde', 6.0, 512], ['Selador acrílico (18 L)', 'balde', 6.0, 218], ['Massa corrida PVA (25 kg)', 'balde', 11, 108], ['Massa acrílica para fachada (25 kg)', 'balde', 7.0, 124], ['Textura acrílica grafiato (25 kg)', 'balde', 5.0, 168], ['Lixas, fita crepe, lona e rolos (kit)', 'kit', 1.0, 950]] },
  { key: 'pin-verniz', phase: 'pin', cat: 'materiais', title: 'Verniz e esmalte — portas, deck e esquadrias de madeira', date: '2026-01-19', lead: 2, supplier: 'Casa das Tintas Campo Grande', pay: 14,
    items: [['Verniz PU fosco (3,6 L)', 'galão', 6.0, 342], ['Esmalte sintético acetinado (3,6 L)', 'galão', 5.0, 205], ['Thinner/aguarrás e solventes (lote)', 'lote', 1.0, 370]] },
  // ---- Louças e metais
  { key: 'mar-loucas', phase: 'mar', cat: 'materiais', title: 'Louças sanitárias, cubas, chuveiros e metais', date: '2026-01-12', lead: 20, supplier: 'Louças e Metais Premium', pay: 28,
    map: { rivals: ['Banho & Cozinha Design', 'Casa do Banheiro Cerrado'], factors: [1.05, 1.07], why: 'Mesma linha aprovada, menor preço global e entrega única.' },
    items: [['Bacia sanitária com caixa acoplada — linha premium', 'un', 4.0, 1180], ['Cuba de apoio de louça para lavatório', 'un', 4.0, 690], ['Chuveiro de embutir com ducha manual', 'un', 3.0, 1540], ['Misturador monocomando para lavatório (bica alta)', 'un', 4.0, 890], ['Torneira gourmet para cozinha com ducha', 'un', 1.0, 1160], ['Acabamento de registro (linha premium)', 'un', 6.0, 365], ['Ducha higiênica com registro', 'un', 4.0, 240], ['Kit de acessórios de banheiro (5 peças)', 'kit', 3.0, 460]] },
  // ---- Instalações especiais / iluminação
  { key: 'esp-ilum', phase: 'esp', cat: 'materiais', title: 'Iluminação técnica: spots, perfis LED e drivers', date: '2025-11-18', lead: 18, supplier: 'Lume Design Iluminação', pay: 28,
    map: { rivals: ['Luz & Forma Iluminação', 'Estúdio Lumina'], factors: [1.06, 1.1], why: 'Especificação do projeto luminotécnico com menor preço global.' },
    items: [['Spot LED de embutir 7 W 3000 K (dicroico)', 'un', 60, 38.9], ['Perfil de alumínio de embutir + fita LED 24 V (por metro)', 'm', 45, 78], ['Fonte/driver 24 V 100 W', 'un', 7.0, 96], ['Refletor de jardim LED 10 W', 'un', 8, 128], ['Balizador externo LED', 'un', 8, 94]] },
  { key: 'esp-lum-dec', phase: 'esp', cat: 'decoracao', title: 'Luminárias decorativas (pendentes e arandelas)', date: '2025-12-04', lead: 18, supplier: 'Lume Design Iluminação', pay: 28,
    map: { rivals: ['Luz & Forma Iluminação', 'Estúdio Lumina'], factors: [1.08, 1.11], why: 'Peças idênticas ao projeto de interiores com menor preço.' },
    items: [['Pendente de sala de jantar (3 globos em vidro fumê)', 'un', 1.0, 3100], ['Pendente de cozinha — ilha', 'un', 2.0, 1280], ['Arandela externa de fachada em alumínio', 'un', 4.0, 395], ['Luminária de mesa/piso para living', 'un', 2.0, 890]] },
  // ---- Área externa
  { key: 'ext-pedras', phase: 'ext', cat: 'materiais', title: 'Pedras, deck de madeira, grama e terra vegetal', date: '2026-01-20', lead: 10, supplier: 'Jardim Nobre Pedras e Paisagismo', pay: 14,
    map: { rivals: ['Pedras Naturais do Cerrado', 'Madeiras do Cerrado Decks'], factors: [1.07, 1.12], why: 'Pacote completo (pedra, deck, grama e terra) com entrega única.' },
    items: [['Pedra São Tomé 40 × 40 cm — calçadas e jardim', 'm²', 57, 84], ['Deck de madeira cumaru 2,8 cm (inclui vigas e fixação)', 'm²', 18, 410], ['Grama esmeralda em placas', 'm²', 85, 12.5], ['Terra vegetal adubada', 'm³', 18, 96], ['Seixo rolado branco decorativo', 'm³', 4.0, 310]] },
  { key: 'ext-calcada', phase: 'ext', cat: 'materiais', title: 'Cimento, areia e meio-fio para calçadas e muro frontal', date: '2025-11-05', lead: 2, supplier: 'Depósito Pantanal Materiais de Construção', pay: 28,
    items: [['Cimento CP II-F-32 (saco 50 kg)', 'saco', 44, 38.4], ['Areia média lavada', 'm³', 8, 142], ['Brita nº 1', 'm³', 6.0, 148], ['Meio-fio pré-moldado de concreto', 'un', 40, 24.5], ['Bloco de concreto estrutural 14 × 19 × 39 cm (muro)', 'un', 270, 5.4]] },
  // ---- Entrega
  { key: 'ent-retoques', phase: 'ent', cat: 'materiais', title: 'Materiais de retoque e acabamento final', date: '2026-03-17', lead: 1, supplier: 'Casa do Construtor Campo Grande', pay: 0,
    items: [['Kit de retoque de pintura (tintas e acessórios)', 'kit', 1.0, 640], ['Silicone neutro e selantes (lote)', 'lote', 1.0, 480], ['Rejunte, parafusos e fixadores (lote)', 'lote', 1.0, 390]] },
  // ---- Compras avulsas / urgências (pequenas)
  { key: 'avulsa-1', phase: 'fund', cat: 'materiais', title: 'Compra avulsa: discos de corte, brocas e mangueiras', date: '2025-03-12', lead: 0, supplier: 'Casa do Construtor Campo Grande', pay: 0,
    items: [['Disco de corte diamantado e abrasivos (lote)', 'lote', 1.0, 580], ['Brocas SDS e ponteiras (kit)', 'kit', 2.0, 318], ['Mangueira de nível e trena de 30 m', 'kit', 1.0, 200]] },
  { key: 'avulsa-2', phase: 'estr', cat: 'materiais', title: 'Compra avulsa: lonas de cobertura e escoras', date: '2025-05-27', lead: 0, supplier: 'Casa do Construtor Campo Grande', pay: 0,
    items: [['Lona plástica preta 4 × 50 m (cura e proteção)', 'rolo', 3.0, 310], ['Escora metálica regulável 3 m (locação complementar adquirida)', 'un', 8, 148]] },
  { key: 'avulsa-3', phase: 'alv', cat: 'materiais', title: 'Compra avulsa: ferramentas de alvenaria e fio de prumo', date: '2025-06-03', lead: 0, supplier: 'Casa do Construtor Campo Grande', pay: 0,
    items: [['Carro de mão reforçado e andaime tubular auxiliar', 'kit', 2.0, 520], ['Prumo de face, linha e esquadro (kit)', 'kit', 2.0, 142]] },
  { key: 'avulsa-4', phase: 'reb', cat: 'materiais', title: 'Compra avulsa: desempenadeiras, réguas e telas', date: '2025-08-12', lead: 0, supplier: 'Depósito Pantanal Materiais de Construção', pay: 0,
    items: [['Régua de alumínio 2 m e desempenadeiras (lote)', 'lote', 1.0, 670], ['Tela de fachada/estuque galvanizada (rolo)', 'rolo', 3.0, 235], ['Aditivo adesivo para chapisco (galão 18 L)', 'un', 2.0, 312]] },
  { key: 'avulsa-5', phase: 'ele', cat: 'materiais', title: 'Compra avulsa: fita isolante, conectores e terminais', date: '2025-08-26', lead: 0, supplier: 'Eletromar Materiais Elétricos', pay: 0,
    items: [['Fita isolante, conectores e terminais (lote)', 'lote', 1.0, 590], ['Quadro de medição extra e DPS complementar', 'kit', 1.0, 550]] },
  { key: 'avulsa-6', phase: 'pis', cat: 'materiais', title: 'Compra avulsa: ferramentas de assentamento', date: '2025-10-15', lead: 0, supplier: 'Casa do Construtor Campo Grande', pay: 0,
    items: [['Cortadora de porcelanato manual 120 cm', 'un', 1.0, 1020], ['Ventosas, desempenadeiras dentadas e carrinho de transporte (kit)', 'kit', 1.0, 690]] },
  { key: 'avulsa-7', phase: 'esq', cat: 'materiais', title: 'Compra avulsa: silicone estrutural e calços', date: '2025-11-05', lead: 0, supplier: 'Depósito Pantanal Materiais de Construção', pay: 0,
    items: [['Silicone neutro e fita de vedação (lote)', 'lote', 1.0, 770], ['Calços de borracha e espuma de polietileno (lote)', 'lote', 1.0, 270]] },
  { key: 'avulsa-8', phase: 'pin', cat: 'materiais', title: 'Compra avulsa: andaime fachadeiro — acessórios', date: '2025-12-09', lead: 0, supplier: 'Casa do Construtor Campo Grande', pay: 0,
    items: [['Pranchas, travas e sapatas para andaime (lote)', 'lote', 1.0, 930]] },
  // ---- Decoração (compras diretas)
  { key: 'dec-persianas', phase: 'mar', cat: 'decoracao', title: 'Persianas e cortinas (sala, suítes e escritório)', date: '2026-02-03', lead: 20, supplier: 'Persianas & Cortinas Studio', pay: 0,
    items: [['Persiana rolô blackout motorizada — dormitórios', 'm²', 8, 520], ['Cortina em voal com trilho embutido — sala e jantar', 'm²', 12, 210], ['Persiana rolô tela solar — escritório e cozinha', 'm²', 6.1, 380], ['Instalação e motores adicionais', 'serv', 1.0, 920]] },
  { key: 'dec-espelhos', phase: 'mar', cat: 'decoracao', title: 'Espelhos sob medida (banheiros, closet e hall)', date: '2026-02-12', lead: 10, supplier: 'Espelhos Reflex Vidraçaria', pay: 0,
    items: [['Espelho lapidado 6 mm sob medida', 'm²', 9, 235], ['Espelho com moldura de alumínio e LED (suítes)', 'un', 2.0, 640], ['Instalação e fixação', 'serv', 1.0, 250]] },
];

// ---------------------------------------------------------------------------
// Despesas diversas (taxas, projetos complementares, locações, honorários, seguros)
// ---------------------------------------------------------------------------

export interface ExpenseDef {
  date: string; supplier: string; description: string; value: number;
  cat: 'taxas' | 'projetos_complementares' | 'outros' | 'decoracao';
  phase: PhaseKey; notes?: string; invoice?: string;
}

export const EXPENSES: ExpenseDef[] = [
  // Projetos complementares
  { date: '2025-01-07', supplier: 'GeoSolo Sondagens Ltda', description: 'Sondagem de solo tipo SPT — 3 furos e relatório geotécnico', value: 4650, cat: 'projetos_complementares', phase: 'prel', notes: 'Relatório com recomendação de fundação em estacas tipo broca.', invoice: 'NFS-e 1184' },
  { date: '2025-01-15', supplier: 'Cálculo Estrutural Rocha & Associados', description: 'Projeto estrutural completo — 1ª parcela (50%)', value: 7250, cat: 'projetos_complementares', phase: 'prel', invoice: 'NFS-e 0731' },
  { date: '2025-02-12', supplier: 'Cálculo Estrutural Rocha & Associados', description: 'Projeto estrutural completo — parcela final (50%)', value: 7250, cat: 'projetos_complementares', phase: 'prel', invoice: 'NFS-e 0752' },
  { date: '2025-01-20', supplier: 'Projetos Hidro MS', description: 'Projeto de instalações hidrossanitárias, gás e águas pluviais', value: 6300, cat: 'projetos_complementares', phase: 'prel', invoice: 'NFS-e 0342' },
  { date: '2025-01-20', supplier: 'Eletroprojetos Sul', description: 'Projeto elétrico, SPDA e cabeamento estruturado', value: 7200, cat: 'projetos_complementares', phase: 'prel', invoice: 'NFS-e 0919' },
  { date: '2025-04-22', supplier: 'Clima Projetos de Climatização', description: 'Projeto de climatização e carga térmica', value: 3900, cat: 'projetos_complementares', phase: 'prel', invoice: 'NFS-e 0207' },
  { date: '2025-06-10', supplier: 'Lume Estúdio de Iluminação', description: 'Projeto luminotécnico (interno e externo)', value: 5400, cat: 'projetos_complementares', phase: 'esp', invoice: 'NFS-e 0465' },
  { date: '2025-07-15', supplier: 'Verde Vivo Paisagismo', description: 'Projeto paisagístico e de irrigação', value: 6800, cat: 'projetos_complementares', phase: 'ext', invoice: 'NFS-e 0118' },
  // Taxas e licenças
  { date: '2025-01-09', supplier: 'Prefeitura de Campo Grande — SEMADUR', description: 'Taxa de análise e aprovação do projeto arquitetônico', value: 1846.2, cat: 'taxas', phase: 'prel', notes: 'Processo de aprovação protocolado em 09/01/2025.' },
  { date: '2025-01-24', supplier: 'Prefeitura de Campo Grande — SEMADUR', description: 'Alvará de construção (250 m²)', value: 3912.4, cat: 'taxas', phase: 'prel' },
  { date: '2025-01-10', supplier: 'CAU/MS', description: 'RRT de projeto e de execução/gerenciamento da obra', value: 233.32, cat: 'taxas', phase: 'prel' },
  { date: '2025-02-04', supplier: 'Energisa MS', description: 'Ligação provisória de energia (padrão de obra)', value: 612.8, cat: 'taxas', phase: 'prel' },
  { date: '2025-02-04', supplier: 'Águas Guariroba', description: 'Ligação provisória de água', value: 438.5, cat: 'taxas', phase: 'prel' },
  { date: '2025-09-22', supplier: 'Energisa MS', description: 'Ligação definitiva de energia — padrão bifásico', value: 2340, cat: 'taxas', phase: 'ele' },
  { date: '2025-12-12', supplier: 'Águas Guariroba', description: 'Ligação definitiva de água e esgoto', value: 1980.3, cat: 'taxas', phase: 'hid' },
  { date: '2025-09-30', supplier: 'Receita Federal — DARF (CNO)', description: 'Contribuição previdenciária da obra (CNO) — competências 02 a 08/2025', value: 7820.17, cat: 'taxas', phase: 'adm', notes: 'Apurada via DCTFWeb com base nas notas de mão de obra.' },
  { date: '2026-03-27', supplier: 'Receita Federal — DARF (CNO)', description: 'Contribuição previdenciária da obra (CNO) — competências 09/2025 a 03/2026', value: 8968.55, cat: 'taxas', phase: 'adm', notes: 'Regularização para emissão da CND e do habite-se.' },
  { date: '2026-03-10', supplier: 'Prefeitura de Campo Grande — SEMADUR', description: 'Taxa de vistoria e certidão de conclusão (habite-se)', value: 1215.6, cat: 'taxas', phase: 'ent' },
  { date: '2026-03-24', supplier: '2º Cartório de Registro de Imóveis', description: 'Averbação da construção na matrícula (emolumentos)', value: 4870, cat: 'taxas', phase: 'ent' },
  // Outros: seguros, topografia, locações, caçambas
  { date: '2025-01-17', supplier: 'Porto Pantanal Seguros', description: 'Seguro de risco de engenharia da obra (vigência 15 meses)', value: 2480, cat: 'outros', phase: 'prel', invoice: 'Apólice 0098213' },
  { date: '2025-01-28', supplier: 'Topografia Ponto Fixo', description: 'Levantamento planialtimétrico e locação dos eixos da obra', value: 3800, cat: 'outros', phase: 'terra', invoice: 'NFS-e 0562' },
  { date: '2025-02-24', supplier: 'Disk Caçamba MS', description: 'Caçamba de entulho 5 m³ — limpeza do terreno', value: 480, cat: 'outros', phase: 'prel' },
  { date: '2025-05-20', supplier: 'Disk Caçamba MS', description: 'Caçambas de entulho 5 m³ (2 un) — fôrmas e sobras', value: 960, cat: 'outros', phase: 'estr' },
  { date: '2025-08-04', supplier: 'Disk Caçamba MS', description: 'Caçambas de entulho 5 m³ (3 un) — alvenaria e cobertura', value: 1440, cat: 'outros', phase: 'alv' },
  { date: '2025-10-02', supplier: 'Disk Caçamba MS', description: 'Caçambas de entulho 5 m³ (2,5 un) — reboco e contrapiso', value: 1200, cat: 'outros', phase: 'reb' },
  { date: '2025-12-04', supplier: 'Disk Caçamba MS', description: 'Caçambas de entulho 5 m³ (3 un) — esquadrias e pisos', value: 1440, cat: 'outros', phase: 'pis' },
  { date: '2026-02-20', supplier: 'Disk Caçamba MS', description: 'Caçambas de entulho 5 m³ (2 un) — pintura e marcenaria', value: 960, cat: 'outros', phase: 'pin' },
  { date: '2026-03-30', supplier: 'Disk Caçamba MS', description: 'Caçambas de entulho 5 m³ (3 un) — limpeza final', value: 1440, cat: 'outros', phase: 'ent' },
  { date: '2025-03-14', supplier: 'Locamais Equipamentos', description: 'Locação de betoneira, vibrador de imersão e serra mármore (30 dias)', value: 1380, cat: 'outros', phase: 'fund' },
  { date: '2025-05-06', supplier: 'Locamais Equipamentos', description: 'Locação de vibrador, serra circular e compactador (30 dias)', value: 1650, cat: 'outros', phase: 'estr' },
  { date: '2025-04-10', supplier: 'Andaimes Centro-Oeste Locações', description: 'Locação de andaimes e escoras metálicas — abril/2025', value: 2860, cat: 'outros', phase: 'estr' },
  { date: '2025-05-12', supplier: 'Andaimes Centro-Oeste Locações', description: 'Locação de andaimes e escoras metálicas — maio/2025', value: 2860, cat: 'outros', phase: 'estr' },
  { date: '2025-06-10', supplier: 'Andaimes Centro-Oeste Locações', description: 'Locação de andaimes e escoras metálicas — junho/2025', value: 2860, cat: 'outros', phase: 'estr' },
  { date: '2025-07-10', supplier: 'Andaimes Centro-Oeste Locações', description: 'Locação de andaimes — julho/2025 (alvenaria e cobertura)', value: 3400, cat: 'outros', phase: 'cob' },
  { date: '2025-12-10', supplier: 'Andaimes Centro-Oeste Locações', description: 'Locação de andaime fachadeiro — dezembro/2025', value: 3100, cat: 'outros', phase: 'pin' },
  { date: '2026-01-12', supplier: 'Andaimes Centro-Oeste Locações', description: 'Locação de andaime fachadeiro — janeiro/2026', value: 3100, cat: 'outros', phase: 'pin' },
  { date: '2026-02-10', supplier: 'Andaimes Centro-Oeste Locações', description: 'Locação de andaime fachadeiro — fevereiro/2026', value: 2400, cat: 'outros', phase: 'pin' },
];

/** Honorários de gerenciamento (Chaves Brites Correa) — um lançamento por mês de obra. */
export const MANAGEMENT_FEE_MONTHLY = 2900;
export const MANAGEMENT_SUPPLIER = 'Chaves Brites Correa Arquitetura e Construção';

// ---------------------------------------------------------------------------
// Licenças e etapas regulatórias, documentos e pendências de entrega
// ---------------------------------------------------------------------------

export const REGULATORY = [
  { name: 'Aprovação do projeto arquitetônico — Prefeitura de Campo Grande (SEMADUR)', status: 'Emitido', date: '2025-01-22', notes: 'Processo aprovado sem exigências. Projeto aprovado nº 0187/2025.' },
  { name: 'Alvará de construção', status: 'Emitido', date: '2025-01-31', notes: 'Alvará de construção para residência unifamiliar de 250 m². Válido por 24 meses.' },
  { name: 'Aprovação do projeto na associação de moradores do condomínio', status: 'Emitido', date: '2025-01-15', notes: 'Aprovado pela comissão de arquitetura do Condomínio Vale dos Ipês.' },
  { name: 'RRT de projeto e execução — CAU/MS', status: 'Emitido', date: '2025-01-10', notes: 'RRT de projeto arquitetônico, interiores e gerenciamento da obra.' },
  { name: 'Cadastro da obra no CNO (Receita Federal)', status: 'Emitido', date: '2025-01-27', notes: 'CNO da obra emitido para apuração de INSS e eSocial.' },
  { name: 'Ligação provisória de energia — Energisa MS', status: 'Emitido', date: '2025-02-06', notes: 'Padrão de obra instalado e ligado.' },
  { name: 'Ligação definitiva de energia — Energisa MS', status: 'Emitido', date: '2025-09-26', notes: 'Padrão bifásico instalado e vistoriado.' },
  { name: 'Ligação definitiva de água e esgoto — Águas Guariroba', status: 'Emitido', date: '2025-12-16', notes: 'Hidrômetro instalado e ligação de esgoto vistoriada.' },
  { name: 'Certidão Negativa de Débitos (CND) da obra — Receita Federal', status: 'Emitido', date: '2026-03-30', notes: 'Emitida após regularização das contribuições previdenciárias.' },
  { name: 'Habite-se / Certidão de conclusão da obra — SEMADUR', status: 'Emitido', date: '2026-03-20', notes: 'Vistoria realizada em 12/03/2026, seis dias após a entrega da obra. Certidão emitida sem exigências.' },
];

export interface DocDef { name: string; description: string; class: 'administrativo' | 'planejamento' | 'acompanhamento'; fileName: string; date: string; status: 'desenvolvimento' | 'revisao' | 'aprovado'; category?: string }
export const DOCUMENTS: DocDef[] = [
  { name: 'Contrato de Gerenciamento de Obra', description: 'Contrato assinado com honorários mensais, escopo de gerenciamento e prazo de 15 meses (até 31/03/2026).', class: 'administrativo', fileName: 'contrato_gerenciamento_obra_albuquerque.pdf', date: '2025-01-03', status: 'aprovado', category: 'contrato' },
  { name: 'Alvará de Construção', description: 'Alvará de construção residencial unifamiliar — 250 m².', class: 'administrativo', fileName: 'alvara_construcao_0187_2025.pdf', date: '2025-01-31', status: 'aprovado', category: 'alvara' },
  { name: 'RRT de Projeto e Execução (CAU/MS)', description: 'Registro de responsabilidade técnica de projeto, interiores e gerenciamento.', class: 'administrativo', fileName: 'rrt_projeto_execucao.pdf', date: '2025-01-10', status: 'aprovado', category: 'rrt' },
  { name: 'Matrícula do Imóvel e Certidões', description: 'Matrícula atualizada, certidões negativas e comprovante de propriedade do lote.', class: 'administrativo', fileName: 'matricula_lote_certidoes.pdf', date: '2025-01-06', status: 'aprovado' },
  { name: 'Apólice do Seguro de Risco de Engenharia', description: 'Cobertura de danos materiais e responsabilidade civil durante a obra.', class: 'administrativo', fileName: 'apolice_risco_engenharia.pdf', date: '2025-01-17', status: 'aprovado' },
  { name: 'Habite-se e CND da Obra', description: 'Certidão de conclusão e Certidão Negativa de Débitos previdenciários.', class: 'administrativo', fileName: 'habitese_cnd_obra.pdf', date: '2026-03-30', status: 'aprovado', category: 'alvara' },
  { name: 'Projeto Arquitetônico Executivo', description: 'Plantas, cortes, fachadas e detalhamentos — revisão R04 aprovada pelo cliente.', class: 'planejamento', fileName: 'projeto_arquitetonico_executivo_R04.pdf', date: '2025-01-08', status: 'aprovado' },
  { name: 'Projeto Estrutural', description: 'Fundações, fôrmas, armação e memorial de cálculo (estacas tipo broca).', class: 'planejamento', fileName: 'projeto_estrutural_completo.pdf', date: '2025-02-12', status: 'aprovado' },
  { name: 'Projetos de Instalações (Elétrico, Hidrossanitário e Climatização)', description: 'Projetos compatibilizados em BIM com a arquitetura e a estrutura.', class: 'planejamento', fileName: 'projetos_instalacoes_compatibilizados.pdf', date: '2025-02-03', status: 'aprovado' },
  { name: 'Projeto de Interiores e Marcenaria', description: 'Layouts, detalhamento de marcenaria, paginação de pisos e especificações de acabamentos.', class: 'planejamento', fileName: 'projeto_interiores_marcenaria.pdf', date: '2025-06-20', status: 'aprovado' },
  { name: 'Projeto Luminotécnico e Paisagístico', description: 'Pontos de luz, cenas de automação e projeto de jardim e irrigação.', class: 'planejamento', fileName: 'projeto_luminotecnico_paisagismo.pdf', date: '2025-07-15', status: 'aprovado' },
  { name: 'Orçamento Executivo e Cronograma Físico-Financeiro', description: 'Orçamento de R$ 1,2 milhão por etapas, cronograma de 15 meses e curva S.', class: 'planejamento', fileName: 'orcamento_cronograma_fisico_financeiro.xlsx', date: '2025-01-05', status: 'aprovado' },
  { name: 'Especificações Técnicas de Materiais e Acabamentos', description: 'Memorial descritivo com marcas, modelos e padrões aprovados pelo cliente.', class: 'planejamento', fileName: 'especificacoes_materiais_acabamentos.pdf', date: '2025-03-10', status: 'aprovado' },
  { name: 'Ata nº 01 — Reunião de Início de Obra', description: 'Definição de prazos, canais de comunicação, responsáveis e regras de segurança.', class: 'acompanhamento', fileName: 'ata_01_inicio_obra.pdf', date: '2025-01-06', status: 'aprovado' },
  { name: 'Relatório Fotográfico — Fundações e Estrutura', description: 'Registro das concretagens de blocos, baldrames, pilares e lajes.', class: 'acompanhamento', fileName: 'relatorio_fotografico_fundacao_estrutura.pdf', date: '2025-06-16', status: 'aprovado' },
  { name: 'Laudos de Rompimento de Concreto (fck 30 MPa)', description: 'Resultados dos corpos de prova aos 7 e 28 dias — todos acima do fck especificado.', class: 'acompanhamento', fileName: 'laudos_rompimento_concreto.pdf', date: '2025-07-04', status: 'aprovado' },
  { name: 'Ata nº 08 — Aprovação de Amostras de Acabamentos', description: 'Aprovação de porcelanatos, bancadas, tintas e louças pelo cliente.', class: 'acompanhamento', fileName: 'ata_08_aprovacao_amostras.pdf', date: '2025-09-26', status: 'aprovado' },
  { name: 'Relatório de Teste de Estanqueidade (Hidráulica)', description: 'Teste de pressão em todas as redes de água fria e quente — sem vazamentos.', class: 'acompanhamento', fileName: 'relatorio_teste_estanqueidade.pdf', date: '2025-08-29', status: 'aprovado' },
  { name: 'Relatório de Teste de Lâmina d’Água (Impermeabilização)', description: 'Teste de 72 horas nas áreas molhadas e terraço — aprovado.', class: 'acompanhamento', fileName: 'relatorio_teste_impermeabilizacao.pdf', date: '2025-09-02', status: 'aprovado' },
  { name: 'Checklist de Vistoria de Entrega', description: 'Vistoria final com o cliente: pendências identificadas e corrigidas.', class: 'acompanhamento', fileName: 'checklist_vistoria_entrega.pdf', date: '2026-03-05', status: 'aprovado' },
  { name: 'Manual do Proprietário e Pastas As-Built', description: 'Manual de uso, manutenção preventiva, garantias e projetos conforme construído.', class: 'acompanhamento', fileName: 'manual_proprietario_as_built.pdf', date: '2026-03-06', status: 'aprovado' },
];

export const PUNCH_LIST = [
  { task: 'Ajuste de rejunte nas bordas do box do banheiro da suíte master', priority: 'Baixa' },
  { task: 'Regulagem das portas de correr da sala e fechos das janelas dos dormitórios', priority: 'Média' },
  { task: 'Retoque de pintura na parede do hall de entrada (marcas de transporte)', priority: 'Baixa' },
  { task: 'Revisão da vedação de silicone nos guarda-corpos de vidro da varanda', priority: 'Alta' },
  { task: 'Nivelamento da porta do closet da suíte 2 (marcenaria)', priority: 'Média' },
  { task: 'Troca de peça de porcelanato com microtrinca na circulação do superior', priority: 'Alta' },
  { task: 'Ajuste do caimento do ralo da área gourmet', priority: 'Alta' },
  { task: 'Programação final das cenas de iluminação e treinamento do aplicativo', priority: 'Média' },
  { task: 'Instalação dos espelhos das tomadas da lavanderia', priority: 'Baixa' },
  { task: 'Teste de pressão do aquecedor solar e regulagem do termostato', priority: 'Média' },
  { task: 'Limpeza dos drenos das condensadoras e fixação das tubulações externas', priority: 'Baixa' },
  { task: 'Plantio complementar de forrações na lateral do jardim', priority: 'Baixa' },
  { task: 'Retoque de cantos em pintura da fachada (andaime)', priority: 'Média' },
  { task: 'Entrega dos manuais, certificados de garantia e chaves reserva', priority: 'Alta' },
];

// Dias não trabalhados por feriado (reais do calendário de Campo Grande/MS em 2025–2026).
export const HOLIDAYS: Record<string, string> = {
  '2025-01-01': 'Confraternização Universal',
  '2025-03-03': 'Carnaval',
  '2025-03-04': 'Carnaval',
  '2025-03-05': 'Quarta-feira de Cinzas (meio período)',
  '2025-04-18': 'Sexta-feira Santa',
  '2025-04-21': 'Tiradentes',
  '2025-05-01': 'Dia do Trabalho',
  '2025-06-19': 'Corpus Christi',
  '2025-08-26': 'Aniversário de Campo Grande',
  '2025-11-20': 'Consciência Negra',
  '2025-12-24': 'Recesso de fim de ano',
  '2025-12-25': 'Natal',
  '2025-12-26': 'Recesso de fim de ano',
  '2025-12-29': 'Recesso de fim de ano',
  '2025-12-30': 'Recesso de fim de ano',
  '2025-12-31': 'Recesso de fim de ano',
  '2026-01-01': 'Confraternização Universal',
  '2026-01-02': 'Recesso de fim de ano',
  '2026-02-16': 'Carnaval',
  '2026-02-17': 'Carnaval',
};
