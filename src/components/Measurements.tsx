// src/components/Measurements.tsx
//
// Gestão de Boletins de Medição (admin). Fluxo:
//  1) escolhe obra + período (início/fim)
//  2) "Puxar dados do período" preenche automaticamente gastos, fotos, avanço e pagamentos
//  3) admin edita textos, legendas, número, resumo
//  4) salva no histórico (medição 01, 02...) e/ou gera o PDF
//  5) marca "liberar para o cliente" para o cliente ver na visão dele
//
// Persistência: coleção 'measurements' (por projeto). Geração: generateMeasurementBulletinPdf.

import React, { useState, useMemo } from 'react';
import {
  FileText, Plus, Trash2, Download, Eye, EyeOff, Calendar, Loader2,
  CheckCircle2, AlertTriangle, X, Camera, Wand2,
} from 'lucide-react';
import {
  Project, Transaction, PhysicalWeeklyLog, MeasurementBulletin, TransactionCategory,
} from '../types';
import { generateMeasurementBulletinPdf, validateMeasurementBulletinData } from '../lib/pdfReports';
import { formatDateBR } from '../lib/formatDate';

interface LaborContract { id: string; projectId: string; supplier: string; scope: string; contractValue: number; }
interface LaborPayment { id: string; projectId: string; contractId: string; supplier: string; paymentDate: string; value: number; description: string; }

interface Props {
  projects: Project[];
  transactions: Transaction[];
  weeklyLogs: PhysicalWeeklyLog[];
  timelinePhases: any[];
  laborContracts: LaborContract[];
  laborPayments: LaborPayment[];
  measurements: MeasurementBulletin[];
  onSaveMeasurement: (m: MeasurementBulletin) => Promise<void> | void;
  onDeleteMeasurement: (id: string) => Promise<void> | void;
}

const CATEGORY_LABELS: Record<string, string> = {
  materiais: 'Materiais', mao_de_obra: 'Mão de Obra', projetos_complementares: 'Projetos',
  taxas: 'Taxas', decoracao: 'Decoração', outros: 'Outros',
};

const fmtMoney = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

const uid = (p: string) => `${p}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const inPeriod = (date: string, start: string, end: string) => {
  if (!date) return false;
  const d = date.slice(0, 10);
  return d >= start && d <= end;
};

export default function Measurements({
  projects, transactions, weeklyLogs, timelinePhases, laborContracts, laborPayments,
  measurements, onSaveMeasurement, onDeleteMeasurement,
}: Props) {
  const [projectId, setProjectId] = useState<string>(projects[0]?.id || '');
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [editing, setEditing] = useState<MeasurementBulletin | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ errors: string[]; warnings: string[] } | null>(null);

  const project = projects.find(p => p.id === projectId);
  const projectMeasurements = useMemo(
    () => measurements.filter(m => m.projectId === projectId)
      .sort((a, b) => (b.number || '').localeCompare(a.number || '', undefined, { numeric: true })),
    [measurements, projectId]
  );

  // Próximo número automático (maior + 1, com 2 dígitos).
  const nextNumber = useMemo(() => {
    const nums = projectMeasurements.map(m => parseInt(m.number, 10)).filter(n => !isNaN(n));
    const next = (nums.length ? Math.max(...nums) : 0) + 1;
    return String(next).padStart(2, '0');
  }, [projectMeasurements]);

  // Monta uma medição puxando automaticamente os dados do período.
  const buildFromPeriod = (): MeasurementBulletin | null => {
    if (!project || !periodStart || !periodEnd) return null;

    // Gastos do período.
    const periodTx = transactions.filter(t => t.projectId === projectId && inPeriod(t.date, periodStart, periodEnd));
    const spentPeriod = periodTx.reduce((s, t) => s + (t.value || 0), 0);
    const spentTotal = transactions.filter(t => t.projectId === projectId && (t.date || '').slice(0, 10) <= periodEnd)
      .reduce((s, t) => s + (t.value || 0), 0);

    // Fotos do período (dos logs semanais).
    const periodLogs = weeklyLogs.filter(l => l.projectId === projectId && inPeriod(l.date, periodStart, periodEnd));
    const photos = periodLogs.flatMap(l => (l.photos || []).map(ph => ({
      id: ph.id || uid('photo'), url: ph.url, caption: ph.description || l.description || '',
    })));

    // Avanço físico das fases: progresso no início vs fim do período.
    const phases = timelinePhases.filter(p => p.projectId === projectId);
    const progressAt = (phaseId: string, until: string) => {
      // Maior progresso registrado até a data (nos logs), senão o progress atual da fase.
      const logs = weeklyLogs
        .filter(l => l.projectId === projectId && (l.date || '').slice(0, 10) <= until)
        .sort((a, b) => (a.date || '').localeCompare(b.date || ''));
      let val = 0;
      for (const l of logs) {
        const p = l.phaseProgressions?.[phaseId];
        if (typeof p === 'number') val = p;
      }
      return val;
    };
    const beforeStart = new Date(new Date(periodStart).getTime() - 86400000).toISOString().slice(0, 10);
    const phaseProgress = phases.map(ph => ({
      name: ph.name,
      progressStart: progressAt(ph.id, beforeStart),
      progressEnd: progressAt(ph.id, periodEnd) || ph.progress || 0,
    }));

    // % avanço físico ponderado por custo previsto.
    const totalWeight = phases.reduce((s, p) => s + (p.costPrev || 0), 0);
    const weightedProgress = (getter: (ph: any) => number) => {
      if (totalWeight <= 0) return phases.length ? phases.reduce((s, p) => s + getter(p), 0) / phases.length : 0;
      return phases.reduce((s, p) => s + getter(p) * (p.costPrev || 0), 0) / totalWeight;
    };
    const physTotal = weightedProgress(ph => {
      const pp = phaseProgress.find(x => x.name === ph.name);
      return pp ? pp.progressEnd : 0;
    });
    const physStart = weightedProgress(ph => {
      const pp = phaseProgress.find(x => x.name === ph.name);
      return pp ? pp.progressStart : 0;
    });
    const physicalProgressPeriod = Math.max(0, physTotal - physStart);

    const budget = project.budget || 0;
    const financialProgressTotal = budget > 0 ? (spentTotal / budget) * 100 : 0;
    const financialProgressPeriod = budget > 0 ? (spentPeriod / budget) * 100 : 0;

    // --- PREVISTO no período (do cronograma de planejamento) ---
    // Distribui o custo/progresso previsto de cada fase pelos dias que caem no intervalo.
    const ps = new Date(periodStart + 'T00:00:00').getTime();
    const pe = new Date(periodEnd + 'T23:59:59').getTime();
    let costPlannedPeriod = 0;
    let physPlannedWeighted = 0;
    for (const ph of phases) {
      const start = new Date((ph.startDate || '') + 'T00:00:00').getTime();
      const end = new Date((ph.endDate || '') + 'T23:59:59').getTime();
      if (isNaN(start) || isNaN(end) || start > end) continue;
      const totalDays = Math.max(1, Math.round((end - start) / 86400000));
      const overlapStart = Math.max(start, ps);
      const overlapEnd = Math.min(end, pe);
      if (overlapStart > overlapEnd) continue;
      const overlapDays = Math.max(0, Math.round((overlapEnd - overlapStart) / 86400000));
      const ratio = Math.min(1, overlapDays / totalDays);
      costPlannedPeriod += (ph.costPrev || 0) * ratio;
      // Avanço físico previsto do período = fração da fase que cai no intervalo,
      // ponderada pelo peso da fase (custo previsto) no total da obra.
      physPlannedWeighted += ratio * 100 * (ph.costPrev || 0);
    }
    const physicalPlannedPeriod = totalWeight > 0 ? physPlannedWeighted / totalWeight : 0;
    const financialPlannedPeriod = budget > 0 ? (costPlannedPeriod / budget) * 100 : 0;

    // Snapshot dos gastos do período (documento autossuficiente e imutável).
    const expensesSnapshot = periodTx
      .slice()
      .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
      .map(t => ({
        date: t.date, description: t.description,
        category: CATEGORY_LABELS[t.category] || t.category,
        supplier: t.supplier, value: t.value,
      }));

    // Snapshot dos pagamentos de mão de obra do período — permite ao cliente ver
    // no PDF sem acessar a coleção sensível labor_payments.
    const laborPaymentsSnapshot = laborPayments
      .filter(p => p.projectId === projectId && inPeriod(p.paymentDate, periodStart, periodEnd))
      .map(p => {
        const contract = laborContracts.find(c => c.id === p.contractId);
        const paidTotal = laborPayments
          .filter(x => x.contractId === p.contractId && (x.paymentDate || '').slice(0, 10) <= periodEnd)
          .reduce((s, x) => s + (x.value || 0), 0);
        return {
          supplier: p.supplier, description: p.description, paymentDate: p.paymentDate,
          value: p.value, contractValue: contract?.contractValue || 0, contractPaidTotal: paidTotal,
        };
      });

    return {
      id: uid('measurement'),
      projectId,
      number: nextNumber,
      periodStart, periodEnd,
      emissionDate: new Date().toISOString().slice(0, 10),
      summaryText: '',
      responsibleTechnical: 'Chaves Brites Correa Construtora',
      physicalProgressPeriod,
      physicalProgressTotal: physTotal,
      financialProgressPeriod,
      financialProgressTotal,
      spentPeriod, spentTotal,
      physicalPlannedPeriod,
      financialPlannedPeriod,
      costPlannedPeriod,
      photos,
      phaseProgress,
      expensesSnapshot,
      laborPaymentsSnapshot,
      released: false,
      createdAt: new Date().toISOString(),
    };
  };

  const handleBuild = () => {
    setFeedback(null);
    if (!periodStart || !periodEnd) { setFeedback({ errors: ['Informe o período (início e fim).'], warnings: [] }); return; }
    if (periodStart > periodEnd) { setFeedback({ errors: ['A data de início é posterior à de término.'], warnings: [] }); return; }
    const built = buildFromPeriod();
    if (built) setEditing(built);
  };

  // Dados de gastos e mão de obra do período (para o PDF). Prefere o snapshot salvo
  // na medição; se não houver (medição recém-construída), deriva ao vivo.
  const periodDataFor = (m: MeasurementBulletin) => {
    const expenses = m.expensesSnapshot !== undefined
      ? m.expensesSnapshot
      : transactions
        .filter(t => t.projectId === m.projectId && inPeriod(t.date, m.periodStart, m.periodEnd))
        .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
        .map(t => ({
          date: t.date, description: t.description, category: CATEGORY_LABELS[t.category] || t.category,
          supplier: t.supplier, value: t.value,
        }));
    const payments = m.laborPaymentsSnapshot !== undefined
      ? m.laborPaymentsSnapshot
      : laborPayments
        .filter(p => p.projectId === m.projectId && inPeriod(p.paymentDate, m.periodStart, m.periodEnd))
        .map(p => {
          const contract = laborContracts.find(c => c.id === p.contractId);
          const paidTotal = laborPayments
            .filter(x => x.contractId === p.contractId && (x.paymentDate || '').slice(0, 10) <= m.periodEnd)
            .reduce((s, x) => s + (x.value || 0), 0);
          return {
            supplier: p.supplier, description: p.description, paymentDate: p.paymentDate, value: p.value,
            contractValue: contract?.contractValue || 0, contractPaidTotal: paidTotal,
          };
        });
    return { expenses, payments };
  };

  const handleGeneratePdf = async (m: MeasurementBulletin) => {
    setBusy(true);
    setFeedback(null);
    try {
      const { expenses, payments } = periodDataFor(m);
      const data = {
        projectName: project?.name || 'Obra',
        clientName: (project as any)?.clientName || undefined,
        measurementNumber: m.number,
        periodStart: m.periodStart, periodEnd: m.periodEnd, emissionDate: m.emissionDate,
        summaryText: m.summaryText,
        physicalProgressPeriod: m.physicalProgressPeriod,
        physicalProgressTotal: m.physicalProgressTotal,
        financialProgressPeriod: m.financialProgressPeriod,
        financialProgressTotal: m.financialProgressTotal,
        physicalPlannedPeriod: m.physicalPlannedPeriod,
        financialPlannedPeriod: m.financialPlannedPeriod,
        costPlannedPeriod: m.costPlannedPeriod,
        budgetTotal: project?.budget || 0,
        spentPeriod: m.spentPeriod, spentTotal: m.spentTotal,
        expenses, laborPayments: payments,
        phaseProgress: m.phaseProgress,
        photos: m.photos.map(p => ({ url: p.url, caption: p.caption })),
        responsibleTechnical: m.responsibleTechnical,
      };
      const report = validateMeasurementBulletinData(data);
      if (!report.ok) { setFeedback({ errors: report.errors, warnings: report.warnings }); setBusy(false); return; }
      await generateMeasurementBulletinPdf(data);
      if (report.warnings.length) setFeedback({ errors: [], warnings: report.warnings });
    } catch (e: any) {
      setFeedback({ errors: [e?.message || 'Falha ao gerar o PDF.'], warnings: [] });
    }
    setBusy(false);
  };

  const handleSave = async () => {
    if (!editing) return;
    setBusy(true);
    await onSaveMeasurement(editing);
    setBusy(false);
    setEditing(null);
  };

  const toggleReleased = async (m: MeasurementBulletin) => {
    await onSaveMeasurement({ ...m, released: !m.released });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-[#FF5A35]/10 flex items-center justify-center">
          <FileText size={20} className="text-[#FF5A35]" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-slate-900">Boletins de Medição</h2>
          <p className="text-sm text-slate-500">Relatórios de avanço por período — financeiro, físico e fotográfico.</p>
        </div>
      </div>

      {/* Seletor de obra + período */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="md:col-span-2">
            <label className="block text-[10px] font-mono uppercase tracking-wider text-slate-500 font-bold mb-1">Obra / Projeto</label>
            <select
              value={projectId}
              onChange={e => { setProjectId(e.target.value); setEditing(null); }}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#FF5A35]"
            >
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-mono uppercase tracking-wider text-slate-500 font-bold mb-1">Início do período</label>
            <input type="date" value={periodStart} onChange={e => setPeriodStart(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#FF5A35]" />
          </div>
          <div>
            <label className="block text-[10px] font-mono uppercase tracking-wider text-slate-500 font-bold mb-1">Fim do período</label>
            <input type="date" value={periodEnd} onChange={e => setPeriodEnd(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#FF5A35]" />
          </div>
        </div>
        <button
          onClick={handleBuild}
          className="mt-4 flex items-center gap-2 bg-[#FF5A35] hover:bg-[#e64a28] text-white px-4 py-2 rounded-lg text-sm font-bold transition-colors"
        >
          <Wand2 size={15} /> Puxar dados do período (medição nº {nextNumber})
        </button>
      </div>

      {/* Editor da medição em construção */}
      {editing && (
        <MeasurementEditor
          measurement={editing}
          onChange={setEditing}
          onSave={handleSave}
          onCancel={() => setEditing(null)}
          onGeneratePdf={() => handleGeneratePdf(editing)}
          busy={busy}
        />
      )}

      {/* Feedback de validação */}
      {feedback && (feedback.errors.length > 0 || feedback.warnings.length > 0) && (
        <div className={`rounded-xl p-4 border ${feedback.errors.length ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'}`}>
          {feedback.errors.map((e, i) => <p key={i} className="text-sm text-red-700 flex items-center gap-1.5"><AlertTriangle size={13} /> {e}</p>)}
          {feedback.warnings.map((w, i) => <p key={i} className="text-sm text-amber-700 flex items-center gap-1.5"><AlertTriangle size={13} /> {w}</p>)}
        </div>
      )}

      {/* Histórico de medições */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5">
        <h3 className="text-sm font-bold text-slate-900 mb-3">Medições de {project?.name || 'obra'}</h3>
        {projectMeasurements.length === 0 ? (
          <p className="text-sm text-slate-400 py-6 text-center">Nenhuma medição salva para esta obra ainda.</p>
        ) : (
          <div className="space-y-2">
            {projectMeasurements.map(m => (
              <div key={m.id} className="flex items-center justify-between border border-slate-150 rounded-xl p-3 hover:bg-slate-50">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
                    <span className="text-xs font-bold text-slate-700">{m.number}</span>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">
                      <Calendar size={12} className="text-slate-400" />
                      {formatDateBR(m.periodStart)} a {formatDateBR(m.periodEnd)}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      Físico +{m.physicalProgressPeriod.toFixed(1)}% · Financeiro +{m.financialProgressPeriod.toFixed(1)}% · {m.photos.length} foto(s)
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <button onClick={() => toggleReleased(m)}
                    title={m.released ? 'Liberada ao cliente (clique para ocultar)' : 'Oculta do cliente (clique para liberar)'}
                    className={`p-2 rounded-lg text-xs flex items-center gap-1 ${m.released ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                    {m.released ? <Eye size={14} /> : <EyeOff size={14} />}
                  </button>
                  <button onClick={() => setEditing(m)} title="Editar" className="p-2 rounded-lg text-slate-500 hover:bg-slate-100">
                    <FileText size={14} />
                  </button>
                  <button onClick={() => handleGeneratePdf(m)} disabled={busy} title="Gerar PDF" className="p-2 rounded-lg text-slate-500 hover:bg-slate-100">
                    {busy ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                  </button>
                  <button onClick={() => onDeleteMeasurement(m.id)} title="Excluir" className="p-2 rounded-lg text-red-400 hover:bg-red-50">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Editor de uma medição (textos, número, resumo, legendas das fotos)
// ---------------------------------------------------------------------------
function MeasurementEditor({
  measurement, onChange, onSave, onCancel, onGeneratePdf, busy,
}: {
  measurement: MeasurementBulletin;
  onChange: (m: MeasurementBulletin) => void;
  onSave: () => void;
  onCancel: () => void;
  onGeneratePdf: () => void;
  busy: boolean;
}) {
  const m = measurement;
  const set = (patch: Partial<MeasurementBulletin>) => onChange({ ...m, ...patch });

  return (
    <div className="bg-white border-2 border-[#FF5A35]/30 rounded-2xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-slate-900">Editar Boletim de Medição</h3>
        <button onClick={onCancel} className="text-slate-400 hover:text-slate-600"><X size={16} /></button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div>
          <label className="block text-[10px] font-mono uppercase tracking-wider text-slate-500 font-bold mb-1">Nº da Medição</label>
          <input value={m.number} onChange={e => set({ number: e.target.value })}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#FF5A35]" />
        </div>
        <div>
          <label className="block text-[10px] font-mono uppercase tracking-wider text-slate-500 font-bold mb-1">Emissão</label>
          <input type="date" value={m.emissionDate} onChange={e => set({ emissionDate: e.target.value })}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#FF5A35]" />
        </div>
        <div className="md:col-span-2">
          <label className="block text-[10px] font-mono uppercase tracking-wider text-slate-500 font-bold mb-1">Responsável Técnico</label>
          <input value={m.responsibleTechnical} onChange={e => set({ responsibleTechnical: e.target.value })}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#FF5A35]" />
        </div>
      </div>

      {/* Percentuais editáveis */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {([
          ['Físico Período (%)', 'physicalProgressPeriod'],
          ['Físico Acum. (%)', 'physicalProgressTotal'],
          ['Financ. Período (%)', 'financialProgressPeriod'],
          ['Financ. Acum. (%)', 'financialProgressTotal'],
        ] as [string, keyof MeasurementBulletin][]).map(([label, key]) => (
          <div key={key}>
            <label className="block text-[10px] font-mono uppercase tracking-wider text-slate-500 font-bold mb-1">{label}</label>
            <input type="number" step="0.1" value={m[key] as number}
              onChange={e => set({ [key]: Number(e.target.value) } as any)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-[#FF5A35]" />
          </div>
        ))}
      </div>

      {/* Comparativo: previsto (cronograma) — editável */}
      <div className="bg-slate-50 rounded-xl p-3">
        <p className="text-[10px] font-mono uppercase tracking-wider text-slate-500 font-bold mb-2">
          Previsto no cronograma (para o comparativo)
        </p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {([
            ['Físico Previsto (%)', 'physicalPlannedPeriod'],
            ['Financ. Previsto (%)', 'financialPlannedPeriod'],
            ['Custo Previsto (R$)', 'costPlannedPeriod'],
          ] as [string, keyof MeasurementBulletin][]).map(([label, key]) => (
            <div key={key}>
              <label className="block text-[10px] font-mono uppercase tracking-wider text-slate-500 font-bold mb-1">{label}</label>
              <input type="number" step="0.1" value={(m[key] as number) ?? 0}
                onChange={e => set({ [key]: Number(e.target.value) } as any)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-[#FF5A35]" />
            </div>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-[10px] font-mono uppercase tracking-wider text-slate-500 font-bold mb-1">Situação Geral da Obra (resumo)</label>
        <textarea value={m.summaryText} onChange={e => set({ summaryText: e.target.value })} rows={3}
          placeholder="Descreva o andamento geral da obra no período e o acumulado até aqui..."
          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#FF5A35]" />
      </div>

      {/* Legendas das fotos */}
      {m.photos.length > 0 && (
        <div>
          <label className="block text-[10px] font-mono uppercase tracking-wider text-slate-500 font-bold mb-2 flex items-center gap-1">
            <Camera size={12} /> Fotos do período ({m.photos.length}) — legendas editáveis
          </label>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {m.photos.map((ph, i) => (
              <div key={ph.id} className="border border-slate-200 rounded-lg overflow-hidden">
                <img src={ph.url} alt={`Foto ${i + 1}`} className="w-full h-24 object-cover bg-slate-100" />
                <div className="p-2 flex gap-1">
                  <input
                    value={ph.caption}
                    onChange={e => set({ photos: m.photos.map((x, j) => j === i ? { ...x, caption: e.target.value } : x) })}
                    placeholder="Legenda"
                    className="flex-1 min-w-0 border border-slate-200 rounded px-2 py-1 text-[11px] focus:outline-none focus:border-[#FF5A35]"
                  />
                  <button
                    onClick={() => set({ photos: m.photos.filter((_, j) => j !== i) })}
                    className="text-red-400 hover:text-red-600 flex-shrink-0"><Trash2 size={13} /></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Liberação ao cliente */}
      <label className="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" checked={m.released} onChange={e => set({ released: e.target.checked })} className="w-4 h-4 accent-[#FF5A35]" />
        <span className="text-sm text-slate-700">Liberar esta medição para o cliente visualizar</span>
      </label>

      <div className="flex items-center gap-2 pt-2 border-t border-slate-150">
        <button onClick={onSave} disabled={busy}
          className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 rounded-lg text-sm font-bold">
          {busy ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />} Salvar medição
        </button>
        <button onClick={onGeneratePdf} disabled={busy}
          className="flex items-center gap-2 border border-slate-300 hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-lg text-sm font-bold">
          <Download size={15} /> Gerar PDF
        </button>
      </div>
    </div>
  );
}
