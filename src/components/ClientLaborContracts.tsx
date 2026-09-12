// ============================================================
// Contratos de mão de obra do centro de custo — visão do cliente (leitura).
// Lista cada contrato (fornecedor, escopo, valor) e quanto já foi pago,
// com barra de progresso do pagamento. Lê labor_contracts e labor_payments.
// ============================================================
import React, { useEffect, useMemo, useState } from 'react';
import { HardHat, ChevronDown, ChevronRight } from 'lucide-react';
import { subscribeCollection } from '../lib/firebaseDb';

interface LaborContract {
  id: string; projectId: string; supplier: string; scope: string; contractValue: number; notes?: string;
}
interface LaborPayment {
  id: string; projectId: string; contractId: string; supplier: string; paymentDate: string; value: number; description: string;
}

interface Props {
  projectId: string;
  formatCurrency?: (v: number) => string;
}

export default function ClientLaborContracts({ projectId, formatCurrency }: Props) {
  const fmt = formatCurrency || ((v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
  const [contracts, setContracts] = useState<LaborContract[]>([]);
  const [payments, setPayments] = useState<LaborPayment[]>([]);
  const [aberto, setAberto] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const unsubC = subscribeCollection('labor_contracts', setContracts, [], 'cbc_labor_contracts');
    const unsubP = subscribeCollection('labor_payments', setPayments, [], 'cbc_labor_payments');
    return () => { unsubC(); unsubP(); };
  }, []);

  const doProjeto = useMemo(() => contracts.filter(c => c.projectId === projectId), [contracts, projectId]);

  const pagoDoContrato = (contractId: string) =>
    payments.filter(p => p.projectId === projectId && p.contractId === contractId).reduce((s, p) => s + (p.value || 0), 0);

  const pagamentosDoContrato = (contractId: string) =>
    payments.filter(p => p.projectId === projectId && p.contractId === contractId)
      .sort((a, b) => (b.paymentDate || '').localeCompare(a.paymentDate || ''));

  const totalContratado = doProjeto.reduce((s, c) => s + (c.contractValue || 0), 0);
  const totalPago = doProjeto.reduce((s, c) => s + pagoDoContrato(c.id), 0);

  if (doProjeto.length === 0) {
    return (
      <div className="bg-white border border-stone-200 rounded-2xl p-6 text-center">
        <HardHat size={28} className="mx-auto mb-2 text-stone-300" />
        <p className="text-xs text-stone-400">Nenhum contrato de mão de obra cadastrado para esta obra.</p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-stone-200 rounded-2xl overflow-hidden">
      <div className="px-5 py-4 border-b border-stone-150 flex items-center justify-between flex-wrap gap-2">
        <div>
          <h4 className="font-mono text-xs uppercase tracking-wider text-stone-900 font-bold flex items-center gap-1.5"><HardHat size={13} /> Contratos de Mão de Obra</h4>
          <p className="text-[11px] text-stone-500 mt-0.5">{doProjeto.length} contrato(s) neste centro de custo</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-mono uppercase text-stone-400">Contratado / Pago</p>
          <p className="text-xs font-bold text-stone-900">{fmt(totalContratado)} <span className="text-stone-400">/</span> {fmt(totalPago)}</p>
        </div>
      </div>

      <div>
        {doProjeto.map(c => {
          const pago = pagoDoContrato(c.id);
          const pct = c.contractValue > 0 ? Math.min(100, Math.round((pago / c.contractValue) * 100)) : 0;
          const pgtos = pagamentosDoContrato(c.id);
          const isOpen = aberto[c.id];
          return (
            <div key={c.id} className="border-b border-stone-150 last:border-0">
              <button onClick={() => setAberto(prev => ({ ...prev, [c.id]: !prev[c.id] }))}
                className="w-full text-left px-5 py-3 hover:bg-stone-50 transition-colors">
                <div className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2 min-w-0">
                    {isOpen ? <ChevronDown size={14} className="text-stone-400 flex-shrink-0" /> : <ChevronRight size={14} className="text-stone-400 flex-shrink-0" />}
                    <span className="min-w-0">
                      <span className="block text-sm font-bold text-stone-900 truncate">{c.supplier}</span>
                      {c.scope && <span className="block text-[11px] text-stone-500 truncate">{c.scope}</span>}
                    </span>
                  </span>
                  <span className="text-right flex-shrink-0">
                    <span className="block text-xs font-bold text-stone-900">{fmt(pago)}</span>
                    <span className="block text-[10px] text-stone-400">de {fmt(c.contractValue)}</span>
                  </span>
                </div>
                {/* barra de progresso do pagamento */}
                <div className="mt-2 flex items-center gap-2">
                  <div className="flex-1 h-1.5 bg-stone-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: pct >= 100 ? '#3E7C8B' : '#7d5bf8' }} />
                  </div>
                  <span className="text-[10px] font-mono text-stone-400">{pct}%</span>
                </div>
              </button>

              {/* pagamentos do contrato */}
              {isOpen && (
                <div className="px-5 pb-3 bg-stone-50">
                  {pgtos.length === 0 ? (
                    <p className="text-[11px] text-stone-400 py-2">Nenhum pagamento lançado ainda.</p>
                  ) : (
                    <table className="w-full mt-1">
                      <thead>
                        <tr className="border-b border-stone-150">
                          <th className="py-1.5 text-[10px] font-mono uppercase text-stone-400 text-left">Data</th>
                          <th className="py-1.5 text-[10px] font-mono uppercase text-stone-400 text-left">Descrição / Parcela</th>
                          <th className="py-1.5 text-[10px] font-mono uppercase text-stone-400 text-right">Valor</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pgtos.map(p => (
                          <tr key={p.id} className="border-b border-stone-100 last:border-0">
                            <td className="py-1.5 text-[11px] text-stone-500 whitespace-nowrap">{p.paymentDate ? new Date(p.paymentDate + 'T00:00:00').toLocaleDateString('pt-BR') : '—'}</td>
                            <td className="py-1.5 text-[11px] text-stone-700">{p.description || '—'}</td>
                            <td className="py-1.5 text-[11px] font-bold text-stone-900 text-right whitespace-nowrap">{fmt(p.value || 0)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
