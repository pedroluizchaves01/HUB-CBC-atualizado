// src/lib/thermalReportHtml.ts
//
// Gera o HTML de um relatório de conforto térmico bonito, em A4 paisagem,
// pronto para impressão/exportação em PDF (via window.print do navegador).
// Cores, gradientes e ícones SVG inline — nada de dependência externa.

import type { ThermalResult } from './thermalAnalysis';

// Ícones SVG (estilo Lucide) usados no relatório.
const IC: Record<string, string> = {
  thermometer: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4v10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0Z"/></svg>',
  droplets: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 16.3c2.2 0 4-1.83 4-4.05 0-1.16-.57-2.26-1.71-3.19S7.29 4.24 7 2c-.29 2.24-1.14 4.83-2.29 7.06S3 11.09 3 12.25c0 2.22 1.8 4.05 4 4.05z"/><path d="M12.56 6.6A10.97 10.97 0 0 0 14 3.02c.5 2.5 2 4.9 4 6.5s3 3.5 3 5.5a5 5 0 0 1-2.79 4.5"/></svg>',
  wind: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.7 7.7a2.5 2.5 0 1 1 1.8 4.3H2"/><path d="M9.6 4.6A2 2 0 1 1 11 8H2"/><path d="M12.6 19.4A2 2 0 1 0 14 16H2"/></svg>',
  sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M6.3 17.7l-1.4 1.4M19.1 4.9l-1.4 1.4"/></svg>',
  leaf: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"/><path d="M2 21c0-3 1.85-5.36 5.08-6"/></svg>',
  building: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="16" height="20" x="4" y="2" rx="2"/><path d="M9 22v-4h6v4M8 6h.01M16 6h.01M12 6h.01M12 10h.01M12 14h.01M16 10h.01M16 14h.01M8 10h.01M8 14h.01"/></svg>',
  ruler: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.41 2.41 0 0 1 0-3.4l2.6-2.6a2.41 2.41 0 0 1 3.4 0Z"/><path d="m14.5 12.5 2-2M11.5 9.5l2-2M8.5 6.5l2-2M17.5 15.5l2-2"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
  alert: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4M12 17h.01"/></svg>',
  mapPin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>',
  detail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>',
};

function esc(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function metricCard(icon: string, label: string, value: string, sub: string, grad: string): string {
  return `<div class="metric" style="background:${grad}">
    <div class="metric-ic">${IC[icon]}</div>
    <div class="metric-body">
      <div class="metric-label">${esc(label)}</div>
      <div class="metric-value">${esc(value)}</div>
      <div class="metric-sub">${esc(sub)}</div>
    </div>
  </div>`;
}

function solList(items: string[], accent: string): string {
  const lis = items.map(it => `<li><span class="li-ic" style="color:${accent}">${IC.check}</span><span>${esc(it)}</span></li>`).join('');
  return `<ul class="sol-list">${lis}</ul>`;
}

export interface ReportMeta {
  projeto: string;
  localizacao: string;
  latitude: number;
  longitude: number;
  tipo?: string;
  area?: string;
}

// Monta o HTML completo do relatório (documento independente).
export function buildThermalReportHtml(r: ThermalResult, meta: ReportMeta): string {
  const d = r.dados;
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8">
<title>Estudo de Conforto Térmico — ${esc(meta.projeto)}</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap');
* { margin:0; padding:0; box-sizing:border-box; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
:root { --calor:#E8590C; --frio:#1971C2; --sol:#F59F00; --vento:#0CA678; }
body { font-family:'Poppins',sans-serif; color:#1a1a1a; background:#e9ecef; }
.toolbar { position:sticky; top:0; z-index:10; display:flex; gap:10px; justify-content:center; padding:12px; background:#212529; }
.toolbar button { font-family:'Poppins',sans-serif; font-weight:600; font-size:13px; padding:9px 18px; border:none; border-radius:8px; cursor:pointer; display:inline-flex; align-items:center; gap:7px; transition:transform .1s; }
.toolbar button:hover { transform:translateY(-1px); }
.btn-print { background:linear-gradient(135deg,#1C7ED6,#1971C2); color:#fff; }
.btn-close { background:#495057; color:#fff; }
.toolbar svg { width:15px; height:15px; }
.page { width:297mm; min-height:210mm; background:#fff; margin:16px auto; position:relative; padding:14mm 16mm; overflow:hidden; box-shadow:0 8px 40px rgba(0,0,0,0.15); }
.topbar { position:absolute; top:0; left:0; right:0; height:8mm; background:linear-gradient(90deg,var(--frio),var(--vento),var(--sol),var(--calor)); }
.header { display:flex; justify-content:space-between; align-items:flex-start; margin-top:6mm; margin-bottom:7mm; padding-bottom:5mm; border-bottom:2px solid #e9ecef; }
.h-left .eyebrow { font-family:'JetBrains Mono'; font-size:8pt; letter-spacing:0.25em; text-transform:uppercase; color:var(--calor); font-weight:600; margin-bottom:3mm; display:flex; align-items:center; gap:6px; }
.h-left .eyebrow svg { width:13px; height:13px; }
.h-left h1 { font-size:24pt; font-weight:800; line-height:1; letter-spacing:-0.02em; color:#1a1a1a; }
.h-left .loc { display:flex; align-items:center; gap:5px; margin-top:3mm; font-size:10pt; color:#868e96; font-weight:400; }
.h-left .loc svg { width:14px; height:14px; }
.badge { text-align:right; }
.badge .tag { display:inline-block; background:linear-gradient(135deg,var(--frio),#1C7ED6); color:#fff; font-weight:700; font-size:11pt; padding:3mm 6mm; border-radius:100px; box-shadow:0 4px 14px rgba(25,113,194,0.3); }
.badge .clima { font-size:8pt; color:#adb5bd; margin-top:2mm; font-family:'JetBrains Mono'; text-transform:uppercase; letter-spacing:0.15em; }
.metrics { display:grid; grid-template-columns:repeat(4,1fr); gap:4mm; margin-bottom:6mm; }
.metric { border-radius:4mm; padding:4mm; color:#fff; display:flex; gap:3mm; align-items:center; box-shadow:0 3px 12px rgba(0,0,0,0.08); }
.metric-ic { width:11mm; height:11mm; flex-shrink:0; background:rgba(255,255,255,0.22); border-radius:2.5mm; display:flex; align-items:center; justify-content:center; }
.metric-ic svg { width:6mm; height:6mm; color:#fff; }
.metric-label { font-size:7.5pt; text-transform:uppercase; letter-spacing:0.1em; opacity:0.9; font-weight:500; }
.metric-value { font-size:16pt; font-weight:800; line-height:1.1; }
.metric-sub { font-size:7pt; opacity:0.85; font-weight:300; }
.highlight-row { display:grid; grid-template-columns:1fr 1fr; gap:4mm; margin-bottom:6mm; }
.hl-card { border-radius:3mm; padding:4mm 5mm; }
.hl-vento { background:linear-gradient(135deg,#e6fcf5,#c3fae8); border:1px solid #96f2d7; }
.hl-desafio { background:linear-gradient(135deg,#fff4e6,#ffe8cc); border:1px solid #ffd8a8; }
.hl-title { display:flex; align-items:center; gap:6px; font-size:8pt; text-transform:uppercase; letter-spacing:0.1em; font-weight:700; margin-bottom:2mm; }
.hl-vento .hl-title { color:var(--vento); } .hl-desafio .hl-title { color:var(--calor); }
.hl-title svg { width:14px; height:14px; }
.hl-text { font-size:9pt; color:#495057; font-weight:400; line-height:1.4; }
.hl-text b { font-weight:700; color:#212529; }
.body { display:grid; grid-template-columns:1fr 1fr 1fr; gap:5mm; }
.block-title { display:flex; align-items:center; gap:6px; font-size:9pt; font-weight:700; text-transform:uppercase; letter-spacing:0.08em; margin-bottom:3mm; padding-bottom:2mm; border-bottom:2px solid; }
.block-title svg { width:15px; height:15px; }
.sol-list { list-style:none; }
.sol-list li { display:flex; gap:6px; align-items:flex-start; font-size:8.5pt; line-height:1.35; margin-bottom:2.5mm; color:#343a40; font-weight:400; }
.li-ic { flex-shrink:0; margin-top:1px; }
.li-ic svg { width:12px; height:12px; }
.det-block { grid-column:1 / -1; margin-top:2mm; }
.det-list { list-style:none; display:grid; grid-template-columns:1fr 1fr 1fr; gap:2mm 5mm; }
.footer { position:absolute; bottom:8mm; left:16mm; right:16mm; display:flex; justify-content:space-between; align-items:center; padding-top:3mm; border-top:1px solid #e9ecef; font-size:7pt; color:#adb5bd; font-family:'JetBrains Mono'; }
.footer .logo { font-weight:700; letter-spacing:0.15em; color:#868e96; }
@page { size:A4 landscape; margin:0; }
@media print { body { background:#fff; } .toolbar { display:none; } .page { margin:0; box-shadow:none; } }
</style></head>
<body>
<div class="toolbar">
  <button class="btn-print" onclick="window.print()">${IC.detail} Imprimir / Salvar PDF</button>
  <button class="btn-close" onclick="window.close()">Fechar</button>
</div>
<div class="page">
  <div class="topbar"></div>
  <div class="header">
    <div class="h-left">
      <div class="eyebrow">${IC.sun} Estudo de Conforto Térmico · Premissas de Projeto</div>
      <h1>${esc(meta.projeto)}</h1>
      <div class="loc">${IC.mapPin} ${esc(meta.localizacao)} &nbsp;·&nbsp; Clima ${esc(d.clima)}${meta.tipo ? ` &nbsp;·&nbsp; ${esc(meta.tipo)}` : ''}${meta.area ? ` &nbsp;·&nbsp; ${esc(meta.area)} m²` : ''}</div>
    </div>
    <div class="badge">
      <div class="tag">${esc(d.classificacao)}</div>
      <div class="clima">Classificação bioclimática</div>
    </div>
  </div>

  <div class="metrics">
    ${metricCard('thermometer', 'Temperatura média', `${d.tempMedia}°C`, `${d.tempMin}°C mín · ${d.tempMax}°C máx`, 'linear-gradient(135deg,#F76707,#E8590C)')}
    ${metricCard('droplets', 'Umidade relativa', `${d.umidadeMedia}%`, `${d.precipitacao}mm/ano`, 'linear-gradient(135deg,#1C7ED6,#1971C2)')}
    ${metricCard('wind', 'Ventos predominantes', d.ventosPredominantes, `${d.velocidadeVento} m/s`, 'linear-gradient(135deg,#0CA678,#087f5b)')}
    ${metricCard('sun', 'Insolação', r.insolacao, r.exposicao, 'linear-gradient(135deg,#F59F00,#E8590C)')}
  </div>

  <div class="highlight-row">
    <div class="hl-card hl-vento">
      <div class="hl-title">${IC.wind} Regime de Ventos</div>
      <div class="hl-text">Período quente: <b>${esc(d.periodoVentoQuente)}</b> &nbsp;·&nbsp; Período frio: <b>${esc(d.periodoVentoFrio)}</b></div>
    </div>
    <div class="hl-card hl-desafio">
      <div class="hl-title">${IC.alert} Desafio Principal</div>
      <div class="hl-text"><b>${esc(r.desafio)}</b> · Potencial ${esc(r.potencial)} · Eficiência estimada <b>${esc(r.eficiencia)}</b> · Crítico: ${esc(r.periodoCritico)}</div>
    </div>
  </div>

  <div class="body">
    <div>
      <div class="block-title" style="color:var(--calor);border-color:#ffd8a8">${IC.leaf} Recomendações</div>
      ${solList(r.recomendacoes, 'var(--calor)')}
    </div>
    <div>
      <div class="block-title" style="color:var(--frio);border-color:#a5d8ff">${IC.building} Estratégias Arquitetônicas</div>
      ${solList(d.solucoes.arquitetonicas, 'var(--frio)')}
    </div>
    <div>
      <div class="block-title" style="color:var(--vento);border-color:#96f2d7">${IC.ruler} Estratégias Construtivas</div>
      ${solList(d.solucoes.construtivas, 'var(--vento)')}
    </div>
    <div class="det-block">
      <div class="block-title" style="color:#7048e8;border-color:#d0bfff">${IC.detail} Detalhes Técnicos</div>
      <ul class="det-list sol-list">
        ${d.solucoes.detalhes.map(it => `<li><span class="li-ic" style="color:#7048e8">${IC.check}</span><span>${esc(it)}</span></li>`).join('')}
      </ul>
    </div>
  </div>

  <div class="footer">
    <span class="logo">CHAVES · BRITES · CORREA</span>
    <span>Estudo automático de premissas — validar com responsável técnico</span>
    <span>lat ${meta.latitude} · lon ${meta.longitude}</span>
  </div>
</div>
</body></html>`;
}

// Abre o relatório numa nova janela, pronto para impressão/PDF.
export function openThermalReport(r: ThermalResult, meta: ReportMeta): void {
  const html = buildThermalReportHtml(r, meta);
  const win = window.open('', '_blank');
  if (!win) {
    alert('Não foi possível abrir o relatório. Verifique se o navegador está bloqueando pop-ups.');
    return;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
}
