// ============================================================
// Relatório de apresentação do projeto (A4 retrato, para mostrar
// presencialmente ao cliente). Gera um HTML estilizado no tema violeta
// e abre a janela de impressão (Salvar como PDF).
// ============================================================

interface RelFile { name: string; }
interface RelEvent { kind: string; author: string; role: string; at: string; text?: string; files?: RelFile[]; }
interface RelPhase {
  name: string; state: string; semanas?: number;
  inicioPrevisto?: string; fimPrevisto?: string;
  approvedBy?: string; approvedAt?: string;
  files?: RelFile[]; events?: RelEvent[]; entregaveis?: string[];
  rodadasUsadas?: number;
}
export interface ProjectReportData {
  nome: string;
  clienteNome: string;
  tipo?: string;
  area?: string;
  responsavel?: string;
  localizacao?: string;
  criadoEm?: string;
  servicos?: string[];
  dataBaseInicio?: string;
  fases: RelPhase[];
}

const ESTADO_LABEL: Record<string, string> = {
  bloqueada: 'Não iniciada',
  em_elaboracao: 'Em desenvolvimento',
  aguardando_aprovacao: 'Aguardando aprovação',
  ajustes: 'Em ajustes',
  aprovada: 'Aprovada',
};
const ESTADO_COR: Record<string, string> = {
  bloqueada: '#a5a1bb',
  em_elaboracao: '#6c4df6',
  aguardando_aprovacao: '#b06d05',
  ajustes: '#c2255c',
  aprovada: '#12805a',
};

const fmtData = (iso?: string) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('pt-BR');
};
const fmtDataHora = (iso?: string) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '—' : d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};
const esc = (s: string) => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Gera um resumo textual elaborado a partir do estado atual do projeto.
function gerarResumo(d: ProjectReportData): string {
  const total = d.fases.length;
  const aprovadas = d.fases.filter(f => f.state === 'aprovada').length;
  const emAndamento = d.fases.find(f => f.state === 'em_elaboracao' || f.state === 'aguardando_aprovacao' || f.state === 'ajustes');
  const pct = total ? Math.round((aprovadas / total) * 100) : 0;
  const totalArquivos = d.fases.reduce((a, f) => a + (f.files?.length || 0), 0);
  const totalAjustes = d.fases.reduce((a, f) => a + (f.rodadasUsadas || 0), 0);

  const partes: string[] = [];
  partes.push(
    `O projeto <b>${esc(d.nome)}</b>, desenvolvido para <b>${esc(d.clienteNome)}</b>, ` +
    `é um projeto ${d.tipo ? `<b>${esc(d.tipo.toLowerCase())}</b> ` : ''}` +
    `${d.area ? `com área aproximada de <b>${esc(d.area)} m²</b> ` : ''}` +
    `${d.localizacao ? `localizado em <b>${esc(d.localizacao)}</b>` : ''}.`
  );
  partes.push(
    `Até o momento, <b>${aprovadas} de ${total} etapas</b> foram concluídas e aprovadas, ` +
    `o que representa <b>${pct}%</b> do escopo contratado.` +
    (emAndamento ? ` A etapa atual em desenvolvimento é <b>${esc(emAndamento.name)}</b>.` : (aprovadas === total ? ' Todas as etapas do projeto foram concluídas.' : ''))
  );
  partes.push(
    `Ao longo do desenvolvimento, foram entregues <b>${totalArquivos} documento(s)</b>` +
    (totalAjustes > 0 ? ` e realizadas <b>${totalAjustes} rodada(s) de ajustes</b> a pedido do cliente, ` +
      `refletindo um processo colaborativo e atento às necessidades do contratante.` : `, com aprovação fluida entre as etapas.`)
  );
  return partes.map(p => `<p class="resumo-p">${p}</p>`).join('');
}

// Reúne todas as movimentações (eventos) de todas as fases, ordenadas no tempo.
function coletarMovimentacoes(d: ProjectReportData) {
  const movs: { fase: string; ev: RelEvent }[] = [];
  d.fases.forEach(f => (f.events || []).forEach(ev => movs.push({ fase: f.name, ev })));
  movs.sort((a, b) => new Date(a.ev.at).getTime() - new Date(b.ev.at).getTime());
  return movs;
}

const KIND_LABEL: Record<string, string> = {
  envio: 'Entrega enviada',
  aprovacao: 'Etapa aprovada',
  ajuste: 'Ajuste solicitado',
  comentario: 'Comentário',
  auto_aceite: 'Aceite automático',
};
const KIND_COR: Record<string, string> = {
  envio: '#6c4df6', aprovacao: '#12805a', ajuste: '#c2255c', comentario: '#837f99', auto_aceite: '#b06d05',
};

export function buildProjectReportHtml(d: ProjectReportData): string {
  const total = d.fases.length;
  const aprovadas = d.fases.filter(f => f.state === 'aprovada').length;
  const pct = total ? Math.round((aprovadas / total) * 100) : 0;
  const hoje = new Date().toLocaleDateString('pt-BR');
  const movs = coletarMovimentacoes(d);

  const servicosTxt = (d.servicos || []).map(s =>
    s === 'arquitetonico' ? 'Projeto Arquitetônico' : s === 'interiores' ? 'Projeto de Interiores' : s
  ).join(' + ') || 'Projeto Arquitetônico';

  // Cartões de característica
  const caracteristicas: [string, string][] = [
    ['Cliente', d.clienteNome || '—'],
    ['Tipo', d.tipo || '—'],
    ['Área', d.area ? `${d.area} m²` : '—'],
    ['Localização', d.localizacao || '—'],
    ['Responsável técnico', d.responsavel || '—'],
    ['Serviços contratados', servicosTxt],
  ];

  const etapasHtml = d.fases.map((f, i) => {
    const cor = ESTADO_COR[f.state] || '#6c4df6';
    const entregaveis = (f.entregaveis || []).map(e => `<li>${esc(e)}</li>`).join('');
    const qtdArq = f.files?.length || 0;
    return `
      <div class="etapa">
        <div class="etapa-head">
          <span class="etapa-num">${String(i).padStart(2, '0')}</span>
          <span class="etapa-nome">${esc(f.name)}</span>
          <span class="etapa-chip" style="background:${cor}1a;color:${cor}">${ESTADO_LABEL[f.state] || f.state}</span>
        </div>
        <div class="etapa-meta">
          ${f.inicioPrevisto ? `Previsão: ${fmtData(f.inicioPrevisto)} → ${fmtData(f.fimPrevisto)}` : ''}
          ${f.semanas ? ` · ${f.semanas} semana(s)` : ''}
          ${qtdArq ? ` · ${qtdArq} arquivo(s)` : ''}
          ${f.approvedAt ? ` · Aprovada em ${fmtData(f.approvedAt)}${f.approvedBy ? ` por ${esc(f.approvedBy)}` : ''}` : ''}
        </div>
        ${entregaveis ? `<ul class="etapa-entregaveis">${entregaveis}</ul>` : ''}
      </div>`;
  }).join('');

  const movsHtml = movs.length ? movs.map(({ fase, ev }) => {
    const cor = KIND_COR[ev.kind] || '#837f99';
    const anexos = (ev.files || []).length ? ` <span class="mov-anexo">📎 ${ev.files!.length} anexo(s)</span>` : '';
    return `
      <div class="mov">
        <span class="mov-dot" style="background:${cor}"></span>
        <div class="mov-body">
          <div class="mov-top"><b style="color:${cor}">${KIND_LABEL[ev.kind] || ev.kind}</b> <span class="mov-fase">· ${esc(fase)}</span>${anexos}</div>
          ${ev.text ? `<div class="mov-text">${esc(ev.text)}</div>` : ''}
          <div class="mov-meta">${esc(ev.author || '—')} · ${fmtDataHora(ev.at)}</div>
        </div>
      </div>`;
  }).join('') : '<p class="vazio">Ainda não há movimentações registradas.</p>';

  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8">
<title>Relatório — ${esc(d.nome)}</title>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:'Plus Jakarta Sans',sans-serif; color:#1b1830; background:#e9e5f8; }
  .toolbar { position:sticky; top:0; padding:12px; background:#fff; box-shadow:0 2px 10px rgba(70,50,150,.15); text-align:center; z-index:10; }
  .btn-print { background:linear-gradient(140deg,#7d5bf8,#4f2fd4); color:#fff; border:0; border-radius:10px; padding:10px 22px; font-family:inherit; font-weight:700; font-size:14px; cursor:pointer; }
  .page { width:210mm; min-height:297mm; margin:16px auto; background:#fff; box-shadow:0 6px 30px rgba(70,50,150,.18); position:relative; overflow:hidden; }
  .page-pad { padding:20mm 18mm; }

  /* Capa */
  .capa { background:radial-gradient(600px 400px at 80% 0%,#6c4df6 0%,#4f2fd4 55%,#3a1fa8 100%); color:#fff; min-height:297mm; display:flex; flex-direction:column; }
  .capa .top { padding:20mm 18mm 0; }
  .capa .brand { font-size:11px; letter-spacing:.24em; text-transform:uppercase; opacity:.8; font-weight:700; }
  .capa .mid { flex:1; padding:0 18mm; display:flex; flex-direction:column; justify-content:center; }
  .capa .eyebrow { font-size:12px; letter-spacing:.24em; text-transform:uppercase; opacity:.85; font-weight:700; margin-bottom:12px; }
  .capa h1 { font-size:42px; font-weight:800; line-height:1.05; letter-spacing:-.02em; }
  .capa .sub { font-size:16px; opacity:.9; margin-top:12px; }
  .capa .prog { margin-top:32px; }
  .capa .prog-bar { height:10px; background:rgba(255,255,255,.2); border-radius:999px; overflow:hidden; max-width:60%; }
  .capa .prog-fill { height:100%; background:#fff; border-radius:999px; }
  .capa .prog-txt { font-size:13px; margin-top:8px; opacity:.9; font-weight:600; }
  .capa .bottom { padding:0 18mm 20mm; font-size:12px; opacity:.85; display:flex; justify-content:space-between; }

  /* Seções */
  .sec-eyebrow { font-size:11px; letter-spacing:.18em; text-transform:uppercase; color:#6c4df6; font-weight:800; margin-bottom:6px; }
  .sec-title { font-size:24px; font-weight:800; letter-spacing:-.02em; margin-bottom:18px; }

  .grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
  .carac { background:#f7f5fe; border:1px solid rgba(108,77,246,.1); border-radius:14px; padding:14px 16px; }
  .carac .lbl { font-size:10px; text-transform:uppercase; letter-spacing:.06em; color:#6b6785; font-weight:700; margin-bottom:3px; }
  .carac .val { font-size:15px; font-weight:700; }

  .resumo-p { font-size:13.5px; line-height:1.7; color:#3a3653; margin-bottom:12px; }
  .resumo-box { background:#f7f5fe; border-left:3px solid #6c4df6; border-radius:0 12px 12px 0; padding:18px 20px; margin-top:4px; }

  .etapa { border:1px solid rgba(108,77,246,.12); border-radius:14px; padding:14px 16px; margin-bottom:10px; break-inside:avoid; }
  .etapa-head { display:flex; align-items:center; gap:10px; }
  .etapa-num { font-size:11px; font-weight:800; color:#a5a1bb; }
  .etapa-nome { font-size:15px; font-weight:700; flex:1; }
  .etapa-chip { font-size:10px; font-weight:700; padding:3px 10px; border-radius:999px; }
  .etapa-meta { font-size:11px; color:#6b6785; margin-top:6px; }
  .etapa-entregaveis { margin:8px 0 0 18px; }
  .etapa-entregaveis li { font-size:11.5px; color:#5a5570; line-height:1.6; }

  .mov { display:flex; gap:12px; padding:10px 0; border-bottom:1px solid #efecfc; break-inside:avoid; }
  .mov-dot { width:10px; height:10px; border-radius:999px; margin-top:5px; flex-shrink:0; }
  .mov-body { flex:1; min-width:0; }
  .mov-top { font-size:12.5px; }
  .mov-fase { color:#837f99; font-weight:600; }
  .mov-anexo { font-size:10px; color:#6c4df6; font-weight:700; }
  .mov-text { font-size:12.5px; color:#3a3653; margin-top:2px; line-height:1.5; }
  .mov-meta { font-size:10px; color:#a5a1bb; margin-top:3px; font-family:monospace; }
  .vazio { font-size:13px; color:#a5a1bb; }

  .footer { position:absolute; bottom:12mm; left:18mm; right:18mm; display:flex; justify-content:space-between; font-size:10px; color:#a5a1bb; border-top:1px solid #efecfc; padding-top:8px; }

  @page { size:A4 portrait; margin:0; }
  @media print {
    body { background:#fff; }
    .toolbar { display:none; }
    .page { margin:0; box-shadow:none; page-break-after:always; }
    .page:last-child { page-break-after:auto; }
  }
</style></head>
<body>
  <div class="toolbar"><button class="btn-print" onclick="window.print()">Imprimir / Salvar PDF</button></div>

  <!-- CAPA -->
  <div class="page capa">
    <div class="top"><div class="brand">Chaves Brites Correa · Arquitetura e Engenharia</div></div>
    <div class="mid">
      <div class="eyebrow">Relatório de Projeto</div>
      <h1>${esc(d.nome)}</h1>
      <div class="sub">${esc(d.clienteNome)}${d.localizacao ? ` · ${esc(d.localizacao)}` : ''}</div>
      <div class="prog">
        <div class="prog-bar"><div class="prog-fill" style="width:${pct}%"></div></div>
        <div class="prog-txt">${aprovadas} de ${total} etapas concluídas · ${pct}%</div>
      </div>
    </div>
    <div class="bottom"><span>${servicosTxt}</span><span>Emitido em ${hoje}</span></div>
  </div>

  <!-- CARACTERÍSTICAS + RESUMO -->
  <div class="page"><div class="page-pad">
    <div class="sec-eyebrow">Visão Geral</div>
    <div class="sec-title">Características do projeto</div>
    <div class="grid">
      ${caracteristicas.map(([l, v]) => `<div class="carac"><div class="lbl">${esc(l)}</div><div class="val">${esc(v)}</div></div>`).join('')}
    </div>

    <div class="sec-eyebrow" style="margin-top:26px">Resumo</div>
    <div class="sec-title">Como o projeto se desenvolveu</div>
    <div class="resumo-box">${gerarResumo(d)}</div>

    <div class="footer"><span>${esc(d.nome)}</span><span>Chaves Brites Correa</span></div>
  </div></div>

  <!-- ETAPAS -->
  <div class="page"><div class="page-pad">
    <div class="sec-eyebrow">Escopo</div>
    <div class="sec-title">Etapas do projeto</div>
    ${etapasHtml}
    <div class="footer"><span>${esc(d.nome)}</span><span>Chaves Brites Correa</span></div>
  </div></div>

  <!-- HISTÓRICO -->
  <div class="page"><div class="page-pad">
    <div class="sec-eyebrow">Linha do tempo</div>
    <div class="sec-title">Histórico de movimentações</div>
    ${movsHtml}
    <div class="footer"><span>${esc(d.nome)}</span><span>Chaves Brites Correa</span></div>
  </div></div>
</body></html>`;
}

export function openProjectReport(d: ProjectReportData): void {
  const html = buildProjectReportHtml(d);
  const w = window.open('', '_blank');
  if (!w) { alert('Permita pop-ups para gerar o relatório.'); return; }
  w.document.write(html);
  w.document.close();
}
