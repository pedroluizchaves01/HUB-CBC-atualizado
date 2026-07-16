import express from "express";
import path from "path";
import dotenv from "dotenv";
import { GoogleGenAI, Type } from "@google/genai";
import { createServer as createViteServer } from "vite";
import * as XLSX from "xlsx";
import { saveDocumentToDrive, DRIVE_FOLDERS } from "./src/lib/driveService";

dotenv.config();

const app = express();
const PORT = 3000;

// Increase limit to handle PDF/Excel base64 uploads
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

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
app.post("/api/planning/parse-document", async (req, res) => {
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
app.post("/api/planning/parse-materials", async (req, res) => {
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

    return res.json({ success: true, materials: data.materials, comment: data.comment, driveFile, driveError });
  } catch (error: any) {
    console.error("Erro no processamento da IA para materiais:", error);
    return res.status(500).json({ error: error.message || "Erro desconhecido ao processar a lista de materiais com a IA." });
  }
});

// AI Refinement / Alteration Checkpoint endpoint for materials lists
app.post("/api/planning/refine-materials", async (req, res) => {
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

// AI Invoice parsing endpoint for construction expenses
app.post("/api/acompanhamento/parse-invoice", async (req, res) => {
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

// AI Bulk Transactions parsing endpoint (e.g. Excel spreadsheet, PDF bank statement, multiple invoice table)
app.post("/api/acompanhamento/parse-bulk-transactions", async (req, res) => {
  try {
    const { fileBase64, mimeType, fileName, accessToken } = req.body;

    if (!fileBase64 || !mimeType) {
      return res.status(400).json({ error: "Arquivo ou tipo MIME ausente para importação em lote." });
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
      DRIVE_FOLDERS.extratos,
      fileName || "extrato.pdf",
      mimeType,
      fileBase64
    );

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
app.post("/api/quotations/parse-material-request", async (req, res) => {
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
app.post("/api/office/analyze-receipt", async (req, res) => {
  try {
    const { fileBase64, mimeType, fileName, accessToken } = req.body;

    if (!fileBase64 || !mimeType) {
      return res.status(400).json({ error: "Arquivo ou tipo MIME ausente para a análise de comprovante." });
    }

    // Validation of supported formats (Images and PDFs only)
    const isAllowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(mimeType);
    if (!isAllowed) {
      return res.status(400).json({ error: "Formato de arquivo não suportado para leitura automática. Envie uma foto (JPG/PNG) ou um PDF." });
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
      },
      required: ["description", "value", "date", "type", "category"],
    };

    const receiptData = await callGeminiForJson({
      model: "gemini-3.5-flash",
      contents,
      responseSchema,
      context: "comprovante",
    });

    return res.json({ 
      success: true, 
      receiptData, 
      driveFile,
      driveError
    });
  } catch (error: any) {
    console.error("Erro ao analisar comprovante:", error);
    return res.status(500).json({ error: error.message || "Erro desconhecido ao processar comprovante." });
  }
});

// ==========================================
// TELEGRAM STORAGE BACKEND ROUTING ENGINE
// ==========================================
import fs from "fs";

interface TelegramConfig {
  botToken?: string;
  chatId?: string;
  fileNamePattern?: string;
}

const TELEGRAM_CONFIG_PATH = path.join(process.cwd(), "telegram-config.json");
const DEFAULT_BOT_TOKEN = "8301754881:AAGhunIBqoCrngjRfaC3N9fkCCxyWktblKk";
const DEFAULT_CHAT_ID = "-5480284811";

function getTelegramConfig(): TelegramConfig {
  let fileConfig: TelegramConfig = {};
  try {
    if (fs.existsSync(TELEGRAM_CONFIG_PATH)) {
      const data = fs.readFileSync(TELEGRAM_CONFIG_PATH, "utf-8").trim();
      if (data) {
        fileConfig = JSON.parse(data);
      }
    } else {
      fileConfig = {
        botToken: DEFAULT_BOT_TOKEN,
        chatId: DEFAULT_CHAT_ID,
        fileNamePattern: "{centro} - {data} - {fornecedor} - {descricao} - {valor}"
      };
      saveTelegramConfig(fileConfig);
    }
  } catch (e) {
    console.error("Erro ao ler telegram-config.json:", e);
  }
  return {
    botToken: fileConfig.botToken || process.env.TELEGRAM_BOT_TOKEN || DEFAULT_BOT_TOKEN,
    chatId: fileConfig.chatId || process.env.TELEGRAM_CHAT_ID || DEFAULT_CHAT_ID,
    fileNamePattern: fileConfig.fileNamePattern || "{centro} - {data} - {fornecedor} - {descricao} - {valor}"
  };
}

function saveTelegramConfig(config: TelegramConfig) {
  try {
    fs.writeFileSync(TELEGRAM_CONFIG_PATH, JSON.stringify(config, null, 2), "utf-8");
  } catch (e) {
    console.error("Erro ao salvar telegram-config.json:", e);
  }
}

// Get current Telegram config (masked for security)
app.get("/api/telegram/config", (req, res) => {
  const config = getTelegramConfig();
  const maskedToken = config.botToken 
    ? config.botToken.substring(0, 6) + "..." + config.botToken.substring(config.botToken.length - 4)
    : "";
  return res.json({
    botToken: maskedToken,
    hasToken: !!config.botToken,
    chatId: config.chatId || "",
    fileNamePattern: config.fileNamePattern || "{centro} - {data} - {fornecedor} - {descricao} - {valor}"
  });
});

// Update Telegram config
app.post("/api/telegram/config", (req, res) => {
  try {
    const { botToken, chatId, password, fileNamePattern } = req.body;
    
    // Validate authorization password
    if (password !== "Cbc*12345") {
      return res.status(401).json({ error: "Senha de autorização incorreta. Você não tem permissão para alterar as configurações do banco de dados." });
    }

    const currentConfig = getTelegramConfig();
    
    // If token has ellipsis, keep the original saved one
    const updatedToken = (botToken && botToken.includes("...")) 
      ? currentConfig.botToken 
      : botToken;

    saveTelegramConfig({
      botToken: updatedToken || "",
      chatId: chatId || "",
      fileNamePattern: fileNamePattern || "{centro} - {data} - {fornecedor} - {descricao} - {valor}"
    });
    
    return res.json({ success: true, message: "Configuração do Banco de Dados salva com sucesso!" });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || "Falha ao salvar configuração." });
  }
});

// Upload document to Telegram chat/group and get a persistent fileId
app.post("/api/telegram/upload", async (req, res) => {
  try {
    const { base64Str, fileName, mimeType } = req.body;
    if (!base64Str) {
      return res.status(400).json({ error: "Conteúdo do arquivo ausente." });
    }

    const config = getTelegramConfig();
    if (!config.botToken || !config.chatId) {
      return res.status(400).json({ 
        error: "Telegram não configurado. Por favor, acesse o Painel Admin e insira o Token do Bot e Chat ID." 
      });
    }

    const cleanBase64 = base64Str.includes("base64,") 
      ? base64Str.split("base64,")[1] 
      : base64Str;
    const buffer = Buffer.from(cleanBase64, "base64");
    
    // We construct a Blob natively in Node.js
    const fileBlob = new Blob([buffer], { type: mimeType || "application/octet-stream" });

    const telegramFormData = new FormData();
    telegramFormData.append("chat_id", config.chatId);
    telegramFormData.append("document", fileBlob, fileName || "arquivo.dat");
    telegramFormData.append("caption", `📁 *Novo Anexo Recebido*\n📄 Documento: \`${fileName || "arquivo"}\`\n🔧 Processado pelo Sistema Chaves Brites Correa.`);

    const telegramRes = await fetch(`https://api.telegram.org/bot${config.botToken}/sendDocument`, {
      method: "POST",
      body: telegramFormData
    });

    const telegramData: any = await telegramRes.json();
    if (!telegramData.ok) {
      throw new Error(telegramData.description || "Erro retornado pela API do Telegram");
    }

    const fileId = telegramData.result.document.file_id;
    return res.json({
      success: true,
      url: `/api/telegram/file/${fileId}`,
      fileId,
      error: null
    });

  } catch (error: any) {
    console.error("Erro no upload do Telegram:", error);
    return res.status(500).json({ error: error.message || "Erro interno no upload do Telegram." });
  }
});

// Download/Stream file from Telegram securely
app.get("/api/telegram/file/:fileId", async (req, res) => {
  try {
    const { fileId } = req.params;
    const config = getTelegramConfig();
    if (!config.botToken) {
      return res.status(400).send("Telegram Bot Token não configurado.");
    }

    // 1. Resolve path
    const getFileRes = await fetch(`https://api.telegram.org/bot${config.botToken}/getFile?file_id=${fileId}`);
    const getFileData: any = await getFileRes.json();
    if (!getFileData.ok) {
      throw new Error(getFileData.description || "Erro ao localizar arquivo no Telegram");
    }

    const filePath = getFileData.result.file_path;
    if (!filePath) {
      throw new Error("Caminho do arquivo não fornecido pelo Telegram.");
    }

    // 2. Fetch binary stream
    const downloadUrl = `https://api.telegram.org/file/bot${config.botToken}/${filePath}`;
    const fileRes = await fetch(downloadUrl);
    if (!fileRes.ok) {
      throw new Error(`Erro ao baixar arquivo do Telegram: ${fileRes.statusText}`);
    }

    const contentType = fileRes.headers.get("content-type") || "application/octet-stream";
    res.setHeader("Content-Type", contentType);
    
    const fileName = path.basename(filePath);
    res.setHeader("Content-Disposition", `inline; filename="${fileName}"`);

    const arrayBuffer = await fileRes.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    return res.send(buffer);

  } catch (error: any) {
    console.error("Erro no download de arquivo do Telegram:", error);
    return res.status(500).send(`Erro ao buscar arquivo: ${error.message || error}`);
  }
});

// Send a test text message to verify Telegram Bot configuration
app.post("/api/telegram/test", async (req, res) => {
  try {
    const config = getTelegramConfig();
    if (!config.botToken || !config.chatId) {
      return res.status(400).json({ 
        error: "Telegram não configurado. Forga favor, insira o Token do Bot e o Chat ID primeiro." 
      });
    }

    const testMsg = `🔌 *Teste de Integração Chaves Brites Correa*\n\n✅ O sistema está conectado e integrado com sucesso ao seu canal/grupo do Telegram!\n\n📅 Data: ${new Date().toLocaleString("pt-BR")}\n👤 Usuário: Painel Administrativo`;
    
    const telegramRes = await fetch(`https://api.telegram.org/bot${config.botToken}/sendMessage`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        chat_id: config.chatId,
        text: testMsg,
        parse_mode: "Markdown"
      })
    });

    const telegramData: any = await telegramRes.json();
    if (!telegramData.ok) {
      throw new Error(telegramData.description || "Erro retornado pela API do Telegram");
    }

    return res.json({ success: true, message: "Mensagem de teste enviada com sucesso no Telegram!" });

  } catch (error: any) {
    console.error("Erro no teste do Telegram:", error);
    return res.status(500).json({ error: error.message || "Erro interno ao testar integração." });
  }
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

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
