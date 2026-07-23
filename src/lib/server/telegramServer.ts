// src/lib/server/telegramServer.ts
// Serviço do Telegram SOMENTE backend. O token do bot e o chat id vivem aqui (via env/Firestore),
// NUNCA no bundle do frontend. Toda chamada à API do Telegram é feita a partir do servidor.

import { getAdminDb } from "./db";

export interface TelegramConfig {
  botToken: string;
  chatId: string;
  fileNamePattern: string;
}

const DEFAULT_FILE_PATTERN = "{centro} - {data} - {fornecedor} - {descricao} - {valor}";

// Config vem exclusivamente de variáveis de ambiente do servidor ou do doc settings/telegram
// (gravado por um admin autenticado). Não há mais token hardcoded.
export async function getTelegramConfig(): Promise<TelegramConfig> {
  let botToken = process.env.TELEGRAM_BOT_TOKEN || "";
  let chatId = process.env.TELEGRAM_CHAT_ID || "";
  let fileNamePattern = DEFAULT_FILE_PATTERN;

  try {
    const db = getAdminDb();
    const snap = await db.collection("settings").doc("telegram").get();
    if (snap.exists) {
      const d = snap.data() || {};
      if (!botToken && d.botToken) botToken = d.botToken;
      if (!chatId && d.chatId) chatId = d.chatId;
      if (d.fileNamePattern) fileNamePattern = d.fileNamePattern;
    }
  } catch {
    // Sem Firestore: usa apenas o que veio da env.
  }
  return { botToken, chatId, fileNamePattern };
}

/** Config mascarada para exibição (nunca revela o token). */
export async function getMaskedTelegramConfig() {
  const c = await getTelegramConfig();
  const masked = c.botToken ? c.botToken.slice(0, 6) + "..." + c.botToken.slice(-4) : "";
  return { botTokenMasked: masked, botTokenSet: !!c.botToken, chatId: c.chatId, fileNamePattern: c.fileNamePattern };
}

export async function saveTelegramConfig(input: Partial<TelegramConfig>): Promise<void> {
  const db = getAdminDb();
  const current = await getTelegramConfig();
  const updated: TelegramConfig = {
    // Se veio mascarado ("..."), mantém o atual.
    botToken: input.botToken && !input.botToken.includes("...") ? input.botToken : current.botToken,
    chatId: input.chatId || current.chatId,
    fileNamePattern: input.fileNamePattern || current.fileNamePattern,
  };
  await db.collection("settings").doc("telegram").set(updated, { merge: true });
}

async function parseTelegramResponse(res: Response, fallback: string): Promise<any> {
  const raw = await res.text();
  let data: any = {};
  if (raw) { try { data = JSON.parse(raw); } catch { throw new Error("Resposta inválida da API do Telegram."); } }
  if (!data.ok) throw new Error(data.description || fallback);
  return data;
}

/** Envia um texto simples ao chat configurado. Usado pelos lembretes da Agenda. */
export async function sendTelegramMessage(text: string, chatIdOverride?: string): Promise<void> {
  const c = await getTelegramConfig();
  const chatId = chatIdOverride || c.chatId;
  if (!c.botToken || !chatId) throw new Error("Telegram não configurado no servidor.");
  const res = await fetch(`https://api.telegram.org/bot${c.botToken}/sendMessage`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown" }),
  });
  await parseTelegramResponse(res, "Erro ao enviar mensagem ao Telegram.");
}

export async function sendTestMessage(): Promise<void> {
  const msg = `🔌 *Teste de Integração Chaves Brites Correa*\n\n✅ Sistema conectado ao Telegram!\n📅 ${new Date().toLocaleString("pt-BR")}`;
  await sendTelegramMessage(msg);
}

/** Envia um documento (base64) ao Telegram e retorna uma URL de proxy do próprio backend. */
export async function sendDocument(base64Str: string, fileName: string, mimeType: string): Promise<{ url: string; fileId: string }> {
  const c = await getTelegramConfig();
  if (!c.botToken || !c.chatId) throw new Error("Telegram não configurado no servidor.");
  const clean = base64Str.includes("base64,") ? base64Str.split("base64,")[1] : base64Str;
  const buffer = Buffer.from(clean, "base64");
  const blob = new Blob([buffer], { type: mimeType || "application/octet-stream" });

  const form = new FormData();
  form.append("chat_id", c.chatId);
  form.append("document", blob, fileName || "arquivo.dat");
  form.append("caption", `📁 Anexo: \`${fileName || "arquivo"}\``);

  const res = await fetch(`https://api.telegram.org/bot${c.botToken}/sendDocument`, { method: "POST", body: form });
  const data = await parseTelegramResponse(res, "Erro ao enviar documento ao Telegram.");
  const fileId = data.result.document.file_id;
  // Devolve URL de PROXY do backend (não expõe o token na URL do arquivo).
  return { url: `/api/telegram/file/${encodeURIComponent(fileId)}`, fileId };
}

/** Resolve e baixa o binário de um fileId do Telegram (usado pelo proxy /api/telegram/file/:id). */
export async function fetchFileBinary(fileId: string): Promise<{ buffer: Buffer; contentType: string; fileName: string }> {
  const c = await getTelegramConfig();
  if (!c.botToken) throw new Error("Telegram Bot Token não configurado no servidor.");
  // Validação de fileId: só caracteres esperados de um file_id do Telegram (evita SSRF/path traversal).
  if (!/^[A-Za-z0-9_-]{1,256}$/.test(fileId)) throw new Error("Identificador de arquivo inválido.");

  const infoRes = await fetch(`https://api.telegram.org/bot${c.botToken}/getFile?file_id=${encodeURIComponent(fileId)}`);
  const info = await parseTelegramResponse(infoRes, "Erro ao localizar arquivo no Telegram.");
  const filePath = info.result.file_path;
  if (!filePath) throw new Error("Caminho do arquivo não informado pelo Telegram.");

  const dl = await fetch(`https://api.telegram.org/file/bot${c.botToken}/${filePath}`);
  if (!dl.ok) throw new Error(`Erro ao baixar arquivo do Telegram: ${dl.statusText}`);
  const contentType = dl.headers.get("content-type") || "application/octet-stream";
  const buffer = Buffer.from(await dl.arrayBuffer());
  const fileName = filePath.split("/").pop() || "arquivo";
  return { buffer, contentType, fileName };
}
