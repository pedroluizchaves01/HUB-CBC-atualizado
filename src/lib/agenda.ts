// src/lib/agenda.ts
//
// Tipos e regras da Agenda, COMPARTILHADOS entre frontend e backend.
// Não importa nada de React nem do Node — pode ser usado dos dois lados.
//
// Conceito central: cada lembrete guarda um `fireAt` ABSOLUTO (ISO UTC), calculado
// no momento em que o compromisso é salvo/editado. O agendador do servidor então só
// precisa comparar `fireAt <= agora`, sem refazer conta de fuso a cada ciclo. Toda a
// complexidade de timezone fica concentrada em computeFireAt(), aqui.

export const AGENDA_TIMEZONE = "America/Sao_Paulo";

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export type ReminderChannel = "whatsapp" | "telegram";

/**
 * Regra de lembrete — o que o usuário configura na tela.
 *
 * mode "clock"  → horário de relógio em um dia relativo ao evento.
 *                 daysBefore: 0 + atTime "07:00" = "no dia do evento, às 7h"
 *                 daysBefore: 1 + atTime "20:00" = "na véspera, às 20h"
 * mode "offset" → tempo corrido antes do evento.
 *                 minutesBefore: 60 = "1h antes"
 */
export interface ReminderRule {
  id: string;
  mode: "clock" | "offset";
  daysBefore?: number;
  atTime?: string;        // "HH:MM"
  minutesBefore?: number;
  channel: ReminderChannel;
  /** Sobrescreve o texto padrão. Aceita as variáveis de renderMessage(). */
  messageTemplate?: string;
}

/** Regra já materializada em um instante concreto, com estado de envio. */
export interface ScheduledReminder extends ReminderRule {
  fireAt: string;                 // ISO UTC
  sentAt?: string | null;
  attempts?: number;
  lastError?: string | null;
  /** Marcado quando o lembrete foi descartado por estar velho demais (servidor caiu). */
  skipped?: boolean;
}

export interface AppointmentRecipient {
  name: string;
  /** Sempre normalizado em E.164 sem "+": 5544999998888 */
  phone: string;
  userId?: string;
  source?: "manual" | "user" | "client" | "lead";
}

export type AppointmentStatus = "agendado" | "realizado" | "cancelado";

export interface Appointment {
  id: string;
  title: string;
  /** Instante do compromisso, ISO UTC. */
  startAt: string;
  durationMin: number;
  location?: string;
  notes?: string;

  // Vínculos com o que já existe no sistema
  clientId?: string | null;
  leadId?: string | null;       // OfficeLead — o "negócio" do CRM
  projectId?: string | null;

  recipients: AppointmentRecipient[];
  reminders: ScheduledReminder[];

  status: AppointmentStatus;
  createdByUserId: string;
  createdAt: string;
  updatedAt?: string;
}

/** Modelo reutilizável de lembretes, salvo pelo usuário. */
export interface ReminderTemplate {
  id: string;
  name: string;
  description?: string;
  rules: ReminderRule[];
  /** Aplicado automaticamente ao criar um compromisso novo. */
  isDefault?: boolean;
  createdAt: string;
  createdByUserId?: string;
}

// ---------------------------------------------------------------------------
// Modelos de fábrica (o que o usuário pediu, pronto no primeiro boot)
// ---------------------------------------------------------------------------

export const BUILTIN_TEMPLATES: Omit<ReminderTemplate, "createdAt">[] = [
  {
    id: "tpl-padrao",
    name: "Padrão (manhã + 1h antes)",
    description: "Aviso às 7h do dia do compromisso e outro 1 hora antes.",
    isDefault: true,
    rules: [
      { id: "r1", mode: "clock", daysBefore: 0, atTime: "07:00", channel: "whatsapp" },
      { id: "r2", mode: "offset", minutesBefore: 60, channel: "whatsapp" },
    ],
  },
  {
    id: "tpl-reuniao-cliente",
    name: "Reunião com cliente",
    description: "Véspera à noite, manhã do dia e 1h antes — para compromissos externos.",
    rules: [
      { id: "r1", mode: "clock", daysBefore: 1, atTime: "18:00", channel: "whatsapp" },
      { id: "r2", mode: "clock", daysBefore: 0, atTime: "07:00", channel: "whatsapp" },
      { id: "r3", mode: "offset", minutesBefore: 60, channel: "whatsapp" },
    ],
  },
  {
    id: "tpl-visita-obra",
    name: "Visita à obra",
    description: "Manhã do dia e 30 minutos antes, para dar tempo de deslocamento.",
    rules: [
      { id: "r1", mode: "clock", daysBefore: 0, atTime: "06:30", channel: "whatsapp" },
      { id: "r2", mode: "offset", minutesBefore: 30, channel: "whatsapp" },
    ],
  },
];

// ---------------------------------------------------------------------------
// Fuso horário
//
// O container roda em UTC. "7h da manhã" precisa ser 7h em São Paulo, senão o
// lembrete chega às 4h. O Brasil não usa horário de verão desde 2019 (offset fixo
// -03:00), mas derivamos o offset via Intl em vez de cravar -3, para o código não
// quebrar caso o horário de verão volte por lei.
// ---------------------------------------------------------------------------

/** Offset do fuso, em minutos, no instante dado (ex.: -180 para BRT). */
export function timeZoneOffsetMinutes(date: Date, timeZone = AGENDA_TIMEZONE): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const parts = dtf.formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  // Hora 24 aparece em alguns runtimes para meia-noite; normaliza para 0.
  const asIfUtc = Date.UTC(
    get("year"), get("month") - 1, get("day"),
    get("hour") % 24, get("minute"), get("second")
  );
  return (asIfUtc - date.getTime()) / 60000;
}

/**
 * Converte uma data/hora "de parede" no fuso indicado para o instante UTC correto.
 * Itera porque o offset depende do próprio instante (relevante só se houver DST).
 */
export function zonedWallTimeToUtc(
  year: number, month: number, day: number,
  hour: number, minute: number,
  timeZone = AGENDA_TIMEZONE
): Date {
  const wallAsUtc = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  let ts = wallAsUtc;
  for (let i = 0; i < 3; i++) {
    const offset = timeZoneOffsetMinutes(new Date(ts), timeZone);
    const next = wallAsUtc - offset * 60000;
    if (next === ts) break;
    ts = next;
  }
  return new Date(ts);
}

/** Componentes de data/hora "de parede" de um instante, no fuso indicado. */
export function utcToZonedParts(date: Date, timeZone = AGENDA_TIMEZONE) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
  const parts = dtf.formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return {
    year: get("year"), month: get("month"), day: get("day"),
    hour: get("hour") % 24, minute: get("minute"),
  };
}

// ---------------------------------------------------------------------------
// Cálculo do instante de disparo
// ---------------------------------------------------------------------------

/**
 * Instante absoluto (UTC) em que a regra deve disparar, para um compromisso
 * que começa em `startAt`. Retorna null se a regra estiver malformada.
 */
export function computeFireAt(rule: ReminderRule, startAtIso: string): Date | null {
  const start = new Date(startAtIso);
  if (Number.isNaN(start.getTime())) return null;

  if (rule.mode === "offset") {
    const minutes = rule.minutesBefore;
    if (typeof minutes !== "number" || !Number.isFinite(minutes) || minutes < 0) return null;
    return new Date(start.getTime() - minutes * 60000);
  }

  // mode "clock": pega o dia do evento NO FUSO LOCAL, recua daysBefore dias e
  // aplica o horário de parede. Recuar o dia antes de converter é o que garante
  // que "véspera às 20h" caia na véspera local, não na véspera UTC.
  const time = rule.atTime;
  if (!time || !/^\d{1,2}:\d{2}$/.test(time)) return null;
  const [hh, mm] = time.split(":").map(Number);
  if (hh > 23 || mm > 59) return null;

  const local = utcToZonedParts(start);
  const daysBefore = rule.daysBefore ?? 0;

  // Aritmética de calendário em UTC puro só para achar o dia certo (sem hora envolvida).
  const dayCursor = new Date(Date.UTC(local.year, local.month - 1, local.day));
  dayCursor.setUTCDate(dayCursor.getUTCDate() - daysBefore);

  return zonedWallTimeToUtc(
    dayCursor.getUTCFullYear(),
    dayCursor.getUTCMonth() + 1,
    dayCursor.getUTCDate(),
    hh, mm
  );
}

/**
 * Materializa regras em lembretes agendados, PRESERVANDO o estado de envio dos
 * lembretes que já existiam (comparados por id). Chamado ao criar e ao editar um
 * compromisso — assim, remarcar uma reunião reagenda os avisos ainda não enviados
 * sem reenviar os que já saíram.
 */
export function materializeReminders(
  rules: ReminderRule[],
  startAtIso: string,
  previous: ScheduledReminder[] = []
): ScheduledReminder[] {
  const prevById = new Map(previous.map((r) => [r.id, r]));
  const out: ScheduledReminder[] = [];

  for (const rule of rules) {
    const fireAt = computeFireAt(rule, startAtIso);
    if (!fireAt) continue;
    const prev = prevById.get(rule.id);
    out.push({
      ...rule,
      fireAt: fireAt.toISOString(),
      // Já enviado continua enviado, mesmo que o horário mude.
      sentAt: prev?.sentAt ?? null,
      attempts: prev?.attempts ?? 0,
      lastError: prev?.lastError ?? null,
      skipped: prev?.skipped ?? false,
    });
  }
  return out;
}

/** Descrição legível da regra, para a UI. */
export function describeRule(rule: ReminderRule): string {
  if (rule.mode === "offset") {
    const m = rule.minutesBefore ?? 0;
    if (m === 0) return "Na hora do compromisso";
    if (m < 60) return `${m} minutos antes`;
    if (m % 60 === 0) return `${m / 60}h antes`;
    return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")} antes`;
  }
  const time = rule.atTime ?? "00:00";
  const d = rule.daysBefore ?? 0;
  if (d === 0) return `No dia, às ${time}`;
  if (d === 1) return `Na véspera, às ${time}`;
  return `${d} dias antes, às ${time}`;
}

// ---------------------------------------------------------------------------
// Telefones
// ---------------------------------------------------------------------------

/**
 * Normaliza um telefone brasileiro para E.164 sem "+": 5544999998888.
 * Aceita "(44) 99999-8888", "+55 44 99999-8888", "44999998888" etc.
 * Retorna null se não conseguir interpretar com segurança.
 */
export function normalizePhoneBR(raw: string): string | null {
  if (!raw) return null;
  let digits = raw.replace(/\D/g, "");
  if (!digits) return null;

  // Remove zeros de discagem nacional/operadora no início.
  digits = digits.replace(/^0+/, "");

  // Já veio com código do país.
  if (digits.length >= 12 && digits.startsWith("55")) {
    const rest = digits.slice(2);
    if (rest.length === 10 || rest.length === 11) return "55" + rest;
    return null;
  }

  // DDD + 8 (fixo/celular antigo) ou 9 dígitos (celular).
  if (digits.length === 10 || digits.length === 11) return "55" + digits;

  return null;
}

/** Máscara para exibição: (44) 99999-8888 */
export function formatPhoneBR(e164: string): string {
  const d = e164.replace(/\D/g, "").replace(/^55/, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return e164;
}

// ---------------------------------------------------------------------------
// Mensagem
// ---------------------------------------------------------------------------

export const DEFAULT_MESSAGE_TEMPLATE =
  "🗓️ *{{titulo}}*\n\n" +
  "🕐 {{quando}}\n" +
  "{{#local}}📍 {{local}}\n{{/local}}" +
  "{{#cliente}}👤 {{cliente}}\n{{/cliente}}" +
  "{{#observacoes}}\n📝 {{observacoes}}\n{{/observacoes}}" +
  "\n_Chaves Brites Correa_";

export interface MessageContext {
  titulo: string;
  data: string;        // 30/07/2026
  hora: string;        // 14:00
  quando: string;      // "hoje às 14:00" / "amanhã às 14:00" / "30/07 às 14:00"
  antecedencia: string;
  local?: string;
  cliente?: string;
  negocio?: string;
  observacoes?: string;
  destinatario?: string;
}

/**
 * Renderiza o template. Suporta {{var}} e blocos condicionais
 * {{#var}}...{{/var}} (renderizados só quando a variável tem conteúdo).
 * Deliberadamente minúsculo — não vale a pena uma dependência de Mustache aqui.
 */
export function renderMessage(template: string, ctx: MessageContext): string {
  const value = (key: string): string => {
    const v = (ctx as unknown as Record<string, unknown>)[key];
    return v === undefined || v === null ? "" : String(v);
  };

  // Blocos condicionais primeiro, para não deixar rastro quando vazios.
  let out = template.replace(
    /\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g,
    (_m, key: string, inner: string) => (value(key).trim() ? inner : "")
  );

  out = out.replace(/\{\{(\w+)\}\}/g, (_m, key: string) => value(key));

  // Limpa excesso de linhas em branco deixado pelos blocos removidos.
  return out.replace(/\n{3,}/g, "\n\n").trim();
}

/** Monta o contexto de mensagem a partir do compromisso. */
export function buildMessageContext(
  appt: Appointment,
  reminder: ReminderRule,
  extras: { clientName?: string; leadName?: string; recipientName?: string } = {}
): MessageContext {
  const start = new Date(appt.startAt);
  const local = utcToZonedParts(start);
  const pad = (n: number) => String(n).padStart(2, "0");

  const data = `${pad(local.day)}/${pad(local.month)}/${local.year}`;
  const hora = `${pad(local.hour)}:${pad(local.minute)}`;

  // "hoje"/"amanhã" comparando dias LOCAIS, não UTC.
  const nowLocal = utcToZonedParts(new Date());
  const dayIndex = (p: { year: number; month: number; day: number }) =>
    Math.floor(Date.UTC(p.year, p.month - 1, p.day) / 86400000);
  const delta = dayIndex(local) - dayIndex(nowLocal);

  let quando: string;
  if (delta === 0) quando = `hoje às ${hora}`;
  else if (delta === 1) quando = `amanhã às ${hora}`;
  else quando = `${data} às ${hora}`;

  return {
    titulo: appt.title,
    data,
    hora,
    quando,
    antecedencia: describeRule(reminder),
    local: appt.location || undefined,
    cliente: extras.clientName || undefined,
    negocio: extras.leadName || undefined,
    observacoes: appt.notes || undefined,
    destinatario: extras.recipientName || undefined,
  };
}
