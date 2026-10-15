// Cobrança das parcelas do contrato pelo Banco Cora: configuração e painel de parcelas.
// Toda a comunicação com o Cora acontece no servidor; aqui só se chamam as rotas /api/*.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  X, Loader2, AlertTriangle, CheckCircle2, Settings, RefreshCw, Copy, ExternalLink, Ban, Send, Wallet, RotateCcw, MessageCircle,
} from 'lucide-react';
import { Contract, ContractCharge, ChargeStatus } from '../types';
import { apiGet, apiSend } from '../lib/apiClient';
import { getEtapasContrato } from '../lib/contractTemplates';
import { formatCents } from '../lib/extenso';

const inputClass =
  'w-full bg-stone-50 border border-stone-200 text-xs py-2.5 px-3 focus:outline-hidden focus:border-[#FF5A35] focus:bg-white transition-all font-mono';
const labelClass = 'block text-[10px] font-bold uppercase tracking-wider text-stone-500 mb-1';
const errMsg = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);
const fmtBR = (ymd?: string) => (ymd ? ymd.slice(0, 10).split('-').reverse().join('/') : '');
const brl = (cents: number) => `R$ ${formatCents(cents)}`;

export const CHARGE_STATUS: Record<ChargeStatus, { label: string; color: string }> = {
  aguardando_gatilho: { label: 'Aguardando', color: 'bg-stone-200 text-stone-700!' },
  aguardando_confirmacao: { label: 'Confirmar emissão', color: 'bg-amber-100 text-amber-800!' },
  emitindo: { label: 'Emitindo…', color: 'bg-blue-100 text-blue-700!' },
  emitida: { label: 'Emitida', color: 'bg-blue-100 text-blue-700!' },
  paga: { label: 'Paga', color: 'bg-emerald-100 text-emerald-700!' },
  vencida: { label: 'Vencida', color: 'bg-red-100 text-red-700!' },
  cancelada: { label: 'Cancelada', color: 'bg-stone-200 text-stone-600!' },
  erro: { label: 'Erro', color: 'bg-red-100 text-red-700!' },
};

const etapaTitulo = (key?: string) =>
  getEtapasContrato(['arquitetonico', 'interiores']).find((e) => e.key === key)?.titulo || key || '';

function gatilhoTexto(c: ContractCharge): string {
  switch (c.gatilho) {
    case 'assinatura': return 'Na assinatura do contrato';
    case 'etapa_aprovada': return `Aprovação: ${etapaTitulo(c.etapaKey)}`;
    case 'etapa_entregue': return `Entrega: ${etapaTitulo(c.etapaKey)}`;
    case 'data': return `Data fixa: ${fmtBR(c.dataVencimento)}`;
  }
}

// ---------------------------------------------------------------------------
// Resumo na linha do contrato
// ---------------------------------------------------------------------------

export const ChargesSummary: React.FC<{ contract: Contract }> = ({ contract }) => {
  const ch = contract.charges;
  if (!ch?.length) return null;
  const pagas = ch.filter((c) => c.status === 'paga');
  const pagoCents = pagas.reduce((s, c) => s + (c.valorPagoCents || c.valorCents), 0);
  const totalCents = ch.filter((c) => c.status !== 'cancelada').reduce((s, c) => s + c.valorCents, 0);
  const aConfirmar = ch.filter((c) => c.status === 'aguardando_confirmacao').length;
  const vencidas = ch.filter((c) => c.status === 'vencida').length;
  return (
    <div className="mt-1.5 flex items-center gap-2 flex-wrap text-[10px] text-stone-500">
      <Wallet size={11} className="text-stone-400" />
      <span className="font-bold text-stone-600">Recebido {brl(pagoCents)} de {brl(totalCents)}</span>
      <span>({pagas.length}/{ch.length} parcelas)</span>
      {aConfirmar > 0 && <span className="px-1.5 py-0.5 bg-amber-100 text-amber-800! font-bold">{aConfirmar} p/ confirmar</span>}
      {vencidas > 0 && <span className="px-1.5 py-0.5 bg-red-100 text-red-700! font-bold">{vencidas} vencida{vencidas > 1 ? 's' : ''}</span>}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Painel de parcelas
// ---------------------------------------------------------------------------

interface ChargeView extends ContractCharge { message: string; waLink: string }
interface View {
  environment: 'stage' | 'production';
  enabled: boolean;
  signed: boolean;
  diasVencimentoEtapa: number;
  hoje: string;
  contratanteEmail: string;
  emailFonte: string;
  telefone: string;
  charges: ChargeView[];
}

const addDays = (ymd: string, n: number) => {
  const [y, m, d] = ymd.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
};

export const ChargesModal: React.FC<{ contract: Contract; onClose: () => void }> = ({ contract, onClose }) => {
  const base = `/api/contracts/${encodeURIComponent(contract.id)}`;
  const [view, setView] = useState<View | null>(null);
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [emitFor, setEmitFor] = useState<string | null>(null);
  const [due, setDue] = useState('');

  const load = useCallback(async () => {
    try { setView(await apiGet(`${base}/charges`)); setLoadError(''); }
    catch (e) { setLoadError(errMsg(e, 'Não foi possível carregar as cobranças.')); }
  }, [base]);
  useEffect(() => { void load(); }, [load]);

  const act = async (key: string, fn: () => Promise<string | void>) => {
    setBusy(key); setNotice(null);
    try { const msg = await fn(); if (msg) setNotice({ ok: true, text: msg }); await load(); }
    catch (e) { setNotice({ ok: false, text: errMsg(e, 'Falha na operação.') }); await load(); }
    finally { setBusy(null); }
  };

  const copy = async (text: string, what: string) => {
    try { await navigator.clipboard.writeText(text); setNotice({ ok: true, text: `${what} copiado.` }); }
    catch { setNotice({ ok: false, text: 'Não foi possível copiar automaticamente — selecione e copie manualmente.' }); }
  };

  const totals = useMemo(() => {
    const ch = view?.charges || [];
    const alive = ch.filter((c) => c.status !== 'cancelada');
    return {
      total: alive.reduce((s, c) => s + c.valorCents, 0),
      pago: ch.filter((c) => c.status === 'paga').reduce((s, c) => s + (c.valorPagoCents || c.valorCents), 0),
    };
  }, [view]);

  const openEmit = (c: ChargeView) => { setEmitFor(c.paymentId); setDue(addDays(view!.hoje, view!.diasVencimentoEtapa)); };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-white w-full max-w-3xl my-8 border-2 border-stone-900">
        <div className="flex items-center justify-between p-4 border-b border-stone-200 bg-stone-50">
          <h3 className="font-oswald uppercase tracking-wide text-stone-900 text-sm flex items-center gap-2">
            <Wallet size={14} className="text-[#FF5A35]" /> Cobranças — Contrato nº {String(contract.number).padStart(2, '0')}
          </h3>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-800 cursor-pointer"><X size={18} /></button>
        </div>

        <div className="p-5 space-y-4">
          {!view && !loadError && <div className="flex items-center gap-2 text-xs text-stone-500"><Loader2 size={14} className="animate-spin" /> Carregando…</div>}
          {loadError && <div className="text-xs text-red-600 font-bold">{loadError}</div>}

          {view && (
            <>
              <div className="flex items-center gap-3 flex-wrap text-[11px] text-stone-600">
                {view.environment === 'production'
                  ? <span className="text-[9px] font-bold uppercase px-2 py-0.5 bg-emerald-100 text-emerald-700!">Produção</span>
                  : <span className="text-[9px] font-bold uppercase px-2 py-0.5 bg-amber-100 text-amber-800!">Teste (stage)</span>}
                <span>Boletos para: <strong>{view.contratanteEmail || 'sem e-mail'}</strong> <span className="text-stone-500">({view.emailFonte})</span></span>
                <span>WhatsApp: {view.telefone ? `+${view.telefone}` : 'sem telefone no cadastro'}</span>
              </div>
              {view.environment !== 'production' && (
                <div className="text-[11px] bg-amber-50 border border-amber-200 text-amber-800 p-3">
                  Ambiente de teste do Cora (stage): os boletos emitidos aqui <strong>não são reais</strong> e não podem ser pagos de verdade.
                </div>
              )}
              {!view.enabled && (
                <div className="text-[11px] bg-red-50 border border-red-200 text-red-700 p-3 flex items-center gap-2">
                  <AlertTriangle size={13} /> A cobrança pelo Cora está desativada — ative em “Cobrança (Cora)”.
                </div>
              )}
              {!view.signed && (
                <div className="text-[11px] bg-amber-50 border border-amber-200 text-amber-800 p-3">
                  As cobranças só são geradas depois que o contrato é assinado por todas as partes.
                </div>
              )}

              {view.charges.length > 0 && (
                <div className="flex items-center gap-4 text-[11px] text-stone-600">
                  <span>Contratado: <strong>{brl(totals.total)}</strong></span>
                  <span>Recebido: <strong>{brl(totals.pago)}</strong></span>
                  <span>A receber: <strong>{brl(Math.max(0, totals.total - totals.pago))}</strong></span>
                </div>
              )}

              <div className="border border-stone-200 divide-y divide-stone-100">
                {view.charges.length === 0 && <div className="p-4 text-xs text-stone-400">Nenhuma parcela definida neste contrato.</div>}
                {view.charges.map((c) => {
                  const st = CHARGE_STATUS[c.status];
                  const k = (a: string) => `${a}-${c.paymentId}`;
                  return (
                    <div key={c.paymentId} className="p-4 space-y-2">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-sm text-stone-800">{c.descricao}</span>
                            <span className={`text-[9px] font-bold uppercase px-2 py-0.5 ${st.color}`}>{st.label}</span>
                          </div>
                          <span className="block text-[11px] text-stone-500">{gatilhoTexto(c)}</span>
                          {c.dueDate && c.status !== 'aguardando_gatilho' && <span className="block text-[11px] text-stone-500">Vencimento: {fmtBR(c.dueDate)}</span>}
                          {c.status === 'paga' && <span className="block text-[11px] text-emerald-600!">Pago em {fmtBR(c.pagaEm)} — {brl(c.valorPagoCents || c.valorCents)}</span>}
                          {c.status === 'aguardando_confirmacao' && <span className="block text-[11px] text-amber-700!">Etapa atingida em {fmtBR(c.gatilhoAtingidoEm)} — confirme para emitir o boleto.</span>}
                          {c.status === 'erro' && c.lastError && <span className="block text-[11px] text-red-600!">{c.lastError}</span>}
                          {c.enviadaWhatsAppEm && <span className="block text-[10px] text-stone-500">Enviada por WhatsApp em {fmtBR(c.enviadaWhatsAppEm)}</span>}
                        </div>
                        <span className="font-bold text-sm text-stone-800 shrink-0">{brl(c.valorCents)}</span>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {['aguardando_gatilho', 'aguardando_confirmacao', 'erro'].includes(c.status) && view.signed && emitFor !== c.paymentId && (
                          <button
                            disabled={!view.enabled || !!busy}
                            onClick={() => openEmit(c)}
                            className="flex items-center gap-1.5 bg-[#FF5A35] text-white px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider hover:bg-[#e64d29] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            <Send size={12} /> {c.status === 'aguardando_gatilho' ? 'Emitir agora' : c.status === 'erro' ? 'Tentar de novo' : 'Confirmar emissão'}
                          </button>
                        )}
                        {['cancelada', 'erro'].includes(c.status) && (
                          <button
                            disabled={!!busy}
                            onClick={() => act(k('reopen'), async () => { await apiSend(`${base}/charges/${encodeURIComponent(c.paymentId)}/reopen`, 'POST', {}); return 'Parcela reaberta.'; })}
                            className="flex items-center gap-1.5 border border-stone-300 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-stone-600 hover:border-[#FF5A35] cursor-pointer disabled:opacity-40"
                          >
                            <RotateCcw size={12} /> Reabrir
                          </button>
                        )}
                        {['emitida', 'vencida', 'paga'].includes(c.status) && (
                          <>
                            {c.boletoUrl && (
                              <a href={c.boletoUrl} target="_blank" rel="noopener noreferrer"
                                className="flex items-center gap-1.5 border border-stone-300 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-stone-600 hover:border-[#FF5A35]">
                                <ExternalLink size={12} /> <span className="text-stone-600">Boleto (PDF)</span>
                              </a>
                            )}
                            {c.pixEmv && (
                              <button onClick={() => copy(c.pixEmv!, 'Pix copia e cola')}
                                className="flex items-center gap-1.5 border border-stone-300 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-stone-600 hover:border-[#FF5A35] cursor-pointer">
                                <Copy size={12} /> Pix
                              </button>
                            )}
                            {c.linhaDigitavel && (
                              <button onClick={() => copy(c.linhaDigitavel!, 'Linha digitável')}
                                className="flex items-center gap-1.5 border border-stone-300 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-stone-600 hover:border-[#FF5A35] cursor-pointer">
                                <Copy size={12} /> Linha digitável
                              </button>
                            )}
                          </>
                        )}
                        {['emitida', 'vencida'].includes(c.status) && (
                          <>
                            {c.waLink && (
                              <a href={c.waLink} target="_blank" rel="noopener noreferrer"
                                className="flex items-center gap-1.5 border border-stone-300 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-stone-600 hover:border-[#FF5A35]"
                                title="Abre o WhatsApp com a mensagem pronta">
                                <MessageCircle size={12} /> <span className="text-stone-600">WhatsApp</span>
                              </a>
                            )}
                            <button
                              disabled={!!busy}
                              onClick={() => act(k('wa'), async () => { await apiSend(`${base}/charges/${encodeURIComponent(c.paymentId)}/whatsapp`, 'POST', {}); return 'Mensagem enviada ao cliente por WhatsApp.'; })}
                              className="flex items-center gap-1.5 border border-stone-300 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-stone-600 hover:border-[#FF5A35] cursor-pointer disabled:opacity-40"
                              title="Envia automaticamente pela integração de WhatsApp do HUB"
                            >
                              {busy === k('wa') ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />} Enviar automático
                            </button>
                            <button
                              disabled={!!busy}
                              onClick={() => act(k('refresh'), async () => { await apiSend(`${base}/charges/${encodeURIComponent(c.paymentId)}/refresh`, 'POST', {}); return 'Status conferido no Cora.'; })}
                              className="flex items-center gap-1.5 border border-stone-300 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-stone-600 hover:border-[#FF5A35] cursor-pointer disabled:opacity-40"
                            >
                              {busy === k('refresh') ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} Atualizar
                            </button>
                            <button
                              disabled={!!busy}
                              onClick={() => { if (window.confirm(`Cancelar o boleto "${c.descricao}"? O cliente não poderá mais pagá-lo.`)) void act(k('cancel'), async () => { await apiSend(`${base}/charges/${encodeURIComponent(c.paymentId)}/cancel`, 'POST', {}); return 'Boleto cancelado.'; }); }}
                              className="flex items-center gap-1.5 border border-red-300 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-red-600! hover:bg-red-50 cursor-pointer disabled:opacity-40"
                            >
                              <Ban size={12} /> Cancelar boleto
                            </button>
                          </>
                        )}
                      </div>

                      {emitFor === c.paymentId && (
                        <div className="flex items-end gap-3 flex-wrap bg-stone-50 border border-stone-200 p-3">
                          <div>
                            <label className={labelClass}>Vencimento do boleto</label>
                            <input type="date" className={inputClass} value={due} min={view.hoje} onChange={(e) => setDue(e.target.value)} />
                          </div>
                          <button
                            disabled={!due || due < view.hoje || !!busy}
                            onClick={() => act(k('emit'), async () => {
                              await apiSend(`${base}/charges/${encodeURIComponent(c.paymentId)}/emit`, 'POST', { dueDate: due });
                              setEmitFor(null);
                              return `Boleto emitido (${brl(c.valorCents)}, vence em ${fmtBR(due)}).`;
                            })}
                            className="flex items-center gap-1.5 bg-[#FF5A35] text-white px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider hover:bg-[#e64d29] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            {busy === k('emit') ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />} Emitir boleto de {brl(c.valorCents)}
                          </button>
                          <button onClick={() => setEmitFor(null)} className="text-[10px] font-bold uppercase text-stone-500 hover:text-stone-800 cursor-pointer px-2 py-2.5">Cancelar</button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {notice && (
            <div className={`text-xs font-bold p-3 border ${notice.ok ? 'text-emerald-700 bg-emerald-50 border-emerald-200' : 'text-red-700 bg-red-50 border-red-200'}`}>{notice.text}</div>
          )}
        </div>

        <div className="flex justify-end p-4 border-t border-stone-200 bg-stone-50">
          <button onClick={onClose} className="px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-stone-500 hover:text-stone-800 cursor-pointer">Fechar</button>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Configuração do Cora
// ---------------------------------------------------------------------------

interface CoraCfg {
  enabled: boolean;
  environment: 'stage' | 'production';
  coraClientId: string;
  coraCertSet: boolean;
  coraKeySet: boolean;
  webhookId: string;
  webhookEndpointMasked: string;
  autoEmitirAssinatura: boolean;
  diasVencimentoAssinatura: number;
  diasVencimentoEtapa: number;
  antecedenciaDataDias: number;
  multaPercent: number;
  jurosPercent: number;
  enviarWhatsAppAuto: boolean;
}

const readText = (file: File) => new Promise<string>((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result || ''));
  r.onerror = () => reject(new Error('Não foi possível ler o arquivo.'));
  r.readAsText(file);
});

export const BillingConfigModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [cfg, setCfg] = useState<CoraCfg | null>(null);
  const [cert, setCert] = useState<{ name: string; pem: string } | null>(null);
  const [key, setKey] = useState<{ name: string; pem: string } | null>(null);
  const [publicUrl, setPublicUrl] = useState(typeof window !== 'undefined' ? window.location.origin : '');
  const [busy, setBusy] = useState<'' | 'save' | 'test' | 'hook'>('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    apiGet('/api/cora/config').then(setCfg).catch((e) => setMsg({ ok: false, text: errMsg(e, 'Não foi possível carregar a configuração.') }));
  }, []);

  if (!cfg) {
    return (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
        <div className="bg-white p-6 text-xs text-stone-500 flex items-center gap-2 border-2 border-stone-900">
          {msg ? <span className="text-red-600 font-bold">{msg.text}</span> : <><Loader2 size={14} className="animate-spin" /> Carregando…</>}
          <button onClick={onClose} className="ml-4 text-stone-400 hover:text-stone-800 cursor-pointer"><X size={16} /></button>
        </div>
      </div>
    );
  }

  const set = <K extends keyof CoraCfg>(k: K, v: CoraCfg[K]) => setCfg({ ...cfg, [k]: v });
  const pickFile = async (e: React.ChangeEvent<HTMLInputElement>, setter: (v: { name: string; pem: string }) => void) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try { setter({ name: f.name, pem: await readText(f) }); } catch (er) { setMsg({ ok: false, text: errMsg(er, 'Falha ao ler o arquivo.') }); }
  };

  const save = async (): Promise<boolean> => {
    try {
      const r = await apiSend('/api/cora/config', 'POST', {
        enabled: cfg.enabled, environment: cfg.environment, coraClientId: cfg.coraClientId,
        ...(cert ? { coraCertPem: cert.pem } : {}), ...(key ? { coraKeyPem: key.pem } : {}),
        autoEmitirAssinatura: cfg.autoEmitirAssinatura, diasVencimentoAssinatura: Number(cfg.diasVencimentoAssinatura),
        diasVencimentoEtapa: Number(cfg.diasVencimentoEtapa), antecedenciaDataDias: Number(cfg.antecedenciaDataDias),
        multaPercent: Number(cfg.multaPercent), jurosPercent: Number(cfg.jurosPercent), enviarWhatsAppAuto: cfg.enviarWhatsAppAuto,
      });
      setCfg(r.config); setCert(null); setKey(null);
      return true;
    } catch (e) { setMsg({ ok: false, text: errMsg(e, 'Falha ao salvar.') }); return false; }
  };

  const run = async (kind: 'save' | 'test' | 'hook') => {
    setBusy(kind); setMsg(null);
    try {
      if (!(await save())) return;
      if (kind === 'save') setMsg({ ok: true, text: 'Configuração salva.' });
      if (kind === 'test') { const r = await apiSend('/api/cora/test', 'POST', {}); setMsg({ ok: true, text: `${r.message} (${r.environment === 'production' ? 'produção' : 'stage'})` }); }
      if (kind === 'hook') { const r = await apiSend('/api/cora/register-webhook', 'POST', { publicUrl }); setCfg(r.config); setMsg({ ok: true, text: 'Aviso de pagamento cadastrado no Cora.' }); }
    } catch (e) { setMsg({ ok: false, text: errMsg(e, 'Falha na operação.') }); }
    finally { setBusy(''); }
  };

  const num = (k: keyof CoraCfg, label: string, step = 1) => (
    <div>
      <label className={labelClass}>{label}</label>
      <input type="number" step={step} min={0} className={inputClass} value={cfg[k] as number} onChange={(e) => set(k, Number(e.target.value) as never)} />
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-white w-full max-w-xl my-8 border-2 border-stone-900">
        <div className="flex items-center justify-between p-4 border-b border-stone-200 bg-stone-50">
          <h3 className="font-oswald uppercase tracking-wide text-stone-900 text-sm flex items-center gap-2">
            <Settings size={14} className="text-[#FF5A35]" /> Cobrança — Banco Cora
          </h3>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-800 cursor-pointer"><X size={18} /></button>
        </div>

        <div className="p-5 space-y-5">
          <label className="flex items-center gap-2 text-xs font-bold cursor-pointer">
            <input type="checkbox" checked={cfg.enabled} onChange={(e) => set('enabled', e.target.checked)} />
            <span className="text-stone-800">Cobrança pelo Cora ativada</span>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Ambiente</label>
              <select className={inputClass} value={cfg.environment} onChange={(e) => set('environment', e.target.value as CoraCfg['environment'])}>
                <option value="stage">Teste (stage)</option>
                <option value="production">Produção</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>Client ID</label>
              <input type="text" autoComplete="off" className={inputClass} value={cfg.coraClientId} onChange={(e) => set('coraClientId', e.target.value)} placeholder="int-xxxxxxxx" />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Certificado (certificate.pem) {cfg.coraCertSet && <span className="text-emerald-600! normal-case">• salvo</span>}</label>
              <input type="file" accept=".pem,.crt,.cer" onChange={(e) => pickFile(e, setCert)} className="text-[11px] text-stone-500 w-full" />
              {cert && <span className="block text-[10px] text-stone-500 mt-1">{cert.name} (será salvo ao gravar)</span>}
            </div>
            <div>
              <label className={labelClass}>Chave privada (private-key.key) {cfg.coraKeySet && <span className="text-emerald-600! normal-case">• salva</span>}</label>
              <input type="file" accept=".key,.pem" onChange={(e) => pickFile(e, setKey)} className="text-[11px] text-stone-500 w-full" />
              {key && <span className="block text-[10px] text-stone-500 mt-1">{key.name} (será salva ao gravar)</span>}
            </div>
          </div>
          <p className="text-[10px] text-stone-500 -mt-3">
            Credenciais pedidas no app/Cora Web (integração direta). Cada ambiente — stage e produção — tem Client ID, certificado e chave próprios; troque os três juntos. A chave privada fica só no servidor.
          </p>

          <div className="border border-stone-200 p-3 space-y-3 bg-stone-50">
            <div className={labelClass}>Quando emitir</div>
            <label className="flex items-center gap-2 text-[11px] cursor-pointer">
              <input type="checkbox" checked={cfg.autoEmitirAssinatura} onChange={(e) => set('autoEmitirAssinatura', e.target.checked)} />
              <span className="text-stone-700">Emitir sozinho a parcela “na assinatura” quando o contrato for assinado</span>
            </label>
            <div className="grid grid-cols-3 gap-3">
              {num('diasVencimentoAssinatura', 'Vence em (dias) após assinar')}
              {num('diasVencimentoEtapa', 'Vence em (dias) após confirmar etapa')}
              {num('antecedenciaDataDias', 'Parcelas de data: emitir X dias antes')}
            </div>
            <p className="text-[10px] text-stone-500">Parcelas ligadas a etapas nunca saem sozinhas: o HUB avisa que a etapa foi atingida e você confirma.</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {num('multaPercent', 'Multa por atraso (%)', 0.5)}
            {num('jurosPercent', 'Juros de mora (% ao mês)', 0.5)}
          </div>
          <p className="text-[10px] text-stone-500 -mt-3">Valores do contrato (cláusulas 3.4/5.5): multa 2% e juros 1% ao mês. Confira no stage como o Cora apresenta os juros.</p>

          <label className="flex items-center gap-2 text-[11px] cursor-pointer">
            <input type="checkbox" checked={cfg.enviarWhatsAppAuto} onChange={(e) => set('enviarWhatsAppAuto', e.target.checked)} />
            <span className="text-stone-700">Enviar o boleto ao cliente por WhatsApp assim que emitir (usa a integração de WhatsApp da Agenda)</span>
          </label>

          <div className="border border-stone-200 p-3 space-y-2 bg-stone-50">
            <div className={labelClass}>Aviso automático de pagamento (webhook)</div>
            <div className="flex items-start gap-1.5">
              {cfg.webhookId
                ? <><CheckCircle2 size={13} className="text-emerald-600 shrink-0 mt-0.5" /><span className="text-[11px] text-stone-600">Cadastrado: <span className="font-mono text-[10px] break-all">{cfg.webhookEndpointMasked}</span></span></>
                : <><AlertTriangle size={13} className="text-amber-600 shrink-0 mt-0.5" /><span className="text-[11px] text-stone-600">Ainda não cadastrado — sem ele o HUB confere os pagamentos a cada 10 minutos.</span></>}
            </div>
            <div className="flex gap-2">
              <input type="text" className={inputClass} value={publicUrl} onChange={(e) => setPublicUrl(e.target.value)} placeholder="https://hub.chavesbritescorrea.cloud" />
              <button onClick={() => run('hook')} disabled={!!busy}
                className="shrink-0 px-3 text-[10px] font-bold uppercase tracking-wider border border-stone-300 hover:border-[#FF5A35] hover:text-[#FF5A35] cursor-pointer disabled:opacity-50">
                {busy === 'hook' ? <Loader2 size={13} className="animate-spin" /> : 'Cadastrar'}
              </button>
            </div>
            <p className="text-[10px] text-stone-500">Use o endereço público (https) do HUB. Salva a configuração antes de cadastrar.</p>
          </div>

          {msg && <div className={`text-xs font-bold p-3 border ${msg.ok ? 'text-emerald-700 bg-emerald-50 border-emerald-200' : 'text-red-700 bg-red-50 border-red-200'}`}>{msg.text}</div>}
        </div>

        <div className="flex justify-between gap-2 p-4 border-t border-stone-200 bg-stone-50">
          <button onClick={() => run('test')} disabled={!!busy}
            className="flex items-center gap-2 px-4 py-2.5 text-xs font-bold uppercase tracking-wider border border-stone-300 hover:border-[#FF5A35] hover:text-[#FF5A35] cursor-pointer disabled:opacity-50">
            {busy === 'test' ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Testar autenticação
          </button>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-stone-500 hover:text-stone-800 cursor-pointer">Fechar</button>
            <button onClick={() => run('save')} disabled={!!busy}
              className="flex items-center gap-2 bg-[#FF5A35] text-white px-4 py-2.5 text-xs font-bold uppercase tracking-wider hover:bg-[#e64d29] cursor-pointer disabled:opacity-50">
              {busy === 'save' ? <Loader2 size={14} className="animate-spin" /> : null} Salvar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
