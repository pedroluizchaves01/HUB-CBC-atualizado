// src/lib/server/agendaReminders.ts
//
// Motor de lembretes da Agenda, executado no SERVIDOR. Mesma filosofia do
// demandAutomation.ts: roda enquanto o processo Node estiver de pé, sem depender
// de ninguém estar logado.
//
// Roda a cada 1 minuto (o demandAutomation roda a cada 10, mas aqui a granularidade
// importa: com 10 min, um lembrete de "1h antes" chegaria entre 50 e 60 min antes).
// O ciclo é barato — uma leitura de uma tabela pequena, filtrada em memória.
//
// GARANTIAS
//   • Idempotência: `attempts` é gravado ANTES do envio. Se o processo morrer no meio,
//     o lembrete não entra em loop de reenvio infinito.
//   • Janela de tolerância: lembrete cujo horário passou há mais de GRACE_MINUTES é
//     descartado, não enviado. Sem isso, um servidor que ficou fora do ar a noite toda
//     dispararia uma enxurrada de avisos atrasados ao voltar.
//   • Nunca lança: falha de envio nunca derruba o processo.

import * as dataService from "./dataService";
import {
  Appointment,
  ScheduledReminder,
  buildMessageContext,
  renderMessage,
  DEFAULT_MESSAGE_TEMPLATE,
} from "../agenda";
import { sendWhatsAppMessage, PermanentSendError } from "./whatsappServer";
import { sendTelegramMessage } from "./telegramServer";

/** Lembrete atrasado mais que isso é descartado em vez de enviado. */
const GRACE_MINUTES = 120;

/** Tentativas por lembrete antes de desistir. */
const MAX_ATTEMPTS = 3;

let isRunning = false;
let timer: NodeJS.Timeout | null = null;

interface ClientRef { id: string; name: string; phone?: string }
interface LeadRef { id: string; name: string; contactPerson?: string; phone?: string }

async function persist(appt: Appointment): Promise<void> {
  await dataService.setDocById("appointments", appt.id, {
    ...appt,
    updatedAt: new Date().toISOString(),
  });
}

async function deliver(
  reminder: ScheduledReminder,
  appt: Appointment,
  clients: ClientRef[],
  leads: LeadRef[]
): Promise<void> {
  const client = appt.clientId ? clients.find((c) => c.id === appt.clientId) : undefined;
  const lead = appt.leadId ? leads.find((l) => l.id === appt.leadId) : undefined;
  const template = reminder.messageTemplate || DEFAULT_MESSAGE_TEMPLATE;

  if (reminder.channel === "telegram") {
    const ctx = buildMessageContext(appt, reminder, {
      clientName: client?.name,
      leadName: lead?.name,
    });
    await sendTelegramMessage(renderMessage(template, ctx));
    return;
  }

  const recipients = (appt.recipients || []).filter((r) => r.phone);
  if (recipients.length === 0) {
    throw new PermanentSendError("Compromisso sem destinatário com telefone.");
  }

  const failures: string[] = [];
  let permanent = 0;

  for (const recipient of recipients) {
    const ctx = buildMessageContext(appt, reminder, {
      clientName: client?.name,
      leadName: lead?.name,
      recipientName: recipient.name,
    });
    try {
      await sendWhatsAppMessage(recipient.phone, renderMessage(template, ctx));
    } catch (err: any) {
      const msg = `${recipient.name || recipient.phone}: ${err?.message || err}`;
      failures.push(msg);
      if (err instanceof PermanentSendError) permanent++;
    }
  }

  if (failures.length === 0) return;

  // Todos os destinatários falharam de forma permanente → não adianta repetir.
  if (permanent === recipients.length) {
    throw new PermanentSendError(failures.join(" | "));
  }
  throw new Error(failures.join(" | "));
}

/** Um ciclo completo. Nunca lança. */
export async function runAgendaReminderCycle(): Promise<void> {
  if (isRunning) {
    console.log("[agendaReminders] Ciclo anterior ainda rodando, pulando esta rodada.");
    return;
  }
  isRunning = true;

  try {
    const [appointments, clients, leads] = await Promise.all([
      dataService.listCollection("appointments") as Promise<Appointment[]>,
      dataService.listCollection("clients") as Promise<ClientRef[]>,
      dataService.listCollection("office_leads") as Promise<LeadRef[]>,
    ]);

    const now = Date.now();
    const graceFloor = now - GRACE_MINUTES * 60000;

    let sent = 0;
    let skipped = 0;
    let failed = 0;

    for (const appt of appointments) {
      if (!appt || appt.status !== "agendado") continue;
      if (!Array.isArray(appt.reminders) || appt.reminders.length === 0) continue;

      // Só os que estão vencidos e ainda não resolvidos.
      const due = appt.reminders.filter((r) => {
        if (r.sentAt || r.skipped) return false;
        const fireAt = new Date(r.fireAt).getTime();
        return Number.isFinite(fireAt) && fireAt <= now;
      });
      if (due.length === 0) continue;

      let dirty = false;

      for (const reminder of due) {
        const fireAt = new Date(reminder.fireAt).getTime();

        // Atrasado demais — o servidor esteve fora. Descarta em silêncio.
        if (fireAt < graceFloor) {
          reminder.skipped = true;
          reminder.lastError = `Descartado: horário passou há mais de ${GRACE_MINUTES} min (servidor indisponível).`;
          dirty = true;
          skipped++;
          continue;
        }

        // Grava a tentativa ANTES de enviar — é o que impede reenvio em loop
        // caso o processo morra entre o envio e a confirmação.
        reminder.attempts = (reminder.attempts || 0) + 1;
        await persist(appt);

        try {
          await deliver(reminder, appt, clients, leads);
          reminder.sentAt = new Date().toISOString();
          reminder.lastError = null;
          sent++;
        } catch (err: any) {
          const message = String(err?.message || err);
          reminder.lastError = message;
          failed++;

          const giveUp = err instanceof PermanentSendError || (reminder.attempts || 0) >= MAX_ATTEMPTS;
          if (giveUp) {
            reminder.skipped = true;
            console.error(`[agendaReminders] Desistindo do lembrete ${reminder.id} de "${appt.title}": ${message}`);
          } else {
            console.warn(`[agendaReminders] Falha ao enviar (tentativa ${reminder.attempts}/${MAX_ATTEMPTS}): ${message}`);
          }
        }
        dirty = true;
      }

      if (dirty) await persist(appt);
    }

    if (sent || skipped || failed) {
      console.log(`[agendaReminders] Ciclo: ${sent} enviado(s), ${skipped} descartado(s), ${failed} falha(s).`);
    }
  } catch (err: any) {
    console.error("[agendaReminders] Erro no ciclo:", err?.message || err);
  } finally {
    isRunning = false;
  }
}

/** Liga o agendador. `intervalMinutes` aceita fração (0.5 = 30s). */
export function startAgendaReminderScheduler(intervalMinutes = 1): void {
  if (timer) return;
  const ms = Math.max(15000, Math.round(intervalMinutes * 60000));
  console.log(`[agendaReminders] Agendador iniciado (a cada ${intervalMinutes} min).`);
  // Primeira execução com folga, para o banco terminar de subir.
  setTimeout(() => { void runAgendaReminderCycle(); }, 15000);
  timer = setInterval(() => { void runAgendaReminderCycle(); }, ms);
}

export function stopAgendaReminderScheduler(): void {
  if (timer) { clearInterval(timer); timer = null; }
}
