// src/lib/server/clicksignServer.ts
//
// Assinatura eletrônica de contratos via ClickSign (API v3) — SOMENTE backend.
// O token de acesso e o segredo do webhook vivem aqui (env ou settings/clicksign),
// NUNCA no bundle do frontend — mesmo padrão de telegramServer.ts e whatsappServer.ts.
//
// Fluxo de envio (um envelope por contrato):
//   1. cria o envelope            POST /api/v3/envelopes
//   2. envia o PDF                POST /api/v3/envelopes/{id}/documents
//   3. cadastra os signatários    POST /api/v3/envelopes/{id}/signers
//   4. define os requisitos       POST /api/v3/envelopes/{id}/requirements
//        (qualificação "agree" + autenticação "provide_evidence" por signatário)
//   5. ativa o envelope           PATCH /api/v3/envelopes/{id}  (status: running)
//
// Retorno: o ClickSign chama POST /api/webhooks/clicksign (público, validado por HMAC)
// a cada assinatura/conclusão/cancelamento; este módulo atualiza o contrato no banco.

import crypto from "node:crypto";
import * as dataService from "./dataService";
import * as telegram from "./telegramServer";
import { getAdminDb } from "./db";
import { CONTRACT_TYPE_LABELS } from "../contractTemplates";
import type {
  Contract, ContractPersonData, ContractSignature, ContractSignerState,
} from "../../types";

// ---------------------------------------------------------------------------
// Configuração
// ---------------------------------------------------------------------------

export type ClicksignEnvironment = "sandbox" | "production";

export interface ClicksignConfig {
  enabled: boolean;
  environment: ClicksignEnvironment;
  /** Segredo: token de acesso gerado em Configurações → API do ClickSign. */
  clicksignAccessToken: string;
  /** Segredo: chave devolvida ao cadastrar o webhook (valida o HMAC). */
  clicksignWebhookSecret: string;
  webhookId: string;
  webhookEndpoint: string;

  // Quem assina pela CBC (Contratada). Obrigatório para enviar.
  cbcSignerName: string;
  cbcSignerEmail: string;
  cbcSignerCpf: string;

  /** Prazo (dias) para os signatários assinarem. */
  deadlineDays: number;
  /** Intervalo (dias) entre lembretes automáticos. */
  remindInterval: "1" | "2" | "3" | "7" | "14";
  /** Autenticação exigida de cada signatário. */
  authMethod: "email" | "sms" | "whatsapp" | "pix" | "icp_brasil" | "selfie" | "official_document";
}

const DEFAULTS: ClicksignConfig = {
  enabled: false,
  environment: "sandbox",
  clicksignAccessToken: "",
  clicksignWebhookSecret: "",
  webhookId: "",
  webhookEndpoint: "",
  cbcSignerName: "Pedro Luiz Chaves da Silva",
  cbcSignerEmail: "chavesbritescorrea@gmail.com",
  cbcSignerCpf: "",
  deadlineDays: 30,
  remindInterval: "3",
  authMethod: "email",
};

const SECRET_FIELDS = ["clicksignAccessToken", "clicksignWebhookSecret"] as const;

const REMIND_VALUES = ["1", "2", "3", "7", "14"];
const AUTH_VALUES = ["email", "sms", "whatsapp", "pix", "icp_brasil", "selfie", "official_document"];

export async function getClicksignConfig(): Promise<ClicksignConfig> {
  const cfg: ClicksignConfig = {
    ...DEFAULTS,
    enabled: process.env.CLICKSIGN_ENABLED === "1",
    environment: process.env.CLICKSIGN_ENV === "production" ? "production" : DEFAULTS.environment,
    clicksignAccessToken: process.env.CLICKSIGN_ACCESS_TOKEN || "",
    clicksignWebhookSecret: process.env.CLICKSIGN_WEBHOOK_SECRET || "",
    cbcSignerName: process.env.CLICKSIGN_CBC_SIGNER_NAME || "",
    cbcSignerEmail: process.env.CLICKSIGN_CBC_SIGNER_EMAIL || "",
    cbcSignerCpf: process.env.CLICKSIGN_CBC_SIGNER_CPF || "",
  };
  try {
    const snap = await getAdminDb().collection("settings").doc("clicksign").get();
    if (snap.exists) {
      const d = (snap.data() || {}) as Record<string, unknown>;
      for (const key of Object.keys(DEFAULTS) as (keyof ClicksignConfig)[]) {
        const incoming = d[key];
        if (incoming === undefined || incoming === null || incoming === "") continue;
        // Env vence sobre o banco para segredos (permite rotacionar sem UI).
        if ((SECRET_FIELDS as readonly string[]).includes(key) && cfg[key]) continue;
        (cfg as unknown as Record<string, unknown>)[key] = incoming;
      }
      if (typeof d.enabled === "boolean") cfg.enabled = d.enabled;
    }
  } catch {
    // Sem banco: usa só o que veio da env.
  }
  if (!REMIND_VALUES.includes(cfg.remindInterval)) cfg.remindInterval = DEFAULTS.remindInterval;
  if (!AUTH_VALUES.includes(cfg.authMethod)) cfg.authMethod = DEFAULTS.authMethod;
  const dl = Number(cfg.deadlineDays);
  cfg.deadlineDays = Number.isFinite(dl) && dl >= 1 && dl <= 365 ? Math.round(dl) : DEFAULTS.deadlineDays;
  return cfg;
}

function mask(value: string): string {
  if (!value) return "";
  if (value.length <= 10) return "•".repeat(value.length);
  return value.slice(0, 4) + "•".repeat(8) + value.slice(-4);
}

/** Config segura para a UI — nunca revela segredos. */
export async function getMaskedClicksignConfig() {
  const c = await getClicksignConfig();
  return {
    enabled: c.enabled,
    environment: c.environment,
    clicksignAccessTokenMasked: mask(c.clicksignAccessToken),
    clicksignAccessTokenSet: !!c.clicksignAccessToken,
    clicksignWebhookSecretSet: !!c.clicksignWebhookSecret,
    webhookId: c.webhookId,
    webhookEndpoint: c.webhookEndpoint,
    cbcSignerName: c.cbcSignerName,
    cbcSignerEmail: c.cbcSignerEmail,
    cbcSignerCpf: c.cbcSignerCpf,
    deadlineDays: c.deadlineDays,
    remindInterval: c.remindInterval,
    authMethod: c.authMethod,
  };
}

export async function saveClicksignConfig(input: Partial<ClicksignConfig>): Promise<void> {
  const current = await getClicksignConfig();
  const updated: ClicksignConfig = { ...current };
  // webhookId/webhookEndpoint/webhookSecret só mudam pelo registro do webhook.
  const editable: (keyof ClicksignConfig)[] = [
    "enabled", "environment", "clicksignAccessToken", "cbcSignerName", "cbcSignerEmail",
    "cbcSignerCpf", "deadlineDays", "remindInterval", "authMethod",
  ];
  for (const key of editable) {
    const incoming = input[key];
    if (incoming === undefined) continue;
    if (typeof incoming === "string" && incoming.includes("•")) continue; // campo mascarado = intocado
    (updated as unknown as Record<string, unknown>)[key] = incoming;
  }
  if (updated.environment !== "sandbox" && updated.environment !== "production") {
    throw new Error("Ambiente inválido (use sandbox ou production).");
  }
  if (updated.cbcSignerEmail && !EMAIL_RE.test(updated.cbcSignerEmail.trim())) {
    throw new Error("E-mail do representante da CBC inválido.");
  }
  if (updated.cbcSignerCpf && !formatCpf(updated.cbcSignerCpf)) {
    throw new Error("CPF do representante da CBC inválido (informe 11 dígitos).");
  }
  if (updated.cbcSignerEmail) updated.cbcSignerEmail = updated.cbcSignerEmail.trim().toLowerCase();
  if (updated.cbcSignerName) updated.cbcSignerName = updated.cbcSignerName.trim();
  if (updated.cbcSignerCpf) updated.cbcSignerCpf = formatCpf(updated.cbcSignerCpf) || "";
  await getAdminDb().collection("settings").doc("clicksign").set(updated, { merge: true });
}

// ---------------------------------------------------------------------------
// Cliente HTTP
// ---------------------------------------------------------------------------

export class ClicksignError extends Error {
  status: number;
  pointer?: string;
  constructor(message: string, status: number, pointer?: string) {
    super(message);
    this.status = status;
    this.pointer = pointer;
  }
}

export function baseUrl(cfg: ClicksignConfig): string {
  if (process.env.CLICKSIGN_BASE_URL) return process.env.CLICKSIGN_BASE_URL.replace(/\/+$/, "");
  return cfg.environment === "production" ? "https://app.clicksign.com" : "https://sandbox.clicksign.com";
}

function describeErrors(json: any, status: number): { message: string; pointer?: string } {
  const first = Array.isArray(json?.errors) ? json.errors[0] : null;
  const detail = first?.detail || first?.title || (typeof json?.error === "string" ? json.error : "");
  const pointer: string | undefined = first?.source?.pointer;
  if (status === 401 || status === 403) {
    return { message: "Token do ClickSign inválido ou sem permissão. Gere um novo em Configurações → API.", pointer };
  }
  if (status === 503) {
    return {
      message: "O ClickSign recusou o pedido (503). Verifique se o recurso de Envelopes (API v3) está ativado na conta — se não estiver, peça a ativação em ajuda@clicksign.com.",
      pointer,
    };
  }
  const where = pointer ? ` (${pointer})` : "";
  return { message: detail ? `${detail}${where}` : `Erro ${status} do ClickSign.`, pointer };
}

async function csFetch(cfg: ClicksignConfig, method: string, path: string, body?: unknown): Promise<any> {
  if (!cfg.clicksignAccessToken) throw new ClicksignError("Token de acesso do ClickSign não configurado.", 400);
  let res: Response;
  try {
    res = await fetch(`${baseUrl(cfg)}${path}`, {
      method,
      headers: {
        Authorization: cfg.clicksignAccessToken, // sem "Bearer"
        "Content-Type": "application/vnd.api+json",
        Accept: "application/vnd.api+json",
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(60_000),
    });
  } catch (e: any) {
    throw new ClicksignError(`Não foi possível falar com o ClickSign: ${e?.message || e}`, 0);
  }
  const raw = await res.text();
  let json: any = {};
  if (raw) { try { json = JSON.parse(raw); } catch { json = { raw }; } }
  if (!res.ok) {
    const { message, pointer } = describeErrors(json, res.status);
    throw new ClicksignError(message, res.status, pointer);
  }
  return json;
}

export async function testConnection(): Promise<{ ok: true; environment: ClicksignEnvironment }> {
  const cfg = await getClicksignConfig();
  await csFetch(cfg, "GET", "/api/v3/envelopes");
  return { ok: true, environment: cfg.environment };
}

// ---------------------------------------------------------------------------
// Validação de dados
// ---------------------------------------------------------------------------

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** "12345678901" / "123.456.789-01" → "123.456.789-01"; null se não tiver 11 dígitos. */
export function formatCpf(raw: string | undefined | null): string | null {
  const d = String(raw || "").replace(/\D/g, "");
  if (d.length !== 11) return null;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

export interface SignerPlan {
  key: string;
  papel: string;
  name: string;
  email: string;
  cpf?: string; // só CPF válido (CNPJ não é aceito pelo campo documentation)
  /** Qualificação preferida no ClickSign; se recusada, cai para "sign". */
  role: "contractor" | "party" | "sign";
  /** Origem do e-mail, mostrada na confirmação de envio. */
  fonte?: string;
}

export interface SignaturePlan {
  signers: SignerPlan[];
  errors: string[];
  warnings: string[];
}

function personSigner(
  key: string, papel: string, p: ContractPersonData | undefined, role: SignerPlan["role"],
  errors: string[], opts?: { optional?: boolean },
): SignerPlan | null {
  const name = (p?.name || "").trim();
  const email = (p?.email || "").trim().toLowerCase();
  if (!name && !email) {
    if (!opts?.optional) errors.push(`${papel}: dados não preenchidos.`);
    return null;
  }
  if (wordCount(name) < 2) errors.push(`${papel}: informe o nome completo (nome e sobrenome).`);
  if (!email) errors.push(`${papel}: e-mail não informado — é por ele que o ClickSign envia o documento.`);
  else if (!EMAIL_RE.test(email)) errors.push(`${papel}: e-mail inválido (${email}).`);
  return { key, papel, name, email, cpf: formatCpf(p?.cpfCnpj) || undefined, role };
}

/** Monta e valida a lista de signatários a partir do contrato salvo + configuração da CBC. */
export function buildSignaturePlan(contract: Contract, cfg: ClicksignConfig, opts?: { clientEmail?: string }): SignaturePlan {
  const errors: string[] = [];
  const warnings: string[] = [];
  const d = contract.data;
  const signers: SignerPlan[] = [];
  const push = (s: SignerPlan | null) => { if (s) signers.push(s); };

  const cbcName = cfg.cbcSignerName.trim();
  const cbcEmail = cfg.cbcSignerEmail.trim().toLowerCase();
  let cbcPlan: SignerPlan | null | undefined;
  const getCbc = (key: string, papel: string): SignerPlan | null => {
    if (cbcPlan === undefined) {
      if (!cbcName || !cbcEmail) {
        errors.push("Representante da CBC não configurado (nome e e-mail) — ajuste em Assinatura eletrônica → Configurar.");
        cbcPlan = null;
      } else {
        if (wordCount(cbcName) < 2) errors.push("Representante da CBC: informe o nome completo.");
        if (!EMAIL_RE.test(cbcEmail)) errors.push(`Representante da CBC: e-mail inválido (${cbcEmail}).`);
        cbcPlan = { key, papel, name: cbcName, email: cbcEmail, cpf: formatCpf(cfg.cbcSignerCpf) || undefined, role: "party" };
      }
    }
    return cbcPlan ? { ...cbcPlan, key, papel } : null;
  };

  // O e-mail do contratante é SEMPRE o do cadastro do cliente (quando existe); o do contrato é só reserva.
  const clientEmail = (opts?.clientEmail || "").trim().toLowerCase();
  const contratantePerson: ContractPersonData = clientEmail ? { ...d.contratante, email: clientEmail } : d.contratante;
  const contratanteSigner = personSigner("contratante", "Contratante", contratantePerson, "contractor", errors);
  if (contratanteSigner) contratanteSigner.fonte = clientEmail ? "e-mail do cadastro do cliente" : "e-mail informado no contrato";
  push(contratanteSigner);
  const snapshotEmail = (d.contratante?.email || "").trim().toLowerCase();
  if (clientEmail && snapshotEmail && snapshotEmail !== clientEmail) {
    warnings.push(`O e-mail digitado no contrato (${snapshotEmail}) difere do cadastro do cliente — será usado o do cadastro (${clientEmail}).`);
  }
  if (contract.type === "empreitada_mao_de_obra") {
    push(personSigner("contratante-solidario", "Contratante solidário", d.contratanteSolidario, "contractor", errors, { optional: true }));
    push(personSigner("contratado", "Contratado", d.contratado, "party", errors));
    // Interveniente-fiscalizadora: responsável técnico informado (com e-mail) ou, na falta, o representante da CBC.
    if (d.responsavelTecnico?.email) push(personSigner("interveniente", "Interveniente-fiscalizadora", d.responsavelTecnico, "party", errors));
    else push(getCbc("interveniente", "Interveniente-fiscalizadora (CBC)"));
  } else {
    push(getCbc("cbc", "Contratada (CBC)"));
  }

  (d.testemunhas || []).forEach((t, i) => {
    if (!t?.name?.trim() && !t?.email?.trim()) return;
    push(personSigner(`testemunha-${i + 1}`, `Testemunha ${i + 1}`, t, "sign", errors));
  });
  if (!(d.testemunhas || []).some((t) => t?.name?.trim())) {
    warnings.push("Nenhuma testemunha informada — o contrato será assinado apenas pelas partes.");
  }

  // E-mails repetidos: o ClickSign trata cada signatário por e-mail.
  const seen = new Map<string, string>();
  for (const s of signers) {
    if (!s.email) continue;
    const prev = seen.get(s.email);
    if (prev) errors.push(`${s.papel} e ${prev} usam o mesmo e-mail (${s.email}). Cada signatário precisa de um e-mail próprio.`);
    else seen.set(s.email, s.papel);
  }
  for (const s of signers) {
    if (!s.cpf && s.role !== "sign") warnings.push(`${s.papel}: sem CPF válido — o ClickSign não conferirá o CPF na assinatura.`);
  }
  if (signers.length < 2) errors.push("Um contrato precisa de pelo menos 2 signatários.");

  if (contract.status === "assinado") errors.push("Este contrato já está assinado.");
  if (contract.signature?.status === "running") errors.push("Este contrato já foi enviado e aguarda assinaturas.");

  return { signers, errors, warnings };
}

// ---------------------------------------------------------------------------
// Persistência (injetável nos testes)
// ---------------------------------------------------------------------------

export interface Deps {
  getContract(id: string): Promise<Contract | null>;
  getClientEmail(clientId: string): Promise<string>;
  saveContract(id: string, patch: Record<string, unknown>): Promise<void>;
  listContracts(): Promise<Contract[]>;
  listAdminUserIds(): Promise<string[]>;
  saveNotification(id: string, data: Record<string, unknown>): Promise<void>;
  archivePdf(base64: string, fileName: string): Promise<string>; // devolve URL
  now(): Date;
}

const defaultDeps: Deps = {
  getContract: (id) => dataService.getDocById("contracts", id) as Promise<Contract | null>,
  getClientEmail: async (clientId) => {
    const c = (await dataService.getDocById("clients", clientId)) as { email?: string } | null;
    return (c?.email || "").trim();
  },
  saveContract: (id, patch) => dataService.setDocById("contracts", id, patch),
  listContracts: () => dataService.listCollection("contracts") as Promise<Contract[]>,
  listAdminUserIds: async () => {
    const users = (await dataService.listCollection("users")) as any[];
    return users.filter((u) => u.role === "admin").map((u) => String(u.id));
  },
  saveNotification: (id, data) => dataService.setDocById("notifications", id, data),
  archivePdf: async (base64, fileName) => {
    const r = await telegram.sendDocument(base64, fileName, "application/pdf");
    return r.url;
  },
  now: () => new Date(),
};

let deps: Deps = defaultDeps;
let signedHook: ((contractId: string) => void) | null = null;
/** Chamado quando um contrato fica 100% assinado (ex.: dispara a emissão da cobrança "na assinatura"). */
export function setSignedHook(fn: ((contractId: string) => void) | null) { signedHook = fn; }

/** Só para testes. */
export function __setDeps(d: Partial<Deps> | null) { deps = d ? { ...defaultDeps, ...d } : defaultDeps; }

/** Aplica uma alteração sobre o contrato ATUAL do banco (evita sobrescrever dados mais novos). */
async function mutateContract(id: string, fn: (c: Contract) => Record<string, unknown>): Promise<Contract> {
  const current = await deps.getContract(id);
  if (!current) throw new Error("Contrato não encontrado.");
  const patch = fn(current);
  await deps.saveContract(id, patch);
  return { ...current, ...patch } as Contract;
}

async function notifyAdmins(contract: Contract, summary: string) {
  try {
    const ids = await deps.listAdminUserIds();
    const at = deps.now().toISOString();
    for (const uid of ids) {
      const id = `notif-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      await deps.saveNotification(id, {
        id, recipientUserId: uid, actorUserId: "clicksign", actorName: "ClickSign", actorRole: "system",
        action: "update", collection: "contracts", entityId: contract.id,
        projectId: contract.projectId || null, summary, read: false, createdAt: at,
      });
    }
  } catch (e: any) {
    console.error("[clicksign] Falha ao notificar:", e?.message || e);
  }
}

async function planFor(contract: Contract, cfg: ClicksignConfig): Promise<SignaturePlan> {
  let clientEmail = "";
  const clientId = contract.data?.contratanteId;
  if (clientId) {
    try { clientEmail = await deps.getClientEmail(clientId); } catch { /* sem cadastro: usa o do contrato */ }
  }
  return buildSignaturePlan(contract, cfg, { clientEmail });
}

/** Dados da tela de confirmação de envio. */
export async function previewSignature(contractId: string) {
  const cfg = await getClicksignConfig();
  const contract = await deps.getContract(contractId);
  if (!contract) return null;
  const plan = await planFor(contract, cfg);
  const problems = [...plan.errors];
  if (!cfg.enabled) problems.unshift("A assinatura eletrônica está desativada em Configurar.");
  if (!cfg.clicksignAccessToken) problems.unshift("Token de acesso do ClickSign não configurado.");
  if (!cfg.clicksignWebhookSecret) {
    plan.warnings.push('Webhook ainda não cadastrado: o HUB não será avisado automaticamente das assinaturas (use "Atualizar status").');
  }
  return {
    environment: cfg.environment,
    deadlineDays: cfg.deadlineDays,
    authMethod: cfg.authMethod,
    signers: plan.signers.map(({ papel, name, email, cpf, fonte }) => ({ papel, name, email, cpf: cpf || null, fonte: fonte || null })),
    errors: problems,
    warnings: plan.warnings,
  };
}

// ---------------------------------------------------------------------------
// Envio para assinatura
// ---------------------------------------------------------------------------

const pad2 = (n: number) => String(n).padStart(2, "0");

function contractTitle(c: Contract): string {
  const tipo = CONTRACT_TYPE_LABELS[c.type] || "Contrato";
  return `Contrato nº ${pad2(c.number)} – ${tipo} – ${c.data.contratante.name}`.slice(0, 180);
}

function deadlineIso(cfg: ClicksignConfig, from: Date): string {
  const d = new Date(from.getTime() + cfg.deadlineDays * 86_400_000);
  // Fim do dia no fuso do escritório (MS/AM: UTC-4).
  const local = new Date(d.getTime() - 4 * 3_600_000);
  return `${local.getUTCFullYear()}-${pad2(local.getUTCMonth() + 1)}-${pad2(local.getUTCDate())}T23:59:59-04:00`;
}

export interface SendInput {
  contractId: string;
  pdfBase64: string;      // PDF gerado no navegador (com ou sem prefixo data:)
  actorName?: string;
}

export async function sendContractForSignature(input: SendInput): Promise<ContractSignature> {
  const cfg = await getClicksignConfig();
  if (!cfg.enabled) throw new Error("A assinatura eletrônica está desativada. Ative em Assinatura eletrônica → Configurar.");
  if (!cfg.clicksignAccessToken) throw new Error("Token de acesso do ClickSign não configurado.");

  const contract = await deps.getContract(input.contractId);
  if (!contract) throw new Error("Contrato não encontrado.");

  const plan = await planFor(contract, cfg);
  if (plan.errors.length) throw new Error(plan.errors.join(" "));

  const clean = input.pdfBase64.includes("base64,") ? input.pdfBase64.split("base64,")[1] : input.pdfBase64;
  const pdf = Buffer.from(clean, "base64");
  if (pdf.length < 1000 || pdf.subarray(0, 5).toString("latin1") !== "%PDF-") throw new Error("Arquivo enviado não é um PDF válido.");
  if (pdf.length > 20 * 1024 * 1024) throw new Error("PDF acima de 20MB.");
  const sha = crypto.createHash("sha256").update(pdf).digest("hex");

  const now = deps.now();
  const title = contractTitle(contract);
  const fileName = `Contrato-${pad2(contract.number)}-${(contract.data.contratante.name || "cliente").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "")}.pdf`;

  let envelopeId = "";
  try {
    // 1) envelope
    const env = await csFetch(cfg, "POST", "/api/v3/envelopes", {
      data: {
        type: "envelopes",
        attributes: {
          name: title,
          locale: "pt-BR",
          auto_close: true,
          remind_interval: cfg.remindInterval,
          block_after_refusal: false,
          deadline_at: deadlineIso(cfg, now),
          default_subject: `Contrato para assinatura — Chaves Brites Correa`,
          default_message: `Olá! Segue para assinatura eletrônica o ${title}. Em caso de dúvida, fale com o escritório Chaves Brites Correa.`,
        },
      },
    });
    envelopeId = String(env?.data?.id || "");
    if (!envelopeId) throw new Error("O ClickSign não devolveu o id do envelope.");

    // 2) documento
    const doc = await csFetch(cfg, "POST", `/api/v3/envelopes/${envelopeId}/documents`, {
      data: {
        type: "documents",
        attributes: {
          filename: fileName,
          content_base64: `data:application/pdf;base64,${pdf.toString("base64")}`,
          metadata: JSON.stringify({ app: "hub-cbc", contractId: contract.id }),
        },
      },
    });
    const documentId = String(doc?.data?.id || "");
    if (!documentId) throw new Error("O ClickSign não devolveu o id do documento.");

    // 3) signatários
    const states: ContractSignerState[] = [];
    for (const s of plan.signers) {
      const attributes: Record<string, unknown> = {
        name: s.name,
        email: s.email,
        has_documentation: !!s.cpf,
        refusable: false,
        group: 1,
        location_required_enabled: false,
        communicate_events: { signature_request: "email", signature_reminder: "email", document_signed: "email" },
      };
      if (s.cpf) attributes.documentation = s.cpf;
      const created = await csFetch(cfg, "POST", `/api/v3/envelopes/${envelopeId}/signers`, {
        data: { type: "signers", attributes },
      });
      const signerId = String(created?.data?.id || "");
      if (!signerId) throw new Error(`O ClickSign não devolveu o id do signatário (${s.papel}).`);
      states.push({ key: s.key, papel: s.papel, name: s.name, email: s.email, signerId, signed: false });
    }

    // 4) requisitos: qualificação + autenticação para cada signatário
    for (const s of plan.signers) {
      const signerId = states.find((x) => x.key === s.key)!.signerId!;
      const rel = {
        document: { data: { type: "documents", id: documentId } },
        signer: { data: { type: "signers", id: signerId } },
      };
      const postReq = (attributes: Record<string, unknown>) =>
        csFetch(cfg, "POST", `/api/v3/envelopes/${envelopeId}/requirements`, {
          data: { type: "requirements", attributes, relationships: rel },
        });
      try {
        await postReq({ action: "agree", role: s.role });
      } catch (e) {
        // Papel não aceito pela conta/versão da API: usa o genérico "sign".
        if (e instanceof ClicksignError && (e.status === 400 || e.status === 422) && s.role !== "sign") {
          await postReq({ action: "agree", role: "sign" });
        } else throw e;
      }
      await postReq({ action: "provide_evidence", auth: cfg.authMethod });
    }

    // 5) ativa
    await csFetch(cfg, "PATCH", `/api/v3/envelopes/${envelopeId}`, {
      data: { id: envelopeId, type: "envelopes", attributes: { status: "running" } },
    });

    const signature: ContractSignature = {
      provider: "clicksign",
      environment: cfg.environment,
      envelopeId,
      documentId,
      status: "running",
      sentAt: now.toISOString(),
      sentBy: input.actorName,
      pdfSha256: sha,
      signers: states,
      processedEvents: [],
    };
    await mutateContract(contract.id, () => ({
      status: "enviado_assinatura",
      signature,
      updatedAt: now.toISOString(),
    }));
    return signature;
  } catch (e) {
    // Falhou no meio: apaga o rascunho para não deixar envelope órfão na conta.
    if (envelopeId) {
      try { await csFetch(cfg, "DELETE", `/api/v3/envelopes/${envelopeId}`); } catch { /* melhor esforço */ }
    }
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Cancelar / atualizar status / baixar assinado
// ---------------------------------------------------------------------------

export async function cancelSignature(contractId: string): Promise<void> {
  const cfg = await getClicksignConfig();
  const contract = await deps.getContract(contractId);
  if (!contract?.signature) throw new Error("Este contrato não foi enviado para assinatura.");
  if (contract.signature.status !== "running") throw new Error("O envio já foi encerrado.");
  await csFetch(cfg, "PATCH", `/api/v3/envelopes/${contract.signature.envelopeId}`, {
    data: { id: contract.signature.envelopeId, type: "envelopes", attributes: { status: "canceled" } },
  });
  await applyCanceled(contractId, "canceled");
}

async function applyCanceled(contractId: string, kind: "canceled" | "expired") {
  const at = deps.now().toISOString();
  const updated = await mutateContract(contractId, (c) => ({
    status: "gerado",
    signature: { ...(c.signature as ContractSignature), status: kind, lastEventAt: at },
    updatedAt: at,
  }));
  await notifyAdmins(updated, kind === "canceled"
    ? `Assinatura do contrato nº ${pad2(updated.number)} cancelada.`
    : `Prazo de assinatura do contrato nº ${pad2(updated.number)} expirou.`);
}

/** Procura recursivamente o link do PDF assinado em qualquer formato de resposta/webhook. */
export function findSignedUrl(obj: unknown): string | null {
  const seen = new Set<unknown>();
  const walk = (o: unknown): string | null => {
    if (!o || typeof o !== "object" || seen.has(o)) return null;
    seen.add(o);
    for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
      if (typeof v === "string" && /^https?:\/\//i.test(v) && /^(signed|signed_file_url)$/i.test(k)) return v;
    }
    for (const v of Object.values(o as Record<string, unknown>)) {
      const r = walk(v);
      if (r) return r;
    }
    return null;
  };
  return walk(obj);
}

function isAllowedDownloadHost(url: string): boolean {
  try {
    const u = new URL(url);
    if (process.env.CLICKSIGN_ALLOW_ANY_DOWNLOAD_HOST === "1") return true; // só testes
    if (u.protocol !== "https:") return false;
    return /(\.|^)(amazonaws\.com|clicksign\.com|cloudfront\.net)$/i.test(u.hostname);
  } catch { return false; }
}

async function downloadPdf(url: string): Promise<Buffer> {
  if (!isAllowedDownloadHost(url)) throw new Error("Endereço do PDF assinado não reconhecido.");
  const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`Falha ao baixar o PDF assinado (${res.status}).`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > 50 * 1024 * 1024) throw new Error("PDF assinado acima de 50MB.");
  if (buf.subarray(0, 5).toString("latin1") !== "%PDF-") throw new Error("O arquivo assinado não é um PDF.");
  return buf;
}

/** Pede ao ClickSign um link novo (os links pré-assinados expiram em minutos). */
async function fetchFreshSignedUrl(cfg: ClicksignConfig, sig: ContractSignature): Promise<string> {
  const json = await csFetch(cfg, "GET", `/api/v3/envelopes/${sig.envelopeId}/documents/${sig.documentId}`);
  const url = findSignedUrl(json);
  if (!url) throw new Error("O ClickSign ainda não disponibilizou o PDF assinado. Tente de novo em instantes.");
  return url;
}

/** PDF assinado sob demanda (rota de download). */
export async function getSignedPdf(contractId: string): Promise<{ buffer: Buffer; fileName: string }> {
  const cfg = await getClicksignConfig();
  const contract = await deps.getContract(contractId);
  const sig = contract?.signature;
  if (!contract || !sig) throw new Error("Este contrato não foi enviado para assinatura.");
  if (sig.status !== "closed") throw new Error("O contrato ainda não foi assinado por todas as partes.");
  const url = await fetchFreshSignedUrl(cfg, sig);
  const buffer = await downloadPdf(url);
  return { buffer, fileName: sig.signedPdfFileName || `Contrato-${pad2(contract.number)}-assinado.pdf` };
}

async function archiveSignedPdf(contractId: string, knownUrl: string | null): Promise<void> {
  try {
    const cfg = await getClicksignConfig();
    const contract = await deps.getContract(contractId);
    const sig = contract?.signature;
    if (!contract || !sig || sig.signedPdfUrl) return;
    let buf: Buffer;
    try {
      if (!knownUrl) throw new Error("sem link");
      buf = await downloadPdf(knownUrl);
    } catch {
      buf = await downloadPdf(await fetchFreshSignedUrl(cfg, sig));
    }
    const fileName = `Contrato-${pad2(contract.number)}-assinado.pdf`;
    const url = await deps.archivePdf(buf.toString("base64"), fileName);
    await mutateContract(contractId, (c) => ({
      signature: { ...(c.signature as ContractSignature), signedPdfUrl: url, signedPdfFileName: fileName, archiveError: undefined },
    }));
  } catch (e: any) {
    console.error("[clicksign] Falha ao arquivar PDF assinado:", e?.message || e);
    try {
      await mutateContract(contractId, (c) => ({
        signature: { ...(c.signature as ContractSignature), archiveError: String(e?.message || e).slice(0, 200) },
      }));
    } catch { /* ignora */ }
  }
}

async function applyClosed(contractId: string, signedUrl: string | null) {
  const at = deps.now().toISOString();
  const before = await deps.getContract(contractId);
  const alreadyClosed = before?.signature?.status === "closed" && before.status === "assinado";
  const updated = await mutateContract(contractId, (c) => {
    const sig = c.signature as ContractSignature;
    return {
      status: "assinado",
      signature: {
        ...sig,
        status: "closed",
        closedAt: sig.closedAt || at,
        lastEventAt: at,
        signers: sig.signers.map((s) => ({ ...s, signed: s.refused ? s.signed : true, signedAt: s.signedAt || at })),
      },
      updatedAt: at,
    };
  });
  if (!alreadyClosed) {
    await notifyAdmins(updated, `Contrato nº ${pad2(updated.number)} assinado por todas as partes (${updated.data.contratante.name}).`);
  }
  if (!updated.signature?.signedPdfUrl) void archiveSignedPdf(contractId, signedUrl);
  if (!alreadyClosed && signedHook) { try { signedHook(contractId); } catch { /* nunca derruba o webhook */ } }
}

/** Consulta o ClickSign e sincroniza o contrato (plano B quando o webhook falha). */
export async function refreshSignature(contractId: string): Promise<Contract> {
  const cfg = await getClicksignConfig();
  const contract = await deps.getContract(contractId);
  if (!contract?.signature) throw new Error("Este contrato não foi enviado para assinatura.");
  const env = await csFetch(cfg, "GET", `/api/v3/envelopes/${contract.signature.envelopeId}`);
  const status = String(env?.data?.attributes?.status || "");
  if (status === "closed") {
    await applyClosed(contractId, null);
  } else if (status === "canceled" && contract.signature.status === "running") {
    await applyCanceled(contractId, "canceled");
  }
  return (await deps.getContract(contractId)) as Contract;
}

// ---------------------------------------------------------------------------
// Webhook
// ---------------------------------------------------------------------------

export const WEBHOOK_EVENTS = ["sign", "refusal", "cancel", "deadline", "auto_close", "close", "document_closed"];

export function verifyHmac(raw: Buffer, secret: string, headerValue: string | undefined): boolean {
  if (!secret || !headerValue) return false;
  const provided = headerValue.trim().replace(/^sha256=/i, "").toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(provided)) return false;
  const expected = crypto.createHmac("sha256", secret).update(raw).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(provided, "hex"), Buffer.from(expected, "hex"));
}

function parseMetadata(m: unknown): Record<string, any> {
  if (!m) return {};
  if (typeof m === "object") return m as Record<string, any>;
  try { return JSON.parse(String(m)); } catch { return {}; }
}

export interface WebhookResult { status: number; body: Record<string, unknown> }

export async function handleWebhook(raw: Buffer, headers: Record<string, string | string[] | undefined>): Promise<WebhookResult> {
  const cfg = await getClicksignConfig();
  if (!cfg.clicksignWebhookSecret) {
    return { status: 503, body: { error: "Webhook não configurado no servidor." } };
  }
  const h = (n: string) => { const v = headers[n]; return Array.isArray(v) ? v[0] : v; };
  const sigHeader = h("content-hmac") || h("x-clicksign-signature");
  if (!verifyHmac(raw, cfg.clicksignWebhookSecret, sigHeader)) {
    return { status: 401, body: { error: "Assinatura inválida." } };
  }

  let payload: any;
  try { payload = JSON.parse(raw.toString("utf8")); } catch { return { status: 400, body: { error: "JSON inválido." } }; }

  const eventName = String(payload?.event?.name || "");
  const doc = payload?.document || payload?.event?.data?.document || {};
  const meta = parseMetadata(doc.metadata);
  const docKey = String(doc.key || doc.id || "");

  // Localiza o contrato: metadata (preferido) ou id do documento/envelope guardado no envio.
  let contract: Contract | null = null;
  if (meta.contractId) contract = await deps.getContract(String(meta.contractId));
  if (!contract && docKey) {
    const all = await deps.listContracts();
    contract = all.find((c) => c.signature?.documentId === docKey) || null;
  }
  if (!contract?.signature) {
    // Evento de outro sistema/conta ou contrato removido: 200 evita reenvios infinitos.
    return { status: 200, body: { ok: true, ignored: "contrato não encontrado" } };
  }
  const sig = contract.signature;
  if (sig.documentId && docKey && sig.documentId !== docKey) {
    return { status: 200, body: { ok: true, ignored: "documento não corresponde ao envio vigente" } };
  }

  const signerData = payload?.event?.data?.signer || payload?.event?.data?.signers?.[0] || {};
  const signerEmail = String(signerData.email || "").toLowerCase();
  const eventKey = `${eventName}|${payload?.event?.occurred_at || ""}|${signerEmail || signerData.key || ""}`;
  if ((sig.processedEvents || []).includes(eventKey)) {
    return { status: 200, body: { ok: true, duplicate: true } };
  }
  const remember = (c: Contract) => ({
    ...(c.signature as ContractSignature),
    processedEvents: [...((c.signature?.processedEvents) || []), eventKey].slice(-60),
  });
  const occurred = payload?.event?.occurred_at ? new Date(payload.event.occurred_at) : null;
  const at = occurred && !Number.isNaN(occurred.getTime()) ? occurred.toISOString() : deps.now().toISOString();

  switch (eventName) {
    case "sign": {
      const updated = await mutateContract(contract.id, (c) => {
        const s = remember(c);
        return {
          signature: {
            ...s,
            lastEventAt: at,
            signers: s.signers.map((x) =>
              signerEmail && x.email.toLowerCase() === signerEmail ? { ...x, signed: true, signedAt: x.signedAt || at } : x),
          },
        };
      });
      const who = updated.signature!.signers.find((x) => x.email.toLowerCase() === signerEmail);
      const done = updated.signature!.signers.filter((x) => x.signed).length;
      await notifyAdmins(updated, `${who?.name || signerData.name || "Signatário"} assinou o contrato nº ${pad2(updated.number)} (${done}/${updated.signature!.signers.length}).`);
      break;
    }
    case "refusal": {
      const updated = await mutateContract(contract.id, (c) => {
        const s = remember(c);
        return {
          signature: {
            ...s,
            lastEventAt: at,
            signers: s.signers.map((x) =>
              signerEmail && x.email.toLowerCase() === signerEmail ? { ...x, refused: true, refusedAt: at } : x),
          },
        };
      });
      await notifyAdmins(updated, `Assinatura do contrato nº ${pad2(updated.number)} RECUSADA por ${signerData.name || signerEmail || "um signatário"}.`);
      break;
    }
    case "cancel":
      await mutateContract(contract.id, (c) => ({ signature: remember(c) }));
      await applyCanceled(contract.id, "canceled");
      break;
    case "deadline":
      await mutateContract(contract.id, (c) => ({ signature: remember(c) }));
      await applyCanceled(contract.id, "expired");
      break;
    case "close":
    case "auto_close":
    case "document_closed": {
      await mutateContract(contract.id, (c) => ({ signature: remember(c) }));
      await applyClosed(contract.id, findSignedUrl(payload));
      break;
    }
    default:
      await mutateContract(contract.id, (c) => ({ signature: { ...remember(c), lastEventAt: at } }));
  }
  return { status: 200, body: { ok: true } };
}

// ---------------------------------------------------------------------------
// Cadastro do webhook na conta ClickSign
// ---------------------------------------------------------------------------

export async function registerWebhook(publicBaseUrl: string): Promise<{ endpoint: string; webhookId: string }> {
  const cfg = await getClicksignConfig();
  const base = String(publicBaseUrl || "").trim().replace(/\/+$/, "");
  if (!/^https:\/\/[^\s/]+/i.test(base)) throw new Error("Informe a URL pública (https) do HUB, ex.: https://hub.chavesbritescorrea.cloud");
  const endpoint = `${base}/api/webhooks/clicksign`;

  let id = "";
  let secret = "";
  let status = "";
  try {
    const created = await csFetch(cfg, "POST", "/api/v3/webhooks", {
      data: { type: "webhooks", attributes: { endpoint, status: "active", events: WEBHOOK_EVENTS } },
    });
    id = String(created?.data?.id || "");
    secret = String(created?.data?.attributes?.secret || "");
    status = String(created?.data?.attributes?.status || "");
  } catch (e) {
    // Endpoint já cadastrado: reaproveita o existente.
    if (!(e instanceof ClicksignError) || e.status !== 422) throw e;
    const list = await csFetch(cfg, "GET", "/api/v3/webhooks");
    const found = (list?.data || []).find((w: any) => w?.attributes?.endpoint === endpoint);
    if (!found) throw e;
    id = String(found.id);
    secret = String(found.attributes?.secret || "");
    status = String(found.attributes?.status || "");
  }
  if (!id) throw new Error("O ClickSign não devolveu o id do webhook.");
  if (status && status !== "active") {
    await csFetch(cfg, "PATCH", `/api/v3/webhooks/${id}`, {
      data: { id, type: "webhooks", attributes: { status: "active", events: WEBHOOK_EVENTS } },
    });
  }
  const patch: Record<string, unknown> = { webhookId: id, webhookEndpoint: endpoint };
  if (secret) patch.clicksignWebhookSecret = secret;
  else if (!cfg.clicksignWebhookSecret) {
    throw new Error("O ClickSign não devolveu o segredo do webhook. Informe-o em CLICKSIGN_WEBHOOK_SECRET.");
  }
  await getAdminDb().collection("settings").doc("clicksign").set(patch, { merge: true });
  return { endpoint, webhookId: id };
}
