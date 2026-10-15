// src/lib/server/coraServer.ts
//
// Cobrança dos contratos pelo Banco Cora (Integração Direta) — SOMENTE backend.
// Certificado, chave privada e client_id vivem aqui (env ou settings/cora), NUNCA no frontend.
//
// Como o Cora funciona (documentação oficial, Integração Direta):
//   • Autenticação: certificado digital (mTLS) + client_id → POST {matls}/token
//     (grant_type=client_credentials). Token Bearer válido por 24h. O certificado e a chave
//     precisam acompanhar TODAS as requisições.
//   • Boleto com Pix: POST {matls}/v2/invoices (valor em CENTAVOS, Idempotency-Key obrigatório).
//   • Consulta: GET /v2/invoices/{id}; cancelamento: DELETE /v2/invoices/{id} (só se não pago).
//   • Webhook: POST /endpoints/ (resource "invoice"). A notificação chega SEM corpo útil — o id do
//     boleto vem nos cabeçalhos — e não tem assinatura documentada. Por isso o HUB trata o aviso só
//     como GATILHO: confirma o pagamento consultando o próprio Cora antes de dar baixa.
//
// Ciclo de uma parcela (ContractCharge):
//   aguardando_gatilho → (etapa aprovada) aguardando_confirmacao → emitida → paga | vencida | cancelada
//   • "assinatura": emitida automaticamente quando o contrato é assinado (se ativado);
//   • "data": emitida N dias antes do vencimento combinado;
//   • "etapa_*": o HUB avisa que a etapa foi atingida e o admin CONFIRMA a emissão.

import crypto from "node:crypto";
import http from "node:http";
import https from "node:https";
import * as dataService from "./dataService";
import { getAdminDb } from "./db";
import { sendWhatsAppMessage } from "./whatsappServer";
import { normalizePhoneBR } from "../agenda";
import { CONTRACT_TYPE_LABELS } from "../contractTemplates";
import { formatCents, parseBRLToCents } from "../extenso";
import type { Contract, ContractCharge, ChargeStatus } from "../../types";

// ---------------------------------------------------------------------------
// Configuração
// ---------------------------------------------------------------------------

export type CoraEnvironment = "stage" | "production";

export interface CoraConfig {
  enabled: boolean;
  environment: CoraEnvironment;
  coraClientId: string;
  /** Segredo: certificado (PEM) emitido pelo Cora. */
  coraCertPem: string;
  /** Segredo: chave privada (PEM). */
  coraKeyPem: string;
  /** Segredo: faz parte da URL do webhook (o Cora não assina as notificações). */
  coraWebhookToken: string;
  webhookId: string;
  webhookEndpointMasked: string;

  /** Emite sozinho a parcela "na assinatura" quando o contrato é assinado. */
  autoEmitirAssinatura: boolean;
  diasVencimentoAssinatura: number;
  diasVencimentoEtapa: number;
  /** Emite parcelas de data fixa quantos dias antes do vencimento. */
  antecedenciaDataDias: number;
  multaPercent: number;
  jurosPercent: number;
  /** Envia o boleto ao cliente por WhatsApp assim que for emitido (usa a integração da Agenda). */
  enviarWhatsAppAuto: boolean;
}

const DEFAULTS: CoraConfig = {
  enabled: false,
  environment: "stage",
  coraClientId: "",
  coraCertPem: "",
  coraKeyPem: "",
  coraWebhookToken: "",
  webhookId: "",
  webhookEndpointMasked: "",
  autoEmitirAssinatura: true,
  diasVencimentoAssinatura: 3,
  diasVencimentoEtapa: 5,
  antecedenciaDataDias: 10,
  multaPercent: 2,
  jurosPercent: 1,
  enviarWhatsAppAuto: false,
};

const SECRET_FIELDS = ["coraCertPem", "coraKeyPem", "coraWebhookToken"] as const;

/** Aceita PEM com quebras reais, com "\n" literal (comum em variáveis de ambiente) ou em base64. */
export function normalizePem(raw: string | undefined | null): string {
  let s = String(raw || "").trim();
  if (!s) return "";
  if (!s.includes("-----BEGIN")) {
    try {
      const decoded = Buffer.from(s, "base64").toString("utf8");
      if (decoded.includes("-----BEGIN")) s = decoded;
    } catch { /* ignora */ }
  }
  return s.replace(/\\n/g, "\n").trim() + (s ? "\n" : "");
}

const isCertPem = (s: string) => /-----BEGIN CERTIFICATE-----/.test(s);
const isKeyPem = (s: string) => /-----BEGIN (RSA |EC |ENCRYPTED )?PRIVATE KEY-----/.test(s);

const clampNum = (v: unknown, min: number, max: number, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
};

export async function getCoraConfig(): Promise<CoraConfig> {
  const cfg: CoraConfig = {
    ...DEFAULTS,
    enabled: process.env.CORA_ENABLED === "1",
    environment: process.env.CORA_ENV === "production" ? "production" : "stage",
    coraClientId: process.env.CORA_CLIENT_ID || "",
    coraCertPem: normalizePem(process.env.CORA_CERT_PEM),
    coraKeyPem: normalizePem(process.env.CORA_KEY_PEM),
    coraWebhookToken: process.env.CORA_WEBHOOK_TOKEN || "",
  };
  try {
    const snap = await getAdminDb().collection("settings").doc("cora").get();
    if (snap.exists) {
      const d = (snap.data() || {}) as Record<string, unknown>;
      for (const key of Object.keys(DEFAULTS) as (keyof CoraConfig)[]) {
        const incoming = d[key];
        if (incoming === undefined || incoming === null || incoming === "") continue;
        if ((SECRET_FIELDS as readonly string[]).includes(key) && cfg[key]) continue; // env vence
        (cfg as unknown as Record<string, unknown>)[key] = incoming;
      }
      for (const k of ["enabled", "autoEmitirAssinatura", "enviarWhatsAppAuto"] as const) {
        if (typeof d[k] === "boolean") cfg[k] = d[k] as boolean;
      }
    }
  } catch { /* sem banco: só env */ }
  cfg.coraCertPem = normalizePem(cfg.coraCertPem);
  cfg.coraKeyPem = normalizePem(cfg.coraKeyPem);
  cfg.diasVencimentoAssinatura = clampNum(cfg.diasVencimentoAssinatura, 0, 60, 3);
  cfg.diasVencimentoEtapa = clampNum(cfg.diasVencimentoEtapa, 0, 60, 5);
  cfg.antecedenciaDataDias = clampNum(cfg.antecedenciaDataDias, 0, 60, 10);
  cfg.multaPercent = clampNum(cfg.multaPercent, 0, 20, 2);
  cfg.jurosPercent = clampNum(cfg.jurosPercent, 0, 20, 1);
  return cfg;
}

export async function getMaskedCoraConfig() {
  const c = await getCoraConfig();
  return {
    enabled: c.enabled,
    environment: c.environment,
    coraClientId: c.coraClientId,
    coraCertSet: isCertPem(c.coraCertPem),
    coraKeySet: isKeyPem(c.coraKeyPem),
    webhookId: c.webhookId,
    webhookEndpointMasked: c.webhookEndpointMasked,
    autoEmitirAssinatura: c.autoEmitirAssinatura,
    diasVencimentoAssinatura: c.diasVencimentoAssinatura,
    diasVencimentoEtapa: c.diasVencimentoEtapa,
    antecedenciaDataDias: c.antecedenciaDataDias,
    multaPercent: c.multaPercent,
    jurosPercent: c.jurosPercent,
    enviarWhatsAppAuto: c.enviarWhatsAppAuto,
  };
}

export async function saveCoraConfig(input: Partial<CoraConfig>): Promise<void> {
  const current = await getCoraConfig();
  const updated: CoraConfig = { ...current };
  const editable: (keyof CoraConfig)[] = [
    "enabled", "environment", "coraClientId", "coraCertPem", "coraKeyPem", "autoEmitirAssinatura",
    "diasVencimentoAssinatura", "diasVencimentoEtapa", "antecedenciaDataDias", "multaPercent",
    "jurosPercent", "enviarWhatsAppAuto",
  ];
  for (const key of editable) {
    const incoming = input[key];
    if (incoming === undefined) continue;
    (updated as unknown as Record<string, unknown>)[key] = incoming;
  }
  if (updated.environment !== "stage" && updated.environment !== "production") {
    throw new Error("Ambiente inválido (use stage ou production).");
  }
  updated.coraCertPem = normalizePem(updated.coraCertPem);
  updated.coraKeyPem = normalizePem(updated.coraKeyPem);
  if (updated.coraCertPem && !isCertPem(updated.coraCertPem)) throw new Error("O arquivo do certificado não parece um PEM válido (certificate.pem).");
  if (updated.coraKeyPem && !isKeyPem(updated.coraKeyPem)) throw new Error("O arquivo da chave privada não parece um PEM válido (private-key.key).");
  updated.coraClientId = String(updated.coraClientId || "").trim();
  if (!updated.coraWebhookToken) updated.coraWebhookToken = crypto.randomBytes(24).toString("hex");
  await getAdminDb().collection("settings").doc("cora").set(updated, { merge: true });
}

// ---------------------------------------------------------------------------
// Cliente HTTP com mTLS
// ---------------------------------------------------------------------------

export class CoraError extends Error {
  status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}

export function baseUrl(cfg: CoraConfig): string {
  if (process.env.CORA_BASE_URL) return process.env.CORA_BASE_URL.replace(/\/+$/, "");
  return cfg.environment === "production"
    ? "https://matls-clients.api.cora.com.br"
    : "https://matls-clients.api.stage.cora.com.br";
}

interface RawResponse { status: number; text: string }

function rawRequest(cfg: CoraConfig, method: string, path: string, headers: Record<string, string>, body?: string): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const url = new URL(baseUrl(cfg) + path);
    const isHttps = url.protocol === "https:";
    const opts: https.RequestOptions = {
      method, hostname: url.hostname, port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      headers: { ...headers, ...(body !== undefined ? { "Content-Length": String(Buffer.byteLength(body)) } : {}) },
      timeout: 45_000,
    };
    if (isHttps) { opts.cert = cfg.coraCertPem; opts.key = cfg.coraKeyPem; }
    const req = (isHttps ? https : http).request(opts, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode || 0, text: Buffer.concat(chunks).toString("utf8") }));
    });
    req.on("timeout", () => req.destroy(new Error("tempo esgotado")));
    req.on("error", reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

function assertCredentials(cfg: CoraConfig) {
  if (!cfg.coraClientId) throw new CoraError("Client ID do Cora não configurado.", 400);
  if (!isCertPem(cfg.coraCertPem) || !isKeyPem(cfg.coraKeyPem)) throw new CoraError("Certificado e chave privada do Cora não configurados.", 400);
}

const tokenCache = new Map<string, { token: string; exp: number }>();

async function getToken(cfg: CoraConfig, force = false): Promise<string> {
  assertCredentials(cfg);
  const key = `${cfg.environment}|${cfg.coraClientId}|${baseUrl(cfg)}`;
  const hit = tokenCache.get(key);
  if (!force && hit && hit.exp > Date.now() + 60_000) return hit.token;
  let r: RawResponse;
  try {
    r = await rawRequest(cfg, "POST", "/token", { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      `grant_type=client_credentials&client_id=${encodeURIComponent(cfg.coraClientId)}`);
  } catch (e: any) {
    throw new CoraError(`Não foi possível falar com o Cora: ${e?.message || e}. Confira o certificado e a chave do ambiente ${cfg.environment}.`, 0);
  }
  let json: any = {};
  try { json = JSON.parse(r.text); } catch { /* ignora */ }
  if (r.status !== 200 || !json.access_token) {
    throw new CoraError(`O Cora recusou a autenticação (${r.status}). Confira Client ID, certificado e chave — cada ambiente (stage/produção) tem as suas.`, r.status || 401);
  }
  tokenCache.set(key, { token: json.access_token, exp: Date.now() + (Number(json.expires_in) || 3600) * 1000 });
  return json.access_token;
}

function describeError(status: number, text: string): string {
  let j: any = null;
  try { j = JSON.parse(text); } catch { /* ignora */ }
  const parts: string[] = [];
  if (Array.isArray(j?.errors)) for (const e of j.errors) parts.push([e.code, e.message].filter(Boolean).join(": "));
  else if (j?.message) parts.push([j.code, j.message].filter(Boolean).join(": "));
  else if (j?.error) parts.push(String(j.error));
  if (status === 401) return "Token do Cora inválido/expirado.";
  return parts.filter(Boolean).join(" | ") || `Erro ${status} do Cora.`;
}

async function coraFetch(cfg: CoraConfig, method: string, path: string, body?: unknown, idempotencyKey?: string): Promise<any> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const token = await getToken(cfg, attempt > 0);
    const headers: Record<string, string> = { Authorization: `Bearer ${token}`, Accept: "application/json" };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
    let r: RawResponse;
    try {
      r = await rawRequest(cfg, method, path, headers, body !== undefined ? JSON.stringify(body) : undefined);
    } catch (e: any) {
      throw new CoraError(`Não foi possível falar com o Cora: ${e?.message || e}`, 0);
    }
    if (r.status === 401 && attempt === 0) continue; // token vencido: renova e repete uma vez
    if (r.status >= 200 && r.status < 300) {
      if (!r.text) return {};
      try { return JSON.parse(r.text); } catch { return {}; }
    }
    throw new CoraError(describeError(r.status, r.text), r.status);
  }
  throw new CoraError("Falha de autenticação no Cora.", 401);
}

export async function testConnection() {
  const cfg = await getCoraConfig();
  await getToken(cfg, true);
  return { ok: true as const, environment: cfg.environment };
}

/** Cadastra o aviso de pagamento (webhook) no Cora. */
export async function registerWebhook(publicBaseUrl: string): Promise<{ endpointMasked: string; webhookId: string }> {
  const base = String(publicBaseUrl || "").trim().replace(/\/+$/, "");
  if (!/^https:\/\/[^\s/]+/i.test(base)) throw new Error("Informe a URL pública (https) do HUB, ex.: https://hub.chavesbritescorrea.cloud");
  let cfg = await getCoraConfig();
  if (!cfg.coraWebhookToken) { await saveCoraConfig({}); cfg = await getCoraConfig(); }
  const url = `${base}/api/webhooks/cora/${cfg.coraWebhookToken}`;
  const res = await coraFetch(cfg, "POST", "/endpoints/", { url, resource: "invoice", trigger: "*" }, uuidFromHash(`endpoint|${url}`));
  const id = String(res?.id || "");
  if (!id) throw new Error("O Cora não devolveu o id do webhook.");
  const masked = `${base}/api/webhooks/cora/${cfg.coraWebhookToken.slice(0, 4)}••••••••`;
  await getAdminDb().collection("settings").doc("cora").set({ webhookId: id, webhookEndpointMasked: masked }, { merge: true });
  return { endpointMasked: masked, webhookId: id };
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

/** UUID determinístico: repetir a mesma emissão reaproveita o mesmo Idempotency-Key (sem boleto duplicado). */
export function uuidFromHash(seed: string): string {
  const h = crypto.createHash("sha256").update(seed).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/** Data (YYYY-MM-DD) no fuso do escritório (UTC-4). */
export function localDate(d: Date): string {
  const l = new Date(d.getTime() - 4 * 3_600_000);
  return `${l.getUTCFullYear()}-${pad2(l.getUTCMonth() + 1)}-${pad2(l.getUTCDate())}`;
}
export function addDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return `${t.getUTCFullYear()}-${pad2(t.getUTCMonth() + 1)}-${pad2(t.getUTCDate())}`;
}
const fmtBR = (ymd?: string) => (ymd ? ymd.split("-").reverse().join("/") : "");

// ---------------------------------------------------------------------------
// Persistência / dependências (injetáveis nos testes)
// ---------------------------------------------------------------------------

export interface Deps {
  getContract(id: string): Promise<Contract | null>;
  saveContract(id: string, patch: Record<string, unknown>): Promise<void>;
  listContracts(): Promise<Contract[]>;
  listArchProjects(): Promise<any[]>;
  getClient(id: string): Promise<{ name?: string; email?: string; phone?: string } | null>;
  listAdminUserIds(): Promise<string[]>;
  saveNotification(id: string, data: Record<string, unknown>): Promise<void>;
  sendWhatsApp(phone: string, text: string): Promise<void>;
  now(): Date;
}

const defaultDeps: Deps = {
  getContract: (id) => dataService.getDocById("contracts", id) as Promise<Contract | null>,
  saveContract: (id, patch) => dataService.setDocById("contracts", id, patch),
  listContracts: () => dataService.listCollection("contracts") as Promise<Contract[]>,
  listArchProjects: () => dataService.listCollection("arch_projects"),
  getClient: (id) => dataService.getDocById("clients", id),
  listAdminUserIds: async () => ((await dataService.listCollection("users")) as any[]).filter((u) => u.role === "admin").map((u) => String(u.id)),
  saveNotification: (id, data) => dataService.setDocById("notifications", id, data),
  sendWhatsApp: async (phone, text) => { await sendWhatsAppMessage(phone, text); },
  now: () => new Date(),
};
let deps: Deps = defaultDeps;
/** Só para testes. */
export function __setDeps(d: Partial<Deps> | null) { deps = d ? { ...defaultDeps, ...d } : defaultDeps; }

async function notifyAdmins(contract: Contract, summary: string) {
  try {
    const at = deps.now().toISOString();
    for (const uid of await deps.listAdminUserIds()) {
      const id = `notif-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      await deps.saveNotification(id, {
        id, recipientUserId: uid, actorUserId: "cora", actorName: "Cobrança", actorRole: "system",
        action: "update", collection: "contracts", entityId: contract.id, projectId: contract.projectId || null,
        summary, read: false, createdAt: at,
      });
    }
  } catch (e: any) { console.error("[cora] Falha ao notificar:", e?.message || e); }
}

// Trava por contrato: webhook, varredura e cliques manuais nunca editam/emitem ao mesmo tempo.
const locks = new Map<string, Promise<unknown>>();
async function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(key) || Promise.resolve();
  const run = prev.catch(() => undefined).then(fn);
  locks.set(key, run);
  try { return await run; } finally { if (locks.get(key) === run) locks.delete(key); }
}

async function patchCharges(contractId: string, fn: (charges: ContractCharge[], c: Contract) => ContractCharge[]): Promise<Contract> {
  const c = await deps.getContract(contractId);
  if (!c) throw new Error("Contrato não encontrado.");
  const charges = fn(JSON.parse(JSON.stringify(c.charges || [])), c);
  await deps.saveContract(contractId, { charges, updatedAt: deps.now().toISOString() });
  return { ...c, charges };
}

// ---------------------------------------------------------------------------
// Parcelas
// ---------------------------------------------------------------------------

/** Monta/atualiza a lista de cobranças a partir das parcelas do contrato (sem mexer nas já emitidas). */
export function buildCharges(contract: Contract): ContractCharge[] {
  const existing = new Map((contract.charges || []).map((c) => [c.paymentId, c]));
  const out: ContractCharge[] = [];
  for (const p of contract.data.pagamentos || []) {
    const prev = existing.get(p.id);
    if (prev) { out.push(prev); continue; }
    const cents = parseBRLToCents(p.valor) || 0;
    out.push({
      paymentId: p.id, descricao: p.descricao, valorCents: cents, gatilho: p.gatilho,
      etapaKey: p.etapaKey, dataVencimento: p.dataVencimento, status: "aguardando_gatilho",
    });
  }
  return out;
}

export async function initCharges(contractId: string): Promise<Contract> {
  return withLock(contractId, async () => {
    const c = await deps.getContract(contractId);
    if (!c) throw new Error("Contrato não encontrado.");
    if (c.status !== "assinado") throw new Error("As cobranças só são geradas depois que o contrato é assinado.");
    const next = buildCharges(c);
    if (JSON.stringify(next) === JSON.stringify(c.charges || [])) return c;
    await deps.saveContract(contractId, { charges: next });
    return { ...c, charges: next };
  });
}

/** O gatilho de etapa já foi atingido no módulo Projeto? */
export function etapaAtingida(contract: Contract, charge: ContractCharge, archProjects: any[]): boolean {
  if (!charge.etapaKey) return false;
  const byObra = archProjects.filter((a) => a.obraId && a.obraId === contract.projectId);
  const cid = contract.data.contratanteId;
  const byClient = cid ? archProjects.filter((a) => a.clientId === cid) : [];
  const candidates = byObra.length ? byObra : (byClient.length === 1 ? byClient : []);
  for (const a of candidates) {
    const ph = (a.phases || []).find((p: any) => p.key === charge.etapaKey);
    if (!ph) continue;
    if (charge.gatilho === "etapa_aprovada" && ph.state === "aprovada") return true;
    if (charge.gatilho === "etapa_entregue" && (ph.state === "aguardando_aprovacao" || ph.state === "aprovada")) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Emissão
// ---------------------------------------------------------------------------

const onlyDigits = (s: string) => String(s || "").replace(/\D/g, "");

async function customerFor(contract: Contract): Promise<{ name: string; email: string; document: string; phone: string; emailFonte: string }> {
  const d = contract.data.contratante;
  let email = (d.email || "").trim();
  let fonte = "contrato";
  let phone = d.phone || "";
  const cid = contract.data.contratanteId;
  if (cid) {
    try {
      const cli = await deps.getClient(cid);
      if (cli?.email?.trim()) { email = cli.email.trim(); fonte = "cadastro do cliente"; }
      if (cli?.phone?.trim()) phone = cli.phone;
    } catch { /* usa o do contrato */ }
  }
  return { name: (d.name || "").trim(), email: email.toLowerCase(), document: onlyDigits(d.cpfCnpj), phone, emailFonte: fonte };
}

export interface EmitOptions { dueDate?: string; actorName?: string; origem: "auto" | "manual" | "confirmacao" }

function validateEmission(contract: Contract, charge: ContractCharge, cust: Awaited<ReturnType<typeof customerFor>>, due: string, today: string): string[] {
  const errs: string[] = [];
  if (contract.status !== "assinado") errs.push("O contrato ainda não foi assinado.");
  if (charge.valorCents < 500) errs.push("O Cora exige boleto de no mínimo R$ 5,00.");
  if (cust.name.length < 3) errs.push("Nome do contratante não informado.");
  if (![11, 14].includes(cust.document.length)) errs.push("CPF/CNPJ do contratante inválido (11 ou 14 dígitos).");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(cust.email)) errs.push("E-mail do cliente ausente ou inválido no cadastro.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) errs.push("Data de vencimento inválida.");
  else if (due < today) errs.push("O vencimento não pode estar no passado.");
  return errs;
}

export function buildInvoiceBody(contract: Contract, charge: ContractCharge, due: string, cfg: CoraConfig, cust: { name: string; email: string; document: string }, withNotification = true) {
  const tipo = CONTRACT_TYPE_LABELS[contract.type] || "Contrato";
  const body: Record<string, unknown> = {
    code: `CT${pad2(contract.number)}-${charge.paymentId}`.slice(0, 40),
    customer: {
      name: cust.name.slice(0, 60),
      email: cust.email.slice(0, 60),
      document: { identity: cust.document, type: cust.document.length === 14 ? "CNPJ" : "CPF" },
    },
    services: [{
      name: `Contrato ${pad2(contract.number)} - ${charge.descricao}`.slice(0, 60),
      description: `${tipo} - ${cust.name}`.slice(0, 100),
      amount: charge.valorCents,
    }],
    payment_terms: {
      due_date: due,
      ...(cfg.multaPercent > 0 ? { fine: { rate: cfg.multaPercent } } : {}),
      ...(cfg.jurosPercent > 0 ? { interest: { rate: cfg.jurosPercent } } : {}),
    },
    payment_forms: ["BANK_SLIP", "PIX"],
  };
  if (withNotification) {
    body.notification = {
      name: cust.name.slice(0, 60),
      channels: [{
        channel: "EMAIL",
        contact: cust.email.slice(0, 60),
        rules: ["NOTIFY_FIVE_DAYS_BEFORE_DUE_DATE", "NOTIFY_TWO_DAYS_BEFORE_DUE_DATE", "NOTIFY_ON_DUE_DATE", "NOTIFY_TEN_DAYS_AFTER_DUE_DATE", "NOTIFY_WHEN_PAID"],
      }],
    };
  }
  return body;
}

function mapStatus(coraStatus: string): ChargeStatus | null {
  switch (coraStatus) {
    case "PAID": return "paga";
    case "CANCELLED": return "cancelada";
    case "LATE": return "vencida";
    case "OPEN": case "IN_PAYMENT": case "DRAFT": case "INITIATED": return "emitida";
    default: return null;
  }
}

function applyInvoice(ch: ContractCharge, inv: any, envName: CoraEnvironment): ContractCharge {
  const next: ContractCharge = { ...ch };
  next.coraInvoiceId = inv?.id || ch.coraInvoiceId;
  next.environment = envName;
  const slip = inv?.payment_options?.bank_slip;
  if (slip?.url) next.boletoUrl = slip.url;
  if (slip?.digitable) next.linhaDigitavel = slip.digitable;
  if (inv?.pix?.emv) next.pixEmv = inv.pix.emv;
  const st = mapStatus(String(inv?.status || ""));
  if (st) next.status = st;
  if (st === "paga") {
    const pay = Array.isArray(inv?.payments) ? inv.payments[0] : null;
    next.pagaEm = pay?.finalized_at || next.pagaEm || deps.now().toISOString();
    next.valorPagoCents = Number(inv?.total_paid) || next.valorCents;
  }
  next.lastError = undefined;
  next.lastCheckAt = deps.now().toISOString();
  return next;
}

export async function emitCharge(contractId: string, paymentId: string, opts: EmitOptions): Promise<ContractCharge> {
  return withLock(contractId, async () => {
    const cfg = await getCoraConfig();
    if (!cfg.enabled) throw new Error("A cobrança pelo Cora está desativada em Configurar.");
    assertCredentials(cfg);
    let contract = await deps.getContract(contractId);
    if (!contract) throw new Error("Contrato não encontrado.");
    if (!contract.charges?.length) contract = { ...contract, charges: buildCharges(contract) };
    const charge = (contract.charges || []).find((c) => c.paymentId === paymentId);
    if (!charge) throw new Error("Parcela não encontrada.");
    if (!["aguardando_gatilho", "aguardando_confirmacao", "erro"].includes(charge.status)) {
      throw new Error(charge.status === "emitida" || charge.status === "vencida" ? "Esta cobrança já foi emitida." : `Cobrança em situação "${charge.status}" não pode ser emitida.`);
    }
    const today = localDate(deps.now());
    const due = opts.dueDate || addDays(today, cfg.diasVencimentoEtapa);
    const cust = await customerFor(contract);
    const errs = validateEmission(contract, charge, cust, due, today);
    if (errs.length) throw new Error(errs.join(" "));

    // Reserva ANTES de chamar o Cora: se o processo cair no meio, nada é emitido em duplicidade.
    const reserved = await patchCharges(contractId, (cs, c) => {
      const base = (c.charges?.length ? cs : buildCharges(c));
      return base.map((x) => x.paymentId === paymentId ? { ...x, status: "emitindo" as ChargeStatus, dueDate: due, lastError: undefined, lastCheckAt: deps.now().toISOString() } : x);
    });
    void reserved;

    const key = uuidFromHash(`hub-cbc|${contractId}|${paymentId}|${due}`);
    let inv: any;
    try {
      try {
        inv = await coraFetch(cfg, "POST", "/v2/invoices", buildInvoiceBody(contract, charge, due, cfg, cust, true), key);
      } catch (e) {
        // Se o Cora reclamar das notificações por e-mail, emite sem elas (o boleto é o que importa).
        if (e instanceof CoraError && (e.status === 400 || e.status === 422) && /notif/i.test(e.message)) {
          inv = await coraFetch(cfg, "POST", "/v2/invoices", buildInvoiceBody(contract, charge, due, cfg, cust, false), key);
        } else throw e;
      }
    } catch (e: any) {
      await patchCharges(contractId, (cs) => cs.map((x) => x.paymentId === paymentId
        ? { ...x, status: "erro" as ChargeStatus, lastError: String(e?.message || e).slice(0, 300) } : x));
      await notifyAdmins(contract, `Falha ao emitir a cobrança "${charge.descricao}" do contrato nº ${pad2(contract.number)}: ${e?.message || e}`);
      throw e;
    }

    let emitted!: ContractCharge;
    const nowIso = deps.now().toISOString();
    await patchCharges(contractId, (cs) => cs.map((x) => {
      if (x.paymentId !== paymentId) return x;
      emitted = { ...applyInvoice(x, inv, cfg.environment), status: mapStatus(String(inv?.status || "")) || "emitida", dueDate: due, emitidaEm: nowIso };
      return emitted;
    }));
    await notifyAdmins(contract, `Cobrança emitida: ${charge.descricao} — R$ ${formatCents(charge.valorCents)}, vence em ${fmtBR(due)} (contrato nº ${pad2(contract.number)}).`);

    if (cfg.enviarWhatsAppAuto) {
      try { await sendChargeWhatsAppInner(contract, emitted, cust.phone); } catch (e: any) {
        console.warn("[cora] WhatsApp automático não enviado:", e?.message || e);
      }
    }
    return emitted;
  });
}

export async function cancelCharge(contractId: string, paymentId: string): Promise<void> {
  return withLock(contractId, async () => {
    const cfg = await getCoraConfig();
    const c = await deps.getContract(contractId);
    const ch = c?.charges?.find((x) => x.paymentId === paymentId);
    if (!c || !ch) throw new Error("Cobrança não encontrada.");
    if (!["emitida", "vencida"].includes(ch.status) || !ch.coraInvoiceId) throw new Error("Só é possível cancelar cobranças emitidas e ainda não pagas.");
    await coraFetch(cfg, "DELETE", `/v2/invoices/${encodeURIComponent(ch.coraInvoiceId)}`);
    await patchCharges(contractId, (cs) => cs.map((x) => x.paymentId === paymentId
      ? { ...x, status: "cancelada" as ChargeStatus, canceladaEm: deps.now().toISOString() } : x));
    await notifyAdmins(c, `Cobrança cancelada: ${ch.descricao} (contrato nº ${pad2(c.number)}).`);
  });
}

/** Volta a parcela cancelada/com erro para a fila (para emitir de novo, com outro vencimento). */
export async function reopenCharge(contractId: string, paymentId: string): Promise<void> {
  return withLock(contractId, async () => {
    await patchCharges(contractId, (cs) => cs.map((x) => {
      if (x.paymentId !== paymentId) return x;
      if (!["cancelada", "erro"].includes(x.status)) throw new Error("Só cobranças canceladas ou com erro podem ser reabertas.");
      return { ...x, status: "aguardando_gatilho" as ChargeStatus, coraInvoiceId: undefined, boletoUrl: undefined, linhaDigitavel: undefined, pixEmv: undefined, emitidaEm: undefined, canceladaEm: undefined, lastError: undefined };
    }));
  });
}

/** Consulta o Cora e atualiza uma cobrança emitida (webhook e varredura chamam isto). */
export async function reconcileCharge(contractId: string, paymentId: string): Promise<ContractCharge | null> {
  return withLock(contractId, async () => {
    const cfg = await getCoraConfig();
    const c = await deps.getContract(contractId);
    const ch = c?.charges?.find((x) => x.paymentId === paymentId);
    if (!c || !ch?.coraInvoiceId) return null;
    const inv = await coraFetch(cfg, "GET", `/v2/invoices/${encodeURIComponent(ch.coraInvoiceId)}`);
    let result: ContractCharge | null = null;
    const wasPaid = ch.status === "paga";
    await patchCharges(contractId, (cs) => cs.map((x) => {
      if (x.paymentId !== paymentId) return x;
      result = applyInvoice(x, inv, cfg.environment);
      return result;
    }));
    const r = result as ContractCharge | null;
    if (r && r.status === "paga" && !wasPaid) {
      await notifyAdmins(c, `PAGAMENTO RECEBIDO: ${ch.descricao} — R$ ${formatCents(r.valorPagoCents || ch.valorCents)} (contrato nº ${pad2(c.number)}, ${c.data.contratante.name}).`);
    }
    return r;
  });
}

// ---------------------------------------------------------------------------
// Mensagem ao cliente (WhatsApp)
// ---------------------------------------------------------------------------

export function buildChargeMessage(contract: Contract, ch: ContractCharge): string {
  const nome = (contract.data.contratante.name || "").trim().split(/\s+/)[0] || "";
  const linhas = [
    `Olá${nome ? `, ${nome}` : ""}! Aqui é do escritório Chaves Brites Correa.`,
    "",
    `Segue a cobrança referente a *${ch.descricao}* do contrato nº ${pad2(contract.number)}:`,
    `• Valor: R$ ${formatCents(ch.valorCents)}`,
    `• Vencimento: ${fmtBR(ch.dueDate)}`,
  ];
  if (ch.boletoUrl) linhas.push("", `📄 Boleto: ${ch.boletoUrl}`);
  if (ch.pixEmv) linhas.push("", "💠 Pix copia e cola:", ch.pixEmv);
  linhas.push("", "Qualquer dúvida, é só responder esta mensagem.");
  return linhas.join("\n");
}

async function sendChargeWhatsAppInner(contract: Contract, ch: ContractCharge, rawPhone: string) {
  const phone = normalizePhoneBR(rawPhone || "");
  if (!phone) throw new Error("O cliente não tem telefone válido cadastrado.");
  if (!ch.boletoUrl && !ch.pixEmv) throw new Error("Cobrança sem boleto/Pix para enviar.");
  await deps.sendWhatsApp(phone, buildChargeMessage(contract, ch));
  await patchCharges(contract.id, (cs) => cs.map((x) => x.paymentId === ch.paymentId ? { ...x, enviadaWhatsAppEm: deps.now().toISOString() } : x));
}

export async function sendChargeWhatsApp(contractId: string, paymentId: string): Promise<void> {
  const c = await deps.getContract(contractId);
  const ch = c?.charges?.find((x) => x.paymentId === paymentId);
  if (!c || !ch) throw new Error("Cobrança não encontrada.");
  const cust = await customerFor(c);
  await sendChargeWhatsAppInner(c, ch, cust.phone);
}

/** Cobranças para a tela: acrescenta mensagem pronta e link do WhatsApp. */
export async function chargesView(contractId: string) {
  const c = await deps.getContract(contractId);
  if (!c) return null;
  const cust = await customerFor(c);
  const phone = normalizePhoneBR(cust.phone || "");
  const cfg = await getCoraConfig();
  const hoje = localDate(deps.now());
  return {
    environment: cfg.environment,
    enabled: cfg.enabled,
    diasVencimentoEtapa: cfg.diasVencimentoEtapa,
    hoje,
    contratanteEmail: cust.email,
    emailFonte: cust.emailFonte,
    telefone: phone,
    charges: (c.charges || []).map((ch) => {
      const message = ch.boletoUrl || ch.pixEmv ? buildChargeMessage(c, ch) : "";
      return { ...ch, message, waLink: message && phone ? `https://wa.me/${phone}?text=${encodeURIComponent(message)}` : "" };
    }),
  };
}

// ---------------------------------------------------------------------------
// Webhook
// ---------------------------------------------------------------------------

function tokensEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a), bb = Buffer.from(b);
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

/**
 * O Cora não assina as notificações, então: (1) o token secreto vai na URL; (2) o aviso só serve de
 * gatilho — o status real vem de uma consulta ao Cora (reconcileCharge). Notificação forjada = no máximo
 * uma consulta inofensiva.
 */
export async function handleWebhook(token: string, headers: Record<string, string | string[] | undefined>): Promise<{ status: number; body: Record<string, unknown> }> {
  const cfg = await getCoraConfig();
  if (!cfg.coraWebhookToken || !tokensEqual(String(token || ""), cfg.coraWebhookToken)) {
    return { status: 404, body: { error: "Não encontrado." } };
  }
  const h = (n: string) => { const v = headers[n]; return Array.isArray(v) ? v[0] : v; };
  const resourceId = String(h("webhook-resource-id") || "");
  const eventType = String(h("webhook-event-type") || "");
  if (!resourceId || !/^inv_[A-Za-z0-9_-]{5,60}$/.test(resourceId)) return { status: 200, body: { success: true } };
  const all = await deps.listContracts();
  for (const c of all) {
    const ch = (c.charges || []).find((x) => x.coraInvoiceId === resourceId);
    if (!ch) continue;
    try { await reconcileCharge(c.id, ch.paymentId); }
    catch (e: any) {
      console.error("[cora] Falha ao conciliar após webhook:", e?.message || e);
      return { status: 500, body: { error: "Falha ao processar." } }; // 5xx → o Cora tenta de novo
    }
    break;
  }
  void eventType;
  return { status: 200, body: { success: true } };
}

// ---------------------------------------------------------------------------
// Varredura periódica
// ---------------------------------------------------------------------------

let sweeping = false;

export async function runBillingSweep(): Promise<void> {
  if (sweeping) return;
  sweeping = true;
  try {
    const cfg = await getCoraConfig();
    if (!cfg.enabled) return;
    const today = localDate(deps.now());
    const contracts = (await deps.listContracts()).filter((c) => c.status === "assinado" && (c.data.pagamentos || []).length > 0);
    if (!contracts.length) return;
    let arch: any[] | null = null;

    for (const listed of contracts) {
      try {
        let c: Contract = await initCharges(listed.id);
        for (const ch of c.charges || []) {
          // 1) cobranças em aberto: confere no Cora (rede de segurança para o webhook)
          if (ch.status === "emitida" || ch.status === "vencida") {
            const last = ch.lastCheckAt ? new Date(ch.lastCheckAt).getTime() : 0;
            if (deps.now().getTime() - last > 25 * 60_000) await reconcileCharge(c.id, ch.paymentId).catch((e) => console.warn("[cora] conciliação:", e?.message || e));
            continue;
          }
          // 2) emissão travada no meio (processo caiu): vira "erro" para o admin decidir
          if (ch.status === "emitindo") {
            const last = ch.lastCheckAt ? new Date(ch.lastCheckAt).getTime() : 0;
            if (deps.now().getTime() - last > 15 * 60_000) {
              await withLock(c.id, () => patchCharges(c.id, (cs) => cs.map((x) => x.paymentId === ch.paymentId && x.status === "emitindo"
                ? { ...x, status: "erro" as ChargeStatus, lastError: "A emissão não foi concluída. Confira no app do Cora se o boleto existe antes de tentar de novo." } : x)));
            }
            continue;
          }
          if (ch.status !== "aguardando_gatilho") continue;

          if (ch.gatilho === "assinatura") {
            if (!cfg.autoEmitirAssinatura) continue;
            const signedDay = c.signature?.closedAt ? localDate(new Date(c.signature.closedAt)) : today;
            const due = addDays(signedDay, cfg.diasVencimentoAssinatura);
            await emitCharge(c.id, ch.paymentId, { dueDate: due < today ? today : due, origem: "auto" }).catch(() => undefined);
          } else if (ch.gatilho === "data" && ch.dataVencimento) {
            if (today >= addDays(ch.dataVencimento, -cfg.antecedenciaDataDias)) {
              await emitCharge(c.id, ch.paymentId, { dueDate: ch.dataVencimento < today ? today : ch.dataVencimento, origem: "auto" }).catch(() => undefined);
            }
          } else if (ch.gatilho === "etapa_aprovada" || ch.gatilho === "etapa_entregue") {
            if (!arch) arch = await deps.listArchProjects().catch(() => []);
            if (etapaAtingida(c, ch, arch)) {
              await withLock(c.id, () => patchCharges(c.id, (cs) => cs.map((x) => x.paymentId === ch.paymentId && x.status === "aguardando_gatilho"
                ? { ...x, status: "aguardando_confirmacao" as ChargeStatus, gatilhoAtingidoEm: deps.now().toISOString() } : x)));
              await notifyAdmins(c, `Etapa atingida no contrato nº ${pad2(c.number)} (${c.data.contratante.name}): confirme a emissão da cobrança "${ch.descricao}" — R$ ${formatCents(ch.valorCents)}.`);
            }
          }
        }
      } catch (e: any) {
        console.error(`[cora] Varredura do contrato ${listed.id}:`, e?.message || e);
      }
    }
  } finally {
    sweeping = false;
  }
}

let timer: NodeJS.Timeout | null = null;
export function startBillingScheduler(intervalMinutes = 10): void {
  if (timer) return;
  const ms = Math.max(60_000, Math.round(intervalMinutes * 60_000));
  console.log(`[cora] Agendador de cobranças iniciado (a cada ${intervalMinutes} min).`);
  setTimeout(() => { void runBillingSweep(); }, 30_000);
  timer = setInterval(() => { void runBillingSweep(); }, ms);
}
