import express from "express";
import path from "path";
import dotenv from "dotenv";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import { GoogleGenAI, Type } from "@google/genai";
import { createServer as createViteServer } from "vite";
import * as XLSX from "xlsx";
import { saveDocumentToDrive, DRIVE_FOLDERS } from "./src/lib/driveService";
import { extractReceiptText } from "./src/lib/receiptOcr";
import { parseBulkTransactionsFromPdf } from "./src/lib/bulkTransactionParser";
import { parseMaterialListFromPdf } from "./src/lib/materialListParser";
import { validateBase64File, RECEIPT_MIMES } from "./src/lib/server/fileValidation";
import { parseReceiptText } from "./src/lib/receiptParser";
import { authenticate, createSessionToken } from "./src/lib/server/authService";
import { requireAuth, requireRole } from "./src/lib/server/authMiddleware";
import * as dataService from "./src/lib/server/dataService";
import * as telegram from "./src/lib/server/telegramServer";
import { isDbConfigured, ensureSchema } from "./src/lib/server/db";

dotenv.config();

// Defesa em profundidade: uma promise rejeitada não deve derrubar o servidor inteiro.
// (Ex.: falha transitória de credencial/rede do Admin SDK vira erro tratado no request.)
process.on("unhandledRejection", (reason) => {
  console.error("unhandledRejection capturado (servidor segue de pé):", reason);
});

const app = express();
const PORT = 3000;

// Confia no proxy reverso (nginx) para IP correto no rate limit
app.set("trust proxy", 1);

// Cabeçalhos de segurança. CSP desabilitada aqui (o app tem estilos/inline próprios);
// se quiser CSP estrita, configure diretiva a diretiva.
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(cookieParser());

// Increase limit to handle PDF/Excel base64 uploads
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Rate limits: um geral para toda a API e um mais rígido para login (anti brute-force).
const apiLimiter = rateLimit({ windowMs: 60_000, max: 120, standardHeaders: true, legacyHeaders: false,
  message: { error: "Muitas requisições. Aguarde um instante e tente novamente." } });
const loginLimiter = rateLimit({ windowMs: 15 * 60_000, max: 10, standardHeaders: true, legacyHeaders: false,
  message: { error: "Muitas tentativas de login. Aguarde alguns minutos." } });
const aiLimiter = rateLimit({ windowMs: 60_000, max: 20, standardHeaders: true, legacyHeaders: false,
  message: { error: "Limite de análises por minuto atingido. Aguarde um instante." } });
app.use("/api/", apiLimiter);

// ==========================================
// AUTENTICAÇÃO (sessão via token assinado)
// ==========================================
app.post("/api/auth/login", loginLimiter, async (req, res) => {
  try {
    const { username, password } = req.body || {};
    const user = await authenticate(String(username || ""), String(password || ""));
    if (!user) return res.status(401).json({ error: "Usuário ou senha incorretos." });
    const token = createSessionToken(user);
    res.cookie("cbc_session", token, {
      httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production",
      maxAge: 12 * 60 * 60 * 1000,
    });
    return res.json({ success: true, user, token });
  } catch (e: any) {
    console.error("Erro no login:", e);
    return res.status(500).json({ error: "Falha ao autenticar. Verifique a configuração do servidor." });
  }
});

app.post("/api/auth/logout", (req, res) => {
  res.clearCookie("cbc_session");
  return res.json({ success: true });
});

app.get("/api/auth/me", requireAuth, (req, res) => {
  return res.json({ user: req.sessionUser });
});

// Provisiona ou atualiza um usuário com senha hasheada (bcrypt). Apenas admin.
// A senha em texto puro NUNCA é gravada; só o hash. Nada disso passa pelo cliente.
app.post("/api/users/upsert", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const { id, username, role, name, clientId, password } = req.body || {};
    if (!id || !username || !role || !name) {
      return res.status(400).json({ error: "Dados de usuário incompletos." });
    }
    if (!["admin", "client", "marketing"].includes(role)) {
      return res.status(400).json({ error: "Papel inválido." });
    }
    const doc: any = { id, username: String(username).trim(), role, name };
    if (clientId) doc.clientId = clientId;
    if (password && String(password).trim() !== "") {
      const { hashPassword } = await import("./src/lib/server/authService");
      doc.passwordHash = await hashPassword(String(password));
    }
    await dataService.setDocById("users", id, doc);
    return res.json({ success: true });
  } catch (e: any) {
    return res.status(500).json({ error: e.message || "Falha ao salvar usuário." });
  }
});

// ==========================================
// DADOS (backend guardião — Firestore via Admin SDK)
// Toda leitura/escrita exige sessão. O navegador nunca acessa o Firestore direto.
// ==========================================
app.get("/api/data/:collection", requireAuth, async (req, res) => {
  try {
    const u = req.sessionUser!;
    const items = await dataService.listCollectionForUser(req.params.collection, { role: u.role, clientId: u.clientId });
    return res.json({ items });
  } catch (e: any) {
    const status = /Acesso negado/i.test(e.message || "") ? 403 : 400;
    return res.status(status).json({ error: e.message || "Erro ao listar coleção." });
  }
});

app.put("/api/data/:collection/:id", requireAuth, async (req, res) => {
  try {
    const u = req.sessionUser!;
    dataService.assertCanWrite(req.params.collection, { role: u.role, clientId: u.clientId });
    await dataService.setDocById(req.params.collection, req.params.id, req.body?.data ?? req.body);
    return res.json({ success: true });
  } catch (e: any) {
    const status = /permissão/i.test(e.message || "") ? 403 : 400;
    return res.status(status).json({ error: e.message || "Erro ao salvar documento." });
  }
});

app.delete("/api/data/:collection/:id", requireAuth, async (req, res) => {
  try {
    const u = req.sessionUser!;
    dataService.assertCanWrite(req.params.collection, { role: u.role, clientId: u.clientId });
    await dataService.deleteDocById(req.params.collection, req.params.id);
    return res.json({ success: true });
  } catch (e: any) {
    const status = /permissão/i.test(e.message || "") ? 403 : 400;
    return res.status(status).json({ error: e.message || "Erro ao excluir documento." });
  }
});

// Initialize Gemini client using server-side config
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      "User-Agent": "aistudio-build",
    },
  },
});

// Helper to extract CSV-like data from spreadsheets (XLSX, XLS, CSV, ODS, XLSM, XLSB, etc.)
function getSpreadsheetDataAsText(fileBase64: string): string {
  try {
    const buffer = Buffer.from(fileBase64, "base64");
    const workbook = XLSX.read(buffer, { type: "buffer" });
    let result = "";
    for (const sheetName of workbook.SheetNames) {
      const worksheet = workbook.Sheets[sheetName];
      const csv = XLSX.utils.sheet_to_csv(worksheet);
      result += `### ABA PLANILHA: ${sheetName} ###\n${csv}\n\n`;
    }
    return result;
  } catch (error: any) {
    console.error("Erro ao converter planilha usando SheetJS:", error);
    throw new Error("Não foi possível decodificar ou ler a estrutura da planilha Excel: " + error.message);
  }
}// Shared utility to call Gemini API and parse structured JSON responses with robust error mapping
async function callGeminiForJson(params: {
  model: string;
  contents: any[];
  responseSchema: any;
  context: string;
}): Promise<any> {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY não configurada no ambiente/AI Studio Secrets. Configure a chave no painel de Secrets do AI Studio.");
  }

  const maxAttempts = 3;
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: params.model,
        contents: { parts: params.contents },
        config: {
          responseMimeType: "application/json",
          responseSchema: params.responseSchema,
        },
      });

      const text = response.text;
      if (!text) {
        throw new Error("Resposta da IA vazia.");
      }

      const cleaned = text.trim().replace(/^```json\s*|```$/g, "").trim();
      try {
        return JSON.parse(cleaned);
      } catch (parseError: any) {
        console.error(`Erro de parse JSON no contexto [${params.context}]. Texto bruto recebido:`, text);
        throw new Error(`A IA retornou uma resposta em formato inesperado ao analisar ${params.context}. Tente novamente ou envie uma imagem mais nítida/um PDF de melhor qualidade.`);
      }
    } catch (error: any) {
      // If it is a custom error we threw in the try block, propagate it directly without retry
      if (error.message && (error.message.includes("GEMINI_API_KEY não configurada") || error.message.includes("resposta em formato inesperado"))) {
        throw error;
      }

      const errMsg = error.message || "";
      const errStatus = error.status || (error.response && error.response.status) || error.statusCode;
      const errCode = error.code;

      // Identify transient errors (such as 503/UNAVAILABLE or 429/quota/rate limit)
      const isUnavailable = errStatus === "UNAVAILABLE" || errStatus === 503 || errCode === 503 || errMsg.includes("UNAVAILABLE") || errMsg.includes("high demand") || errMsg.includes("temporary") || errMsg.includes("overloaded");
      const isQuota = errStatus === "RESOURCE_EXHAUSTED" || errStatus === 429 || errCode === 429 || errMsg.includes("quota") || errMsg.includes("rate") || errMsg.includes("limit");

      const isTransient = isUnavailable || isQuota;

      if (isTransient && attempt < maxAttempts) {
        // Exponential backoff with a bit of jitter: ~1s before 2nd attempt, ~2.5s before 3rd attempt
        const delay = attempt === 1 ? 1000 + Math.random() * 200 : 2500 + Math.random() * 500;
        console.warn(
          `Tentativa ${attempt} falhou por erro transitório de IA [${params.context}]: ${errMsg || errStatus}. Aguardando ${delay.toFixed(0)}ms antes de tentar novamente...`
        );
        await sleep(delay);
        continue;
      }

      // If all attempts failed or it is not transient, throw mapped error
      if (errStatus === 401 || errStatus === 403 || errMsg.includes("API key")) {
        throw new Error("Chave da API Gemini inválida ou sem permissão. Verifique GEMINI_API_KEY no painel de Secrets do AI Studio.");
      } else if (isQuota) {
        throw new Error("Limite de uso da IA (Gemini) atingido no momento. Tente novamente em alguns instantes.");
      } else if (isUnavailable) {
        throw new Error("O modelo Gemini está sobrecarregado no momento. Tentamos algumas vezes automaticamente, mas ele continua indisponível. Tente novamente em 1 ou 2 minutos, ou preencha os campos manualmente.");
      } else if (errStatus === 400 || errMsg.includes("mime") || errMsg.includes("MIME") || errMsg.includes("format")) {
        throw new Error("O formato deste arquivo não é suportado para leitura automática (use JPG, PNG ou PDF).");
      } else {
        throw new Error(`Erro ao processar ${params.context} com IA: ${errMsg}`);
      }
    }
  }
}

// AI Document parsing endpoint for the physical-financial schedule
app.post("/api/planning/parse-document", requireAuth, aiLimiter, async (req, res) => {
  try {
    const { fileBase64, mimeType, fileName, accessToken } = req.body;

    if (!fileBase64 || !mimeType) {
      return res.status(400).json({ error: "Arquivo ou tipo MIME ausente." });
    }

    // Validation of supported formats (including Excel/spreadsheets)
    const isExcel = mimeType.includes("sheet") || mimeType.includes("excel") || mimeType.includes("csv") || 
                    (fileName && (fileName.toLowerCase().endsWith(".xlsx") || fileName.toLowerCase().endsWith(".xls") || fileName.toLowerCase().endsWith(".csv")));
    const isAllowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(mimeType) || isExcel;

    if (!isAllowed) {
      return res.status(400).json({ error: "Formato de arquivo não suportado para leitura automática. Envie uma foto (JPG/PNG) ou um PDF." });
    }

    // Salva o documento original no Drive (não bloqueia a extração por IA se falhar)
    const { driveFile, driveError } = await saveDocumentToDrive(
      accessToken,
      DRIVE_FOLDERS.cronograma,
      fileName || "cronograma.pdf",
      mimeType,
      fileBase64
    );

    const prompt = `
Você é um engenheiro de planejamento especialista em construção civil.
Sua tarefa é analisar o documento em anexo (pode ser um cronograma, planilha de custos, diário de obra ou orçamento em PDF ou Excel) e extrair o Cronograma Físico-Financeiro estruturado.

Extraia as etapas/fases/atividades do projeto. Para cada etapa, precisamos de:
1. Nome da Etapa / Serviço (curto e descritivo)
2. Data de Início (formato YYYY-MM-DD)
3. Data de Término (formato YYYY-MM-DD)
4. Custo Previsto (número decimal em Reais, sem símbolos)
5. Progresso Físico Atual (% de 0 a 100, padrão é 0 se não especificado)
6. Custo Realizado (número decimal em Reais, padrão é 0 se não especificado)

REGRAS DE DISTRIBUIÇÃO E AJUSTE:
- Se as datas estiverem ausentes ou imprecisas no documento, estime-as de forma lógica começando a partir de hoje (${new Date().toISOString().split('T')[0]}), estimando que cada fase dura entre 15 e 45 dias, encadeando as etapas de forma que não ocorram todas ao mesmo tempo (por exemplo, demolição antes de alvenaria, alvenaria antes de acabamento).
- Se os custos estiverem ausentes, atribua valores previstos estimados realistas baseados na complexidade do serviço (ex: Demolição = R$ 12000, Estrutural = R$ 85000, Pintura = R$ 18000, etc.).
- Retorne obrigatoriamente um array JSON válido. Não inclua comentários ou markdown fora do JSON.
`;

    let contents: any[] = [];
    const isPdf = mimeType === "application/pdf" || (fileName && fileName.toLowerCase().endsWith(".pdf"));

    if (isPdf) {
      contents.push({
        inlineData: {
          data: fileBase64,
          mimeType: "application/pdf",
        },
      });
      contents.push({ text: prompt });
    } else {
      // Parse as spreadsheet
      const spreadsheetCsv = getSpreadsheetDataAsText(fileBase64);
      contents.push({ text: prompt + "\n\nCONTEÚDO DA PLANILHA EXTRAÍDO EM FORMATO CSV:\n" + spreadsheetCsv });
    }

    const responseSchema = {
      type: Type.ARRAY,
      description: "Lista de etapas e fases de planejamento extraídas do cronograma",
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING, description: "Nome da Etapa / Serviço" },
          startDate: { type: Type.STRING, description: "Data de início no formato YYYY-MM-DD" },
          endDate: { type: Type.STRING, description: "Data de término no formato YYYY-MM-DD" },
          costPrev: { type: Type.NUMBER, description: "Custo planejado em Reais" },
          progress: { type: Type.NUMBER, description: "Progresso atual acumulado (0 a 100)" },
          costReal: { type: Type.NUMBER, description: "Custo realizado acumulado em Reais" },
        },
        required: ["name", "startDate", "endDate", "costPrev"],
      },
    };

    const phases = await callGeminiForJson({
      model: "gemini-3.5-flash",
      contents,
      responseSchema,
      context: "cronograma",
    });

    return res.json({ success: true, phases, driveFile, driveError });
  } catch (error: any) {
    console.error("Erro no processamento da IA para cronograma:", error);
    return res.status(500).json({ error: error.message || "Erro desconhecido ao processar o arquivo com IA." });
  }
});

// AI Document parsing endpoint for materials lists
app.post("/api/planning/parse-materials", requireAuth, aiLimiter, async (req, res) => {
  try {
    const { fileBase64, mimeType, fileName, accessToken } = req.body;

    if (!fileBase64 || !mimeType) {
      return res.status(400).json({ error: "Arquivo ou tipo MIME ausente para a lista de materiais." });
    }

    // Validation of supported formats (including Excel/spreadsheets)
    const isExcel = mimeType.includes("sheet") || mimeType.includes("excel") || mimeType.includes("csv") || 
                    (fileName && (fileName.toLowerCase().endsWith(".xlsx") || fileName.toLowerCase().endsWith(".xls") || fileName.toLowerCase().endsWith(".csv")));
    const isAllowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(mimeType) || isExcel;

    if (!isAllowed) {
      return res.status(400).json({ error: "Formato de arquivo não suportado para leitura automática. Envie uma foto (JPG/PNG) ou um PDF." });
    }

    // Salva o documento original no Drive (não bloqueia a extração por IA se falhar)
    const { driveFile, driveError } = await saveDocumentToDrive(
      accessToken,
      DRIVE_FOLDERS.materiais,
      fileName || "materiais.pdf",
      mimeType,
      fileBase64
    );

    // --- PDF: extrator nativo, sem chamada a nenhuma IA ---
    const isPdfNative = mimeType === "application/pdf" || (fileName && fileName.toLowerCase().endsWith(".pdf"));
    if (isPdfNative) {
      try {
        const { materials, warnings, groupingSuggestions } = await parseMaterialListFromPdf(fileBase64);
        return res.json({
          success: true,
          materials,
          comment: null,
          warnings,
          groupingSuggestions,
          engine: "leitor-nativo-pdf",
          driveFile,
          driveError,
        });
      } catch (nativeError: any) {
        console.error("Erro ao ler PDF de materiais com o leitor nativo:", nativeError);
        return res.status(422).json({ error: nativeError.message || "Não foi possível ler este PDF automaticamente." });
      }
    }

    const currentDate = new Date().toISOString().split('T')[0];

    const prompt = `
Você é um engenheiro de planejamento e gestor de compras / suprimentos especialista em construção civil.
Sua tarefa é analisar a lista de materiais anexada (PDF, planilha de orçamento, cotação, etc.) e extrair TODOS os materiais/insumos sem deixar passar NENHUMA linha.

REGRAS DE EXTRAÇÃO:
- Mapeie cada item detalhadamente.
- Se o valor unitário não estiver especificado ou estiver nulo, use um valor estimado realista de mercado, ou 0.
- Se a quantidade não estiver informada, use 1.
- Para orderDate (Data do Pedido), se não estiver explícito no documento, utilize a data de hoje: ${currentDate}.
- Para deliveryDate (Data Prevista de Entrega), se não estiver no documento, estime uma data realista de entrega (ex: entre 3 a 10 dias após a data do pedido).
- Identifique a unidade de medida (sacos, m², m³, un, kg, barras, etc.) de forma abreviada e limpa.

Além do array de materiais, escreva uma seção chamada "comment" com observações fundamentais e orientações:
- Liste observações e alertas sobre prazos de entrega estimados.
- Comente sobre possíveis riscos de preços ou cotações que pareçam fora da média.
- Dê orientações estratégicas de planejamento para a aquisição desses insumos de forma a evitar atrasos na obra.
- É MUITO importante que seu comentário seja rico, detalhado e utilize formatação Markdown elegante.

Retorne obrigatoriamente no formato do esquema JSON definido.
`;

    let contents: any[] = [];
    const isPdf = mimeType === "application/pdf" || (fileName && fileName.toLowerCase().endsWith(".pdf"));
    const isImage = mimeType.startsWith("image/") || (fileName && (fileName.toLowerCase().endsWith(".jpg") || fileName.toLowerCase().endsWith(".jpeg") || fileName.toLowerCase().endsWith(".png")));

    if (isPdf || isImage) {
      contents.push({
        inlineData: {
          data: fileBase64,
          mimeType: isPdf ? "application/pdf" : mimeType,
        },
      });
      contents.push({ text: prompt });
    } else {
      // Parse spreadsheet using SheetJS
      const spreadsheetCsv = getSpreadsheetDataAsText(fileBase64);
      contents.push({ text: prompt + "\n\nCONTEÚDO DA PLANILHA EXTRAÍDO EM FORMATO CSV:\n" + spreadsheetCsv });
    }

    const responseSchema = {
      type: Type.OBJECT,
      properties: {
        materials: {
          type: Type.ARRAY,
          description: "Lista de materiais extraídos com todos os itens do arquivo",
          items: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING, description: "Nome ou descrição detalhada do material" },
              quantityVal: { type: Type.NUMBER, description: "Quantidade numérica do material" },
              quantityUnit: { type: Type.STRING, description: "Unidade de medida (ex: sacos, un, m², kg, barras)" },
              supplier: { type: Type.STRING, description: "Nome do fornecedor (use 'Cotação' se não especificado)" },
              unitValue: { type: Type.NUMBER, description: "Valor unitário em Reais" },
              orderDate: { type: Type.STRING, description: "Data de pedido no formato YYYY-MM-DD" },
              deliveryDate: { type: Type.STRING, description: "Data estimada de entrega no formato YYYY-MM-DD" },
              notes: { type: Type.STRING, description: "Observação rápida do item" },
            },
            required: ["name", "quantityVal", "quantityUnit", "supplier", "unitValue", "orderDate", "deliveryDate"],
          },
        },
        comment: {
          type: Type.STRING,
          description: "Comentário detalhado em Markdown com observações, recomendações de compras e orientações sobre os itens",
        },
      },
      required: ["materials", "comment"],
    };

    const data = await callGeminiForJson({
      model: "gemini-3.5-flash",
      contents,
      responseSchema,
      context: "lista de materiais",
    });

    return res.json({ success: true, materials: data.materials, comment: data.comment, warnings: [], groupingSuggestions: [], engine: "ia-gemini", driveFile, driveError });
  } catch (error: any) {
    console.error("Erro no processamento da IA para materiais:", error);
    return res.status(500).json({ error: error.message || "Erro desconhecido ao processar a lista de materiais com a IA." });
  }
});

// AI Refinement / Alteration Checkpoint endpoint for materials lists
app.post("/api/planning/refine-materials", requireAuth, aiLimiter, async (req, res) => {
  try {
    const { currentMaterials, userMessage } = req.body;

    if (!currentMaterials || !userMessage) {
      return res.status(400).json({ error: "Parâmetros 'currentMaterials' ou 'userMessage' ausentes." });
    }

    const currentDate = new Date().toISOString().split('T')[0];

    const prompt = `
Você é o engenheiro de compras da Chaves Brites Correa. O usuário está revisando uma lista de materiais em pré-visualização e solicitou alterações / refinamento em português.
Sua tarefa é modificar a lista de materiais atual com base estritamente no pedido do usuário e recalcular valores ou descrições se aplicável.

A solicitação do usuário para esta alteração (checkpoint):
"${userMessage}"

REGRAS DE REFINAMENTO:
- Se o usuário pedir para adicionar um material novo, adicione-o com dados lógicos preenchidos (preço unitário, quantidade, unidade, data de hoje ${currentDate} para pedido e entrega estimada em +5 dias).
- Se o usuário pedir para remover algum material, remova-o da lista.
- Se o usuário pedir para alterar o preço de um item (ex: "cimento agora custa 40 reais"), altere o 'unitValue' dos itens que combinam com a descrição.
- Se pedir para alterar fornecedor, prazos ou quantidades, ajuste com precisão.
- Se o usuário pedir algo geral como "aplique desconto de 10% em todos os itens", calcule e aplique em todos os unitValue.
- Mantenha todos os outros itens inalterados.
- Escreva um NOVO comentário ("comment") em Markdown detalhando o que foi alterado nesta rodada (checkpoint), o novo resumo financeiro e as orientações atualizadas de suprimentos de forma amigável e profissional.

Retorne estritamente o JSON com a estrutura atualizada.
`;

    const responseSchema = {
      type: Type.OBJECT,
      properties: {
        materials: {
          type: Type.ARRAY,
          description: "Lista de materiais atualizada com as alterações aplicadas",
          items: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING, description: "Nome ou descrição detalhada do material" },
              quantityVal: { type: Type.NUMBER, description: "Quantidade numérica" },
              quantityUnit: { type: Type.STRING, description: "Unidade de medida" },
              supplier: { type: Type.STRING, description: "Nome do fornecedor" },
              unitValue: { type: Type.NUMBER, description: "Valor unitário em Reais" },
              orderDate: { type: Type.STRING, description: "Data de pedido no formato YYYY-MM-DD" },
              deliveryDate: { type: Type.STRING, description: "Data de entrega no formato YYYY-MM-DD" },
              notes: { type: Type.STRING, description: "Notas rápidas" },
            },
            required: ["name", "quantityVal", "quantityUnit", "supplier", "unitValue", "orderDate", "deliveryDate"],
          },
        },
        comment: {
          type: Type.STRING,
          description: "Comentário profissional em Markdown explicando as alterações feitas nesta rodada e orientações atualizadas",
        },
      },
      required: ["materials", "comment"],
    };

    const data = await callGeminiForJson({
      model: "gemini-3.5-flash",
      contents: [{ text: `MATERIAIS ATUAIS:\n${JSON.stringify(currentMaterials, null, 2)}\n\nINSTRUÇÃO:\n${prompt}` }],
      responseSchema,
      context: "refinamento de materiais",
    });

    return res.json({ success: true, materials: data.materials, comment: data.comment });
  } catch (error: any) {
    console.error("Erro no refinamento da IA para materiais:", error);
    return res.status(500).json({ error: error.message || "Erro desconhecido ao refinar a lista de materiais com a IA." });
  }
});

// AI Refinement endpoint for a schedule generated by the native rule-based engine
// (src/lib/scheduleGenerator.ts). A geração inicial NÃO usa IA — este endpoint é o
// passo opcional de ajuste via comando de texto ("abordagem híbrida").
app.post("/api/planning/refine-schedule", requireAuth, aiLimiter, async (req, res) => {
  try {
    const { currentPhases, userMessage } = req.body;

    if (!currentPhases || !userMessage) {
      return res.status(400).json({ error: "Parâmetros 'currentPhases' ou 'userMessage' ausentes." });
    }

    const currentDate = new Date().toISOString().split('T')[0];

    const prompt = `
Você é um engenheiro de planejamento de obras especialista em cronograma físico-financeiro. O usuário está revisando um cronograma
gerado automaticamente (a partir de um questionário, usando tabelas de referência da construção civil) e pediu um ajuste em português.

Sua tarefa é modificar a lista de etapas ATUAL com base estritamente no pedido do usuário.

Pedido do usuário para esta alteração (checkpoint):
"${userMessage}"

REGRAS DE REFINAMENTO:
- Se pedir para adicionar uma etapa nova (ex: "adicione uma fase de paisagismo no final"), insira-a na posição lógica da sequência, com datas que não sobreponham as etapas vizinhas de forma ilógica, e um custo estimado realista.
- Se pedir para remover uma etapa, remova-a.
- Se pedir para alterar prazo de uma etapa (ex: "aumente a fundação em 2 semanas"), ajuste startDate/endDate dessa etapa e, se fizer sentido, desloque as etapas seguintes para não sobrepor.
- Se pedir para alterar custo de uma etapa, ajuste costPrev dela.
- Para cada etapa cujas datas você alterar, também recalcule "monthlyProgress": um objeto com chaves "YYYY-MM" (todo mês entre startDate e endDate) e valores em percentual (soma = 100 dentro da etapa), distribuindo de forma crescente e suave (não linear abrupta) ao longo dos meses da etapa.
- Se a data de hoje for útil de referência, use ${currentDate}.
- Mantenha todas as outras etapas inalteradas (incluindo o monthlyProgress delas, se não foram tocadas).
- Escreva um novo comentário ("comment") em Markdown curto explicando o que foi alterado nesta rodada.

Retorne estritamente o JSON com a estrutura atualizada.
`;

    const responseSchema = {
      type: Type.OBJECT,
      properties: {
        phases: {
          type: Type.ARRAY,
          description: "Lista de etapas do cronograma, atualizada com as alterações aplicadas",
          items: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING, description: "Nome da etapa" },
              startDate: { type: Type.STRING, description: "Data de início no formato YYYY-MM-DD" },
              endDate: { type: Type.STRING, description: "Data de término no formato YYYY-MM-DD" },
              costPrev: { type: Type.NUMBER, description: "Custo planejado em Reais" },
              progress: { type: Type.NUMBER, description: "Progresso físico atual (0 a 100)" },
              costReal: { type: Type.NUMBER, description: "Custo realizado em Reais" },
              monthlyProgress: {
                type: Type.OBJECT,
                description: "Mapa 'YYYY-MM' -> percentual do progresso da etapa naquele mês (soma 100 por etapa)",
              },
            },
            required: ["name", "startDate", "endDate", "costPrev"],
          },
        },
        comment: {
          type: Type.STRING,
          description: "Comentário curto em Markdown explicando as alterações feitas nesta rodada",
        },
      },
      required: ["phases", "comment"],
    };

    const data = await callGeminiForJson({
      model: "gemini-3.5-flash",
      contents: [{ text: `ETAPAS ATUAIS:\n${JSON.stringify(currentPhases, null, 2)}\n\nINSTRUÇÃO:\n${prompt}` }],
      responseSchema,
      context: "refinamento de cronograma",
    });

    return res.json({ success: true, phases: data.phases, comment: data.comment });
  } catch (error: any) {
    console.error("Erro no refinamento da IA para cronograma:", error);
    return res.status(500).json({ error: error.message || "Erro desconhecido ao refinar o cronograma com a IA." });
  }
});

// AI Invoice parsing endpoint for construction expenses
app.post("/api/acompanhamento/parse-invoice", requireAuth, aiLimiter, async (req, res) => {
  try {
    const { fileBase64, mimeType, fileName } = req.body;

    if (!fileBase64 || !mimeType) {
      return res.status(400).json({ error: "Arquivo ou tipo MIME ausente para a Nota Fiscal." });
    }

    // Validation of supported formats (Images and PDFs only)
    const isAllowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(mimeType);
    if (!isAllowed) {
      return res.status(400).json({ error: "Formato de arquivo não suportado para leitura automática. Envie uma foto (JPG/PNG) ou um PDF." });
    }

    // Este endpoint NÃO sobe o arquivo para o Drive automaticamente:
    // o upload acontece depois, no frontend, quando o usuário confirma os
    // dados extraídos (nome de arquivo formatado + pasta específica do projeto).
    // Ver handleSaveScannedInvoice em src/components/AcompanhamentoFinanceiro.tsx
    const driveFile = null;
    const driveError = null;

    const currentDate = new Date().toISOString().split('T')[0];

    const prompt = `
Você é um especialista em contabilidade e gestão financeira de obras de construção civil.
Sua tarefa é analisar a Nota Fiscal, recibo, fatura ou cupom fiscal anexado (imagem ou PDF) e extrair com precisão os dados para lançamento financeiro.

Dados a serem extraídos:
1. Fornecedor/Prestador (supplier): Nome ou razão social da empresa emissora da nota fiscal/recibo.
2. Data do Gasto/Pagamento (date): Data de emissão ou pagamento no formato YYYY-MM-DD. Se não encontrar nenhuma data no documento, retorne a data de hoje: ${currentDate}.
3. Valor Total (value): Valor total em Reais (número decimal, sem cifrão ou pontos de milhar, apenas o valor líquido).
4. Categoria (category): Classifique em uma das seguintes opções exatas:
   - "materiais" (para compra de cimento, tijolo, esquadrias, cabos, tintas, ferragens, tubulações, revestimentos, areia, brita, etc.)
   - "mao_de_obra" (para pagamentos de empreiteiros, pedreiros, serventes, eletricistas, encanadores, pintores, gesseiros, engenheiros, etc.)
   - "outros" (para taxas, impostos, locação de caçamba, locação de equipamentos, fretes ou despesas administrativas)
5. Descrição (description): Uma descrição concisa do que foi comprado ou do serviço prestado (ex: "Compra de 50 sacos de cimento", "Medição da fundação por empreiteiro").
6. Observações (notes): Informações adicionais relevantes, como número da Nota Fiscal, chave de acesso, observações de itens específicos, parcelamento, etc.
7. Número da NF ou do Comprovante (invoiceNumber): O número da Nota Fiscal (ex: "12345"), série ou número do comprovante de pagamento/recibo. Se não houver, deixe vazio.
8. Itens de Material (items): Se a categoria for "materiais", extraia a lista detalhada de produtos/materiais comprados contendo:
   - name: Nome/descrição do produto (ex: "Cimento CP-II 50kg").
   - unit: Unidade de medida (ex: "Saco", "m³", "UN", "KG").
   - quantity: Quantidade comprada (número).
   - unitValue: Valor unitário em Reais.
   - totalValue: Valor total do item (quantidade * unitValue) em Reais.

Retorne obrigatoriamente um objeto JSON válido conforme o esquema definido. Não inclua texto fora do JSON.
`;

    let contents: any[] = [];
    contents.push({
      inlineData: {
        data: fileBase64,
        mimeType: mimeType,
      },
    });
    contents.push({ text: prompt });

    const responseSchema = {
      type: Type.OBJECT,
      properties: {
        supplier: { type: Type.STRING, description: "Nome do fornecedor ou emissor da nota" },
        date: { type: Type.STRING, description: "Data de emissão/pagamento no formato YYYY-MM-DD" },
        value: { type: Type.NUMBER, description: "Valor total líquido da nota em Reais" },
        category: { 
          type: Type.STRING, 
          description: "Categoria exata do lançamento: 'materiais', 'mao_de_obra' ou 'outros'" 
        },
        description: { type: Type.STRING, description: "Descrição curta e resumida dos itens ou serviços" },
        notes: { type: Type.STRING, description: "Chave da NF, itens detalhados ou observações gerais" },
        invoiceNumber: { type: Type.STRING, description: "Número da Nota Fiscal ou do comprovante" },
        items: {
          type: Type.ARRAY,
          description: "Lista de itens/materiais detalhados contidos na nota fiscal (se aplicável)",
          items: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING, description: "Nome ou descrição do material/produto" },
              unit: { type: Type.STRING, description: "Unidade de medida (ex: UN, KG, M3, SACO)" },
              quantity: { type: Type.NUMBER, description: "Quantidade comprada" },
              unitValue: { type: Type.NUMBER, description: "Valor unitário do item em Reais" },
              totalValue: { type: Type.NUMBER, description: "Valor total do item em Reais" },
            },
            required: ["name", "unit", "quantity", "unitValue", "totalValue"],
          },
        },
      },
      required: ["supplier", "date", "value", "category", "description"],
    };

    const data = await callGeminiForJson({
      model: "gemini-3.5-flash",
      contents,
      responseSchema,
      context: "nota fiscal",
    });

    return res.json({ success: true, invoice: data, driveFile, driveError });
  } catch (error: any) {
    console.error("Erro ao analisar nota fiscal com IA:", error);
    return res.status(500).json({ error: error.message || "Erro desconhecido ao processar a nota fiscal." });
  }
});

// Bulk Transactions parsing endpoint (Excel spreadsheet, PDF bank statement/table, multiple invoice table).
// PDFs de tabela agora são lidos por um extrator NATIVO (sem IA) — ver src/lib/bulkTransactionParser.ts.
// Excel/CSV e imagens continuam usando o Gemini, que já lida bem com esses formatos.
app.post("/api/acompanhamento/parse-bulk-transactions", requireAuth, aiLimiter, async (req, res) => {
  try {
    const { fileBase64, mimeType, fileName, accessToken } = req.body;

    if (!fileBase64 || !mimeType) {
      return res.status(400).json({ error: "Arquivo ou tipo MIME ausente para importação em lote." });
    }

    // Validation of supported formats (including Excel/spreadsheets)
    const isExcel = mimeType.includes("sheet") || mimeType.includes("excel") || mimeType.includes("csv") || 
                    (fileName && (fileName.toLowerCase().endsWith(".xlsx") || fileName.toLowerCase().endsWith(".xls") || fileName.toLowerCase().endsWith(".csv")));
    const isPdf = mimeType === "application/pdf";
    const isAllowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(mimeType) || isExcel;

    if (!isAllowed) {
      return res.status(400).json({ error: "Formato de arquivo não suportado para leitura automática. Envie uma foto (JPG/PNG) ou um PDF." });
    }

    // Salva o documento original no Drive (não bloqueia a extração se falhar)
    const { driveFile, driveError } = await saveDocumentToDrive(
      accessToken,
      DRIVE_FOLDERS.extratos,
      fileName || "extrato.pdf",
      mimeType,
      fileBase64
    );

    // --- PDF: extrator nativo, sem chamada a nenhuma IA ---
    if (isPdf) {
      try {
        const { transactions, warnings } = await parseBulkTransactionsFromPdf(fileBase64);
        return res.json({ success: true, transactions, warnings, engine: "leitor-nativo-pdf", driveFile, driveError });
      } catch (nativeError: any) {
        console.error("Erro ao ler PDF de gastos com o leitor nativo:", nativeError);
        return res.status(422).json({ error: nativeError.message || "Não foi possível ler este PDF automaticamente." });
      }
    }

    const currentDate = new Date().toISOString().split('T')[0];

    const prompt = `
Você é um assistente financeiro de alta precisão especializado em auditoria e importação de lançamentos financeiros de obras de construção civil.
Sua tarefa é analisar o arquivo fornecido (que pode ser uma planilha de gastos em Excel, um extrato bancário em PDF, uma tabela de contas, ou um relatório de despesas de obra) e extrair TODAS as transações financeiras / lançamentos nela contidos.

Para cada transação financeira encontrada, extraia os seguintes dados estruturados:
1. Fornecedor/Credor (supplier): Nome do fornecedor, profissional, loja ou emissor do gasto. Se não houver, coloque um nome descritivo (ex: "Diversos" ou o próprio nome da categoria).
2. Descrição (description): Uma descrição concisa do que foi comprado ou pago (ex: "Compra de tijolos", "Pagamento de ajudantes", "Locação de caçamba").
3. Valor Líquido (value): O valor numérico em Reais do gasto (decimal positivo).
4. Data (date): A data da transação/lançamento em formato YYYY-MM-DD. Se a data estiver no formato brasileiro (DD/MM/AAAA ou DD/MM/AA), converta para YYYY-MM-DD. Se faltar a data ou o ano, tente deduzir logicamente ou use a data atual: ${currentDate}.
5. Categoria (category): Classifique obrigatoriamente em uma das seguintes opções exatas:
   - "materiais" (compra de areia, brita, cimento, ferragens, tubulações, fios, revestimentos, tintas, madeiras, etc.)
   - "mao_de_obra" (pagamento de pedreiro, servente, pintor, encanador, eletricista, mestre de obras, engenheiro, empreiteiros)
   - "projetos_complementares" (projetos estruturais, hidráulicos, elétricos, consultorias de engenharia/arquitetura)
   - "taxas" (alvará de construção, taxas da prefeitura, taxas do cartório, ISS, impostos de notas fiscais)
   - "decoracao" (iluminação decorativa, móveis sob medida, paisagismo, tapetes, cortinas, acabamentos de alto padrão decorativo)
   - "outros" (fretes, locação de caçamba, aluguel de ferramentas, despesas administrativas gerais da obra)
6. Observações (notes): Algum detalhe adicional como número do cheque, observações de parcelamento ou observação sobre o material.
7. Número da Nota Fiscal / Recibo (invoiceNumber): Número identificador se disponível no documento.

Examine com atenção todo o documento e retorne a lista completa de transações que encontrar no formato JSON solicitado. Não invente transações que não estejam no documento.

Retorne obrigatoriamente um objeto JSON contendo um array de transações sob a chave "transactions":
{
  "transactions": [
    {
      "supplier": "Nome do Fornecedor",
      "description": "Descrição do Gasto",
      "value": 1500.50,
      "date": "2026-07-09",
      "category": "materiais",
      "notes": "Compra parcelada em 3x",
      "invoiceNumber": "NF-12345"
    }
  ]
}
Não inclua nenhuma outra resposta ou marcação de markdown além do objeto JSON.
`;

    let contents: any[] = [];
    contents.push({
      inlineData: {
        data: fileBase64,
        mimeType: mimeType,
      },
    });
    contents.push({ text: prompt });

    const responseSchema = {
      type: Type.OBJECT,
      properties: {
        transactions: {
          type: Type.ARRAY,
          description: "Lista de transações financeiras extraídas do documento.",
          items: {
            type: Type.OBJECT,
            properties: {
              supplier: { type: Type.STRING, description: "Fornecedor ou beneficiário" },
              description: { type: Type.STRING, description: "Descrição do item ou serviço" },
              value: { type: Type.NUMBER, description: "Valor líquido em Reais" },
              date: { type: Type.STRING, description: "Data no formato YYYY-MM-DD" },
              category: { 
                type: Type.STRING, 
                description: "Categoria exata: 'materiais', 'mao_de_obra', 'projetos_complementares', 'taxas', 'decoracao', 'outros'" 
              },
              notes: { type: Type.STRING, description: "Observações ou detalhes adicionais" },
              invoiceNumber: { type: Type.STRING, description: "Número de identificação da NF ou recibo" },
            },
            required: ["supplier", "description", "value", "date", "category"],
          },
        },
      },
      required: ["transactions"],
    };

    const data = await callGeminiForJson({
      model: "gemini-3.5-flash",
      contents,
      responseSchema,
      context: "extrato de gastos",
    });

    return res.json({ success: true, transactions: data.transactions, driveFile, driveError });
  } catch (error: any) {
    console.error("Erro ao processar planilha/pdf de gastos:", error);
    return res.status(500).json({ error: error.message || "Erro desconhecido ao processar planilha/pdf." });
  }
});

// AI Material Request parsing endpoint (e.g. WhatsApp prints, contractor photos, list handwritten)
app.post("/api/quotations/parse-material-request", requireAuth, aiLimiter, async (req, res) => {
  try {
    const { fileBase64, mimeType, fileName } = req.body;

    if (!fileBase64 || !mimeType) {
      return res.status(400).json({ error: "Arquivo ou tipo MIME ausente para a lista de materiais." });
    }

    // Validation of supported formats (Images and PDFs only)
    const isAllowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(mimeType);
    if (!isAllowed) {
      return res.status(400).json({ error: "Formato de arquivo não suportado para leitura automática. Envie uma foto (JPG/PNG) ou um PDF." });
    }

    // Este endpoint NÃO sobe o arquivo para o Drive automaticamente:
    // o upload acontece depois, no frontend, quando o usuário confirma os
    // dados extraídos (nome de arquivo formatado + pasta específica do projeto).
    // Ver handleSaveNfScanned in src/components/QuotationMaps.tsx
    const driveFile = null;
    const driveError = null;

    const prompt = `
Você é um assistente especialista em engenharia de custo, suprimentos e compras na construção civil.
Sua tarefa é analisar o print de WhatsApp, foto, imagem ou bilhete anexado que contém uma lista ou requisição de materiais feita por um mestre de obras, pedreiro ou empreiteiro.
Extraia com precisão a lista de materiais solicitados para que possamos iniciar um Mapa de Cotação de Preços.

Para cada item encontrado na imagem, extraia os seguintes dados estruturados:
1. Nome/Especificação do Material (name): O nome claro e conciso do produto (ex: "Saco de Cimento CP-II 50kg", "Barra de ferro 3/8", "Tubo PVC de 100mm"). Se o nome estiver abreviado ou confuso, normalize e complete o nome de maneira que fique profissional e fácil de entender.
2. Unidade de medida (unit): Identifique ou estime de forma lógica a unidade de medida do material (ex: "Saco", "m³", "Unidade", "Barra", "Metro", "KG", "Lata", "Rolo"). Use abreviações padrão como "SACO", "UN", "M", "KG", "ROLO", "BARRA" se apropriado, ou palavras inteiras amigáveis.
3. Quantidade (quantity): O número da quantidade solicitada para aquele item. Se a quantidade não estiver informada ou não for identificada, retorne um valor padrão de 1.

Além disso, tente identificar ou gerar um Título amigável para este mapa de cotação (ex: "Materiais para Fundação", "Conexões Hidráulicas e Tubos", "Tintas e Acabamentos"). Se não houver clareza, crie um título descritivo realista baseado nos itens extraídos.

Retorne obrigatoriamente um objeto JSON com a seguinte estrutura:
{
  "title": "Título sugerido para a cotação",
  "items": [
    {
      "name": "Nome do Material",
      "unit": "Unidade",
      "quantity": 10
    }
  ]
}

Não inclua nenhuma outra resposta ou markdown fora do objeto JSON.
`;

    let contents: any[] = [];
    contents.push({
      inlineData: {
        data: fileBase64,
        mimeType: mimeType,
      },
    });
    contents.push({ text: prompt });

    const responseSchema = {
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING, description: "Título sugerido amigável para o Mapa de Cotação" },
        items: {
          type: Type.ARRAY,
          description: "Lista de materiais extraídos com unidade e quantidade",
          items: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING, description: "Nome limpo e normalizado do material" },
              unit: { type: Type.STRING, description: "Unidade de medida (ex: UN, SACO, KG, M, BARRA)" },
              quantity: { type: Type.NUMBER, description: "Quantidade solicitada" },
            },
            required: ["name", "unit", "quantity"],
          },
        },
      },
      required: ["title", "items"],
    };

    const data = await callGeminiForJson({
      model: "gemini-3.5-flash",
      contents,
      responseSchema,
      context: "requisição de materiais",
    });

    return res.json({ success: true, quotationData: data, driveFile, driveError });
  } catch (error: any) {
    console.error("Erro ao analisar requisição de materiais com IA:", error);
    return res.status(500).json({ error: error.message || "Erro desconhecido ao processar a requisição de materiais." });
  }
});

// AI receipt parsing and auto-uploading to Google Drive
app.post("/api/office/analyze-receipt", requireAuth, aiLimiter, async (req, res) => {
  try {
    const { fileBase64, mimeType, fileName, accessToken } = req.body;

    if (!fileBase64 || !mimeType) {
      return res.status(400).json({ error: "Arquivo ou tipo MIME ausente para a análise de comprovante." });
    }

    // Valida tipo REAL por magic bytes e tamanho (não confia só no mimeType do cliente).
    const check = validateBase64File(fileBase64, RECEIPT_MIMES);
    if (!check.ok) {
      return res.status(check.error?.includes("limite") ? 413 : 400).json({
        error: check.error || "Formato de arquivo não suportado. Envie uma foto (JPG/PNG) ou um PDF.",
      });
    }

    // Salva o documento original no Drive (não bloqueia a extração por IA se falhar)
    const { driveFile, driveError } = await saveDocumentToDrive(
      accessToken,
      DRIVE_FOLDERS.comprovantes,
      fileName || "comprovante_pagamento.pdf",
      mimeType,
      fileBase64
    );

    const prompt = `
Você é um assistente financeiro de alta precisão especializado na contabilidade de escritórios de arquitetura e engenharia civil.
Sua tarefa é analisar o comprovante de pagamento ou recebimento anexado (que pode ser um PIX, TED, DOC, boleto pago, recibo de depósito, etc.) e extrair os dados financeiros estruturados.

Mapeie as informações com precisão:
- description: Descrição concisa e direta do lançamento em português (ex: "Pagamento de Licença Autodesk", "Taxa do condomínio da Sede", "Recebimento de Projeto Arq. Residencial").
- value: O valor total pago ou recebido como número (ex: 1540.50).
- date: A data do pagamento/efetivação em formato YYYY-MM-DD. Se a data estiver ausente, use a data de hoje (${new Date().toISOString().split('T')[0]}).
- type: Classifique de forma extremamente lógica:
  - "saida" se for uma despesa, pagamento, transferência enviada, imposto pago, etc.
  - "entrada" se for um depósito recebido, recebimento de Pix de cliente, etc.
  - Na maioria dos casos de comprovante comum, será uma "saida".
- category: A chave exata de categoria que melhor se ajusta:
  - Se type for "entrada":
    - "servico_projeto" (para projetos, desenhos, acompanhamento)
    - "consultoria" (para consultorias, vistorias)
    - "taxa_gestao" (para gerenciamento de obra)
    - "outras_entradas" (outro tipo de recebimento)
  - Se type for "saida":
    - "pro_labore" (para retiradas de sócios, se identificado)
    - "aluguel_escritorio" (para aluguel, condomínio, taxas do imóvel)
    - "colaboradores" (para salários, honorários de estagiários, terceiros)
    - "impostos" (para DAS, ISS, taxas da prefeitura, impostos federais)
    - "softwares" (para licenças de SketchUp, AutoCAD, Revit, Adobe, etc.)
    - "marketing" (para anúncios, divulgação, redes sociais)
    - "utilidades" (para energia elétrica, água, internet, telefone)
    - "outras_saidas" (caso nenhuma outra se ajuste)
- payerName: O nome de quem pagou/enviou o dinheiro (pagador/origem/remetente/debitado de). Se houver CPF ou CNPJ visível do pagador, inclua entre parênteses após o nome. Use string vazia se não identificado.
- receiverName: O nome de quem recebeu o dinheiro (recebedor/beneficiário/favorecido/destino/creditado). Se houver CPF ou CNPJ visível do recebedor, inclua entre parênteses após o nome. Use string vazia se não identificado.
- documentNumber: O número/identificador do comprovante: ID da transação, E2E ID do PIX, código de autenticação, número do documento, controle ou protocolo. Use string vazia se não identificado.

Retorne estritamente um objeto JSON com as chaves indicadas. Não inclua markdown adicional ou comentários.
`;

    let contents: any[] = [];
    contents.push({
      inlineData: {
        data: fileBase64,
        mimeType: mimeType,
      },
    });
    contents.push({ text: prompt });

    const responseSchema = {
      type: Type.OBJECT,
      properties: {
        description: { type: Type.STRING, description: "Descrição concisa em português" },
        value: { type: Type.NUMBER, description: "Valor do lançamento" },
        date: { type: Type.STRING, description: "Data no formato YYYY-MM-DD" },
        type: { type: Type.STRING, description: "Tipo de operação: 'entrada' ou 'saida'" },
        category: { type: Type.STRING, description: "ID exato da categoria selecionada" },
        payerName: { type: Type.STRING, description: "Nome de quem pagou (com CPF/CNPJ entre parênteses, se visível)" },
        receiverName: { type: Type.STRING, description: "Nome de quem recebeu (com CPF/CNPJ entre parênteses, se visível)" },
        documentNumber: { type: Type.STRING, description: "Número/ID do comprovante ou transação (E2E, autenticação, protocolo)" },
      },
      required: ["description", "value", "date", "type", "category"],
    };

    // Orquestração: usa o Gemini quando a chave está configurada (melhor qualidade em fotos ruins)
    // e cai automaticamente para o motor interno (OCR Tesseract + parser) se a chave não existir
    // ou se a chamada à IA falhar por qualquer motivo.
    let receiptData: any = null;
    let engine: "gemini" | "ocr-interno" = "ocr-interno";
    let confidence = 0;

    if (process.env.GEMINI_API_KEY) {
      try {
        receiptData = await callGeminiForJson({
          model: "gemini-3.5-flash",
          contents,
          responseSchema,
          context: "comprovante",
        });
        engine = "gemini";
        confidence = 0.95;
      } catch (geminiError: any) {
        console.warn("Análise via Gemini falhou; usando motor interno de OCR como fallback:", geminiError?.message || geminiError);
      }
    }

    if (!receiptData) {
      const rawText = await extractReceiptText(fileBase64, mimeType);
      const parsed = parseReceiptText(rawText);
      const joinNameDoc = (name: string | null, doc: string | null) =>
        name ? (doc ? `${name} (${doc})` : name) : (doc || "");
      receiptData = {
        description: parsed.description,
        value: parsed.value || 0,
        date: parsed.date,
        type: parsed.type,
        category: parsed.category,
        payerName: joinNameDoc(parsed.payerName, parsed.payerDoc),
        receiverName: joinNameDoc(parsed.receiverName, parsed.receiverDoc),
        documentNumber: parsed.documentNumber || "",
      };
      engine = "ocr-interno";
      confidence = parsed.confidence;
    }

    return res.json({
      success: true,
      receiptData,
      engine,
      confidence,
      driveFile,
      driveError
    });
  } catch (error: any) {
    console.error("Erro ao analisar comprovante:", error);
    return res.status(500).json({ error: error.message || "Erro desconhecido ao processar comprovante." });
  }
});

// ==========================================
// TELEGRAM (backend guardião — token só no servidor)
// Config/token vivem em telegramServer.ts (env/Firestore); nada disso vai ao bundle.
// ==========================================

// Config mascarada (nunca revela o token). Exige sessão.
app.get("/api/telegram/config", requireAuth, async (req, res) => {
  try {
    return res.json(await telegram.getMaskedTelegramConfig());
  } catch (e: any) {
    return res.status(500).json({ error: e.message || "Erro ao ler configuração." });
  }
});

// Atualiza config do Telegram — apenas admin autenticado (sem senha hardcoded).
app.post("/api/telegram/config", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const { botToken, chatId, fileNamePattern } = req.body || {};
    await telegram.saveTelegramConfig({ botToken, chatId, fileNamePattern });
    return res.json({ success: true, message: "Configuração salva com sucesso!" });
  } catch (e: any) {
    return res.status(500).json({ error: e.message || "Falha ao salvar configuração." });
  }
});

// Upload de documento ao Telegram. Exige sessão. Valida tamanho e tipo.
app.post("/api/telegram/upload", requireAuth, async (req, res) => {
  try {
    const { base64Str, fileName, mimeType } = req.body || {};
    if (!base64Str) return res.status(400).json({ error: "Conteúdo do arquivo ausente." });

    const clean = String(base64Str).includes("base64,") ? String(base64Str).split("base64,")[1] : String(base64Str);

    // Valida TIPO REAL (magic bytes) e tamanho — não confia no mimeType do cliente.
    // Aceita imagens, PDF e planilhas (o Telegram é usado para comprovantes e planilhas).
    const check = validateBase64File(clean, RECEIPT_MIMES, { allowSpreadsheet: true });
    if (!check.ok) return res.status(check.error?.includes("limite") ? 413 : 400).json({ error: check.error });

    const result = await telegram.sendDocument(clean, fileName || "arquivo.dat", check.detected || mimeType || "application/octet-stream");
    return res.json({ success: true, url: result.url, fileId: result.fileId, error: null });
  } catch (e: any) {
    console.error("Erro no upload do Telegram:", e);
    return res.status(500).json({ error: e.message || "Erro interno no upload do Telegram." });
  }
});

// Proxy de download — exige sessão; valida o fileId (anti SSRF/path traversal).
app.get("/api/telegram/file/:fileId", requireAuth, async (req, res) => {
  try {
    const { buffer, contentType, fileName } = await telegram.fetchFileBinary(req.params.fileId);
    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Disposition", `inline; filename="${fileName}"`);
    return res.send(buffer);
  } catch (e: any) {
    console.error("Erro no download do Telegram:", e);
    return res.status(400).send(`Erro ao buscar arquivo: ${e.message || e}`);
  }
});

// Teste de integração — apenas admin.
app.post("/api/telegram/test", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    await telegram.sendTestMessage();
    return res.json({ success: true, message: "Mensagem de teste enviada com sucesso no Telegram!" });
  } catch (e: any) {
    console.error("Erro no teste do Telegram:", e);
    return res.status(500).json({ error: e.message || "Erro interno ao testar integração." });
  }
});

// Health-check simples (sem sessão) — reporta se o banco está configurado e alcançável.
app.get("/api/health", async (req, res) => {
  return res.json({ ok: true, dbConfigured: await isDbConfigured() });
});


// Vite middleware for development
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // Cria as tabelas do banco no boot (idempotente). Se o banco não estiver acessível,
  // apenas registra o aviso — o servidor sobe mesmo assim e cada request falha com erro
  // claro, evitando um crash-loop no deploy.
  try {
    await ensureSchema();
    console.log("Esquema do banco verificado/criado com sucesso.");
  } catch (e: any) {
    console.error("Aviso: não foi possível preparar o banco no boot:", e?.message || e);
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
