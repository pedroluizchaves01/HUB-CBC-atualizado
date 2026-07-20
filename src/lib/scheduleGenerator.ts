// src/lib/scheduleGenerator.ts
// Motor NATIVO (sem IA) de geração automática de cronograma físico-financeiro de obra,
// a partir de um pequeno questionário (tipo de obra, área, padrão, orçamento, início e prazo).
//
// Abordagem "híbrida": este motor gera uma linha de base determinística usando tabelas de
// referência típicas da construção civil brasileira (percentual de custo/prazo por etapa).
// A IA entra depois, opcionalmente, apenas para AJUSTAR o resultado via comando de texto
// (ver /api/planning/refine-schedule no server.ts) — a geração inicial em si não depende de IA.
//
// Referência de distribuição de custos: valores aproximados, amplamente compatíveis com
// composições de referência (tipo TCPO/SINAPI) para construção residencial brasileira.
// São um PONTO DE PARTIDA razoável — o usuário pode ajustar manualmente ou via IA depois.

export type ProjectKind = 'nova_construcao' | 'reforma' | 'comercial';
export type FinishStandard = 'popular' | 'medio' | 'alto';

export interface ScheduleGeneratorInput {
  projectKind: ProjectKind;
  standard: FinishStandard;
  areaM2: number;
  totalBudget: number;
  startDate: string; // YYYY-MM-DD
  durationMonths: number;
}

export interface GeneratedPhase {
  name: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  costPrev: number;
  progress: number;
  costReal: number;
  monthlyProgress: Record<string, number>; // "YYYY-MM" -> % do total da FASE naquele mês (soma ~100)
}

interface PhaseTemplate {
  name: string;
  costShare: number; // fração do orçamento total (soma do template = 1)
}

// ---------------------------------------------------------------------------
// Tabelas de referência por tipo de obra
// ---------------------------------------------------------------------------

const TEMPLATE_NOVA_CONSTRUCAO: PhaseTemplate[] = [
  { name: 'Serviços Preliminares e Canteiro de Obras', costShare: 0.03 },
  { name: 'Fundação', costShare: 0.08 },
  { name: 'Estrutura', costShare: 0.15 },
  { name: 'Alvenaria e Vedações', costShare: 0.10 },
  { name: 'Cobertura', costShare: 0.06 },
  { name: 'Instalações Elétricas', costShare: 0.06 },
  { name: 'Instalações Hidrossanitárias', costShare: 0.06 },
  { name: 'Impermeabilização', costShare: 0.03 },
  { name: 'Revestimentos Internos (reboco/contrapiso)', costShare: 0.08 },
  { name: 'Esquadrias', costShare: 0.07 },
  { name: 'Revestimentos e Pintura Externa', costShare: 0.06 },
  { name: 'Pisos e Revestimentos Cerâmicos', costShare: 0.08 },
  { name: 'Pintura Interna', costShare: 0.05 },
  { name: 'Louças, Metais e Acabamentos', costShare: 0.06 },
  { name: 'Limpeza Final e Entrega', costShare: 0.03 },
];

const TEMPLATE_REFORMA: PhaseTemplate[] = [
  { name: 'Demolição e Remoções', costShare: 0.08 },
  { name: 'Instalações Elétricas', costShare: 0.12 },
  { name: 'Instalações Hidrossanitárias', costShare: 0.12 },
  { name: 'Alvenaria e Vedações (pontual)', costShare: 0.10 },
  { name: 'Impermeabilização', costShare: 0.05 },
  { name: 'Revestimentos Internos (reboco/contrapiso)', costShare: 0.12 },
  { name: 'Esquadrias', costShare: 0.08 },
  { name: 'Pisos e Revestimentos Cerâmicos', costShare: 0.13 },
  { name: 'Pintura Geral', costShare: 0.10 },
  { name: 'Louças, Metais e Acabamentos', costShare: 0.08 },
  { name: 'Limpeza Final e Entrega', costShare: 0.02 },
];

const TEMPLATE_COMERCIAL: PhaseTemplate[] = TEMPLATE_NOVA_CONSTRUCAO;

function getTemplate(kind: ProjectKind): PhaseTemplate[] {
  if (kind === 'reforma') return TEMPLATE_REFORMA;
  if (kind === 'comercial') return TEMPLATE_COMERCIAL;
  return TEMPLATE_NOVA_CONSTRUCAO;
}

// ---------------------------------------------------------------------------
// Ajuste por padrão de acabamento: desloca uma fração do custo das etapas
// estruturais para as etapas de acabamento em padrões mais altos.
// ---------------------------------------------------------------------------

const FINISH_KEYWORDS = ['revestimento', 'esquadria', 'pintura', 'louça', 'metais', 'acabamento', 'piso'];
const STRUCTURAL_KEYWORDS = ['fundação', 'estrutura', 'alvenaria', 'demolição'];

function applyStandardAdjustment(template: PhaseTemplate[], standard: FinishStandard): PhaseTemplate[] {
  if (standard === 'medio') return template;

  const shiftFactor = standard === 'alto' ? 0.18 : -0.12; // alto: +18% nas fases de acabamento; popular: -12%
  const isFinishPhase = (name: string) => FINISH_KEYWORDS.some((k) => name.toLowerCase().includes(k));
  const isStructuralPhase = (name: string) => STRUCTURAL_KEYWORDS.some((k) => name.toLowerCase().includes(k));

  const finishTotal = template.filter((p) => isFinishPhase(p.name)).reduce((s, p) => s + p.costShare, 0);
  const structuralTotal = template.filter((p) => isStructuralPhase(p.name)).reduce((s, p) => s + p.costShare, 0);
  if (finishTotal === 0 || structuralTotal === 0) return template;

  const shiftAmount = finishTotal * shiftFactor; // quanto será movido (positivo = de estrutura pra acabamento)

  return template.map((p) => {
    if (isFinishPhase(p.name)) {
      const proportion = p.costShare / finishTotal;
      return { ...p, costShare: p.costShare + shiftAmount * proportion };
    }
    if (isStructuralPhase(p.name)) {
      const proportion = p.costShare / structuralTotal;
      return { ...p, costShare: Math.max(0.005, p.costShare - shiftAmount * proportion) };
    }
    return p;
  });
}

// ---------------------------------------------------------------------------
// Curva S (smoothstep) para distribuir o progresso físico de cada fase ao
// longo dos meses em que ela ocorre — em vez de uma rampa linear "ingênua".
// ---------------------------------------------------------------------------

function smoothstep(t: number): number {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

function daysBetween(a: string, b: string): number {
  const da = new Date(a + 'T00:00:00').getTime();
  const db = new Date(b + 'T00:00:00').getTime();
  return Math.round((db - da) / (1000 * 60 * 60 * 24));
}

function monthKey(dateStr: string): string {
  return dateStr.slice(0, 7); // "YYYY-MM"
}

function lastDayOfMonth(year: number, monthIndex0: number): string {
  const d = new Date(year, monthIndex0 + 1, 0);
  return d.toISOString().split('T')[0];
}

function firstDayOfMonth(year: number, monthIndex0: number): string {
  const d = new Date(year, monthIndex0, 1);
  return d.toISOString().split('T')[0];
}

/** Gera o monthlyProgress (curva S) de uma fase com base em suas datas de início/fim. */
function buildMonthlyProgress(startDate: string, endDate: string): Record<string, number> {
  const totalDays = Math.max(1, daysBetween(startDate, endDate) + 1);
  const result: Record<string, number> = {};

  let cursor = new Date(startDate + 'T00:00:00');
  const end = new Date(endDate + 'T00:00:00');
  let prevCum = 0;

  while (cursor <= end) {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const monthEndStr = lastDayOfMonth(year, month);
    const overlapEndStr = monthEndStr < endDate ? monthEndStr : endDate;

    const elapsedToOverlapEnd = daysBetween(startDate, overlapEndStr) + 1;
    const t = elapsedToOverlapEnd / totalDays;
    const cum = smoothstep(t) * 100;

    const key = `${year}-${String(month + 1).padStart(2, '0')}`;
    result[key] = Math.round((cum - prevCum) * 10) / 10;
    prevCum = cum;

    // avança pro início do próximo mês
    const nextMonthStart = new Date(year, month + 1, 1);
    cursor = nextMonthStart;
  }

  // Corrige arredondamentos para que a soma feche em exatamente 100
  const keys = Object.keys(result);
  const sum = keys.reduce((s, k) => s + result[k], 0);
  const diff = Math.round((100 - sum) * 10) / 10;
  if (keys.length > 0 && Math.abs(diff) >= 0.1) {
    const lastKey = keys[keys.length - 1];
    result[lastKey] = Math.round((result[lastKey] + diff) * 10) / 10;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Função principal
// ---------------------------------------------------------------------------

export function generateScheduleFromAnswers(input: ScheduleGeneratorInput): GeneratedPhase[] {
  const baseTemplate = getTemplate(input.projectKind);
  const adjustedTemplate = applyStandardAdjustment(baseTemplate, input.standard);

  // Normaliza os costShare para somar exatamente 1 (por segurança, após os ajustes de padrão)
  const shareSum = adjustedTemplate.reduce((s, p) => s + p.costShare, 0);
  const normalizedTemplate = adjustedTemplate.map((p) => ({ ...p, costShare: p.costShare / shareSum }));

  const totalDays = Math.max(normalizedTemplate.length, Math.round(input.durationMonths * 30.44));

  let cursorDate = input.startDate;
  const phases: GeneratedPhase[] = normalizedTemplate.map((tpl) => {
    const phaseDays = Math.max(1, Math.round(totalDays * tpl.costShare));
    const phaseStart = cursorDate;
    const phaseEnd = addDays(phaseStart, phaseDays - 1);
    cursorDate = addDays(phaseEnd, 1);

    return {
      name: tpl.name,
      startDate: phaseStart,
      endDate: phaseEnd,
      costPrev: Math.round(input.totalBudget * tpl.costShare * 100) / 100,
      progress: 0,
      costReal: 0,
      monthlyProgress: buildMonthlyProgress(phaseStart, phaseEnd),
    };
  });

  // Garante que a última fase termine exatamente na data final planejada (prazo total),
  // absorvendo qualquer folga de arredondamento de dias na última etapa.
  if (phases.length > 0) {
    const plannedEnd = addDays(input.startDate, totalDays - 1);
    const last = phases[phases.length - 1];
    if (last.endDate !== plannedEnd) {
      last.endDate = plannedEnd;
      last.monthlyProgress = buildMonthlyProgress(last.startDate, last.endDate);
    }
  }

  return phases;
}
