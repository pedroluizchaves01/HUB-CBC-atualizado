// Painel (admin) para carregar/remover a OBRA DEMONSTRATIVA: cliente e centro de custo fictícios,
// totalmente preenchidos, para mostrar a clientes em negociação. Tudo é gravado com ids "demo-…"
// e pode ser removido com um clique, sem tocar nos dados reais.

import React, { useCallback, useEffect, useState } from 'react';
import { Presentation, Loader2, Trash2, RefreshCw, Copy, CheckCircle2, AlertTriangle, KeyRound } from 'lucide-react';
import { apiGet, apiSend } from '../lib/apiClient';

interface Status { loaded: boolean; counts: Record<string, number>; username: string; clientName?: string }
interface Credentials { username: string; password: string }

const errMsg = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);

const LABELS: [string, string][] = [
  ['timeline_phases', 'etapas do cronograma'],
  ['weekly_logs', 'relatórios semanais'],
  ['daily_logs', 'registros de diário'],
  ['transactions', 'lançamentos financeiros'],
  ['labor_contracts', 'contratos de empreiteiros'],
  ['labor_payments', 'pagamentos de mão de obra'],
  ['materials', 'itens de materiais'],
  ['quotation_maps', 'mapas de cotação'],
  ['measurements', 'boletins de medição'],
  ['documents', 'documentos'],
];

export const DemoObraPanel: React.FC = () => {
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState<'load' | 'remove' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [credentials, setCredentials] = useState<Credentials | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [copied, setCopied] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setStatus(await apiGet('/api/demo/obra'));
    } catch (e) {
      setError(errMsg(e, 'Não foi possível consultar a obra demonstrativa.'));
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const load = async () => {
    setBusy('load'); setError(null); setNotice(null);
    try {
      const r = await apiSend('/api/demo/obra', 'POST', {});
      setCredentials(r.credentials || null);
      setNotice('Obra demonstrativa carregada. Os dados aparecem nas telas em poucos segundos.');
      await refresh();
    } catch (e) {
      setError(errMsg(e, 'Falha ao carregar a obra demonstrativa.'));
    } finally { setBusy(null); }
  };

  const remove = async () => {
    setBusy('remove'); setError(null); setNotice(null);
    try {
      const r = await apiSend('/api/demo/obra', 'DELETE');
      setCredentials(null); setConfirmRemove(false);
      setNotice(`Obra demonstrativa removida (${r.removed} registros apagados).`);
      await refresh();
    } catch (e) {
      setError(errMsg(e, 'Falha ao remover a obra demonstrativa.'));
    } finally { setBusy(null); }
  };

  const copyCreds = async () => {
    if (!credentials) return;
    try {
      await navigator.clipboard.writeText(`Usuário: ${credentials.username}\nSenha: ${credentials.password}`);
      setCopied(true); setTimeout(() => setCopied(false), 2000);
    } catch { /* área de transferência indisponível */ }
  };

  return (
    <div className="bg-white border border-stone-200 p-5 md:p-6">
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <Presentation className="text-[#FF5A35] mt-0.5 shrink-0" size={20} />
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-serif text-base text-stone-900">Obra demonstrativa para apresentações</h3>
              {status?.loaded && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-700!">
                  <CheckCircle2 size={11} /> Carregada
                </span>
              )}
            </div>
            <p className="text-xs text-stone-500 mt-1 leading-relaxed max-w-3xl">
              Cliente e centro de custo fictícios — residência de 250 m², cerca de R$ 1,2 milhão, de janeiro/2025 a março/2026 —
              com cronograma, empreiteiros, compras, mapas de cotação, pagamentos, diário e avanço semana a semana.
              Os dados ficam separados dos reais e podem ser removidos a qualquer momento.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          {!status?.loaded ? (
            <button
              onClick={load}
              disabled={busy !== null || status === null}
              className="flex items-center gap-2 bg-[#FF5A35] text-white px-4 py-2.5 text-xs font-bold uppercase tracking-wider hover:bg-[#e64d29] transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {busy === 'load' ? <Loader2 size={14} className="animate-spin" /> : <Presentation size={14} />}
              {busy === 'load' ? 'Carregando…' : 'Carregar obra demonstrativa'}
            </button>
          ) : (
            <>
              <button
                onClick={load}
                disabled={busy !== null}
                title="Recria os dados fictícios do zero (a senha do cliente é mantida)"
                className="flex items-center gap-2 border border-stone-300 text-stone-600 px-3 py-2.5 text-xs font-bold uppercase tracking-wider hover:border-[#FF5A35] hover:text-[#FF5A35] transition-colors cursor-pointer disabled:opacity-50"
              >
                {busy === 'load' ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Recarregar
              </button>
              {!confirmRemove ? (
                <button
                  onClick={() => setConfirmRemove(true)}
                  disabled={busy !== null}
                  className="flex items-center gap-2 border border-stone-300 text-stone-600 px-3 py-2.5 text-xs font-bold uppercase tracking-wider hover:border-red-500 hover:text-red-600 transition-colors cursor-pointer disabled:opacity-50"
                >
                  <Trash2 size={14} /> Remover
                </button>
              ) : (
                <span className="flex items-center gap-2">
                  <button
                    onClick={remove}
                    disabled={busy !== null}
                    className="flex items-center gap-2 bg-red-600 text-white px-3 py-2.5 text-xs font-bold uppercase tracking-wider hover:bg-red-700 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {busy === 'remove' ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />} Confirmar remoção
                  </button>
                  <button
                    onClick={() => setConfirmRemove(false)}
                    disabled={busy !== null}
                    className="border border-stone-300 text-stone-600 px-3 py-2.5 text-xs font-bold uppercase tracking-wider hover:border-stone-500 transition-colors cursor-pointer"
                  >
                    Cancelar
                  </button>
                </span>
              )}
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="mt-4 flex items-start gap-2 bg-red-50 border border-red-200 text-red-800! text-xs p-3">
          <AlertTriangle size={14} className="shrink-0 mt-0.5" /> <span className="text-red-800!">{error}</span>
        </div>
      )}
      {notice && !error && (
        <div className="mt-4 flex items-start gap-2 bg-emerald-50 border border-emerald-200 text-xs p-3">
          <CheckCircle2 size={14} className="shrink-0 mt-0.5 text-emerald-700" /> <span className="text-emerald-800!">{notice}</span>
        </div>
      )}

      {credentials && (
        <div className="mt-4 border border-[#FF5A35]/40 bg-[#FF5A35]/5 p-4">
          <div className="flex items-center gap-2 mb-2">
            <KeyRound size={14} className="text-[#FF5A35]" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-stone-700">Acesso do cliente fictício — anote agora</span>
          </div>
          <div className="flex items-center gap-4 flex-wrap font-mono text-xs text-stone-800">
            <span>Usuário: <strong>{credentials.username}</strong></span>
            <span>Senha: <strong>{credentials.password}</strong></span>
            <button onClick={copyCreds} className="flex items-center gap-1.5 border border-stone-300 text-stone-600 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider hover:border-[#FF5A35] hover:text-[#FF5A35] transition-colors cursor-pointer">
              <Copy size={11} /> {copied ? 'Copiado' : 'Copiar'}
            </button>
          </div>
          <p className="text-[11px] text-stone-500 mt-2">A senha é aleatória e não será exibida de novo. Entre com esse usuário para mostrar a visão do cliente.</p>
        </div>
      )}

      {status?.loaded && (
        <div className="mt-4 pt-4 border-t border-stone-150">
          <p className="text-[11px] text-stone-500 leading-relaxed">
            {LABELS.map(([k, label]) => `${status.counts[k] ?? 0} ${label}`).join(' · ')}.
          </p>
          <p className="text-[11px] text-stone-500 mt-1">
            Acesso do cliente: usuário <strong className="text-stone-700">{status.username}</strong> (senha definida na primeira carga).
          </p>
        </div>
      )}
    </div>
  );
};

export default DemoObraPanel;
