import { doc, getDoc } from 'firebase/firestore';
import { db, saveDoc } from './firebaseDb';

export const DEFAULT_BOT_TOKEN = '8301754881:AAGhunIBqoCrngjRfaC3N9fkCCxyWktblKk';
export const DEFAULT_CHAT_ID = '-5480284811';
export const DEFAULT_FILE_PATTERN = '{centro} - {data} - {fornecedor} - {descricao} - {valor}';
const ADMIN_PASSWORD = 'Cbc*12345';

export interface TelegramConfig {
  botToken: string;
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

export function maskToken(token: string): string {
  if (!token) return '';
  if (token.length <= 10) return token;
  return token.substring(0, 6) + '...' + token.substring(token.length - 4);
}

export function buildTelegramFileName(pattern: string, fields: DocumentNameFields): string {
  const sanitize = (str: string) => str.replace(/[/\\?%*:|"<>\n\r]/g, '').trim();

  const centro = fields.centro !== undefined && fields.centro !== null && fields.centro !== ''
    ? sanitize(fields.centro)
    : 'Geral';

  const data = fields.data !== undefined && fields.data !== null && fields.data !== ''
    ? sanitize(fields.data)
    : new Date().toISOString().split('T')[0];

  const fornecedor = fields.fornecedor !== undefined && fields.fornecedor !== null && fields.fornecedor !== ''
    ? sanitize(fields.fornecedor)
    : 'Fornecedor';

  const descricao = fields.descricao !== undefined && fields.descricao !== null && fields.descricao !== ''
    ? sanitize(fields.descricao)
    : 'Documento';

  let valor = '';
  if (fields.valor !== undefined && fields.valor !== null && fields.valor !== '') {
    if (typeof fields.valor === 'number') {
      valor = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(fields.valor);
    } else {
      valor = fields.valor.toString();
    }
    valor = sanitize(valor);
  }

  // Replace placeholders in pattern
  let rawName = pattern
    .replace(/{centro}/g, centro)
    .replace(/{data}/g, data)
    .replace(/{fornecedor}/g, fornecedor)
    .replace(/{descricao}/g, descricao)
    .replace(/{valor}/g, valor);

  // Normalize spaces and hyphens
  rawName = rawName
    .replace(/\s*-\s*-\s*/g, ' - ')
    .replace(/\s*-\s*-\s*/g, ' - ')
    .replace(/-{2,}/g, '-')
    .trim();

  // Trim leading/trailing spaces and hyphens
  rawName = rawName.replace(/^[- ]+/, '').replace(/[- ]+$/, '');
  rawName = rawName.replace(/\s+/g, ' ');

  // Append file extension
  let ext = fields.extension || 'pdf';
  if (ext.includes('.')) {
    ext = ext.split('.').pop() || 'pdf';
  }
  ext = sanitize(ext);

  // Sanitize the full name and return with extension
  const sanitizedNameOnly = sanitize(rawName);
  return sanitizedNameOnly ? `${sanitizedNameOnly}.${ext}` : `Documento.${ext}`;
}

export async function getTelegramConfig(): Promise<TelegramConfig> {
  try {
    const ref = doc(db, 'settings', 'telegram');
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const data = snap.data() as Partial<TelegramConfig>;
      return {
        botToken: data.botToken || DEFAULT_BOT_TOKEN,
        chatId: data.chatId || DEFAULT_CHAT_ID,
        fileNamePattern: data.fileNamePattern || DEFAULT_FILE_PATTERN,
      };
    }
  } catch (e) {
    console.error('Erro ao ler configuração do Telegram no Firestore:', e);
  }
  return { botToken: DEFAULT_BOT_TOKEN, chatId: DEFAULT_CHAT_ID, fileNamePattern: DEFAULT_FILE_PATTERN };
}

// Garante que a config padrão exista no Firestore. Idempotente: roda a cada login
// mas só grava se ainda não existir nenhum documento.
export async function ensureDefaultTelegramConfig(): Promise<void> {
  try {
    const ref = doc(db, 'settings', 'telegram');
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await saveDoc('settings', 'telegram', {
        botToken: DEFAULT_BOT_TOKEN,
        chatId: DEFAULT_CHAT_ID,
        fileNamePattern: DEFAULT_FILE_PATTERN,
      });
      console.log('Configuração padrão do Telegram criada automaticamente no Firestore.');
    }
  } catch (e) {
    console.error('Erro ao garantir configuração padrão do Telegram:', e);
  }
}

export async function saveTelegramConfig(
  input: { botToken: string; chatId: string; fileNamePattern: string; password: string }
): Promise<{ success: boolean; message: string }> {
  if (input.password !== ADMIN_PASSWORD) {
    throw new Error('Senha de autorização incorreta. Você não tem permissão para alterar as configurações do banco de dados.');
  }
  const current = await getTelegramConfig();
  const updated: TelegramConfig = {
    botToken: input.botToken && !input.botToken.includes('...') ? input.botToken : current.botToken,
    chatId: input.chatId || current.chatId,
    fileNamePattern: input.fileNamePattern || current.fileNamePattern,
  };
  await saveDoc('settings', 'telegram', updated);
  return { success: true, message: 'Configuração do Banco de Dados salva com sucesso!' };
}

async function parseTelegramResponse(res: Response, fallbackError: string) {
  const raw = await res.text();
  let data: any = {};
  if (raw) {
    try { data = JSON.parse(raw); } catch { throw new Error('Resposta inválida da API do Telegram.'); }
  }
  if (!data.ok) {
    throw new Error(data.description || fallbackError);
  }
  return data;
}

export async function sendTelegramTestMessage(): Promise<{ success: boolean; message: string }> {
  const config = await getTelegramConfig();
  if (!config.botToken || !config.chatId) {
    throw new Error('Telegram não configurado. Insira o Token do Bot e o Chat ID primeiro.');
  }
  const testMsg = `🔌 *Teste de Integração Chaves Brites Correa*\n\n✅ O sistema está conectado e integrado com sucesso ao seu canal/grupo do Telegram!\n\n📅 Data: ${new Date().toLocaleString('pt-BR')}\n👤 Usuário: Painel Administrativo`;
  const res = await fetch(`https://api.telegram.org/bot${config.botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: config.chatId, text: testMsg, parse_mode: 'Markdown' }),
  });
  await parseTelegramResponse(res, 'Erro retornado pela API do Telegram');
  return { success: true, message: 'Mensagem de teste enviada com sucesso no Telegram!' };
}

function base64ToBlob(base64Str: string, mimeType: string): Blob {
  const cleanBase64 = base64Str.includes('base64,') ? base64Str.split('base64,')[1] : base64Str;
  const byteChars = atob(cleanBase64);
  const bytes = new Uint8Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) bytes[i] = byteChars.charCodeAt(i);
  return new Blob([bytes], { type: mimeType || 'application/octet-stream' });
}

export async function sendTelegramDocument(
  base64Str: string, fileName: string, mimeType: string
): Promise<{ url: string; fileId: string }> {
  const config = await getTelegramConfig();
  if (!config.botToken || !config.chatId) {
    throw new Error('Telegram não configurado. Acesse o Painel Admin e insira o Token do Bot e Chat ID.');
  }
  const fileBlob = base64ToBlob(base64Str, mimeType);
  const formData = new FormData();
  formData.append('chat_id', config.chatId);
  formData.append('document', fileBlob, fileName || 'arquivo.dat');
  formData.append('caption', `📁 *Novo Anexo Recebido*\n📄 Documento: \`${fileName || 'arquivo'}\`\n🔧 Processado pelo Sistema Chaves Brites Correa.`);

  const res = await fetch(`https://api.telegram.org/bot${config.botToken}/sendDocument`, {
    method: 'POST',
    body: formData,
  });
  const data = await parseTelegramResponse(res, 'Erro ao enviar documento para o Telegram');
  const fileId = data.result.document.file_id;

  const fileInfoRes = await fetch(`https://api.telegram.org/bot${config.botToken}/getFile?file_id=${fileId}`);
  const fileInfo = await parseTelegramResponse(fileInfoRes, 'Erro ao resolver arquivo no Telegram');
  const url = `https://api.telegram.org/file/bot${config.botToken}/${fileInfo.result.file_path}`;

  return { url, fileId };
}
