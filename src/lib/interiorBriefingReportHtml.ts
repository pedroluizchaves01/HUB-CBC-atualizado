// src/lib/interiorBriefingReportHtml.ts
//
// Relatório do Briefing de Interiores em HTML A4, pronto para imprimir/salvar em
// PDF (mesmo mecanismo do relatório de premissas). Duas versões:
//  - 'equipe':  inclui alertas de compatibilidade e pendências para a reunião;
//  - 'cliente': só as respostas e o perfil, sem linguagem de "problema".

import {
  ACCEPT_TEXT, BASES, BEDS, KID_BEDS, PRIORITY_OPTIONS, CABINET_TONES, STONE_TONES, FINISH_AREAS, FINISH_COMBOS,
  finishAreasOf, kitchenLabel, voltageLabel, chosenRefs, STYLES, bedTopCm, buildBlocks,
  computeAlerts, computePendencias, computeProfile, dinnerTable, dormAnswer, fmt1, officeDeskCm, tvRange,
  wardrobeEstimate, type IBBlock, type InteriorBriefingData,
} from './interiorBriefing';

export interface InteriorReportMeta { projeto: string; cliente: string }

const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fmtDT = (iso?: string) => iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';

function details(b: InteriorBriefingData, block: IBBlock): [string, string][] {
  const a = b.answers;
  switch (block.kind) {
    case 'moradores': return [
      ['Adultos', String(a.adults)], ['Crianças', String(a.kids)], ['Idosos', String(a.elders)],
      ['Pets', a.pets.join(', ') || '—'], ['Rotina', a.habits.join(' · ') || '—'],
    ];
    case 'estilo': return [];
    case 'sala': {
      const r = tvRange(a.tvInches);
      return [['TV', `${a.tvInches}"`], ['Distância do sofá', `${fmt1(a.tvDistM)} m (ideal ${fmt1(r.min)} a ${fmt1(r.max)} m)`], ['Junto da TV', a.tvExtras.join(', ') || '—']];
    }
    case 'jantar': return [
      ['Dia a dia', `${a.dinnerDaily} lugares`], ['Ocasiões especiais', `${a.dinnerParty} lugares`],
      ['Sugestão', dinnerTable(a.dinnerParty, a.dinnerShape)],
    ];
    case 'cozinha': return [
      ['Tensão da casa', a.houseVoltage ? voltageLabel(a.houseVoltage) : 'não informada'],
      ...a.kitchen.map(k => [kitchenLabel(k), `${k.unknown ? 'modelo a definir' : (k.model.trim() || 'modelo não informado')} · ${voltageLabel(k.voltage)}`] as [string, string]),
      ['Sempre à mão', a.smallAppliances.join(', ') || '—'],
    ];
    case 'dorm': {
      const d = b.config.dorms.find(x => x.id === block.dormId);
      if (!d) return [];
      const da = dormAnswer(b, d);
      const bed = BEDS.find(x => x.id === da.bed);
      const top = bedTopCm(da);
      const rows: [string, string][] = [];
      if (d.type === 'infantil') rows.push(['Tipo de cama', KID_BEDS.find(k => k.id === da.kidBed)?.label || 'Cama comum']);
      rows.push(['Cama', `${bed?.label}, ${bed?.w} × ${bed?.l} cm`], ['Base', BASES.find(x => x.id === da.base)?.label || ''],
        ['Colchão', `${da.mattressCm} cm · topo a ${top} cm do piso`], ['Criados-mudos', `entre ${top - 5} e ${top} cm`]);
      return rows;
    }
    case 'escritorio': {
      const desk = officeDeskCm(a.office);
      return [['Pessoas', String(a.office.people)], ['Monitores por pessoa', String(a.office.monitors)], ['Uso', a.office.use.join(', ') || '—'],
        ['Precisa caber', a.office.items.join(', ') || '—'], ['Bancada sugerida', `a partir de ${fmt1(desk.total / 100)} m`]];
    }
    default: return [];
  }
}

export function buildInteriorBriefingReportHtml(b: InteriorBriefingData, meta: InteriorReportMeta, audience: 'equipe' | 'cliente'): string {
  const a = b.answers;
  const blocks = buildBlocks(b.config);
  const prof = computeProfile(a.votes);
  const alerts = audience === 'equipe' ? computeAlerts(b) : [];
  const pend = audience === 'equipe' ? computePendencias(b) : [];
  const doneCount = blocks.filter(bl => b.done[bl.key]).length;

  const card = (title: string, body: string, sub = '') =>
    `<div class="card"><h3>${esc(title)}${sub ? ` <small>· ${esc(sub)}</small>` : ''}</h3>${body}</div>`;
  const dl = (rows: [string, string][]) => `<dl>${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>`;

  const ambientes = blocks
    .filter(bl => ['sala', 'jantar', 'cozinha', 'dorm', 'escritorio'].includes(bl.kind))
    .map(bl => b.done[bl.key] ? card(bl.title, dl(details(b, bl)), bl.subtitle) : card(bl.title, '<p class="muted">Bloco não respondido.</p>', bl.subtitle))
    .join('');

  const finishes = b.done.acabamentos ? `
  <section><h2><span>Marcenaria e bancadas</span></h2>
    <div class="grid3">${finishAreasOf(b.config).map(id => {
      const f = a.finishes[id];
      const combo = FINISH_COMBOS.find(c => c.id === f?.combo);
      const rows: [string, string][] = [
        ['Armários', CABINET_TONES.find(t => t.id === f?.cabinet)?.label || '—'],
        ['Pedra', STONE_TONES.find(t => t.id === f?.stone)?.label || '—'],
        ['Acabamento', f?.stoneFinish || '—'],
        ['Combinação', combo ? `${combo.cabinetName} + ${combo.stoneName}` : 'definir na reunião'],
      ];
      const sw = combo ? `<div class="combo"><span style="background:${esc(combo.stone)}"></span><span style="background:${esc(combo.cabinet)}"></span></div>` : '';
      return card(FINISH_AREAS.find(x => x.id === id)!.label, sw + dl(rows));
    }).join('')}</div>
  </section>` : '';

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const refBlocks = blocks.filter(bl => chosenRefs(b, bl).length);
  const refsHtml = refBlocks.length ? `
  <section><h2><span>Referências marcadas</span></h2>
    ${refBlocks.map(bl => `<div class="refgroup"><p class="eyebrow">${esc(bl.title)}</p><div class="refs">${chosenRefs(b, bl).map(r =>
      `<figure><img src="${esc(origin + r.image.file)}" alt="${esc(r.caption)}"><figcaption>${esc(r.caption)}</figcaption></figure>`).join('')}</div></div>`).join('')}
  </section>` : '';

  const w = a.wardrobe;
  const e1 = wardrobeEstimate(w.p1), e2 = wardrobeEstimate(w.p2);
  const roupeiro = b.done.roupeiro ? `
  <section><h2><span>Pré-dimensionamento de roupeiro</span></h2>
    <p class="lead">Estimativa de partida calculada a partir do inventário informado.</p>
    <table><thead><tr><th>Item</th><th>${esc(w.p1Name)}</th><th>${esc(w.p2Name)}</th><th>Total</th></tr></thead><tbody>
      <tr><td>Cabideiro curto</td><td>${fmt1(e1.curtoM)} m <small>(${w.p1.curto} peças)</small></td><td>${fmt1(e2.curtoM)} m <small>(${w.p2.curto} peças)</small></td><td><b>${fmt1(e1.curtoM + e2.curtoM)} m</b></td></tr>
      <tr><td>Cabideiro longo e calceiro</td><td>${fmt1(e1.longoM)} m</td><td>${fmt1(e2.longoM)} m</td><td><b>${fmt1(e1.longoM + e2.longoM)} m</b></td></tr>
      <tr><td>Prateleiras de 80 cm</td><td>${e1.prateleiras} <small>(${w.p1.dobradas} peças)</small></td><td>${e2.prateleiras} <small>(${w.p2.dobradas} peças)</small></td><td><b>${e1.prateleiras + e2.prateleiras}</b></td></tr>
      <tr><td>Prateleiras de sapatos</td><td>${e1.sapateiras} <small>(${w.p1.sapatos} pares)</small></td><td>${e2.sapateiras} <small>(${w.p2.sapatos} pares)</small></td><td><b>${e1.sapateiras + e2.sapateiras}</b></td></tr>
      <tr><td>Bolsas e mochilas</td><td>${w.p1.bolsas}</td><td>${w.p2.bolsas}</td><td><b>${w.p1.bolsas + w.p2.bolsas}</b></td></tr>
    </tbody></table>
  </section>` : '';

  const estilo = b.done.estilo ? `
  <section><h2><span>Perfil de estilo</span></h2>
    <div class="grid2">
      <div class="card">
        ${prof.list.length ? `<p class="eyebrow">Predominante</p><p class="big">${esc(prof.list[0].name)}</p><p class="muted">${esc(STYLES[prof.list[0].key].desc)}</p>
        ${prof.list.map(p => `<div class="bar"><div class="bar-l"><span>${esc(p.name)}</span><b>${p.pct}%</b></div><div class="track"><div class="fill" style="width:${p.pct}%"></div></div></div>`).join('')}`
        : '<p class="muted">Nenhum estilo se destacou nas escolhas.</p>'}
      </div>
      <div class="card">
        ${prof.palette.length ? `<p class="eyebrow">Paleta das escolhas</p><div class="swatches">${prof.palette.map(c => `<span style="background:${esc(c)}"></span>`).join('')}</div>` : ''}
        ${prof.rejected.length ? `<p class="eyebrow mt">Rejeitados</p><p>${esc(prof.rejected.join(', '))}</p>` : ''}
        ${prof.neutral.length ? `<p class="eyebrow mt">Tanto faz</p><p>${esc(prof.neutral.join(', '))}</p>` : ''}
      </div>
    </div>
  </section>` : '';

  const pets = a.pets.filter(p => p !== 'Não temos pets');
  const moradores = b.done.moradores ? `
  <section><h2><span>Moradores e rotina</span></h2>
    <div class="grid2">
      <div class="card"><div class="kpis">
        <div><b>${a.adults}</b><span>adulto${a.adults === 1 ? '' : 's'}</span></div>
        <div><b>${a.kids}</b><span>criança${a.kids === 1 ? '' : 's'}</span></div>
        <div><b>${a.elders}</b><span>idoso${a.elders === 1 ? '' : 's'}</span></div>
      </div>${pets.length ? `<p class="mt">Pets: <b>${esc(pets.join(', '))}</b></p>` : ''}</div>
      <div class="card"><p class="eyebrow">Rotina</p>${a.habits.length ? `<div class="tags">${a.habits.map(h => `<span>${esc(h)}</span>`).join('')}</div>` : '<p class="muted">—</p>'}</div>
    </div>
  </section>` : '';

  const extras = `
  <section><h2><span>O que vai ficar e prioridades</span></h2>
    <div class="grid2">
      <div class="card"><h3>O que vai ficar</h3>${a.keep.trim() ? `<p class="pre">${esc(a.keep.trim())}</p>` : '<p class="muted">Nada informado.</p>'}
        ${a.notes.trim() ? `<h3 class="mt">Observações</h3><p class="pre">${esc(a.notes.trim())}</p>` : ''}</div>
      <div class="card"><h3>Prioridades</h3>${b.done.prioridades ? `<ol>${a.priorities.map(id => `<li>${esc(PRIORITY_OPTIONS.find(p => p.id === id)?.label || id)}</li>`).join('')}</ol>` : '<p class="muted">Não respondido.</p>'}</div>
    </div>
  </section>`;

  const alertsHtml = alerts.length ? `
  <section><h2><span>Alertas de compatibilidade</span></h2>
    <p class="lead">Gerados ao cruzar as respostas. Resolver antes do estudo preliminar.</p>
    <div class="grid2">${alerts.map(al => `<div class="alert"><p class="eyebrow">${esc(al.area)}</p><p class="alert-t">${esc(al.title)}</p><p>${esc(al.text)}</p></div>`).join('')}</div>
  </section>` : '';

  const pendHtml = pend.length ? `
  <section><h2><span>Pendências para a reunião</span></h2>
    <div class="card">${pend.map(p => `<div class="pend"><span class="ring"></span><div><b>${esc(p.title)}</b><p class="muted">${esc(p.text)}</p></div></div>`).join('')}</div>
  </section>` : '';

  const statusTxt = b.status === 'enviado'
    ? `Enviado em ${fmtDT(b.submittedAt)}${b.submittedBy ? ` por ${esc(b.submittedBy)}` : ''}`
    : `Em andamento · ${doneCount} de ${blocks.length} blocos`;

  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8">
<title>Briefing de Interiores — ${esc(meta.projeto)}</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700;800&display=swap');
*{margin:0;padding:0;box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{font-family:'Poppins',sans-serif;color:#1b1830;background:#e9e7f2;font-size:10pt;line-height:1.5}
.toolbar{position:sticky;top:0;z-index:10;display:flex;gap:10px;justify-content:center;padding:12px;background:#1b1830}
.toolbar button{font-family:'Poppins',sans-serif;font-weight:600;font-size:13px;padding:9px 18px;border:none;border-radius:8px;cursor:pointer}
.btn-print{background:linear-gradient(140deg,#7d5bf8,#4f2fd4);color:#fff}.btn-close{background:#4a4663;color:#fff}
.doc{width:210mm;background:#fff;margin:16px auto;padding:14mm 14mm 16mm;box-shadow:0 8px 40px rgba(0,0,0,.15)}
header.hero{background:#1b1830;color:#fff;border-radius:6mm;padding:9mm;margin-bottom:8mm}
.brand{font-size:8pt;letter-spacing:.22em;font-weight:700;color:#cfc8f5}
.hero .kicker{margin-top:6mm;font-size:8pt;letter-spacing:.14em;text-transform:uppercase;color:#cfc8f5}
.hero h1{font-size:24pt;font-weight:700;line-height:1.15;letter-spacing:-.01em}
.hero .sub{color:#e6e3f5;margin-top:1mm}
.hero .status{display:inline-block;margin-top:4mm;padding:1.5mm 4mm;border-radius:99px;background:#33304a;font-size:8.5pt;font-weight:600}
.hero .kpis{margin-top:6mm}
.hero .kpis div{background:#2a2740}
.hero .kpis b{color:#fff}.hero .kpis span{color:#cfc8f5}
section{margin-bottom:8mm;break-inside:avoid-page}
h2{font-size:14pt;font-weight:700;margin-bottom:3mm;display:flex;align-items:center;gap:3mm}
h2:before{content:'';width:3mm;height:3mm;border-radius:1mm;background:#6c4df6;display:inline-block}
h3{font-size:11pt;font-weight:700;margin-bottom:2mm}h3 small{font-weight:400;color:#837f99;font-size:9pt}
.lead{color:#5a5570;margin:-1mm 0 3mm}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:4mm}
.card{border:1px solid #e3def7;border-radius:4mm;padding:5mm;break-inside:avoid}
.grid3{display:grid;grid-template-columns:1fr 1fr;gap:4mm}
dl{display:grid;grid-template-columns:34mm 1fr;gap:1.5mm 4mm}dt{color:#837f99}dd{font-weight:500}
.muted{color:#837f99}.pre{white-space:pre-line}.mt{margin-top:3mm}
.eyebrow{font-size:7.5pt;letter-spacing:.12em;text-transform:uppercase;color:#837f99;font-weight:700;margin-bottom:1mm}
.big{font-size:18pt;font-weight:700;line-height:1.2}
.bar{margin-top:3mm}.bar-l{display:flex;justify-content:space-between;font-size:9pt;margin-bottom:1mm}
.track{height:2.2mm;border-radius:2mm;background:#ece9f8;overflow:hidden}.fill{height:100%;background:linear-gradient(90deg,#7d5bf8,#4f2fd4)}
.swatches{display:grid;grid-template-columns:repeat(5,1fr);gap:2mm}.swatches span{height:14mm;border-radius:2.5mm;border:1px solid rgba(0,0,0,.06)}
.kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:3mm}.kpis div{background:#f7f5fe;border-radius:3mm;padding:3mm 4mm;display:flex;flex-direction:column}
.kpis b{font-size:16pt;font-weight:700;line-height:1.1}.kpis span{font-size:8pt;color:#5a5570}
.refgroup{margin-bottom:4mm;break-inside:avoid}.refs{display:grid;grid-template-columns:repeat(4,1fr);gap:3mm}.refs figure{margin:0}.refs img{width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:2.5mm;display:block}.refs figcaption{font-size:7.5pt;color:#837f99;margin-top:1mm;line-height:1.3}
.combo{display:grid;grid-template-rows:5mm 12mm;border-radius:2.5mm;overflow:hidden;margin-bottom:3mm;border:1px solid rgba(0,0,0,.08)}.combo span{display:block}
.tags{display:flex;flex-wrap:wrap;gap:2mm}.tags span{background:#f0edfd;border-radius:99px;padding:1mm 3.5mm;font-size:9pt}
.alert{background:#fff2dc;color:#7a4300;border-radius:4mm;padding:5mm;break-inside:avoid}.alert .eyebrow{color:#7a4300}.alert-t{font-weight:700;font-size:10.5pt}
.pend{display:flex;gap:3mm;padding:2.5mm 0;border-bottom:1px solid #eeeaf9}.pend:last-child{border-bottom:0}
.ring{width:4.5mm;height:4.5mm;border-radius:50%;border:1.5px solid #a39fb8;flex-shrink:0;margin-top:.8mm}
table{width:100%;border-collapse:collapse;border:1px solid #e3def7;border-radius:4mm;overflow:hidden}
th{text-align:left;font-size:7.5pt;letter-spacing:.1em;text-transform:uppercase;color:#837f99;font-weight:600;padding:3mm 4mm;border-bottom:1px solid #e3def7}
td{padding:2.5mm 4mm;border-bottom:1px solid #f0edfa}td small{color:#837f99}
ol{padding-left:5mm}li{margin:.5mm 0}
footer{margin-top:6mm;padding-top:4mm;border-top:1px solid #e3def7;display:flex;justify-content:space-between;gap:6mm;font-size:8pt;color:#837f99}
footer b{letter-spacing:.22em;color:#1b1830;font-size:8pt;white-space:nowrap}
@page{size:A4 portrait;margin:10mm 0}
@media print{body{background:#fff}.toolbar{display:none}.doc{margin:0 auto;box-shadow:none;padding-top:4mm}}
</style></head><body>
<div class="toolbar"><button class="btn-print" onclick="window.print()">Imprimir / Salvar PDF</button><button class="btn-close" onclick="window.close()">Fechar</button></div>
<div class="doc">
  <header class="hero">
    <div class="brand">CHAVES BRITES CORREA</div>
    <p class="kicker">Briefing de interiores${audience === 'equipe' ? ' · versão da equipe' : ''}</p>
    <h1>${esc(meta.projeto)}</h1>
    <p class="sub">${esc(meta.cliente)}</p>
    <span class="status">${statusTxt}</span>
    ${audience === 'equipe' ? `<div class="kpis">
      <div><b>${doneCount} de ${blocks.length}</b><span>blocos respondidos</span></div>
      <div><b>${alerts.length}</b><span>alertas de compatibilidade</span></div>
      <div><b>${pend.length}</b><span>pendências para a reunião</span></div>
    </div>` : ''}
  </header>
  ${alertsHtml}
  ${moradores}
  ${estilo}
  ${ambientes ? `<section><h2><span>Ambientes</span></h2><div class="grid3">${ambientes}</div></section>` : ''}
  ${finishes}
  ${refsHtml}
  ${roupeiro}
  ${extras}
  ${pendHtml}
  <footer>
    <span>${b.status === 'enviado' ? `Aceite registrado em ${fmtDT(b.submittedAt)}${b.submittedBy ? `, por ${esc(b.submittedBy)}` : ''}: “${esc(ACCEPT_TEXT)}”` : 'Briefing ainda não enviado pelo cliente.'}</span>
    <b>CHAVES BRITES CORREA</b>
  </footer>
</div></body></html>`;
}

export function openInteriorBriefingReport(b: InteriorBriefingData, meta: InteriorReportMeta, audience: 'equipe' | 'cliente'): void {
  const html = buildInteriorBriefingReportHtml(b, meta, audience);
  const win = window.open('', '_blank');
  if (!win) { alert('Não foi possível abrir o relatório. Verifique se o navegador está bloqueando pop-ups.'); return; }
  win.document.open(); win.document.write(html); win.document.close();
}
