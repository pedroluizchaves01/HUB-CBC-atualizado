import { jsPDF } from 'jspdf';
import { Contract, Project } from '../types';
import { CBC_FIXED_DATA, ContractParagraph, buildContractDocument, buildSignatureBlocks } from './contractTemplates';
import { LOGO_STACKED_ASPECT, LOGO_STACKED_BLACK } from './brandLogoStacked';
import { POPPINS_FAMILY, registerPoppinsFamily } from './poppinsContractFonts';
import { uploadBase64ToFirebase } from './firebaseStorage';

// =====================================================================
// PDF do contrato — identidade visual CBC (Poppins, bronze #C5A880, logo empilhado)
// Layout próprio (texto justificado, negrito/itálico inline, listas com recuo suspenso),
// 100% determinístico: o mesmo código gera o PDF no navegador e, no futuro, no servidor.
// =====================================================================

const PAGE_W = 210;
const MX = 17; // margem lateral
const CONTENT_W = PAGE_W - MX * 2;
const FIRST_PAGE_TOP = 73; // início do texto na 1ª página (abaixo do cabeçalho + título)
const NEXT_PAGE_TOP = 20;
const BOTTOM = 275; // limite do texto (rodapé começa em 281)

const BODY_SIZE = 9;
const LINE_H = 5;

type RGB = [number, number, number];
const INK: RGB = [24, 24, 27];
const BODY: RGB = [39, 39, 42];
const MUTED: RGB = [113, 113, 122];
const RULE: RGB = [228, 228, 231];
const BRONZE: RGB = [197, 168, 128];
const BRONZE_TEXT: RGB = [150, 118, 72]; // bronze escurecido p/ texto pequeno (contraste)

type Style = 'normal' | 'italic' | 'medium' | 'bold';
interface Seg { t: string; b: boolean; i: boolean }
interface Word { segs: Seg[]; w: number }

// ---------- marcação inline: **negrito** e ~~itálico~~ ----------
function parseMarkup(text: string, baseBold = false): Seg[] {
  const segs: Seg[] = [];
  let bold = false;
  let italic = false;
  let buf = '';
  const flush = () => {
    if (buf) segs.push({ t: buf, b: baseBold || bold, i: italic });
    buf = '';
  };
  for (let k = 0; k < text.length; k++) {
    if (text[k] === '*' && text[k + 1] === '*') { flush(); bold = !bold; k++; continue; }
    if (text[k] === '~' && text[k + 1] === '~') { flush(); italic = !italic; k++; continue; }
    buf += text[k];
  }
  flush();
  return segs;
}

function formatDatePt(iso: string | undefined): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return iso;
  const meses = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const mi = parseInt(m, 10) - 1;
  return `${parseInt(d, 10)} de ${meses[mi] ?? m} de ${y}`;
}

function formatDateShort(iso: string | undefined): string {
  if (!iso) return '__/__/____';
  const [y, m, d] = iso.split('-');
  return y && m && d ? `${d}/${m}/${y}` : iso;
}

export function generateContractPdf(contract: Contract, _project: Project | undefined): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  const data = contract.data;
  const document_ = buildContractDocument(contract.type, data);
  const hasPoppins = registerPoppinsFamily(doc);

  // ---------- fonte ----------
  const setFont = (style: Style) => {
    if (hasPoppins) doc.setFont(POPPINS_FAMILY, style);
    else doc.setFont('helvetica', style === 'bold' || style === 'medium' ? 'bold' : style);
  };
  const color = (c: RGB) => doc.setTextColor(c[0], c[1], c[2]);

  const widthCache = new Map<string, number>();
  const textWidth = (t: string, style: Style, size: number): number => {
    const key = `${style}|${size}|${t}`;
    let w = widthCache.get(key);
    if (w === undefined) {
      setFont(style);
      doc.setFontSize(size);
      w = doc.getTextWidth(t);
      widthCache.set(key, w);
    }
    return w;
  };
  const segStyle = (s: Seg): Style => (s.b ? 'bold' : s.i ? 'italic' : 'normal');

  // Texto com espaçamento entre letras (rótulos em caixa-alta)
  const spacedWidth = (t: string, style: Style, size: number, cs: number) => textWidth(t, style, size) + t.length * cs;
  const drawSpaced = (t: string, x: number, y: number, style: Style, size: number, cs: number, col: RGB, align: 'left' | 'center' | 'right' = 'left') => {
    const w = spacedWidth(t, style, size, cs);
    const sx = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
    setFont(style);
    doc.setFontSize(size);
    color(col);
    doc.text(t, sx, y, { charSpace: cs });
  };
  const draw = (t: string, x: number, y: number, style: Style, size: number, col: RGB, align: 'left' | 'center' | 'right' = 'left') => {
    setFont(style);
    doc.setFontSize(size);
    color(col);
    doc.text(t, x, y, { align });
  };
  const fitText = (t: string, style: Style, size: number, maxW: number): string => {
    if (textWidth(t, style, size) <= maxW) return t;
    let s = t;
    while (s.length > 1 && textWidth(s + '…', style, size) > maxW) s = s.slice(0, -1);
    return s.trimEnd() + '…';
  };
  const hline = (y: number, col: RGB, lw: number, x1 = MX, x2 = PAGE_W - MX) => {
    doc.setDrawColor(col[0], col[1], col[2]);
    doc.setLineWidth(lw);
    doc.line(x1, y, x2, y);
  };

  // ---------- páginas ----------
  let page = 1;
  let y = FIRST_PAGE_TOP;

  const watermark = () => {
    try {
      const w = 118;
      const h = w / LOGO_STACKED_ASPECT;
      const g = new (doc as any).GState({ opacity: 0.035 });
      doc.saveGraphicsState();
      doc.setGState(g);
      doc.addImage(LOGO_STACKED_BLACK, 'JPEG', (PAGE_W - w) / 2, (297 - h) / 2 - 6, w, h, undefined, 'FAST');
      doc.restoreGraphicsState();
    } catch {
      /* sem marca d'água se o ambiente não suportar transparência */
    }
  };

  const newPage = () => {
    doc.addPage();
    page += 1;
    watermark();
    y = NEXT_PAGE_TOP;
  };
  const ensureSpace = (needed: number) => {
    if (y + needed > BOTTOM) newPage();
  };

  // ---------- cabeçalho da 1ª página ----------
  watermark();
  {
    const logoW = 25;
    const logoH = logoW / LOGO_STACKED_ASPECT;
    try {
      doc.addImage(LOGO_STACKED_BLACK, 'JPEG', MX - 1.5, 10, logoW, logoH, undefined, 'FAST');
    } catch {
      draw('CHAVES BRITES CORREA', MX, 18, 'bold', 11, INK);
    }
    const rx = PAGE_W - MX;
    draw('CHAVES BRITES CORREA', rx, 15, 'bold', 7.5, INK, 'right');
    draw(`CNPJ: ${CBC_FIXED_DATA.cnpj}`, rx, 19.2, 'normal', 7, BODY, 'right');
    draw(`Contato: ${CBC_FIXED_DATA.phone.replace(/[()]/g, '').replace('-', ' ')} | ${CBC_FIXED_DATA.email}`, rx, 23.4, 'normal', 7, BODY, 'right');

    // faixa de metadados
    const colWs = [46, 46, 50, 34];
    const colX = [MX, MX + 46, MX + 92, MX + 142];
    const areaData = `${data.areaM2 || '__'} m² | ${formatDateShort(data.dataAssinatura)}`;
    const meta: [string, string][] = [
      ['CONTRATANTE', data.contratante.name || '_______________'],
      ['TIPO DE MINUTA', document_.minutaLabel],
      ['LOCAL DO OBJETO', data.localObjeto || '_______________'],
      ['ÁREA E DATA', areaData],
    ];
    meta.forEach(([label, value], i) => {
      const x = colX[i];
      const maxW = colWs[i] - 4;
      drawSpaced(label, x, 39.5, 'medium', 5.8, 0.25, MUTED);
      setFont('bold');
      doc.setFontSize(7.3);
      let lines: string[] = doc.splitTextToSize(value, maxW);
      if (lines.length > 2) lines = [lines[0], fitText(lines.slice(1).join(' '), 'bold', 7.3, maxW)];
      lines.forEach((l, k) => draw(l, x, 44 + k * 3.7, 'bold', 7.3, INK));
    });
    hline(52, RULE, 0.25);

    // título (maior tamanho que caiba em uma linha)
    let size = 14;
    while (size > 10 && textWidth(document_.title, 'bold', size) > CONTENT_W) size -= 0.5;
    if (textWidth(document_.title, 'bold', size) <= CONTENT_W) {
      draw(document_.title, MX, 62, 'bold', size, INK);
      hline(66.5, BRONZE, 0.8);
    } else {
      setFont('bold');
      doc.setFontSize(12);
      const lines: string[] = doc.splitTextToSize(document_.title, CONTENT_W);
      lines.forEach((l, i) => draw(l, MX, 61 + i * 6, 'bold', 12, INK));
      hline(61 + (lines.length - 1) * 6 + 4.5, BRONZE, 0.8);
      y = FIRST_PAGE_TOP + (lines.length - 1) * 6;
    }
  }

  // ---------- parágrafos com texto rico justificado ----------
  const tokenize = (segs: Seg[], size: number): Word[] => {
    const words: Word[] = [];
    let cur: Seg[] = [];
    const push = () => {
      if (!cur.length) return;
      const w = cur.reduce((acc, s) => acc + textWidth(s.t, segStyle(s), size), 0);
      words.push({ segs: cur, w });
      cur = [];
    };
    for (const seg of segs) {
      const parts = seg.t.split(/(\s+)/);
      for (const part of parts) {
        if (!part) continue;
        if (/^\s+$/.test(part)) push();
        else cur.push({ t: part, b: seg.b, i: seg.i });
      }
    }
    push();
    return words;
  };

  const breakLines = (words: Word[], maxW: number, size: number): Word[][] => {
    const space = textWidth(' ', 'normal', size);
    const lines: Word[][] = [];
    let line: Word[] = [];
    let lw = 0;
    for (const w of words) {
      const add = line.length ? space + w.w : w.w;
      if (line.length && lw + add > maxW) {
        lines.push(line);
        line = [w];
        lw = w.w;
      } else {
        line.push(w);
        lw += add;
      }
    }
    if (line.length) lines.push(line);
    return lines;
  };

  const drawLine = (line: Word[], x: number, yy: number, maxW: number, size: number, justify: boolean) => {
    const space = textWidth(' ', 'normal', size);
    const total = line.reduce((a, w) => a + w.w, 0);
    let gap = space;
    if (justify && line.length > 1) {
      const g = (maxW - total) / (line.length - 1);
      if (g >= space * 0.6 && g <= space * 3.2) gap = g; // evita buracos exagerados
    }
    let cx = x;
    color(BODY);
    for (const w of line) {
      for (const s of w.segs) {
        setFont(segStyle(s));
        doc.setFontSize(size);
        doc.text(s.t, cx, yy);
        cx += textWidth(s.t, segStyle(s), size);
      }
      cx += gap;
    }
  };

  let prevTight = false;
  const writeParagraph = (p: ContractParagraph) => {
    const o = typeof p === 'string' ? ({ text: p } as Exclude<ContractParagraph, string>) : p;
    if (!o.text) return;
    const isGroup = !!o.group;
    const size = isGroup ? 9.5 : BODY_SIZE;
    const indent = o.indent ?? 0;
    const marker = o.marker;
    const tight = !!o.tight;
    const numeric = !!marker && /^\d/.test(marker);
    const hang = marker ? (numeric ? 6.5 : 4.2) : 0;
    const x0 = MX + indent;
    const textX = x0 + hang;
    const maxW = CONTENT_W - indent - hang;

    const words = tokenize(parseMarkup(o.text, isGroup || !!o.bold), size);
    const lines = breakLines(words, maxW, size);
    if (prevTight && !o.tight && !o.marker) y += 1.8; // respiro depois de uma lista
    prevTight = tight;
    if (isGroup) {
      y += 2.5;
      ensureSpace(LINE_H * 3); // cabeçalho de grupo nunca fica sozinho no fim da página
    }

    let i = 0;
    while (i < lines.length) {
      const room = Math.floor((BOTTOM - y) / LINE_H);
      const remaining = lines.length - i;
      let chunk = Math.min(room, remaining);
      // evita linha viúva/órfã: nunca deixa 1 linha sozinha no fim nem no começo da página
      if (chunk < remaining && remaining - chunk === 1) chunk -= 1;
      if (chunk < 2 && remaining > 1) chunk = 0;
      if (chunk <= 0) {
        newPage();
        continue;
      }
      for (let k = 0; k < chunk; k++) {
        const idx = i + k;
        if (idx === 0 && marker) {
          setFont(numeric ? 'bold' : 'normal');
          doc.setFontSize(size);
          color(BODY);
          doc.text(marker, x0, y);
        }
        const last = idx === lines.length - 1;
        drawLine(lines[idx], textX, y, maxW, size, !last && !isGroup);
        y += LINE_H;
      }
      i += chunk;
    }
    y += tight ? 1.2 : 2.8;
  };

  // ---------- seções / cláusulas ----------
  let firstSection = true;
  for (const section of document_.sections) {
    ensureSpace(34); // título + 2 primeiras linhas juntos
    if (!firstSection && y > NEXT_PAGE_TOP + 0.5) {
      y += 1;
      hline(y, INK, 0.25);
      y += 8;
    } else {
      y += 1;
    }
    firstSection = false;

    // título da seção: barra bronze ao lado + texto em caixa-alta espaçada
    const hSize = 9.6;
    const hTop = y - 4.6;
    setFont('bold');
    doc.setFontSize(hSize);
    const headLines: string[] = doc.splitTextToSize(section.heading, CONTENT_W - 6);
    const hHeight = 6.6 + (headLines.length - 1) * 4.8;
    doc.setFillColor(BRONZE[0], BRONZE[1], BRONZE[2]);
    doc.rect(MX, hTop, 0.9, hHeight, 'F');
    headLines.forEach((l, k) => drawSpaced(l, MX + 4, y + k * 4.8, 'bold', hSize, 0.15, INK));
    y += hHeight - 1.2 + 5;

    prevTight = false;
    for (const p of section.paragraphs) writeParagraph(p);
  }

  // ---------- assinaturas ----------
  const signers = buildSignatureBlocks(contract.type, data);
  const signRows = Math.ceil(signers.length / 2);
  const witnessesHeight = 38;
  const blockHeight = 8 + 6 + 10 + signRows * 46 + witnessesHeight;
  if (y + blockHeight > BOTTOM + 4) newPage();
  else y += 4;

  hline(y, RULE, 0.25);
  y += 9;
  drawSpaced('ASSINATURA DAS PARTES CONTRATANTES', PAGE_W / 2, y, 'medium', 7.2, 0.45, MUTED, 'center');
  y += 9;
  draw(`${data.localAssinatura || 'Campo Grande - MS'}, ${formatDatePt(data.dataAssinatura)}.`, PAGE_W / 2, y, 'normal', 9, BODY, 'center');
  y += 8;

  const colCenter = (c: number) => MX + CONTENT_W * (c === 0 ? 0.25 : 0.75);
  signers.forEach((s, idx) => {
    const row = Math.floor(idx / 2);
    const alone = idx === signers.length - 1 && signers.length % 2 === 1;
    const cx = alone ? PAGE_W / 2 : colCenter(idx % 2);
    const top = y + row * 46;
    const lineW = 68;
    hline(top + 20, INK, 0.25, cx - lineW / 2, cx + lineW / 2);
    const nm = fitText(s.name.toUpperCase(), 'bold', 7, 84);
    draw(nm, cx, top + 25, 'bold', 7, INK, 'center');
    draw(`CPF/CNPJ: ${s.doc}`, cx, top + 29.4, 'normal', 7, MUTED, 'center');
    drawSpaced(s.role, cx, top + 33.8, 'medium', 6.2, 0.3, BRONZE_TEXT, 'center');
  });
  y += signRows * 46 + 2;

  // testemunhas
  drawSpaced('TESTEMUNHAS OBRIGATÓRIAS', PAGE_W / 2, y, 'medium', 7.2, 0.45, MUTED, 'center');
  y += 12;
  for (let n = 0; n < 2; n++) {
    const t = data.testemunhas?.[n];
    const x = MX + n * (CONTENT_W / 2) + (n === 1 ? 6 : 0);
    const w = CONTENT_W / 2 - 6;
    const labelNome = `${n + 1}) Nome:`;
    const labelDoc = 'CPF/RG:';
    const lx = x + textWidth(labelNome, 'normal', 8) + 2;
    draw(labelNome, x, y, 'normal', 8, BODY);
    hline(y + 0.8, INK, 0.2, lx, x + w);
    if (t?.name?.trim()) draw(fitText(t.name.trim(), 'normal', 8, x + w - lx - 1), lx + 1, y - 0.4, 'normal', 8, BODY);
    const ly = y + 8;
    draw(labelDoc, x, ly, 'normal', 8, BODY);
    const dx = x + textWidth(labelDoc, 'normal', 8) + 2;
    hline(ly + 0.8, INK, 0.2, dx, x + w);
    if (t?.cpfCnpj?.trim()) draw(fitText(t.cpfCnpj.trim(), 'normal', 8, x + w - dx - 1), dx + 1, ly - 0.4, 'normal', 8, BODY);
  }

  // ---------- rodapé em todas as páginas ----------
  const total = (doc as any).internal.getNumberOfPages();
  const contractNo = `Contrato nº ${contract.number.toString().padStart(2, '0')}`;
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    hline(281.5, RULE, 0.25);
    drawSpaced('CHAVES BRITES CORREA | ARQUITETURA E ENGENHARIA', MX, 286, 'medium', 6.3, 0.12, INK);
    draw(
      `CNPJ ${CBC_FIXED_DATA.cnpj}  •  ${CBC_FIXED_DATA.phone}  •  ${CBC_FIXED_DATA.email}  •  @chavesbritescorrea`,
      MX, 289.8, 'normal', 5.8, MUTED
    );
    draw(`Página ${p} de ${total}`, PAGE_W - MX, 286, 'bold', 6.5, INK, 'right');
    draw(contractNo, PAGE_W - MX, 289.8, 'normal', 5.8, MUTED, 'right');
  }

  return doc;
}

export function buildContractPdfFileName(contract: Contract): string {
  const typeLabelSlug = contract.type.replace(/_/g, '-');
  return `${contract.data.contratante.name || 'contrato'} - ${typeLabelSlug} #${contract.number
    .toString()
    .padStart(2, '0')}.pdf`;
}

export function downloadContractPdf(contract: Contract, project: Project | undefined) {
  const doc = generateContractPdf(contract, project);
  doc.save(buildContractPdfFileName(contract));
}

/**
 * Gera o PDF do contrato e o envia para o storage do sistema (mesmo mecanismo
 * usado para outros anexos — Telegram, com fallback em base64), permitindo
 * reabrir/consultar o mesmo arquivo depois sem precisar gerá-lo novamente.
 */
export async function saveContractPdfToSystem(
  contract: Contract,
  project: Project | undefined
): Promise<{ url: string; fileName: string; error: string | null }> {
  const doc = generateContractPdf(contract, project);
  const fileName = buildContractPdfFileName(contract);
  const dataUri = doc.output('datauristring');
  const { url, error } = await uploadBase64ToFirebase(dataUri, `contracts/${fileName}`, 'application/pdf');
  return { url, fileName, error };
}
