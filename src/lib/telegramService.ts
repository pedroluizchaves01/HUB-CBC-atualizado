// src/lib/telegramService.ts
// FRONTEND: apenas um cliente fino para os endpoints do backend guardião.
// Nenhum token de bot, senha ou chamada direta à API do Telegram vive aqui — tudo isso
// migrou para o servidor (src/lib/server/telegramServer.ts). O bundle não contém segredos.

import { apiGet, apiSend } from "./apiClient";

export interface TelegramConfig {
  botTokenMasked: string;
  botTokenSet: boolean;
  chatId: string;
  fileNamePattern: string;
}

export interface DocumentNameFields {
  centro?: string;
  data?: string;
  fornecedor?: string;
  descricao?: string;
  valor?: number | string;
  extension?: string;
}

/** Formata o nome do arquivo (lógica pura, pode rodar no cliente). */
export function buildTelegramFileName(pattern: string, fields: DocumentNameFields): string {
  const sanitize = (str: string) => str.replace(/[/\\?%*:|"<>\n\r]/g, "").trim();
  const centro = fields.centro ? sanitize(fields.centro) : "Geral";
  const data = fields.data ? sanitize(fields.data) : new Date().toISOString().split("T")[0];
  const fornecedor = fields.fornecedor ? sanitize(fields.fornecedor) : "Fornecedor";
  const descricao = fields.descricao ? sanitize(fields.descricao) : "Documento";

  let valor = "";
  if (fields.valor !== undefined && fields.valor !== null && fields.valor !== "") {
    valor = typeof fields.valor === "number"
      ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(fields.valor)
      : String(fields.valor);
    valor = sanitize(valor);
  }

  let rawName = (pattern || "{centro} - {data} - {fornecedor} - {descricao} - {valor}")
    .replace(/{centro}/g, centro).replace(/{data}/g, data).replace(/{fornecedor}/g, fornecedor)
    .replace(/{descricao}/g, descricao).replace(/{valor}/g, valor)
    .replace(/\s*-\s*-\s*/g, " - ").replace(/-{2,}/g, "-").trim()
    .replace(/^[- ]+/, "").replace(/[- ]+$/, "").replace(/\s+/g, " ");

  let ext = fields.extension || "pdf";
  if (ext.includes(".")) ext = ext.split(".").pop() || "pdf";
  ext = sanitize(ext);

  const nameOnly = sanitize(rawName);
  return nameOnly ? `${nameOnly}.${ext}` : `Documento.${ext}`;
}

export function maskToken(token: string): string {
  if (!token) return "";
  if (token.length <= 10) return token;
  return token.slice(0, 6) + "..." + token.slice(-4);
}

/** Lê a config (mascarada) do backend. */
export async function getTelegramConfig(): Promise<TelegramConfig> {
  return apiGet("/api/telegram/config");
}

// Compatibilidade: componentes chamavam ensureDefaultTelegramConfig no login.
// A config padrão agora é responsabilidade do servidor (env). No-op no cliente.
export async function ensureDefaultTelegramConfig(): Promise<void> { /* no-op */ }

/** Salva config no backend (o backend exige sessão de admin). */
export async function saveTelegramConfig(
  input: { botToken: string; chatId: string; fileNamePattern: string; password?: string }
): Promise<{ success: boolean; message: string }> {
  return apiSend("/api/telegram/config", "POST", {
    botToken: input.botToken, chatId: input.chatId, fileNamePattern: input.fileNamePattern,
  });
}

export async function sendTelegramTestMessage(): Promise<{ success: boolean; message: string }> {
  return apiSend("/api/telegram/test", "POST", {});
}

/** Envia um documento (base64) via backend e retorna a URL de proxy. */
export async function sendTelegramDocument(
  base64Str: string, fileName: string, mimeType: string
): Promise<{ url: string; fileId: string }> {
  const resp = await apiSend("/api/telegram/upload", "POST", { base64Str, fileName, mimeType });
  return { url: resp.url, fileId: resp.fileId };
}
