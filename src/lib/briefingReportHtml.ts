// src/lib/briefingReportHtml.ts
//
// Gera o HTML de um relatório de briefing bonito, em A4 retrato, pronto para
// impressão/exportação em PDF. Mesmo espírito do relatório de conforto térmico:
// cabeçalho com gradiente, grupos temáticos coloridos com ícones, perguntas e
// respostas legíveis.

import type { BriefingQuestion, BriefingAnswer } from './briefingTemplate';

const IC: Record<string, string> = {
  clipboard: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/></svg>',
  mapPin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>',
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>',
  palette: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.555C21.965 6.012 17.461 2 12 2z"/></svg>',
  users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  wallet: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/></svg>',
  leaf: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"/><path d="M2 21c0-3 1.85-5.36 5.08-6"/></svg>',
  sparkles: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .962 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.962 0z"/></svg>',
  pdf: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>',
};

// Mapeia grupo → ícone e cor.
const GROUP_STYLE: Record<string, { icon: string; color: string }> = {
  'Terreno e implantação': { icon: 'mapPin', color: '#0CA678' },
  'Programa de necessidades': { icon: 'home', color: '#1971C2' },
  'Estilo e referências': { icon: 'palette', color: '#E8590C' },
  'Uso e rotina': { icon: 'users', color: '#7048E8' },
  'Orçamento e prazo': { icon: 'wallet', color: '#F59F00' },
  'Sustentabilidade e tecnologia': { icon: 'leaf', color: '#0CA678' },
  'Observações livres': { icon: 'sparkles', color: '#E64980' },
};

function esc(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export interface BriefingReportMeta {
  projeto: string;
  cliente: string;
  localizacao?: string;
  tipo?: string;
  data?: string;
}

export function buildBriefingReportHtml(
  questions: BriefingQuestion[],
  answers: BriefingAnswer[],
  groupsOrder: string[],
  meta: BriefingReportMeta,
): string {
  const ansMap: Record<string, string> = {};
  answers.forEach(a => { ansMap[a.questionId] = a.answer; });

  const respondidas = questions.filter(q => (ansMap[q.id] || '').trim() !== '').length;

  const grupos = groupsOrder.filter(g => questions.some(q => q.group === g));
  const extras = Array.from(new Set(questions.map(q => q.group))).filter(g => !groupsOrder.includes(g));
  const ordem = [...grupos, ...extras];

  const secoes = ordem.map(grupo => {
    const style = GROUP_STYLE[grupo] || { icon: 'clipboard', color: '#495057' };
    const qs = questions.filter(q => q.group === grupo);
    const itens = qs.map(q => {
      const ans = (ansMap[q.id] || '').trim();
      return `<div class="qa">
        <p class="q">${esc(q.text)}</p>
        <p class="a${ans ? '' : ' empty'}">${ans ? esc(ans) : '— sem resposta —'}</p>
      </div>`;
    }).join('');
    return `<div class="group">
      <div class="group-head" style="border-color:${style.color}">
        <span class="group-ic" style="background:${style.color}">${IC[style.icon]}</span>
        <span class="group-title" style="color:${style.color}">${esc(grupo)}</span>
      </div>
      <div class="group-body">${itens}</div>
    </div>`;
  }).join('');

  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8">
<title>Briefing — ${esc(meta.projeto)}</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap');
* { margin:0; padding:0; box-sizing:border-box; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
body { font-family:'Poppins',sans-serif; color:#1a1a1a; background:#e9ecef; }
.toolbar { position:sticky; top:0; z-index:10; display:flex; gap:10px; justify-content:center; padding:12px; background:#212529; }
.toolbar button { font-family:'Poppins',sans-serif; font-weight:600; font-size:13px; padding:9px 18px; border:none; border-radius:8px; cursor:pointer; display:inline-flex; align-items:center; gap:7px; }
.btn-print { background:linear-gradient(135deg,#1C7ED6,#1971C2); color:#fff; } .btn-close { background:#495057; color:#fff; }
.toolbar svg { width:15px; height:15px; }
.page { width:210mm; min-height:297mm; background:#fff; margin:16px auto; position:relative; padding:16mm 16mm 20mm; box-shadow:0 8px 40px rgba(0,0,0,0.15); }
.topbar { position:absolute; top:0; left:0; right:0; height:7mm; background:linear-gradient(90deg,#0CA678,#1971C2,#E8590C,#E64980); }
.header { margin-top:5mm; margin-bottom:8mm; padding-bottom:5mm; border-bottom:2px solid #e9ecef; }
.eyebrow { font-family:'JetBrains Mono'; font-size:8pt; letter-spacing:0.22em; text-transform:uppercase; color:#1971C2; font-weight:600; margin-bottom:3mm; display:flex; align-items:center; gap:6px; }
.eyebrow svg { width:13px; height:13px; }
h1 { font-size:22pt; font-weight:800; letter-spacing:-0.02em; line-height:1; }
.meta { display:flex; flex-wrap:wrap; gap:4mm 8mm; margin-top:4mm; font-size:9pt; color:#868e96; }
.meta b { color:#495057; font-weight:600; }
.progress { margin-top:4mm; font-size:8pt; font-family:'JetBrains Mono'; color:#adb5bd; }
.group { margin-bottom:6mm; break-inside:avoid; }
.group-head { display:flex; align-items:center; gap:8px; padding-bottom:2mm; border-bottom:2px solid; margin-bottom:3mm; }
.group-ic { width:8mm; height:8mm; border-radius:2mm; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
.group-ic svg { width:4.5mm; height:4.5mm; color:#fff; }
.group-title { font-size:11pt; font-weight:700; text-transform:uppercase; letter-spacing:0.05em; }
.qa { margin-bottom:3mm; padding-left:10mm; break-inside:avoid; }
.q { font-size:9pt; color:#868e96; font-weight:500; margin-bottom:1mm; }
.a { font-size:10.5pt; color:#212529; font-weight:400; line-height:1.4; white-space:pre-wrap; }
.a.empty { color:#ced4da; font-style:italic; font-weight:300; }
.footer { position:absolute; bottom:8mm; left:16mm; right:16mm; display:flex; justify-content:space-between; padding-top:3mm; border-top:1px solid #e9ecef; font-size:7pt; color:#adb5bd; font-family:'JetBrains Mono'; }
.footer .logo { font-weight:700; letter-spacing:0.15em; color:#868e96; }
@page { size:A4 portrait; margin:0; }
@media print { body { background:#fff; } .toolbar { display:none; } .page { margin:0; box-shadow:none; } }
</style></head>
<body>
<div class="toolbar">
  <button class="btn-print" onclick="window.print()">${IC.pdf} Imprimir / Salvar PDF</button>
  <button class="btn-close" onclick="window.close()">Fechar</button>
</div>
<div class="page">
  <div class="topbar"></div>
  <div class="header">
    <div class="eyebrow">${IC.clipboard} Briefing de Premissas · Projeto Arquitetônico</div>
    <h1>${esc(meta.projeto)}</h1>
    <div class="meta">
      <span>Cliente: <b>${esc(meta.cliente || '—')}</b></span>
      ${meta.tipo ? `<span>Tipo: <b>${esc(meta.tipo)}</b></span>` : ''}
      ${meta.localizacao ? `<span>Local: <b>${esc(meta.localizacao)}</b></span>` : ''}
      ${meta.data ? `<span>Data: <b>${esc(meta.data)}</b></span>` : ''}
    </div>
    <div class="progress">${respondidas} de ${questions.length} perguntas respondidas</div>
  </div>
  ${secoes}
  <div class="footer">
    <span class="logo">CHAVES · BRITES · CORREA</span>
    <span>Briefing de premissas de projeto — documento de referência</span>
  </div>
</div>
</body></html>`;
}

export function openBriefingReport(
  questions: BriefingQuestion[],
  answers: BriefingAnswer[],
  groupsOrder: string[],
  meta: BriefingReportMeta,
): void {
  const html = buildBriefingReportHtml(questions, answers, groupsOrder, meta);
  const win = window.open('', '_blank');
  if (!win) { alert('Não foi possível abrir o relatório. Verifique se o navegador está bloqueando pop-ups.'); return; }
  win.document.open(); win.document.write(html); win.document.close();
}
