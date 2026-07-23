// scripts/test-agenda.ts — validação da lógica de agenda. Rode com: npx tsx scripts/test-agenda.ts
import {
  computeFireAt, materializeReminders, normalizePhoneBR,
  renderMessage, buildMessageContext, describeRule,
  DEFAULT_MESSAGE_TEMPLATE, Appointment, ReminderRule,
} from "../src/lib/agenda";

let pass = 0, fail = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = String(actual) === String(expected);
  console.log(`${ok ? "  ok  " : " FAIL "} ${label}`);
  if (!ok) console.log(`         esperado: ${expected}\n         obtido:   ${actual}`);
  ok ? pass++ : fail++;
}

const clock = (daysBefore: number, atTime: string): ReminderRule =>
  ({ id: `c${daysBefore}${atTime}`, mode: "clock", daysBefore, atTime, channel: "whatsapp" });
const offset = (minutesBefore: number): ReminderRule =>
  ({ id: `o${minutesBefore}`, mode: "offset", minutesBefore, channel: "whatsapp" });

console.log("\n— Reunião 30/07/2026 às 14:00 BRT (= 17:00Z) —");
const tarde = "2026-07-30T17:00:00.000Z";
check("7h do dia → 10:00Z", computeFireAt(clock(0, "07:00"), tarde)?.toISOString(), "2026-07-30T10:00:00.000Z");
check("1h antes  → 16:00Z", computeFireAt(offset(60), tarde)?.toISOString(), "2026-07-30T16:00:00.000Z");
check("véspera 18h → 29/07 21:00Z", computeFireAt(clock(1, "18:00"), tarde)?.toISOString(), "2026-07-29T21:00:00.000Z");

console.log("\n— A ARMADILHA: reunião 30/07 às 22:00 BRT (= 31/07 01:00Z, vira o dia em UTC) —");
const noite = "2026-07-31T01:00:00.000Z";
check("7h do dia deve cair em 30/07, não 31/07", computeFireAt(clock(0, "07:00"), noite)?.toISOString(), "2026-07-30T10:00:00.000Z");
check("véspera é 29/07, não 30/07", computeFireAt(clock(1, "18:00"), noite)?.toISOString(), "2026-07-29T21:00:00.000Z");
check("1h antes → 31/07 00:00Z", computeFireAt(offset(60), noite)?.toISOString(), "2026-07-31T00:00:00.000Z");

console.log("\n— Compromisso de madrugada: 01/08 às 00:30 BRT (= 01/08 03:30Z) —");
const madrugada = "2026-08-01T03:30:00.000Z";
check("7h 'do dia' cai DEPOIS do evento (esperado)", computeFireAt(clock(0, "07:00"), madrugada)?.toISOString(), "2026-08-01T10:00:00.000Z");
check("30 min antes → 03:00Z", computeFireAt(offset(30), madrugada)?.toISOString(), "2026-08-01T03:00:00.000Z");

console.log("\n— Idempotência ao remarcar —");
const rules = [clock(0, "07:00"), offset(60)];
const v1 = materializeReminders(rules, tarde);
v1[0].sentAt = "2026-07-30T10:00:05.000Z";
v1[1].attempts = 2;
const v2 = materializeReminders(rules, "2026-07-30T20:00:00.000Z"); // remarcou para 17h BRT
const v2keep = materializeReminders(rules, "2026-07-30T20:00:00.000Z", v1);
check("sem histórico, sentAt é nulo", v2[0].sentAt, "null");
check("com histórico, lembrete já enviado permanece enviado", v2keep[0].sentAt, "2026-07-30T10:00:05.000Z");
check("lembrete não enviado é reagendado", v2keep[1].fireAt, "2026-07-30T19:00:00.000Z");
check("tentativas anteriores preservadas", v2keep[1].attempts, "2");

console.log("\n— Telefones —");
check("(44) 99999-8888", normalizePhoneBR("(44) 99999-8888"), "5544999998888");
check("+55 44 99999-8888", normalizePhoneBR("+55 44 99999-8888"), "5544999998888");
check("044 99999-8888 (zero de operadora)", normalizePhoneBR("044 99999-8888"), "5544999998888");
check("fixo 10 dígitos", normalizePhoneBR("4433334444"), "554433334444");
check("lixo → null", normalizePhoneBR("123"), "null");
check("vazio → null", normalizePhoneBR(""), "null");

console.log("\n— Descrições —");
check("offset 60", describeRule(offset(60)), "1h antes");
check("offset 30", describeRule(offset(30)), "30 minutos antes");
check("offset 90", describeRule(offset(90)), "1h30 antes");
check("clock hoje", describeRule(clock(0, "07:00")), "No dia, às 07:00");
check("clock véspera", describeRule(clock(1, "18:00")), "Na véspera, às 18:00");

console.log("\n— Mensagem —");
const appt: Appointment = {
  id: "a1", title: "Reunião de alinhamento", startAt: tarde, durationMin: 60,
  location: "Escritório", notes: "", clientId: null, leadId: null, projectId: null,
  recipients: [], reminders: [], status: "agendado", createdByUserId: "u1", createdAt: tarde,
};
const ctx = buildMessageContext(appt, offset(60), { clientName: "Construtora XYZ" });
const msg = renderMessage(DEFAULT_MESSAGE_TEMPLATE, ctx);
console.log("\n" + msg + "\n");
check("data local correta", ctx.data, "30/07/2026");
check("hora local correta", ctx.hora, "14:00");
check("bloco de local renderizado", msg.includes("Escritório"), "true");
check("bloco de observações omitido (vazio)", msg.includes("📝"), "false");
check("cliente renderizado", msg.includes("Construtora XYZ"), "true");

console.log(`\n${pass} passou, ${fail} falhou.\n`);
process.exit(fail ? 1 : 0);
