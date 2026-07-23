import React, { useState, useEffect, useCallback } from 'react';
import {
  MessageCircle, Save, Send, CheckCircle2, AlertTriangle, Loader2,
  RefreshCw, Smartphone, ShieldCheck, Info,
} from 'lucide-react';
import { apiGet, apiSend } from '../lib/apiClient';
import { formatPhoneBR } from '../lib/agenda';

type Provider = 'none' | 'evolution' | 'cloud' | 'twilio';

interface Status {
  provider: Provider;
  enabled: boolean;
  configured: boolean;
  connection?: string;
  problem?: string;
}

const PROVIDERS: Array<{ id: Provider; label: string; blurb: string }> = [
  { id: 'none', label: 'Desligado', blurb: 'Compromissos continuam sendo salvos, mas nenhum aviso é enviado.' },
  { id: 'evolution', label: 'Evolution API', blurb: 'Servidor próprio, pareado por QR code. Grátis, mas depende de um celular ligado.' },
  { id: 'cloud', label: 'Cloud API (Meta)', blurb: 'Integração oficial. Não depende de celular e não corre risco de bloqueio.' },
  { id: 'twilio', label: 'Twilio', blurb: 'Intermediário da API oficial, com ambiente de teste rápido.' },
];

export default function WhatsAppSettings() {
  const [cfg, setCfg] = useState<any>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(false);
  const [testing, setTesting] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await apiGet('/api/whatsapp/config');
      setCfg({
        ...data,
        evolutionApiKey: data.evolutionApiKeyMasked || '',
        cloudAccessToken: data.cloudAccessTokenMasked || '',
        twilioAuthToken: data.twilioAuthTokenMasked || '',
      });
    } catch (e: any) {
      setFeedback({ kind: 'error', text: e?.message || 'Não foi possível carregar a configuração.' });
    } finally {
      setLoading(false);
    }
  }, []);

  const checkStatus = useCallback(async () => {
    setChecking(true);
    try {
      setStatus(await apiGet('/api/whatsapp/status'));
    } catch {
      setStatus(null);
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => { void load(); void checkStatus(); }, [load, checkStatus]);

  const set = (patch: Record<string, unknown>) => setCfg((c: any) => ({ ...c, ...patch }));

  const handleSave = async () => {
    setSaving(true);
    setFeedback(null);
    try {
      await apiSend('/api/whatsapp/config', 'POST', cfg);
      setFeedback({ kind: 'ok', text: 'Configuração salva.' });
      await load();
      await checkStatus();
    } catch (e: any) {
      setFeedback({ kind: 'error', text: e?.message || 'Não foi possível salvar.' });
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    if (!cfg?.defaultRecipientPhone) {
      setFeedback({ kind: 'error', text: 'Informe seu telefone antes de testar.' });
      return;
    }
    setTesting(true);
    setFeedback(null);
    try {
      await apiSend('/api/whatsapp/test', 'POST', { phone: cfg.defaultRecipientPhone });
      setFeedback({ kind: 'ok', text: 'Mensagem enviada. Confira o WhatsApp do seu telefone.' });
    } catch (e: any) {
      setFeedback({ kind: 'error', text: e?.message || 'A mensagem não foi enviada.' });
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-stone-500 text-xs font-mono uppercase py-10 justify-center">
        <Loader2 size={14} className="animate-spin" /> Carregando…
      </div>
    );
  }

  const provider: Provider = cfg?.provider || 'none';
  const inputCls = 'w-full border border-stone-300 px-3 py-2 text-sm text-stone-900 focus:outline-none focus:border-stone-900';
  const labelCls = 'block text-[10px] font-mono font-bold uppercase tracking-wider text-stone-500 mb-1';

  return (
    <div className="space-y-6 animate-fadeIn max-w-3xl">

      <div className="border-b border-stone-200 pb-4">
        <h3 className="font-serif text-lg text-stone-900 font-semibold flex items-center gap-2">
          <MessageCircle size={16} /> Lembretes por WhatsApp
        </h3>
        <p className="text-xs text-stone-500 mt-1 leading-relaxed">
          Define por onde os avisos da Agenda saem e para qual telefone eles chegam.
        </p>
      </div>

      {/* Estado atual */}
      <div className={`flex items-start justify-between gap-3 border px-3.5 py-3 ${
        status?.problem ? 'bg-amber-50 border-amber-200'
        : status?.configured && status?.enabled ? 'bg-emerald-50 border-emerald-200'
        : 'bg-stone-50 border-stone-200'
      }`}>
        <div className="flex items-start gap-2.5">
          {status?.problem
            ? <AlertTriangle size={14} className="text-amber-600 mt-0.5 shrink-0" />
            : status?.configured && status?.enabled
              ? <CheckCircle2 size={14} className="text-emerald-600 mt-0.5 shrink-0" />
              : <Info size={14} className="text-stone-400 mt-0.5 shrink-0" />}
          <div className="text-xs leading-relaxed">
            <span className="font-bold text-stone-900">
              {status?.problem ? 'Lembretes não estão saindo'
                : status?.configured && status?.enabled ? 'Tudo funcionando'
                : 'Não configurado'}
            </span>
            {status?.problem && <span className="block text-amber-900 mt-0.5">{status.problem}</span>}
            {status?.connection && (
              <span className="block text-stone-500 mt-0.5 font-mono text-[10px] uppercase">
                Instância: {status.connection}
              </span>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={checkStatus}
          disabled={checking}
          className="flex items-center gap-1 text-[10px] font-mono font-bold uppercase text-stone-500 hover:text-stone-900 cursor-pointer shrink-0"
        >
          <RefreshCw size={11} className={checking ? 'animate-spin' : ''} /> Verificar
        </button>
      </div>

      {/* Telefone que recebe */}
      <div className="border border-stone-200 bg-white p-4">
        <div className="flex items-center gap-2 mb-3">
          <Smartphone size={13} className="text-stone-400" />
          <h4 className="font-mono text-[10px] font-bold uppercase tracking-wider text-stone-900">
            Telefone que recebe os lembretes
          </h4>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="sm:col-span-2">
            <label className={labelCls}>Número</label>
            <input
              type="tel"
              value={cfg?.defaultRecipientPhone || ''}
              onChange={(e) => set({ defaultRecipientPhone: e.target.value })}
              placeholder="(44) 99999-8888"
              className={`${inputCls} font-mono`}
            />
            {cfg?.defaultRecipientPhone && /^\d{12,13}$/.test(cfg.defaultRecipientPhone) && (
              <p className="text-[10px] text-stone-400 mt-1 font-mono">
                {formatPhoneBR(cfg.defaultRecipientPhone)}
              </p>
            )}
          </div>
          <div>
            <label className={labelCls}>Como chamar</label>
            <input
              type="text"
              value={cfg?.defaultRecipientName || ''}
              onChange={(e) => set({ defaultRecipientName: e.target.value })}
              placeholder="Meu telefone"
              className={inputCls}
            />
          </div>
        </div>
        <p className="text-[11px] text-stone-500 mt-2 leading-relaxed">
          Todo compromisso novo já vem com este número preenchido. Este é o número que
          <span className="font-semibold"> recebe</span> — não tem relação com o número que envia.
        </p>
      </div>

      {/* Provedor */}
      <div className="border border-stone-200 bg-white p-4">
        <h4 className="font-mono text-[10px] font-bold uppercase tracking-wider text-stone-900 mb-3">
          Por onde enviar
        </h4>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
          {PROVIDERS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => set({ provider: p.id, enabled: p.id !== 'none' })}
              className={`text-left border p-3 transition-all cursor-pointer ${
                provider === p.id
                  ? 'border-stone-900 bg-[#FAF9F6]'
                  : 'border-stone-200 hover:border-stone-400'
              }`}
            >
              <div className="flex items-center gap-1.5">
                {provider === p.id && <CheckCircle2 size={11} className="text-stone-900" />}
                <span className="font-mono text-[11px] font-bold uppercase text-stone-900">{p.label}</span>
              </div>
              <p className="text-[11px] text-stone-500 mt-1 leading-snug">{p.blurb}</p>
            </button>
          ))}
        </div>

        {provider === 'evolution' && (
          <div className="space-y-3 border-t border-stone-100 pt-4">
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 px-3 py-2">
              <ShieldCheck size={13} className="text-amber-600 mt-0.5 shrink-0" />
              <p className="text-[11px] text-amber-900 leading-relaxed">
                Pareie um chip secundário, nunca o WhatsApp principal do escritório. E mantenha
                o celular ligado na tomada — se ele ficar dias fora do ar, a sessão cai e os
                lembretes param.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Endereço do servidor</label>
                <input type="text" value={cfg?.evolutionBaseUrl || ''}
                  onChange={(e) => set({ evolutionBaseUrl: e.target.value })}
                  placeholder="http://evolution-api:8080" className={`${inputCls} font-mono text-xs`} />
              </div>
              <div>
                <label className={labelCls}>Instância</label>
                <input type="text" value={cfg?.evolutionInstance || ''}
                  onChange={(e) => set({ evolutionInstance: e.target.value })}
                  placeholder="cbc" className={`${inputCls} font-mono text-xs`} />
              </div>
            </div>
            <div>
              <label className={labelCls}>Chave de acesso</label>
              <input type="password" value={cfg?.evolutionApiKey || ''}
                onChange={(e) => set({ evolutionApiKey: e.target.value })}
                className={`${inputCls} font-mono text-xs`} />
              <p className="text-[10px] text-stone-400 mt-1">
                Deixe como está para manter a chave atual.
              </p>
            </div>
          </div>
        )}

        {provider === 'cloud' && (
          <div className="space-y-3 border-t border-stone-100 pt-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Phone Number ID</label>
                <input type="text" value={cfg?.cloudPhoneNumberId || ''}
                  onChange={(e) => set({ cloudPhoneNumberId: e.target.value })}
                  className={`${inputCls} font-mono text-xs`} />
              </div>
              <div>
                <label className={labelCls}>Token de acesso</label>
                <input type="password" value={cfg?.cloudAccessToken || ''}
                  onChange={(e) => set({ cloudAccessToken: e.target.value })}
                  className={`${inputCls} font-mono text-xs`} />
              </div>
              <div>
                <label className={labelCls}>Nome do template</label>
                <input type="text" value={cfg?.cloudTemplateName || ''}
                  onChange={(e) => set({ cloudTemplateName: e.target.value })}
                  className={`${inputCls} font-mono text-xs`} />
              </div>
              <div>
                <label className={labelCls}>Idioma do template</label>
                <input type="text" value={cfg?.cloudTemplateLang || ''}
                  onChange={(e) => set({ cloudTemplateLang: e.target.value })}
                  placeholder="pt_BR" className={`${inputCls} font-mono text-xs`} />
              </div>
            </div>
            <p className="text-[11px] text-stone-500 leading-relaxed">
              Mensagens fora de uma conversa em andamento exigem um template aprovado pela Meta,
              na categoria utilidade. O texto do lembrete entra como o primeiro parâmetro do corpo.
            </p>
          </div>
        )}

        {provider === 'twilio' && (
          <div className="space-y-3 border-t border-stone-100 pt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Account SID</label>
              <input type="text" value={cfg?.twilioAccountSid || ''}
                onChange={(e) => set({ twilioAccountSid: e.target.value })}
                className={`${inputCls} font-mono text-xs`} />
            </div>
            <div>
              <label className={labelCls}>Auth Token</label>
              <input type="password" value={cfg?.twilioAuthToken || ''}
                onChange={(e) => set({ twilioAuthToken: e.target.value })}
                className={`${inputCls} font-mono text-xs`} />
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls}>Número de origem</label>
              <input type="text" value={cfg?.twilioFrom || ''}
                onChange={(e) => set({ twilioFrom: e.target.value })}
                placeholder="whatsapp:+14155238886" className={`${inputCls} font-mono text-xs`} />
            </div>
          </div>
        )}
      </div>

      {/* Modo de ensaio */}
      <label className="flex items-start gap-2.5 border border-stone-200 bg-white p-4 cursor-pointer">
        <input
          type="checkbox"
          checked={!!cfg?.dryRun}
          onChange={(e) => set({ dryRun: e.target.checked })}
          className="mt-0.5 cursor-pointer accent-stone-900"
        />
        <div>
          <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-stone-900">
            Modo de ensaio
          </span>
          <p className="text-[11px] text-stone-500 mt-1 leading-relaxed">
            A agenda funciona normalmente e as mensagens aparecem no log do servidor,
            mas nada é enviado. Bom para conferir os horários nos primeiros dias.
          </p>
        </div>
      </label>

      {feedback && (
        <div className={`flex items-start gap-2 border px-3 py-2 ${
          feedback.kind === 'ok' ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'
        }`}>
          {feedback.kind === 'ok'
            ? <CheckCircle2 size={13} className="text-emerald-600 mt-0.5 shrink-0" />
            : <AlertTriangle size={13} className="text-rose-600 mt-0.5 shrink-0" />}
          <p className={`text-xs ${feedback.kind === 'ok' ? 'text-emerald-800' : 'text-rose-800'}`}>
            {feedback.text}
          </p>
        </div>
      )}

      <div className="flex flex-wrap justify-end gap-2 border-t border-stone-200 pt-4">
        <button
          type="button"
          onClick={handleTest}
          disabled={testing || provider === 'none'}
          className="flex items-center gap-1.5 border border-stone-300 hover:border-stone-900 disabled:opacity-40 disabled:cursor-not-allowed px-4 py-2 text-xs font-mono font-bold uppercase tracking-wider text-stone-700 cursor-pointer transition-all"
        >
          {testing ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
          Enviar teste
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-1.5 bg-stone-900 hover:bg-stone-700 disabled:opacity-50 text-white px-4 py-2 text-xs font-mono font-bold uppercase tracking-wider transition-all cursor-pointer"
        >
          {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
          Salvar
        </button>
      </div>
    </div>
  );
}
