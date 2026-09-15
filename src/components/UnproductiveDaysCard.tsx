// ============================================================
// Registro de dias improdutivos (chuva, feriado, etc.).
// Um clique marca hoje; um calendário marca outras datas.
// O sistema acumula o total automaticamente e mostra o histórico.
// Vive no Acompanhamento; o total do período aparece no boletim de medição.
// ============================================================
import React, { useMemo, useState } from 'react';
import { CloudRain, Plus, Trash2, Calendar as CalendarIcon } from 'lucide-react';
import { UnproductiveDay } from '../types';

interface Props {
  projectId: string;
  days: UnproductiveDay[]; // já filtrados para este projeto
  onAdd: (day: UnproductiveDay) => void;
  onRemove: (id: string) => void;
  readOnly?: boolean;
  currentUserName?: string;
}

const hojeISO = () => new Date().toISOString().slice(0, 10);
const fmtBR = (iso: string) => {
  const d = new Date(iso + 'T00:00:00');
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('pt-BR');
};

const MOTIVOS_RAPIDOS = ['Chuva', 'Feriado', 'Falta de material', 'Falta de mão de obra', 'Outro'];

export default function UnproductiveDaysCard({ projectId, days, onAdd, onRemove, readOnly = false, currentUserName }: Props) {
  const [dataEscolhida, setDataEscolhida] = useState(hojeISO());
  const [motivo, setMotivo] = useState('');
  const [mostrarForm, setMostrarForm] = useState(false);

  const ordenados = useMemo(() => [...days].sort((a, b) => b.date.localeCompare(a.date)), [days]);
  const jaTemHoje = days.some(d => d.date === hojeISO());

  // Total do ano corrente (o que costuma importar para o histórico de obra).
  const anoAtual = new Date().getFullYear();
  const totalAno = days.filter(d => d.date.startsWith(String(anoAtual))).length;

  const registrar = (date: string, reason: string) => {
    if (days.some(d => d.date === date)) { alert('Este dia já está registrado como improdutivo.'); return; }
    onAdd({
      id: `ud-${Date.now()}`,
      projectId,
      date,
      reason: reason || undefined,
      createdBy: currentUserName,
      createdAt: new Date().toISOString(),
    });
    setMostrarForm(false);
    setMotivo('');
  };

  return (
    <div className="bg-white border border-stone-200 rounded-2xl overflow-hidden">
      <div className="px-5 py-4 border-b border-stone-150 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h4 className="font-mono text-xs uppercase tracking-wider text-stone-900 font-bold flex items-center gap-1.5">
            <CloudRain size={13} /> Dias Improdutivos
          </h4>
          <p className="text-[11px] text-stone-500 mt-0.5">{totalAno} dia(s) em {anoAtual} · {days.length} no total</p>
        </div>

        {!readOnly && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => registrar(hojeISO(), '')}
              disabled={jaTemHoje}
              className="flex items-center gap-1.5 px-3 py-2 text-[12px] rounded-lg text-white disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: '#3E7C8B', fontWeight: 700 }}
              title={jaTemHoje ? 'Hoje já está marcado' : 'Marcar hoje como improdutivo'}
            >
              <CloudRain size={13} /> {jaTemHoje ? 'Hoje já marcado' : 'Marcar hoje'}
            </button>
            <button onClick={() => setMostrarForm(v => !v)} className="flex items-center gap-1.5 px-3 py-2 text-[12px] rounded-lg bg-white border border-stone-200 text-stone-700 hover:border-stone-400">
              <CalendarIcon size={13} /> Outra data
            </button>
          </div>
        )}
      </div>

      {mostrarForm && !readOnly && (
        <div className="px-5 py-3 bg-stone-50 border-b border-stone-150 flex flex-wrap items-end gap-2">
          <div>
            <label className="block text-[10px] font-mono uppercase text-stone-500 mb-1">Data</label>
            <input type="date" value={dataEscolhida} max={hojeISO()} onChange={e => setDataEscolhida(e.target.value)}
              className="border border-stone-200 rounded px-2 py-1.5 text-xs" />
          </div>
          <div className="flex-1 min-w-[160px]">
            <label className="block text-[10px] font-mono uppercase text-stone-500 mb-1">Motivo (opcional)</label>
            <div className="flex flex-wrap gap-1.5">
              {MOTIVOS_RAPIDOS.map(m => (
                <button key={m} onClick={() => setMotivo(m)}
                  className={`text-[11px] px-2.5 py-1 rounded-full border ${motivo === m ? 'bg-stone-900 text-white border-stone-900' : 'bg-white text-stone-600 border-stone-200'}`}>
                  {m}
                </button>
              ))}
            </div>
          </div>
          <button onClick={() => registrar(dataEscolhida, motivo)}
            className="flex items-center gap-1.5 px-4 py-2 text-[12px] rounded-lg text-white" style={{ background: '#3E7C8B', fontWeight: 700 }}>
            <Plus size={13} /> Registrar
          </button>
        </div>
      )}

      <div className="max-h-56 overflow-y-auto">
        {ordenados.length === 0 ? (
          <p className="text-xs text-stone-400 text-center py-6">Nenhum dia improdutivo registrado ainda.</p>
        ) : (
          <table className="w-full">
            <tbody>
              {ordenados.map(d => (
                <tr key={d.id} className="border-b border-stone-100 last:border-0 hover:bg-stone-50">
                  <td className="py-2 px-5 text-xs text-stone-800 font-medium whitespace-nowrap">{fmtBR(d.date)}</td>
                  <td className="py-2 px-3 text-xs text-stone-500">{d.reason || '—'}</td>
                  <td className="py-2 px-3 text-[11px] text-stone-400">{d.createdBy || ''}</td>
                  {!readOnly && (
                    <td className="py-2 px-5 text-right">
                      <button onClick={() => { if (window.confirm('Remover este registro de dia improdutivo?')) onRemove(d.id); }} className="text-stone-300 hover:text-red-600"><Trash2 size={13} /></button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
