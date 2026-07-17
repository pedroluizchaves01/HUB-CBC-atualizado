// src/lib/server/fileValidation.ts
// Validação de arquivos no servidor: confere o TIPO REAL pelos magic bytes (assinatura do
// conteúdo), não confia no mimeType/extensão informados pelo cliente. Sem dependência externa.

export interface FileCheck {
  ok: boolean;
  detected: string | null; // mime detectado pelos magic bytes
  error?: string;
}

// Assinaturas (magic bytes) dos formatos que o app aceita.
function detectMime(buf: Buffer): string | null {
  if (buf.length < 4) return null;
  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "image/png";
  // PDF: 25 50 44 46 ("%PDF")
  if (buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46) return "application/pdf";
  // WEBP: "RIFF"...."WEBP"
  if (buf.length >= 12 &&
      buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
      buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) return "image/webp";
  // Documentos Office (xlsx/xls) e ZIP: PK.. — usados na importação de planilhas.
  if (buf[0] === 0x50 && buf[1] === 0x4b && (buf[2] === 0x03 || buf[2] === 0x05 || buf[2] === 0x07)) return "application/zip";
  // XLS antigo (OLE2): D0 CF 11 E0
  if (buf[0] === 0xd0 && buf[1] === 0xcf && buf[2] === 0x11 && buf[3] === 0xe0) return "application/vnd.ms-excel";
  return null;
}

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

/**
 * Valida um arquivo base64 contra tamanho e tipos permitidos (por magic bytes).
 * `allowed` é a lista de mimes reais aceitos (ex.: imagens+pdf). Planilhas e CSV são texto/zip
 * e podem passar `allowExtra` (ex.: para importação em lote).
 */
export function validateBase64File(
  base64: string,
  allowed: string[],
  opts?: { allowSpreadsheet?: boolean; maxBytes?: number }
): FileCheck {
  const clean = base64.includes("base64,") ? base64.split("base64,")[1] : base64;
  let buf: Buffer;
  try {
    buf = Buffer.from(clean, "base64");
  } catch {
    return { ok: false, detected: null, error: "Arquivo inválido (base64 corrompido)." };
  }
  const max = opts?.maxBytes ?? MAX_FILE_BYTES;
  if (buf.length === 0) return { ok: false, detected: null, error: "Arquivo vazio." };
  if (buf.length > max) {
    return { ok: false, detected: null, error: `Arquivo excede o limite de ${Math.round(max / 1024 / 1024)}MB.` };
  }

  const detected = detectMime(buf);

  // Planilhas (zip/xls) e CSV: quando permitido, aceitamos zip/ms-excel; CSV é texto e não tem
  // assinatura confiável, então só é aceito se allowSpreadsheet e o conteúdo for imprimível.
  if (opts?.allowSpreadsheet) {
    if (detected === "application/zip" || detected === "application/vnd.ms-excel") {
      return { ok: true, detected };
    }
    // CSV/texto: heurística simples — primeiros bytes imprimíveis.
    const sample = buf.subarray(0, 64).toString("utf8");
    const printable = /^[\x09\x0a\x0d\x20-\x7e -￿;,"']*$/.test(sample);
    if (printable && !detected) return { ok: true, detected: "text/csv" };
  }

  if (!detected) {
    return { ok: false, detected: null, error: "Não foi possível confirmar o tipo do arquivo. Envie JPG, PNG, WEBP ou PDF." };
  }
  if (!allowed.includes(detected)) {
    return { ok: false, detected, error: "Tipo de arquivo não permitido. Envie JPG, PNG, WEBP ou PDF." };
  }
  return { ok: true, detected };
}

export const RECEIPT_MIMES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
