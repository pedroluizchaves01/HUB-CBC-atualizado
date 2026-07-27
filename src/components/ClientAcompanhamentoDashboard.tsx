// src/components/ClientAcompanhamentoDashboard.tsx
//
// Painel de acompanhamento pensado para o CLIENTE (leigo em gestão de obra).
// Traduz avanço físico e financeiro em elementos visuais imediatos: um anel de
// progresso da obra, um termômetro de orçamento e cartões por centro de custo.
// Gráficos em SVG puro + motion — sem dependência de biblioteca de charts.
//
// Somente leitura. Recebe dados já filtrados pelo projeto do cliente.

import React, { useMemo } from 'react';
import { motion } from 'motion/react';
import {
  Hammer, HardHat, Ruler, FileCheck, Paintbrush, Package,
  TrendingUp, Wallet, CheckCircle2, Clock,
} from 'lucide-react';
import { Transaction, TransactionCategory, Project } from '../types';

interface Phase {
  id: string; projectId: string; name: string;
  progress: number; costPrev: number; costReal: number;
  startDate?: string; endDate?: string;
}

interface Props {
  project: Project;
  transactions: Transaction[]; // já do projeto
  phases: Phase[];             // já do projeto
}

const CATEGORY_META: Record<TransactionCategory, { label: string; short: string; color: string; Icon: React.ComponentType<any> }> = {
  materiais:               { label: 'Materiais de Construção', short: 'Materiais',   color: '#C2703D', Icon: Package },
  mao_de_obra:             { label: 'Mão de Obra e Serviços',   short: 'Mão de Obra', color: '#3E7C8B', Icon: HardHat },
  projetos_complementares: { label: 'Projetos Complementares', short: 'Projetos',    color: '#5B6BA8', Icon: Ruler },
  taxas:                   { label: 'Taxas e Licenças',        short: 'Taxas',       color: '#B08A3E', Icon: FileCheck },
  decoracao:               { label: 'Decoração e Acabamentos', short: 'Acabamentos', color: '#C0607A', Icon: Paintbrush },
  outros:                  { label: 'Outros Custos',           short: 'Outros',      color: '#6E7B6F', Icon: Hammer },
};

const fmtMoney = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v || 0);
const fmtMoneyFull = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

// ---------------------------------------------------------------------------
// Anel de progresso físico da obra
// ---------------------------------------------------------------------------
function ProgressRing({ percent }: { percent: number }) {
  const size = 200, stroke = 18, r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, percent));
  const offset = c - (clamped / 100) * c;

  // Mensagem afetiva conforme o estágio da obra.
  const stage =
    clamped >= 100 ? 'Obra concluída' :
    clamped >= 75 ? 'Reta final' :
    clamped >= 40 ? 'A todo vapor' :
    clamped >= 10 ? 'Ganhando forma' : 'Começando';

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#EDE8E1" strokeWidth={stroke} />
        <motion.circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#C2703D" strokeWidth={stroke}
          strokeLinecap="round" strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1.4, ease: 'easeOut' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <motion.span
          className="text-5xl font-bold text-stone-900"
          style={{ fontFamily: 'var(--font-serif)' }}
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}
        >
          {Math.round(clamped)}%
        </motion.span>
        <span className="text-[11px] font-mono uppercase tracking-widest text-[#C2703D] mt-1">{stage}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------
export default function ClientAcompanhamentoDashboard({ project, transactions, phases }: Props) {
  // Avanço físico ponderado pelo custo previsto de cada etapa (mais fiel que média simples).
  const physicalProgress = useMemo(() => {
    if (!phases.length) return 0;
    const totalWeight = phases.reduce((s, p) => s + (p.costPrev || 0), 0);
    if (totalWeight <= 0) {
      return phases.reduce((s, p) => s + (p.progress || 0), 0) / phases.length;
    }
    return phases.reduce((s, p) => s + (p.progress || 0) * (p.costPrev || 0), 0) / totalWeight;
  }, [phases]);

  const budget = project?.budget || 0;
  const totalSpent = useMemo(() => transactions.reduce((s, t) => s + (t.value || 0), 0), [transactions]);
  const paid = useMemo(() => transactions.filter(t => t.status === 'pago').reduce((s, t) => s + t.value, 0), [transactions]);
  const pending = totalSpent - paid;
  const budgetPercent = budget > 0 ? (totalSpent / budget) * 100 : 0;
  const remaining = budget - totalSpent;

  const byCategory = useMemo(() => {
    const totals = {} as Record<TransactionCategory, number>;
    (Object.keys(CATEGORY_META) as TransactionCategory[]).forEach(k => (totals[k] = 0));
    transactions.forEach(t => { if (totals[t.category] !== undefined) totals[t.category] += t.value; });
    const max = Math.max(1, ...Object.values(totals));
    return (Object.keys(totals) as TransactionCategory[])
      .map(k => ({ key: k, value: totals[k], pctOfMax: (totals[k] / max) * 100, pctOfTotal: totalSpent > 0 ? (totals[k] / totalSpent) * 100 : 0 }))
      .filter(c => c.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [transactions, totalSpent]);

  const completedPhases = phases.filter(p => (p.progress || 0) >= 100).length;
  const activePhases = phases.filter(p => (p.progress || 0) > 0 && (p.progress || 0) < 100).length;

  const budgetTone = budgetPercent > 100 ? '#B4462F' : budgetPercent > 85 ? '#B08A3E' : '#3E7C8B';

  return (
    <div className="space-y-6">
      {/* Saudação */}
      <div>
        <h2 className="text-2xl md:text-3xl font-bold text-stone-900" style={{ fontFamily: 'var(--font-serif)' }}>
          Como está a sua obra
        </h2>
        <p className="text-sm text-stone-500 mt-1">
          Um panorama simples do andamento e dos investimentos de <span className="font-semibold text-stone-700">{project?.name}</span>.
        </p>
      </div>

      {/* Faixa principal: progresso físico + resumo financeiro */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Progresso físico */}
        <motion.div
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
          className="bg-white border border-stone-200 rounded-2xl p-6 flex flex-col items-center justify-center"
        >
          <span className="text-[10px] font-mono uppercase tracking-widest text-stone-400 mb-3 self-start flex items-center gap-1.5">
            <TrendingUp size={12} /> Andamento da obra
          </span>
          <ProgressRing percent={physicalProgress} />
          <div className="flex gap-4 mt-4 text-center">
            <div className="flex items-center gap-1.5">
              <CheckCircle2 size={14} className="text-emerald-600" />
              <span className="text-xs text-stone-600"><b className="text-stone-900">{completedPhases}</b> concluídas</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Clock size={14} className="text-[#C2703D]" />
              <span className="text-xs text-stone-600"><b className="text-stone-900">{activePhases}</b> em andamento</span>
            </div>
          </div>
        </motion.div>

        {/* Resumo financeiro: 2 colunas de cartões */}
        <motion.div
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.1 }}
          className="lg:col-span-2 bg-white border border-stone-200 rounded-2xl p-6"
        >
          <span className="text-[10px] font-mono uppercase tracking-widest text-stone-400 mb-4 flex items-center gap-1.5">
            <Wallet size={12} /> Investimento da obra
          </span>

          {/* Termômetro de orçamento */}
          <div className="mb-5">
            <div className="flex justify-between items-end mb-1.5">
              <span className="text-xs text-stone-500">Do orçamento previsto de <b className="text-stone-700">{fmtMoney(budget)}</b></span>
              <span className="text-sm font-bold" style={{ color: budgetTone }}>{Math.round(budgetPercent)}% utilizado</span>
            </div>
            <div className="h-4 bg-stone-100 rounded-full overflow-hidden relative">
              <motion.div
                className="h-full rounded-full"
                style={{ background: budgetTone }}
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(100, budgetPercent)}%` }}
                transition={{ duration: 1.2, ease: 'easeOut' }}
              />
            </div>
            {budgetPercent > 100 && (
              <p className="text-[11px] text-[#B4462F] mt-1.5">A obra ultrapassou o orçamento previsto. Fale com a equipe para entender os ajustes.</p>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Já investido', value: fmtMoney(totalSpent), tone: 'text-stone-900' },
              { label: 'Pago', value: fmtMoney(paid), tone: 'text-emerald-700' },
              { label: 'A pagar', value: fmtMoney(pending), tone: 'text-[#B08A3E]' },
              { label: remaining >= 0 ? 'Saldo previsto' : 'Acima do previsto', value: fmtMoney(Math.abs(remaining)), tone: remaining >= 0 ? 'text-[#3E7C8B]' : 'text-[#B4462F]' },
            ].map((c, i) => (
              <div key={i} className="bg-stone-50 rounded-xl p-3">
                <p className="text-[9px] font-mono uppercase tracking-wider text-stone-400">{c.label}</p>
                <p className={`text-base font-bold mt-1 ${c.tone}`} style={{ fontFamily: 'var(--font-serif)' }}>{c.value}</p>
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Centros de custo */}
      <motion.div
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.2 }}
        className="bg-white border border-stone-200 rounded-2xl p-6"
      >
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-lg font-bold text-stone-900" style={{ fontFamily: 'var(--font-serif)' }}>Para onde vai o investimento</h3>
        </div>
        <p className="text-xs text-stone-500 mb-5">Cada tipo de gasto da sua obra, do maior para o menor.</p>

        {byCategory.length === 0 ? (
          <div className="text-center py-10">
            <Package size={28} className="text-stone-300 mx-auto mb-2" />
            <p className="text-sm text-stone-400">Ainda não há investimentos lançados nesta obra.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {byCategory.map((cat, i) => {
              const meta = CATEGORY_META[cat.key];
              const Icon = meta.Icon;
              return (
                <motion.div
                  key={cat.key}
                  initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 + i * 0.08 }}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: meta.color + '22' }}>
                        <Icon size={15} style={{ color: meta.color }} />
                      </span>
                      <span className="text-sm font-medium text-stone-700">{meta.label}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-bold text-stone-900">{fmtMoneyFull(cat.value)}</span>
                      <span className="text-[10px] text-stone-400 ml-1.5">{Math.round(cat.pctOfTotal)}%</span>
                    </div>
                  </div>
                  <div className="h-2.5 bg-stone-100 rounded-full overflow-hidden ml-9">
                    <motion.div
                      className="h-full rounded-full"
                      style={{ background: meta.color }}
                      initial={{ width: 0 }}
                      animate={{ width: `${cat.pctOfMax}%` }}
                      transition={{ duration: 1, ease: 'easeOut', delay: 0.3 + i * 0.08 }}
                    />
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </motion.div>

      {/* Etapas da obra */}
      {phases.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.3 }}
          className="bg-white border border-stone-200 rounded-2xl p-6"
        >
          <h3 className="text-lg font-bold text-stone-900 mb-1" style={{ fontFamily: 'var(--font-serif)' }}>Etapas da obra</h3>
          <p className="text-xs text-stone-500 mb-5">O progresso de cada fase, passo a passo.</p>
          <div className="space-y-3">
            {phases.map((phase, i) => {
              const pct = Math.max(0, Math.min(100, phase.progress || 0));
              const done = pct >= 100;
              return (
                <motion.div
                  key={phase.id}
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 + i * 0.06 }}
                  className="flex items-center gap-3"
                >
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${done ? 'bg-emerald-100' : 'bg-stone-100'}`}>
                    {done
                      ? <CheckCircle2 size={14} className="text-emerald-600" />
                      : <span className="text-[10px] font-bold text-stone-500">{i + 1}</span>}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-sm text-stone-700 truncate">{phase.name}</span>
                      <span className={`text-xs font-bold ml-2 ${done ? 'text-emerald-600' : 'text-stone-500'}`}>{Math.round(pct)}%</span>
                    </div>
                    <div className="h-2 bg-stone-100 rounded-full overflow-hidden">
                      <motion.div
                        className="h-full rounded-full"
                        style={{ background: done ? '#059669' : '#C2703D' }}
                        initial={{ width: 0 }} animate={{ width: `${pct}%` }}
                        transition={{ duration: 0.9, ease: 'easeOut', delay: 0.4 + i * 0.06 }}
                      />
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </motion.div>
      )}
    </div>
  );
}
