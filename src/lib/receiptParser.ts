// src/lib/receiptParser.ts
// Parser interno de comprovantes brasileiros (PIX, TED, DOC, boleto, recibos e textos livres).
// Funciona 100% offline a partir do texto bruto (OCR ou camada de texto de PDF) — é o motor
// de extração usado quando o Gemini não está configurado ou falha.
// NÃO importar este arquivo em componentes React (uso no backend e em testes).

export interface ParsedReceipt {
  description: string;
  value: number | null;
  date: string; // YYYY-MM-DD
  type: 'entrada' | 'saida';
  category: string;
  payerName: string | null;
  payerDoc: string | null;
  receiverName: string | null;
  receiverDoc: string | null;
  documentNumber: string | null;
  confidence: number; // 0 a 1 — proporção de campos críticos encontrados
}

// ---------------------------------------------------------------------------
// Utilitários de normalização
// ---------------------------------------------------------------------------

const stripAccents = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
const norm = (s: string): string => stripAccents(s).toLowerCase();

interface Line {
  raw: string;
  norm: string;
}

function toLines(text: string): Line[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l) => l.length > 0)
    .map((raw) => ({ raw, norm: norm(raw) }));
}

// ---------------------------------------------------------------------------
// Valores monetários (formatos brasileiros)
// ---------------------------------------------------------------------------

interface MoneyMatch {
  value: number;
  lineIdx: number;
  charIdx: number;
}

/** Converte "1.540,50" / "1540,50" / "1.540" / "R$ 250" em número. */
function parseBrazilianAmount(raw: string): number | null {
  let s = raw.replace(/[^\d.,]/g, '');
  if (!s) return null;
  const hasComma = s.includes(',');
  const hasDot = s.includes('.');
  if (hasComma && hasDot) {
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
      // Formato brasileiro: ponto = milhar, vírgula = decimal
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      // Formato americano: vírgula = milhar
      s = s.replace(/,/g, '');
    }
  } else if (hasComma) {
    const dec = s.split(',')[1] || '';
    s = dec.length === 3 && s.split(',').length > 1 && /^\d{1,3}(,\d{3})+$/.test(s)
      ? s.replace(/,/g, '') // 1,540 estilo milhar
      : s.replace(',', '.');
  } else if (hasDot) {
    // "1.540" (milhar pt-BR) vs "1540.50" (decimal)
    if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
      s = s.replace(/\./g, '');
    }
  }
  const n = parseFloat(s);
  if (!isFinite(n) || n <= 0 || n > 100_000_000) return null;
  return Math.round(n * 100) / 100;
}

/** Coleta todos os candidatos a valor monetário do texto, linha a linha. */
function collectMoneyMatches(lines: Line[]): MoneyMatch[] {
  const matches: MoneyMatch[] = [];
  // 1) Com prefixo R$ (aceita valores sem centavos) | 2) padrão decimal brasileiro "1.234,56"
  const re = /(?:r\$\s*)(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)|(\b\d{1,3}(?:\.\d{3})*,\d{2}\b)/gi;
  lines.forEach((line, lineIdx) => {
    // Padrões de CPF/CNPJ/IDs não casam com o regex monetário (exigem vírgula decimal
    // ou prefixo R$), então não é preciso descartar essas linhas inteiras.
    let m: RegExpExecArray | null;
    re.lastIndex = 0;
    while ((m = re.exec(line.raw)) !== null) {
      const rawNum = m[1] || m[2];
      if (!rawNum) continue;
      const value = parseBrazilianAmount(rawNum);
      if (value !== null) {
        matches.push({ value, lineIdx, charIdx: m.index });
      }
    }
  });
  return matches;
}

const VALUE_KEYWORDS: string[] = [
  'valor pago',
  'valor da transacao',
  'valor da transferencia',
  'valor do pagamento',
  'valor recebido',
  'valor enviado',
  'valor total',
  'total pago',
  'total geral',
  'total a pagar',
  'valor do documento',
  'total',
  'valor',
];

function extractMainValue(lines: Line[]): number | null {
  const matches = collectMoneyMatches(lines);
  if (matches.length === 0) return null;

  for (const kw of VALUE_KEYWORDS) {
    for (let i = 0; i < lines.length; i++) {
      if (!lines[i].norm.includes(kw)) continue;
      // Evita casar "valor" em linhas de saldo/limite/tarifa
      if (/\b(saldo|limite|tarifa|juros|multa)\b/.test(lines[i].norm)) continue;
      // Procura valor na mesma linha ou nas 2 linhas seguintes
      for (let j = i; j <= Math.min(i + 2, lines.length - 1); j++) {
        const onLine = matches.filter((mm) => mm.lineIdx === j);
        if (onLine.length > 0) return onLine[0].value;
      }
    }
  }

  // Fallback: maior valor encontrado (ignorando linhas de saldo)
  const eligible = matches.filter((mm) => !/\b(saldo|limite)\b/.test(lines[mm.lineIdx].norm));
  const pool = eligible.length > 0 ? eligible : matches;
  return pool.reduce((best, cur) => (cur.value > best ? cur.value : best), 0) || null;
}

// ---------------------------------------------------------------------------
// Datas
// ---------------------------------------------------------------------------

const MONTHS_PT: Record<string, number> = {
  janeiro: 1, fevereiro: 2, marco: 3, abril: 4, maio: 5, junho: 6,
  julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
  jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6,
  jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12,
};

function buildIsoDate(day: number, month: number, year: number): string | null {
  if (year < 100) year += 2000;
  if (year < 1990 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function findDateInLine(line: Line): string | null {
  // dd/mm/yyyy, dd-mm-yyyy, dd.mm.yyyy, dd/mm/yy
  let m = line.raw.match(/\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})\b/);
  if (m) {
    const iso = buildIsoDate(parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10));
    if (iso) return iso;
  }
  // ISO yyyy-mm-dd
  m = line.raw.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (m) {
    const iso = buildIsoDate(parseInt(m[3], 10), parseInt(m[2], 10), parseInt(m[1], 10));
    if (iso) return iso;
  }
  // "12 de julho de 2026" / "12 julho 2026" / "12 JUL 2026"
  m = line.norm.match(/\b(\d{1,2})\s*(?:de\s+)?([a-z]{3,9})\.?\s*(?:de\s+)?(\d{2,4})\b/);
  if (m) {
    const month = MONTHS_PT[m[2]] ?? MONTHS_PT[m[2].slice(0, 3)];
    if (month) {
      const iso = buildIsoDate(parseInt(m[1], 10), month, parseInt(m[3], 10));
      if (iso) return iso;
    }
  }
  return null;
}

const DATE_KEYWORDS = [
  'data do pagamento',
  'data da transacao',
  'data da transferencia',
  'data de pagamento',
  'efetivada em',
  'efetivado em',
  'realizada em',
  'realizado em',
  'pago em',
  'recebido em',
  'data e hora',
  'data',
];

function extractDate(lines: Line[]): { date: string; found: boolean } {
  for (const kw of DATE_KEYWORDS) {
    for (let i = 0; i < lines.length; i++) {
      if (!lines[i].norm.includes(kw)) continue;
      for (let j = i; j <= Math.min(i + 1, lines.length - 1); j++) {
        const iso = findDateInLine(lines[j]);
        if (iso) return { date: iso, found: true };
      }
    }
  }
  for (const line of lines) {
    const iso = findDateInLine(line);
    if (iso) return { date: iso, found: true };
  }
  return { date: new Date().toISOString().split('T')[0], found: false };
}

// ---------------------------------------------------------------------------
// CPF / CNPJ (inclusive variantes mascaradas ***.123.456-** / •••.123.456-••)
// ---------------------------------------------------------------------------

const DOC_CHAR = '[\\d*•xX#]';
const CPF_RE = new RegExp(
  `${DOC_CHAR}{3}[.\\s]?${DOC_CHAR}{3}[.\\s]?${DOC_CHAR}{3}[-.\\s]?${DOC_CHAR}{2}(?!\\d)`
);
const CNPJ_RE = new RegExp(
  `${DOC_CHAR}{2}[.\\s]?${DOC_CHAR}{3}[.\\s]?${DOC_CHAR}{3}\\s?/\\s?${DOC_CHAR}{4}[-.\\s]?${DOC_CHAR}{2}(?!\\d)`
);

function findDocInLine(raw: string): string | null {
  const cnpj = raw.match(CNPJ_RE);
  if (cnpj && /\d{4,}/.test(cnpj[0].replace(/\D/g, ''))) return cnpj[0].trim();
  const cpf = raw.match(CPF_RE);
  if (cpf) {
    const digits = cpf[0].replace(/\D/g, '');
    // Exige pelo menos 3 dígitos reais (evita casar máscaras totalmente ocultas ou datas)
    if (digits.length >= 3 && !/\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}/.test(cpf[0])) {
      return cpf[0].trim();
    }
  }
  // CPF/CNPJ sem formatação após rótulo
  const labeled = raw.match(/\b(?:CPF|CNPJ)\b\D{0,5}(\d{11}|\d{14})\b/i);
  if (labeled) return labeled[1];
  return null;
}

// ---------------------------------------------------------------------------
// Partes (pagador / recebedor)
// ---------------------------------------------------------------------------

const PAYER_HEADER_RE = /^(?:dados\s+d[eoa]\s+|informacoes\s+d[eoa]\s+)?(pagador|origem|remetente|debitado\s+de|quem\s+pagou|quem\s+fez\s+o\s+pagamento|pago\s+por|de\s+quem|conta\s+de\s+origem|dados\s+do\s+pagador|enviado\s+por)\b/;
const RECEIVER_HEADER_RE = /^(?:dados\s+d[eoa]\s+|informacoes\s+d[eoa]\s+)?(recebedor|beneficiario|favorecido|destinatario|destino|creditado(?:\s+em)?|quem\s+recebeu|quem\s+esta\s+recebendo|recebido\s+por|para\s+quem|conta\s+de\s+destino)\b/;
// "De" / "Para" isolados (Nubank, Mercado Pago) — precisam ser a linha inteira
const PAYER_SOLO_RE = /^de$/;
const RECEIVER_SOLO_RE = /^para$/;

const SECTION_BREAK_RE = /^(sobre\s+a\s+transacao|dados\s+da\s+transacao|transacao|autenticacao|informacoes\s+adicionais|descricao|mensagem|tarifa|id\s+da\s+transacao|identificador|comprovante|valor|data)\b/;

const NAME_BLACKLIST_RE = /^(instituicao|banco\b|agencia|ag\b|conta\b|cpf|cnpj|chave\s+pix|chave\b|tipo\s+de\s+conta|tipo\b|valor|data\b|hora\b|id\b|e2e|ispb|codigo|numero|n[o°º]\b|telefone|celular|email|e-mail)/;

function looksLikeName(line: Line): boolean {
  if (line.raw.length < 3 || line.raw.length > 80) return false;
  if (NAME_BLACKLIST_RE.test(line.norm)) return false;
  if (/\d{4,}/.test(line.raw)) return false; // muitos dígitos: não é nome
  if (!/[a-zA-ZÀ-ÿ]{2,}/.test(line.raw)) return false;
  return true;
}

function cleanName(raw: string): string {
  return raw
    .replace(/\s{2,}/g, ' ')
    .replace(/[|_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

interface Party {
  name: string | null;
  doc: string | null;
}

/**
 * Extrai nome e documento a partir da linha do cabeçalho da seção
 * (ex.: "Destino", "Dados do pagador", "Para: Fulano").
 */
function extractPartyFromSection(lines: Line[], headerIdx: number, headerRe: RegExp | null): Party {
  const party: Party = { name: null, doc: null };
  const header = lines[headerIdx];

  // Valor inline após o cabeçalho: "Pagador: João da Silva" / "De João da Silva"
  let inline = '';
  if (headerRe) {
    const m = header.norm.match(headerRe);
    if (m) {
      inline = header.raw.slice(header.norm.indexOf(m[1]) + m[1].length).replace(/^[\s:\-–]+/, '').trim();
    }
  }
  if (inline) {
    const doc = findDocInLine(inline);
    if (doc) {
      party.doc = doc;
      inline = inline.replace(doc, '').replace(/[\s:\-–()]+$/, '').replace(/\b(cpf|cnpj)\b\W*$/i, '').trim();
    }
    if (inline && looksLikeName({ raw: inline, norm: norm(inline) })) {
      party.name = cleanName(inline);
    }
  }

  // Varre as linhas seguintes da seção
  const maxScan = Math.min(headerIdx + 7, lines.length - 1);
  for (let i = headerIdx + 1; i <= maxScan; i++) {
    const line = lines[i];
    if (PAYER_HEADER_RE.test(line.norm) || RECEIVER_HEADER_RE.test(line.norm) ||
        PAYER_SOLO_RE.test(line.norm) || RECEIVER_SOLO_RE.test(line.norm) ||
        SECTION_BREAK_RE.test(line.norm)) {
      break;
    }
    if (!party.doc) {
      const doc = findDocInLine(line.raw);
      if (doc) party.doc = doc;
    }
    if (!party.name) {
      // Rótulo "Nome" (com ou sem valor na mesma linha)
      const nameLabel = line.norm.match(/^nome(?:\s+(?:completo|d[oa]\s+\w+))?\b/);
      if (nameLabel) {
        let value = line.raw.slice(nameLabel[0].length).replace(/^[\s:\-–]+/, '').trim();
        if (!value && i + 1 <= maxScan) {
          const next = lines[i + 1];
          if (looksLikeName(next)) value = next.raw;
        }
        if (value) {
          const doc = findDocInLine(value);
          if (doc && !party.doc) party.doc = doc;
          const nameOnly = doc ? value.replace(doc, '').replace(/\b(cpf|cnpj)\b\W*$/i, '').trim() : value;
          if (nameOnly) party.name = cleanName(nameOnly);
          continue;
        }
      }
      // Primeira linha "com cara de nome" da seção
      if (looksLikeName(line)) {
        party.name = cleanName(line.raw);
      }
    }
  }
  return party;
}

function extractParties(lines: Line[]): { payer: Party; receiver: Party } {
  let payer: Party = { name: null, doc: null };
  let receiver: Party = { name: null, doc: null };

  for (let i = 0; i < lines.length; i++) {
    const n = lines[i].norm;
    if (!receiver.name || !receiver.doc) {
      if (RECEIVER_HEADER_RE.test(n) || RECEIVER_SOLO_RE.test(n)) {
        const found = extractPartyFromSection(lines, i, RECEIVER_HEADER_RE.test(n) ? RECEIVER_HEADER_RE : null);
        receiver = { name: receiver.name || found.name, doc: receiver.doc || found.doc };
        continue;
      }
    }
    if (!payer.name || !payer.doc) {
      if (PAYER_HEADER_RE.test(n) || PAYER_SOLO_RE.test(n)) {
        const found = extractPartyFromSection(lines, i, PAYER_HEADER_RE.test(n) ? PAYER_HEADER_RE : null);
        payer = { name: payer.name || found.name, doc: payer.doc || found.doc };
      }
    }
  }

  // Formatos inline "Para: Fulano" / "De: Beltrano" em qualquer lugar do texto
  if (!receiver.name) {
    for (const line of lines) {
      const m = line.norm.match(/^para[:\s]\s*(.+)$/);
      if (m) {
        const value = line.raw.slice(line.raw.length - m[1].length).trim();
        if (looksLikeName({ raw: value, norm: norm(value) })) {
          receiver.name = cleanName(value);
          break;
        }
      }
    }
  }
  if (!payer.name) {
    for (const line of lines) {
      const m = line.norm.match(/^de[:\s]\s*(.+)$/);
      if (m) {
        const value = line.raw.slice(line.raw.length - m[1].length).trim();
        if (looksLikeName({ raw: value, norm: norm(value) })) {
          payer.name = cleanName(value);
          break;
        }
      }
    }
  }

  // "Você pagou R$ 95,00 para" seguido do nome na linha de baixo (PicPay e similares)
  if (!receiver.name) {
    for (let i = 0; i < lines.length - 1; i++) {
      if (/(?:pagou|enviou|transferiu)\b.*\bpara:?$/.test(lines[i].norm)) {
        const next = lines[i + 1];
        if (looksLikeName(next)) {
          receiver.name = cleanName(next.raw);
          break;
        }
      }
    }
  }

  // Textos livres (orçamento de WhatsApp etc.): tenta achar um fornecedor/prestador
  if (!receiver.name) {
    for (const line of lines) {
      const m = line.norm.match(/^(?:orcamento|or[cç]amento)\s*(?:de|do|da|[-–:])?\s*(.+)$/) ||
                line.norm.match(/^(?:fornecedor|prestador|profissional|empresa)\s*[:\-–]?\s*(.+)$/);
      if (m && m[1]) {
        const value = line.raw.slice(line.raw.length - m[1].length).trim();
        if (looksLikeName({ raw: value, norm: norm(value) })) {
          receiver.name = cleanName(value);
          break;
        }
      }
    }
  }

  return { payer, receiver };
}

// ---------------------------------------------------------------------------
// Número do comprovante / transação
// ---------------------------------------------------------------------------

const DOCNUM_KEYWORDS_RE = /(id\s+da\s+transacao|id\s+transacao|id\/transacao|identificador(?:\s+da\s+transacao)?|codigo\s+de\s+autenticacao|autenticacao(?:\s+mecanica|\s+eletronica|\s+bancaria)?|numero\s+do\s+documento|n[o°º.]?\s*do\s+documento|numero\s+do\s+comprovante|numero\s+d[ea]\s+operacao|numero\s+de\s+controle|controle|protocolo|codigo\s+da\s+transacao|id\s+pix|nosso\s+numero)/;

function extractDocumentNumber(lines: Line[]): string | null {
  // 1) E2E ID do PIX: "E" + ISPB + timestamp + sequencial (~32 caracteres)
  for (const line of lines) {
    const m = line.raw.match(/\bE\d{8}[0-9a-zA-Z]{15,28}\b/);
    if (m) return m[0];
  }
  // 2) Token após palavra-chave (mesma linha ou seguinte)
  for (let i = 0; i < lines.length; i++) {
    const kw = lines[i].norm.match(DOCNUM_KEYWORDS_RE);
    if (!kw) continue;
    const kwEnd = lines[i].norm.indexOf(kw[0]) + kw[0].length;
    const candidates = [lines[i].raw.slice(kwEnd), lines[i + 1]?.raw || ''];
    for (const chunk of candidates) {
      const token = chunk.match(/[A-Za-z0-9][A-Za-z0-9.\-\/]{5,}/);
      if (!token) continue;
      const t = token[0].replace(/[.,;:]+$/, '');
      // Rejeita datas e valores monetários
      if (/^\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}$/.test(t)) continue;
      if (/^\d{1,3}(\.\d{3})*,\d{2}$/.test(t)) continue;
      if (!/\d/.test(t)) continue;
      return t;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Tipo (entrada/saída) e categoria
// ---------------------------------------------------------------------------

function extractType(fullNorm: string): 'entrada' | 'saida' {
  const entradaSignals = [
    'transferencia recebida', 'pix recebido', 'voce recebeu', 'pagamento recebido',
    'recebimento', 'deposito recebido', 'recibo de deposito', 'credito em conta',
    'deposito em conta', 'entrada de valor',
  ];
  const saidaSignals = [
    'comprovante de pagamento', 'transferencia enviada', 'pix enviado', 'voce pagou',
    'pagamento efetuado', 'pagamento realizado', 'compra aprovada', 'debito em conta',
    'boleto', 'pagamento de', 'enviou um pix', 'transferencia efetuada',
  ];
  for (const sig of entradaSignals) {
    if (fullNorm.includes(sig)) return 'entrada';
  }
  for (const sig of saidaSignals) {
    if (fullNorm.includes(sig)) return 'saida';
  }
  return 'saida';
}

const EXIT_CATEGORY_RULES: { category: string; patterns: RegExp[] }[] = [
  {
    category: 'impostos',
    patterns: [
      /\bdarf\b/, /\bgps\b/, /\binss\b/, /\bfgts\b/, /\biss\b/, /\bissqn\b/, /\biptu\b/,
      /\bimposto\b/, /\btributo\b/, /simples nacional/, /receita federal/, /\bprefeitura\b/,
      /\bsefaz\b/, /documento de arrecadacao/, /\bdas\b[\s\-]*(mei|simples)?\s*\d*/,
      /\bdae\b/, /\btaxa municipal\b/,
    ],
  },
  {
    category: 'utilidades',
    patterns: [
      /\benergia\b/, /\beletrica\b/, /\benel\b/, /\bcemig\b/, /\bcopel\b/, /\bcelesc\b/,
      /\bcpfl\b/, /\blight\b/, /\bequatorial\b/, /\bagua\b/, /\bsaneamento\b/, /\bsabesp\b/,
      /\bsanepar\b/, /\bembasa\b/, /\binternet\b/, /banda larga/, /\bfibra\b/, /\btelefonia\b/,
      /\btelefone\b/, /\bvivo\b/, /\bclaro\b/, /\btim\b/, /\bnet\b/, /conta de luz/,
    ],
  },
  {
    category: 'softwares',
    patterns: [
      /\bautodesk\b/, /\bautocad\b/, /\brevit\b/, /\bsketchup\b/, /\badobe\b/, /\bsoftware\b/,
      /\blicenca\b/, /\bmicrosoft\b/, /\bgoogle workspace\b/, /\bcanva\b/, /\bfigma\b/,
      /\blumion\b/, /\benscape\b/,
    ],
  },
  {
    category: 'aluguel_escritorio',
    patterns: [/\baluguel\b/, /\blocacao\b/, /\bcondominio\b/, /\bimobiliaria\b/, /\blocador\b/],
  },
  {
    category: 'pro_labore',
    patterns: [/pro[\s\-]?labore/, /retirada de socio/],
  },
  {
    category: 'colaboradores',
    patterns: [
      /\bsalario\b/, /\bhonorario/, /folha de pagamento/, /\bpedreiro\b/, /mestre de obras/,
      /\bservente\b/, /\bestagiario\b/, /\bfreelancer\b/, /prestador de servico/, /\bdiaria\b/,
      /mao de obra/, /\bempreiteiro\b/, /\bpagamento de funcionario/,
    ],
  },
  {
    category: 'marketing',
    patterns: [
      /\banuncio\b/, /\bpublicidade\b/, /\bmarketing\b/, /google ads/, /meta ads/,
      /\bfacebook\b/, /\binstagram\b/, /\bimpulsionamento\b/, /\bgrafica\b/, /\bdivulgacao\b/,
      /trafego pago/,
    ],
  },
];

const ENTRY_CATEGORY_RULES: { category: string; patterns: RegExp[] }[] = [
  {
    category: 'taxa_gestao',
    patterns: [/taxa de gestao/, /gestao de obra/, /\bgerenciamento\b/, /administracao de obra/],
  },
  {
    category: 'consultoria',
    patterns: [/\bconsultoria\b/, /\bvistoria\b/, /\blaudo\b/, /\bparecer\b/, /\bassessoria\b/],
  },
  {
    category: 'servico_projeto',
    patterns: [/\bprojeto\b/, /\barquitetura\b/, /\barquitetonico\b/, /\binteriores\b/],
  },
];

function extractCategory(fullNorm: string, type: 'entrada' | 'saida'): string {
  const rules = type === 'entrada' ? ENTRY_CATEGORY_RULES : EXIT_CATEGORY_RULES;
  for (const rule of rules) {
    for (const p of rule.patterns) {
      if (p.test(fullNorm)) return rule.category;
    }
  }
  return type === 'entrada' ? 'outras_entradas' : 'outras_saidas';
}

// ---------------------------------------------------------------------------
// Descrição sintetizada
// ---------------------------------------------------------------------------

function buildDescription(
  fullNorm: string,
  type: 'entrada' | 'saida',
  payer: Party,
  receiver: Party
): string {
  let instrument: 'pix' | 'ted' | 'doc' | 'boleto' | 'transferencia' | 'outro' = 'outro';
  if (/\bpix\b/.test(fullNorm)) instrument = 'pix';
  else if (/\bted\b/.test(fullNorm)) instrument = 'ted';
  else if (/\bdoc\b/.test(fullNorm) && /transferencia|comprovante/.test(fullNorm)) instrument = 'doc';
  else if (/\bboleto\b/.test(fullNorm)) instrument = 'boleto';
  else if (/transferencia/.test(fullNorm)) instrument = 'transferencia';

  if (type === 'saida') {
    const target = receiver.name;
    switch (instrument) {
      case 'pix':
        return target ? `PIX para ${target}` : 'Pagamento via PIX';
      case 'ted':
        return target ? `TED para ${target}` : 'Transferência TED enviada';
      case 'doc':
        return target ? `DOC para ${target}` : 'Transferência DOC enviada';
      case 'boleto':
        return target ? `Pagamento de boleto - ${target}` : 'Pagamento de boleto';
      case 'transferencia':
        return target ? `Transferência para ${target}` : 'Transferência enviada';
      default:
        return target ? `Pagamento para ${target}` : 'Pagamento (comprovante anexado)';
    }
  } else {
    const source = payer.name;
    switch (instrument) {
      case 'pix':
        return source ? `PIX recebido de ${source}` : 'Recebimento via PIX';
      case 'ted':
        return source ? `TED recebida de ${source}` : 'Transferência TED recebida';
      case 'transferencia':
        return source ? `Transferência recebida de ${source}` : 'Transferência recebida';
      default:
        return source ? `Recebimento de ${source}` : 'Recebimento (comprovante anexado)';
    }
  }
}

// ---------------------------------------------------------------------------
// Função principal
// ---------------------------------------------------------------------------

export function parseReceiptText(rawText: string): ParsedReceipt {
  const lines = toLines(rawText || '');
  const fullNorm = norm(rawText || '');

  const value = extractMainValue(lines);
  const { date, found: dateFound } = extractDate(lines);
  const { payer, receiver } = extractParties(lines);
  const documentNumber = extractDocumentNumber(lines);
  const type = extractType(fullNorm);
  const category = extractCategory(fullNorm, type);
  const description = buildDescription(fullNorm, type, payer, receiver);

  // Confiança proporcional aos campos críticos encontrados
  let confidence = 0;
  if (value !== null) confidence += 0.35;
  if (dateFound) confidence += 0.15;
  if (payer.name || payer.doc) confidence += 0.15;
  if (receiver.name || receiver.doc) confidence += 0.15;
  if (documentNumber) confidence += 0.2;
  confidence = Math.round(confidence * 100) / 100;

  return {
    description,
    value,
    date,
    type,
    category,
    payerName: payer.name,
    payerDoc: payer.doc,
    receiverName: receiver.name,
    receiverDoc: receiver.doc,
    documentNumber,
    confidence,
  };
}
