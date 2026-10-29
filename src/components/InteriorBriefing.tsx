// src/components/InteriorBriefing.tsx
//
// Briefing de Interiores — página dentro do ambiente de Projetos.
//
// CLIENTE: percorre os blocos (montados a partir dos ambientes do projeto), joga o
// jogo de estilo, revisa e envia. Salvamento automático. Depois de enviado, fica
// somente leitura; a equipe pode reabrir.
// EQUIPE: configura os ambientes (dormitórios, sala, cozinha…), acompanha o
// progresso e lê o relatório com alertas de compatibilidade e pendências.
//
// Toda a lógica (catálogo, cálculos) está em lib/interiorBriefing.ts.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check, ChevronRight, ChevronLeft, ChevronUp, ChevronDown, Heart, Minus, X, Clock, Save, Users,
  Lock, FileText, RotateCcw, Plus, Trash2, AlertTriangle, CheckCircle2, Sofa, Home, Eye, GripVertical, Bath, Flame,
} from 'lucide-react';
import {
  ACCEPT_TEXT, BASES, BEDS, DORM_TYPES, HABIT_OPTIONS, KID_BEDS, KITCHEN_ITEMS, OFFICE_ITEMS, OFFICE_USES,
  PET_OPTIONS, PRIORITY_OPTIONS, SMALL_APPLIANCES, VOLTAGES, CABINET_TONES, STONE_TONES, STONE_FINISHES, FINISH_COMBOS, FINISH_AREAS,
  emptyFinish, finishAreasOf, kitchenLabel, voltageLabel, refsFor, dormRefRoom, chosenRefs, COVER_IMAGE, STYLES, STYLE_CARDS, STYLE_PALETTES, TVS, TV_EXTRAS,
  WARDROBE_ITEMS, bedTopCm, blockSummary, buildBlocks, computeAlerts, computePendencias, computeProfile,
  dinnerTable, dormAnswer, dormTypeMeta, fmt1, normalizeBriefing, officeDeskCm, progressOf, tvRange, tvStatus,
  wardrobeEstimate,
  type IBAnswers, type IBBlock, type IBConfig, type IBDorm, type IBDormAnswer, type InteriorBriefingData,
  type RefImage, type RefRoom, type StylePalette, type Vote, type WardrobeCounts, type IBKitchenItem, type Voltage, type FinishArea, type IBFinish, type FinishCombo,
} from '../lib/interiorBriefing';
import { openInteriorBriefingReport } from '../lib/interiorBriefingReportHtml';

interface Props {
  data?: Partial<InteriorBriefingData> | null;
  isAdmin: boolean;
  released: boolean;           // a etapa Concepção de Interiores já foi liberada?
  projectName: string;
  clientName: string;
  userName?: string;
  onSave: (d: InteriorBriefingData) => Promise<any> | void;
}

const uid = () => `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const fmtDateTime = (iso?: string) => iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';

// ===========================================================================
// Página
// ===========================================================================

export default function InteriorBriefingPage(props: Props) {
  const { isAdmin } = props;
  return <div className="ib-root">{isAdmin ? <AdminView {...props} /> : <ClientView {...props} />}</div>;
}

function PageTitle({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle?: string }) {
  return (
    <div className="mb-1">
      <p className="text-[10px] uppercase tracking-[0.16em] mb-1.5" style={{ color: 'var(--v-text-soft)', fontWeight: 700 }}>{eyebrow}</p>
      <h1 className="text-2xl sm:text-3xl m-0" style={{ fontWeight: 800, letterSpacing: '-0.02em' }}>{title}</h1>
      {subtitle && <p className="text-[13px] mt-1" style={{ color: 'var(--v-text-soft)' }}>{subtitle}</p>}
    </div>
  );
}

// ===========================================================================
// Salvamento automático
// ===========================================================================

const AUTOSAVE_DELAY_MS = 5000;

function useAutosave(onSave: () => Promise<any> | void, deps: unknown[], enabled: boolean) {
  const [state, setState] = useState<'idle' | 'pending' | 'saving' | 'saved' | 'error'>('idle');
  const first = useRef(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveRef = useRef(onSave);
  saveRef.current = onSave;

  const flush = async () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    setState('saving');
    try { await saveRef.current(); setState('saved'); } catch { setState('error'); }
  };

  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (!enabled) return;
    setState('pending');
    if (timer.current) clearTimeout(timer.current);
    // 5 s sem digitar (era 1,2 s): cada salvamento grava o projeto inteiro no banco.
    timer.current = setTimeout(flush, AUTOSAVE_DELAY_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  // Aba escondida/fechada: grava o que estiver pendente.
  useEffect(() => {
    const onHide = () => { if (document.visibilityState === 'hidden' && timer.current) void flush(); };
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Ao sair da página, grava o que estiver pendente.
  useEffect(() => () => { if (timer.current) { clearTimeout(timer.current); void saveRef.current(); } }, []);

  return { state, flush };
}

function SaveIndicator({ state }: { state: string }) {
  const label = state === 'saving' || state === 'pending' ? 'Salvando…' : state === 'error' ? 'Não salvou — tente de novo' : state === 'saved' ? 'Salvo agora' : 'Salvo';
  const warn = state === 'error';
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] ${warn ? 'ib-warn-text' : 'text-vsoft'}`} style={{ fontWeight: 600 }}>
      {state === 'saving' || state === 'pending' ? <Clock size={12} /> : warn ? <AlertTriangle size={12} /> : <Check size={12} />}
      {label}
    </span>
  );
}

// ===========================================================================
// VISÃO DO CLIENTE
// ===========================================================================

type Screen = { kind: 'intro' } | { kind: 'map' } | { kind: 'block'; key: string } | { kind: 'review' };

function ClientView({ data, released, projectName, clientName, userName, onSave }: Props) {
  const [draft, setDraft] = useState<InteriorBriefingData>(() => normalizeBriefing(data));
  const latest = useRef(data);
  latest.current = data;

  // Se a equipe reabriu o briefing (ou mudou os ambientes), adota o que veio do servidor.
  useEffect(() => {
    const incoming = normalizeBriefing(data);
    setDraft(d => {
      const statusChanged = incoming.status !== d.status && incoming.reopenedAt !== d.reopenedAt;
      const configChanged = JSON.stringify(incoming.config) !== JSON.stringify(d.config);
      if (statusChanged) return incoming;
      if (configChanged) return { ...d, config: incoming.config };
      return d;
    });
  }, [data?.status, data?.reopenedAt, JSON.stringify(data?.config || null)]);

  const blocks = useMemo(() => buildBlocks(draft.config), [draft.config]);
  const anyDone = blocks.some(b => draft.done[b.key]);
  const [screen, setScreen] = useState<Screen>(() => (anyDone ? { kind: 'map' } : { kind: 'intro' }));
  const topRef = useRef<HTMLDivElement>(null);
  const go = (s: Screen) => { setScreen(s); requestAnimationFrame(() => topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })); };

  const readOnly = draft.status === 'enviado';

  const persist = () => {
    const server = normalizeBriefing(latest.current);
    return onSave({ ...draft, config: server.config, updatedAt: new Date().toISOString() });
  };
  const { state: saveState } = useAutosave(persist, [JSON.stringify(draft.answers), JSON.stringify(draft.done)], !readOnly);

  const setA = (patch: Partial<IBAnswers>) => setDraft(d => ({ ...d, answers: { ...d.answers, ...patch } }));
  const markDone = (key: string) => {
    const done = { ...draft.done, [key]: true };
    setDraft(d => ({ ...d, done: { ...d.done, [key]: true } }));
    const next = blocks.find(b => !done[b.key]);
    go(next ? { kind: 'block', key: next.key } : { kind: 'review' });
  };

  const submit = async () => {
    const now = new Date().toISOString();
    const server = normalizeBriefing(latest.current);
    const sent: InteriorBriefingData = { ...draft, config: server.config, status: 'enviado', submittedAt: now, submittedBy: userName || clientName, updatedAt: now };
    setDraft(sent);
    await onSave(sent);
  };

  if (!released) {
    return (
      <div className="flex flex-col gap-4">
        <PageTitle eyebrow="Concepção de Interiores" title="Briefing de Interiores" />
        <div className="v-card p-8 text-center"><p className="text-vsoft">O briefing de interiores fica disponível quando a etapa de Concepção de Interiores for liberada.</p></div>
      </div>
    );
  }

  if (readOnly) return <SubmittedView draft={draft} projectName={projectName} clientName={clientName} />;

  const prog = progressOf(draft);
  const current = screen.kind === 'block' ? blocks.find(b => b.key === screen.key) : undefined;
  const currentIdx = current ? blocks.indexOf(current) : -1;

  return (
    <div className="flex flex-col gap-4" ref={topRef}>
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <PageTitle eyebrow="Concepção de Interiores" title="Briefing de Interiores" subtitle="Como vocês vivem, o que precisa caber e o estilo que querem para a casa." />
        <SaveIndicator state={saveState} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)] items-start">
        {/* Mapa de blocos: fixo ao lado no desktop; no celular aparece só na tela "mapa". */}
        <aside className={`${screen.kind === 'map' ? 'block' : 'hidden'} lg:block lg:sticky lg:top-5`}>
          <BlockMap blocks={blocks} done={draft.done} activeKey={current?.key} prog={prog}
            onOpen={key => go({ kind: 'block', key })} onReview={() => go({ kind: 'review' })} reviewActive={screen.kind === 'review'} />
        </aside>

        <main className={`${screen.kind === 'map' ? 'hidden lg:block' : ''} min-w-0`}>
          {screen.kind === 'intro' && <Intro clientName={clientName} blocks={blocks} onStart={() => go({ kind: 'block', key: blocks[0].key })} onMap={() => go({ kind: 'map' })} />}
          {screen.kind === 'map' && <Intro clientName={clientName} blocks={blocks} onStart={() => { const n = blocks.find(b => !draft.done[b.key]); go(n ? { kind: 'block', key: n.key } : { kind: 'review' }); }} compact />}
          {current && (
            <BlockFrame
              block={current} index={currentIdx} total={blocks.length}
              onBack={() => go({ kind: 'map' })}
              onDone={() => markDone(current.key)}
              hideFooter={current.kind === 'estilo'}
            >
              <BlockBody block={current} draft={draft} setA={setA} onStyleDone={() => markDone('estilo')} />
            </BlockFrame>
          )}
          {screen.kind === 'review' && (
            <Review draft={draft} blocks={blocks} onEdit={key => go({ kind: 'block', key })} onBack={() => go({ kind: 'map' })} onSubmit={submit} />
          )}
        </main>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mapa, introdução, moldura dos blocos
// ---------------------------------------------------------------------------

function BlockMap({ blocks, done, activeKey, prog, onOpen, onReview, reviewActive }: {
  blocks: IBBlock[]; done: Record<string, boolean>; activeKey?: string; prog: { done: number; total: number; pct: number };
  onOpen: (key: string) => void; onReview: () => void; reviewActive: boolean;
}) {
  return (
    <div className="v-card-border p-4 flex flex-col gap-3">
      <div>
        <p className="text-[15px]" style={{ fontWeight: 800 }}>{prog.done === prog.total ? 'Tudo pronto para enviar' : `${prog.done} de ${prog.total} blocos concluídos`}</p>
        <div className="v-track mt-2"><div className="v-fill" style={{ width: `${prog.pct}%` }} /></div>
      </div>
      <nav className="flex flex-col gap-1.5" aria-label="Blocos do briefing">
        {blocks.map((b, i) => {
          const isDone = !!done[b.key];
          const active = b.key === activeKey;
          return (
            <button key={b.key} onClick={() => onOpen(b.key)}
              className={`w-full flex items-center gap-3 text-left px-3 py-2.5 rounded-2xl transition-colors ${active ? 'v-nav-active' : 'ib-hover'}`}
              style={{ minHeight: 52 }}>
              <span className={`w-8 h-8 flex-shrink-0 rounded-full flex items-center justify-center text-[12px] ${isDone ? 'v-grad' : 'v-tint'}`} style={{ fontWeight: 700 }}>
                {isDone ? <Check size={15} /> : i + 1}
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-[13px] truncate" style={{ fontWeight: 600 }}>{b.title}</span>
                <span className="block text-[11px] truncate text-vmute">{isDone ? 'Concluído · toque para revisar' : `${b.subtitle ? b.subtitle + ' · ' : ''}${b.minutes} min`}</span>
              </span>
              <ChevronRight size={15} className="text-vmute flex-shrink-0" />
            </button>
          );
        })}
      </nav>
      <button onClick={onReview} className={`${reviewActive ? 'v-nav-active' : 'v-btn'} w-full flex items-center justify-center gap-2 px-4 py-3 text-[13px] rounded-2xl`} style={{ fontWeight: 700 }}>
        <FileText size={15} /> Revisar e enviar
      </button>
    </div>
  );
}

function Intro({ clientName, blocks, onStart, onMap, compact }: { clientName: string; blocks: IBBlock[]; onStart: () => void; onMap?: () => void; compact?: boolean }) {
  const minutes = blocks.reduce((s, b) => s + b.minutes, 0);
  return (
    <div className="v-card-border overflow-hidden">
      {!compact && (
        <div className="relative h-44 sm:h-60 overflow-hidden" style={{ background: '#ece7fd' }}>
          <img src={COVER_IMAGE.file} alt="" aria-hidden="true" className="absolute inset-0 w-full h-full object-cover" onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
        </div>
      )}
      <div className="p-6 sm:p-8 flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <p className="text-[13px] text-vsoft">Olá, {clientName.split(' ')[0] || 'tudo bem'}</p>
          <h2 className="text-2xl sm:text-[28px] m-0 leading-tight" style={{ fontWeight: 800, letterSpacing: '-0.01em' }}>Vamos desenhar a casa a partir de como vocês vivem.</h2>
          <p className="text-[14px] leading-relaxed text-vsoft m-0">Este briefing ajuda nossa equipe a entender a rotina, o gosto e tudo o que precisa caber em cada ambiente. Não existem respostas certas.</p>
        </div>
        <ul className="flex flex-col gap-2.5 m-0 p-0 list-none">
          <li className="flex items-center gap-3 text-[13px]"><Clock size={18} style={{ color: 'var(--v-accent)' }} /> Cerca de {minutes} minutos, em blocos curtos</li>
          <li className="flex items-center gap-3 text-[13px]"><Save size={18} style={{ color: 'var(--v-accent)' }} /> As respostas são salvas automaticamente; pode parar e continuar depois</li>
          <li className="flex items-center gap-3 text-[13px]"><Users size={18} style={{ color: 'var(--v-accent)' }} /> Ideal para responder em casal, com calma</li>
        </ul>
        <div className="flex flex-col sm:flex-row gap-2">
          <button onClick={onStart} className="v-btn px-6 py-3 text-[14px] flex items-center justify-center gap-2">{compact ? 'Continuar de onde parei' : 'Começar'} <ChevronRight size={16} /></button>
          {onMap && <button onClick={onMap} className="v-btn-ghost px-5 py-3 text-[13px] lg:hidden">Ver todos os blocos</button>}
        </div>
      </div>
    </div>
  );
}

function BlockFrame({ block, index, total, onBack, onDone, hideFooter, children }: {
  block: IBBlock; index: number; total: number; onBack: () => void; onDone: () => void; hideFooter?: boolean; children: React.ReactNode;
}) {
  return (
    <div className="v-card-border overflow-hidden">
      <div className="px-5 sm:px-6 py-4 flex items-center gap-2 border-b" style={{ borderColor: 'var(--v-border)' }}>
        <button onClick={onBack} aria-label="Voltar aos blocos" className="lg:hidden w-11 h-11 -ml-2 rounded-full flex items-center justify-center ib-hover"><ChevronLeft size={20} /></button>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] uppercase tracking-[0.14em] text-vmute" style={{ fontWeight: 700 }}>Bloco {index + 1} de {total}{block.subtitle ? ` · ${block.subtitle}` : ''}</p>
          <h2 className="text-lg m-0 truncate" style={{ fontWeight: 800 }}>{block.title}</h2>
        </div>
      </div>
      <div className="p-5 sm:p-6">{children}</div>
      {!hideFooter && (
        <div className="px-5 sm:px-6 py-4 border-t flex flex-col sm:flex-row-reverse gap-2" style={{ borderColor: 'var(--v-border)' }}>
          <button onClick={onDone} className="v-btn px-6 py-3 text-[14px] flex items-center justify-center gap-2"><Check size={16} /> Concluir bloco</button>
          <button onClick={onBack} className="v-btn-ghost px-5 py-3 text-[13px] lg:hidden">Salvar e continuar depois</button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Componentes de formulário
// ---------------------------------------------------------------------------

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h3 className="text-[17px] m-0" style={{ fontWeight: 700 }}>{title}</h3>
        {hint && <p className="text-[13px] mt-1 mb-0 leading-relaxed text-vsoft">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function Chip({ label, selected, onClick, disabled }: { label: string; selected: boolean; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-pressed={selected}
      className={`px-4 py-2.5 rounded-full text-[13px] text-left transition-colors ${selected ? 'v-grad' : 'bg-white ib-hover'}`}
      style={{ minHeight: 44, fontWeight: 500, border: selected ? '1px solid transparent' : '1px solid rgba(108,77,246,0.18)' }}>
      {label}
    </button>
  );
}

function ChipGroup({ options, value, onChange, single }: { options: string[]; value: string[]; onChange: (v: string[]) => void; single?: boolean }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(o => (
        <Chip key={o} label={o} selected={value.includes(o)}
          onClick={() => onChange(single ? [o] : value.includes(o) ? value.filter(x => x !== o) : [...value, o])} />
      ))}
    </div>
  );
}

function Counter({ label, hint, value, onChange, min = 0, step = 1, max = 999 }: {
  label: string; hint?: string; value: number; onChange: (n: number) => void; min?: number; step?: number; max?: number;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-2xl bg-white" style={{ border: '1px solid rgba(108,77,246,0.12)' }}>
      <div className="min-w-0">
        <p className="text-[14px] m-0" style={{ fontWeight: 600 }}>{label}</p>
        {hint && <p className="text-[12px] m-0 text-vmute">{hint}</p>}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <button type="button" aria-label={`Diminuir ${label}`} onClick={() => onChange(Math.max(min, value - step))}
          className="w-11 h-11 rounded-full bg-white flex items-center justify-center ib-hover" style={{ border: '1px solid rgba(108,77,246,0.2)' }}><Minus size={16} /></button>
        <span className="min-w-8 text-center text-[17px]" style={{ fontWeight: 800 }} aria-live="polite">{value}</span>
        <button type="button" aria-label={`Aumentar ${label}`} onClick={() => onChange(Math.min(max, value + step))}
          className="w-11 h-11 rounded-full bg-white flex items-center justify-center ib-hover" style={{ border: '1px solid rgba(108,77,246,0.2)' }}><Plus size={16} /></button>
      </div>
    </div>
  );
}

function Note({ kind = 'ok', children }: { kind?: 'ok' | 'warn' | 'info'; children: React.ReactNode }) {
  return <div className={`px-4 py-3 rounded-2xl text-[13px] leading-relaxed ${kind === 'warn' ? 'ib-warn' : kind === 'info' ? 'v-tint' : 'ib-ok'}`}>{children}</div>;
}

function RangeField({ id, label, value, display, min, max, step, onChange }: {
  id: string; label: string; value: number; display: string; min: number; max: number; step: number; onChange: (n: number) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between">
        <label htmlFor={id} className="text-[13px] text-vsoft">{label}</label>
        <span className="text-[22px]" style={{ fontWeight: 800 }}>{display}</span>
      </div>
      <input id={id} type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(parseFloat(e.target.value))} className="w-full ib-range" style={{ border: 0, padding: 0, background: 'transparent' }} />
    </div>
  );
}

function OptionCards<T extends string>({ options, value, onChange }: { options: { id: T; label: string; detail?: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {options.map(o => {
        const sel = o.id === value;
        return (
          <button key={o.id} type="button" onClick={() => onChange(o.id)} aria-pressed={sel}
            className={`flex items-center justify-between gap-3 px-4 py-3 rounded-2xl text-left ${sel ? 'v-grad' : 'bg-white ib-hover'}`}
            style={{ minHeight: 52, border: sel ? '1px solid transparent' : '1px solid rgba(108,77,246,0.18)' }}>
            <span className="text-[14px]" style={{ fontWeight: 600 }}>{o.label}</span>
            {o.detail && <span className="text-[12px]">{o.detail}</span>}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Imagens e ilustrações
// ---------------------------------------------------------------------------

function RoomIllustration({ p, label }: { p: StylePalette; label?: string }) {
  return (
    <svg viewBox="0 0 320 240" role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true} className="w-full h-full block" preserveAspectRatio="xMidYMid slice">
      <rect x="0" y="0" width="320" height="165" fill={p.wall} />
      <rect x="198" y="26" width="76" height="132" rx="38" fill="#ffffff" opacity="0.55" />
      <rect x="56" y="44" width="76" height="52" fill={p.art} opacity="0.85" />
      <rect x="0" y="165" width="320" height="75" fill={p.floor} />
      <rect x="34" y="186" width="236" height="38" rx="6" fill={p.rug} />
      <rect x="46" y="112" width="176" height="44" rx="10" fill={p.sofa} />
      <rect x="38" y="144" width="192" height="28" rx="10" fill={p.seat} />
      <rect x="106" y="192" width="70" height="11" rx="3" fill="#00000022" />
      <ellipse cx="290" cy="140" rx="22" ry="42" fill={p.plant} />
      <rect x="279" y="164" width="22" height="22" rx="2" fill="#00000026" />
    </svg>
  );
}

function RefPhoto({ image, palette, alt, className = '' }: { image?: RefImage; palette: StylePalette; alt: string; className?: string }) {
  const [failed, setFailed] = useState(!image);
  useEffect(() => { setFailed(!image); }, [image?.file]);
  return (
    <div className={`relative overflow-hidden ${className}`} style={{ background: palette.wall }}>
      {!failed && image ? (
        <img src={image.file} alt={alt} loading="lazy" onError={() => setFailed(true)} className="absolute inset-0 w-full h-full object-cover" />
      ) : (
        <div className="absolute inset-0"><RoomIllustration p={palette} label={alt} /></div>
      )}
    </div>
  );
}


// ---------------------------------------------------------------------------
// Galeria de referências (projetos da CBC)
// ---------------------------------------------------------------------------

function RefGallery({ room, value, onChange, title = 'Quais destas referências agradam vocês?' }: {
  room: RefRoom; value: string[]; onChange: (v: string[]) => void; title?: string;
}) {
  const refs = refsFor(room);
  const [zoom, setZoom] = useState<string | null>(null);
  const zoomed = refs.find(r => r.id === zoom);
  if (!refs.length) return null;
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter(x => x !== id) : [...value, id]);
  return (
    <Section title={title} hint="Projetos da Chaves Brites Correa. Marque quantas quiser; toque na foto para ampliar.">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-2.5">
        {refs.map(r => {
          const sel = value.includes(r.id);
          return (
            <div key={r.id} className="relative rounded-2xl overflow-hidden bg-white flex flex-col"
              style={{ border: sel ? '2px solid #6c4df6' : '1px solid rgba(108,77,246,0.15)', boxShadow: sel ? '0 6px 18px rgba(108,77,246,0.22)' : undefined }}>
              <button type="button" onClick={() => setZoom(r.id)} aria-label={`Ampliar: ${r.caption}`} className="block p-0 border-0 bg-transparent">
                <RefPhoto image={r.image} palette={STYLE_PALETTES.modernobr} alt={r.caption} className="aspect-[4/3]" />
              </button>
              <button type="button" onClick={() => toggle(r.id)} aria-pressed={sel} aria-label={sel ? `Desmarcar: ${r.caption}` : `Gostei: ${r.caption}`}
                className={`absolute top-2 right-2 w-11 h-11 rounded-full flex items-center justify-center ${sel ? 'v-grad' : 'bg-white'}`}
                style={{ boxShadow: '0 2px 10px rgba(0,0,0,0.18)' }}>
                <Heart size={18} fill={sel ? 'currentColor' : 'none'} />
              </button>
              <p className="px-3 py-2 m-0 text-[12px] leading-snug" style={{ fontWeight: 500 }}>{r.caption}</p>
            </div>
          );
        })}
      </div>
      {value.length > 0 && <p className="text-[12px] text-vsoft m-0">{value.length} referência{value.length === 1 ? '' : 's'} marcada{value.length === 1 ? '' : 's'}.</p>}
      {zoomed && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(20,16,40,0.82)' }} onClick={() => setZoom(null)} role="dialog" aria-modal="true" aria-label={zoomed.caption}>
          <div className="relative max-w-5xl w-full" onClick={e => e.stopPropagation()}>
            <img src={zoomed.image.file} alt={zoomed.caption} className="w-full rounded-2xl" style={{ maxHeight: '78vh', objectFit: 'contain', background: '#000' }} />
            <div className="flex flex-wrap items-center gap-2 mt-3">
              <p className="flex-1 m-0 text-[14px]" style={{ color: '#fff', fontWeight: 600 }}>{zoomed.caption}</p>
              <button type="button" onClick={() => toggle(zoomed.id)} className={`px-5 rounded-full text-[13px] flex items-center gap-2 ${value.includes(zoomed.id) ? 'v-grad' : 'bg-white'}`} style={{ minHeight: 44, fontWeight: 700 }}>
                <Heart size={16} fill={value.includes(zoomed.id) ? 'currentColor' : 'none'} /> {value.includes(zoomed.id) ? 'Marcada' : 'Gostei'}
              </button>
              <button type="button" onClick={() => setZoom(null)} className="px-5 rounded-full text-[13px] bg-white" style={{ minHeight: 44, fontWeight: 600 }}>Fechar</button>
            </div>
          </div>
        </div>
      )}
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Corpo de cada bloco
// ---------------------------------------------------------------------------

function BlockBody({ block, draft, setA, onStyleDone }: {
  block: IBBlock; draft: InteriorBriefingData; setA: (p: Partial<IBAnswers>) => void; onStyleDone: () => void;
}) {
  const a = draft.answers;
  const body = blockContent(block, draft, setA, onStyleDone);
  const dorm = block.kind === 'dorm' ? draft.config.dorms.find(d => d.id === block.dormId) : undefined;
  const room: RefRoom | null = block.kind === 'sala' ? 'sala' : block.kind === 'jantar' ? 'jantar' : block.kind === 'cozinha' ? 'cozinha'
    : block.kind === 'escritorio' ? 'escritorio' : dorm ? dormRefRoom(dorm.type) : null;
  if (!room) return body;
  return (
    <div className="flex flex-col gap-8">
      <RefGallery room={room} value={a.refs[block.key] || []} onChange={v => setA({ refs: { ...a.refs, [block.key]: v } })} />
      {body}
    </div>
  );
}

function blockContent(block: IBBlock, draft: InteriorBriefingData, setA: (p: Partial<IBAnswers>) => void, onStyleDone: () => void) {
  const a = draft.answers;
  switch (block.kind) {
    case 'moradores': return <BlockMoradores a={a} setA={setA} />;
    case 'estilo': return <BlockEstilo a={a} setA={setA} onDone={onStyleDone} wasDone={!!draft.done.estilo} />;
    case 'sala': return <BlockSala a={a} setA={setA} />;
    case 'jantar': return <BlockJantar a={a} setA={setA} />;
    case 'cozinha': return <BlockCozinha a={a} setA={setA} />;
    case 'acabamentos': return <BlockAcabamentos a={a} setA={setA} areas={finishAreasOf(draft.config)} />;
    case 'dorm': {
      const dorm = draft.config.dorms.find(d => d.id === block.dormId);
      if (!dorm) return null;
      return <BlockDorm dorm={dorm} value={dormAnswer(draft, dorm)} onChange={v => setA({ dorms: { ...a.dorms, [dorm.id]: v } })} />;
    }
    case 'escritorio': return <BlockEscritorio a={a} setA={setA} />;
    case 'roupeiro': return <BlockRoupeiro a={a} setA={setA} />;
    case 'ficar': return <BlockFicar a={a} setA={setA} />;
    case 'prioridades': return <BlockPrioridades a={a} setA={setA} />;
  }
}

type BlockProps = { a: IBAnswers; setA: (p: Partial<IBAnswers>) => void };

function BlockMoradores({ a, setA }: BlockProps) {
  const setPets = (v: string[]) => {
    const added = v.find(x => !a.pets.includes(x));
    if (added === 'Não temos pets') return setA({ pets: ['Não temos pets'] });
    setA({ pets: v.filter(x => x !== 'Não temos pets') });
  };
  return (
    <div className="flex flex-col gap-7">
      <Section title="Quem mora na casa?" hint="Conte todos que vivem aqui hoje e quem deve chegar em breve.">
        <Counter label="Adultos" hint="A partir de 18 anos" value={a.adults} min={1} onChange={n => setA({ adults: n })} />
        <Counter label="Crianças" hint="Inclua quem está para chegar" value={a.kids} onChange={n => setA({ kids: n })} />
        <Counter label="Idosos" hint="Ou pessoas com mobilidade reduzida" value={a.elders} onChange={n => setA({ elders: n })} />
        {a.kids > 0 && <Note>Nos quartos das crianças, vamos perguntar sobre a cama e como o quarto acompanha o crescimento.</Note>}
      </Section>
      <Section title="E os pets?" hint="Isso muda a escolha de tecidos, tapetes e revestimentos.">
        <ChipGroup options={PET_OPTIONS} value={a.pets} onChange={setPets} />
        {(a.pets.includes('Cão grande') || a.pets.includes('Gato')) && <Note>Anotado. Vamos priorizar tecidos resistentes a unhas e pelos.</Note>}
      </Section>
      <Section title="Como é a rotina?" hint="Marque tudo o que descreve a casa de vocês.">
        <ChipGroup options={HABIT_OPTIONS} value={a.habits} onChange={v => setA({ habits: v })} />
      </Section>
    </div>
  );
}

function BlockEstilo({ a, setA, onDone, wasDone }: BlockProps & { onDone: () => void; wasDone: boolean }) {
  const answered = STYLE_CARDS.filter(c => a.votes[c.id] !== undefined).length;
  const allAnswered = answered === STYLE_CARDS.length;
  const [phase, setPhase] = useState<'intro' | 'game' | 'profile'>(allAnswered ? 'profile' : answered > 0 ? 'game' : 'intro');
  const firstOpen = STYLE_CARDS.findIndex(c => a.votes[c.id] === undefined);
  const idx = firstOpen === -1 ? STYLE_CARDS.length - 1 : firstOpen;
  const card = STYLE_CARDS[idx];

  const vote = (v: Vote) => {
    const votes = { ...a.votes, [card.id]: v };
    setA({ votes });
    if (STYLE_CARDS.every(c => votes[c.id] !== undefined)) setPhase('profile');
  };
  const undo = () => {
    if (idx === 0) return;
    const votes = { ...a.votes };
    delete votes[STYLE_CARDS[idx - 1].id];
    setA({ votes });
  };

  // Atalhos de teclado no desktop: ← não suporto · ↓ tanto faz · → amo.
  useEffect(() => {
    if (phase !== 'game') return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); vote(-2); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); vote(0); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); vote(2); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (phase === 'intro') {
    return (
      <div className="flex flex-col gap-6">
        <Section title="Como vocês querem que a casa se sinta?" hint={`Vamos mostrar ${STYLE_CARDS.length} ambientes. Reajam a cada um sem pensar muito: o “não suporto” é tão importante quanto o “amo”.`}>
          <div className="grid gap-2 sm:grid-cols-3">
            <LegendItem icon={<Heart size={17} />} strong="Amo" text="moraria nesse ambiente" solid />
            <LegendItem icon={<Minus size={17} />} strong="Tanto faz" text="não me incomoda" />
            <LegendItem icon={<X size={17} />} strong="Não suporto" text="não quero isso em casa" warn />
          </div>
          <p className="text-[12px] text-vmute m-0">Respondam juntos. Quando não houver consenso, escolham “tanto faz”: vamos conversar sobre isso na reunião.</p>
        </Section>
        <button onClick={() => setPhase('game')} className="v-btn self-start px-6 py-3 text-[14px] flex items-center gap-2">Começar <ChevronRight size={16} /></button>
      </div>
    );
  }

  if (phase === 'profile') {
    return <StyleProfileView votes={a.votes} onRedo={() => { setA({ votes: {} }); setPhase('game'); }} onDone={onDone} doneLabel={wasDone ? 'Salvar e continuar' : 'Concluir bloco'} />;
  }

  const palette = STYLE_PALETTES[card.style];
  return (
    <div className="flex flex-col gap-4 max-w-[680px] mx-auto">
      <div className="flex items-center justify-between text-[12px] text-vmute">
        <span>Ambiente {Math.min(answered + 1, STYLE_CARDS.length)} de {STYLE_CARDS.length}</span>
        {answered > 0 && <button onClick={undo} className="px-2 py-2 underline" style={{ color: 'var(--v-accent-2)', fontWeight: 600 }}>Voltar à anterior</button>}
      </div>
      <div className="rounded-3xl overflow-hidden bg-white" style={{ border: '1px solid var(--v-border)', boxShadow: 'var(--v-shadow)' }}>
        <RefPhoto image={card.image} palette={palette} alt={card.caption} className="aspect-[4/3]" />
        <p className="px-4 py-3 m-0 text-[14px]" style={{ fontWeight: 500 }}>{card.caption}</p>
      </div>
      <div className="grid grid-cols-3 gap-2.5">
        <button onClick={() => vote(-2)} className="bg-white rounded-2xl flex flex-col items-center justify-center gap-1 text-[12px] ib-hover ib-warn-text" style={{ minHeight: 64, border: '1px solid rgba(108,77,246,0.18)', fontWeight: 600 }}><X size={20} />Não suporto</button>
        <button onClick={() => vote(0)} className="v-tint rounded-2xl flex flex-col items-center justify-center gap-1 text-[12px] hover:brightness-95" style={{ minHeight: 64, fontWeight: 600 }}><Minus size={20} />Tanto faz</button>
        <button onClick={() => vote(2)} className="v-grad rounded-2xl flex flex-col items-center justify-center gap-1 text-[12px]" style={{ minHeight: 64, fontWeight: 600 }}><Heart size={20} />Amo</button>
      </div>
      <p className="hidden lg:block text-center text-[11px] text-vmute m-0">Atalhos: ← não suporto · ↓ tanto faz · → amo</p>
    </div>
  );
}

function LegendItem({ icon, strong, text, solid, warn }: { icon: React.ReactNode; strong: string; text: string; solid?: boolean; warn?: boolean }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-white" style={{ border: '1px solid rgba(108,77,246,0.12)' }}>
      <span className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${solid ? 'v-grad' : warn ? 'ib-warn' : 'v-tint'}`}>{icon}</span>
      <span className="text-[13px] leading-snug"><b style={{ fontWeight: 700 }}>{strong}</b><br /><span className="text-vsoft">{text}</span></span>
    </div>
  );
}

function StyleProfileView({ votes, onRedo, onDone, doneLabel, team }: { votes: Record<string, Vote>; onRedo?: () => void; onDone?: () => void; doneLabel?: string; team?: boolean }) {
  const prof = computeProfile(votes);
  const top = prof.list[0];
  return (
    <div className="flex flex-col gap-6">
      {top ? (
        <>
          <div className="v-grad rounded-3xl p-6 flex flex-col gap-2">
            <p className="text-[11px] uppercase tracking-[0.14em] m-0" style={{ fontWeight: 700, opacity: 0.85 }}>{team ? 'Perfil de estilo da família' : 'Seu perfil de estilo'}</p>
            <p className="text-[28px] leading-tight m-0" style={{ fontWeight: 800 }}>{top.name}</p>
            <p className="text-[14px] leading-relaxed m-0" style={{ opacity: 0.9 }}>{STYLES[top.key].desc}</p>
          </div>
          <Section title="A mistura de vocês">
            {prof.list.map(p => (
              <div key={p.key} className="flex flex-col gap-1.5">
                <div className="flex justify-between text-[13px]"><span>{p.name}</span><b style={{ fontWeight: 700 }}>{p.pct}%</b></div>
                <div className="v-track"><div className="v-fill" style={{ width: `${p.pct}%` }} /></div>
              </div>
            ))}
          </Section>
          {prof.palette.length > 0 && (
            <Section title="Paleta que apareceu nas escolhas">
              <div className="grid grid-cols-5 gap-2">{prof.palette.map(c => <div key={c} className="h-14 rounded-xl" style={{ background: c, border: '1px solid rgba(0,0,0,0.06)' }} />)}</div>
            </Section>
          )}
          {prof.rejected.length > 0 && <Note kind="warn"><b style={{ fontWeight: 700 }}>O que fica de fora: </b>{prof.rejected.join(', ')}</Note>}
        </>
      ) : (
        <Note kind="info"><b style={{ fontWeight: 700 }}>Nenhum ambiente conquistou vocês.</b> Tudo bem: isso também é uma informação valiosa, e vamos explorar referências juntos na reunião.</Note>
      )}
      <p className="text-[12px] text-vmute m-0">Este perfil é uma leitura inicial. Na reunião, vamos aprofundar materiais, cores e acabamentos.</p>
      {(onDone || onRedo) && (
        <div className="flex flex-col sm:flex-row-reverse gap-2">
          {onDone && <button onClick={onDone} className="v-btn px-6 py-3 text-[14px] flex items-center justify-center gap-2"><Check size={16} /> {doneLabel}</button>}
          {onRedo && <button onClick={onRedo} className="v-btn-ghost px-5 py-3 text-[13px] flex items-center justify-center gap-2"><RotateCcw size={14} /> Refazer o jogo</button>}
        </div>
      )}
    </div>
  );
}

function BlockSala({ a, setA }: BlockProps) {
  const tv = TVS.find(t => t.inches === a.tvInches) || TVS[2];
  const { min, max } = tvRange(a.tvInches);
  const st = tvStatus(a.tvInches, a.tvDistM);
  const SC = 50; // px por metro
  return (
    <div className="flex flex-col gap-7">
      <Section title="Qual o tamanho da TV?" hint="Se já tem a TV, anote o modelo em “O que vai ficar”: a largura muda entre marcas.">
        <div className="grid grid-cols-5 gap-1.5">
          {TVS.map(t => {
            const sel = t.inches === a.tvInches;
            return (
              <button key={t.inches} onClick={() => setA({ tvInches: t.inches })} aria-pressed={sel}
                className={`rounded-2xl flex flex-col items-center justify-center gap-0.5 ${sel ? 'v-grad' : 'bg-white ib-hover'}`}
                style={{ minHeight: 62, border: sel ? '1px solid transparent' : '1px solid rgba(108,77,246,0.18)' }}>
                <span className="text-[15px]" style={{ fontWeight: 800 }}>{t.inches}"</span>
                <span className="text-[10px]">{fmt1(t.widthM)} m</span>
              </button>
            );
          })}
        </div>
      </Section>
      <Section title="Distância do sofá até a TV" hint="Arraste até a medida aproximada do projeto.">
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_300px] items-start">
          <div className="flex flex-col gap-3">
            <RangeField id="ib-dist" label="Distância" value={a.tvDistM} display={`${fmt1(a.tvDistM)} m`} min={1.5} max={4} step={0.1} onChange={n => setA({ tvDistM: Math.round(n * 10) / 10 })} />
            <Note kind={st.ok ? 'ok' : 'warn'}>{st.text}</Note>
          </div>
          <div aria-hidden="true" className="relative rounded-2xl bg-white overflow-hidden" style={{ height: 290, border: '1px solid rgba(108,77,246,0.12)' }}>
            <div className="absolute left-0 right-0" style={{ top: 22 + min * SC, height: (max - min) * SC, background: '#ece7fd', borderTop: '1px dashed #9b88f0', borderBottom: '1px dashed #9b88f0' }} />
            <span className="absolute right-3 text-[10px]" style={{ top: 26 + min * SC, color: 'var(--v-accent-2)' }}>faixa ideal</span>
            <div className="absolute rounded-sm" style={{ top: 16, left: `calc(50% - ${(tv.widthM * SC) / 2}px)`, width: tv.widthM * SC, height: 6, background: '#1b1830' }} />
            <span className="absolute left-0 right-0 text-center text-[10px] text-vmute" style={{ top: 26 }}>TV {a.tvInches}"</span>
            <div className="absolute" style={{ left: '50%', top: 22, width: 1, height: a.tvDistM * SC, background: '#a39fb8' }} />
            <div className="absolute v-grad rounded-xl" style={{ left: 'calc(50% - 55px)', top: 22 + a.tvDistM * SC, width: 110, height: 44 }} />
            <span className="absolute text-[11px] text-vsoft" style={{ left: 'calc(50% + 64px)', top: 34 + a.tvDistM * SC }}>sofá</span>
          </div>
        </div>
      </Section>
      <Section title="O que fica junto da TV?" hint="Cada item precisa de nicho ventilado e passagem de cabos.">
        <ChipGroup options={TV_EXTRAS} value={a.tvExtras} onChange={v => setA({ tvExtras: v })} />
      </Section>
    </div>
  );
}

function BlockJantar({ a, setA }: BlockProps) {
  return (
    <div className="flex flex-col gap-7">
      <Section title="Quantas pessoas à mesa?" hint="No dia a dia e quando recebem família ou amigos.">
        <Counter label="No dia a dia" value={a.dinnerDaily} min={1} onChange={n => setA({ dinnerDaily: n, dinnerParty: Math.max(n, a.dinnerParty) })} />
        <Counter label="Em ocasiões especiais" value={a.dinnerParty} min={a.dinnerDaily} onChange={n => setA({ dinnerParty: n })} />
      </Section>
      <Section title="Formato preferido">
        <OptionCards options={[{ id: 'retangular', label: 'Retangular' }, { id: 'redonda', label: 'Redonda' }, { id: 'indiferente', label: 'Tanto faz' }]} value={a.dinnerShape} onChange={v => setA({ dinnerShape: v })} />
        <Note>{dinnerTable(a.dinnerParty, a.dinnerShape)}{a.dinnerParty > a.dinnerDaily ? '. Uma mesa extensível atende os dois cenários.' : '.'} Atrás das cadeiras, deixamos de 75 a 90 cm livres.</Note>
      </Section>
    </div>
  );
}

function BlockCozinha({ a, setA }: BlockProps) {
  const [newItem, setNewItem] = useState('');
  const has = (id: string) => a.kitchen.some(k => k.id === id);
  const toggle = (id: string) => setA({ kitchen: has(id) ? a.kitchen.filter(k => k.id !== id) : [...a.kitchen, { id, model: '', unknown: false, voltage: '' }] });
  const update = (id: string, patch: Partial<IBKitchenItem>) => setA({ kitchen: a.kitchen.map(k => k.id === id ? { ...k, ...patch } : k) });
  const addCustom = () => {
    const label = newItem.trim();
    if (!label) return;
    setA({ kitchen: [...a.kitchen, { id: `custom-${Date.now().toString(36)}`, label, custom: true, model: '', unknown: false, voltage: '' }] });
    setNewItem('');
  };
  return (
    <div className="flex flex-col gap-7">
      <Section title="Qual a tensão da casa?" hint="Se não souber, a equipe confirma no projeto elétrico.">
        <ChipGroup single options={[...VOLTAGES.filter(v => v.id !== 'bivolt').map(v => v.label), 'Não sei']}
          value={a.houseVoltage ? [voltageLabel(a.houseVoltage)] : []}
          onChange={v => setA({ houseVoltage: (VOLTAGES.find(x => x.label === v[0])?.id || '') as Voltage })} />
      </Section>
      <Section title="Quais equipamentos vão na cozinha?" hint="Marque os que já existem ou serão comprados. Modelo e voltagem definem os vãos da marcenaria e as tomadas.">
        <ChipGroup options={KITCHEN_ITEMS.map(k => k.label)} value={KITCHEN_ITEMS.filter(k => has(k.id)).map(k => k.label)}
          onChange={v => { const changed = KITCHEN_ITEMS.find(k => v.includes(k.label) !== has(k.id)); if (changed) toggle(changed.id); }} />
        <form className="flex gap-2" onSubmit={e => { e.preventDefault(); addCustom(); }}>
          <label htmlFor="ib-k-new" className="sr-only">Outro equipamento</label>
          <input id="ib-k-new" value={newItem} onChange={e => setNewItem(e.target.value)} placeholder="Outro equipamento (ex.: cervejeira, máquina de gelo)"
            className="flex-1 min-w-0 px-3 py-2.5 text-[14px]" style={{ minHeight: 44 }} />
          <button type="submit" disabled={!newItem.trim()} className="v-btn-ghost px-4 text-[13px] flex items-center gap-1.5 disabled:opacity-40" style={{ minHeight: 44 }}><Plus size={15} /> Adicionar</button>
        </form>
      </Section>
      {a.kitchen.length > 0 && (
        <Section title="Modelo e voltagem" hint="Se ainda não sabe o modelo, marque “não sei ainda”: vira um ponto para a reunião.">
          <div className="flex flex-col gap-2.5">
            {a.kitchen.map(k => (
              <div key={k.id} className="flex flex-col gap-2.5 px-4 py-3 rounded-2xl bg-white" style={{ border: '1px solid rgba(108,77,246,0.12)' }}>
                <div className="flex items-center gap-2">
                  <p className="flex-1 text-[14px] m-0" style={{ fontWeight: 700 }}>{kitchenLabel(k)}</p>
                  <button type="button" aria-label={`Remover ${kitchenLabel(k)}`} onClick={() => setA({ kitchen: a.kitchen.filter(x => x.id !== k.id) })}
                    className="w-11 h-11 -mr-2 rounded-full flex items-center justify-center ib-hover"><X size={16} /></button>
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                  <label htmlFor={`ib-k-${k.id}`} className="sr-only">Modelo de {kitchenLabel(k)}</label>
                  <input id={`ib-k-${k.id}`} value={k.model} disabled={k.unknown} onChange={e => update(k.id, { model: e.target.value })}
                    placeholder={k.unknown ? 'Definir na reunião' : 'Marca e modelo'} className="flex-1 min-w-0 px-3 py-2.5 text-[14px]" style={{ minHeight: 44 }} />
                  <label className="flex items-center gap-2 text-[12px] text-vsoft whitespace-nowrap" style={{ minHeight: 44 }}>
                    <input type="checkbox" checked={k.unknown} onChange={e => update(k.id, { unknown: e.target.checked })} className="w-5 h-5" style={{ accentColor: '#6c4df6' }} /> Não sei ainda
                  </label>
                </div>
                <div className="grid grid-cols-3 gap-1 p-1 rounded-full v-tint" role="radiogroup" aria-label={`Voltagem de ${kitchenLabel(k)}`}>
                  {VOLTAGES.map(v => {
                    const sel = k.voltage === v.id;
                    return (
                      <button key={v.id} type="button" role="radio" aria-checked={sel} onClick={() => update(k.id, { voltage: sel ? '' : v.id })}
                        className={`rounded-full text-[12px] ${sel ? 'v-grad' : ''}`} style={{ minHeight: 40, fontWeight: sel ? 700 : 500 }}>{v.label}</button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}
      <Section title="O que fica sempre à mão na bancada?" hint="Eletroportáteis usados todo dia precisam de lugar fixo e tomada.">
        <ChipGroup options={SMALL_APPLIANCES} value={a.smallAppliances} onChange={v => setA({ smallAppliances: v })} />
      </Section>
    </div>
  );
}

function ComboSwatch({ combo }: { combo: FinishCombo }) {
  // Mini elevação: bancada (pedra) sobre o armário, com veios desenhados.
  const veins = combo.vein ? `repeating-linear-gradient(115deg, transparent 0 14px, ${combo.vein}55 14px 15px, transparent 15px 31px), ` : '';
  return (
    <div aria-hidden="true" className="relative w-full overflow-hidden rounded-xl" style={{ aspectRatio: '16 / 10', background: '#f7f5fe' }}>
      <div className="absolute left-0 right-0" style={{ top: '22%', height: '14%', background: `${veins}${combo.stone}`, boxShadow: '0 2px 0 rgba(0,0,0,0.12)' }} />
      <div className="absolute left-0 right-0 bottom-0 grid grid-cols-3 gap-[2px]" style={{ top: '36%', background: 'rgba(0,0,0,0.12)' }}>
        {[0, 1, 2].map(i => <div key={i} style={{ background: combo.cabinet }} className="relative"><span className="absolute left-1/2 -translate-x-1/2 rounded-full" style={{ top: 8, width: '40%', height: 3, background: 'rgba(0,0,0,0.18)' }} /></div>)}
      </div>
    </div>
  );
}

function ToneCards({ options, value, onPick, label }: { options: typeof CABINET_TONES; value: string; onPick: (id: string) => void; label: string }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2" role="radiogroup" aria-label={label}>
      {options.map(o => {
        const sel = value === o.id;
        return (
          <button key={o.id} type="button" role="radio" aria-checked={sel} onClick={() => onPick(sel ? '' : o.id)}
            className="rounded-2xl bg-white text-left overflow-hidden flex flex-col"
            style={{ border: sel ? '2px solid #6c4df6' : '1px solid rgba(108,77,246,0.18)', boxShadow: sel ? '0 6px 18px rgba(108,77,246,0.22)' : undefined }}>
            <span className="block h-12" style={{ background: o.swatch }} />
            <span className="px-3 py-2 flex flex-col">
              <span className="text-[13px] flex items-center gap-1.5" style={{ fontWeight: 700 }}>{sel && <CheckCircle2 size={14} style={{ color: 'var(--v-accent)' }} />}{o.label}</span>
              <span className="text-[11px] text-vmute leading-snug">{o.hint}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function BlockAcabamentos({ a, setA, areas }: BlockProps & { areas: FinishArea[] }) {
  const [area, setArea] = useState<FinishArea>(areas[0]);
  const f = a.finishes[area] || emptyFinish();
  const setF = (p: Partial<IBFinish>) => setA({ finishes: { ...a.finishes, [area]: { ...f, ...p } } });
  const combos = FINISH_COMBOS.filter(c => c.areas.includes(area))
    .map(c => ({ c, score: (f.cabinet && c.cabinetTone === f.cabinet ? 1 : 0) + (f.stone && c.stoneTone === f.stone ? 1 : 0) }))
    .sort((x, y) => y.score - x.score);
  return (
    <div className="flex flex-col gap-7">
      {areas.length > 1 && (
        <div className="flex flex-wrap gap-1 p-1 rounded-full v-tint self-start" role="tablist" aria-label="Ambiente">
          {areas.map(id => {
            const done = !!a.finishes[id]?.combo || (!!a.finishes[id]?.cabinet && !!a.finishes[id]?.stone);
            return (
              <button key={id} role="tab" aria-selected={area === id} onClick={() => setArea(id)}
                className={`px-4 rounded-full text-[13px] flex items-center gap-1.5 ${area === id ? 'bg-white' : ''}`}
                style={{ minHeight: 40, fontWeight: area === id ? 700 : 500, boxShadow: area === id ? 'var(--v-shadow-sm)' : undefined }}>
                {done && <Check size={13} />}{FINISH_AREAS.find(x => x.id === id)!.label}
              </button>
            );
          })}
        </div>
      )}
      {(area === 'banheiro' || area === 'gourmet' || area === 'cozinha') && (
        <RefGallery room={area === 'cozinha' ? 'cozinha' : area} title="Que marcenaria e bancada chamam a atenção?"
          value={a.refs[`acab-${area}`] || []} onChange={v => setA({ refs: { ...a.refs, [`acab-${area}`]: v } })} />
      )}
      <Section title="Armários: claros ou escuros?" hint="Pense na sensação que querem no ambiente, não no material exato.">
        <ToneCards options={CABINET_TONES} value={f.cabinet} onPick={id => setF({ cabinet: id })} label="Tom dos armários" />
      </Section>
      <Section title="E a pedra da bancada?" hint="Bancadas claras ampliam; escuras disfarçam marcas do dia a dia.">
        <ToneCards options={STONE_TONES} value={f.stone} onPick={id => setF({ stone: id })} label="Tom da pedra" />
        <ChipGroup single options={STONE_FINISHES} value={f.stoneFinish ? [f.stoneFinish] : []} onChange={v => setF({ stoneFinish: v[0] })} />
      </Section>
      <Section title="Combinações sugeridas" hint="As que combinam com suas escolhas aparecem primeiro. Escolha uma ou deixe para a reunião.">
        <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
          {combos.map(({ c, score }) => {
            const sel = f.combo === c.id;
            return (
              <button key={c.id} type="button" onClick={() => setF({ combo: sel ? '' : c.id })} aria-pressed={sel}
                className="rounded-2xl bg-white text-left p-3 flex flex-col gap-2.5"
                style={{ border: sel ? '2px solid #6c4df6' : '1px solid rgba(108,77,246,0.18)', boxShadow: sel ? '0 6px 18px rgba(108,77,246,0.22)' : undefined }}>
                <ComboSwatch combo={c} />
                <span className="flex items-start justify-between gap-2">
                  <span className="text-[14px] flex items-center gap-1.5" style={{ fontWeight: 700 }}>{sel && <CheckCircle2 size={15} style={{ color: 'var(--v-accent)' }} />}{c.name}</span>
                  {score === 2 && !sel && <span className="v-chip v-chip-ok flex-shrink-0">combina</span>}
                </span>
                <span className="text-[12px] leading-snug"><b style={{ fontWeight: 600 }}>{c.cabinetName}</b> + <b style={{ fontWeight: 600 }}>{c.stoneName}</b></span>
                <span className="text-[11px] text-vmute leading-snug">{c.note}</span>
              </button>
            );
          })}
        </div>
        {area === 'gourmet' && <Note kind="info">Na área gourmet, granito e quartzito são os mais indicados: mármore e travertino mancham com gordura, carvão e ácidos.</Note>}
        <p className="text-[11px] text-vmute m-0">Cores aproximadas. As amostras reais de MDF e pedra são apresentadas na reunião.</p>
      </Section>
    </div>
  );
}

function BedPlan({ answer }: { answer: IBDormAnswer }) {
  const bed = BEDS.find(b => b.id === answer.bed) || BEDS[3];
  const S = 0.75;
  const w = Math.round(bed.w * S), h = Math.round(bed.l * S);
  const two = bed.w >= 138;
  return (
    <div aria-hidden="true" className="relative rounded-2xl bg-white overflow-hidden" style={{ height: 200, border: '1px solid rgba(108,77,246,0.12)' }}>
      <div className="absolute left-0 right-0 top-0" style={{ height: 10, background: '#e2dcf7' }} />
      <div className="absolute left-1/2 -translate-x-1/2 flex items-start gap-1.5" style={{ top: 12 }}>
        <div style={{ width: 34, height: 30, borderRadius: 4, background: '#c9bdf3', marginTop: 6 }} />
        <div className="relative" style={{ width: w, height: h, borderRadius: 6, background: '#f7f5fe', border: '2px solid #6c4df6', boxSizing: 'border-box' }}>
          <div className="absolute flex gap-2 justify-center" style={{ top: 8, left: 6, right: 6 }}>
            <div style={{ flex: 1, height: 18, borderRadius: 6, background: '#fff', border: '1px solid #d9d1f7' }} />
            {two && <div style={{ flex: 1, height: 18, borderRadius: 6, background: '#fff', border: '1px solid #d9d1f7' }} />}
          </div>
        </div>
        <div style={{ width: 34, height: 30, borderRadius: 4, background: '#c9bdf3', marginTop: 6 }} />
      </div>
      <span className="absolute left-3 bottom-2 text-[10px] text-vmute">Vista de cima, em escala</span>
    </div>
  );
}

function BlockDorm({ dorm, value, onChange }: { dorm: IBDorm; value: IBDormAnswer; onChange: (v: IBDormAnswer) => void }) {
  const top = bedTopCm(value);
  const set = (p: Partial<IBDormAnswer>) => onChange({ ...value, ...p });
  return (
    <div className="flex flex-col gap-7">
      {dorm.type === 'infantil' && (
        <Section title="Que tipo de cama?" hint="Pense em como o quarto vai acompanhar o crescimento.">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {KID_BEDS.map(k => {
              const sel = (value.kidBed || 'comum') === k.id;
              return (
                <button key={k.id} onClick={() => set({ kidBed: k.id, bed: k.id === 'beliche' || k.id === 'bicama' ? 'solteiro' : value.bed })} aria-pressed={sel}
                  className="rounded-2xl overflow-hidden bg-white text-left flex flex-col"
                  style={{ border: sel ? '2px solid #6c4df6' : '1px solid rgba(108,77,246,0.18)', boxShadow: sel ? '0 6px 18px rgba(108,77,246,0.25)' : undefined }}>
                  <RefPhoto image={k.image} palette={STYLE_PALETTES.escandinavo} alt={k.label} className="aspect-[4/3]" />
                  <span className="px-3 py-2.5 flex flex-col gap-0.5">
                    <span className="text-[13px] flex items-center gap-1.5" style={{ fontWeight: 700 }}>{sel && <CheckCircle2 size={14} style={{ color: 'var(--v-accent)' }} />}{k.label}</span>
                    <span className="text-[11px] text-vmute leading-snug">{k.hint}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </Section>
      )}
      <Section title="Qual o tamanho da cama?" hint="Considere o colchão que será usado na casa nova.">
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-start">
          <OptionCards options={BEDS.map(b => ({ id: b.id, label: b.label, detail: `${b.w} × ${b.l} cm` }))} value={value.bed} onChange={v => set({ bed: v })} />
          <BedPlan answer={value} />
        </div>
      </Section>
      <Section title="Base da cama">
        <ChipGroup single options={BASES.map(b => b.label)} value={[BASES.find(b => b.id === value.base)?.label || '']}
          onChange={v => { const b = BASES.find(x => x.label === v[0]); if (b) set({ base: b.id }); }} />
      </Section>
      <Section title="Altura do colchão" hint="Colchões atuais passam de 30 cm e mudam a altura dos criados-mudos.">
        <RangeField id={`ib-mh-${dorm.id}`} label="Altura" value={value.mattressCm} display={`${value.mattressCm} cm`} min={12} max={45} step={1} onChange={n => set({ mattressCm: n })} />
        <Note>O topo do colchão fica a cerca de {top} cm do piso. Criados-mudos entre {top - 5} e {top} cm de altura acompanham bem.</Note>
      </Section>
    </div>
  );
}

function BlockEscritorio({ a, setA }: BlockProps) {
  const o = a.office;
  const desk = officeDeskCm(o);
  const setO = (p: Partial<IBAnswers['office']>) => setA({ office: { ...o, ...p } });
  return (
    <div className="flex flex-col gap-7">
      <Section title="Como o escritório é usado?" hint="Isso define a bancada, a iluminação e o fundo para videochamadas.">
        <Counter label="Pessoas trabalhando" hint="Ao mesmo tempo" value={o.people} min={1} onChange={n => setO({ people: n })} />
        <Counter label="Monitores por pessoa" hint="Além do notebook" value={o.monitors} onChange={n => setO({ monitors: n })} />
        <ChipGroup options={OFFICE_USES} value={o.use} onChange={v => setO({ use: v })} />
      </Section>
      <Section title="O que precisa caber?" hint="Marque tudo o que fica no escritório.">
        <ChipGroup options={OFFICE_ITEMS} value={o.items} onChange={v => setO({ items: v })} />
        <Note>Bancada sugerida: a partir de {fmt1(desk.total / 100)} m de largura ({desk.perPerson} cm por pessoa{o.monitors >= 2 ? ', para dois monitores' : ''}).</Note>
      </Section>
    </div>
  );
}

function BlockRoupeiro({ a, setA }: BlockProps) {
  const [tab, setTab] = useState<'p1' | 'p2'>('p1');
  const w = a.wardrobe;
  const cur = w[tab];
  const est = wardrobeEstimate(cur);
  const setCount = (key: keyof WardrobeCounts, n: number) => setA({ wardrobe: { ...w, [tab]: { ...cur, [key]: n } } });
  const nameKey = tab === 'p1' ? 'p1Name' : 'p2Name';
  return (
    <div className="flex flex-col gap-5">
      <Section title="O que vai no roupeiro?" hint="Abram o armário e contem por alto. As quantidades de cada um definem os lados do roupeiro.">
        <div className="grid grid-cols-2 gap-1 p-1 rounded-full v-tint" role="tablist">
          {(['p1', 'p2'] as const).map(t => (
            <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
              className={`rounded-full text-[13px] ${tab === t ? 'bg-white' : ''}`} style={{ minHeight: 44, fontWeight: tab === t ? 700 : 500, boxShadow: tab === t ? 'var(--v-shadow-sm)' : undefined }}>
              {w[t === 'p1' ? 'p1Name' : 'p2Name'] || (t === 'p1' ? 'Pessoa 1' : 'Pessoa 2')}
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="ib-wname" className="text-[12px] text-vmute">Nome de quem usa este lado (opcional)</label>
          <input id="ib-wname" value={w[nameKey]} onChange={e => setA({ wardrobe: { ...w, [nameKey]: e.target.value } })} className="px-3 py-2.5 text-[14px]" style={{ minHeight: 44 }} />
        </div>
      </Section>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px] items-start">
        <div className="flex flex-col gap-2.5">
          {WARDROBE_ITEMS.map(it => <Counter key={it.key} label={it.label} hint={it.hint} value={cur[it.key]} step={it.step} onChange={n => setCount(it.key, n)} />)}
        </div>
        <div className="v-grad rounded-3xl p-5 flex flex-col gap-3">
          <p className="text-[11px] uppercase tracking-[0.12em] m-0" style={{ fontWeight: 700, opacity: 0.85 }}>Estimativa preliminar</p>
          <div className="grid grid-cols-2 gap-3">
            <Est value={`${fmt1(est.curtoM)} m`} label="cabideiro curto" />
            <Est value={`${fmt1(est.longoM)} m`} label="cabideiro longo e calceiro" />
            <Est value={String(est.prateleiras)} label="prateleiras de 80 cm" />
            <Est value={String(est.sapateiras)} label="prateleiras de sapatos" />
          </div>
          <p className="text-[11px] leading-relaxed m-0" style={{ opacity: 0.85 }}>A equipe revisa esses números ao desenhar a marcenaria.</p>
        </div>
      </div>
    </div>
  );
}
const Est = ({ value, label }: { value: string; label: string }) => (
  <div><p className="text-[20px] m-0" style={{ fontWeight: 800 }}>{value}</p><p className="text-[11px] m-0" style={{ opacity: 0.85 }}>{label}</p></div>
);

function BlockFicar({ a, setA }: BlockProps) {
  return (
    <div className="flex flex-col gap-7">
      <Section title="O que vai ficar?" hint="Móveis, obras de arte, objetos afetivos e eletrodomésticos que vão para a casa nova. Medidas ajudam muito.">
        <label htmlFor="ib-keep" className="sr-only">O que vai ficar</label>
        <textarea id="ib-keep" value={a.keep} onChange={e => setA({ keep: e.target.value })} rows={6}
          placeholder={'Ex.:\nPoltrona de couro da avó (lugar de destaque)\nMesa de jantar de madeira, 2,20 × 1,00 m\nTV Samsung 65" que já temos'}
          className="w-full px-4 py-3 text-[14px] leading-relaxed" />
      </Section>
      <Section title="Algo mais que devemos saber?" hint="O que vocês amavam ou detestavam na casa anterior, manias, sonhos.">
        <label htmlFor="ib-notes" className="sr-only">Observações</label>
        <textarea id="ib-notes" value={a.notes} onChange={e => setA({ notes: e.target.value })} rows={4} className="w-full px-4 py-3 text-[14px] leading-relaxed" />
      </Section>
    </div>
  );
}

function BlockPrioridades({ a, setA }: BlockProps) {
  const listRef = useRef<HTMLOListElement>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const moveTo = (id: string, to: number) => {
    const from = a.priorities.indexOf(id);
    if (from < 0 || to < 0 || to >= a.priorities.length || from === to) return;
    const p = [...a.priorities];
    p.splice(from, 1);
    p.splice(to, 0, id);
    setA({ priorities: p });
  };
  // Arrastar com mouse ou toque: a posição do ponteiro define a nova ordem em tempo real.
  const onMove = (e: React.PointerEvent) => {
    if (!dragId || !listRef.current) return;
    const items = Array.from(listRef.current.children) as HTMLElement[];
    let target = items.length - 1;
    for (let i = 0; i < items.length; i++) {
      const r = items[i].getBoundingClientRect();
      if (e.clientY < r.top + r.height / 2) { target = i; break; }
    }
    moveTo(dragId, target);
  };
  return (
    <Section title="O que é mais importante para vocês?" hint="Arraste para ordenar do mais para o menos importante. Se o orçamento apertar, é isso que guia as escolhas.">
      <ol ref={listRef} className="flex flex-col gap-2 m-0 p-0 list-none" style={{ touchAction: dragId ? 'none' : undefined }}>
        {a.priorities.map((id, i) => {
          const label = PRIORITY_OPTIONS.find(p => p.id === id)?.label;
          const dragging = dragId === id;
          return (
            <li key={id} className="flex items-center gap-3 pl-1 pr-3 py-1.5 rounded-2xl bg-white select-none"
              style={{ border: dragging ? '2px solid #6c4df6' : '1px solid rgba(108,77,246,0.12)', boxShadow: dragging ? '0 10px 26px rgba(108,77,246,0.28)' : undefined, transform: dragging ? 'scale(1.02)' : undefined, transition: 'box-shadow .15s, transform .15s' }}>
              <button type="button" aria-label={`Mover ${label}. Use as setas para cima e para baixo.`}
                onPointerDown={e => { e.preventDefault(); (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); setDragId(id); }}
                onPointerMove={onMove} onPointerUp={() => setDragId(null)} onPointerCancel={() => setDragId(null)}
                onKeyDown={e => {
                  if (e.key === 'ArrowUp') { e.preventDefault(); moveTo(id, i - 1); }
                  if (e.key === 'ArrowDown') { e.preventDefault(); moveTo(id, i + 1); }
                }}
                className="w-11 h-11 rounded-xl flex items-center justify-center ib-hover flex-shrink-0"
                style={{ cursor: dragging ? 'grabbing' : 'grab', touchAction: 'none' }}>
                <GripVertical size={18} className="text-vmute" />
              </button>
              <span className={`w-8 h-8 rounded-full flex items-center justify-center text-[13px] flex-shrink-0 ${i < 3 ? 'v-grad' : 'v-tint'}`} style={{ fontWeight: 800 }}>{i + 1}</span>
              <span className="flex-1 text-[14px]" style={{ fontWeight: 600 }}>{label}</span>
            </li>
          );
        })}
      </ol>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Revisão, envio e briefing enviado
// ---------------------------------------------------------------------------

function Review({ draft, blocks, onEdit, onBack, onSubmit }: {
  draft: InteriorBriefingData; blocks: IBBlock[]; onEdit: (key: string) => void; onBack: () => void; onSubmit: () => Promise<void>;
}) {
  const [agree, setAgree] = useState(false);
  const [sending, setSending] = useState(false);
  const pending = blocks.filter(b => !draft.done[b.key]);
  const canSend = agree && pending.length === 0 && !sending;
  return (
    <div className="v-card-border overflow-hidden">
      <div className="px-5 sm:px-6 py-4 border-b flex items-center gap-2" style={{ borderColor: 'var(--v-border)' }}>
        <button onClick={onBack} aria-label="Voltar aos blocos" className="lg:hidden w-11 h-11 -ml-2 rounded-full flex items-center justify-center ib-hover"><ChevronLeft size={20} /></button>
        <div>
          <p className="text-[10px] uppercase tracking-[0.14em] text-vmute m-0" style={{ fontWeight: 700 }}>Revisão</p>
          <h2 className="text-lg m-0" style={{ fontWeight: 800 }}>Confira antes de enviar</h2>
        </div>
      </div>
      <div className="p-5 sm:p-6 flex flex-col gap-3">
        <p className="text-[13px] text-vsoft m-0">Este resumo segue para a equipe da Chaves Brites Correa e vira a base da reunião de alinhamento.</p>
        {blocks.map(b => {
          const isDone = !!draft.done[b.key];
          return (
            <div key={b.key} className="flex items-start gap-3 px-4 py-3 rounded-2xl bg-white" style={{ border: '1px solid rgba(108,77,246,0.12)' }}>
              <div className="flex-1 min-w-0">
                <p className="text-[12px] text-vmute m-0">{b.title}</p>
                <p className={`text-[14px] leading-snug m-0 ${isDone ? '' : 'ib-warn-text'}`} style={{ fontWeight: 600 }}>{isDone ? blockSummary(draft, b) : 'Bloco pendente'}</p>
              </div>
              <button onClick={() => onEdit(b.key)} className="px-2 text-[13px] underline flex-shrink-0" style={{ minHeight: 44, color: 'var(--v-accent-2)', fontWeight: 600 }}>{isDone ? 'Editar' : 'Responder'}</button>
            </div>
          );
        })}
        <label className="flex items-start gap-3 pt-2 text-[13px] leading-relaxed cursor-pointer">
          <input type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)} className="w-5 h-5 mt-0.5 flex-shrink-0" style={{ accentColor: '#6c4df6' }} />
          <span>{ACCEPT_TEXT}</span>
        </label>
        {pending.length > 0 && <Note kind="warn">Faltam {pending.length} bloco(s) para enviar.</Note>}
      </div>
      <div className="px-5 sm:px-6 py-4 border-t" style={{ borderColor: 'var(--v-border)' }}>
        <button disabled={!canSend} onClick={async () => { setSending(true); try { await onSubmit(); } finally { setSending(false); } }}
          className="v-btn w-full sm:w-auto px-8 py-3 text-[14px] flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed">
          <CheckCircle2 size={16} /> {sending ? 'Enviando…' : 'Enviar briefing'}
        </button>
      </div>
    </div>
  );
}

function SubmittedView({ draft, projectName, clientName }: { draft: InteriorBriefingData; projectName: string; clientName: string }) {
  return (
    <div className="flex flex-col gap-4">
      <PageTitle eyebrow="Concepção de Interiores" title="Briefing de Interiores" />
      <div className="v-card-border p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center gap-5">
        <span className="v-grad w-16 h-16 rounded-full flex items-center justify-center flex-shrink-0"><Check size={30} /></span>
        <div className="flex-1">
          <p className="text-xl m-0" style={{ fontWeight: 800 }}>Briefing enviado</p>
          <p className="text-[13px] text-vsoft mt-1 mb-0 leading-relaxed">Enviado em {fmtDateTime(draft.submittedAt)}. Nossa equipe vai estudar as respostas e preparar a reunião de alinhamento. Se precisar mudar algo, fale com a equipe pelo Mural de Recados.</p>
        </div>
        <button onClick={() => openInteriorBriefingReport(draft, { projeto: projectName, cliente: clientName }, 'cliente')} className="v-btn-ghost px-5 py-3 text-[13px] flex items-center justify-center gap-2"><FileText size={15} /> Baixar PDF</button>
      </div>
      <div className="v-card-border p-5 sm:p-6">
        <StyleProfileView votes={draft.answers.votes} />
      </div>
    </div>
  );
}

// ===========================================================================
// VISÃO DA EQUIPE
// ===========================================================================

function AdminView({ data, released, projectName, clientName, onSave }: Props) {
  const briefing = normalizeBriefing(data);
  const [tab, setTab] = useState<'respostas' | 'ambientes'>(briefing.status === 'enviado' || progressOf(briefing).done > 0 ? 'respostas' : 'ambientes');
  const prog = progressOf(briefing);
  const latest = useRef(data);
  latest.current = data;

  const saveConfig = (config: IBConfig) => {
    const server = normalizeBriefing(latest.current);
    return onSave({ ...server, config, updatedAt: new Date().toISOString() });
  };
  const reopen = () => {
    if (!window.confirm('Reabrir o briefing para o cliente editar? O envio anterior fica registrado no histórico do relatório.')) return;
    const server = normalizeBriefing(latest.current);
    onSave({ ...server, status: 'rascunho', reopenedAt: new Date().toISOString() });
  };

  return (
    <div className="flex flex-col gap-4">
      <PageTitle eyebrow="Concepção de Interiores · Equipe" title="Briefing de Interiores" subtitle={`${projectName} · ${clientName}`} />

      <div className="v-card-border p-5 flex flex-col lg:flex-row lg:items-center gap-4">
        <div className="flex-1 flex items-center gap-4">
          <span className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 ${briefing.status === 'enviado' ? 'v-grad' : 'v-tint'}`}>
            {briefing.status === 'enviado' ? <CheckCircle2 size={22} /> : released ? <Clock size={22} /> : <Lock size={20} />}
          </span>
          <div className="min-w-0">
            <p className="text-[15px] m-0" style={{ fontWeight: 800 }}>
              {briefing.status === 'enviado' ? `Enviado em ${fmtDateTime(briefing.submittedAt)}` : released ? `Em andamento · ${prog.done} de ${prog.total} blocos` : 'Aguardando liberação da etapa'}
            </p>
            <p className="text-[12px] text-vsoft m-0 mt-0.5">
              {briefing.status === 'enviado' ? `Aceite registrado por ${briefing.submittedBy || 'cliente'}.` : released ? 'O cliente vê este briefing na área dele e as respostas são salvas automaticamente.' : 'O cliente passa a ver o briefing quando a etapa Concepção de Interiores for liberada. Revise os ambientes antes disso.'}
            </p>
            {briefing.status !== 'enviado' && released && <div className="v-track mt-2 max-w-xs"><div className="v-fill" style={{ width: `${prog.pct}%` }} /></div>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => openInteriorBriefingReport(briefing, { projeto: projectName, cliente: clientName }, 'equipe')} className="v-btn-ghost px-4 py-2.5 text-[12px] flex items-center gap-1.5"><FileText size={14} /> PDF da equipe</button>
          <button onClick={() => openInteriorBriefingReport(briefing, { projeto: projectName, cliente: clientName }, 'cliente')} className="v-btn-ghost px-4 py-2.5 text-[12px] flex items-center gap-1.5"><Eye size={14} /> PDF do cliente</button>
          {briefing.status === 'enviado' && <button onClick={reopen} className="v-btn-ghost px-4 py-2.5 text-[12px] flex items-center gap-1.5"><RotateCcw size={14} /> Reabrir para o cliente</button>}
        </div>
      </div>

      <div className="flex gap-1 p-1 rounded-full v-tint self-start" role="tablist">
        {([['respostas', 'Respostas e alertas'], ['ambientes', 'Ambientes do projeto']] as const).map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
            className={`px-5 rounded-full text-[13px] ${tab === id ? 'bg-white' : ''}`} style={{ minHeight: 40, fontWeight: tab === id ? 700 : 500, boxShadow: tab === id ? 'var(--v-shadow-sm)' : undefined }}>
            {label}{id === 'ambientes' && !briefing.config.confirmed ? ' !' : ''}
          </button>
        ))}
      </div>

      {tab === 'ambientes' ? (
        <ConfigEditor config={briefing.config} locked={briefing.status === 'enviado'} answeredKeys={Object.keys(briefing.done).filter(k => briefing.done[k])} onSave={saveConfig} />
      ) : (
        <AdminReport briefing={briefing} />
      )}
    </div>
  );
}

function ConfigEditor({ config, locked, answeredKeys, onSave }: { config: IBConfig; locked: boolean; answeredKeys: string[]; onSave: (c: IBConfig) => Promise<any> | void }) {
  const [c, setC] = useState<IBConfig>(config);
  const [saved, setSaved] = useState(false);
  useEffect(() => { setC(config); }, [JSON.stringify(config)]);
  const dirty = JSON.stringify(c) !== JSON.stringify(config);
  const setDorm = (id: string, p: Partial<IBDorm>) => setC({ ...c, dorms: c.dorms.map(d => d.id === id ? { ...d, ...p } : d) });
  const removeDorm = (id: string) => {
    if (answeredKeys.includes(`dorm-${id}`) && !window.confirm('O cliente já respondeu este dormitório. Remover mesmo assim?')) return;
    setC({ ...c, dorms: c.dorms.filter(d => d.id !== id) });
  };
  const toggles: { k: 'sala' | 'jantar' | 'cozinha' | 'escritorio' | 'banheiros' | 'gourmet'; label: string; Icon: React.ComponentType<any> }[] = [
    { k: 'sala', label: 'Sala de estar e TV', Icon: Sofa }, { k: 'jantar', label: 'Sala de jantar', Icon: Home },
    { k: 'cozinha', label: 'Cozinha e equipamentos', Icon: Home }, { k: 'escritorio', label: 'Escritório / home office', Icon: Home },
    { k: 'banheiros', label: 'Banheiros (marcenaria e bancada)', Icon: Bath }, { k: 'gourmet', label: 'Área gourmet', Icon: Flame },
  ];
  const save = async () => { await onSave({ ...c, confirmed: true }); setSaved(true); setTimeout(() => setSaved(false), 2500); };

  return (
    <div className="v-card-border p-5 sm:p-6 flex flex-col gap-7">
      <Note kind="info">Cada ambiente marcado vira um bloco de perguntas para o cliente; cozinha, banheiros e área gourmet também entram no bloco de marcenaria e bancadas. Moradores, estilo, o que vai ficar e prioridades aparecem sempre.{locked ? ' O briefing já foi enviado: reabra para o cliente se mudar os ambientes.' : ''}</Note>

      <Section title="Dormitórios" hint="Dê o nome que a família usa (ex.: “Quarto da Helena”) e o tipo, que ajusta as perguntas.">
        <div className="flex flex-col gap-3">
          {c.dorms.map((d, i) => (
            <div key={d.id} className="v-tint p-4 rounded-2xl flex flex-col gap-3">
              <div className="flex items-end gap-2">
                <div className="flex-1 flex flex-col gap-1">
                  <label htmlFor={`ib-dn-${d.id}`} className="text-[11px] uppercase tracking-[0.1em] text-vmute" style={{ fontWeight: 700 }}>Dormitório {i + 1}</label>
                  <input id={`ib-dn-${d.id}`} value={d.name} disabled={locked} onChange={e => setDorm(d.id, { name: e.target.value })} className="px-3 py-2.5 text-[14px]" style={{ minHeight: 44 }} />
                </div>
                <button aria-label={`Remover ${d.name}`} disabled={locked} onClick={() => removeDorm(d.id)} className="w-11 h-11 rounded-full flex items-center justify-center ib-hover disabled:opacity-30"><Trash2 size={16} /></button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {DORM_TYPES.map(t => (
                  <Chip key={t.id} label={t.label} selected={d.type === t.id} disabled={locked} onClick={() => setDorm(d.id, { type: t.id })} />
                ))}
              </div>
            </div>
          ))}
          <button disabled={locked} onClick={() => setC({ ...c, dorms: [...c.dorms, { id: uid(), name: `Quarto ${c.dorms.length + 1}`, type: 'solteiro' }] })}
            className="v-btn-ghost self-start px-5 py-2.5 text-[13px] flex items-center gap-2 disabled:opacity-40"><Plus size={15} /> Adicionar dormitório</button>
        </div>
      </Section>

      <Section title="Outros ambientes">
        <div className="grid gap-2 sm:grid-cols-2">
          {toggles.map(t => (
            <button key={t.k} disabled={locked} onClick={() => setC({ ...c, [t.k]: !c[t.k] })} aria-pressed={c[t.k]}
              className="flex items-center justify-between gap-3 px-4 py-3 rounded-2xl bg-white text-left disabled:opacity-60" style={{ minHeight: 56, border: '1px solid rgba(108,77,246,0.12)' }}>
              <span className="text-[14px] flex items-center gap-2" style={{ fontWeight: 600 }}><t.Icon size={16} />{t.label}</span>
              <span className={`relative block rounded-full flex-shrink-0 ${c[t.k] ? 'v-grad' : ''}`} style={{ width: 46, height: 28, background: c[t.k] ? undefined : '#d8d3ea' }}>
                <span className="absolute block rounded-full bg-white" style={{ top: 3, left: c[t.k] ? 21 : 3, width: 22, height: 22, transition: 'left .15s' }} />
              </span>
            </button>
          ))}
        </div>
      </Section>

      <div className="flex items-center gap-3 flex-wrap">
        <button disabled={locked || (!dirty && !!config.confirmed)} onClick={save} className="v-btn px-6 py-3 text-[14px] flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed">
          <Check size={16} /> {config.confirmed && !dirty ? 'Ambientes confirmados' : 'Salvar e confirmar ambientes'}
        </button>
        {saved && <span className="text-[12px] ib-ok-text" style={{ fontWeight: 600 }}>Salvo.</span>}
        <span className="text-[12px] text-vmute">{buildBlocks(c).length} blocos para o cliente</span>
      </div>
    </div>
  );
}

function AdminReport({ briefing }: { briefing: InteriorBriefingData }) {
  const alerts = computeAlerts(briefing);
  const pend = computePendencias(briefing);
  const blocks = buildBlocks(briefing.config);
  const a = briefing.answers;
  const anyDone = blocks.some(b => briefing.done[b.key]);
  if (!anyDone) {
    return <div className="v-card p-8 text-center"><p className="text-vsoft m-0">O cliente ainda não concluiu nenhum bloco.</p></div>;
  }
  return (
    <div className="flex flex-col gap-4">
      {alerts.length > 0 && (
        <div className="v-card-border p-5 sm:p-6 flex flex-col gap-3">
          <h3 className="text-[17px] m-0 flex items-center gap-2" style={{ fontWeight: 800 }}><AlertTriangle size={18} className="ib-warn-text" /> Alertas de compatibilidade</h3>
          <div className="grid gap-2.5 md:grid-cols-2">
            {alerts.map((al, i) => (
              <div key={i} className="ib-warn rounded-2xl p-4 flex flex-col gap-1">
                <p className="text-[11px] uppercase tracking-[0.08em] m-0" style={{ fontWeight: 700 }}>{al.area}</p>
                <p className="text-[14px] m-0" style={{ fontWeight: 700 }}>{al.title}</p>
                <p className="text-[13px] leading-relaxed m-0">{al.text}</p>
              </div>
            ))}
          </div>
        </div>
      )}
      {pend.length > 0 && (
        <div className="v-card-border p-5 sm:p-6 flex flex-col gap-2">
          <h3 className="text-[17px] m-0" style={{ fontWeight: 800 }}>Pendências para a reunião</h3>
          {pend.map((p, i) => (
            <div key={i} className="flex gap-3 py-2.5 border-b last:border-b-0" style={{ borderColor: 'var(--v-border)' }}>
              <span className="w-5 h-5 mt-0.5 rounded-full flex-shrink-0" style={{ border: '1.5px solid #a39fb8' }} />
              <div><p className="text-[14px] m-0" style={{ fontWeight: 600 }}>{p.title}</p><p className="text-[12px] text-vsoft m-0">{p.text}</p></div>
            </div>
          ))}
        </div>
      )}
      {briefing.done.estilo && <div className="v-card-border p-5 sm:p-6"><StyleProfileView votes={a.votes} team /></div>}
      <div className="v-card-border p-5 sm:p-6 flex flex-col gap-2">
        <h3 className="text-[17px] m-0 mb-1" style={{ fontWeight: 800 }}>Respostas por bloco</h3>
        {blocks.map(b => (
          <div key={b.key} className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-4 py-2.5 border-b last:border-b-0" style={{ borderColor: 'var(--v-border)' }}>
            <p className="text-[12px] text-vmute m-0 sm:w-56 flex-shrink-0">{b.title}</p>
            <p className={`text-[14px] m-0 ${briefing.done[b.key] ? '' : 'ib-warn-text'}`} style={{ fontWeight: 600 }}>{briefing.done[b.key] ? blockSummary(briefing, b) : 'Pendente'}</p>
          </div>
        ))}
        {blocks.some(b => chosenRefs(briefing, b).length) && (
          <div className="pt-4 flex flex-col gap-4">
            <p className="text-[15px] m-0" style={{ fontWeight: 800 }}>Referências marcadas</p>
            {blocks.filter(b => chosenRefs(briefing, b).length).map(b => (
              <div key={b.key} className="flex flex-col gap-2">
                <p className="text-[12px] text-vmute m-0">{b.title}</p>
                <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-6 gap-2">
                  {chosenRefs(briefing, b).map(r => (
                    <figure key={r.id} className="m-0">
                      <img src={r.image.file} alt={r.caption} loading="lazy" className="w-full aspect-[4/3] object-cover rounded-xl" />
                      <figcaption className="text-[10px] text-vmute mt-1 leading-tight">{r.caption}</figcaption>
                    </figure>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
        {a.keep.trim() && <div className="pt-3"><p className="text-[12px] text-vmute m-0">O que vai ficar</p><p className="text-[14px] m-0 whitespace-pre-line">{a.keep}</p></div>}
        {a.notes.trim() && <div className="pt-3"><p className="text-[12px] text-vmute m-0">Observações</p><p className="text-[14px] m-0 whitespace-pre-line">{a.notes}</p></div>}
      </div>
      {briefing.done.roupeiro && <WardrobeTable a={a} />}
    </div>
  );
}

function WardrobeTable({ a }: { a: IBAnswers }) {
  const w = a.wardrobe;
  const e1 = wardrobeEstimate(w.p1), e2 = wardrobeEstimate(w.p2);
  const rows: [string, string, string, string][] = [
    ['Cabideiro curto', `${fmt1(e1.curtoM)} m`, `${fmt1(e2.curtoM)} m`, `${fmt1(e1.curtoM + e2.curtoM)} m`],
    ['Cabideiro longo e calceiro', `${fmt1(e1.longoM)} m`, `${fmt1(e2.longoM)} m`, `${fmt1(e1.longoM + e2.longoM)} m`],
    ['Prateleiras de 80 cm', String(e1.prateleiras), String(e2.prateleiras), String(e1.prateleiras + e2.prateleiras)],
    ['Prateleiras de sapatos', String(e1.sapateiras), String(e2.sapateiras), String(e1.sapateiras + e2.sapateiras)],
    ['Bolsas e mochilas', String(w.p1.bolsas), String(w.p2.bolsas), String(w.p1.bolsas + w.p2.bolsas)],
  ];
  return (
    <div className="v-card-border p-5 sm:p-6 flex flex-col gap-3">
      <h3 className="text-[17px] m-0" style={{ fontWeight: 800 }}>Pré-dimensionamento de roupeiro</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]" style={{ minWidth: 520, borderCollapse: 'collapse' }}>
          <thead><tr className="text-left text-vmute text-[11px] uppercase tracking-[0.08em]">
            <th className="py-2 pr-4" style={{ fontWeight: 600 }}>Item</th><th className="py-2 pr-4" style={{ fontWeight: 600 }}>{w.p1Name}</th><th className="py-2 pr-4" style={{ fontWeight: 600 }}>{w.p2Name}</th><th className="py-2" style={{ fontWeight: 700 }}>Total</th>
          </tr></thead>
          <tbody>{rows.map(r => (
            <tr key={r[0]} className="border-t" style={{ borderColor: 'var(--v-border)' }}>
              <td className="py-2.5 pr-4">{r[0]}</td><td className="py-2.5 pr-4">{r[1]}</td><td className="py-2.5 pr-4">{r[2]}</td><td className="py-2.5" style={{ fontWeight: 700 }}>{r[3]}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}
