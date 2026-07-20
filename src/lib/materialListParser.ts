// src/lib/materialListParser.ts
// Extrator NATIVO (sem IA) de lista de materiais a partir de PDFs de tabela/planilha
// (ex.: "Material | Quantidade | Unidade | Fornecedor | Valor Unitário | Valor Total |
// Data do Pedido | Data de Entrega").
//
// Mesma estratégia usada em bulkTransactionParser.ts: lê a camada de texto do PDF
// preservando a posição (x, y) de cada célula (unpdf) e reconstrói a tabela por
// coluna, usando o cabeçalho para localizar os limites de cada coluna.
//
// Também inclui um motor de SUGESTÃO DE AGRUPAMENTO: compara os nomes dos materiais
// extraídos e aponta itens com nomes muito parecidos (possíveis duplicatas/variações
// de digitação do mesmo insumo), para o usuário decidir se quer uni-los.
//
// NÃO importar este arquivo em componentes React (uso apenas no backend).

import { extractTextItems } from "unpdf";

export interface ParsedMaterialItem {
  name: string;
  quantityVal: number;
  quantityUnit: string;
  supplier: string;
  unitValue: number;
  orderDate: string; // YYYY-MM-DD
  deliveryDate: string; // YYYY-MM-DD
  notes: string;
}

export interface GroupingSuggestion {
  /** Índices (no array de materials retornado) dos itens sugeridos para agrupar. */
  itemIndices: number[];
  itemNames: string[];
  reason: string;
}

export interface MaterialListParseResult {
  materials: ParsedMaterialItem[];
  warnings: string[];
  groupingSuggestions: GroupingSuggestion[];
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

type ColumnKey = "name" | "quantity" | "unit" | "supplier" | "unitPrice" | "totalPrice" | "dateOrder" | "dateDelivery";

const HEADER_DEFS: { key: ColumnKey; patterns: RegExp[] }[] = [
  { key: "name", patterns: [/material/, /insumo/, /descri/, /^item/, /produto/, /servico/] },
  { key: "quantity", patterns: [/quantidade/, /^qtd/, /^qtde/] },
  { key: "unit", patterns: [/^unidade/, /^un\.?$/, /unid\./] },
  { key: "supplier", patterns: [/fornecedor/, /^local/, /credor/, /^cliente/] },
  { key: "unitPrice", patterns: [/valor unit/, /preco unit/, /vl\.?\s*unit/, /^unitario$/] },
  { key: "totalPrice", patterns: [/valor total/, /preco total/, /vl\.?\s*total/, /^total$/, /^valor$/] },
  { key: "dateOrder", patterns: [/data do pedido/, /data da compra/, /data emissao/, /data lancamento/, /data pedido/] },
  { key: "dateDelivery", patterns: [/data de entrega/, /data de pagamento/, /data entrega/, /previsao/] },
];

interface ColumnBounds { key: ColumnKey; start: number; end: number }

function matchHeaderKeys(cellText: string): ColumnKey[] {
  const n = norm(cellText);
  const matched: ColumnKey[] = [];
  for (const def of HEADER_DEFS) {
    if (def.patterns.some((p) => p.test(n))) matched.push(def.key);
  }
  return matched;
}

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
// Parsers de número (R$ / quantidade) e data (DD/MM/AAAA)
// ---------------------------------------------------------------------------

function parseBrazilianNumber(raw: string | undefined): number | null {
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
  if (!isFinite(n) || n < 0 || n > 100_000_000) return null;
  return Math.round(n * 100) / 100;
}

/** Extrai a quantidade numérica de uma célula que pode ter a unidade junto (ex.: "50 sacos"). */
function parseQuantityCell(raw: string | undefined): { value: number | null; unit: string } {
  if (!raw) return { value: null, unit: "" };
  const m = raw.match(/([\d.,]+)\s*(.*)/);
  if (!m) return { value: null, unit: "" };
  const value = parseBrazilianNumber(m[1]);
  const unit = (m[2] || "").trim();
  return { value, unit };
}

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

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

// ---------------------------------------------------------------------------
// Motor de sugestão de agrupamento (nomes de materiais parecidos)
// ---------------------------------------------------------------------------

const STOPWORDS = new Set(["de", "da", "do", "das", "dos", "e", "para", "com", "sem", "em", "no", "na", "a", "o"]);

function tokenize(name: string): Set<string> {
  const n = norm(name).replace(/[^\w\s]/g, " ");
  return new Set(n.split(/\s+/).filter((t) => t.length > 0 && !STOPWORDS.has(t)));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const t of a) if (b.has(t)) intersection++;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp: number[] = new Array(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = tmp;
    }
  }
  return dp[n];
}

function levenshteinRatio(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

/** Compara dois nomes de material e retorna um score de 0 a 1 de quão parecidos são. */
function nameSimilarity(nameA: string, nameB: string): number {
  const normA = norm(nameA);
  const normB = norm(nameB);
  if (normA === normB) return 1;
  const tokensA = tokenize(nameA);
  const tokensB = tokenize(nameB);
  const jac = jaccard(tokensA, tokensB);
  const lev = levenshteinRatio(normA, normB);
  return Math.max(jac, lev);
}

class UnionFind {
  private parent: number[];
  constructor(size: number) {
    this.parent = Array.from({ length: size }, (_, i) => i);
  }
  find(x: number): number {
    if (this.parent[x] !== x) this.parent[x] = this.find(this.parent[x]);
    return this.parent[x];
  }
  union(a: number, b: number) {
    const ra = this.find(a), rb = this.find(b);
    if (ra !== rb) this.parent[ra] = rb;
  }
}

const SIMILARITY_THRESHOLD = 0.62;
const MIN_NAME_LENGTH_FOR_MATCH = 4;

/** Detecta grupos de materiais com nomes muito parecidos (possíveis duplicatas/variações). */
export function suggestGroups(materials: { name: string }[]): GroupingSuggestion[] {
  const n = materials.length;
  if (n < 2) return [];

  const uf = new UnionFind(n);
  for (let i = 0; i < n; i++) {
    const nameI = materials[i].name;
    if (norm(nameI).length < MIN_NAME_LENGTH_FOR_MATCH) continue;
    for (let j = i + 1; j < n; j++) {
      const nameJ = materials[j].name;
      if (norm(nameJ).length < MIN_NAME_LENGTH_FOR_MATCH) continue;
      const score = nameSimilarity(nameI, nameJ);
      if (score >= SIMILARITY_THRESHOLD) uf.union(i, j);
    }
  }

  const groupsMap = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const root = uf.find(i);
    if (!groupsMap.has(root)) groupsMap.set(root, []);
    groupsMap.get(root)!.push(i);
  }

  const suggestions: GroupingSuggestion[] = [];
  for (const indices of groupsMap.values()) {
    if (indices.length < 2) continue;
    const names = indices.map((idx) => materials[idx].name);
    const allIdentical = names.every((nm) => norm(nm) === norm(names[0]));
    suggestions.push({
      itemIndices: indices,
      itemNames: names,
      reason: allIdentical
        ? "Itens com o nome idêntico — provavelmente o mesmo material lançado em linhas separadas."
        : "Nomes muito parecidos — podem ser o mesmo material com pequenas variações de descrição/digitação.",
    });
  }

  suggestions.sort((a, b) => a.itemIndices[0] - b.itemIndices[0]);
  return suggestions;
}

// ---------------------------------------------------------------------------
// Função principal
// ---------------------------------------------------------------------------

/**
 * Extrai uma lista de materiais de um PDF de tabela/planilha (BOQ, cotação, orçamento),
 * usando apenas a camada de texto do PDF (sem chamadas a nenhuma IA).
 *
 * Lança um erro amigável em pt-BR quando o PDF não tem camada de texto (escaneado)
 * ou quando não é possível reconhecer uma tabela com cabeçalho reconhecível.
 */
export async function parseMaterialListFromPdf(fileBase64: string): Promise<MaterialListParseResult> {
  const buffer = Buffer.from(fileBase64, "base64");
  const { items } = await extractTextItems(new Uint8Array(buffer));

  const totalChars = items.reduce((sum, page) => sum + page.reduce((s, it) => s + (it.str?.trim().length || 0), 0), 0);
  if (totalChars < 20) {
    throw new Error(
      "Este PDF parece ser digitalizado (imagem escaneada, sem camada de texto). " +
      "O leitor nativo só consegue ler PDFs gerados a partir de planilha/tabela (ex.: exportado do Excel/Google Sheets)."
    );
  }

  const today = new Date().toISOString().split("T")[0];
  const warnings: string[] = [];
  const materials: ParsedMaterialItem[] = [];
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
      const isRepeatedHeader = row.cells.some((c) => /material|insumo/.test(norm(c.text)) && row.cells.some((c2) => /valor|quantidade/.test(norm(c2.text))));
      if (isRepeatedHeader) continue;

      const cells = assignRowToColumns(row, bounds);
      const name = cells.name?.trim();
      // Linhas sem nome de material não são lançamentos válidos (títulos, rodapés, totalizadores etc.)
      if (!name) continue;

      const notesParts: string[] = [];

      // Quantidade e unidade
      const qtyFromQuantityCol = parseQuantityCell(cells.quantity);
      let quantityVal = qtyFromQuantityCol.value;
      let quantityUnit = cells.unit?.trim() || qtyFromQuantityCol.unit || "";
      if (quantityVal === null) {
        quantityVal = 1;
        notesParts.push("Quantidade não encontrada no PDF — preenchida com 1, confira.");
      }

      // Fornecedor (com herança de célula mesclada, comum em planilhas exportadas)
      const supplierRaw = cells.supplier?.trim() || "";
      const supplier = supplierRaw || lastSupplier || "Cotação";
      if (supplierRaw) lastSupplier = supplierRaw;
      else if (lastSupplier) notesParts.push("Fornecedor herdado da linha anterior (célula mesclada na planilha original).");

      // Valores unitário e total — reconcilia quando só um dos dois está presente
      let unitValue = parseBrazilianNumber(cells.unitPrice);
      let totalValue = parseBrazilianNumber(cells.totalPrice);
      if (unitValue === null && totalValue !== null) {
        unitValue = quantityVal > 0 ? Math.round((totalValue / quantityVal) * 100) / 100 : totalValue;
      } else if (unitValue === null && totalValue === null) {
        unitValue = 0;
        notesParts.push("Valor não encontrado no PDF — preenchido com 0, confira antes de salvar.");
      } else if (unitValue !== null && totalValue !== null) {
        const expectedTotal = Math.round(unitValue * quantityVal * 100) / 100;
        if (Math.abs(expectedTotal - totalValue) > Math.max(0.5, totalValue * 0.02)) {
          notesParts.push(`Valor total do PDF (${totalValue.toFixed(2)}) não bate com qtd × valor unitário — confira.`);
        }
      }

      // Datas
      const orderDate = parseBrazilianDate(cells.dateOrder) || today;
      if (!parseBrazilianDate(cells.dateOrder)) {
        notesParts.push("Data do pedido não encontrada — preenchida com a data de hoje, confira.");
      }
      const deliveryDate = parseBrazilianDate(cells.dateDelivery) || addDays(orderDate, 7);
      if (!parseBrazilianDate(cells.dateDelivery)) {
        notesParts.push("Data de entrega não encontrada — estimada em 7 dias após o pedido, confira.");
      }

      materials.push({
        name,
        quantityVal,
        quantityUnit,
        supplier,
        unitValue: unitValue as number,
        orderDate,
        deliveryDate,
        notes: notesParts.join(" "),
      });
    }
  }

  if (!headerFound) {
    throw new Error(
      "Não foi possível reconhecer a estrutura de tabela deste PDF (não encontrei um cabeçalho com colunas como " +
      "Material/Insumo, Quantidade e Valor). Confira se o PDF foi exportado de uma planilha em formato de tabela."
    );
  }
  if (materials.length === 0) {
    throw new Error("O cabeçalho da tabela foi encontrado, mas nenhuma linha com material válido foi identificada no PDF.");
  }

  const flaggedCount = materials.filter((m) => m.notes.length > 0).length;
  if (flaggedCount > 0) {
    warnings.push(`${flaggedCount} de ${materials.length} item(ns) foram marcados para revisão — confira as observações de cada linha.`);
  }

  const groupingSuggestions = suggestGroups(materials);
  if (groupingSuggestions.length > 0) {
    const totalGroupedItems = groupingSuggestions.reduce((sum, g) => sum + g.itemIndices.length, 0);
    warnings.push(`${groupingSuggestions.length} sugestão(ões) de agrupamento encontrada(s), envolvendo ${totalGroupedItems} itens com nomes parecidos.`);
  }

  return { materials, warnings, groupingSuggestions };
}
