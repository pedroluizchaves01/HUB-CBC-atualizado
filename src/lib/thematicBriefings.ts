// ============================================================
// Briefings temáticos vinculados a etapas do projeto.
// Estes briefings são liberados automaticamente quando a etapa
// correspondente é liberada (ex.: elétrica e hidráulica no anteprojeto).
// Reutilizam o mesmo formato de BriefingQuestion/BriefingAnswer.
// ============================================================
import type { BriefingQuestion } from './briefingTemplate';

const q = (id: string, group: string, text: string): BriefingQuestion => ({ id, group, text });

// ---- Briefing de ELÉTRICA (anteprojeto) ----
export const BRIEFING_ELETRICA: BriefingQuestion[] = [
  // Iluminação
  q('ele_ilum_tipo', 'Iluminação', 'Que tipo de iluminação você prefere em cada ambiente (embutida/spots, pendentes, luminárias de piso)?'),
  q('ele_ilum_dimer', 'Iluminação', 'Deseja dimerização (controle de intensidade) em algum ambiente? Quais?'),
  q('ele_ilum_cenas', 'Iluminação', 'Tem interesse em cenas de iluminação (ex.: cena "jantar", cena "cinema")?'),
  q('ele_ilum_externa', 'Iluminação', 'Como imagina a iluminação externa (fachada, jardim, área da piscina)?'),
  // Tomadas e pontos
  q('ele_tomadas', 'Tomadas e pontos', 'Há ambientes onde você quer tomadas em pontos específicos (bancadas, cabeceira da cama, home office)?'),
  q('ele_tv', 'Tomadas e pontos', 'Em quais ambientes deseja pontos de TV? Serão de parede (TV pendurada) ou sobre móvel?'),
  q('ele_internet', 'Tomadas e pontos', 'Onde deseja pontos de internet cabeada / Wi-Fi reforçado?'),
  q('ele_externas', 'Tomadas e pontos', 'Precisa de tomadas externas (área gourmet, jardim, garagem)?'),
  // Climatização e cargas
  q('ele_ar', 'Climatização e cargas', 'Quais ambientes terão ar-condicionado? Já sabe o tipo (split, multi-split)?'),
  q('ele_aquecimento', 'Climatização e cargas', 'Haverá aquecimento (chuveiro elétrico, aquecedor, piso aquecido)?'),
  q('ele_carro', 'Climatização e cargas', 'Prevê carregador de carro elétrico agora ou no futuro?'),
  // Automação e segurança
  q('ele_automacao', 'Automação e segurança', 'Tem interesse em automação (luzes, cortinas, portões, fechaduras) via app/voz?'),
  q('ele_seguranca', 'Automação e segurança', 'Deseja infraestrutura para câmeras, alarme, interfone ou cerca elétrica?'),
  q('ele_energia', 'Automação e segurança', 'Prevê energia solar ou gerador? Agora ou infraestrutura para o futuro?'),
  // Observações
  q('ele_obs', 'Observações', 'Algum ponto elétrico específico que você faz questão ou quer evitar?'),
];

export const GRUPOS_ELETRICA = [
  'Iluminação', 'Tomadas e pontos', 'Climatização e cargas', 'Automação e segurança', 'Observações',
];

// ---- Briefing de HIDRÁULICA (anteprojeto) ----
export const BRIEFING_HIDRAULICA: BriefingQuestion[] = [
  // Aquecimento de água
  q('hid_aquecimento', 'Aquecimento de água', 'Como prefere aquecer a água (solar, gás, elétrico, bomba de calor)?'),
  q('hid_agua_quente', 'Aquecimento de água', 'Em quais pontos deseja água quente (chuveiros, cozinha, lavanderia, torneiras)?'),
  // Banheiros
  q('hid_ducha', 'Banheiros', 'Que tipo de ducha/chuveiro você prefere (ducha de teto, convencional, com hidro)?'),
  q('hid_banheira', 'Banheiros', 'Deseja banheira ou hidromassagem em algum banheiro? Qual?'),
  q('hid_louças', 'Banheiros', 'Tem preferência de louças/metais (bacia suspensa, cuba de apoio, torneira específica)?'),
  // Áreas molhadas e externas
  q('hid_cozinha', 'Áreas molhadas', 'Na cozinha, prevê filtro de água, torneira gourmet, máquina de lava-louças?'),
  q('hid_lavanderia', 'Áreas molhadas', 'Na lavanderia, quantas máquinas (lavar/secar)? Tanque?'),
  q('hid_externas', 'Áreas molhadas', 'Precisa de torneiras externas para jardim, área gourmet ou lavagem de carro?'),
  // Piscina e reuso
  q('hid_piscina', 'Piscina e reuso', 'Haverá piscina? Aquecida? Com que sistema?'),
  q('hid_reuso', 'Piscina e reuso', 'Interesse em reuso de água da chuva ou reaproveitamento de águas cinzas?'),
  q('hid_pressao', 'Piscina e reuso', 'Já teve problemas de pressão de água? Deseja pressurizador?'),
  // Observações
  q('hid_obs', 'Observações', 'Algum ponto hidráulico específico que você faz questão ou quer evitar?'),
];

export const GRUPOS_HIDRAULICA = [
  'Aquecimento de água', 'Banheiros', 'Áreas molhadas', 'Piscina e reuso', 'Observações',
];

// ---- Registro de briefings temáticos por etapa ----
// A chave 'phaseKey' casa com a key da etapa no catálogo (phaseTemplates).
export interface ThematicBriefing {
  id: string;              // identificador do briefing temático
  phaseKey: string;        // etapa que libera este briefing
  title: string;           // título exibido
  description: string;     // subtítulo
  questions: BriefingQuestion[];
  groups: string[];
}

export const THEMATIC_BRIEFINGS: ThematicBriefing[] = [
  {
    id: 'brief_eletrica',
    phaseKey: 'anteprojeto',
    title: 'Briefing de Elétrica',
    description: 'Suas preferências para as plantas de pontos elétricos e iluminação.',
    questions: BRIEFING_ELETRICA,
    groups: GRUPOS_ELETRICA,
  },
  {
    id: 'brief_hidraulica',
    phaseKey: 'anteprojeto',
    title: 'Briefing de Hidráulica',
    description: 'Suas preferências para as plantas hidráulicas e de água quente.',
    questions: BRIEFING_HIDRAULICA,
    groups: GRUPOS_HIDRAULICA,
  },
];

// Retorna os briefings temáticos ligados a uma etapa (por key).
export function briefingsDaEtapa(phaseKey?: string): ThematicBriefing[] {
  if (!phaseKey) return [];
  return THEMATIC_BRIEFINGS.filter(b => b.phaseKey === phaseKey);
}
