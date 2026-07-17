// src/lib/receiptOcr.ts
// Motor interno de extração de texto de comprovantes (imagens via OCR Tesseract WASM,
// PDFs via camada de texto com unpdf). Zero dependências nativas e zero downloads em
// runtime: os dados de idioma (por/eng) ficam versionados na pasta tessdata/ do projeto.
// NÃO importar este arquivo em componentes React (só roda no backend).

import path from "path";
import { createWorker, OEM, Worker } from "tesseract.js";
import { extractText, extractTextItems } from "unpdf";

// Resolve tessdata/ a partir do CWD: funciona em dev (tsx server.ts na raiz do repo)
// e em produção (node dist/server.cjs com WORKDIR /app no container).
const TESSDATA_DIR = path.join(process.cwd(), "tessdata");

// Timeouts generosos: a primeira execução carrega o WASM + traineddata (alguns segundos).
const OCR_INIT_TIMEOUT_MS = 60_000;
const OCR_RECOGNIZE_TIMEOUT_MS = 90_000;

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (err) => { clearTimeout(timer); reject(err); }
    );
  });
}

// Worker singleton: criado sob demanda na primeira requisição e mantido aquecido
// para as próximas (a inicialização do WASM é a parte cara).
let workerPromise: Promise<Worker> | null = null;

function getOcrWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = createWorker("por+eng", OEM.LSTM_ONLY, {
      langPath: TESSDATA_DIR,      // por.traineddata.gz / eng.traineddata.gz locais
      cachePath: TESSDATA_DIR,
      cacheMethod: "none",         // sem escrita de cache e sem rede: lê sempre do langPath local
      gzip: true,
    }).catch((err) => {
      // Se a inicialização falhar, permite nova tentativa na próxima requisição
      workerPromise = null;
      throw err;
    });
  }
  return workerPromise;
}

/** OCR de imagem (JPG/PNG/WEBP) com português + inglês. */
export async function extractTextFromImage(fileBase64: string): Promise<string> {
  const worker = await withTimeout(
    getOcrWorker(),
    OCR_INIT_TIMEOUT_MS,
    "O motor interno de OCR demorou demais para inicializar. Tente novamente em instantes."
  );
  const buffer = Buffer.from(fileBase64, "base64");
  const result = await withTimeout(
    worker.recognize(buffer),
    OCR_RECOGNIZE_TIMEOUT_MS,
    "A leitura do comprovante demorou demais (imagem muito grande?). Tente uma foto menor ou mais nítida."
  );
  return (result.data.text || "").trim();
}

/** Extrai a camada de texto de um PDF (sem rasterização — não lê PDF escaneado). */
export async function extractTextFromPdfFile(fileBase64: string): Promise<string> {
  const buffer = Buffer.from(fileBase64, "base64");

  // Preferimos extractTextItems para reconstruir as LINHAS do documento pela coordenada Y:
  // o parser de comprovantes é orientado a linhas (seções "Pagador"/"Recebedor" etc.),
  // e o extractText simples junta a página inteira em uma única linha.
  try {
    const { items } = await extractTextItems(new Uint8Array(buffer));
    const pages: string[] = [];
    for (const pageItems of items) {
      const visible = pageItems.filter((it) => it.str && it.str.trim().length > 0);
      // Ordena de cima para baixo (origem do PDF é o canto inferior esquerdo) e da esquerda para a direita
      visible.sort((a, b) => (Math.abs(b.y - a.y) > 2 ? b.y - a.y : a.x - b.x));
      const lines: string[] = [];
      let currentY: number | null = null;
      let currentLine: string[] = [];
      for (const it of visible) {
        const tolerance = Math.max(2, (it.fontSize || 10) * 0.4);
        if (currentY === null || Math.abs(it.y - currentY) <= tolerance) {
          currentLine.push(it.str);
          currentY = currentY === null ? it.y : currentY;
        } else {
          lines.push(currentLine.join(" "));
          currentLine = [it.str];
          currentY = it.y;
        }
      }
      if (currentLine.length > 0) lines.push(currentLine.join(" "));
      pages.push(lines.join("\n"));
    }
    const rebuilt = pages.join("\n").trim();
    if (rebuilt.length > 0) return rebuilt;
  } catch (err: any) {
    console.warn("extractTextItems falhou; usando extractText simples:", err?.message || err);
  }

  const { text } = await extractText(new Uint8Array(buffer), { mergePages: true });
  return (text || "").trim();
}

/**
 * Orquestra a extração de texto do comprovante conforme o tipo do arquivo.
 * Lança erros amigáveis em pt-BR quando não há texto legível.
 */
export async function extractReceiptText(fileBase64: string, mimeType: string): Promise<string> {
  if (mimeType === "application/pdf") {
    let text = "";
    try {
      text = await extractTextFromPdfFile(fileBase64);
    } catch (err: any) {
      console.error("Erro ao extrair texto do PDF com unpdf:", err);
      throw new Error("Não foi possível ler este PDF. Envie uma foto ou captura de tela do comprovante (JPG/PNG).");
    }
    if (text.replace(/\s+/g, "").length < 20) {
      throw new Error(
        "Este PDF parece ser digitalizado (imagem escaneada, sem camada de texto). " +
        "Envie uma foto ou captura de tela do comprovante (JPG/PNG) para o motor interno conseguir ler, " +
        "ou configure a GEMINI_API_KEY no servidor para análise por IA."
      );
    }
    return text;
  }

  // Imagens (JPG/PNG/WEBP)
  const text = await extractTextFromImage(fileBase64);
  if (text.replace(/\s+/g, "").length < 10) {
    throw new Error(
      "O motor interno de OCR não conseguiu ler texto nesta imagem. " +
      "Tente uma foto mais nítida, bem iluminada e sem cortes, ou preencha os campos manualmente."
    );
  }
  return text;
}
