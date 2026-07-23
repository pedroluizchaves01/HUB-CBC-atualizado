// src/lib/server/whatsappServer.ts
//
// Serviço de WhatsApp SOMENTE backend. Credenciais vivem aqui (env ou settings/whatsapp),
// NUNCA no bundle do frontend — mesmo padrão já usado por telegramServer.ts.
//
// Três provedores atrás de uma única função sendMessage(). Trocar de provedor é mudar
// o campo `provider` na tela de configuração; nenhum outro arquivo do sistema muda.
//
//   evolution → Evolution API self-hosted (não oficial, via WhatsApp Web/Baileys).
//               Grátis, sem template, mas o número pode ser banido pela Meta.
//               USE SEMPRE UM CHIP DEDICADO, nunca o WhatsApp principal da empresa.
//   cloud     → WhatsApp Cloud API oficial da Meta. Mensagem proativa exige template
//               aprovado (categoria utility). Sem risco de ban, custa centavos/msg.
//   twilio    → Twilio como intermediário da Cloud API. Sandbox rápido para testar.

import { getAdminDb } from "./db";
import { normalizePhoneBR } from "../agenda";

export type WhatsAppProvider = "none" | "evolution" | "cloud" | "twilio";

export interface WhatsAppConfig {
  provider: WhatsAppProvider;
  enabled: boolean;

  // evolution
  evolutionBaseUrl: string;   // http://evolution-api:8080
  evolutionInstance: string;  // nome da instância criada no painel
  evolutionApiKey: string;

  // cloud (Meta)
  cloudPhoneNumberId: string;
  cloudAccessToken: string;
  /** Template aprovado usado para mensagens proativas. */
  cloudTemplateName: string;
  cloudTemplateLang: string;

  // twilio
  twilioAccountSid: string;
  twilioAuthToken: string;
  twilioFrom: string;         // whatsapp:+14155238886

  /** Se true, não envia de verdade — só registra no log. Útil para testar a agenda. */
  dryRun: boolean;

  // Destinatário padrão dos lembretes da Agenda: o telefone principal do usuário.
  // Fica aqui para não ser redigitado a cada compromisso. NÃO é segredo — é o
  // número que RECEBE, não o que envia.
  defaultRecipientPhone: string;
  defaultRecipientName: string;
}

const DEFAULTS: WhatsAppConfig = {
  provider: "none",
  enabled: false,
  evolutionBaseUrl: "",
  evolutionInstance: "",
  evolutionApiKey: "",
  cloudPhoneNumberId: "",
  cloudAccessToken: "",
  cloudTemplateName: "lembrete_compromisso",
  cloudTemplateLang: "pt_BR",
  twilioAccountSid: "",
  twilioAuthToken: "",
  twilioFrom: "",
  dryRun: false,
  defaultRecipientPhone: "",
  defaultRecipientName: "Meu telefone",
};

/** Campos que nunca podem sair do servidor em claro. */
const SECRET_FIELDS = [
  "evolutionApiKey",
  "cloudAccessToken",
  "twilioAuthToken",
] as const;

// ---------------------------------------------------------------------------
// Configuração
// ---------------------------------------------------------------------------

export async function getWhatsAppConfig(): Promise<WhatsAppConfig> {
  const cfg: WhatsAppConfig = {
    ...DEFAULTS,
    provider: (process.env.WHATSAPP_PROVIDER as WhatsAppProvider) || DEFAULTS.provider,
    evolutionBaseUrl: process.env.EVOLUTION_BASE_URL || "",
    evolutionInstance: process.env.EVOLUTION_INSTANCE || "",
    evolutionApiKey: process.env.EVOLUTION_API_KEY || "",
    cloudPhoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || "",
    cloudAccessToken: process.env.WHATSAPP_ACCESS_TOKEN || "",
    twilioAccountSid: process.env.TWILIO_ACCOUNT_SID || "",
    twilioAuthToken: process.env.TWILIO_AUTH_TOKEN || "",
    twilioFrom: process.env.TWILIO_WHATSAPP_FROM || "",
    defaultRecipientPhone: process.env.AGENDA_DEFAULT_PHONE || "",
  };

  try {
    const db = getAdminDb();
    const snap = await db.collection("settings").doc("whatsapp").get();
    if (snap.exists) {
      const d = (snap.data() || {}) as Partial<WhatsAppConfig>;
      for (const key of Object.keys(DEFAULTS) as (keyof WhatsAppConfig)[]) {
        const incoming = d[key];
        if (incoming === undefined || incoming === null || incoming === "") continue;
        // Env vence sobre banco para segredos (permite rotacionar sem UI).
        if ((SECRET_FIELDS as readonly string[]).includes(key) && cfg[key]) continue;
        (cfg as unknown as Record<string, unknown>)[key] = incoming;
      }
      if (typeof d.enabled === "boolean") cfg.enabled = d.enabled;
      if (typeof d.dryRun === "boolean") cfg.dryRun = d.dryRun;
    }
  } catch {
    // Sem banco: usa só o que veio da env.
  }
  return cfg;
}

function mask(value: string): string {
  if (!value) return "";
  if (value.length <= 10) return "•".repeat(value.length);
  return value.slice(0, 4) + "•".repeat(8) + value.slice(-4);
}

/** Config segura para exibir na UI — nunca revela segredos. */
export async function getMaskedWhatsAppConfig() {
  const c = await getWhatsAppConfig();
  return {
    provider: c.provider,
    enabled: c.enabled,
    dryRun: c.dryRun,
    evolutionBaseUrl: c.evolutionBaseUrl,
    evolutionInstance: c.evolutionInstance,
    evolutionApiKeyMasked: mask(c.evolutionApiKey),
    evolutionApiKeySet: !!c.evolutionApiKey,
    cloudPhoneNumberId: c.cloudPhoneNumberId,
    cloudAccessTokenMasked: mask(c.cloudAccessToken),
    cloudAccessTokenSet: !!c.cloudAccessToken,
    cloudTemplateName: c.cloudTemplateName,
    cloudTemplateLang: c.cloudTemplateLang,
    twilioAccountSid: c.twilioAccountSid,
    twilioAuthTokenMasked: mask(c.twilioAuthToken),
    twilioAuthTokenSet: !!c.twilioAuthToken,
    twilioFrom: c.twilioFrom,
    defaultRecipientPhone: c.defaultRecipientPhone,
    defaultRecipientName: c.defaultRecipientName,
  };
}

export async function saveWhatsAppConfig(input: Partial<WhatsAppConfig>): Promise<void> {
  const db = getAdminDb();
  const current = await getWhatsAppConfig();
  const updated: WhatsAppConfig = { ...current };

  for (const key of Object.keys(DEFAULTS) as (keyof WhatsAppConfig)[]) {
    const incoming = input[key];
    if (incoming === undefined) continue;
    // Campo mascarado voltando da UI significa "não mexi nele".
    if (typeof incoming === "string" && incoming.includes("•")) continue;
    (updated as unknown as Record<string, unknown>)[key] = incoming;
  }

  // O telefone padrão é normalizado aqui: o usuário digita como quiser
  // ("(44) 99999-8888") e o que fica gravado é sempre E.164.
  if (typeof input.defaultRecipientPhone === "string" && input.defaultRecipientPhone.trim()) {
    const normalized = normalizePhoneBR(input.defaultRecipientPhone);
    if (!normalized) throw new Error("Telefone padrão inválido. Informe com DDD.");
    updated.defaultRecipientPhone = normalized;
  } else if (input.defaultRecipientPhone === "") {
    updated.defaultRecipientPhone = "";
  }

  await db.collection("settings").doc("whatsapp").set(updated, { merge: true });
}

// ---------------------------------------------------------------------------
// Envio
// ---------------------------------------------------------------------------

export interface SendResult {
  ok: boolean;
  providerMessageId?: string;
  detail?: string;
}

/** Erro que NÃO deve ser tentado de novo (config errada, número inválido). */
export class PermanentSendError extends Error {}

async function readBody(res: Response): Promise<any> {
  const raw = await res.text();
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return { raw }; }
}

// --- Evolution API ---------------------------------------------------------

async function sendViaEvolution(cfg: WhatsAppConfig, phone: string, text: string): Promise<SendResult> {
  if (!cfg.evolutionBaseUrl || !cfg.evolutionInstance || !cfg.evolutionApiKey) {
    throw new PermanentSendError("Evolution API não configurada (URL, instância ou API key ausente).");
  }
  const base = cfg.evolutionBaseUrl.replace(/\/+$/, "");
  const url = `${base}/message/sendText/${encodeURIComponent(cfg.evolutionInstance)}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: cfg.evolutionApiKey },
    // Formato da Evolution v2. Na v1 o corpo era { number, textMessage: { text } }.
    body: JSON.stringify({ number: phone, text }),
  });

  const data = await readBody(res);
  if (!res.ok) {
    const detail = data?.message || data?.error || `HTTP ${res.status}`;
    // 401/403 = credencial errada; 404 = instância inexistente. Não adianta repetir.
    if ([400, 401, 403, 404].includes(res.status)) {
      throw new PermanentSendError(`Evolution: ${detail}`);
    }
    throw new Error(`Evolution: ${detail}`);
  }
  return { ok: true, providerMessageId: data?.key?.id || data?.id, detail: "enviado via Evolution" };
}

async function checkEvolutionConnection(cfg: WhatsAppConfig): Promise<string> {
  const base = cfg.evolutionBaseUrl.replace(/\/+$/, "");
  const res = await fetch(
    `${base}/instance/connectionState/${encodeURIComponent(cfg.evolutionInstance)}`,
    { headers: { apikey: cfg.evolutionApiKey } }
  );
  const data = await readBody(res);
  if (!res.ok) throw new Error(`Não foi possível consultar a instância: HTTP ${res.status}`);
  return data?.instance?.state || data?.state || "desconhecido";
}

// --- WhatsApp Cloud API (Meta) --------------------------------------------

async function sendViaCloud(cfg: WhatsAppConfig, phone: string, text: string): Promise<SendResult> {
  if (!cfg.cloudPhoneNumberId || !cfg.cloudAccessToken) {
    throw new PermanentSendError("Cloud API não configurada (phoneNumberId ou token ausente).");
  }
  const url = `https://graph.facebook.com/v21.0/${cfg.cloudPhoneNumberId}/messages`;

  // Mensagem proativa (fora da janela de 24h) EXIGE template aprovado. Mandamos o
  // texto inteiro como parâmetro {{1}} de um template de corpo único.
  const body = {
    messaging_product: "whatsapp",
    to: phone,
    type: "template",
    template: {
      name: cfg.cloudTemplateName,
      language: { code: cfg.cloudTemplateLang },
      components: [
        { type: "body", parameters: [{ type: "text", text: text.replace(/\n/g, " ") }] },
      ],
    },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.cloudAccessToken}` },
    body: JSON.stringify(body),
  });

  const data = await readBody(res);
  if (!res.ok) {
    const detail = data?.error?.message || `HTTP ${res.status}`;
    const code = data?.error?.code;
    // 190 = token inválido/expirado; 132xxx = problema no template.
    if (res.status === 401 || code === 190 || String(code).startsWith("132")) {
      throw new PermanentSendError(`Cloud API: ${detail}`);
    }
    throw new Error(`Cloud API: ${detail}`);
  }
  return { ok: true, providerMessageId: data?.messages?.[0]?.id, detail: "enviado via Cloud API" };
}

// --- Twilio ----------------------------------------------------------------

async function sendViaTwilio(cfg: WhatsAppConfig, phone: string, text: string): Promise<SendResult> {
  if (!cfg.twilioAccountSid || !cfg.twilioAuthToken || !cfg.twilioFrom) {
    throw new PermanentSendError("Twilio não configurado (SID, token ou número de origem ausente).");
  }
  const url = `https://api.twilio.com/2010-04-01/Accounts/${cfg.twilioAccountSid}/Messages.json`;
  const auth = Buffer.from(`${cfg.twilioAccountSid}:${cfg.twilioAuthToken}`).toString("base64");

  const form = new URLSearchParams({
    To: `whatsapp:+${phone}`,
    From: cfg.twilioFrom.startsWith("whatsapp:") ? cfg.twilioFrom : `whatsapp:${cfg.twilioFrom}`,
    Body: text,
  });

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic ${auth}` },
    body: form.toString(),
  });

  const data = await readBody(res);
  if (!res.ok) {
    const detail = data?.message || `HTTP ${res.status}`;
    if ([400, 401, 403].includes(res.status)) throw new PermanentSendError(`Twilio: ${detail}`);
    throw new Error(`Twilio: ${detail}`);
  }
  return { ok: true, providerMessageId: data?.sid, detail: "enviado via Twilio" };
}

// --- Fachada ---------------------------------------------------------------

/**
 * Envia uma mensagem de texto. `phone` deve vir normalizado em E.164 sem "+".
 * Lança PermanentSendError para falhas que não adianta repetir.
 */
export async function sendWhatsAppMessage(phone: string, text: string): Promise<SendResult> {
  const cfg = await getWhatsAppConfig();

  if (!cfg.enabled || cfg.provider === "none") {
    throw new PermanentSendError("Integração de WhatsApp desativada.");
  }
  if (!/^\d{10,15}$/.test(phone)) {
    throw new PermanentSendError(`Telefone inválido: ${phone}`);
  }

  if (cfg.dryRun) {
    console.log(`[whatsapp][dry-run] → ${phone}\n${text}\n---`);
    return { ok: true, detail: "dry-run (nada foi enviado de verdade)" };
  }

  switch (cfg.provider) {
    case "evolution": return sendViaEvolution(cfg, phone, text);
    case "cloud":     return sendViaCloud(cfg, phone, text);
    case "twilio":    return sendViaTwilio(cfg, phone, text);
    default:
      throw new PermanentSendError(`Provedor desconhecido: ${cfg.provider}`);
  }
}

/** Diagnóstico para a tela de configuração. */
export async function getWhatsAppStatus(): Promise<{
  provider: WhatsAppProvider;
  enabled: boolean;
  configured: boolean;
  connection?: string;
  problem?: string;
}> {
  const cfg = await getWhatsAppConfig();
  const base = { provider: cfg.provider, enabled: cfg.enabled };

  if (cfg.provider === "none") return { ...base, configured: false, problem: "Nenhum provedor selecionado." };

  if (cfg.provider === "evolution") {
    const configured = !!(cfg.evolutionBaseUrl && cfg.evolutionInstance && cfg.evolutionApiKey);
    if (!configured) return { ...base, configured, problem: "Preencha URL, instância e API key." };
    try {
      const state = await checkEvolutionConnection(cfg);
      return {
        ...base, configured: true, connection: state,
        problem: state === "open" ? undefined : "Instância desconectada — leia o QR code novamente no painel da Evolution.",
      };
    } catch (e: any) {
      return { ...base, configured: true, problem: e?.message || "Falha ao consultar a instância." };
    }
  }

  if (cfg.provider === "cloud") {
    const configured = !!(cfg.cloudPhoneNumberId && cfg.cloudAccessToken);
    return { ...base, configured, problem: configured ? undefined : "Preencha o Phone Number ID e o token." };
  }

  const configured = !!(cfg.twilioAccountSid && cfg.twilioAuthToken && cfg.twilioFrom);
  return { ...base, configured, problem: configured ? undefined : "Preencha SID, token e número de origem." };
}

export async function sendWhatsAppTest(phone: string): Promise<SendResult> {
  const msg =
    "🔌 *Teste de integração — HUB CBC*\n\n" +
    "✅ O WhatsApp está conectado à agenda.\n" +
    `📅 ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`;
  return sendWhatsAppMessage(phone, msg);
}
