// src/lib/bulkTransactionParser.ts
// Extrator NATIVO (sem IA) de lançamentos financeiros em lote a partir de PDFs
// de planilhas/tabelas de gastos de obra (ex.: "Fornecedor | Material | Data | Valor").
//
// Estratégia: usa a camada de texto do PDF (unpdf) preservando a posição (x, y) de
// cada célula para reconstruir a tabela LINHA A LINHA e COLUNA A COLUNA — em vez de
// mandar o arquivo inteiro para um modelo de IA "ler" o documento.
//
// O cabeçalho da tabela é localizado por palavras-chave (Fornecedor, Material/
// Descrição, Data, Valor, Categoria...), e a posição X de cada célula do cabeçalho
// define os limites de cada coluna. Isso funciona mesmo se a ordem das colunas mudar
// de um documento para outro, desde que os títulos sejam reconhecíveis.
//
// NÃO importar este arquivo em componentes React (uso apenas no backend).

import { extractTextItems } from "unpdf";
import { TransactionCategory } from "../types";

export interface ParsedBulkTransaction {
  supplier: string;
  description: string;
  value: number;
  date: string; // YYYY-MM-DD
  category: TransactionCategory;
  notes: string;
  selected?: boolean;
}

export interface BulkPdfParseResult {
  transactions: ParsedBulkTransaction[];
  /** Avisos gerais do processamento (ex.: quantidade de linhas ignoradas). */
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Utilitários de normalização de texto
// ---------------------------------------------------------------------------

const stripAccents = (s: string): string => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const norm = (s: string): string => stripAccents(s).toLowerCase().trim();

// ---------------------------------------------------------------------------
// Reconstrução de linhas a partir dos itens de texto (x, y) do PDF
// ---------------------------------------------------------------------------

interface TextItem { str: string; x: number; y: number; fontSize?: number }
interface Cell { text: string; x: number }
interface Row { y: number; cells: Cell[] }

function groupItemsIntoRows(items: TextItem[]): Row[] {
  const visible = items.filter((it) => it.str && it.str.trim().length > 0);
  // Ordena de cima para baixo (Y decrescente = topo da página) e da esquerda pra direita
  visible.sort((a, b) => (Math.abs(b.y - a.y) > 3 ? b.y - a.y : a.x - b.x));

  const rows: Row[] = [];
  let currentY: number | null = null;
  let current: Cell[] = [];

  for (const it of visible) {
    const tolerance = Math.max(2, (it.fontSize || 10) * 0.5);
    if (currentY === null || Math.abs(it.y - currentY) <= tolerance) {
      current.push({ text: it.str.trim(), x: it.x });
      currentY = currentY === null ? it.y : currentY;
    } else {
      rows.push({ y: currentY, cells: current.sort((a, b) => a.x - b.x) });
      current = [{ text: it.str.trim(), x: it.x }];
      currentY = it.y;
    }
  }
  if (current.length > 0) rows.push({ y: currentY as number, cells: current.sort((a, b) => a.x - b.x) });
  return rows;
}

// ---------------------------------------------------------------------------
// Detecção de cabeçalho e mapeamento de colunas
// ---------------------------------------------------------------------------

type ColumnKey = "supplier" | "material" | "unit" | "quantity" | "category" | "dateOrder" | "dateDelivery" | "value";

const HEADER_DEFS: { key: ColumnKey; patterns: RegExp[] }[] = [
  { key: "supplier", patterns: [/fornecedor/, /^local/, /credor/, /^cliente/] },
  { key: "material", patterns: [/material/, /descri/, /^item/, /produto/, /servico/] },
  { key: "unit", patterns: [/^unidade/, /^un\.?$/] },
  { key: "quantity", patterns: [/quantidade/, /^qtd/] },
  { key: "category", patterns: [/categoria/, /tipo de gasto/, /classifica/] },
  { key: "dateOrder", patterns: [/data do pedido/, /data da compra/, /data emissao/, /data lancamento/] },
  { key: "dateDelivery", patterns: [/data de entrega/, /data de pagamento/, /^data$/] },
  { key: "value", patterns: [/valor/, /^total/, /preco/] },
];

// Colunas cujo texto realmente vira campos do lançamento (as demais só evitam
// "vazamento" de texto entre colunas vizinhas, ex.: unidade/quantidade).
const RELEVANT_KEYS: ColumnKey[] = ["supplier", "material", "category", "dateOrder", "dateDelivery", "value"];

interface ColumnBounds { key: ColumnKey; start: number; end: number }

function matchHeaderKeys(cellText: string): ColumnKey[] {
  const n = norm(cellText);
  const matched: ColumnKey[] = [];
  for (const def of HEADER_DEFS) {
    if (def.patterns.some((p) => p.test(n))) matched.push(def.key);
  }
  return matched;
}

/** Procura, entre as primeiras linhas do documento, a que parece ser o cabeçalho da tabela. */
function findHeaderRow(rows: Row[]): Row | null {
  for (const row of rows) {
    const found = new Set<ColumnKey>();
    for (const cell of row.cells) {
      for (const key of matchHeaderKeys(cell.text)) found.add(key);
    }
    // Exige ao menos 3 colunas reconhecidas (evita falso positivo em título solto)
    if (found.size >= 3) return row;
  }
  return null;
}

function buildColumnBounds(headerRow: Row): ColumnBounds[] {
  const anchors: { key: ColumnKey; x: number }[] = [];
  for (const cell of headerRow.cells) {
    for (const key of matchHeaderKeys(cell.text)) {
      anchors.push({ key, x: cell.x });
    }
  }
  anchors.sort((a, b) => a.x - b.x);
  return anchors.map((a, i) => ({
    key: a.key,
    start: i === 0 ? -Infinity : (anchors[i - 1].x + a.x) / 2,
    end: i === anchors.length - 1 ? Infinity : (a.x + anchors[i + 1].x) / 2,
  }));
}

function assignRowToColumns(row: Row, bounds: ColumnBounds[]): Partial<Record<ColumnKey, string>> {
  const result: Partial<Record<ColumnKey, string>> = {};
  for (const cell of row.cells) {
    const col = bounds.find((c) => cell.x >= c.start && cell.x < c.end);
    if (!col) continue;
    result[col.key] = result[col.key] ? `${result[col.key]} ${cell.text}` : cell.text;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Parsers de valor (R$) e data (DD/MM/AAAA)
// ---------------------------------------------------------------------------

function parseBrazilianAmount(raw: string | undefined): number | null {
  if (!raw) return null;
  let s = raw.replace(/[^\d.,]/g, "");
  if (!s) return null;
  const hasComma = s.includes(",");
  const hasDot = s.includes(".");
  if (hasComma && hasDot) {
    s = s.lastIndexOf(",") > s.lastIndexOf(".") ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (hasComma) {
    s = s.replace(",", ".");
  }
  const n = parseFloat(s);
  if (!isFinite(n) || n <= 0 || n > 100_000_000) return null;
  return Math.round(n * 100) / 100;
}

/** Aceita DD/MM/AAAA, DD/MM/AA e tolera erros de digitação leves como "09//10/2025". */
function parseBrazilianDate(raw: string | undefined): string | null {
  if (!raw) return null;
  const m = raw.match(/(\d{1,2})\s*\/{1,2}\s*(\d{1,2})\s*\/\s*(\d{2,4})/);
  if (!m) return null;
  const day = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  let year = parseInt(m[3], 10);
  if (year < 100) year += 2000;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Classificação de categoria por palavra-chave (quando o PDF não tem coluna
// própria de categoria). Mesma taxonomia usada no restante do app.
// ---------------------------------------------------------------------------

const CATEGORY_KEYWORDS: { category: TransactionCategory; words: string[] }[] = [
  { category: "mao_de_obra", words: ["mao de obra", "pedreiro", "servente", "pintor", "encanador", "eletricista", "mestre de obra", "empreiteiro", "diarista", "ajudante de obra"] },
  { category: "taxas", words: ["crea", " art ", "art verba", "alvara", "prefeitura", "cartorio", " iss", "imposto", "taxa municipal", "taxa da"] },
  { category: "decoracao", words: ["paisagismo", "luminaria", "iluminacao decorativa", "tapete", "cortina", "moveis planejados", "acabamento decorativo"] },
  {
    category: "materiais",
    words: [
      "cimento", "tijolo", "telha", "areia", "brita", "ferro", "ferragem", "aco ",
      "coluna armada", "trelica", "tubo", "tubulac", "conexo", "conexa", "cano",
      " fio", "cabo", "trodut" /* eletroduto / elotroduto */, "revestimento", "tinta",
      "madeira", "sarrafo", "estaca", "prego", "laje", "piso", "azulejo", "argamassa",
      "bloco", "canaleta", "imperme" /* impermeabilizante, com ou sem erro de digitação */,
      "aditivo", "portal", "mangueira", "concreto", "brescal", "soquete", "prolongador",
      "padrao de energia", "hidraul", "eletric",
    ],
  },
];

function categorizeByKeywords(material: string, supplier: string): TransactionCategory {
  const text = norm(`${material} ${supplier}`);
  for (const group of CATEGORY_KEYWORDS) {
    if (group.words.some((w) => text.includes(w))) return group.category;
  }
  return "outros";
}

const VALID_CATEGORIES: TransactionCategory[] = ["materiais", "mao_de_obra", "projetos_complementares", "taxas", "decoracao", "outros"];

/** Se o PDF tiver uma coluna própria de categoria, tenta mapear o texto para o enum interno. */
function mapExplicitCategory(raw: string | undefined): TransactionCategory | null {
  if (!raw) return null;
  const n = norm(raw);
  if (n.includes("mao de obra") || n.includes("mao-de-obra")) return "mao_de_obra";
  if (n.includes("projeto")) return "projetos_complementares";
  if (n.includes("decora")) return "decoracao";
  if (n.includes("taxa") || n.includes("imposto")) return "taxas";
  if (n.includes("material")) return "materiais";
  if (n.includes("outro")) return "outros";
  const direct = VALID_CATEGORIES.find((c) => norm(c) === n.replace(/\s+/g, "_"));
  return direct || null;
}

// ---------------------------------------------------------------------------
// Função principal
// ---------------------------------------------------------------------------

/**
 * Extrai lançamentos financeiros de um PDF de tabela/planilha de gastos de obra,
 * usando apenas a camada de texto do PDF (sem chamadas a nenhuma IA).
 *
 * Lança um erro amigável em pt-BR quando o PDF não tem camada de texto (escaneado)
 * ou quando não é possível reconhecer uma tabela com cabeçalho reconhecível.
 */
export async function parseBulkTransactionsFromPdf(fileBase64: string): Promise<BulkPdfParseResult> {
  const buffer = Buffer.from(fileBase64, "base64");
  const { items } = await extractTextItems(new Uint8Array(buffer));

  const totalChars = items.reduce((sum, page) => sum + page.reduce((s, it) => s + (it.str?.trim().length || 0), 0), 0);
  if (totalChars < 20) {
    throw new Error(
      "Este PDF parece ser digitalizado (imagem escaneada, sem camada de texto). " +
      "O leitor nativo só consegue ler PDFs gerados a partir de planilha/tabela (ex.: exportado do Excel/Google Sheets)."
    );
  }

  const warnings: string[] = [];
  const transactions: ParsedBulkTransaction[] = [];
  let headerFound = false;
  let lastSupplier = "";

  for (const pageItems of items) {
    const rows = groupItemsIntoRows(pageItems);
    const headerRow = findHeaderRow(rows);
    if (!headerRow) continue; // página sem tabela (ex.: capa) — ignora
    headerFound = true;

    const bounds = buildColumnBounds(headerRow);
    const headerIndex = rows.indexOf(headerRow);

    for (const row of rows.slice(headerIndex + 1)) {
      // Se a mesma página repetir o cabeçalho (comum em relatórios longos), pula.
      const isRepeatedHeader = row.cells.some((c) => /fornecedor|material.*descri/.test(norm(c.text)));
      if (isRepeatedHeader) continue;

      const cells = assignRowToColumns(row, bounds);
      const value = parseBrazilianAmount(cells.value);
      // Linhas sem um valor numérico válido não são lançamentos (títulos, rodapés, totalizadores em branco etc.)
      if (value === null) continue;

      const supplierRaw = cells.supplier?.trim() || "";
      const supplier = supplierRaw || lastSupplier || "Diverso/Não identificado";
      if (supplierRaw) lastSupplier = supplierRaw;

      const material = cells.material?.trim() || "Gasto importado";

      const dateRawPreferred = cells.dateDelivery || cells.dateOrder;
      const dateRawFallback = cells.dateOrder || cells.dateDelivery;
      let date = parseBrazilianDate(cells.dateDelivery) || parseBrazilianDate(cells.dateOrder);
      const notesParts: string[] = [];
      if (!date) {
        date = new Date().toISOString().split("T")[0];
        const candidate = (dateRawPreferred || dateRawFallback || "").trim();
        const looksLikeDateAttempt = /\d.*\/.*\d/.test(candidate); // tem dígitos e barra(s), ex.: "27/17/2025"
        if (looksLikeDateAttempt) {
          notesParts.push(`Data original ilegível no PDF ("${candidate}") — confira antes de importar.`);
        } else {
          notesParts.push("Data não encontrada nesta linha do PDF — preenchida com a data de hoje, confira.");
        }
      }

      const explicitCategory = mapExplicitCategory(cells.category);
      const category = explicitCategory || categorizeByKeywords(material, supplier);
      if (!supplierRaw && lastSupplier) {
        notesParts.push("Fornecedor herdado da linha anterior (célula mesclada na planilha original).");
      }

      transactions.push({
        supplier,
        description: material,
        value,
        date,
        category,
        notes: notesParts.join(" "),
        selected: true,
      });
    }
  }

  if (!headerFound) {
    throw new Error(
      "Não foi possível reconhecer a estrutura de tabela deste PDF (não encontrei um cabeçalho com colunas como " +
      "Fornecedor, Material/Descrição, Data e Valor). Confira se o PDF foi exportado de uma planilha em formato de tabela."
    );
  }
  if (transactions.length === 0) {
    throw new Error("O cabeçalho da tabela foi encontrado, mas nenhuma linha com valor válido foi identificada no PDF.");
  }

  const flaggedCount = transactions.filter((t) => t.notes.length > 0).length;
  if (flaggedCount > 0) {
    warnings.push(`${flaggedCount} de ${transactions.length} lançamento(s) foram marcados para revisão (data não encontrada ou fornecedor herdado da linha anterior).`);
  }

  return { transactions, warnings };
}
