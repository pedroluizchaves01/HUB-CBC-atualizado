// Assinatura eletrônica de contratos (ClickSign): configuração, confirmação de envio e andamento.
// Toda a comunicação com o ClickSign acontece no servidor; aqui só se chamam as rotas /api/*.

import React, { useEffect, useState } from 'react';
import {
  X, Loader2, AlertTriangle, CheckCircle2, Send, Settings, Download, ShieldCheck, RefreshCw,
} from 'lucide-react';
import { Contract, Project } from '../types';
import { apiGet, apiSend } from '../lib/apiClient';
import { downloadContractPdf, generateContractPdf } from '../lib/contractPdf';

const inputClass =
  'w-full bg-stone-50 border border-stone-200 text-xs py-2.5 px-3 focus:outline-hidden focus:border-[#FF5A35] focus:bg-white transition-all font-mono';
const labelClass = 'block text-[10px] font-bold uppercase tracking-wider text-stone-500 mb-1';

const errMsg = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);

export const EnvironmentBadge: React.FC<{ environment: 'sandbox' | 'production' }> = ({ environment }) =>
  environment === 'production' ? (
    <span className="text-[9px] font-bold uppercase px-2 py-0.5 bg-emerald-100 text-emerald-700!">Produção</span>
  ) : (
    <span className="text-[9px] font-bold uppercase px-2 py-0.5 bg-amber-100 text-amber-800!">Teste (sandbox)</span>
  );

// ---------------------------------------------------------------------------
// Andamento das assinaturas (linha do contrato)
// ---------------------------------------------------------------------------

export const SignatureProgress: React.FC<{ contract: Contract }> = ({ contract }) => {
  const sig = contract.signature;
  if (!sig) return null;
  const total = sig.signers.length;
  const done = sig.signers.filter((s) => s.signed).length;
  const refused = sig.signers.filter((s) => s.refused);
  const fmt = (iso?: string) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '');
  return (
    <div className="mt-1.5 space-y-1">
      <div className="flex items-center gap-2 flex-wrap text-[10px] text-stone-500">
        <ShieldCheck size={11} className="text-stone-400" />
        <span className="font-bold text-stone-600">
          {sig.status === 'closed' && `Assinado por todas as partes${sig.closedAt ? ` em ${fmt(sig.closedAt)}` : ''}`}
          {sig.status === 'running' && `Assinaturas: ${done} de ${total}`}
          {sig.status === 'canceled' && 'Envio cancelado'}
          {sig.status === 'expired' && 'Prazo de assinatura expirado'}
        </span>
        <EnvironmentBadge environment={sig.environment} />
        {sig.sentAt && sig.status === 'running' && <span>enviado em {fmt(sig.sentAt)}</span>}
      </div>
      {sig.status !== 'canceled' && sig.status !== 'expired' && (
        <div className="flex flex-wrap gap-1.5">
          {sig.signers.map((s) => (
            <span
              key={s.key}
              title={`${s.name} <${s.email}>`}
              className={`text-[9px] px-1.5 py-0.5 border ${
                s.refused
                  ? 'border-red-500/40 bg-red-500/15 text-red-600!'
                  : s.signed
                    ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-600!'
                    : 'border-stone-400/40 bg-stone-500/10 text-stone-500'
              }`}
            >
              {s.refused ? '✕' : s.signed ? '✓' : '…'} {s.papel}
            </span>
          ))}
        </div>
      )}
      {refused.length > 0 && sig.status === 'running' && (
        <div className="text-[10px] text-red-600 font-bold flex items-center gap-1">
          <AlertTriangle size={11} /> Recusado por {refused.map((r) => r.name).join(', ')}
        </div>
      )}
      {sig.status === 'closed' && sig.archiveError && !sig.signedPdfUrl && (
        <div className="text-[10px] text-amber-700">Cópia no HUB pendente ({sig.archiveError}) — o PDF assinado continua disponível para download.</div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Confirmação de envio
// ---------------------------------------------------------------------------

interface Preview {
  environment: 'sandbox' | 'production';
  deadlineDays: number;
  authMethod: string;
  signers: { papel: string; name: string; email: string; cpf: string | null; fonte: string | null }[];
  errors: string[];
  warnings: string[];
}

export const SendSignatureModal: React.FC<{
  contract: Contract;
  project?: Project;
  onClose: () => void;
  onSent: () => void;
}> = ({ contract, project, onClose, onSent }) => {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loadError, setLoadError] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');

  useEffect(() => {
    let alive = true;
    apiSend(`/api/contracts/${encodeURIComponent(contract.id)}/signature/preview`, 'POST', {})
      .then((p) => { if (alive) setPreview(p); })
      .catch((e) => { if (alive) setLoadError(errMsg(e, 'Não foi possível preparar o envio.')); });
    return () => { alive = false; };
  }, [contract.id]);

  const blocked = !preview || preview.errors.length > 0;

  const handleSend = async () => {
    if (blocked || !confirmed) return;
    setSending(true);
    setSendError('');
    try {
      // O PDF é gerado aqui (mesmo motor do "Baixar PDF") e enviado ao servidor, que o repassa ao ClickSign.
      const doc = generateContractPdf(contract, project);
      const dataUri = doc.output('datauristring');
      const pdfBase64 = dataUri.slice(dataUri.indexOf('base64,') + 7);
      await apiSend(`/api/contracts/${encodeURIComponent(contract.id)}/signature/send`, 'POST', { pdfBase64 });
      onSent();
      onClose();
    } catch (e) {
      setSendError(errMsg(e, 'Falha ao enviar para assinatura.'));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-white w-full max-w-xl my-10 border-2 border-stone-900">
        <div className="flex items-center justify-between p-4 border-b border-stone-200 bg-stone-50">
          <h3 className="font-oswald uppercase tracking-wide text-stone-900 text-sm flex items-center gap-2">
            <Send size={14} className="text-[#FF5A35]" /> Enviar para assinatura — Contrato nº {String(contract.number).padStart(2, '0')}
          </h3>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-800 cursor-pointer"><X size={18} /></button>
        </div>

        <div className="p-5 space-y-4">
          {!preview && !loadError && (
            <div className="flex items-center gap-2 text-xs text-stone-500"><Loader2 size={14} className="animate-spin" /> Conferindo os dados…</div>
          )}
          {loadError && <div className="text-xs text-red-600 font-bold">{loadError}</div>}

          {preview && (
            <>
              <div className="flex items-center gap-2 text-[11px] text-stone-600">
                <EnvironmentBadge environment={preview.environment} />
                <span>Prazo para assinar: {preview.deadlineDays} dias • Autenticação por {preview.authMethod === 'email' ? 'e-mail' : preview.authMethod}</span>
              </div>
              {preview.environment === 'sandbox' && (
                <div className="text-[11px] bg-amber-50 border border-amber-200 text-amber-800 p-3">
                  Ambiente de teste do ClickSign: as assinaturas feitas aqui <strong>não têm validade jurídica</strong>. Troque para Produção em Configurar quando for usar de verdade.
                </div>
              )}

              <div>
                <div className={labelClass}>Quem vai receber o contrato por e-mail</div>
                <div className="border border-stone-200 divide-y divide-stone-100">
                  {preview.signers.length === 0 && <div className="p-3 text-xs text-stone-400">Nenhum signatário definido.</div>}
                  {preview.signers.map((s, i) => (
                    <div key={i} className="p-3 text-xs flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <span className="block font-bold text-stone-800 truncate">{s.name}</span>
                        <span className="block font-mono text-[11px] text-stone-500 truncate">{s.email}</span>
                        {s.fonte && <span className="block text-[10px] text-stone-500">{s.fonte}</span>}
                      </div>
                      <div className="text-right shrink-0">
                        <span className="block text-[10px] font-bold uppercase text-stone-500">{s.papel}</span>
                        <span className="block text-[10px] text-stone-500">{s.cpf ? `CPF ${s.cpf}` : 'sem conferência de CPF'}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {preview.errors.length > 0 && (
                <div className="bg-red-50 border border-red-200 p-3 space-y-1">
                  <div className="text-[10px] font-bold uppercase text-red-700 flex items-center gap-1"><AlertTriangle size={12} /> Corrija antes de enviar</div>
                  {preview.errors.map((e, i) => <div key={i} className="text-[11px] text-red-700">• {e}</div>)}
                </div>
              )}
              {preview.warnings.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 p-3 space-y-1">
                  <div className="text-[10px] font-bold uppercase text-amber-800">Atenção</div>
                  {preview.warnings.map((w, i) => <div key={i} className="text-[11px] text-amber-800">• {w}</div>)}
                </div>
              )}

              <button
                onClick={() => downloadContractPdf(contract, project)}
                className="flex items-center gap-2 text-[11px] font-bold text-stone-600 hover:text-[#FF5A35] cursor-pointer"
              >
                <Download size={13} /> <span className="text-stone-600">Baixar o PDF para conferir antes de enviar</span>
              </button>

              <label className="flex items-start gap-2 text-[11px] text-stone-700 cursor-pointer select-none">
                <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-0.5" disabled={blocked} />
                <span>Conferi o contrato e os signatários. Ao confirmar, cada pessoa acima recebe o documento por e-mail para assinar.</span>
              </label>
            </>
          )}

          {sendError && <div className="text-xs text-red-600 font-bold bg-red-50 border border-red-200 p-3">{sendError}</div>}
        </div>

        <div className="flex justify-end gap-2 p-4 border-t border-stone-200 bg-stone-50">
          <button onClick={onClose} className="px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-stone-500 hover:text-stone-800 cursor-pointer">Cancelar</button>
          <button
            onClick={handleSend}
            disabled={blocked || !confirmed || sending}
            className="flex items-center gap-2 bg-[#FF5A35] text-white px-4 py-2.5 text-xs font-bold uppercase tracking-wider hover:bg-[#e64d29] transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Enviar para assinatura
          </button>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Configuração
// ---------------------------------------------------------------------------

interface CsConfig {
  enabled: boolean;
  environment: 'sandbox' | 'production';
  clicksignAccessTokenMasked: string;
  clicksignAccessTokenSet: boolean;
  clicksignWebhookSecretSet: boolean;
  webhookId: string;
  webhookEndpoint: string;
  cbcSignerName: string;
  cbcSignerEmail: string;
  cbcSignerCpf: string;
  deadlineDays: number;
  remindInterval: string;
  authMethod: string;
}

export const SignatureConfigModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [cfg, setCfg] = useState<CsConfig | null>(null);
  const [token, setToken] = useState('');
  const [publicUrl, setPublicUrl] = useState(typeof window !== 'undefined' ? window.location.origin : '');
  const [busy, setBusy] = useState<'' | 'save' | 'test' | 'hook'>('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    apiGet('/api/clicksign/config')
      .then(setCfg)
      .catch((e) => setMsg({ ok: false, text: errMsg(e, 'Não foi possível carregar a configuração.') }));
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

  const set = <K extends keyof CsConfig>(k: K, v: CsConfig[K]) => setCfg({ ...cfg, [k]: v });

  const body = () => ({
    enabled: cfg.enabled,
    environment: cfg.environment,
    ...(token.trim() ? { clicksignAccessToken: token.trim() } : {}),
    cbcSignerName: cfg.cbcSignerName,
    cbcSignerEmail: cfg.cbcSignerEmail,
    cbcSignerCpf: cfg.cbcSignerCpf,
    deadlineDays: Number(cfg.deadlineDays) || 30,
    remindInterval: cfg.remindInterval,
    authMethod: cfg.authMethod,
  });

  const save = async (): Promise<boolean> => {
    try {
      const r = await apiSend('/api/clicksign/config', 'POST', body());
      setCfg(r.config);
      setToken('');
      return true;
    } catch (e) {
      setMsg({ ok: false, text: errMsg(e, 'Falha ao salvar.') });
      return false;
    }
  };

  const run = async (kind: 'save' | 'test' | 'hook') => {
    setBusy(kind);
    setMsg(null);
    try {
      if (!(await save())) return;
      if (kind === 'save') setMsg({ ok: true, text: 'Configuração salva.' });
      if (kind === 'test') {
        const r = await apiSend('/api/clicksign/test', 'POST', {});
        setMsg({ ok: true, text: `${r.message} (${r.environment === 'production' ? 'produção' : 'sandbox'})` });
      }
      if (kind === 'hook') {
        const r = await apiSend('/api/clicksign/register-webhook', 'POST', { publicUrl });
        setCfg(r.config);
        setMsg({ ok: true, text: `Webhook cadastrado: ${r.endpoint}` });
      }
    } catch (e) {
      setMsg({ ok: false, text: errMsg(e, 'Falha na operação.') });
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-white w-full max-w-xl my-8 border-2 border-stone-900">
        <div className="flex items-center justify-between p-4 border-b border-stone-200 bg-stone-50">
          <h3 className="font-oswald uppercase tracking-wide text-stone-900 text-sm flex items-center gap-2">
            <Settings size={14} className="text-[#FF5A35]" /> Assinatura eletrônica — ClickSign
          </h3>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-800 cursor-pointer"><X size={18} /></button>
        </div>

        <div className="p-5 space-y-5">
          <label className="flex items-center gap-2 text-xs font-bold text-stone-700 cursor-pointer">
            <input type="checkbox" checked={cfg.enabled} onChange={(e) => set('enabled', e.target.checked)} />
            <span className="text-stone-800">Assinatura eletrônica ativada</span>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Ambiente</label>
              <select className={inputClass} value={cfg.environment} onChange={(e) => set('environment', e.target.value as CsConfig['environment'])}>
                <option value="sandbox">Teste (sandbox)</option>
                <option value="production">Produção</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>Token de acesso {cfg.clicksignAccessTokenSet && <span className="text-emerald-600! normal-case">• salvo ({cfg.clicksignAccessTokenMasked})</span>}</label>
              <input
                type="password" autoComplete="off" className={inputClass} value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder={cfg.clicksignAccessTokenSet ? 'deixe vazio para manter' : 'cole o token do ClickSign'}
              />
            </div>
          </div>
          <p className="text-[10px] text-stone-400 -mt-3">
            No ClickSign: Configurações → API → Gerar Access Token. O token de teste e o de produção são diferentes — troque o ambiente junto com o token.
          </p>

          <div>
            <div className={labelClass}>Quem assina pela CBC (Contratada)</div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <input type="text" className={inputClass} placeholder="Nome completo" value={cfg.cbcSignerName} onChange={(e) => set('cbcSignerName', e.target.value)} />
              <input type="email" className={inputClass} placeholder="E-mail" value={cfg.cbcSignerEmail} onChange={(e) => set('cbcSignerEmail', e.target.value)} />
              <input type="text" className={inputClass} placeholder="CPF (opcional)" value={cfg.cbcSignerCpf} onChange={(e) => set('cbcSignerCpf', e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={labelClass}>Prazo (dias)</label>
              <input type="number" min={1} max={365} className={inputClass} value={cfg.deadlineDays} onChange={(e) => set('deadlineDays', Number(e.target.value))} />
            </div>
            <div>
              <label className={labelClass}>Lembrete a cada</label>
              <select className={inputClass} value={cfg.remindInterval} onChange={(e) => set('remindInterval', e.target.value)}>
                {['1', '2', '3', '7', '14'].map((d) => <option key={d} value={d}>{d} dia{d === '1' ? '' : 's'}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>Autenticação</label>
              <select className={inputClass} value={cfg.authMethod} onChange={(e) => set('authMethod', e.target.value)}>
                <option value="email">E-mail</option>
                <option value="sms">SMS</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="pix">Pix</option>
                <option value="selfie">Selfie</option>
                <option value="official_document">Documento oficial</option>
                <option value="icp_brasil">Certificado ICP-Brasil</option>
              </select>
            </div>
          </div>
          {['sms', 'whatsapp'].includes(cfg.authMethod) && (
            <p className="text-[10px] text-amber-700 -mt-3">SMS e WhatsApp exigem o telefone do signatário no cadastro — o HUB ainda não envia telefone ao ClickSign. Prefira e-mail por enquanto.</p>
          )}

          <div className="border border-stone-200 p-3 space-y-2 bg-stone-50">
            <div className={labelClass}>Aviso automático de assinatura (webhook)</div>
            <div className="flex items-start gap-1.5">
              {cfg.clicksignWebhookSecretSet && cfg.webhookId
                ? <><CheckCircle2 size={13} className="text-emerald-600 shrink-0 mt-0.5" /><span className="text-[11px] text-stone-600">Cadastrado: <span className="font-mono text-[10px] break-all">{cfg.webhookEndpoint}</span></span></>
                : <><AlertTriangle size={13} className="text-amber-600 shrink-0 mt-0.5" /><span className="text-[11px] text-stone-600">Ainda não cadastrado — sem ele o HUB só sabe das assinaturas ao clicar em “Atualizar status”.</span></>}
            </div>
            <div className="flex gap-2">
              <input type="text" className={inputClass} value={publicUrl} onChange={(e) => setPublicUrl(e.target.value)} placeholder="https://hub.chavesbritescorrea.cloud" />
              <button
                onClick={() => run('hook')} disabled={!!busy}
                className="shrink-0 px-3 text-[10px] font-bold uppercase tracking-wider border border-stone-300 hover:border-[#FF5A35] hover:text-[#FF5A35] cursor-pointer disabled:opacity-50"
              >
                {busy === 'hook' ? <Loader2 size={13} className="animate-spin" /> : 'Cadastrar'}
              </button>
            </div>
            <p className="text-[10px] text-stone-400">Use o endereço público do HUB (https). Salva a configuração antes de cadastrar.</p>
          </div>

          {msg && (
            <div className={`text-xs font-bold p-3 border ${msg.ok ? 'text-emerald-700 bg-emerald-50 border-emerald-200' : 'text-red-700 bg-red-50 border-red-200'}`}>{msg.text}</div>
          )}
        </div>

        <div className="flex justify-between gap-2 p-4 border-t border-stone-200 bg-stone-50">
          <button
            onClick={() => run('test')} disabled={!!busy}
            className="flex items-center gap-2 px-4 py-2.5 text-xs font-bold uppercase tracking-wider border border-stone-300 hover:border-[#FF5A35] hover:text-[#FF5A35] cursor-pointer disabled:opacity-50"
          >
            {busy === 'test' ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Testar conexão
          </button>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-stone-500 hover:text-stone-800 cursor-pointer">Fechar</button>
            <button
              onClick={() => run('save')} disabled={!!busy}
              className="flex items-center gap-2 bg-[#FF5A35] text-white px-4 py-2.5 text-xs font-bold uppercase tracking-wider hover:bg-[#e64d29] cursor-pointer disabled:opacity-50"
            >
              {busy === 'save' ? <Loader2 size={14} className="animate-spin" /> : null} Salvar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
