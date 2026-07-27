// src/lib/pdfReports.ts
//
// Geração de PDFs REAIS (client-side) para os relatórios de Planejamento, usando
// jsPDF + jsPDF-AutoTable — que já são dependências do projeto.
//
// Por que não window.print(): a impressão do navegador depende do usuário escolher
// "Salvar como PDF" no diálogo, brigava com o CSS do app (às vezes gerando página em
// branco) e não paginava tabelas largas. Aqui o PDF é gerado e baixado diretamente,
// com paginação automática de linhas e colunas — nada é cortado.
//
// Cada função valida os dados antes de gerar e devolve um relatório de validação,
// para o chamador avisar o usuário se algo estiver faltando.

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

// ---------------------------------------------------------------------------
// Identidade visual
// ---------------------------------------------------------------------------

const BRAND = {
  ink: [28, 25, 23] as [number, number, number],       // stone-900
  soft: [120, 113, 108] as [number, number, number],   // stone-500
  line: [214, 211, 209] as [number, number, number],   // stone-300
  zebra: [245, 245, 244] as [number, number, number],  // stone-100
  headBg: [41, 37, 36] as [number, number, number],    // stone-800
  headText: [255, 255, 255] as [number, number, number],
  good: [4, 120, 87] as [number, number, number],      // emerald-700
  warn: [180, 83, 9] as [number, number, number],      // amber-700
};

const COMPANY = "Chaves Brites Correa Construtora";
const COMPANY_SUB = "Planejamento, Gestão e Engenharia de Obras";

export interface ValidationReport {
  ok: boolean;
  errors: string[];   // impedem a geração
  warnings: string[]; // geram, mas avisam
}

const fmtMoney = (v: number): string =>
  "R$ " + (Number(v) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtDateBR = (iso: string): string => {
  if (!iso) return "—";
  const d = new Date(iso.length <= 10 ? iso + "T00:00:00" : iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("pt-BR");
};

const today = () => new Date().toLocaleDateString("pt-BR");

// ---------------------------------------------------------------------------
// Cabeçalho e rodapé aplicados a cada página
// ---------------------------------------------------------------------------

function drawHeader(doc: jsPDF, title: string, subtitle: string, projectName: string) {
  const w = doc.internal.pageSize.getWidth();
  const m = 12;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...BRAND.ink);
  doc.text(COMPANY.toUpperCase(), m, 14);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...BRAND.soft);
  doc.text(COMPANY_SUB, m, 18.5);

  // Bloco direito
  doc.setFontSize(7);
  doc.text(title.toUpperCase(), w - m, 14, { align: "right" });
  doc.text(`Emissão: ${today()}`, w - m, 18, { align: "right" });

  // Linha divisória
  doc.setDrawColor(...BRAND.ink);
  doc.setLineWidth(0.5);
  doc.line(m, 21.5, w - m, 21.5);

  // Faixa de contexto
  doc.setFontSize(8);
  doc.setTextColor(...BRAND.ink);
  doc.setFont("helvetica", "bold");
  doc.text(`Obra / Projeto: `, m, 27);
  const label = doc.getTextWidth("Obra / Projeto: ");
  doc.setFont("helvetica", "normal");
  doc.text(projectName || "—", m + label, 27);

  doc.setFont("helvetica", "bold");
  doc.setTextColor(...BRAND.soft);
  doc.setFontSize(7.5);
  doc.text(subtitle.toUpperCase(), w - m, 27, { align: "right" });
}

function drawFooterAll(doc: jsPDF) {
  const pageCount = doc.getNumberOfPages();
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setDrawColor(...BRAND.line);
    doc.setLineWidth(0.2);
    doc.line(12, h - 10, w - 12, h - 10);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...BRAND.soft);
    doc.text(`${COMPANY} — Documento gerado pelo sistema HUB CBC`, 12, h - 6);
    doc.text(`Página ${i} de ${pageCount}`, w - 12, h - 6, { align: "right" });
  }
}

/** Faixa de título de seção dentro do corpo. */
function sectionTitle(doc: jsPDF, text: string, y: number): number {
  const w = doc.internal.pageSize.getWidth();
  const m = 12;
  doc.setFillColor(...BRAND.zebra);
  doc.setDrawColor(...BRAND.line);
  doc.setLineWidth(0.2);
  doc.rect(m, y, w - 2 * m, 6, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(...BRAND.ink);
  doc.text(text.toUpperCase(), m + 2, y + 4);
  return y + 6;
}

/**
 * Desenha o gráfico da Curva S (percentual acumulado previsto por mês).
 * Recebe os pontos {label, percent} e a posição/tamanho da área do gráfico.
 * Retorna o Y ao final do gráfico.
 */
function drawSCurveChart(
  doc: jsPDF,
  points: { label: string; percent: number }[],
  x: number, y: number, width: number, height: number,
): number {
  const padL = 14;   // espaço para rótulos do eixo Y (0–100%)
  const padB = 10;   // espaço para rótulos do eixo X (meses)
  const padT = 3;
  const plotX = x + padL;
  const plotY = y + padT;
  const plotW = width - padL - 2;
  const plotH = height - padB - padT;

  // Fundo suave da área de plotagem.
  doc.setFillColor(250, 250, 249);
  doc.setDrawColor(...BRAND.line);
  doc.setLineWidth(0.2);
  doc.rect(plotX, plotY, plotW, plotH, "FD");

  // Linhas de grade horizontais + rótulos do eixo Y (0, 25, 50, 75, 100%).
  doc.setFontSize(6);
  doc.setFont("helvetica", "normal");
  for (let g = 0; g <= 100; g += 25) {
    const gy = plotY + plotH - (g / 100) * plotH;
    doc.setDrawColor(...(g === 0 ? BRAND.line : [232, 230, 228] as [number, number, number]));
    doc.setLineWidth(0.1);
    doc.line(plotX, gy, plotX + plotW, gy);
    doc.setTextColor(...BRAND.soft);
    doc.text(`${g}%`, plotX - 2, gy + 1.5, { align: "right" });
  }

  if (points.length === 0) return y + height;

  // Coordenadas de cada ponto.
  const stepX = points.length > 1 ? plotW / (points.length - 1) : 0;
  const coords = points.map((p, i) => ({
    px: plotX + (points.length > 1 ? i * stepX : plotW / 2),
    py: plotY + plotH - (Math.max(0, Math.min(100, p.percent)) / 100) * plotH,
    label: p.label,
    percent: p.percent,
  }));

  // Área sob a curva (preenchimento suave) — desenhada como uma série de trapézios.
  doc.setFillColor(194, 112, 61); // terracota BRAND-like
  (doc as any).setGState && (doc as any).setGState(new (doc as any).GState({ opacity: 0.10 }));
  for (let i = 0; i < coords.length - 1; i++) {
    const a = coords[i], b = coords[i + 1];
    // Trapézio: a.px..b.px na base, subindo até a curva.
    doc.triangle(a.px, plotY + plotH, b.px, plotY + plotH, a.px, a.py, "F");
    doc.triangle(b.px, plotY + plotH, b.px, b.py, a.px, a.py, "F");
  }
  (doc as any).setGState && (doc as any).setGState(new (doc as any).GState({ opacity: 1 }));

  // Linha da curva.
  doc.setDrawColor(194, 112, 61);
  doc.setLineWidth(0.7);
  for (let i = 0; i < coords.length - 1; i++) {
    doc.line(coords[i].px, coords[i].py, coords[i + 1].px, coords[i + 1].py);
  }

  // Marcadores nos pontos + rótulos do eixo X.
  doc.setFontSize(5.5);
  coords.forEach((c, i) => {
    doc.setFillColor(194, 112, 61);
    doc.circle(c.px, c.py, 0.9, "F");
    // Rótulo do mês: mostra 1 a cada N para não sobrepor quando há muitos meses.
    const showEvery = points.length > 14 ? 3 : points.length > 8 ? 2 : 1;
    if (i % showEvery === 0 || i === coords.length - 1) {
      doc.setTextColor(...BRAND.soft);
      doc.text(c.label, c.px, plotY + plotH + 4, { align: "center" });
    }
  });

  // Rótulo do ponto final (100% ou o máximo atingido), destacado.
  const last = coords[coords.length - 1];
  doc.setFontSize(6.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(194, 112, 61);
  doc.text(`${last.percent.toFixed(0)}%`, last.px, last.py - 2.5, { align: "right" });

  return y + height;
}

// ===========================================================================
// RELATÓRIO 1: CRONOGRAMA FÍSICO-FINANCEIRO (analítico + sintético)
// ===========================================================================

export interface SchedulePhaseInput {
  name: string;
  startDate: string;
  endDate: string;
  costPrev: number;
  costReal: number;
  progress: number;
}

export interface SchedulePeriod { key: string; label: string; year: number; month: number }

export interface ScheduleMonthlyTotal {
  key: string;
  planned: number;
  realized: number;
  avgProgress: number;
  cumulativePlannedPercent?: number;
  cumulativeRealizedPercent?: number;
}

export interface ScheduleReportData {
  projectName: string;
  phases: SchedulePhaseInput[];
  periods: SchedulePeriod[];
  monthlyTotals: ScheduleMonthlyTotal[];
  /** Distribuição de um mês para uma fase (mesma função do componente). */
  distributionFor: (phase: SchedulePhaseInput, year: number, month: number) => {
    planned: number; realized: number; plannedPhysicalPercent: number;
  };
  budget?: number;
  printType: "analytical" | "synthetic" | "both";
}

export function validateScheduleData(data: ScheduleReportData): ValidationReport {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!data.phases || data.phases.length === 0) {
    errors.push("Nenhuma etapa cadastrada no cronograma deste projeto.");
  }
  (data.phases || []).forEach((p, i) => {
    const label = p.name?.trim() || `Etapa ${i + 1}`;
    if (!p.name?.trim()) warnings.push(`Etapa ${i + 1} está sem nome.`);
    if (!p.startDate || !p.endDate) warnings.push(`"${label}" está sem data de início ou término.`);
    else if (new Date(p.startDate) > new Date(p.endDate)) warnings.push(`"${label}" tem início posterior ao término.`);
    if (!(p.costPrev > 0)) warnings.push(`"${label}" está com custo previsto zerado.`);
  });
  if ((data.periods || []).length === 0) {
    warnings.push("Não há meses no horizonte do cronograma — verifique as datas das etapas.");
  }

  return { ok: errors.length === 0, errors, warnings };
}

export function generateSchedulePdf(data: ScheduleReportData): void {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const w = doc.internal.pageSize.getWidth();
  const m = 12;

  const totalPrev = data.phases.reduce((s, p) => s + (p.costPrev || 0), 0);

  let firstPage = true;

  const startPage = (title: string, subtitle: string) => {
    if (!firstPage) doc.addPage();
    firstPage = false;
    drawHeader(doc, title, subtitle, data.projectName);
  };

  // Resumo executivo (cards) — baseline: só valores previstos.
  const drawSummary = (y: number): number => {
    const start0 = data.phases.map(p => p.startDate).filter(Boolean).sort()[0];
    const end0 = data.phases.map(p => p.endDate).filter(Boolean).sort().slice(-1)[0];
    const cardW = (w - 2 * m - 3 * 4) / 4;
    const cards: [string, string, [number, number, number]][] = [
      ["Etapas", String(data.phases.length), BRAND.ink],
      ["Custo Previsto Total", fmtMoney(totalPrev), BRAND.ink],
      ["Início Planejado", start0 ? fmtDateBR(start0) : "—", BRAND.ink],
      ["Término Planejado", end0 ? fmtDateBR(end0) : "—", BRAND.ink],
    ];
    cards.forEach(([label, value, color], i) => {
      const x = m + i * (cardW + 4);
      doc.setFillColor(...BRAND.zebra);
      doc.setDrawColor(...BRAND.line);
      doc.setLineWidth(0.2);
      doc.rect(x, y, cardW, 12, "FD");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(6);
      doc.setTextColor(...BRAND.soft);
      doc.text(label.toUpperCase(), x + 2, y + 4);
      doc.setFontSize(10);
      doc.setTextColor(...color);
      doc.text(value, x + 2, y + 9.5);
    });
    return y + 12 + 4;
  };

  // ---------------- ANALÍTICO ----------------
  const renderAnalytical = () => {
    startPage("Cronograma Físico-Financeiro", "Analítico");
    let y = drawSummary(32);
    y = sectionTitle(doc, "Cronograma Analítico — Detalhamento por Etapa e Distribuição Mensal", y) + 2;

    // Colunas fixas + uma coluna por mês. autoTable quebra em várias páginas
    // horizontalmente quando não cabe, sem cortar nada.
    const monthCols = data.periods.map((p) => p.label);
    const head = [["Etapa / Serviço", "Início", "Término", "Custo Prev.", ...monthCols]];

    const body = data.phases.map((phase) => {
      const monthCells = data.periods.map((per) => {
        const dist = data.distributionFor(phase, per.year, per.month);
        if (dist.planned <= 0) return "—";
        // Valor planejado do mês + % físico previsto, compacto.
        return `${fmtMoney(dist.planned).replace("R$ ", "")}\n${dist.plannedPhysicalPercent.toFixed(0)}%`;
      });
      return [
        phase.name || "—",
        fmtDateBR(phase.startDate),
        fmtDateBR(phase.endDate),
        fmtMoney(phase.costPrev).replace("R$ ", ""),
        ...monthCells,
      ];
    });

    // Linha de totais mensais
    const totalRow = [
      "TOTAL PREVISTO / MÊS", "", "",
      fmtMoney(totalPrev).replace("R$ ", ""),
      ...data.periods.map((per) => {
        const mt = data.monthlyTotals.find((t) => t.key === per.key);
        return mt && mt.planned > 0 ? fmtMoney(mt.planned).replace("R$ ", "") : "—";
      }),
    ];
    body.push(totalRow);

    autoTable(doc, {
      head,
      body,
      startY: y,
      margin: { left: m, right: m },
      styles: { fontSize: 6.5, cellPadding: 1.3, overflow: "linebreak", lineColor: BRAND.line, lineWidth: 0.1, textColor: BRAND.ink },
      headStyles: { fillColor: BRAND.headBg, textColor: BRAND.headText, fontSize: 6.5, fontStyle: "bold", halign: "center" },
      alternateRowStyles: { fillColor: BRAND.zebra },
      columnStyles: {
        0: { cellWidth: 46, halign: "left", fontStyle: "bold" },
        1: { cellWidth: 20, halign: "center" },
        2: { cellWidth: 20, halign: "center" },
        3: { cellWidth: 22, halign: "right" },
      },
      didParseCell: (hook) => {
        // Destaca a linha de total (última do corpo).
        if (hook.section === "body" && hook.row.index === body.length - 1) {
          hook.cell.styles.fillColor = BRAND.headBg;
          hook.cell.styles.textColor = BRAND.headText;
          hook.cell.styles.fontStyle = "bold";
        }
      },
      // Colunas mensais alinhadas à direita e estreitas.
      willDrawCell: (hook) => {
        if (hook.section !== "head" && hook.column.index >= 4) {
          hook.cell.styles.halign = "right";
        }
      },
    });

    // Nota de leitura
    const finalY = (doc as any).lastAutoTable?.finalY || y;
    if (finalY < doc.internal.pageSize.getHeight() - 18) {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(6.5);
      doc.setTextColor(...BRAND.soft);
      doc.text(
        "Cada célula mensal traz o custo planejado (R$) e o percentual físico previsto para o mês.",
        m, finalY + 4
      );
    }
  };

  // ---------------- SINTÉTICO ----------------
  const renderSynthetic = () => {
    startPage("Cronograma Físico-Financeiro", "Sintético");
    let y = drawSummary(32);
    y = sectionTitle(doc, "Cronograma Sintético — Resumo por Etapa", y) + 2;

    const head = [[
      "Etapa / Serviço", "Início", "Término", "Duração", "Custo Previsto",
    ]];

    const body = data.phases.map((phase) => {
      const start = new Date(phase.startDate + "T00:00:00");
      const end = new Date(phase.endDate + "T00:00:00");
      const days = (!isNaN(start.getTime()) && !isNaN(end.getTime()))
        ? Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000))
        : 0;
      return [
        phase.name || "—",
        fmtDateBR(phase.startDate),
        fmtDateBR(phase.endDate),
        days ? `${days} d` : "—",
        fmtMoney(phase.costPrev),
      ];
    });

    body.push([
      "TOTAL GERAL", "", "", "",
      fmtMoney(totalPrev),
    ]);

    autoTable(doc, {
      head,
      body,
      startY: y,
      margin: { left: m, right: m },
      styles: { fontSize: 8, cellPadding: 2, overflow: "linebreak", lineColor: BRAND.line, lineWidth: 0.1, textColor: BRAND.ink },
      headStyles: { fillColor: BRAND.headBg, textColor: BRAND.headText, fontStyle: "bold", halign: "center" },
      alternateRowStyles: { fillColor: BRAND.zebra },
      columnStyles: {
        0: { cellWidth: "auto", halign: "left", fontStyle: "bold" },
        1: { halign: "center" }, 2: { halign: "center" }, 3: { halign: "center" },
        4: { halign: "right" },
      },
      didParseCell: (hook) => {
        if (hook.section === "body" && hook.row.index === body.length - 1) {
          hook.cell.styles.fillColor = BRAND.headBg;
          hook.cell.styles.textColor = BRAND.headText;
          hook.cell.styles.fontStyle = "bold";
        }
      },
    });

    // Curva S — evolução PREVISTA acumulada por mês (baseline, sem realizado)
    let curveY = ((doc as any).lastAutoTable?.finalY || y) + 6;
    if (curveY > doc.internal.pageSize.getHeight() - 40) { doc.addPage(); drawHeader(doc, "Cronograma Físico-Financeiro", "Sintético", data.projectName); curveY = 32; }
    curveY = sectionTitle(doc, "Evolução Financeira Prevista (Curva S Planejada)", curveY) + 2;

    // Monta os pontos de percentual acumulado previsto para o gráfico.
    let cumForChart = 0;
    const chartPoints = data.periods.map((per) => {
      const mt = data.monthlyTotals.find((t) => t.key === per.key);
      cumForChart += mt?.planned || 0;
      return { label: per.label, percent: totalPrev > 0 ? (cumForChart / totalPrev) * 100 : 0 };
    });

    // Desenha o gráfico da curva. Se não couber na página, quebra antes.
    const chartHeight = 46;
    if (curveY + chartHeight > doc.internal.pageSize.getHeight() - 16) {
      doc.addPage();
      drawHeader(doc, "Cronograma Físico-Financeiro", "Sintético", data.projectName);
      curveY = sectionTitle(doc, "Evolução Financeira Prevista (Curva S Planejada)", 32) + 2;
    }
    const wS = doc.internal.pageSize.getWidth();
    curveY = drawSCurveChart(doc, chartPoints, m, curveY, wS - 2 * m, chartHeight) + 4;

    // Acumulado previsto para a curva S.
    let cumulative = 0;
    const curveHead = [["Mês", "Previsto no Mês", "Previsto Acumulado", "% Físico Médio"]];
    const curveBody = data.periods.map((per) => {
      const mt = data.monthlyTotals.find((t) => t.key === per.key);
      const planned = mt?.planned || 0;
      cumulative += planned;
      const pct = totalPrev > 0 ? (cumulative / totalPrev) * 100 : 0;
      return [
        per.label,
        planned > 0 ? fmtMoney(planned) : "—",
        planned > 0 || cumulative > 0 ? `${fmtMoney(cumulative)}  (${pct.toFixed(0)}%)` : "—",
        mt ? `${mt.avgProgress}%` : "—",
      ];
    });

    autoTable(doc, {
      head: curveHead,
      body: curveBody,
      startY: curveY,
      margin: { left: m, right: m },
      styles: { fontSize: 7.5, cellPadding: 1.6, lineColor: BRAND.line, lineWidth: 0.1, textColor: BRAND.ink },
      headStyles: { fillColor: BRAND.headBg, textColor: BRAND.headText, fontStyle: "bold", halign: "center" },
      alternateRowStyles: { fillColor: BRAND.zebra },
      columnStyles: { 0: { halign: "left", fontStyle: "bold" }, 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "center" } },
    });
  };

  if (data.printType === "analytical" || data.printType === "both") renderAnalytical();
  if (data.printType === "synthetic" || data.printType === "both") renderSynthetic();

  drawFooterAll(doc);

  const safeName = (data.projectName || "obra").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-").toLowerCase();
  doc.save(`cronograma-${data.printType}-${safeName}.pdf`);
}

// ===========================================================================
// RELATÓRIO 4: RESUMO DE CONTRATO (painel do cliente)
// ===========================================================================

export interface ClientContractData {
  projectName: string;
  clientName?: string;
  budgetLabel: string;
  object: string;
  paymentTerms: string;
  penalties: string;
  signed?: boolean;
}

export function generateClientContractPdf(data: ClientContractData): void {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const w = doc.internal.pageSize.getWidth();
  const m = 18;
  const contentW = w - 2 * m;

  drawHeader(doc, "Contrato de Prestação de Serviços", "Via do Cliente", data.projectName);

  let y = 34;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...BRAND.ink);
  doc.text("INSTRUMENTO PARTICULAR DE CONTRATO", w / 2, y, { align: "center" });
  y += 8;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...BRAND.ink);

  const para = (label: string, text: string, yPos: number): number => {
    doc.setFont("helvetica", "bold");
    const lblW = doc.getTextWidth(label + " ");
    doc.text(label, m, yPos);
    doc.setFont("helvetica", "normal");
    const lines = doc.splitTextToSize(text, contentW - lblW);
    doc.text(lines, m + lblW, yPos);
    // Linhas seguintes já indentadas; recuo total = altura do bloco.
    const extra = doc.splitTextToSize(text, contentW).length;
    return yPos + Math.max(lines.length, 1) * 5 + 3;
  };

  y = para("CONTRATANTE:", `Proprietário associado à obra ${data.projectName}.`, y);
  y = para("CONTRATADA:", "Chaves Brites Correa Arquitetura e Engenharia.", y);
  if (data.clientName) y = para("CLIENTE:", data.clientName, y);
  y += 2;

  y = para("CLÁUSULA 1ª (OBJETO):", data.object, y);
  y = para("CLÁUSULA 2ª (ORÇAMENTO):", `Valor global estimado de ${data.budgetLabel}. ${data.paymentTerms}`, y);
  y = para("CLÁUSULA 3ª (PENALIDADES):", data.penalties, y);

  y += 6;
  if (data.signed) {
    doc.setDrawColor(4, 120, 87);
    doc.setFillColor(236, 253, 245);
    doc.rect(m, y, contentW, 14, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(4, 120, 87);
    doc.text("✓ ASSINADO DIGITALMENTE", w / 2, y + 6, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...BRAND.soft);
    doc.text("Documento autenticado eletronicamente pelo sistema HUB CBC.", w / 2, y + 10.5, { align: "center" });
  }

  drawFooterAll(doc);
  const safeName = (data.projectName || "obra").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-").toLowerCase();
  doc.save(`contrato-${safeName}.pdf`);
}

// ===========================================================================
// RELATÓRIO 3: LISTA DE MATERIAIS
// ===========================================================================

export interface MaterialItemInput {
  name: string;
  quantity: string;
  unit?: string;
  unitValue?: number;
  supplier: string;
  estimatedValue: number;
  orderDate: string;
  deliveryDate?: string;
  status?: string;
}
export interface MaterialsReportData {
  projectName: string;
  materials: MaterialItemInput[];
}

const STATUS_LABEL: Record<string, string> = {
  cotacao: "Cotação", pedido: "Pedido", entregue: "Entregue", atrasado: "Atrasado",
};

export function validateMaterialsData(data: MaterialsReportData): ValidationReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!data.materials || data.materials.length === 0) {
    errors.push("Nenhum material cadastrado para este projeto.");
  }
  (data.materials || []).forEach((mm, i) => {
    const label = mm.name?.trim() || `Item ${i + 1}`;
    if (!mm.name?.trim()) warnings.push(`Item ${i + 1} está sem descrição.`);
    if (!mm.supplier?.trim()) warnings.push(`"${label}" está sem fornecedor.`);
    if (!(mm.estimatedValue > 0)) warnings.push(`"${label}" está com valor total zerado.`);
  });
  return { ok: errors.length === 0, errors, warnings };
}

export function generateMaterialsPdf(data: MaterialsReportData): void {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const w = doc.internal.pageSize.getWidth();
  const m = 12;

  const totalValue = data.materials.reduce((s, it) => s + (it.estimatedValue || 0), 0);
  const suppliers = new Set(data.materials.map((it) => (it.supplier || "").trim()).filter(Boolean));

  drawHeader(doc, "Lista de Materiais", "Planejamento de Suprimentos", data.projectName);

  let y = 32;
  const cardW = (w - 2 * m - 2 * 4) / 3;
  const cards: [string, string][] = [
    ["Itens", String(data.materials.length)],
    ["Valor Total Estimado", fmtMoney(totalValue)],
    ["Fornecedores", String(suppliers.size)],
  ];
  cards.forEach(([label, value], i) => {
    const x = m + i * (cardW + 4);
    doc.setFillColor(...BRAND.zebra);
    doc.setDrawColor(...BRAND.line);
    doc.setLineWidth(0.2);
    doc.rect(x, y, cardW, 13, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.setTextColor(...BRAND.soft);
    doc.text(label.toUpperCase(), x + 2, y + 4.5);
    doc.setFontSize(11);
    doc.setTextColor(...BRAND.ink);
    doc.text(value, x + 2, y + 10.5);
  });
  y += 13 + 5;
  y = sectionTitle(doc, "Relação de Materiais e Serviços", y) + 2;

  const body: any[] = data.materials.map((it, i) => [
    String(i + 1),
    it.name || "—",
    `${it.quantity || ""}${it.unit ? " " + it.unit : ""}`.trim() || "—",
    it.supplier || "—",
    it.unitValue ? fmtMoney(it.unitValue) : "—",
    fmtMoney(it.estimatedValue),
    it.deliveryDate ? fmtDateBR(it.deliveryDate) : "—",
    it.status ? (STATUS_LABEL[it.status] || it.status) : "—",
  ]);
  body.push([
    { content: "TOTAL GERAL", colSpan: 5, styles: { halign: "right", fillColor: BRAND.headBg, textColor: BRAND.headText, fontStyle: "bold" } },
    { content: fmtMoney(totalValue), styles: { halign: "right", fillColor: BRAND.headBg, textColor: BRAND.headText, fontStyle: "bold" } },
    { content: "", colSpan: 2, styles: { fillColor: BRAND.headBg } },
  ]);

  autoTable(doc, {
    head: [["Nº", "Material / Serviço", "Quant.", "Fornecedor", "Valor Unit.", "Valor Total", "Entrega", "Status"]],
    body,
    startY: y,
    margin: { left: m, right: m },
    styles: { fontSize: 7.5, cellPadding: 1.6, overflow: "linebreak", lineColor: BRAND.line, lineWidth: 0.1, textColor: BRAND.ink },
    headStyles: { fillColor: BRAND.headBg, textColor: BRAND.headText, fontStyle: "bold", halign: "center", fontSize: 7 },
    alternateRowStyles: { fillColor: BRAND.zebra },
    columnStyles: {
      0: { cellWidth: 8, halign: "center" },
      1: { cellWidth: "auto", fontStyle: "bold" },
      2: { cellWidth: 20, halign: "center" },
      3: { cellWidth: 30 },
      4: { cellWidth: 22, halign: "right" },
      5: { cellWidth: 24, halign: "right" },
      6: { cellWidth: 20, halign: "center" },
      7: { cellWidth: 18, halign: "center" },
    },
  });

  drawFooterAll(doc);
  const safeName = (data.projectName || "obra").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-").toLowerCase();
  doc.save(`materiais-${safeName}.pdf`);
}

// ===========================================================================
// RELATÓRIO 2: PAGAMENTOS DE MÃO DE OBRA
// ===========================================================================

export interface LaborContractInput {
  id: string;
  supplier: string;
  scope: string;
  contractValue: number;
}
export interface LaborPaymentInput {
  contractId: string;
  supplier: string;
  paymentDate: string;
  value: number;
  description: string;
  notes?: string;
}
export interface LaborReportData {
  projectName: string;
  contracts: LaborContractInput[];
  payments: LaborPaymentInput[];
}

export function validateLaborData(data: LaborReportData): ValidationReport {
  const errors: string[] = [];
  const warnings: string[] = [];

  if ((data.contracts || []).length === 0 && (data.payments || []).length === 0) {
    errors.push("Não há contratos nem pagamentos cadastrados para este projeto.");
  }
  (data.contracts || []).forEach((c, i) => {
    if (!c.supplier?.trim()) warnings.push(`Contrato ${i + 1} está sem prestador.`);
    if (!(c.contractValue > 0)) warnings.push(`Contrato de "${c.supplier || `#${i + 1}`}" está com valor zerado.`);
  });
  (data.payments || []).forEach((p, i) => {
    const ref = p.description?.trim() || `Pagamento ${i + 1}`;
    if (!p.paymentDate) warnings.push(`"${ref}" está sem data.`);
    if (!(p.value > 0)) warnings.push(`"${ref}" está com valor zerado.`);
    const orphan = !data.contracts.some((c) => c.id === p.contractId);
    if (orphan) warnings.push(`"${ref}" (${p.supplier || "sem prestador"}) não está vinculado a um contrato existente.`);
  });

  return { ok: errors.length === 0, errors, warnings };
}

export function generateLaborPaymentsPdf(data: LaborReportData): void {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const w = doc.internal.pageSize.getWidth();
  const m = 12;

  const totalContracts = data.contracts.reduce((s, c) => s + (c.contractValue || 0), 0);
  const totalScheduled = data.payments.reduce((s, p) => s + (p.value || 0), 0);
  const proportion = totalContracts > 0 ? (totalScheduled / totalContracts) * 100 : 0;

  drawHeader(doc, "Pagamentos de Mão de Obra", "Relatório Físico-Financeiro", data.projectName);

  // Resumo
  let y = 32;
  const cardW = (w - 2 * m - 2 * 4) / 3;
  const cards: [string, string, [number, number, number]][] = [
    ["Total em Contratos", fmtMoney(totalContracts), BRAND.ink],
    ["Total Programado", fmtMoney(totalScheduled), BRAND.ink],
    ["Proporção Programada", `${proportion.toFixed(1)}%`, BRAND.good],
  ];
  cards.forEach(([label, value, color], i) => {
    const x = m + i * (cardW + 4);
    doc.setFillColor(...BRAND.zebra);
    doc.setDrawColor(...BRAND.line);
    doc.setLineWidth(0.2);
    doc.rect(x, y, cardW, 13, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.setTextColor(...BRAND.soft);
    doc.text(label.toUpperCase(), x + 2, y + 4.5);
    doc.setFontSize(11);
    doc.setTextColor(...color);
    doc.text(value, x + 2, y + 10.5);
  });
  y += 13 + 5;

  // ---- Seção 1: Contratos ----
  y = sectionTitle(doc, "1. Contratos de Mão de Obra", y) + 2;
  autoTable(doc, {
    head: [["Prestador", "Escopo", "Valor do Contrato", "Programado", "Saldo"]],
    body: (data.contracts.length ? data.contracts : [{ supplier: "—", scope: "Nenhum contrato cadastrado", contractValue: 0, id: "" } as LaborContractInput]).map((c) => {
      const scheduled = data.payments.filter((p) => p.contractId === c.id).reduce((s, p) => s + p.value, 0);
      return [
        c.supplier || "—",
        c.scope || "—",
        fmtMoney(c.contractValue),
        fmtMoney(scheduled),
        fmtMoney((c.contractValue || 0) - scheduled),
      ];
    }),
    startY: y,
    margin: { left: m, right: m },
    styles: { fontSize: 8, cellPadding: 2, overflow: "linebreak", lineColor: BRAND.line, lineWidth: 0.1, textColor: BRAND.ink },
    headStyles: { fillColor: BRAND.headBg, textColor: BRAND.headText, fontStyle: "bold", halign: "center" },
    alternateRowStyles: { fillColor: BRAND.zebra },
    columnStyles: {
      0: { cellWidth: 40, fontStyle: "bold" },
      1: { cellWidth: "auto" },
      2: { cellWidth: 30, halign: "right" },
      3: { cellWidth: 28, halign: "right" },
      4: { cellWidth: 28, halign: "right" },
    },
  });

  // ---- Seção 2: Programação de pagamentos (por prestador) ----
  let y2 = ((doc as any).lastAutoTable?.finalY || y) + 6;
  if (y2 > doc.internal.pageSize.getHeight() - 30) { doc.addPage(); drawHeader(doc, "Pagamentos de Mão de Obra", "Relatório Físico-Financeiro", data.projectName); y2 = 32; }
  y2 = sectionTitle(doc, "2. Programação de Pagamentos", y2) + 2;

  // Agrupa por prestador para leitura, ordenando as parcelas por data.
  const byContract = new Map<string, LaborPaymentInput[]>();
  for (const p of data.payments) {
    const k = p.contractId || `__${p.supplier}`;
    if (!byContract.has(k)) byContract.set(k, []);
    byContract.get(k)!.push(p);
  }

  const body: any[] = [];
  if (data.payments.length === 0) {
    body.push([{ content: "Nenhum pagamento programado.", colSpan: 4, styles: { halign: "center", textColor: BRAND.soft } }]);
  } else {
    for (const [k, list] of byContract) {
      const contract = data.contracts.find((c) => c.id === k);
      const supplierName = contract?.supplier || list[0]?.supplier || "Sem prestador";
      const subtotal = list.reduce((s, p) => s + p.value, 0);
      // Cabeçalho de grupo
      body.push([{ content: `${supplierName}  (${list.length} parcela(s) — ${fmtMoney(subtotal)})`, colSpan: 4, styles: { fillColor: BRAND.zebra, fontStyle: "bold", textColor: BRAND.ink } }]);
      list.sort((a, b) => new Date(a.paymentDate).getTime() - new Date(b.paymentDate).getTime());
      for (const p of list) {
        body.push([
          fmtDateBR(p.paymentDate),
          p.description || "—",
          p.notes || "",
          fmtMoney(p.value),
        ]);
      }
    }
    // Total geral
    body.push([
      { content: "TOTAL PROGRAMADO", colSpan: 3, styles: { halign: "right", fillColor: BRAND.headBg, textColor: BRAND.headText, fontStyle: "bold" } },
      { content: fmtMoney(totalScheduled), styles: { halign: "right", fillColor: BRAND.headBg, textColor: BRAND.headText, fontStyle: "bold" } },
    ]);
  }

  autoTable(doc, {
    head: [["Data", "Parcela / Descrição", "Observações", "Valor"]],
    body,
    startY: y2,
    margin: { left: m, right: m },
    styles: { fontSize: 8, cellPadding: 2, overflow: "linebreak", lineColor: BRAND.line, lineWidth: 0.1, textColor: BRAND.ink },
    headStyles: { fillColor: BRAND.headBg, textColor: BRAND.headText, fontStyle: "bold", halign: "center" },
    columnStyles: {
      0: { cellWidth: 26, halign: "center" },
      1: { cellWidth: "auto", fontStyle: "bold" },
      2: { cellWidth: 55 },
      3: { cellWidth: 30, halign: "right" },
    },
  });

  drawFooterAll(doc);
  const safeName = (data.projectName || "obra").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-").toLowerCase();
  doc.save(`pagamentos-mao-de-obra-${safeName}.pdf`);
}
