import { jsPDF } from 'jspdf';
import { Contract, ContractFormData, ContractType, Project } from '../types';
import { CBC_FIXED_DATA, buildContractDocument, buildSignatureBlocks, formatBRL } from './contractTemplates';
import { uploadBase64ToFirebase } from './firebaseStorage';

const MARGIN_X = 14;
const PAGE_BOTTOM = 282; // limite útil antes do rodapé (A4 = 297mm)

function drawFooter(doc: jsPDF, pageNumber: number, totalPagesLabel: string) {
  const pageWidth = doc.internal.pageSize.getWidth();
  doc.setDrawColor(225, 225, 225);
  doc.setLineWidth(0.2);
  doc.line(MARGIN_X, 289, pageWidth - MARGIN_X, 289);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(140, 140, 140);
  doc.text(
    `CHAVES BRITES CORREA | ARQUITETURA E ENGENHARIA • CNPJ ${CBC_FIXED_DATA.cnpj} • @chavesbritescorrea`,
    MARGIN_X,
    293
  );
  doc.text(`Página ${pageNumber}${totalPagesLabel}`, pageWidth - MARGIN_X, 293, { align: 'right' });
}

function drawTopHeader(
  doc: jsPDF,
  opts: { contratanteNome: string; minutaLabel: string; localObjeto: string; areaData: string }
) {
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(0, 0, 0);
  doc.text('CHAVES', 14, 15);
  doc.text('BRITES', 14, 19.5);
  doc.text('CORREA', 14, 24);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(80, 80, 80);
  doc.text('ARQUITETURA', 38, 19.5);
  doc.text('ENGENHARIA', 38, 24);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(60, 60, 60);
  doc.text(`CNPJ: ${CBC_FIXED_DATA.cnpj}`, pageWidth - MARGIN_X, 12, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.text(`Contato: ${CBC_FIXED_DATA.phone} | ${CBC_FIXED_DATA.email}`, pageWidth - MARGIN_X, 16, { align: 'right' });

  doc.setDrawColor(220, 220, 220);
  doc.setLineWidth(0.3);
  doc.line(MARGIN_X, 30, pageWidth - MARGIN_X, 30);

  const colW = (pageWidth - MARGIN_X * 2) / 4;
  const meta: [string, string][] = [
    ['CONTRATANTE', opts.contratanteNome || '_______________'],
    ['TIPO DE MINUTA', opts.minutaLabel],
    ['LOCAL DO OBJETO', opts.localObjeto || '_______________'],
    ['ÁREA E DATA', opts.areaData],
  ];
  meta.forEach(([label, value], i) => {
    const x = MARGIN_X + i * colW;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6);
    doc.setTextColor(150, 150, 150);
    doc.text(label, x, 36);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(30, 30, 30);
    const lines = doc.splitTextToSize(value, colW - 4);
    doc.text(lines.slice(0, 2), x, 40.5);
  });

  doc.setDrawColor(220, 220, 220);
  doc.line(MARGIN_X, 46, pageWidth - MARGIN_X, 46);
}

export function generateContractPdf(contract: Contract, project: Project | undefined): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const contentWidth = pageWidth - MARGIN_X * 2;
  const data = contract.data;
  const document_ = buildContractDocument(contract.type, data);

  const areaData = `${data.areaM2 || '__'} m² | ${formatDatePt(data.dataAssinatura)}`;
  drawTopHeader(doc, {
    contratanteNome: data.contratante.name,
    minutaLabel: document_.minutaLabel,
    localObjeto: data.localObjeto,
    areaData,
  });

  let y = 55;
  let page = 1;

  const ensureSpace = (needed: number) => {
    if (y + needed > PAGE_BOTTOM) {
      drawFooter(doc, page, '');
      doc.addPage();
      page += 1;
      y = 18;
    }
  };

  const writeParagraph = (text: string, opts?: { bold?: boolean; size?: number; color?: [number, number, number] }) => {
    doc.setFont('helvetica', opts?.bold ? 'bold' : 'normal');
    doc.setFontSize(opts?.size ?? 9.5);
    const [r, g, b] = opts?.color ?? [40, 40, 40];
    doc.setTextColor(r, g, b);
    const lines: string[] = doc.splitTextToSize(text, contentWidth);
    for (const line of lines) {
      ensureSpace(5.2);
      doc.text(line, MARGIN_X, y);
      y += 4.6;
    }
    y += 2;
  };

  // Título
  ensureSpace(14);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(20, 20, 20);
  const titleLines: string[] = doc.splitTextToSize(document_.title, contentWidth);
  titleLines.forEach((l) => {
    ensureSpace(8);
    doc.text(l, MARGIN_X, y);
    y += 7;
  });
  y += 2;

  // Seções / cláusulas
  for (const section of document_.sections) {
    ensureSpace(10);
    doc.setDrawColor(255, 90, 0);
    doc.setLineWidth(1.2);
    doc.line(MARGIN_X, y - 3, MARGIN_X, y + 2);
    writeParagraph(section.heading, { bold: true, size: 10.5, color: [20, 20, 20] });
    for (const p of section.paragraphs) {
      if (p) writeParagraph(p);
    }
    y += 1.5;
  }

  // Assinaturas
  ensureSpace(20);
  writeParagraph(`${data.localAssinatura || 'Campo Grande - MS'}, ${formatDatePt(data.dataAssinatura)}.`, {
    bold: true,
    size: 9.5,
  });
  y += 6;

  const signers = buildSignatureBlocks(contract.type, data);
  for (const s of signers) {
    ensureSpace(16);
    doc.setDrawColor(120, 120, 120);
    doc.setLineWidth(0.2);
    doc.line(MARGIN_X, y, MARGIN_X + 90, y);
    y += 4;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(20, 20, 20);
    doc.text(s.name, MARGIN_X, y);
    y += 4;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(90, 90, 90);
    doc.text(`CPF/CNPJ: ${s.doc}`, MARGIN_X, y);
    y += 4;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(255, 90, 0);
    doc.text(s.role, MARGIN_X, y);
    y += 8;
  }

  ensureSpace(20);
  writeParagraph('TESTEMUNHAS OBRIGATÓRIAS', { bold: true, size: 8.5, color: [90, 90, 90] });
  for (let i = 1; i <= 2; i++) {
    ensureSpace(10);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(60, 60, 60);
    doc.text(`${i}) Nome: ___________________________`, MARGIN_X, y);
    y += 5;
    doc.text('   CPF/RG: __________________________', MARGIN_X, y);
    y += 7;
  }

  const totalPages = (doc as any).internal.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    drawFooter(doc, p, ` de ${totalPages}`);
  }

  return doc;
}

function formatDatePt(iso: string | undefined): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return iso;
  const meses = [
    'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
    'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
  ];
  const mi = parseInt(m, 10) - 1;
  return `${parseInt(d, 10)} de ${meses[mi] ?? m} de ${y}`;
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
