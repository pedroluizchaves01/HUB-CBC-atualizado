// src/lib/laborPaymentParser.ts
// Extrator NATIVO (sem IA) de pagamentos de mão de obra a partir de PDFs de
// tabela/planilha (ex.: "Prestador | Parcela | Data | Valor").
//
// Mesma estratégia do materialListParser.ts / bulkTransactionParser.ts: lê a
// camada de texto do PDF preservando a posição (x, y) de cada célula (unpdf) e
// reconstrói a tabela por coluna, localizando os limites pelo cabeçalho.
//
// Cobre os dois casos que o usuário descreveu:
//  - um prestador com várias parcelas (nome só na 1ª linha → herdado das seguintes);
//  - vários prestadores misturados (nome repetido em cada linha).
//
// NÃO importar este arquivo em componentes React (uso apenas no backend).

import { extractTextItems } from "unpdf";

export interface ParsedLaborPayment {
  supplierName: string;
  installment: string;
  paymentDate: string; // YYYY-MM-DD
  value: number;
}

export interface LaborPaymentParseResult {
  payments: ParsedLaborPayment[];
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Normalização
// ---------------------------------------------------------------------------

const stripAccents = (s: string): string => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const norm = (s: string): string => stripAccents(s).toLowerCase().trim();

// ---------------------------------------------------------------------------
// Reconstrução de linhas a partir dos itens de texto (x, y)
// ---------------------------------------------------------------------------

interface TextItem { str: string; x: number; y: number; fontSize?: number }
interface Cell { text: string; x: number }
interface Row { y: number; cells: Cell[] }

function groupItemsIntoRows(items: TextItem[]): Row[] {
  // Filtra células vazias/espaçadoras que o unpdf emite (str vazio ou só espaço).
  const visible = items.filter((it) => it.str && it.str.trim().length > 0);
  visible.sort((a, b) => (Math.abs(b.y - a.y) > 3 ? b.y - a.y : a.x - b.x));

  const rows: Row[] = [];
  let currentY: number | null = null;
  let current: Cell[] = [];

  for (const it of visible) {
    const tolerance = Math.max(2, (it.fontSize || 10) * 0.5);
    if (currentY === null || Math.abs(it.y - currentY) <= tolerance) {
      current.push({ text: it.str.trim(), x: it.x });
      if (currentY === null) currentY = it.y;
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
// Cabeçalho e colunas
// ---------------------------------------------------------------------------

type ColumnKey = "supplier" | "installment" | "date" | "value";

const HEADER_DEFS: { key: ColumnKey; patterns: RegExp[] }[] = [
  { key: "supplier", patterns: [/prestador/, /fornecedor/, /empreiteiro/, /credor/, /favorecido/, /benefici/, /nome/, /colaborador/, /pedreiro/, /mao de obra/, /mao-de-obra/] },
  { key: "installment", patterns: [/parcela/, /parc\b/, /n[°º]/, /numero/, /medicao/, /etapa/, /descricao/, /referencia/, /ref\b/] },
  { key: "date", patterns: [/data/, /vencimento/, /venc\b/, /pagamento/, /pgto/, /competencia/] },
  { key: "value", patterns: [/valor/, /r\$/, /montante/, /total/, /quantia/, /pago/] },
];

function matchHeaderKeys(cellText: string): ColumnKey[] {
  const n = norm(cellText);
  const matched: ColumnKey[] = [];
  for (const def of HEADER_DEFS) {
    if (def.patterns.some((p) => p.test(n))) matched.push(def.key);
  }
  return matched;
}

function findHeaderRow(rows: Row[]): Row | null {
  let best: { row: Row; count: number } | null = null;
  for (const row of rows) {
    const found = new Set<ColumnKey>();
    for (const cell of row.cells) {
      // Cabeçalhos são curtos ("Valor", "Data"). Ignora células longas — evita que
      // um título como "Programação de Pagamentos - Mão de Obra" seja lido como
      // cabeçalho só porque contém "pagamento" e "mão de obra".
      if (cell.text.length > 30) continue;
      for (const key of matchHeaderKeys(cell.text)) found.add(key);
    }
    // Precisa de células distintas por chave (um cabeçalho real tem colunas separadas).
    if (found.size >= 3) {
      if (!best || found.size > best.count) best = { row, count: found.size };
    }
  }
  // Fallback: se nenhuma linha tem 3+ colunas, aceita a melhor com 2 (tabelas enxutas),
  // desde que uma delas seja "value" — sem valor não há pagamento a extrair.
  if (!best) {
    for (const row of rows) {
      const found = new Set<ColumnKey>();
      for (const cell of row.cells) {
        if (cell.text.length > 30) continue;
        for (const key of matchHeaderKeys(cell.text)) found.add(key);
      }
      if (found.size >= 2 && found.has("value")) return row;
    }
    return null;
  }
  return best.row;
}

interface ColumnBounds { key: ColumnKey; start: number; end: number }

function buildColumnBounds(headerRow: Row): ColumnBounds[] {
  const anchors: { key: ColumnKey; x: number }[] = [];
  const usedKeys = new Set<ColumnKey>();
  for (const cell of headerRow.cells) {
    for (const key of matchHeaderKeys(cell.text)) {
      // Um cabeçalho pode casar em mais de um padrão; fica com a 1ª âncora de cada coluna.
      if (usedKeys.has(key)) continue;
      usedKeys.add(key);
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
// Parsers de número (R$) e data (DD/MM/AAAA)
// ---------------------------------------------------------------------------

function parseBrazilianNumber(raw: string | undefined): number | null {
  if (!raw) return null;
  let s = raw.replace(/[^\d.,]/g, "");
  if (!s) return null;
  const hasComma = s.includes(",");
  const hasDot = s.includes(".");
  if (hasComma && hasDot) {
    // O separador decimal é o que aparece por último.
    s = s.lastIndexOf(",") > s.lastIndexOf(".") ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (hasComma) {
    s = s.replace(",", ".");
  }
  const n = parseFloat(s);
  if (!isFinite(n) || n < 0 || n > 100_000_000) return null;
  return Math.round(n * 100) / 100;
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

/** Procura uma data em qualquer lugar do texto (fallback quando a coluna some). */
function findAnyDate(cells: Partial<Record<ColumnKey, string>>): string | null {
  for (const v of Object.values(cells)) {
    const d = parseBrazilianDate(v);
    if (d) return d;
  }
  return null;
}

// Palavras que denunciam linha de total/rodapé — não são parcelas.
const TOTAL_ROW = /\b(total|subtotal|soma|totaliza|saldo)\b/;

// ---------------------------------------------------------------------------
// Função principal
// ---------------------------------------------------------------------------

export async function parseLaborPaymentsFromPdf(fileBase64: string): Promise<LaborPaymentParseResult> {
  const buffer = Buffer.from(fileBase64, "base64");
  const { items } = await extractTextItems(new Uint8Array(buffer));

  const totalChars = items.reduce(
    (sum, page) => sum + page.reduce((s, it) => s + (it.str?.trim().length || 0), 0),
    0
  );
  if (totalChars < 20) {
    throw new Error(
      "Este PDF parece ser digitalizado (imagem escaneada, sem camada de texto). " +
      "O leitor nativo só lê PDFs gerados a partir de planilha/tabela (ex.: exportado do Excel/Google Sheets)."
    );
  }

  const today = new Date().toISOString().split("T")[0];
  const warnings: string[] = [];
  const payments: ParsedLaborPayment[] = [];
  let headerFound = false;
  let lastSupplier = ""; // herança para o caso "um prestador, várias parcelas"
  let autoSeq = 0;       // numeração automática quando a parcela não vem no PDF

  // Alguns documentos trazem o prestador FORA da tabela, num rótulo no topo
  // ("Empreiteiro: Fulano", "Prestador: Fulano ME"). Guardamos como fallback para
  // quando a tabela não tiver coluna de prestador.
  let documentSupplier = "";
  const supplierLabel = /(?:prestador|empreiteiro|fornecedor|contratad[oa]|credor|favorecido)\s*[:\-]\s*(.+)/i;
  for (const pageItems of items) {
    for (const it of pageItems) {
      const m = (it.str || "").match(supplierLabel);
      if (m && m[1].trim().length >= 2) {
        documentSupplier = m[1].trim().replace(/\s{2,}/g, " ");
        break;
      }
    }
    if (documentSupplier) break;
  }

  for (const pageItems of items) {
    const rows = groupItemsIntoRows(pageItems);
    const headerRow = findHeaderRow(rows);
    if (!headerRow) continue; // página sem tabela (capa, etc.)
    headerFound = true;

    const bounds = buildColumnBounds(headerRow);
    const hasValueCol = bounds.some((b) => b.key === "value");
    const headerIndex = rows.indexOf(headerRow);

    for (const row of rows.slice(headerIndex + 1)) {
      const rowText = norm(row.cells.map((c) => c.text).join(" "));

      // Pula cabeçalho repetido (relatórios longos) e linhas de total.
      const isRepeatedHeader = matchHeaderKeys(rowText).length >= 2 && /valor|parcela|data/.test(rowText);
      if (isRepeatedHeader) continue;
      if (TOTAL_ROW.test(rowText)) continue;

      const cells = assignRowToColumns(row, bounds);

      // Valor é o campo âncora: sem valor válido, não é uma parcela de pagamento.
      const value = hasValueCol ? parseBrazilianNumber(cells.value) : null;
      if (value === null || value <= 0) continue;

      // Prestador (com herança de célula mesclada, e fallback para o rótulo do documento).
      const supplierRaw = (cells.supplier || "").trim();
      let supplierName = supplierRaw || lastSupplier || documentSupplier;
      if (supplierRaw) {
        lastSupplier = supplierRaw;
      } else if (lastSupplier) {
        warnings.push(`Prestador herdado da linha anterior ("${lastSupplier}") — confira.`);
      } else if (documentSupplier) {
        // Nome veio do topo do documento — vale para todas as parcelas desta tabela.
      } else {
        supplierName = "";
      }

      // Parcela / descrição.
      let installment = (cells.installment || "").trim();
      if (!installment) {
        autoSeq += 1;
        installment = String(autoSeq);
      }

      // Data (na coluna, ou procurada em qualquer célula como fallback).
      let paymentDate = parseBrazilianDate(cells.date) || findAnyDate(cells);
      if (!paymentDate) {
        paymentDate = today;
        warnings.push(`Data não encontrada na parcela "${installment}" — usei a data de hoje, confira.`);
      }

      payments.push({
        supplierName: supplierName.trim(),
        installment,
        paymentDate,
        value,
      });
    }
  }

  if (!headerFound) {
    throw new Error(
      "Não encontrei uma tabela com cabeçalho (ex.: Prestador / Parcela / Data / Valor) neste PDF. " +
      "Confira se o documento tem colunas identificáveis."
    );
  }

  if (payments.length === 0) {
    throw new Error(
      "A tabela foi localizada, mas nenhuma parcela com valor válido foi extraída. " +
      "Confira o formato do documento ou tente a leitura assistida por IA."
    );
  }

  return { payments, warnings };
}
