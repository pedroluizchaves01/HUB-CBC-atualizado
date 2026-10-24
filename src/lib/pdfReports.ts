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
  unproductiveDays?: { date: string; reason?: string }[]; // dias sem trabalho NO período
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

type RGB = [number, number, number];
type IconKind =
  | "building" | "user" | "calendar" | "chart" | "wallet" | "check" | "camera"
  | "pen" | "alert" | "list" | "helmet" | "trend" | "clock" | "quote";

/**
 * Boletim de Medição — layout próprio, na mesma identidade do app (preto, branco e
 * laranja #FF5A35, cartões arredondados, cabeçalho escuro com grade técnica e brilho
 * laranja, como o painel visual da tela de login). Ícones são vetoriais (desenhados
 * com primitivas do jsPDF) para não depender de imagens.
 */
export async function generateMeasurementBulletinPdf(data: MeasurementBulletinData): Promise<void> {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 12;
  const CW = W - 2 * M;
  const HF = registerPoppins(doc) ? "Poppins" : "helvetica";
  const num = (data.measurementNumber || "01").trim();
  const emission = data.emissionDate || new Date().toISOString().slice(0, 10);
  const TOP = 26;          // início do conteúdo nas páginas de continuação (abaixo do cabeçalho compacto)
  const BOTTOM = H - 18;   // limite inferior do conteúdo (acima do rodapé)

  const C = {
    ink: [24, 24, 27] as RGB,
    graphite: [63, 63, 70] as RGB,
    muted: [113, 113, 122] as RGB,
    faint: [161, 161, 170] as RGB,
    line: [228, 228, 231] as RGB,
    card: [250, 250, 250] as RGB,
    soft: [244, 244, 245] as RGB,
    softer: [228, 228, 231] as RGB,
    orange: [255, 90, 53] as RGB,
    orangeSoft: [255, 238, 232] as RGB,
    green: [5, 150, 105] as RGB,
    greenSoft: [220, 252, 231] as RGB,
    red: [220, 38, 38] as RGB,
    redSoft: [254, 226, 226] as RGB,
    amber: [180, 83, 9] as RGB,
    amberSoft: [254, 243, 199] as RGB,
    white: [255, 255, 255] as RGB,
  };

  // ---------------------------------------------------------------- utilitários
  const anyDoc = doc as any;
  // "stroke-opacity" explícito: sem ele a transparência só vale para preenchimentos e
  // as linhas da grade/contornos saem em opacidade total.
  const opacity = (o: number) => {
    if (anyDoc.setGState && anyDoc.GState) anyDoc.setGState(new anyDoc.GState({ opacity: o, "stroke-opacity": o }));
  };
  // A Poppins embutida é um subconjunto (maiúsculas, dígitos e alguns acentos — feito
  // para o nome da empresa). Texto com caractere fora dele cai para Helvetica, senão
  // o PDF corta a palavra no primeiro glifo ausente.
  const POPPINS_SAFE = /^[ %(),\-./0-9:A-EG-JL-VxªºÀÁÂÃÇÉÊÍÓÔÕÚàáâãçéêíóôõú]*$/;
  const hf = (text: string) => (HF === "Poppins" && POPPINS_SAFE.test(text) ? "Poppins" : "helvetica");
  const withAlpha = (o: number, fn: () => void) => { opacity(o); fn(); opacity(1); };
  const fill = (c: RGB) => doc.setFillColor(c[0], c[1], c[2]);
  const stroke = (c: RGB) => doc.setDrawColor(c[0], c[1], c[2]);
  const ink = (c: RGB) => doc.setTextColor(c[0], c[1], c[2]);
  const font = (family: string, style: string, size: number, color: RGB) => {
    doc.setFont(family, style); doc.setFontSize(size); ink(color);
  };
  const lineCap = (cap: "butt" | "round") => { anyDoc.setLineCap?.(cap); anyDoc.setLineJoin?.(cap === "round" ? "round" : "miter"); };
  const pctBR = (v: number, digits = 1) => `${(Number(v) || 0).toFixed(digits).replace(".", ",")}%`;
  const fit = (text: string, maxW: number): string => {
    if (doc.getTextWidth(text) <= maxW) return text;
    let t = text;
    while (t.length > 1 && doc.getTextWidth(t + "…") > maxW) t = t.slice(0, -1);
    return t + "…";
  };

  const card = (x: number, y: number, w: number, h: number, bg: RGB = C.white, border: RGB | null = C.line, r = 2.6) => {
    fill(bg);
    if (border) { stroke(border); doc.setLineWidth(0.2); doc.roundedRect(x, y, w, h, r, r, "FD"); }
    else doc.roundedRect(x, y, w, h, r, r, "F");
  };

  /** Pílula com texto (chip). Retorna a largura. */
  const pill = (
    text: string, x: number, y: number, bg: RGB, fg: RGB,
    opts: { align?: "left" | "right"; size?: number; bold?: boolean; family?: string } = {},
  ): number => {
    const size = opts.size ?? 6;
    doc.setFont(opts.family ?? "helvetica", opts.bold === false ? "normal" : "bold");
    doc.setFontSize(size);
    const tw = doc.getTextWidth(text);
    const ph = size * 0.55 + 2.2;
    const pw = tw + 4.4;
    const px = opts.align === "right" ? x - pw : x;
    fill(bg); doc.roundedRect(px, y, pw, ph, ph / 2, ph / 2, "F");
    ink(fg); doc.text(text, px + 2.2, y + ph / 2 + size * 0.13);
    return pw;
  };

  /** Arco/elipse aproximado por segmentos (jsPDF não tem arco parcial nativo). */
  const arc = (cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, steps = 24) => {
    let px = cx + rx * Math.cos(a0), py = cy + ry * Math.sin(a0);
    for (let i = 1; i <= steps; i++) {
      const a = a0 + ((a1 - a0) * i) / steps;
      const x = cx + rx * Math.cos(a), y = cy + ry * Math.sin(a);
      doc.line(px, py, x, y);
      px = x; py = y;
    }
  };

  /** Ícones vetoriais simples, traço arredondado — linguagem dos ícones do app. */
  const icon = (kind: IconKind, cx: number, cy: number, s: number, color: RGB) => {
    stroke(color); fill(color);
    doc.setLineWidth(Math.max(0.25, s * 0.09));
    lineCap("round");
    const h = s / 2;
    switch (kind) {
      case "building":
        doc.line(cx - h * 0.9, cy - h * 0.15, cx, cy - h * 0.85);
        doc.line(cx, cy - h * 0.85, cx + h * 0.9, cy - h * 0.15);
        doc.roundedRect(cx - h * 0.65, cy - h * 0.2, h * 1.3, h * 1.0, 0.3, 0.3, "S");
        doc.line(cx, cy + h * 0.8, cx, cy + h * 0.35);
        break;
      case "user":
        doc.circle(cx, cy - h * 0.35, h * 0.35, "S");
        arc(cx, cy + h * 0.85, h * 0.7, h * 0.65, Math.PI, 2 * Math.PI, 16);
        break;
      case "calendar":
        doc.roundedRect(cx - h * 0.8, cy - h * 0.6, h * 1.6, h * 1.45, 0.5, 0.5, "S");
        doc.line(cx - h * 0.8, cy - h * 0.15, cx + h * 0.8, cy - h * 0.15);
        doc.line(cx - h * 0.4, cy - h * 0.85, cx - h * 0.4, cy - h * 0.45);
        doc.line(cx + h * 0.4, cy - h * 0.85, cx + h * 0.4, cy - h * 0.45);
        break;
      case "chart": {
        const bw = h * 0.38;
        doc.roundedRect(cx - h * 0.8, cy + h * 0.1, bw, h * 0.7, 0.2, 0.2, "F");
        doc.roundedRect(cx - bw / 2, cy - h * 0.35, bw, h * 1.15, 0.2, 0.2, "F");
        doc.roundedRect(cx + h * 0.8 - bw, cy - h * 0.8, bw, h * 1.6, 0.2, 0.2, "F");
        break;
      }
      case "wallet":
        doc.roundedRect(cx - h * 0.85, cy - h * 0.6, h * 1.7, h * 1.3, 0.5, 0.5, "S");
        doc.roundedRect(cx + h * 0.2, cy - h * 0.2, h * 0.65, h * 0.5, 0.3, 0.3, "S");
        doc.circle(cx + h * 0.45, cy + h * 0.05, h * 0.08, "F");
        break;
      case "check":
        doc.circle(cx, cy, h * 0.85, "S");
        doc.line(cx - h * 0.4, cy, cx - h * 0.1, cy + h * 0.32);
        doc.line(cx - h * 0.1, cy + h * 0.32, cx + h * 0.42, cy - h * 0.3);
        break;
      case "camera":
        doc.roundedRect(cx - h * 0.85, cy - h * 0.45, h * 1.7, h * 1.2, 0.5, 0.5, "S");
        doc.circle(cx, cy + h * 0.15, h * 0.35, "S");
        doc.line(cx - h * 0.35, cy - h * 0.45, cx - h * 0.2, cy - h * 0.72);
        doc.line(cx - h * 0.2, cy - h * 0.72, cx + h * 0.2, cy - h * 0.72);
        doc.line(cx + h * 0.2, cy - h * 0.72, cx + h * 0.35, cy - h * 0.45);
        break;
      case "pen":
        doc.line(cx - h * 0.55, cy + h * 0.55, cx + h * 0.6, cy - h * 0.6);
        doc.line(cx - h * 0.55, cy + h * 0.55, cx - h * 0.75, cy + h * 0.78);
        doc.line(cx - h * 0.9, cy + h * 0.9, cx + h * 0.9, cy + h * 0.9);
        break;
      case "alert":
        doc.line(cx, cy - h * 0.85, cx + h * 0.9, cy + h * 0.7);
        doc.line(cx + h * 0.9, cy + h * 0.7, cx - h * 0.9, cy + h * 0.7);
        doc.line(cx - h * 0.9, cy + h * 0.7, cx, cy - h * 0.85);
        doc.line(cx, cy - h * 0.25, cx, cy + h * 0.15);
        doc.circle(cx, cy + h * 0.42, h * 0.06, "F");
        break;
      case "list":
        [-0.5, 0, 0.5].forEach((o) => {
          doc.circle(cx - h * 0.65, cy + h * o, h * 0.09, "F");
          doc.line(cx - h * 0.3, cy + h * o, cx + h * 0.8, cy + h * o);
        });
        break;
      case "helmet":
        arc(cx, cy + h * 0.3, h * 0.7, h * 0.85, Math.PI, 2 * Math.PI, 16);
        doc.line(cx - h * 0.95, cy + h * 0.3, cx + h * 0.95, cy + h * 0.3);
        doc.line(cx, cy - h * 0.55, cx, cy - h * 0.1);
        break;
      case "trend":
        doc.line(cx - h * 0.85, cy + h * 0.55, cx - h * 0.25, cy - h * 0.05);
        doc.line(cx - h * 0.25, cy - h * 0.05, cx + h * 0.1, cy + h * 0.25);
        doc.line(cx + h * 0.1, cy + h * 0.25, cx + h * 0.85, cy - h * 0.55);
        doc.line(cx + h * 0.85, cy - h * 0.55, cx + h * 0.4, cy - h * 0.55);
        doc.line(cx + h * 0.85, cy - h * 0.55, cx + h * 0.85, cy - h * 0.1);
        break;
      case "clock":
        doc.circle(cx, cy, h * 0.85, "S");
        doc.line(cx, cy, cx, cy - h * 0.5);
        doc.line(cx, cy, cx + h * 0.35, cy + h * 0.2);
        break;
      case "quote":
        doc.circle(cx - h * 0.4, cy - h * 0.1, h * 0.28, "F");
        doc.circle(cx + h * 0.35, cy - h * 0.1, h * 0.28, "F");
        doc.line(cx - h * 0.62, cy - h * 0.05, cx - h * 0.75, cy + h * 0.55);
        doc.line(cx + h * 0.13, cy - h * 0.05, cx, cy + h * 0.55);
        break;
    }
    lineCap("butt");
  };

  const iconTile = (kind: IconKind, x: number, y: number, size: number, color: RGB, bg: RGB) => {
    fill(bg); doc.roundedRect(x, y, size, size, size * 0.3, size * 0.3, "F");
    icon(kind, x + size / 2, y + size / 2, size * 0.52, color);
  };

  /** Barra de progresso com cantos arredondados. */
  const bar = (x: number, y: number, w: number, h: number, pct: number, color: RGB, track: RGB = C.soft) => {
    fill(track); doc.roundedRect(x, y, w, h, h / 2, h / 2, "F");
    const fw = (w * Math.max(0, Math.min(100, pct))) / 100;
    if (fw > 0.3) { fill(color); doc.roundedRect(x, y, Math.max(fw, h), h, h / 2, h / 2, "F"); }
  };

  /** Anel de progresso suave com pontas arredondadas. */
  const ring = (cx: number, cy: number, r: number, pct: number, color: RGB, track: RGB, thick: number) => {
    const p = Math.max(0, Math.min(100, pct));
    stroke(track); doc.setLineWidth(thick); doc.circle(cx, cy, r, "S");
    if (p <= 0) return;
    stroke(color); doc.setLineWidth(thick);
    lineCap("round");
    const a0 = -Math.PI / 2;
    arc(cx, cy, r, r, a0, a0 + (p / 100) * 2 * Math.PI, Math.max(2, Math.round(p * 1.4)));
    lineCap("butt");
  };

  /** Título de seção: ícone em bloco laranja suave + título Poppins + subtítulo + chip opcional à direita. */
  const section = (title: string, subtitle: string | null, kind: IconKind, y: number, right?: string): number => {
    iconTile(kind, M, y, 7, C.orange, C.orangeSoft);
    const t = title.toUpperCase();
    font(hf(t), "bold", 9.5, C.ink);
    doc.text(t, M + 9.5, y + (subtitle ? 3.4 : 4.9), { charSpace: 0.15 });
    if (subtitle) { font("helvetica", "normal", 6.6, C.muted); doc.text(subtitle, M + 9.5, y + 6.6); }
    if (right) pill(right, W - M, y + 0.8, C.ink, C.white, { align: "right", size: 6.5 });
    return y + 10.5;
  };

  const ensure = (needed: number, y: number): number => {
    if (y + needed > BOTTOM) { doc.addPage(); return TOP; }
    return y;
  };

  // ------------------------------------------------- 1. CABEÇALHO (cartão escuro)
  const heroH = 48;
  {
    const x = M, y = M, w = CW, h = heroH;
    fill(C.ink); doc.roundedRect(x, y, w, h, 4, 4, "F");

    // Grade técnica (blueprint), bem sutil — mesma do painel visual do login.
    stroke(C.white); doc.setLineWidth(0.1);
    withAlpha(0.06, () => {
      for (let gx = x + 6; gx < x + w - 2; gx += 6) doc.line(gx, y + 1.5, gx, y + h - 1.5);
      for (let gy = y + 6; gy < y + h - 2; gy += 6) doc.line(x + 1.5, gy, x + w - 1.5, gy);
    });

    // Brilho laranja atrás do anel.
    const rcx = x + w - 22, rcy = y + h / 2;
    fill(C.orange);
    ([[22, 0.05], [15, 0.07], [9, 0.1]] as [number, number][]).forEach(([r, o]) =>
      withAlpha(o, () => doc.circle(rcx, rcy, r, "F")));

    // Esquerda: selo + marca, título, obra/cliente.
    const lx = x + 8;
    const pw = pill("BOLETIM DE MEDIÇÃO", lx, y + 6, C.orange, C.white, { size: 5.6 });
    font(HF, "bold", 6.8, [200, 200, 205]);
    doc.text("CHAVES BRITES CORREA", lx + pw + 3, y + 10.2);

    font(hf("MEDIÇÃO"), "bold", 24, C.white);
    doc.text("MEDIÇÃO", lx, y + 22);
    const tw = doc.getTextWidth("MEDIÇÃO ");
    ink(C.orange);
    doc.text(`Nº ${num}`, lx + tw, y + 22);

    font("helvetica", "bold", 8.5, [228, 228, 231]);
    doc.text(fit(data.projectName || "—", 98), lx, y + 28.5);
    if (data.clientName) {
      font("helvetica", "normal", 7, C.faint);
      doc.text(fit(`Cliente: ${data.clientName}`, 98), lx, y + 33);
    }

    // Chips de vidro: emissão e período.
    const glass = (label: string, value: string, gx: number, gy: number): number => {
      doc.setFont("helvetica", "bold"); doc.setFontSize(5.4);
      const lw = doc.getTextWidth(label);
      doc.setFontSize(6.6);
      const vw = doc.getTextWidth(value);
      const gw = lw + vw + 7.2, gh = 6.4;
      withAlpha(0.09, () => { fill(C.white); doc.roundedRect(gx, gy, gw, gh, gh / 2, gh / 2, "F"); });
      withAlpha(0.22, () => { stroke(C.white); doc.setLineWidth(0.15); doc.roundedRect(gx, gy, gw, gh, gh / 2, gh / 2, "S"); });
      doc.setFontSize(5.4); ink(C.faint); doc.text(label, gx + 2.8, gy + 4.15);
      doc.setFontSize(6.6); ink(C.white); doc.text(value, gx + 2.8 + lw + 1.6, gy + 4.25);
      return gw;
    };
    let gx = lx;
    gx += glass("EMISSÃO", fmtDateBR(emission), gx, y + 37) + 2.5;
    glass("PERÍODO", `${fmtDateBR(data.periodStart)} a ${fmtDateBR(data.periodEnd)}`, gx, y + 37);

    // Direita: indicadores acumulados + anel do avanço físico acumulado.
    const rx = x + w - 40;
    font("helvetica", "bold", 5.2, C.faint);
    doc.text("FINANCEIRO ACUMULADO", rx, y + 15, { align: "right" });
    font(HF, "bold", 11, C.white);
    doc.text(pctBR(data.financialProgressTotal), rx, y + 20.5, { align: "right" });
    font("helvetica", "bold", 5.2, C.faint);
    doc.text("INVESTIDO ACUMULADO", rx, y + 28, { align: "right" });
    font(hf(fmtMoney(data.spentTotal)), "bold", 9.5, C.white);
    doc.text(fmtMoney(data.spentTotal), rx, y + 33.2, { align: "right" });

    ring(rcx, rcy, 12, data.physicalProgressTotal, C.orange, [63, 63, 70], 3.2);
    font(HF, "bold", 11, C.white);
    doc.text(`${Math.round(data.physicalProgressTotal)}%`, rcx, rcy + 1.2, { align: "center" });
    font("helvetica", "bold", 4.6, C.faint);
    doc.text("FÍSICO", rcx, rcy + 4.6, { align: "center" });
    font("helvetica", "bold", 5, C.faint);
    doc.text("AVANÇO ACUMULADO", rcx, rcy + 18, { align: "center" });
  }
  let y = M + heroH + 5;

  // ------------------------------------------------- 2. IDENTIFICAÇÃO (3 cartões)
  {
    const gap = 4;
    const cw3 = (CW - 2 * gap) / 3;
    const items: [IconKind, string, string][] = [
      ["building", "OBRA / PROJETO", data.projectName || "—"],
      ["user", "CLIENTE", data.clientName || "—"],
      ["helmet", "RESPONSÁVEL TÉCNICO", data.responsibleTechnical || "Equipe técnica CBC"],
    ];
    items.forEach(([kind, label, value], i) => {
      const x = M + i * (cw3 + gap);
      card(x, y, cw3, 15, C.card, C.line);
      iconTile(kind, x + 3.5, y + 4, 7, C.ink, C.white);
      font("helvetica", "bold", 5.3, C.muted);
      doc.text(label, x + 13, y + 6.4);
      font("helvetica", "bold", 7.8, C.ink);
      doc.text(fit(value, cw3 - 16), x + 13, y + 11);
    });
    y += 15 + 7;
  }

  // ------------------------------------------------- 3. RESUMO DO PERÍODO (KPIs)
  y = section("Resumo do período", "Avanço físico e financeiro registrado nesta medição", "chart", y);
  {
    const gap = 3;
    const kw = (CW - 3 * gap) / 4;
    const kh = 27;
    const kpis: [IconKind, string, number, RGB, RGB, string][] = [
      ["trend", "FÍSICO NO PERÍODO", data.physicalProgressPeriod, C.orange, C.orangeSoft, "avanço desta medição"],
      ["building", "FÍSICO ACUMULADO", data.physicalProgressTotal, C.orange, C.orangeSoft, "da obra executada"],
      ["wallet", "FINANCEIRO NO PERÍODO", data.financialProgressPeriod, C.graphite, C.softer, "do orçamento no período"],
      ["chart", "FINANCEIRO ACUMULADO", data.financialProgressTotal, C.graphite, C.softer, "do orçamento total"],
    ];
    kpis.forEach(([kind, label, value, color, soft, caption], i) => {
      const x = M + i * (kw + gap);
      card(x, y, kw, kh, C.card, C.line);
      iconTile(kind, x + 3, y + 3, 6.4, color, soft);
      font("helvetica", "bold", 5.2, C.muted);
      doc.text(fit(label, kw - 13), x + 11.2, y + 7.2);
      font(HF, "bold", 16, color);
      doc.text(pctBR(value), x + 3, y + 18.3);
      bar(x + 3, y + 20.8, kw - 6, 2.2, value, color);
      font("helvetica", "normal", 5, C.faint);
      doc.text(caption, x + 3, y + 25.4);
    });
    y += kh + 4;
  }

  // Valores: orçamento, investido no período, acumulado + consumo do orçamento.
  {
    const h = 25;
    card(M, y, CW, h, C.white, C.line);
    const col = CW / 3;
    const vals: [IconKind, string, string, RGB, RGB][] = [
      ["wallet", "ORÇAMENTO TOTAL DA OBRA", fmtMoney(data.budgetTotal), C.ink, C.soft],
      ["trend", "INVESTIDO NO PERÍODO", fmtMoney(data.spentPeriod), C.orange, C.orangeSoft],
      ["list", "INVESTIDO ACUMULADO", fmtMoney(data.spentTotal), C.graphite, C.soft],
    ];
    vals.forEach(([kind, label, value, color, soft], i) => {
      const x = M + i * col;
      if (i > 0) { stroke(C.line); doc.setLineWidth(0.2); doc.line(x, y + 3.5, x, y + 12.5); }
      iconTile(kind, x + 4, y + 4, 7, color, soft);
      font("helvetica", "bold", 5.2, C.muted);
      doc.text(label, x + 13.5, y + 6.8);
      font(hf(value), "bold", 9.5, i === 1 ? C.orange : C.ink);
      doc.text(value, x + 13.5, y + 11.8);
    });
    const consumo = data.budgetTotal > 0 ? (data.spentTotal / data.budgetTotal) * 100 : 0;
    stroke(C.line); doc.setLineWidth(0.15); doc.line(M + 4, y + 15.5, M + CW - 4, y + 15.5);
    font("helvetica", "bold", 5.4, C.muted);
    const lbl = "CONSUMO DO ORÇAMENTO";
    doc.text(lbl, M + 4, y + 20.6);
    const bx = M + 4 + doc.getTextWidth(lbl) + 4;
    font(HF, "bold", 7.5, C.ink);
    const pctTxt = pctBR(consumo);
    doc.text(pctTxt, M + CW - 4, y + 20.9, { align: "right" });
    bar(bx, y + 18.8, M + CW - 4 - doc.getTextWidth(pctTxt) - 4 - bx, 2.4, consumo, consumo > 100 ? C.red : C.orange);
    y += h + 7;
  }

  // ------------------------------------------------- 4. DIAS IMPRODUTIVOS
  if (data.unproductiveDays && data.unproductiveDays.length > 0) {
    font("helvetica", "normal", 6.3, C.graphite);
    const txt = data.unproductiveDays
      .map((d) => `${fmtDateBR(d.date)}${d.reason ? ` (${d.reason})` : ""}`)
      .join("   ·   ");
    const lines = doc.splitTextToSize(txt, CW - 20) as string[];
    const h = 10 + lines.length * 3;
    y = ensure(h + 4, y);
    card(M, y, CW, h, C.amberSoft, null);
    iconTile("alert", M + 3.5, y + 3, 7, C.amber, C.white);
    font("helvetica", "bold", 7.2, C.amber);
    doc.text(`${data.unproductiveDays.length} dia(s) improdutivo(s) no período`, M + 13.5, y + 6.2);
    font("helvetica", "normal", 6.3, C.graphite);
    doc.text(lines, M + 13.5, y + 9.6);
    y += h + 7;
  }

  // ------------------------------------------------- 5. PANORAMA + PREVISTO x REALIZADO
  y = ensure(64, y);
  y = section("Panorama da medição", "Leitura rápida do período e comparação com o cronograma", "clock", y);
  {
    const ch = 50;
    const lw = CW * 0.4;
    const rw = CW - lw - 4;
    const lx = M, rx = M + lw + 4;

    // Esquerda: dois anéis + status.
    card(lx, y, lw, ch, C.card, C.line);
    const rings: [number, number, RGB, string][] = [
      [lx + lw * 0.27, data.physicalProgressPeriod, C.orange, "FÍSICO"],
      [lx + lw * 0.73, data.financialProgressPeriod, C.graphite, "FINANCEIRO"],
    ];
    rings.forEach(([cx, v, color, label]) => {
      const cy = y + 17;
      ring(cx, cy, 9.5, v, color, C.softer, 2.6);
      font(HF, "bold", 9.5, color);
      doc.text(`${Math.round(v)}%`, cx, cy + 1.3, { align: "center" });
      font("helvetica", "bold", 5.4, C.ink);
      doc.text(label, cx, cy + 14, { align: "center" });
      font("helvetica", "normal", 5, C.faint);
      doc.text("no período", cx, cy + 16.8, { align: "center" });
    });

    const hasPlanned = data.physicalPlannedPeriod !== undefined;
    const dev = hasPlanned ? data.physicalProgressPeriod - (data.physicalPlannedPeriod || 0) : 0;
    const [stText, stFg, stBg]: [string, RGB, RGB] = !hasPlanned
      ? ["Medição registrada", C.graphite, C.soft]
      : dev >= 2 ? ["Obra adiantada", C.green, C.greenSoft]
      : dev <= -2 ? ["Obra atrasada", C.red, C.redSoft]
      : ["Dentro do previsto", C.graphite, C.soft];
    doc.setFont("helvetica", "bold"); doc.setFontSize(6.6);
    const sw = doc.getTextWidth(stText) + 9;
    const sx = lx + (lw - sw) / 2, sy = y + ch - 9.5;
    fill(stBg); doc.roundedRect(sx, sy, sw, 6, 3, 3, "F");
    fill(stFg); doc.circle(sx + 3.2, sy + 3, 0.9, "F");
    ink(stFg); doc.text(stText, sx + 5.3, sy + 4.1);

    // Direita: previsto x realizado.
    card(rx, y, rw, ch, C.white, C.line);
    font("helvetica", "bold", 7.6, C.ink);
    doc.text("Previsto x Realizado", rx + 5, y + 7.2);
    const legend: [string, RGB][] = [["Realizado", C.orange], ["Previsto", [190, 190, 196]]];
    let lgx = rx + rw - 5;
    legend.forEach(([t, c]) => {
      font("helvetica", "normal", 5.6, C.muted);
      const tw = doc.getTextWidth(t);
      doc.text(t, lgx, y + 7, { align: "right" });
      fill(c); doc.roundedRect(lgx - tw - 4, y + 4.9, 2.6, 2.6, 0.6, 0.6, "F");
      lgx -= tw + 8;
    });

    const blocks: [string, number | undefined, number, string, RGB][] = [
      ["Avanço físico", data.physicalPlannedPeriod, data.physicalProgressPeriod, "", C.orange],
      ["Avanço financeiro", data.financialPlannedPeriod, data.financialProgressPeriod,
        `  (${fmtMoney(data.spentPeriod)})`, C.graphite],
    ];
    const anyPlanned = blocks.some(([, p]) => p !== undefined);
    if (!anyPlanned) {
      icon("clock", rx + rw / 2, y + 23, 7, C.faint);
      font("helvetica", "bold", 7, C.graphite);
      doc.text("Sem cronograma previsto vinculado", rx + rw / 2, y + 32, { align: "center" });
      font("helvetica", "normal", 5.8, C.faint);
      doc.text("O comparativo aparece quando a medição tem metas do cronograma.", rx + rw / 2, y + 35.8, { align: "center" });
    } else {
      let by = y + 14.5;
      blocks.forEach(([label, planned, realized, extra, color]) => {
        if (planned === undefined) return;
        font("helvetica", "bold", 6.8, C.ink);
        doc.text(label, rx + 5, by);
        const d = realized - planned;
        pill(`${d >= 0 ? "+" : ""}${d.toFixed(1).replace(".", ",")}%`, rx + rw - 5, by - 3.6,
          d >= 0 ? C.greenSoft : C.redSoft, d >= 0 ? C.green : C.red, { align: "right", size: 5.6 });
        const bx = rx + 19, bw = rw - 19 - 27;
        const rows: [string, number, RGB, string][] = [
          ["Previsto", planned, [190, 190, 196], pctBR(planned)],
          ["Realizado", realized, color, pctBR(realized) + extra],
        ];
        rows.forEach(([t, v, c, txt], k) => {
          const ry = by + 2.6 + k * 4.6;
          font("helvetica", "normal", 5.4, C.muted);
          doc.text(t, rx + 5, ry + 2);
          bar(bx, ry, bw, 2.6, v, c);
          font("helvetica", "bold", 5.4, C.ink);
          doc.text(fit(txt, 25), rx + rw - 5, ry + 2.1, { align: "right" });
        });
        by += 16.5;
      });
      font("helvetica", "italic", 5.2, C.faint);
      doc.text("Positivo = adiantado em relação ao planejado · Negativo = atrasado", rx + 5, y + ch - 3.5);
    }
    y += ch + 7;
  }

  // ------------------------------------------------- 6. SITUAÇÃO GERAL (texto)
  if (data.summaryText && data.summaryText.trim()) {
    font("helvetica", "normal", 7.6, C.graphite);
    const lines = doc.splitTextToSize(data.summaryText.trim(), CW - 14) as string[];
    const h = lines.length * 3.7 + 8;
    y = ensure(h + 14, y);
    y = section("Situação geral da obra", null, "quote", y);
    card(M, y, CW, h, C.card, C.line);
    fill(C.orange); doc.roundedRect(M + 3.5, y + 3, 1.2, h - 6, 0.6, 0.6, "F");
    font("helvetica", "normal", 7.6, C.graphite);
    doc.text(lines, M + 8, y + 6.2);
    y += h + 7;
  }

  // ------------------------------------------------- 7. AVANÇO DAS ETAPAS
  if (data.phaseProgress.length > 0) {
    const withProgress = data.phaseProgress.filter((ph) => ph.progressEnd - ph.progressStart > 0.5);
    const toShow = withProgress.length > 0 ? withProgress : data.phaseProgress;
    y = ensure(26, y);
    y = section("Avanço das etapas", "Execução física de cada etapa neste período", "building", y,
      `${toShow.length} etapa(s)`);
    toShow.forEach((ph, i) => {
      y = ensure(11.5, y);
      const rh = 10;
      card(M, y, CW, rh, C.card, null, 2);
      const done = ph.progressEnd >= 99.5;
      const bcx = M + 5.5, bcy = y + rh / 2;
      if (done) {
        fill(C.green); doc.circle(bcx, bcy, 2.6, "F");
        stroke(C.white); doc.setLineWidth(0.45); lineCap("round");
        doc.line(bcx - 1.1, bcy, bcx - 0.3, bcy + 0.85);
        doc.line(bcx - 0.3, bcy + 0.85, bcx + 1.2, bcy - 0.8);
        lineCap("butt");
      } else {
        fill(C.white); stroke(C.line); doc.setLineWidth(0.2); doc.circle(bcx, bcy, 2.6, "FD");
        font("helvetica", "bold", 5.6, C.graphite);
        doc.text(String(i + 1), bcx, bcy + 0.75, { align: "center" });
      }

      const delta = ph.progressEnd - ph.progressStart;
      const deltaTxt = delta > 0.5 ? `+${delta.toFixed(0)}%` : "sem avanço";
      const pw = pill(deltaTxt, W - M - 3, y + 1.3, delta > 0.5 ? C.orangeSoft : C.soft,
        delta > 0.5 ? C.orange : C.muted, { align: "right", size: 5.4 });
      font("helvetica", "normal", 5.6, C.muted);
      const range = ph.progressStart > 0.5
        ? `de ${ph.progressStart.toFixed(0)}% para ${ph.progressEnd.toFixed(0)}%`
        : `executado: ${ph.progressEnd.toFixed(0)}%`;
      doc.text(range, W - M - 3 - pw - 2.5, y + 4.6, { align: "right" });
      const rangeW = doc.getTextWidth(range);

      font("helvetica", "bold", 6.8, C.ink);
      doc.text(fit(ph.name, CW - 10 - pw - rangeW - 10), M + 10, y + 4.5);

      // Barra: avanço até o fim do período (laranja) com a parte anterior por cima (cinza).
      const bx = M + 10, bw = CW - 13, bh = 1.8, by = y + 6.5;
      fill(C.white); doc.roundedRect(bx, by, bw, bh, bh / 2, bh / 2, "F");
      const endW = (bw * Math.max(0, Math.min(100, ph.progressEnd))) / 100;
      if (endW > 0.3) { fill(C.orange); doc.roundedRect(bx, by, Math.max(endW, bh), bh, bh / 2, bh / 2, "F"); }
      const startW = (bw * Math.max(0, Math.min(100, ph.progressStart))) / 100;
      if (startW > 0.3) { fill([190, 190, 196]); doc.roundedRect(bx, by, Math.max(startW, bh), bh, bh / 2, bh / 2, "F"); }
      y += rh + 1.5;
    });
    font("helvetica", "normal", 5.4, C.faint);
    fill([190, 190, 196]); doc.roundedRect(M + 1, y + 0.8, 2.4, 2.4, 0.6, 0.6, "F");
    doc.text("já executado antes", M + 4.6, y + 2.8);
    fill(C.orange); doc.roundedRect(M + 26, y + 0.8, 2.4, 2.4, 0.6, 0.6, "F");
    doc.text("avanço neste período", M + 29.6, y + 2.8);
    y += 9;
  }

  // ------------------------------------------------- 8. GASTOS DO PERÍODO
  const tableBase = {
    margin: { left: M, right: M, top: TOP, bottom: H - BOTTOM },
    theme: "plain" as const,
    styles: {
      font: "helvetica", fontSize: 6.8, textColor: C.ink, overflow: "linebreak" as const, valign: "middle" as const,
      cellPadding: { top: 2.1, bottom: 2.1, left: 2.6, right: 2.6 },
    },
    headStyles: { fillColor: C.soft, textColor: C.graphite, fontStyle: "bold" as const, fontSize: 5.8 },
    footStyles: { fillColor: C.orangeSoft, textColor: C.orange, fontStyle: "bold" as const, fontSize: 7.2 },
    alternateRowStyles: { fillColor: [250, 250, 250] as RGB },
  };
  const headUpper = (d: any) => {
    if (d.section === "head") d.cell.text = (d.cell.text as string[]).map((t) => t.toUpperCase());
  };
  const drawRules = (d: any) => {
    const yb = d.cell.y + d.cell.height;
    if (d.section === "head") { stroke(C.orange); doc.setLineWidth(0.5); doc.line(d.cell.x, yb, d.cell.x + d.cell.width, yb); }
    if (d.section === "body") { stroke(C.line); doc.setLineWidth(0.1); doc.line(d.cell.x, yb, d.cell.x + d.cell.width, yb); }
  };
  const catColor = (cat: string): RGB => {
    const c = (cat || "").toLowerCase();
    if (c.includes("mater")) return C.orange;
    if (c.includes("obra")) return C.graphite;
    if (c.includes("proj")) return [161, 98, 7];
    if (c.includes("tax")) return C.muted;
    if (c.includes("decor") || c.includes("acab")) return [217, 119, 87];
    return C.faint;
  };

  const expTotal = data.expenses.reduce((s, e) => s + (e.value || 0), 0);
  y = ensure(34, y);
  y = section("Gastos do período", `${data.expenses.length} lançamento(s) entre ${fmtDateBR(data.periodStart)} e ${fmtDateBR(data.periodEnd)}`,
    "list", y, `Total ${fmtMoney(expTotal)}`);
  if (data.expenses.length === 0) {
    card(M, y, CW, 12, C.card, C.line);
    font("helvetica", "normal", 6.8, C.muted);
    doc.text("Nenhum gasto registrado neste período.", M + CW / 2, y + 7.2, { align: "center" });
    y += 12 + 7;
  } else {
    autoTable(doc, {
      ...tableBase,
      startY: y,
      head: [["Data", "Descrição", "Categoria", "Fornecedor", "Valor"]],
      body: data.expenses.map((e) => [fmtDateBR(e.date), e.description || "—", e.category || "—", e.supplier || "—", fmtMoney(e.value)]),
      foot: [[{ content: "Total do período", colSpan: 4, styles: { halign: "right" } }, { content: fmtMoney(expTotal), styles: { halign: "right" } }]],
      showFoot: "lastPage",
      columnStyles: {
        0: { cellWidth: 19, textColor: C.muted },
        2: { cellWidth: 32, cellPadding: { top: 2.1, bottom: 2.1, left: 6, right: 2.6 } },
        3: { cellWidth: 38, textColor: C.graphite },
        4: { cellWidth: 26, halign: "right", fontStyle: "bold" },
      },
      didParseCell: (d: any) => {
        headUpper(d);
        if (d.section === "head" && d.column.index === 4) d.cell.styles.halign = "right";
      },
      didDrawCell: (d: any) => {
        drawRules(d);
        if (d.section === "body" && d.column.index === 2) {
          fill(catColor(String(d.cell.raw)));
          doc.circle(d.cell.x + 3.3, d.cell.y + d.cell.height / 2, 0.9, "F");
        }
      },
    } as any);
    y = ((doc as any).lastAutoTable?.finalY || y) + 8;
  }

  // ------------------------------------------------- 9. MÃO DE OBRA PAGA
  if (data.laborPayments && data.laborPayments.length > 0) {
    const laborTotal = data.laborPayments.reduce((s, p) => s + (p.value || 0), 0);
    y = ensure(34, y);
    y = section("Mão de obra paga no período", "Pagamentos a empreiteiros e prestadores, com o andamento de cada contrato",
      "helmet", y, `Total ${fmtMoney(laborTotal)}`);
    const pctPaid = (p: BulletinLaborPayment) => (p.contractValue > 0 ? (p.contractPaidTotal / p.contractValue) * 100 : 0);
    autoTable(doc, {
      ...tableBase,
      startY: y,
      head: [["Data", "Prestador", "Serviço", "Valor pago", "Contrato"]],
      body: data.laborPayments.map((p) => [
        fmtDateBR(p.paymentDate), p.supplier || "—", p.description || "—", fmtMoney(p.value),
        p.contractValue > 0 ? `${Math.round(pctPaid(p))}% pago` : "—",
      ]),
      foot: [[{ content: "Total pago no período", colSpan: 3, styles: { halign: "right" } }, { content: fmtMoney(laborTotal), styles: { halign: "right" } }, ""]],
      showFoot: "lastPage",
      columnStyles: {
        0: { cellWidth: 19, textColor: C.muted },
        1: { cellWidth: 42, fontStyle: "bold" },
        3: { cellWidth: 26, halign: "right", fontStyle: "bold" },
        4: { cellWidth: 30, cellPadding: { top: 2.1, bottom: 2.1, left: 15.5, right: 2.6 }, textColor: C.graphite },
      },
      didParseCell: (d: any) => {
        headUpper(d);
        if (d.section === "head" && d.column.index === 3) d.cell.styles.halign = "right";
        if (d.section === "head" && d.column.index === 4) d.cell.styles.cellPadding = { top: 2.1, bottom: 2.1, left: 2.6, right: 2.6 };
      },
      didDrawCell: (d: any) => {
        drawRules(d);
        if (d.section === "body" && d.column.index === 4) {
          const p = data.laborPayments[d.row.index];
          if (p && p.contractValue > 0) bar(d.cell.x + 2.6, d.cell.y + d.cell.height / 2 - 0.9, 11, 1.8, pctPaid(p), C.graphite, C.softer);
        }
      },
    } as any);
    y = ((doc as any).lastAutoTable?.finalY || y) + 8;
  }

  // ------------------------------------------------- 10. RELATÓRIO FOTOGRÁFICO
  if (data.photos.length > 0) {
    const gap = 5;
    const cellW = (CW - gap) / 2;
    const imgH = 58;
    const boxH = imgH + 11;
    y = ensure(boxH + 16, y);
    y = section("Relatório fotográfico", `${data.photos.length} registro(s) do período`, "camera", y);
    let col = 0;
    let rowY = y;
    data.photos.forEach((photo, i) => {
      if (col === 0) rowY = ensure(boxH + 4, rowY);
      const x = M + col * (cellW + gap);
      card(x, rowY, cellW, boxH, C.white, C.line, 3);
      fill(C.soft); doc.roundedRect(x + 2, rowY + 2, cellW - 4, imgH - 1, 2, 2, "F");
      try {
        const fmt = /png/i.test(photo.url) ? "PNG" : "JPEG";
        doc.addImage(photo.url, fmt, x + 2, rowY + 2, cellW - 4, imgH - 1, undefined, "FAST");
      } catch {
        icon("camera", x + cellW / 2, rowY + imgH / 2 - 2, 8, C.faint);
        font("helvetica", "italic", 6.2, C.faint);
        doc.text("imagem indisponível", x + cellW / 2, rowY + imgH / 2 + 6, { align: "center" });
      }
      const nw = pill(String(i + 1).padStart(2, "0"), x + 2.5, rowY + imgH + 2.6, C.orange, C.white, { size: 5.6 });
      font("helvetica", "normal", 6.4, C.graphite);
      doc.text(fit(photo.caption?.trim() || `Foto ${i + 1}`, cellW - nw - 8), x + 2.5 + nw + 2.5, rowY + imgH + 6.6);
      col++;
      if (col >= 2) { col = 0; rowY += boxH + 4; }
    });
    y = (col !== 0 ? rowY + boxH + 4 : rowY) + 3;
  }

  // ------------------------------------------------- 11. APROVAÇÃO
  y = ensure(56, y);
  y = section("Aprovação da medição", "Conferência e aceite do boletim pelas partes", "pen", y);
  {
    const gap = 5;
    const sw = (CW - gap) / 2;
    const sh = 32;
    const sigs: [string, string][] = [
      ["CONTRATANTE", data.clientName || "Cliente"],
      ["RESPONSÁVEL TÉCNICO", data.responsibleTechnical || COMPANY],
    ];
    sigs.forEach(([role, name], i) => {
      const x = M + i * (sw + gap);
      card(x, y, sw, sh, C.card, C.line, 3);
      pill(role, x + 4, y + 4, C.white, C.graphite, { size: 5.4 });
      stroke(C.faint); doc.setLineWidth(0.25);
      anyDoc.setLineDashPattern?.([1, 1], 0);
      doc.line(x + 8, y + 21, x + sw - 8, y + 21);
      anyDoc.setLineDashPattern?.([], 0);
      font("helvetica", "bold", 7.6, C.ink);
      doc.text(fit(name, sw - 12), x + sw / 2, y + 25.2, { align: "center" });
      font("helvetica", "normal", 5.6, C.faint);
      doc.text("Assinatura e data", x + sw / 2, y + 28.6, { align: "center" });
    });
    y += sh + 6;

    // Selo de emissão.
    const seal = `Documento gerado pelo HUB CBC em ${today()} · Boletim de Medição Nº ${num}`;
    font("helvetica", "bold", 6, C.graphite);
    const stw = doc.getTextWidth(seal) + 12;
    const sx = M + (CW - stw) / 2;
    fill(C.soft); doc.roundedRect(sx, y, stw, 7, 3.5, 3.5, "F");
    icon("check", sx + 4, y + 3.5, 3.4, C.green);
    font("helvetica", "bold", 6, C.graphite);
    doc.text(seal, sx + 7.5, y + 4.6);
  }

  // ------------------------------------------------- CABEÇALHO COMPACTO + RODAPÉ (todas as páginas)
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    if (i > 1) {
      fill(C.ink); doc.roundedRect(M, 8, CW, 11, 2.8, 2.8, "F");
      fill(C.orange); doc.circle(M + 5, 13.5, 1.1, "F");
      font(HF, "bold", 6.6, C.white);
      doc.text("CHAVES BRITES CORREA", M + 8, 14.6);
      font("helvetica", "normal", 6.4, [212, 212, 216]);
      doc.text(fit(`Boletim de Medição Nº ${num} · ${data.projectName || ""}`, CW - 70), W - M - 5, 14.6, { align: "right" });
    }
    fill(C.soft); doc.roundedRect(M, H - 13, CW, 7.5, 3.75, 3.75, "F");
    font(HF, "bold", 6.2, C.ink);
    doc.text("HUB CBC", M + 4, H - 8.3);
    const hw = doc.getTextWidth("HUB CBC");
    font("helvetica", "normal", 6, C.muted);
    doc.text(`  ·  ${COMPANY}  ·  Boletim de Medição Nº ${num}`, M + 4 + hw, H - 8.3);
    const pageOf = `de ${total}`;
    doc.text(pageOf, W - M - 4, H - 8.3, { align: "right" });
    const pw = doc.getTextWidth(pageOf);
    font("helvetica", "bold", 6.4, C.orange);
    doc.text(`Página ${i}`, W - M - 4 - pw - 1.2, H - 8.3, { align: "right" });
  }

  const safeName = (data.projectName || "obra").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-").toLowerCase();
  doc.save(`medicao-${num}-${safeName}.pdf`);
}

