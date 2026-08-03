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
import { LOGO_BLACK, LOGO_WHITE, LOGO_ASPECT } from "./brandAssets";
import { registerPoppins } from "./poppinsFont";

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

  // Nome da empresa em texto: "CHAVES / BRITES / CORREA" empilhado, alinhado à direita.
  const words = ["CHAVES", "BRITES", "CORREA"];
  const fonts = (doc as any).getFontList ? (doc as any).getFontList() : {};
  const logoFont = fonts && fonts["Poppins"] ? "Poppins" : "helvetica";
  doc.setFont(logoFont, "bold");
  doc.setFontSize(11);
  doc.setTextColor(...BRAND.ink);
  const widest = Math.max(...words.map((wd) => doc.getTextWidth(wd)));
  const rightEdge = m + widest;
  let ly = 9;
  words.forEach((wd) => {
    doc.text(wd, rightEdge, ly, { align: "right" });
    ly += 5;
  });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(...BRAND.soft);
  doc.text(COMPANY_SUB, m, ly + 1);

  // Bloco direito
  doc.setFontSize(7);
  doc.setTextColor(...BRAND.soft);
  doc.text(title.toUpperCase(), w - m, 12, { align: "right" });
  doc.text(`Emissão: ${today()}`, w - m, 16, { align: "right" });

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

/** Desenha um anel de progresso (donut) com percentual no centro. Para o dashboard do boletim. */
function drawProgressRing(
  doc: jsPDF, cx: number, cy: number, radius: number,
  percent: number, color: [number, number, number], label: string, centerText: string,
): void {
  const pct = Math.max(0, Math.min(100, percent));
  const thickness = radius * 0.32;
  // Trilha de fundo (círculo cinza claro).
  doc.setDrawColor(232, 230, 228);
  doc.setLineWidth(thickness);
  doc.circle(cx, cy, radius, "S");
  // Arco de progresso: aproximado por segmentos de linha (jsPDF não tem arco parcial nativo).
  const steps = Math.max(1, Math.round((pct / 100) * 60));
  doc.setDrawColor(...color);
  doc.setLineWidth(thickness);
  const startAngle = -Math.PI / 2; // começa no topo
  let prevX = cx + radius * Math.cos(startAngle);
  let prevY = cy + radius * Math.sin(startAngle);
  for (let i = 1; i <= steps; i++) {
    const a = startAngle + (i / 60) * 2 * Math.PI;
    const x = cx + radius * Math.cos(a);
    const y = cy + radius * Math.sin(a);
    doc.line(prevX, prevY, x, y);
    prevX = x; prevY = y;
  }
  // Texto central (o percentual).
  doc.setFont("helvetica", "bold");
  doc.setFontSize(radius * 0.62);
  doc.setTextColor(...color);
  doc.text(centerText, cx, cy + radius * 0.18, { align: "center" });
  // Rótulo abaixo do anel.
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.5);
  doc.setTextColor(...BRAND.soft);
  doc.text(label.toUpperCase(), cx, cy + radius + 5, { align: "center" });
}

/** Título de seção mais leve (boletim): barra de acento terracota + texto, sem faixa cinza. */
function bulletinSectionTitle(doc: jsPDF, text: string, y: number): number {
  const w = doc.internal.pageSize.getWidth();
  const m = 14;
  // Barra de acento à esquerda.
  doc.setFillColor(194, 112, 61);
  doc.rect(m, y - 3, 2.5, 5, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(...BRAND.ink);
  doc.text(text, m + 4.5, y + 1);
  // Linha fina até a margem direita.
  doc.setDrawColor(...BRAND.line);
  doc.setLineWidth(0.15);
  const tw = doc.getTextWidth(text);
  doc.line(m + 4.5 + tw + 3, y - 0.5, w - m, y - 0.5);
  return y + 5;
}

/**
 * Desenha o gráfico de BARRAS do desembolso mensal (valor previsto em cada mês).
 * Complementa a curva S (que é o acumulado). Retorna o Y ao final.
 */
function drawMonthlyBarsChart(
  doc: jsPDF,
  bars: { label: string; value: number }[],
  x: number, y: number, width: number, height: number,
  fmtCompact: (v: number) => string,
): number {
  const padL = 18;   // rótulos do eixo Y (valores)
  const padB = 10;   // rótulos do eixo X (meses)
  const padT = 4;
  const plotX = x + padL;
  const plotY = y + padT;
  const plotW = width - padL - 2;
  const plotH = height - padB - padT;

  doc.setFillColor(250, 250, 249);
  doc.setDrawColor(...BRAND.line);
  doc.setLineWidth(0.2);
  doc.rect(plotX, plotY, plotW, plotH, "FD");

  const maxV = Math.max(1, ...bars.map(b => b.value));

  // Grade horizontal + rótulos de valor (0, meio, máximo).
  doc.setFontSize(5.5);
  doc.setFont("helvetica", "normal");
  for (let g = 0; g <= 2; g++) {
    const frac = g / 2;
    const gy = plotY + plotH - frac * plotH;
    doc.setDrawColor(...(g === 0 ? BRAND.line : [232, 230, 228] as [number, number, number]));
    doc.setLineWidth(0.1);
    doc.line(plotX, gy, plotX + plotW, gy);
    doc.setTextColor(...BRAND.soft);
    doc.text(fmtCompact(maxV * frac), plotX - 2, gy + 1.5, { align: "right" });
  }

  if (bars.length === 0) return y + height;

  // Barras.
  const slot = plotW / bars.length;
  const barW = Math.min(slot * 0.62, 14);
  const showEvery = bars.length > 14 ? 3 : bars.length > 8 ? 2 : 1;
  doc.setFontSize(5.5);
  bars.forEach((b, i) => {
    const cx = plotX + i * slot + slot / 2;
    const bh = (b.value / maxV) * plotH;
    const by = plotY + plotH - bh;
    doc.setFillColor(62, 124, 139); // azul-petróleo, distinto da curva terracota
    doc.rect(cx - barW / 2, by, barW, bh, "F");
    // Rótulo do mês.
    if (i % showEvery === 0 || i === bars.length - 1) {
      doc.setTextColor(...BRAND.soft);
      doc.text(b.label, cx, plotY + plotH + 4, { align: "center" });
    }
  });

  return y + height;
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
  registerPoppins(doc);
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
    // Pontos do desembolso mensal (valor previsto em cada mês) para o gráfico de barras.
    const barPoints = data.periods.map((per) => {
      const mt = data.monthlyTotals.find((t) => t.key === per.key);
      return { label: per.label, value: mt?.planned || 0 };
    });
    // Formatador compacto para os eixos (ex.: "R$ 60k").
    const fmtCompact = (v: number) => {
      if (v >= 1000000) return `${(v / 1000000).toFixed(1)}M`;
      if (v >= 1000) return `${Math.round(v / 1000)}k`;
      return String(Math.round(v));
    };

    const wS = doc.internal.pageSize.getWidth();
    const chartHeight = 44;

    // --- GRÁFICO 1: Desembolso mensal (barras) ---
    if (curveY + chartHeight > doc.internal.pageSize.getHeight() - 16) {
      doc.addPage();
      drawHeader(doc, "Cronograma Físico-Financeiro", "Sintético", data.projectName);
      curveY = 32;
    }
    curveY = sectionTitle(doc, "Desembolso Mensal Previsto (R$ por mês)", curveY) + 2;
    curveY = drawMonthlyBarsChart(doc, barPoints, m, curveY, wS - 2 * m, chartHeight, fmtCompact) + 6;

    // --- GRÁFICO 2: Curva S acumulada (linha) ---
    if (curveY + chartHeight > doc.internal.pageSize.getHeight() - 16) {
      doc.addPage();
      drawHeader(doc, "Cronograma Físico-Financeiro", "Sintético", data.projectName);
      curveY = 32;
    }
    curveY = sectionTitle(doc, "Evolução Acumulada Prevista (Curva S)", curveY) + 2;
    curveY = drawSCurveChart(doc, chartPoints, m, curveY, wS - 2 * m, chartHeight) + 4;

    // Acumulado previsto para a curva S.
    let cumulative = 0;
    const curveHead = [["Mês", "Previsto no Mês", "Previsto Acumulado", "% Físico Acumulado"]];
    const curveBody = data.periods.map((per) => {
      const mt = data.monthlyTotals.find((t) => t.key === per.key);
      const planned = mt?.planned || 0;
      cumulative += planned;
      const pct = totalPrev > 0 ? (cumulative / totalPrev) * 100 : 0;
      return [
        per.label,
        planned > 0 ? fmtMoney(planned) : "—",
        planned > 0 || cumulative > 0 ? `${fmtMoney(cumulative)}  (${pct.toFixed(0)}%)` : "—",
        // Avanço físico ACUMULADO previsto até o mês (sobe de ~0% a 100%, acompanha a
        // curva). Antes usava o progresso do mês isolado (avgProgress), que oscilava
        // e começava alto — o que confundia a leitura.
        cumulative > 0 ? `${pct.toFixed(0)}%` : "—",
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
  registerPoppins(doc);
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
  registerPoppins(doc);
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
  registerPoppins(doc);
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

// ===========================================================================
// BOLETIM DE MEDIÇÃO — documento formal de avanço da obra por período
// ===========================================================================

export interface BulletinPhoto {
  url: string;          // base64 (data:image/...) ou URL
  caption?: string;     // legenda editável
}
export interface BulletinExpense {
  date: string;
  description: string;
  category: string;     // rótulo já legível
  supplier: string;
  value: number;
}
export interface BulletinLaborPayment {
  supplier: string;
  description: string;
  paymentDate: string;
  value: number;
  contractValue: number;    // valor total do contrato (para o %)
  contractPaidTotal: number; // total já pago do contrato (acumulado)
}
export interface BulletinPhaseProgress {
  name: string;
  progressStart: number; // % no início do período
  progressEnd: number;   // % no fim do período
}
export interface MeasurementBulletinData {
  projectName: string;
  clientName?: string;
  measurementNumber: string;       // "01", "02"... (editável)
  periodStart: string;             // YYYY-MM-DD
  periodEnd: string;
  emissionDate?: string;           // default: hoje
  // Resumo (editável)
  summaryText?: string;            // resumo do acumulado total (texto livre)
  // Percentuais
  physicalProgressPeriod: number;  // % avanço físico do período
  physicalProgressTotal: number;   // % avanço físico acumulado
  financialProgressPeriod: number; // % avanço financeiro do período
  financialProgressTotal: number;  // % avanço financeiro acumulado
  // Comparativo previsto (cronograma) x realizado — opcional
  physicalPlannedPeriod?: number;
  financialPlannedPeriod?: number;
  costPlannedPeriod?: number;
  budgetTotal: number;             // orçamento total da obra
  spentPeriod: number;             // gasto no período
  spentTotal: number;              // gasto acumulado
  // Blocos
  expenses: BulletinExpense[];
  laborPayments: BulletinLaborPayment[];
  phaseProgress: BulletinPhaseProgress[];
  photos: BulletinPhoto[];
  responsibleTechnical?: string;   // nome do responsável técnico CBC
}

export function validateMeasurementBulletinData(data: MeasurementBulletinData): ValidationReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!data.periodStart || !data.periodEnd) errors.push("Informe o período (início e fim) da medição.");
  else if (new Date(data.periodStart) > new Date(data.periodEnd)) errors.push("A data de início é posterior à de término.");
  if (!data.measurementNumber?.trim()) warnings.push("A medição está sem número.");
  if (data.expenses.length === 0) warnings.push("Nenhum gasto encontrado no período.");
  if (data.photos.length === 0) warnings.push("Nenhuma foto no relatório fotográfico.");
  if (data.phaseProgress.length === 0) warnings.push("Nenhum avanço físico de etapa no período.");
  return { ok: errors.length === 0, errors, warnings };
}

export async function generateMeasurementBulletinPdf(data: MeasurementBulletinData): Promise<void> {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  const m = 14;
  const hasPoppins = registerPoppins(doc);

  const emission = data.emissionDate || new Date().toISOString().slice(0, 10);
  const num = (data.measurementNumber || "01").trim();

  // Cabeçalho específico do boletim.
  const drawBulletinHeader = () => {
    doc.setFillColor(...BRAND.headBg);
    doc.rect(0, 0, w, 30, "F");
    // Nome da empresa em texto: "CHAVES / BRITES / CORREA" empilhado, Poppins bold,
    // palavras alinhadas entre si pela DIREITA. (Substitui a logo em imagem.)
    const words = ["CHAVES", "BRITES", "CORREA"];
    const logoFont = hasPoppins ? "Poppins" : "helvetica";
    doc.setFont(logoFont, "bold");
    doc.setFontSize(11);
    doc.setTextColor(255, 255, 255);
    // Largura da palavra mais larga define a borda direita do bloco.
    const widest = Math.max(...words.map((wd) => doc.getTextWidth(wd)));
    const rightEdge = m + widest;
    let ly = 9;
    words.forEach((wd) => {
      doc.text(wd, rightEdge, ly, { align: "right" });
      ly += 5.2;
    });
    // Subtítulo abaixo.
    doc.setFont(hasPoppins ? "Poppins" : "helvetica", hasPoppins ? "bold" : "normal");
    doc.setFontSize(6);
    doc.setTextColor(190, 185, 180);
    doc.text(COMPANY_SUB.toUpperCase(), m, ly + 1.5);
    // Bloco à direita — número, emissão, período.
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(255, 255, 255);
    doc.text(`BOLETIM DE MEDIÇÃO Nº ${num}`, w - m, 12, { align: "right" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(200, 195, 190);
    doc.text(`Emissão: ${fmtDateBR(emission)}`, w - m, 18, { align: "right" });
    doc.text(`Período: ${fmtDateBR(data.periodStart)} a ${fmtDateBR(data.periodEnd)}`, w - m, 23, { align: "right" });
  };

  let pageNum = 1;
  const footer = () => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...BRAND.soft);
    doc.setDrawColor(...BRAND.line);
    doc.setLineWidth(0.2);
    doc.line(m, h - 12, w - m, h - 12);
    doc.text(`${COMPANY} — Boletim de Medição Nº ${num}`, m, h - 8);
    doc.text(`Página ${pageNum}`, w - m, h - 8, { align: "right" });
  };

  const newPage = () => { footer(); doc.addPage(); pageNum++; drawBulletinHeader(); };
  const ensure = (needed: number, y: number): number => {
    if (y + needed > h - 16) { newPage(); return 36; }
    return y;
  };

  drawBulletinHeader();
  let y = 36;

  // Identificação da obra/cliente.
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(...BRAND.ink);
  doc.text("Obra / Projeto:", m, y);
  doc.setFont("helvetica", "normal");
  doc.text(data.projectName || "—", m + 26, y);
  if (data.clientName) {
    doc.setFont("helvetica", "bold"); doc.text("Cliente:", m, y + 5);
    doc.setFont("helvetica", "normal"); doc.text(data.clientName, m + 26, y + 5);
    y += 5;
  }
  y += 8;

  // -------- RESUMO EXECUTIVO (cards de %) --------
  y = bulletinSectionTitle(doc, "Resumo do Período", y) + 4;
  const cardW = (w - 2 * m - 3 * 3) / 4;
  const cardH = 18;
  // [label, valor, cor do texto, cor do acento/fundo suave]
  const terra: [number, number, number] = [194, 112, 61];
  const azul: [number, number, number] = [62, 124, 139];
  const cards: [string, string, [number, number, number], [number, number, number]][] = [
    ["Físico no Período", `${data.physicalProgressPeriod.toFixed(1)}%`, terra, terra],
    ["Físico Acumulado", `${data.physicalProgressTotal.toFixed(1)}%`, terra, terra],
    ["Financeiro no Período", `${data.financialProgressPeriod.toFixed(1)}%`, azul, azul],
    ["Financeiro Acumulado", `${data.financialProgressTotal.toFixed(1)}%`, azul, azul],
  ];
  cards.forEach(([label, value, color, accent], i) => {
    const x = m + i * (cardW + 3);
    // Fundo suave da cor do acento.
    doc.setFillColor(accent[0], accent[1], accent[2]);
    (doc as any).setGState && (doc as any).setGState(new (doc as any).GState({ opacity: 0.07 }));
    doc.rect(x, y, cardW, cardH, "F");
    (doc as any).setGState && (doc as any).setGState(new (doc as any).GState({ opacity: 1 }));
    // Barra de acento no topo.
    doc.setFillColor(accent[0], accent[1], accent[2]);
    doc.rect(x, y, cardW, 1.4, "F");
    // Rótulo e valor.
    doc.setFont("helvetica", "bold"); doc.setFontSize(5.8); doc.setTextColor(...BRAND.soft);
    doc.text(label.toUpperCase(), x + 2.5, y + 6);
    doc.setFontSize(15); doc.setTextColor(...color);
    doc.text(value, x + 2.5, y + 14);
  });
  y += cardH + 5;

  // Linha de valores (orçamento / gasto período / gasto acumulado).
  doc.setFillColor(...BRAND.zebra); doc.setDrawColor(...BRAND.line); doc.setLineWidth(0.2);
  doc.rect(m, y, w - 2 * m, 11, "FD");
  const vCol = (w - 2 * m) / 3;
  const vals: [string, string][] = [
    ["ORÇAMENTO TOTAL DA OBRA", fmtMoney(data.budgetTotal)],
    ["INVESTIDO NO PERÍODO", fmtMoney(data.spentPeriod)],
    ["INVESTIDO ACUMULADO", fmtMoney(data.spentTotal)],
  ];
  vals.forEach(([l, v], i) => {
    // Divisória vertical entre colunas.
    if (i > 0) { doc.setDrawColor(...BRAND.line); doc.setLineWidth(0.15); doc.line(m + i * vCol, y + 2, m + i * vCol, y + 9); }
    doc.setFont("helvetica", "bold"); doc.setFontSize(5.6); doc.setTextColor(...BRAND.soft);
    doc.text(l, m + i * vCol + 3, y + 4);
    doc.setFontSize(9.5); doc.setTextColor(...BRAND.ink);
    doc.text(v, m + i * vCol + 3, y + 8.5);
  });
  y += 11 + 7;

  // -------- DASHBOARD VISUAL (anéis de progresso do período) --------
  {
    y = ensure(52, y);
    y = bulletinSectionTitle(doc, "Panorama da Medição", y) + 6;
    const terra: [number, number, number] = [194, 112, 61];
    const azul: [number, number, number] = [62, 124, 139];

    // Dois anéis lado a lado: avanço físico e financeiro do período.
    const ringR = 15;
    const ring1X = m + 22;
    const ring2X = w / 2 - 6;
    const ringY = y + ringR + 2;
    drawProgressRing(doc, ring1X, ringY, ringR, data.physicalProgressPeriod,
      terra, "Avanço Físico", `${data.physicalProgressPeriod.toFixed(0)}%`);
    drawProgressRing(doc, ring2X, ringY, ringR, data.financialProgressPeriod,
      azul, "Avanço Financeiro", `${data.financialProgressPeriod.toFixed(0)}%`);

    // Painel de leitura rápida à direita.
    const panelX = w / 2 + 24;
    const panelW = w - m - panelX;
    let py = y + 2;
    // Status geral: compara físico realizado vs previsto (se houver previsto).
    const hasPlanned = data.physicalPlannedPeriod !== undefined;
    const physDev = hasPlanned ? data.physicalProgressPeriod - (data.physicalPlannedPeriod || 0) : 0;
    const statusText = !hasPlanned ? "Medição registrada"
      : physDev >= 2 ? "Obra adiantada"
      : physDev <= -2 ? "Obra atrasada"
      : "Dentro do previsto";
    const statusColor: [number, number, number] = !hasPlanned ? BRAND.soft
      : physDev >= 2 ? [4, 120, 87]
      : physDev <= -2 ? [180, 70, 47]
      : [62, 124, 139];

    // Caixa de status.
    doc.setFillColor(statusColor[0], statusColor[1], statusColor[2]);
    (doc as any).setGState && (doc as any).setGState(new (doc as any).GState({ opacity: 0.10 }));
    doc.rect(panelX, py, panelW, 13, "F");
    (doc as any).setGState && (doc as any).setGState(new (doc as any).GState({ opacity: 1 }));
    doc.setFillColor(statusColor[0], statusColor[1], statusColor[2]);
    doc.rect(panelX, py, 1.6, 13, "F");
    doc.setFont("helvetica", "bold"); doc.setFontSize(9.5); doc.setTextColor(...statusColor);
    doc.text(statusText, panelX + 4, py + 6);
    doc.setFont("helvetica", "normal"); doc.setFontSize(6.5); doc.setTextColor(...BRAND.soft);
    doc.text(`Período de ${fmtDateBR(data.periodStart)} a ${fmtDateBR(data.periodEnd)}`, panelX + 4, py + 10.5);
    py += 16;

    // Mini-indicadores: acumulado físico e financeiro.
    const miniW = (panelW - 3) / 2;
    const minis: [string, string, [number, number, number]][] = [
      ["FÍSICO ACUMULADO", `${data.physicalProgressTotal.toFixed(0)}%`, terra],
      ["FINANC. ACUMULADO", `${data.financialProgressTotal.toFixed(0)}%`, azul],
    ];
    minis.forEach(([l, v, c], i) => {
      const mx = panelX + i * (miniW + 3);
      doc.setFillColor(...BRAND.zebra); doc.setDrawColor(...BRAND.line); doc.setLineWidth(0.15);
      doc.rect(mx, py, miniW, 12, "FD");
      doc.setFont("helvetica", "bold"); doc.setFontSize(5.4); doc.setTextColor(...BRAND.soft);
      doc.text(l, mx + 2, py + 4);
      doc.setFontSize(11); doc.setTextColor(...c);
      doc.text(v, mx + 2, py + 10);
    });

    y = ringY + ringR + 9;
  }

  // -------- COMPARATIVO PREVISTO (cronograma) x REALIZADO (acompanhamento) --------
  if (data.physicalPlannedPeriod !== undefined || data.financialPlannedPeriod !== undefined) {
    y = ensure(42, y);
    y = bulletinSectionTitle(doc, "Comparativo do Período: Previsto x Realizado", y) + 4;

    // Desenha uma linha comparativa (previsto vs realizado) com duas barras.
    const drawCompare = (
      label: string, plannedPct: number, realizedPct: number,
      plannedLabel: string, realizedLabel: string, yPos: number,
    ): number => {
      const barW = w - 2 * m;
      const barH = 4;
      const clamp = (v: number) => Math.max(0, Math.min(100, v));

      doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(...BRAND.ink);
      doc.text(label, m, yPos);

      // Desvio (realizado - previsto), com cor conforme adianta/atrasa.
      const dev = realizedPct - plannedPct;
      const devColor: [number, number, number] = dev >= 0 ? [4, 120, 87] : [180, 70, 47];
      doc.setFont("helvetica", "bold"); doc.setFontSize(7.5); doc.setTextColor(...devColor);
      doc.text(`${dev >= 0 ? "+" : ""}${dev.toFixed(1)}%`, w - m, yPos, { align: "right" });

      // Barra PREVISTO (cinza)
      let by = yPos + 2;
      doc.setFont("helvetica", "normal"); doc.setFontSize(6); doc.setTextColor(...BRAND.soft);
      doc.text("Previsto", m, by + 3);
      doc.setFillColor(...BRAND.zebra); doc.rect(m + 18, by, barW - 18, barH, "F");
      doc.setFillColor(150, 145, 140); doc.rect(m + 18, by, (barW - 18) * (clamp(plannedPct) / 100), barH, "F");
      doc.setTextColor(...BRAND.ink); doc.setFontSize(6);
      doc.text(plannedLabel, w - m, by + 3, { align: "right" });

      // Barra REALIZADO (terracota)
      by += barH + 2;
      doc.setTextColor(...BRAND.soft); doc.setFontSize(6);
      doc.text("Realizado", m, by + 3);
      doc.setFillColor(...BRAND.zebra); doc.rect(m + 18, by, barW - 18, barH, "F");
      doc.setFillColor(194, 112, 61); doc.rect(m + 18, by, (barW - 18) * (clamp(realizedPct) / 100), barH, "F");
      doc.setTextColor(...BRAND.ink); doc.setFontSize(6);
      doc.text(realizedLabel, w - m, by + 3, { align: "right" });

      return by + barH + 6;
    };

    if (data.physicalPlannedPeriod !== undefined) {
      y = drawCompare(
        "Avanço Físico",
        data.physicalPlannedPeriod, data.physicalProgressPeriod,
        `${data.physicalPlannedPeriod.toFixed(1)}%`, `${data.physicalProgressPeriod.toFixed(1)}%`,
        y,
      );
    }
    if (data.financialPlannedPeriod !== undefined) {
      const plannedMoney = data.costPlannedPeriod !== undefined ? `  (${fmtMoney(data.costPlannedPeriod)})` : "";
      y = drawCompare(
        "Avanço Financeiro",
        data.financialPlannedPeriod, data.financialProgressPeriod,
        `${data.financialPlannedPeriod.toFixed(1)}%${plannedMoney}`,
        `${data.financialProgressPeriod.toFixed(1)}%  (${fmtMoney(data.spentPeriod)})`,
        y,
      );
    }

    // Legenda interpretativa.
    doc.setFont("helvetica", "italic"); doc.setFontSize(6.5); doc.setTextColor(...BRAND.soft);
    doc.text("Valores positivos indicam adiantamento em relação ao planejado; negativos, atraso.", m, y);
    y += 6;
  }

  // -------- RESUMO TEXTUAL (acumulado) --------
  if (data.summaryText && data.summaryText.trim()) {
    y = ensure(30, y);
    y = bulletinSectionTitle(doc, "Situação Geral da Obra", y) + 3;
    doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(...BRAND.ink);
    const lines = doc.splitTextToSize(data.summaryText.trim(), w - 2 * m);
    doc.text(lines, m, y);
    y += lines.length * 4.4 + 6;
  }

  // -------- AVANÇO FÍSICO DAS ETAPAS (com barras) --------
  if (data.phaseProgress.length > 0) {
    y = ensure(20, y);
    y = bulletinSectionTitle(doc, "Avanço Físico das Etapas no Período", y) + 4;

    // Mostra só as etapas que tiveram avanço no período (evita poluir com 0%),
    // mas se nenhuma teve avanço, mostra todas para não ficar vazio.
    const withProgress = data.phaseProgress.filter(ph => (ph.progressEnd - ph.progressStart) > 0.5);
    const toShow = withProgress.length > 0 ? withProgress : data.phaseProgress;

    doc.setFontSize(7.5);
    toShow.forEach((ph) => {
      y = ensure(9, y);
      const delta = ph.progressEnd - ph.progressStart;
      // Nome da etapa à esquerda.
      doc.setFont("helvetica", "bold"); doc.setTextColor(...BRAND.ink); doc.setFontSize(7.5);
      doc.text(ph.name, m, y);
      // Progresso à direita. Se a etapa começou o período em 0% (nova no período),
      // mostra apenas o valor executado. Se já tinha avanço anterior, mostra "de Y% para X%".
      doc.setFont("helvetica", "normal"); doc.setTextColor(...BRAND.soft); doc.setFontSize(7);
      const hadPrevious = ph.progressStart > 0.5;
      const rangeText = hadPrevious
        ? `de ${ph.progressStart.toFixed(0)}% para ${ph.progressEnd.toFixed(0)}%`
        : `executado: ${ph.progressEnd.toFixed(0)}%`;
      const deltaText = delta > 0.5 ? `+${delta.toFixed(0)}%` : "sem avanço";
      // Desenha a variação em terracota, e o texto de contexto em cinza à esquerda dela.
      doc.setFont("helvetica", "bold");
      doc.setTextColor(delta > 0.5 ? 194 : 168, delta > 0.5 ? 112 : 162, delta > 0.5 ? 61 : 158);
      doc.text(deltaText, w - m, y, { align: "right" });
      const deltaW = doc.getTextWidth(deltaText);
      doc.setFont("helvetica", "normal"); doc.setTextColor(...BRAND.soft);
      doc.text(rangeText, w - m - deltaW - 3, y, { align: "right" });

      // Barra: fundo + parte já feita antes do período (cinza) + avanço do período (terracota).
      const barY = y + 1.8, barW = w - 2 * m, barH = 2.6;
      doc.setFillColor(...BRAND.zebra); doc.rect(m, barY, barW, barH, "F");
      doc.setFillColor(214, 211, 209); doc.rect(m, barY, barW * (ph.progressStart / 100), barH, "F");
      doc.setFillColor(194, 112, 61); // terracota: avanço do período
      const startX = m + barW * (ph.progressStart / 100);
      doc.rect(startX, barY, barW * (Math.max(0, delta) / 100), barH, "F");
      y += 7;
    });
    y += 3;
  }

  // -------- PLANILHA DE GASTOS DO PERÍODO --------
  y = ensure(24, y);
  y = bulletinSectionTitle(doc, "Gastos do Período", y) + 2;
  const expBody = data.expenses.map((e) => [
    fmtDateBR(e.date), e.description || "—", e.category || "—", e.supplier || "—", fmtMoney(e.value),
  ]);
  const expTotal = data.expenses.reduce((s, e) => s + (e.value || 0), 0);
  expBody.push([
    { content: "TOTAL DO PERÍODO", colSpan: 4, styles: { halign: "right", fontStyle: "bold", fillColor: BRAND.headBg, textColor: BRAND.headText } } as any,
    { content: fmtMoney(expTotal), styles: { halign: "right", fontStyle: "bold", fillColor: BRAND.headBg, textColor: BRAND.headText } } as any,
  ]);
  autoTable(doc, {
    head: [["Data", "Descrição", "Categoria", "Fornecedor", "Valor"]],
    body: expBody,
    startY: y,
    margin: { left: m, right: m },
    styles: { fontSize: 7, cellPadding: 1.4, overflow: "linebreak", lineColor: BRAND.line, lineWidth: 0.1, textColor: BRAND.ink },
    headStyles: { fillColor: BRAND.headBg, textColor: BRAND.headText, fontStyle: "bold", fontSize: 7, halign: "center" },
    alternateRowStyles: { fillColor: BRAND.zebra },
    columnStyles: { 0: { cellWidth: 20, halign: "center" }, 2: { cellWidth: 30 }, 3: { cellWidth: 34 }, 4: { cellWidth: 26, halign: "right" } },
    didDrawPage: () => { /* autoTable gerencia páginas próprias */ },
  });
  y = ((doc as any).lastAutoTable?.finalY || y) + 6;

  // -------- RELATÓRIO FOTOGRÁFICO --------
  if (data.photos.length > 0) {
    newPage(); y = 36;
    y = bulletinSectionTitle(doc, "Relatório Fotográfico", y) + 4;
    const gap = 4;
    const cols = 2;
    const cellW = (w - 2 * m - (cols - 1) * gap) / cols;
    const imgH = 52;
    let col = 0;
    let rowY = y;
    for (let i = 0; i < data.photos.length; i++) {
      const photo = data.photos[i];
      if (col === 0) { rowY = ensure(imgH + 12, rowY); }
      const x = m + col * (cellW + gap);
      // Moldura
      doc.setDrawColor(...BRAND.line); doc.setLineWidth(0.2);
      doc.setFillColor(248, 248, 247);
      doc.rect(x, rowY, cellW, imgH, "FD");
      try {
        // Detecta formato pela assinatura do data URL.
        const fmt = /png/i.test(photo.url) ? "PNG" : "JPEG";
        doc.addImage(photo.url, fmt, x + 1, rowY + 1, cellW - 2, imgH - 2, undefined, "FAST");
      } catch {
        doc.setFont("helvetica", "italic"); doc.setFontSize(7); doc.setTextColor(...BRAND.soft);
        doc.text("(imagem indisponível)", x + cellW / 2, rowY + imgH / 2, { align: "center" });
      }
      // Legenda
      const cap = photo.caption?.trim() || `Foto ${i + 1}`;
      doc.setFont("helvetica", "normal"); doc.setFontSize(6.5); doc.setTextColor(...BRAND.ink);
      const capLines = doc.splitTextToSize(cap, cellW);
      doc.text(capLines.slice(0, 2), x, rowY + imgH + 3.5);

      col++;
      if (col >= cols) { col = 0; rowY += imgH + 12; }
    }
    if (col !== 0) rowY += imgH + 12;
    y = rowY + 2;
  }

  // -------- ASSINATURAS --------
  y = ensure(40, y);
  y = bulletinSectionTitle(doc, "Aprovação da Medição", y) + 12;
  const sigW = (w - 2 * m - 20) / 2;
  const drawSig = (x: number, label: string, sub: string) => {
    doc.setDrawColor(...BRAND.ink); doc.setLineWidth(0.3);
    doc.line(x, y, x + sigW, y);
    doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(...BRAND.ink);
    doc.text(label, x + sigW / 2, y + 4.5, { align: "center" });
    doc.setFont("helvetica", "normal"); doc.setFontSize(6.5); doc.setTextColor(...BRAND.soft);
    doc.text(sub, x + sigW / 2, y + 8.5, { align: "center" });
  };
  drawSig(m, data.clientName || "Cliente", "Contratante");
  drawSig(m + sigW + 20, data.responsibleTechnical || COMPANY, "Responsável Técnico");
  y += 16;

  footer();
  const safeName = (data.projectName || "obra").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-").toLowerCase();
  doc.save(`medicao-${num}-${safeName}.pdf`);
}
