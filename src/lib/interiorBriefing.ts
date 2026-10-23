// src/lib/interiorBriefing.ts
//
// Briefing de INTERIORES — liberado ao cliente quando a etapa "Concepção de
// Interiores" sai de 'bloqueada'. Diferente dos briefings de texto livre, este é
// estruturado: contadores, escolhas visuais, jogo de estilo e medidas. Com isso o
// sistema consegue calcular o perfil de estilo, pré-dimensionar a marcenaria e
// apontar incompatibilidades para a equipe antes do estudo preliminar.
//
// Este módulo é puro (sem React): tipos, catálogo, montagem dos blocos a partir
// dos ambientes do projeto e cálculos. A tela fica em components/InteriorBriefing.

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export type DormType = 'casal' | 'solteiro' | 'infantil' | 'hospedes';
export type BedId = 'solteiro' | 'solteiro_king' | 'casal' | 'queen' | 'king';
export type BaseId = 'box' | 'bau' | 'marcenaria';
export type KidBedId = 'comum' | 'evolutiva' | 'bicama' | 'beliche';
export type Vote = -2 | 0 | 2;

export interface IBDorm { id: string; name: string; type: DormType }

/** Ambientes do projeto, definidos pela equipe ao liberar a etapa. */
export interface IBConfig {
  sala: boolean;
  jantar: boolean;
  cozinha: boolean;
  escritorio: boolean;
  banheiros: boolean;       // marcenaria e bancada de banheiros
  gourmet: boolean;         // área gourmet
  dorms: IBDorm[];
  confirmed?: boolean;      // a equipe revisou os ambientes
}

export interface IBDormAnswer { bed: BedId; base: BaseId; mattressCm: number; kidBed?: KidBedId }

export interface WardrobeCounts {
  curto: number; longo: number; calcas: number; dobradas: number; sapatos: number; bolsas: number;
}

export type Voltage = '127' | '220' | 'bivolt' | '';
/** Equipamento da cozinha. `custom` = incluído pelo cliente fora da lista (usa `label`). */
export interface IBKitchenItem { id: string; label?: string; custom?: boolean; model: string; unknown: boolean; voltage?: Voltage }

export type FinishArea = 'cozinha' | 'banheiro' | 'gourmet';
/** Preferências de marcenaria e pedra de um ambiente. */
export interface IBFinish { cabinet: string; stone: string; stoneFinish: string; combo: string }

export interface IBAnswers {
  adults: number; kids: number; elders: number;
  pets: string[]; habits: string[];
  votes: Record<string, Vote>;
  tvInches: number; tvDistM: number; tvExtras: string[];
  dinnerDaily: number; dinnerParty: number; dinnerShape: 'retangular' | 'redonda' | 'indiferente';
  kitchen: IBKitchenItem[]; smallAppliances: string[]; houseVoltage: Voltage;
  finishes: Partial<Record<FinishArea, IBFinish>>;
  dorms: Record<string, IBDormAnswer>;
  office: { people: number; monitors: number; use: string[]; items: string[] };
  wardrobe: { p1: WardrobeCounts; p2: WardrobeCounts; p1Name: string; p2Name: string };
  keep: string;          // o que vai ficar (móveis, objetos, obras)
  notes: string;         // observações livres
  priorities: string[];  // ordem das prioridades (ids de PRIORITY_OPTIONS)
  refs: Record<string, string[]>; // referências marcadas por bloco/ambiente (ids de ROOM_REFS)
}

export interface InteriorBriefingData {
  config: IBConfig;
  answers: IBAnswers;
  done: Record<string, boolean>;   // blocos concluídos (chave do bloco)
  status: 'rascunho' | 'enviado';
  submittedAt?: string;
  submittedBy?: string;
  reopenedAt?: string;
  updatedAt?: string;
}

// ---------------------------------------------------------------------------
// Catálogo
// ---------------------------------------------------------------------------

export const ACCEPT_TEXT = 'Confirmo que as respostas refletem a rotina e o gosto da nossa família.';

export const STYLES: Record<string, { name: string; desc: string }> = {
  japandi: { name: 'Japandi', desc: 'Calma, madeira clara, tons terrosos e poucos objetos bem escolhidos.' },
  modernobr: { name: 'Moderno brasileiro', desc: 'Madeira maciça, couro, palhinha e design de autor com história.' },
  industrial: { name: 'Industrial', desc: 'Cimento, metal preto e materiais aparentes, com atitude urbana.' },
  escandinavo: { name: 'Escandinavo', desc: 'Luz, branco, madeira clara e aconchego funcional.' },
  classico: { name: 'Clássico', desc: 'Molduras, simetria, metais nobres e elegância atemporal.' },
  tropical: { name: 'Tropical contemporâneo', desc: 'Plantas, fibras e madeira, com a casa aberta para fora.' },
  rustico: { name: 'Rústico contemporâneo', desc: 'Pedra, madeira e fibras naturais com acabamento atual.' },
  minimal: { name: 'Minimalista', desc: 'Superfícies limpas, tudo fechado e silêncio visual.' },
};

/** Paleta usada na ilustração de reserva (quando a foto não carrega) e no perfil. */
export interface StylePalette { wall: string; floor: string; sofa: string; seat: string; rug: string; art: string; plant: string }
export const STYLE_PALETTES: Record<string, StylePalette> = {
  japandi: { wall: '#E9E2D6', floor: '#C9AE8A', sofa: '#D3C8B6', seat: '#C8BCA8', rug: '#D7CCBA', art: '#B9A890', plant: '#7C8C6A' },
  modernobr: { wall: '#EFE6D8', floor: '#6B4A33', sofa: '#A2582E', seat: '#8F4C27', rug: '#D9C8A9', art: '#2F5D50', plant: '#5F7550' },
  industrial: { wall: '#8E8D89', floor: '#5E5C58', sofa: '#3B3B3B', seat: '#2E2E2E', rug: '#A39A8C', art: '#C46A3A', plant: '#56604E' },
  escandinavo: { wall: '#F7F7F4', floor: '#E2D3BB', sofa: '#B9C3C9', seat: '#A9B4BB', rug: '#EDE8E0', art: '#D9DDE0', plant: '#7E9474' },
  classico: { wall: '#EDE4D8', floor: '#B08A62', sofa: '#7D8B74', seat: '#6F7D67', rug: '#C9B8A0', art: '#B8963E', plant: '#6B7D5E' },
  tropical: { wall: '#E6DCCB', floor: '#A47B55', sofa: '#E9E1D2', seat: '#DDD3C1', rug: '#CDB48C', art: '#4F6B3E', plant: '#4F6B3E' },
  rustico: { wall: '#C9BBA6', floor: '#8C6A4A', sofa: '#A0663F', seat: '#8A5734', rug: '#B9A68A', art: '#5E5A52', plant: '#5F7550' },
  minimal: { wall: '#F2F1EE', floor: '#D4D0C8', sofa: '#8E8A84', seat: '#7F7B75', rug: '#E6E3DE', art: '#BDB8AF', plant: '#9A9A8E' },
};

/**
 * Imagens de referência: renders de projetos da própria CBC, otimizados (1200 × 900)
 * e versionados em /public/briefing-interiores. Para trocar uma foto, salve outra
 * com o mesmo nome de arquivo. Se um arquivo faltar, a tela mostra a ilustração
 * na paleta do estilo.
 */
export interface RefImage { file: string }
// IMG_VERSION força o navegador a buscar a foto nova quando um arquivo é substituído
// (o nginx guarda imagens em cache por 1 ano). Aumente ao trocar fotos.
export const IMG_VERSION = 3;
const cbc = (file: string): RefImage => ({ file: `/briefing-interiores/${file}.jpg?v=${IMG_VERSION}` });
export const COVER_IMAGE = cbc('capa');

export interface StyleCard {
  id: string;
  style: string;                    // chave principal em STYLES
  tags: Record<string, number>;     // pesos para o cálculo do perfil
  caption: string;
  image: RefImage;
}

export const STYLE_CARDS: StyleCard[] = [
  { id: 'japandi-1', style: 'japandi', tags: { japandi: 1, minimal: 0.3 }, caption: 'Quarto em madeira clara, linho e luz suave', image: cbc('estilo-japandi-1') },
  { id: 'modernobr-1', style: 'modernobr', tags: { modernobr: 1 }, caption: 'Painel de freijó, poltrona de madeira e arte', image: cbc('estilo-modernobr-1') },
  { id: 'industrial-1', style: 'industrial', tags: { industrial: 1 }, caption: 'Marcenaria preta, nichos expostos e luz de efeito', image: cbc('estilo-industrial-1') },
  { id: 'escandinavo-1', style: 'escandinavo', tags: { escandinavo: 1, minimal: 0.2 }, caption: 'Branco, madeira e cabeceira ripada', image: cbc('estilo-escandinavo-1') },
  { id: 'classico-1', style: 'classico', tags: { classico: 1 }, caption: 'Molduras nas paredes, simetria e mesa de jantar', image: cbc('estilo-classico-1') },
  { id: 'tropical-1', style: 'tropical', tags: { tropical: 1, modernobr: 0.2 }, caption: 'Pé-direito alto, pedra e plantas', image: cbc('estilo-tropical-1') },
  { id: 'rustico-1', style: 'rustico', tags: { rustico: 1 }, caption: 'Pedra, gabião, forno a lenha e madeira', image: cbc('estilo-rustico-1') },
  { id: 'minimal-1', style: 'minimal', tags: { minimal: 1, japandi: 0.2 }, caption: 'Linhas retas, tons neutros e tudo no lugar', image: cbc('estilo-minimal-1') },
  { id: 'japandi-2', style: 'japandi', tags: { japandi: 1, escandinavo: 0.2 }, caption: 'Cozinha clara, ripados e madeira natural', image: cbc('estilo-japandi-2') },
  { id: 'modernobr-2', style: 'modernobr', tags: { modernobr: 1, tropical: 0.2 }, caption: 'Madeira, couro e escada escultural', image: cbc('estilo-modernobr-2') },
  { id: 'industrial-2', style: 'industrial', tags: { industrial: 1 }, caption: 'Ambiente escuro, metal e iluminação técnica', image: cbc('estilo-industrial-2') },
  { id: 'escandinavo-2', style: 'escandinavo', tags: { escandinavo: 1 }, caption: 'Revestimento claro, linho e tons neutros', image: cbc('estilo-escandinavo-2') },
  { id: 'classico-2', style: 'classico', tags: { classico: 1, modernobr: 0.2 }, caption: 'Portas com moldura e marcenaria tradicional', image: cbc('estilo-classico-2') },
  { id: 'tropical-2', style: 'tropical', tags: { tropical: 1 }, caption: 'Casa aberta para a piscina e o jardim', image: cbc('estilo-tropical-2') },
  { id: 'rustico-2', style: 'rustico', tags: { rustico: 1, modernobr: 0.3 }, caption: 'Forro de madeira, pedra e mesa comprida', image: cbc('estilo-rustico-2') },
  { id: 'minimal-2', style: 'minimal', tags: { minimal: 1 }, caption: 'Revestimento neutro e superfícies limpas', image: cbc('estilo-minimal-2') },
];

// ---- Galeria de referências por ambiente (projetos da CBC) ----
export type RefRoom = 'sala' | 'jantar' | 'cozinha' | 'banheiro' | 'gourmet' | 'casal' | 'solteiro' | 'infantil' | 'escritorio';
export interface RoomRef { id: string; room: RefRoom; caption: string; image: RefImage }
export const ROOM_REFS: RoomRef[] = [
  { id: 'sala-1', room: 'sala', caption: "Pé-direito duplo, parede de pedra e sofá com chaise", image: cbc('ref/sala-1') },
  { id: 'sala-2', room: 'sala', caption: "Painel de madeira com TV e pedra branca", image: cbc('ref/sala-2') },
  { id: 'sala-3', room: 'sala', caption: "Estar integrado ao jantar, com rack em madeira", image: cbc('ref/sala-3') },
  { id: 'sala-4', room: 'sala', caption: "Painel ripado, arte e iluminação de sanca", image: cbc('ref/sala-4') },
  { id: 'sala-5', room: 'sala', caption: "Sofá de couro, escada escultural e estante", image: cbc('ref/sala-5') },
  { id: 'sala-6', room: 'sala', caption: "Freijó, poltrona de madeira e tapete natural", image: cbc('ref/sala-6') },
  { id: 'sala-7', room: 'sala', caption: "Sala de estar e jogos com poltronas orgânicas", image: cbc('ref/sala-7') },
  { id: 'sala-8', room: 'sala', caption: "Home theater escuro com estante de coleção", image: cbc('ref/sala-8') },
  { id: 'jantar-1', room: 'jantar', caption: "Mesa longa, cadeiras estofadas e boiserie", image: cbc('ref/jantar-1') },
  { id: 'jantar-2', room: 'jantar', caption: "Mesa de madeira com cadeiras de couro", image: cbc('ref/jantar-2') },
  { id: 'jantar-3', room: 'jantar', caption: "Jantar integrado ao estar, cadeiras claras", image: cbc('ref/jantar-3') },
  { id: 'cozinha-1', room: 'cozinha', caption: "Ilha em travertino, pendentes e armários claros", image: cbc('ref/cozinha-1') },
  { id: 'cozinha-2', room: 'cozinha', caption: "Ilha em madeira com forno embutido", image: cbc('ref/cozinha-2') },
  { id: 'cozinha-3', room: 'cozinha', caption: "Bancada com banquetas e nichos iluminados", image: cbc('ref/cozinha-3') },
  { id: 'cozinha-4', room: 'cozinha', caption: "Parede de pedra, ripado e ilha em travertino", image: cbc('ref/cozinha-4') },
  { id: 'cozinha-5', room: 'cozinha', caption: "Cristaleiras iluminadas e ilha em pedra", image: cbc('ref/cozinha-5') },
  { id: 'cozinha-6', room: 'cozinha', caption: "Portas de vidro, ripado e janela de jardim", image: cbc('ref/cozinha-6') },
  { id: 'cozinha-7', room: 'cozinha', caption: "Portas com moldura e ilha em madeira", image: cbc('ref/cozinha-7') },
  { id: 'cozinha-8', room: 'cozinha', caption: "Lavanderia compacta com armários claros", image: cbc('ref/cozinha-8') },
  { id: 'banheiro-1', room: 'banheiro', caption: "Gabinete em madeira e bancada de mármore", image: cbc('ref/banheiro-1') },
  { id: 'banheiro-2', room: 'banheiro', caption: "Banheira, box amplo e cubas de apoio", image: cbc('ref/banheiro-2') },
  { id: 'banheiro-3', room: 'banheiro', caption: "Banheira revestida em mármore", image: cbc('ref/banheiro-3') },
  { id: 'banheiro-4', room: 'banheiro', caption: "Banheira sob a janela e luz natural", image: cbc('ref/banheiro-4') },
  { id: 'banheiro-5', room: 'banheiro', caption: "Bancada dupla, box em vidro e sanca", image: cbc('ref/banheiro-5') },
  { id: 'banheiro-6', room: 'banheiro', caption: "Mesmo banheiro com iluminação noturna", image: cbc('ref/banheiro-6') },
  { id: 'gourmet-1', room: 'gourmet', caption: "Forno a lenha, gabião e balcão em madeira", image: cbc('ref/gourmet-1') },
  { id: 'gourmet-2', room: 'gourmet', caption: "Forro de madeira, churrasqueira e mesa longa", image: cbc('ref/gourmet-2') },
  { id: 'gourmet-3', room: 'gourmet', caption: "Forno de pizza com bancada de apoio", image: cbc('ref/gourmet-3') },
  { id: 'gourmet-4', room: 'gourmet', caption: "Pedra moledo, granito preto e ilha", image: cbc('ref/gourmet-4') },
  { id: 'gourmet-5', room: 'gourmet', caption: "Área gourmet aberta para a piscina", image: cbc('ref/gourmet-5') },
  { id: 'casal-1', room: 'casal', caption: "Madeira escura, cabeceira estofada e luz indireta", image: cbc('ref/casal-1') },
  { id: 'casal-2', room: 'casal', caption: "Painel de madeira com cabeceira e plantas", image: cbc('ref/casal-2') },
  { id: 'casal-3', room: 'casal', caption: "Parede revestida em madeira e luz zenital", image: cbc('ref/casal-3') },
  { id: 'casal-4', room: 'casal', caption: "Cabeceira com fita de LED e cortinas leves", image: cbc('ref/casal-4') },
  { id: 'casal-5', room: 'casal', caption: "Madeira clara, roupeiro integrado e arte azul", image: cbc('ref/casal-5') },
  { id: 'casal-6', room: 'casal', caption: "Marcenaria clara em curva e iluminação suave", image: cbc('ref/casal-6') },
  { id: 'solteiro-1', room: 'solteiro', caption: "Cabeceira ripada terracota e roupeiro branco", image: cbc('ref/solteiro-1') },
  { id: 'solteiro-2', room: 'solteiro', caption: "Painel de TV em terracota e prateleiras", image: cbc('ref/solteiro-2') },
  { id: 'infantil-1', room: 'infantil', caption: "Estudo para dois, estante e painel de TV", image: cbc('ref/infantil-1') },
  { id: 'infantil-2', room: 'infantil', caption: "Duas camas de solteiro e revestimento claro", image: cbc('ref/infantil-2') },
  { id: 'infantil-3', room: 'infantil', caption: "Cama com roupeiro grafite e tapete orgânico", image: cbc('ref/infantil-3') },
  { id: 'infantil-4', room: 'infantil', caption: "Bancada de estudo e roupeiro fechado", image: cbc('ref/infantil-4') },
  { id: 'infantil-5', room: 'infantil', caption: "Beliche em madeira e papel de parede listrado", image: cbc('ref/infantil-5') },
  { id: 'infantil-6', room: 'infantil', caption: "Estudo com estante iluminada para brinquedos", image: cbc('ref/infantil-6') },
  { id: 'infantil-7', room: 'infantil', caption: "Mesa para dois e estante colorida", image: cbc('ref/infantil-7') },
  { id: 'infantil-8', room: 'infantil', caption: "Papel de parede de aviões e cabeceira azul", image: cbc('ref/infantil-8') },
  { id: 'escritorio-1', room: 'escritorio', caption: "Estante em madeira escura e mesa em mármore", image: cbc('ref/escritorio-1') },
  { id: 'escritorio-2', room: 'escritorio', caption: "Painel com arte e mesa em pedra", image: cbc('ref/escritorio-2') },
  { id: 'escritorio-3', room: 'escritorio', caption: "Revestimento em madeira e luz embutida", image: cbc('ref/escritorio-3') },
  { id: 'escritorio-4', room: 'escritorio', caption: "Ambiente escuro com iluminação de destaque", image: cbc('ref/escritorio-4') },
  { id: 'escritorio-5', room: 'escritorio', caption: "Setup de trabalho e jogos com marcenaria preta", image: cbc('ref/escritorio-5') },
];
export const refsFor = (room: RefRoom) => ROOM_REFS.filter(r => r.room === room);
export const refById = (id: string) => ROOM_REFS.find(r => r.id === id);
/** Galeria usada por um dormitório, conforme o tipo. */
export const dormRefRoom = (t: DormType): RefRoom => (t === 'casal' ? 'casal' : t === 'infantil' ? 'infantil' : 'solteiro');

export const TVS: { inches: number; widthM: number }[] = [
  { inches: 50, widthM: 1.12 }, { inches: 55, widthM: 1.23 }, { inches: 65, widthM: 1.45 },
  { inches: 75, widthM: 1.67 }, { inches: 85, widthM: 1.9 },
];
export const TV_EXTRAS = ['Soundbar', 'Home theater', 'Videogame', 'Streaming ou receptor', 'Caixas no forro'];

export const BEDS: { id: BedId; label: string; w: number; l: number }[] = [
  { id: 'solteiro', label: 'Solteiro', w: 88, l: 188 },
  { id: 'solteiro_king', label: 'Solteiro king', w: 96, l: 203 },
  { id: 'casal', label: 'Casal', w: 138, l: 188 },
  { id: 'queen', label: 'Queen', w: 158, l: 198 },
  { id: 'king', label: 'King', w: 193, l: 203 },
];
export const BASES: { id: BaseId; label: string; heightCm: number }[] = [
  { id: 'box', label: 'Box simples', heightCm: 35 },
  { id: 'bau', label: 'Box baú', heightCm: 40 },
  { id: 'marcenaria', label: 'Cama de marcenaria', heightCm: 28 },
];
export const KID_BEDS: { id: KidBedId; label: string; hint: string; image?: RefImage }[] = [
  { id: 'comum', label: 'Cama comum', hint: 'Solteiro tradicional', image: cbc('cama-infantil-comum') },
  { id: 'evolutiva', label: 'Cama evolutiva', hint: 'Baixa, montessoriana ou casinha' },
  { id: 'bicama', label: 'Bicama', hint: 'Cama extra para visitas' },
  { id: 'beliche', label: 'Beliche', hint: 'Duas camas sobrepostas', image: cbc('cama-infantil-beliche') },
];

export const DORM_TYPES: { id: DormType; label: string; long: string; defaultBed: BedId; defaultMattress: number }[] = [
  { id: 'casal', label: 'Casal', long: 'Quarto de casal', defaultBed: 'queen', defaultMattress: 30 },
  { id: 'solteiro', label: 'Solteiro', long: 'Quarto de solteiro', defaultBed: 'solteiro', defaultMattress: 25 },
  { id: 'infantil', label: 'Infantil', long: 'Quarto infantil', defaultBed: 'solteiro', defaultMattress: 18 },
  { id: 'hospedes', label: 'Hóspedes', long: 'Quarto de hóspedes', defaultBed: 'casal', defaultMattress: 25 },
];
export const dormTypeMeta = (t: DormType) => DORM_TYPES.find(d => d.id === t) || DORM_TYPES[0];

export const PET_OPTIONS = ['Não temos pets', 'Cão pequeno', 'Cão grande', 'Gato'];
export const HABIT_OPTIONS = [
  'Recebemos visitas com frequência', 'Trabalhamos em casa', 'Cozinhamos todos os dias',
  'Assistimos TV juntos à noite', 'Temos funcionária doméstica',
];

export const KITCHEN_ITEMS: { id: string; label: string }[] = [
  { id: 'geladeira', label: 'Geladeira' },
  { id: 'cooktop', label: 'Cooktop' },
  { id: 'forno', label: 'Forno de embutir' },
  { id: 'micro', label: 'Micro-ondas de embutir' },
  { id: 'lavalouca', label: 'Lava-louças' },
  { id: 'coifa', label: 'Coifa ou depurador' },
  { id: 'adega', label: 'Adega' },
  { id: 'purificador', label: 'Purificador de água' },
];
export const VOLTAGES: { id: Exclude<Voltage, ''>; label: string }[] = [
  { id: '127', label: '127 V' }, { id: '220', label: '220 V' }, { id: 'bivolt', label: 'Bivolt' },
];
export const voltageLabel = (v?: Voltage) => VOLTAGES.find(x => x.id === v)?.label || 'não informada';
export const kitchenLabel = (k: IBKitchenItem) => k.label?.trim() || KITCHEN_ITEMS.find(i => i.id === k.id)?.label || k.id;

// ---- Marcenaria e pedras (cozinha, banheiros, área gourmet) ----
export const FINISH_AREAS: { id: FinishArea; label: string }[] = [
  { id: 'cozinha', label: 'Cozinha' }, { id: 'banheiro', label: 'Banheiros' }, { id: 'gourmet', label: 'Área gourmet' },
];
export const CABINET_TONES: { id: string; label: string; hint: string; swatch: string }[] = [
  { id: 'claro', label: 'Claros', hint: 'Branco, off-white, areia', swatch: '#EEEAE2' },
  { id: 'madeira', label: 'Madeira', hint: 'Freijó, carvalho, nogueira', swatch: '#B98A5E' },
  { id: 'escuro', label: 'Escuros', hint: 'Grafite, preto, fendi escuro', swatch: '#3A3A3C' },
  { id: 'cor', label: 'Com cor', hint: 'Verde, azul, terracota', swatch: '#6E7357' },
];
export const STONE_TONES: { id: string; label: string; hint: string; swatch: string }[] = [
  { id: 'clara', label: 'Clara', hint: 'Branco, creme, veios suaves', swatch: '#EDEBE6' },
  { id: 'media', label: 'Média', hint: 'Bege, cinza, travertino', swatch: '#C9BEAB' },
  { id: 'escura', label: 'Escura', hint: 'Preto, grafite', swatch: '#262626' },
];
export const STONE_FINISHES = ['Polido, com brilho', 'Levigado, fosco', 'Escovado, com textura', 'Não sei'];

export interface FinishCombo {
  id: string; name: string;
  cabinetTone: string; cabinetName: string; cabinet: string;
  stoneTone: string; stoneName: string; stone: string; vein?: string;
  areas: FinishArea[]; note: string;
}
/** Combinações sugeridas de armário + pedra. Cores aproximadas, para orientar a conversa. */
export const FINISH_COMBOS: FinishCombo[] = [
  { id: 'offwhite-calacatta', name: 'Claro e luminoso', cabinetTone: 'claro', cabinetName: 'Off-white fosco', cabinet: '#EFEBE4', stoneTone: 'clara', stoneName: 'Quartzo Calacatta', stone: '#F3F0EB', vein: '#B9B2A6', areas: ['cozinha', 'banheiro', 'gourmet'], note: 'Amplia o ambiente; o quartzo resiste melhor a manchas do que o mármore.' },
  { id: 'freijo-saogabriel', name: 'Madeira e preto', cabinetTone: 'madeira', cabinetName: 'Freijó', cabinet: '#B98A5E', stoneTone: 'escura', stoneName: 'Granito Preto São Gabriel', stone: '#2A2A2A', vein: '#4A4A4A', areas: ['cozinha', 'banheiro', 'gourmet'], note: 'Clássico brasileiro, muito resistente e fácil de manter.' },
  { id: 'nogueira-tajmahal', name: 'Quente e sofisticado', cabinetTone: 'madeira', cabinetName: 'Nogueira', cabinet: '#6B4A33', stoneTone: 'clara', stoneName: 'Quartzito Taj Mahal', stone: '#E7DCC8', vein: '#CDB99A', areas: ['cozinha', 'banheiro', 'gourmet'], note: 'Quartzito une o desenho de pedra natural à resistência do granito.' },
  { id: 'grafite-itaunas', name: 'Contraste suave', cabinetTone: 'escuro', cabinetName: 'Grafite', cabinet: '#3C3D3F', stoneTone: 'clara', stoneName: 'Granito Branco Itaúnas', stone: '#E6E0D4', vein: '#A39A8C', areas: ['cozinha', 'banheiro', 'gourmet'], note: 'Armário escuro com bancada clara: destaca a superfície de trabalho.' },
  { id: 'oliva-travertino', name: 'Natural e terroso', cabinetTone: 'cor', cabinetName: 'Verde-oliva', cabinet: '#6E7357', stoneTone: 'media', stoneName: 'Travertino', stone: '#D8C7A8', vein: '#BFA985', areas: ['cozinha', 'banheiro'], note: 'Travertino é poroso: pede impermeabilização e não vai bem na área gourmet.' },
  { id: 'carvalho-concreto', name: 'Contemporâneo leve', cabinetTone: 'madeira', cabinetName: 'Carvalho claro', cabinet: '#D2B48C', stoneTone: 'media', stoneName: 'Quartzo cinza concreto', stone: '#A9A6A0', areas: ['cozinha', 'banheiro', 'gourmet'], note: 'Combina com estilos escandinavo e japandi.' },
  { id: 'azul-carrara', name: 'Cor com pedra clássica', cabinetTone: 'cor', cabinetName: 'Azul petróleo', cabinet: '#2F4B57', stoneTone: 'clara', stoneName: 'Mármore Carrara', stone: '#EEEDEA', vein: '#A7A9AC', areas: ['banheiro'], note: 'Mármore mancha com ácidos e gordura: indicado para banheiros.' },
  { id: 'branco-corumba', name: 'Prático e neutro', cabinetTone: 'claro', cabinetName: 'Branco', cabinet: '#F4F2EE', stoneTone: 'media', stoneName: 'Granito Cinza Corumbá', stone: '#9C9A96', vein: '#6F6D69', areas: ['cozinha', 'banheiro', 'gourmet'], note: 'Disfarça manchas e marcas do dia a dia, bom para quem cozinha muito.' },
  { id: 'preto-total', name: 'Escuro e marcante', cabinetTone: 'escuro', cabinetName: 'Preto fosco', cabinet: '#252525', stoneTone: 'escura', stoneName: 'Granito Preto Absoluto', stone: '#161616', areas: ['cozinha', 'gourmet'], note: 'Pede boa iluminação de bancada; marcas de dedo aparecem no fosco.' },
];
export const finishAreasOf = (c: IBConfig): FinishArea[] => FINISH_AREAS.filter(f => (f.id === 'cozinha' && c.cozinha) || (f.id === 'banheiro' && c.banheiros) || (f.id === 'gourmet' && c.gourmet)).map(f => f.id);
export const emptyFinish = (): IBFinish => ({ cabinet: '', stone: '', stoneFinish: '', combo: '' });

export const SMALL_APPLIANCES = ['Cafeteira', 'Airfryer', 'Liquidificador', 'Sanduicheira', 'Chaleira elétrica', 'Batedeira'];

export const OFFICE_USES = ['Uso diário', 'Uso eventual', 'Videochamadas frequentes'];
export const OFFICE_ITEMS = ['Impressora', 'Arquivo de papéis', 'Estante de livros', 'Poltrona de leitura', 'Cama para hóspedes'];

export const WARDROBE_ITEMS: { key: keyof WardrobeCounts; label: string; hint: string; step: number }[] = [
  { key: 'curto', label: 'Cabide curto', hint: 'Camisas, blusas, blazers', step: 5 },
  { key: 'longo', label: 'Cabide longo', hint: 'Vestidos, casacos, sobretudos', step: 1 },
  { key: 'calcas', label: 'Calças no cabide', hint: 'Se prefere dobradas, conte abaixo', step: 5 },
  { key: 'dobradas', label: 'Peças dobradas', hint: 'Camisetas, malhas, academia', step: 5 },
  { key: 'sapatos', label: 'Pares de sapatos', hint: 'Inclua botas e chinelos', step: 1 },
  { key: 'bolsas', label: 'Bolsas e mochilas', hint: 'As que ficam no quarto', step: 1 },
];

export const PRIORITY_OPTIONS: { id: string; label: string }[] = [
  { id: 'cozinha', label: 'Marcenaria da cozinha' },
  { id: 'social', label: 'Sala para receber' },
  { id: 'suite', label: 'Suíte e closet' },
  { id: 'criancas', label: 'Quartos das crianças' },
  { id: 'escritorio', label: 'Escritório funcional' },
  { id: 'iluminacao', label: 'Iluminação' },
  { id: 'armazenamento', label: 'Armazenamento em geral' },
];

// ---------------------------------------------------------------------------
// Valores iniciais
// ---------------------------------------------------------------------------

export const emptyWardrobe = (): WardrobeCounts => ({ curto: 0, longo: 0, calcas: 0, dobradas: 0, sapatos: 0, bolsas: 0 });

export function defaultConfig(): IBConfig {
  return {
    sala: true, jantar: true, cozinha: true, escritorio: false, banheiros: true, gourmet: false,
    dorms: [
      { id: 'd1', name: 'Suíte do casal', type: 'casal' },
      { id: 'd2', name: 'Quarto 2', type: 'solteiro' },
    ],
    confirmed: false,
  };
}

export function defaultAnswers(): IBAnswers {
  return {
    adults: 2, kids: 0, elders: 0, pets: [], habits: [], votes: {},
    tvInches: 65, tvDistM: 2.4, tvExtras: [],
    dinnerDaily: 4, dinnerParty: 6, dinnerShape: 'indiferente',
    kitchen: [], smallAppliances: [], houseVoltage: '', finishes: {},
    dorms: {},
    office: { people: 1, monitors: 1, use: [], items: [] },
    wardrobe: { p1: emptyWardrobe(), p2: emptyWardrobe(), p1Name: 'Pessoa 1', p2Name: 'Pessoa 2' },
    keep: '', notes: '', priorities: PRIORITY_OPTIONS.map(p => p.id), refs: {},
  };
}

export function emptyBriefing(): InteriorBriefingData {
  return { config: defaultConfig(), answers: defaultAnswers(), done: {}, status: 'rascunho' };
}

/** Garante todos os campos (dados antigos ou parciais vindos do banco). */
export function normalizeBriefing(raw?: Partial<InteriorBriefingData> | null): InteriorBriefingData {
  const base = emptyBriefing();
  if (!raw) return base;
  const a = { ...base.answers, ...(raw.answers || {}) } as IBAnswers;
  a.office = { ...base.answers.office, ...(raw.answers?.office || {}) };
  a.wardrobe = {
    ...base.answers.wardrobe, ...(raw.answers?.wardrobe || {}),
    p1: { ...emptyWardrobe(), ...(raw.answers?.wardrobe?.p1 || {}) },
    p2: { ...emptyWardrobe(), ...(raw.answers?.wardrobe?.p2 || {}) },
  };
  const known = new Set(PRIORITY_OPTIONS.map(p => p.id));
  const prios = (a.priorities || []).filter(id => known.has(id));
  PRIORITY_OPTIONS.forEach(p => { if (!prios.includes(p.id)) prios.push(p.id); });
  a.priorities = prios;
  a.kitchen = (a.kitchen || []).map(k => ({ voltage: '' as Voltage, ...k }));
  a.finishes = a.finishes || {};
  a.refs = a.refs || {};
  return {
    ...base, ...raw,
    config: { ...base.config, ...(raw.config || {}), dorms: raw.config?.dorms ?? base.config.dorms },
    answers: a,
    done: raw.done || {},
    status: raw.status === 'enviado' ? 'enviado' : 'rascunho',
  };
}

export function dormAnswer(b: InteriorBriefingData, dorm: IBDorm): IBDormAnswer {
  const meta = dormTypeMeta(dorm.type);
  return { bed: meta.defaultBed, base: 'box', mattressCm: meta.defaultMattress, kidBed: dorm.type === 'infantil' ? 'comum' : undefined, ...(b.answers.dorms[dorm.id] || {}) };
}

// ---------------------------------------------------------------------------
// Blocos (montados a partir dos ambientes)
// ---------------------------------------------------------------------------

export type BlockKind = 'moradores' | 'estilo' | 'sala' | 'jantar' | 'cozinha' | 'acabamentos' | 'dorm' | 'escritorio' | 'roupeiro' | 'ficar' | 'prioridades';
export interface IBBlock { key: string; kind: BlockKind; title: string; subtitle?: string; minutes: number; dormId?: string }

export function buildBlocks(config: IBConfig): IBBlock[] {
  const out: IBBlock[] = [
    { key: 'moradores', kind: 'moradores', title: 'Quem mora aqui', minutes: 3 },
    { key: 'estilo', kind: 'estilo', title: 'Estilo', minutes: 5 },
  ];
  if (config.sala) out.push({ key: 'sala', kind: 'sala', title: 'Sala e TV', minutes: 3 });
  if (config.jantar) out.push({ key: 'jantar', kind: 'jantar', title: 'Sala de jantar', minutes: 2 });
  if (config.cozinha) out.push({ key: 'cozinha', kind: 'cozinha', title: 'Cozinha e equipamentos', minutes: 5 });
  const areas = finishAreasOf(config);
  if (areas.length) out.push({ key: 'acabamentos', kind: 'acabamentos', title: 'Marcenaria e bancadas', subtitle: areas.map(id => FINISH_AREAS.find(f => f.id === id)!.label).join(', '), minutes: 4 });
  config.dorms.forEach(d => out.push({ key: `dorm-${d.id}`, kind: 'dorm', title: d.name.trim() || 'Dormitório', subtitle: dormTypeMeta(d.type).long, minutes: 3, dormId: d.id }));
  if (config.escritorio) out.push({ key: 'escritorio', kind: 'escritorio', title: 'Escritório', minutes: 3 });
  if (config.dorms.length > 0) out.push({ key: 'roupeiro', kind: 'roupeiro', title: 'Inventário de roupeiro', minutes: 5 });
  out.push({ key: 'ficar', kind: 'ficar', title: 'O que vai ficar', minutes: 3 });
  out.push({ key: 'prioridades', kind: 'prioridades', title: 'Prioridades', minutes: 1 });
  return out;
}

export function progressOf(b: InteriorBriefingData): { done: number; total: number; pct: number } {
  const blocks = buildBlocks(b.config);
  const done = blocks.filter(bl => b.done[bl.key]).length;
  return { done, total: blocks.length, pct: blocks.length ? Math.round((done / blocks.length) * 100) : 0 };
}

// ---------------------------------------------------------------------------
// Cálculos
// ---------------------------------------------------------------------------

export const fmt1 = (n: number) => n.toFixed(1).replace('.', ',');

export interface StyleProfile {
  list: { key: string; name: string; pct: number }[];
  rejected: string[];
  neutral: string[];
  palette: string[];
  answered: number;
}

export function computeProfile(votes: Record<string, Vote>): StyleProfile {
  const scores: Record<string, number> = {};
  Object.keys(STYLES).forEach(k => { scores[k] = 0; });
  let answered = 0;
  STYLE_CARDS.forEach(c => {
    const v = votes[c.id];
    if (v === undefined) return;
    answered++;
    Object.entries(c.tags).forEach(([t, w]) => { scores[t] += v * w; });
  });
  const top = Object.keys(scores).filter(k => scores[k] > 0).sort((a, b) => scores[b] - scores[a]).slice(0, 3);
  const total = top.reduce((s, k) => s + scores[k], 0);
  const list = top.map(k => ({ key: k, name: STYLES[k].name, pct: total ? Math.round((scores[k] / total) * 100) : 0 }));
  if (list.length) list[0].pct += 100 - list.reduce((s, p) => s + p.pct, 0);
  const rejected = Object.keys(scores).filter(k => scores[k] < 0).sort((a, b) => scores[a] - scores[b]).map(k => STYLES[k].name);
  const neutral = Object.keys(STYLES).filter(k => scores[k] >= 0).filter(k => {
    const cards = STYLE_CARDS.filter(c => c.style === k);
    return cards.length > 0 && cards.every(c => votes[c.id] === 0);
  }).map(k => STYLES[k].name);
  const colors: string[] = [];
  STYLE_CARDS.filter(c => votes[c.id] === 2).forEach(c => {
    const p = STYLE_PALETTES[c.style];
    [p.wall, p.floor, p.sofa, p.art].forEach(x => { if (!colors.includes(x)) colors.push(x); });
  });
  return { list, rejected, neutral, palette: colors.slice(0, 5), answered };
}

export function tvRange(inches: number) {
  const diag = inches * 0.0254;
  return { min: diag * 1.2, max: diag * 1.5 };
}

export function tvStatus(inches: number, distM: number): { ok: boolean; text: string } {
  const { min, max } = tvRange(inches);
  if (distM < min - 1e-9) {
    const fit = TVS.filter(t => t.inches * 0.0254 * 1.2 <= distM + 1e-9).pop();
    return { ok: false, text: `Muito perto para uma TV de ${inches}". A tela pode cansar a vista. ${fit ? `Até ${fit.inches}" fica confortável a essa distância.` : 'Vale rever a posição do sofá.'}` };
  }
  if (distM > max + 1e-9) return { ok: false, text: `Distância grande para ${inches}". Uma tela maior aproveitaria melhor o espaço.` };
  return { ok: true, text: `Combinação confortável para assistir de ${fmt1(distM)} m.` };
}

export function bedTopCm(a: IBDormAnswer): number {
  const base = BASES.find(b => b.id === a.base) || BASES[0];
  return base.heightCm + a.mattressCm;
}

export function dinnerTable(seats: number, shape: IBAnswers['dinnerShape']): string {
  const rect = seats <= 4 ? '1,20 × 0,80 m' : seats <= 6 ? '1,80 × 0,90 m' : seats <= 8 ? '2,20 a 2,40 × 1,00 m' : '2,80 m ou mais × 1,10 m';
  const round = seats <= 4 ? '1,00 a 1,10 m de diâmetro' : seats <= 6 ? '1,30 a 1,40 m de diâmetro' : '1,60 m de diâmetro ou mais';
  if (shape === 'redonda') return `Mesa redonda de ${round}`;
  if (shape === 'retangular') return `Mesa retangular de ${rect}`;
  return `Retangular de ${rect} ou redonda de ${round}`;
}

export function officeDeskCm(o: IBAnswers['office']): { perPerson: number; total: number } {
  const perPerson = o.monitors >= 2 ? 160 : 120;
  return { perPerson, total: perPerson * Math.max(1, o.people) };
}

export function wardrobeEstimate(w: WardrobeCounts) {
  return {
    curtoM: w.curto * 0.025,
    longoM: w.longo * 0.03 + w.calcas * 0.025,
    prateleiras: Math.ceil(w.dobradas / 16),
    sapateiras: Math.ceil(w.sapatos / 4),
  };
}

// ---------------------------------------------------------------------------
// Alertas e pendências (visão da equipe)
// ---------------------------------------------------------------------------

export interface IBAlert { area: string; title: string; text: string }

export function computeAlerts(b: InteriorBriefingData): IBAlert[] {
  const a = b.answers;
  const c = b.config;
  const out: IBAlert[] = [];
  if (c.sala && b.done.sala) {
    const st = tvStatus(a.tvInches, a.tvDistM);
    if (!st.ok) {
      const r = tvRange(a.tvInches);
      out.push({ area: 'Sala e TV', title: `TV de ${a.tvInches}" a ${fmt1(a.tvDistM)} m do sofá`, text: `Fora da faixa ideal, de ${fmt1(r.min)} a ${fmt1(r.max)} m. ${st.text}` });
    }
  }
  if (a.pets.includes('Cão grande') || a.pets.includes('Gato')) {
    out.push({ area: 'Tecidos', title: 'Pets que arranham ou soltam pelo', text: 'Especificar tecidos técnicos e couros com acabamento protegido; evitar tapetes de fibra solta e laçadas.' });
  }
  if (a.kids > 0 && !c.dorms.some(d => d.type === 'infantil')) {
    out.push({ area: 'Ambientes', title: 'Há crianças, mas nenhum quarto infantil', text: 'Confirmar com a família qual dormitório é das crianças e ajustar o tipo na configuração.' });
  }
  if (a.elders > 0) {
    out.push({ area: 'Acessibilidade', title: 'Idoso ou mobilidade reduzida', text: 'Prever circulações mais largas, alturas de assento e cama confortáveis, barras de apoio e iluminação de percurso.' });
  }
  c.dorms.forEach(d => {
    if (!b.done[`dorm-${d.id}`]) return;
    const da = dormAnswer(b, d);
    const top = bedTopCm(da);
    if (top >= 65) out.push({ area: d.name, title: `Colchão a ${top} cm do piso`, text: `Criados-mudos sob medida entre ${top - 5} e ${top} cm, já que modelos prontos costumam ser mais baixos.` });
  });
  if (c.escritorio && b.done.escritorio) {
    const desk = officeDeskCm(a.office);
    if (desk.total >= 240) out.push({ area: 'Escritório', title: `Bancada de ${fmt1(desk.total / 100)} m`, text: `${a.office.people} pessoa(s) com ${a.office.monitors} monitor(es) cada. Confirmar se a parede disponível comporta essa largura.` });
  }
  if (c.cozinha && b.done.cozinha && (a.houseVoltage === '127' || a.houseVoltage === '220')) {
    const other = a.houseVoltage === '127' ? '220' : '127';
    const off = a.kitchen.filter(k => k.voltage === other);
    if (off.length) out.push({ area: 'Cozinha', title: `Equipamentos em ${voltageLabel(other)} numa casa ${voltageLabel(a.houseVoltage)}`, text: `${off.map(kitchenLabel).join(', ')}. Prever tomadas dedicadas em ${voltageLabel(other)} no projeto elétrico.` });
  }
  if (c.cozinha && b.done.cozinha && a.smallAppliances.length >= 4) {
    out.push({ area: 'Cozinha', title: `${a.smallAppliances.length} eletroportáteis expostos`, text: 'Prever bancada livre ou torre de eletros com tomadas dedicadas e saída de vapor para airfryer e cafeteira.' });
  }
  return out;
}

export function computePendencias(b: InteriorBriefingData): { title: string; text: string }[] {
  const a = b.answers;
  const out: { title: string; text: string }[] = [];
  const unknown = a.kitchen.filter(k => k.unknown).map(kitchenLabel);
  if (unknown.length) out.push({ title: `Modelos não informados: ${unknown.join(', ')}`, text: 'Definem os vãos da marcenaria da cozinha.' });
  const noVolt = a.kitchen.filter(k => !k.voltage).map(kitchenLabel);
  if (b.done.cozinha && noVolt.length) out.push({ title: `Voltagem não informada: ${noVolt.join(', ')}`, text: 'Necessária para o projeto elétrico da cozinha.' });
  if (b.done.cozinha && !a.houseVoltage) out.push({ title: 'Tensão da casa não informada', text: 'Confirmar se a rede é 127 V ou 220 V.' });
  if (b.done.acabamentos) {
    const noCombo = finishAreasOf(b.config).filter(id => !a.finishes[id]?.combo).map(id => FINISH_AREAS.find(f => f.id === id)!.label);
    if (noCombo.length) out.push({ title: `Combinação de armário e pedra em aberto: ${noCombo.join(', ')}`, text: 'Levar amostras físicas de MDF e pedras para a reunião.' });
  }
  const prof = computeProfile(a.votes);
  if (prof.neutral.length) out.push({ title: 'Estilos marcados como “tanto faz”', text: `${prof.neutral.join(', ')}. Entender se houve dúvida ou desacordo entre o casal.` });
  if (!prof.list.length && prof.answered > 0) out.push({ title: 'Nenhum estilo agradou', text: 'Trazer referências próprias da CBC para a reunião.' });
  const blocks = buildBlocks(b.config).filter(bl => !b.done[bl.key]);
  if (blocks.length) out.push({ title: 'Blocos não concluídos', text: blocks.map(bl => bl.title).join(', ') });
  return out;
}

// ---------------------------------------------------------------------------
// Resumo legível por bloco (revisão e relatório)
// ---------------------------------------------------------------------------

const pl = (n: number, a: string, b: string) => `${n} ${n === 1 ? a : b}`;

export function refKeysOf(b: InteriorBriefingData, block: IBBlock): string[] {
  if (block.kind === 'acabamentos') return finishAreasOf(b.config).map(id => `acab-${id}`);
  if (['sala', 'jantar', 'cozinha', 'dorm', 'escritorio'].includes(block.kind)) return [block.key];
  return [];
}
export function chosenRefs(b: InteriorBriefingData, block: IBBlock): RoomRef[] {
  return refKeysOf(b, block).flatMap(k => b.answers.refs[k] || []).map(refById).filter((r): r is RoomRef => !!r);
}

export function blockSummary(b: InteriorBriefingData, block: IBBlock): string {
  const base = blockSummaryBase(b, block);
  const n = chosenRefs(b, block).length;
  return n ? `${base} · ${n} referência${n === 1 ? '' : 's'}` : base;
}

function blockSummaryBase(b: InteriorBriefingData, block: IBBlock): string {
  const a = b.answers;
  switch (block.kind) {
    case 'moradores': {
      const people = [pl(a.adults, 'adulto', 'adultos'), a.kids ? pl(a.kids, 'criança', 'crianças') : '', a.elders ? pl(a.elders, 'idoso', 'idosos') : ''].filter(Boolean).join(', ');
      const pets = a.pets.filter(p => p !== 'Não temos pets');
      return people + (pets.length ? ` · ${pets.join(', ')}` : '');
    }
    case 'estilo': {
      const p = computeProfile(a.votes);
      return p.list.length ? p.list.map(x => `${x.name} ${x.pct}%`).join(' · ') : 'Sem preferência definida';
    }
    case 'sala': return `TV ${a.tvInches}" a ${fmt1(a.tvDistM)} m${a.tvExtras.length ? ` · ${a.tvExtras.join(', ')}` : ''}`;
    case 'jantar': return `${pl(a.dinnerDaily, 'lugar', 'lugares')} no dia a dia, ${pl(a.dinnerParty, 'lugar', 'lugares')} em festas`;
    case 'cozinha': {
      const items = a.kitchen.map(k => `${kitchenLabel(k)}${k.voltage ? ` (${voltageLabel(k.voltage)})` : ''}`);
      return items.length ? items.join(', ') : 'Nenhum equipamento marcado';
    }
    case 'acabamentos': return finishAreasOf(b.config).map(id => `${FINISH_AREAS.find(f => f.id === id)!.label}: ${finishSummary(a.finishes[id])}`).join(' · ');
    case 'dorm': {
      const d = b.config.dorms.find(x => x.id === block.dormId);
      if (!d) return '';
      const da = dormAnswer(b, d);
      const bed = BEDS.find(x => x.id === da.bed);
      const base = BASES.find(x => x.id === da.base);
      const kid = d.type === 'infantil' ? `${KID_BEDS.find(k => k.id === da.kidBed)?.label || 'Cama comum'} · ` : '';
      return `${kid}${bed?.label} · ${base?.label.toLowerCase()} · colchão de ${da.mattressCm} cm`;
    }
    case 'escritorio': return `${pl(a.office.people, 'pessoa', 'pessoas')} · ${pl(a.office.monitors, 'monitor', 'monitores')} por pessoa`;
    case 'roupeiro': {
      const w = a.wardrobe;
      return `${w.p1Name}: ${w.p1.curto} peças curtas, ${w.p1.sapatos} pares · ${w.p2Name}: ${w.p2.curto} peças curtas, ${w.p2.sapatos} pares`;
    }
    case 'ficar': return a.keep.trim() ? a.keep.trim().split('\n')[0] : 'Nada informado';
    case 'prioridades': return a.priorities.slice(0, 3).map((id, i) => `${i + 1}. ${PRIORITY_OPTIONS.find(p => p.id === id)?.label}`).join(' · ');
  }
}

export function finishSummary(f?: IBFinish): string {
  if (!f) return 'não respondido';
  const combo = FINISH_COMBOS.find(c => c.id === f.combo);
  if (combo) return `${combo.cabinetName} + ${combo.stoneName}`;
  const cab = CABINET_TONES.find(t => t.id === f.cabinet)?.label;
  const st = STONE_TONES.find(t => t.id === f.stone)?.label;
  if (!cab && !st) return 'não respondido';
  return [cab ? `armários ${cab.toLowerCase()}` : '', st ? `pedra ${st.toLowerCase()}` : ''].filter(Boolean).join(', ');
}
