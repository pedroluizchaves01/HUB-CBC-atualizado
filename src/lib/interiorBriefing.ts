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
  boho: { name: 'Boho', desc: 'Texturas, cor e objetos com memória, numa casa cheia de vida.' },
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
  boho: { wall: '#D9A47E', floor: '#C59B6D', sofa: '#E6D3B3', seat: '#D9C39F', rug: '#B5523B', art: '#2E4F5E', plant: '#5F7550' },
  minimal: { wall: '#F2F1EE', floor: '#D4D0C8', sofa: '#8E8A84', seat: '#7F7B75', rug: '#E6E3DE', art: '#BDB8AF', plant: '#9A9A8E' },
};

/**
 * Imagens de referência. Fotos do Pexels (licença Pexels: uso comercial livre,
 * sem obrigação de atribuição). Ficam em /public/briefing-interiores — baixe com
 * `npx tsx scripts/fetch-briefing-images.ts`. Se o arquivo não existir, a tela
 * mostra a ilustração da paleta do estilo. Substitua pelas fotos dos projetos da
 * CBC sempre que possível: basta manter o mesmo nome de arquivo.
 */
export interface RefImage { file: string; pexelsId: number; source: string }
const pexels = (file: string, pexelsId: number, slug: string): RefImage => ({
  file: `/briefing-interiores/${file}.jpg`, pexelsId, source: `https://www.pexels.com/photo/${slug}-${pexelsId}/`,
});

export interface StyleCard {
  id: string;
  style: string;                    // chave principal em STYLES
  tags: Record<string, number>;     // pesos para o cálculo do perfil
  caption: string;
  image: RefImage;
}

export const STYLE_CARDS: StyleCard[] = [
  { id: 'japandi-1', style: 'japandi', tags: { japandi: 1, minimal: 0.3 }, caption: 'Sala aconchegante, madeira clara e poucos objetos', image: pexels('estilo-japandi-1', 29383009, 'cozy-japandi-living-room-with-modern-design') },
  { id: 'modernobr-1', style: 'modernobr', tags: { modernobr: 1 }, caption: 'Madeira escura, linhas retas e móveis de design', image: pexels('estilo-modernobr-1', 18657168, 'modern-design-of-living-room') },
  { id: 'industrial-1', style: 'industrial', tags: { industrial: 1 }, caption: 'Loft com materiais aparentes e janelas amplas', image: pexels('estilo-industrial-1', 2459, 'gray-couch-beside-window') },
  { id: 'escandinavo-1', style: 'escandinavo', tags: { escandinavo: 1, minimal: 0.2 }, caption: 'Ambiente claro, branco e madeira natural', image: pexels('estilo-escandinavo-1', 9565782, 'scandinavian-interior-of-a-living-room') },
  { id: 'classico-1', style: 'classico', tags: { classico: 1 }, caption: 'Lareira, poltronas e mobiliário clássico', image: pexels('estilo-classico-1', 4192783, 'interior-of-elegant-living-room-with-fireplace-and-vintage-furniture') },
  { id: 'tropical-1', style: 'tropical', tags: { tropical: 1, industrial: 0.2 }, caption: 'Plantas grandes ao lado do sofá', image: pexels('estilo-tropical-1', 10163243, 'large-monstera-plant-next-to-sofa') },
  { id: 'boho-1', style: 'boho', tags: { boho: 1 }, caption: 'Texturas, fibras e objetos com personalidade', image: pexels('estilo-boho-1', 8112348, 'cosy-boho-style-interior-design') },
  { id: 'minimal-1', style: 'minimal', tags: { minimal: 1, japandi: 0.2 }, caption: 'Superfícies limpas e tons neutros', image: pexels('estilo-minimal-1', 28991200, 'modern-minimalist-living-room-interior-design') },
  { id: 'japandi-2', style: 'japandi', tags: { japandi: 1, escandinavo: 0.2 }, caption: 'Tons naturais, luz suave e calma', image: pexels('estilo-japandi-2', 12285892, 'minimal-cozy-living-room-interior-design') },
  { id: 'modernobr-2', style: 'modernobr', tags: { modernobr: 0.8, classico: 0.3 }, caption: 'Sofá de couro, tons quentes e peças com história', image: pexels('estilo-modernobr-2', 4133725, 'low-angle-shot-of-black-couch-in-a-living-room') },
  { id: 'industrial-2', style: 'industrial', tags: { industrial: 1 }, caption: 'Tijolo aparente e sofá cinza em L', image: pexels('estilo-industrial-2', 6970027, 'gray-sofa-beside-brown-brick-wall') },
  { id: 'escandinavo-2', style: 'escandinavo', tags: { escandinavo: 1, tropical: 0.2 }, caption: 'Madeira clara, luz natural e muitas plantas', image: pexels('estilo-escandinavo-2', 28744513, 'cozy-scandinavian-living-room-with-plants') },
  { id: 'classico-2', style: 'classico', tags: { classico: 1, boho: 0.2 }, caption: 'Peças de época e decoração tradicional', image: pexels('estilo-classico-2', 5461565, 'vintage-living-room-design') },
  { id: 'tropical-2', style: 'tropical', tags: { tropical: 1, modernobr: 0.3 }, caption: 'Casa aberta para o jardim, muito verde', image: pexels('estilo-tropical-2', 4917176, 'interior-of-typical-villa-located-in-lush-tropical-garden') },
  { id: 'boho-2', style: 'boho', tags: { boho: 1, tropical: 0.2 }, caption: 'Rattan, madeira rústica e aconchego', image: pexels('estilo-boho-2', 8112338, 'rattan-furniture-in-rustic-home-interior-design') },
  { id: 'minimal-2', style: 'minimal', tags: { minimal: 1 }, caption: 'Paredes texturizadas e quase nada à mostra', image: pexels('estilo-minimal-2', 29298710, 'minimalist-living-room-with-textured-walls') },
];

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
  { id: 'comum', label: 'Cama comum', hint: 'Solteiro tradicional', image: pexels('cama-infantil-comum', 15625991, 'kids-bedroom-interior') },
  { id: 'evolutiva', label: 'Cama evolutiva', hint: 'Baixa, montessoriana ou casinha', image: pexels('cama-infantil-evolutiva', 19889143, 'child-furniture-in-a-room') },
  { id: 'bicama', label: 'Bicama', hint: 'Cama extra para visitas' },
  { id: 'beliche', label: 'Beliche', hint: 'Duas camas sobrepostas', image: pexels('cama-infantil-beliche', 4221413, 'brown-wooden-bunk-bed') },
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
    keep: '', notes: '', priorities: PRIORITY_OPTIONS.map(p => p.id),
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

export function blockSummary(b: InteriorBriefingData, block: IBBlock): string {
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
