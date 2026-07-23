import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Calendar, Plus, Trash2, Edit, X, Check, Clock, MapPin, Bell, BellOff,
  Phone, Save, AlertTriangle, CheckCircle2, ChevronDown, Send, Briefcase, User,
} from 'lucide-react';
import { Client } from '../types';
import { subscribeCollection, saveDoc, removeDoc } from '../lib/firebaseDb';
import { apiGet, apiSend } from '../lib/apiClient';
import {
  Appointment, ReminderRule, ReminderTemplate, AppointmentRecipient,
  BUILTIN_TEMPLATES, materializeReminders, describeRule,
  normalizePhoneBR, formatPhoneBR, utcToZonedParts, zonedWallTimeToUtc,
} from '../lib/agenda';

// O CRM do escritório chama isso de "negócio"; o tipo mora em OfficeManagement.
interface LeadRef {
  id: string;
  name: string;
  contactPerson?: string;
  phone?: string;
  status?: string;
}

interface AgendaProps {
  clients: Client[];
  leads: LeadRef[];
  currentUserId: string;
}

const uid = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

const pad = (n: number) => String(n).padStart(2, '0');

/** Instante UTC → valores dos inputs date/time, no fuso de São Paulo. */
function isoToFormFields(iso: string): { date: string; time: string } {
  const p = utcToZonedParts(new Date(iso));
  return {
    date: `${p.year}-${pad(p.month)}-${pad(p.day)}`,
    time: `${pad(p.hour)}:${pad(p.minute)}`,
  };
}

/** Valores dos inputs (hora de parede em SP) → instante UTC. */
function formFieldsToIso(date: string, time: string): string | null {
  if (!date || !time) return null;
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  if ([y, m, d, hh, mm].some((n) => !Number.isFinite(n))) return null;
  return zonedWallTimeToUtc(y, m, d, hh, mm).toISOString();
}

const EMPTY_FORM = {
  title: '',
  date: '',
  time: '',
  durationMin: 60,
  location: '',
  notes: '',
  linkType: 'none' as 'none' | 'client' | 'lead',
  linkId: '',
};

export default function Agenda({ clients, leads, currentUserId }: AgendaProps) {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [templates, setTemplates] = useState<ReminderTemplate[]>([]);
  const [defaultRecipient, setDefaultRecipient] = useState<AppointmentRecipient | null>(null);
  const [whatsappReady, setWhatsappReady] = useState<boolean | null>(null);
  const [whatsappProblem, setWhatsappProblem] = useState<string | null>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editing, setEditing] = useState<Appointment | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [rules, setRules] = useState<ReminderRule[]>([]);
  const [extraRecipients, setExtraRecipients] = useState<AppointmentRecipient[]>([]);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [showPast, setShowPast] = useState(false);
  const [toDelete, setToDelete] = useState<string | null>(null);
  const [saveTemplateName, setSaveTemplateName] = useState('');
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);

  // -------------------------------------------------------------------------
  // Carga
  // -------------------------------------------------------------------------

  useEffect(() => {
    const unsubAppts = subscribeCollection('appointments', setAppointments, [], 'cbc_appointments');
    const unsubTpls = subscribeCollection('reminder_templates', setTemplates, [], 'cbc_reminder_templates');
    return () => { unsubAppts?.(); unsubTpls?.(); };
  }, []);

  // Telefone padrão (o seu) e saúde da integração vêm da config do WhatsApp.
  const loadWhatsAppState = useCallback(async () => {
    try {
      const cfg: any = await apiGet('/api/whatsapp/config');
      if (cfg?.defaultRecipientPhone) {
        setDefaultRecipient({
          name: cfg.defaultRecipientName || 'Meu telefone',
          phone: cfg.defaultRecipientPhone,
          source: 'manual',
        });
      } else {
        setDefaultRecipient(null);
      }
      const status: any = await apiGet('/api/whatsapp/status');
      setWhatsappReady(!!status?.enabled && !!status?.configured && !status?.problem);
      setWhatsappProblem(status?.problem || null);
    } catch {
      setWhatsappReady(false);
      setWhatsappProblem('Não foi possível consultar a configuração do WhatsApp.');
    }
  }, []);

  useEffect(() => { void loadWhatsAppState(); }, [loadWhatsAppState]);

  // Semeia os modelos de fábrica na primeira vez que a tela abre.
  useEffect(() => {
    if (templates.length > 0) return;
    let cancelled = false;
    (async () => {
      for (const tpl of BUILTIN_TEMPLATES) {
        if (cancelled) return;
        try {
          await saveDoc('reminder_templates', tpl.id, { ...tpl, createdAt: new Date().toISOString() });
        } catch { /* já existe ou sem conexão — o polling reconcilia */ }
      }
    })();
    return () => { cancelled = true; };
  }, [templates.length]);

  // -------------------------------------------------------------------------
  // Derivados
  // -------------------------------------------------------------------------

  const { upcoming, past } = useMemo(() => {
    const now = Date.now();
    const sorted = [...appointments].sort(
      (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime()
    );
    return {
      upcoming: sorted.filter((a) => new Date(a.startAt).getTime() >= now && a.status !== 'cancelado'),
      past: sorted.filter((a) => new Date(a.startAt).getTime() < now || a.status === 'cancelado').reverse(),
    };
  }, [appointments]);

  const visible = showPast ? past : upcoming;

  /** Agrupa por dia local, para a lista virar uma linha do tempo legível. */
  const grouped = useMemo(() => {
    const map = new Map<string, Appointment[]>();
    for (const appt of visible) {
      const p = utcToZonedParts(new Date(appt.startAt));
      const key = `${p.year}-${pad(p.month)}-${pad(p.day)}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(appt);
    }
    return Array.from(map.entries());
  }, [visible]);

  const defaultTemplate = useMemo(
    () => templates.find((t) => t.isDefault) || templates[0],
    [templates]
  );

  // -------------------------------------------------------------------------
  // Modal
  // -------------------------------------------------------------------------

  const openNew = () => {
    const now = new Date();
    const p = utcToZonedParts(now);
    setEditing(null);
    setForm({
      ...EMPTY_FORM,
      date: `${p.year}-${pad(p.month)}-${pad(p.day)}`,
      time: '09:00',
    });
    setRules(defaultTemplate ? defaultTemplate.rules.map((r) => ({ ...r, id: uid('r') })) : []);
    setExtraRecipients([]);
    setFormError(null);
    setSaveTemplateName('');
    setIsModalOpen(true);
  };

  const openEdit = (appt: Appointment) => {
    const { date, time } = isoToFormFields(appt.startAt);
    setEditing(appt);
    setForm({
      title: appt.title,
      date, time,
      durationMin: appt.durationMin || 60,
      location: appt.location || '',
      notes: appt.notes || '',
      linkType: appt.clientId ? 'client' : appt.leadId ? 'lead' : 'none',
      linkId: appt.clientId || appt.leadId || '',
    });
    setRules(appt.reminders.map(({ fireAt, sentAt, attempts, lastError, skipped, ...rule }) => rule));
    // O destinatário padrão é reaplicado no save; aqui listamos só os extras.
    setExtraRecipients(
      (appt.recipients || []).filter((r) => !defaultRecipient || r.phone !== defaultRecipient.phone)
    );
    setFormError(null);
    setSaveTemplateName('');
    setIsModalOpen(true);
  };

  const applyTemplate = (tplId: string) => {
    const tpl = templates.find((t) => t.id === tplId);
    if (!tpl) return;
    setRules(tpl.rules.map((r) => ({ ...r, id: uid('r') })));
  };

  const addRule = (mode: 'clock' | 'offset') => {
    setRules((prev) => [
      ...prev,
      mode === 'clock'
        ? { id: uid('r'), mode: 'clock', daysBefore: 0, atTime: '07:00', channel: 'whatsapp' }
        : { id: uid('r'), mode: 'offset', minutesBefore: 60, channel: 'whatsapp' },
    ]);
  };

  const updateRule = (id: string, patch: Partial<ReminderRule>) => {
    setRules((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const handleSave = async () => {
    setFormError(null);

    if (!form.title.trim()) return setFormError('Dê um nome ao compromisso.');
    const startAt = formFieldsToIso(form.date, form.time);
    if (!startAt) return setFormError('Informe data e hora.');

    const recipients: AppointmentRecipient[] = [];
    if (defaultRecipient) recipients.push(defaultRecipient);
    for (const extra of extraRecipients) {
      const phone = normalizePhoneBR(extra.phone);
      if (!phone) return setFormError(`Telefone inválido: ${extra.phone}`);
      if (!recipients.some((r) => r.phone === phone)) recipients.push({ ...extra, phone });
    }
    if (recipients.length === 0 && rules.some((r) => r.channel === 'whatsapp')) {
      return setFormError('Nenhum telefone definido. Configure seu telefone em Configurações › WhatsApp.');
    }

    setSaving(true);
    try {
      const id = editing?.id || uid('appt');
      const appt: Appointment = {
        id,
        title: form.title.trim(),
        startAt,
        durationMin: Number(form.durationMin) || 60,
        location: form.location.trim() || undefined,
        notes: form.notes.trim() || undefined,
        clientId: form.linkType === 'client' ? form.linkId || null : null,
        leadId: form.linkType === 'lead' ? form.linkId || null : null,
        projectId: null,
        recipients,
        // Preserva o que já foi enviado ao remarcar.
        reminders: materializeReminders(rules, startAt, editing?.reminders || []),
        status: editing?.status || 'agendado',
        createdByUserId: editing?.createdByUserId || currentUserId,
        createdAt: editing?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await saveDoc('appointments', id, appt);
      setIsModalOpen(false);
    } catch (e: any) {
      setFormError(e?.message || 'Não foi possível salvar.');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveTemplate = async () => {
    const name = saveTemplateName.trim();
    if (!name || rules.length === 0) return;
    setIsSavingTemplate(true);
    try {
      const id = uid('tpl');
      await saveDoc('reminder_templates', id, {
        id, name,
        rules: rules.map((r) => ({ ...r })),
        createdAt: new Date().toISOString(),
        createdByUserId: currentUserId,
      });
      setSaveTemplateName('');
    } finally {
      setIsSavingTemplate(false);
    }
  };

  const handleDelete = async () => {
    if (!toDelete) return;
    await removeDoc('appointments', toDelete);
    setToDelete(null);
  };

  const markStatus = async (appt: Appointment, status: Appointment['status']) => {
    await saveDoc('appointments', appt.id, { ...appt, status, updatedAt: new Date().toISOString() });
  };

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  const linkLabel = (appt: Appointment): string | null => {
    if (appt.clientId) return clients.find((c) => c.id === appt.clientId)?.name || null;
    if (appt.leadId) return leads.find((l) => l.id === appt.leadId)?.name || null;
    return null;
  };

  const dayHeading = (key: string) => {
    const [y, m, d] = key.split('-').map(Number);
    const today = utcToZonedParts(new Date());
    const dayIdx = (yy: number, mm: number, dd: number) => Math.floor(Date.UTC(yy, mm - 1, dd) / 86400000);
    const delta = dayIdx(y, m, d) - dayIdx(today.year, today.month, today.day);
    const weekday = new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('pt-BR', {
      weekday: 'long', timeZone: 'UTC',
    });
    const label = `${pad(d)}/${pad(m)}/${y}`;
    if (delta === 0) return { label, tag: 'Hoje', weekday };
    if (delta === 1) return { label, tag: 'Amanhã', weekday };
    return { label, tag: null, weekday };
  };

  return (
    <div className="space-y-5 animate-fadeIn">

      {/* Aviso de integração fora do ar — o usuário precisa descobrir aqui,
          não pela reunião que ele perdeu. */}
      {whatsappReady === false && (
        <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 px-3.5 py-2.5">
          <AlertTriangle size={14} className="text-amber-600 mt-0.5 shrink-0" />
          <div className="text-xs text-amber-900 leading-relaxed">
            <span className="font-bold">Os lembretes não estão saindo. </span>
            {whatsappProblem || 'A integração de WhatsApp não está configurada.'}
            <span className="block text-amber-700 mt-0.5">
              Os compromissos continuam sendo salvos normalmente.
            </span>
          </div>
        </div>
      )}

      {/* Barra de ações */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 bg-stone-100 p-1 border border-stone-200 w-fit">
          <button
            type="button"
            onClick={() => setShowPast(false)}
            className={`px-3 py-1.5 text-xs font-mono font-bold uppercase transition-all cursor-pointer ${
              !showPast ? 'bg-white text-stone-900 border border-stone-200 shadow-sm' : 'text-stone-500 hover:text-stone-900'
            }`}
          >
            Próximos ({upcoming.length})
          </button>
          <button
            type="button"
            onClick={() => setShowPast(true)}
            className={`px-3 py-1.5 text-xs font-mono font-bold uppercase transition-all cursor-pointer ${
              showPast ? 'bg-white text-stone-900 border border-stone-200 shadow-sm' : 'text-stone-500 hover:text-stone-900'
            }`}
          >
            Histórico ({past.length})
          </button>
        </div>

        <button
          type="button"
          onClick={openNew}
          className="flex items-center justify-center gap-1.5 bg-stone-900 hover:bg-stone-700 text-white px-4 py-2 text-xs font-mono font-bold uppercase tracking-wider transition-all cursor-pointer"
        >
          <Plus size={13} />
          <span>Novo Compromisso</span>
        </button>
      </div>

      {/* Lista */}
      {grouped.length === 0 ? (
        <div className="border-2 border-dashed border-stone-300 bg-[#FAF9F6] py-14 px-6 text-center">
          <Calendar size={22} className="text-stone-400 mx-auto mb-2.5" />
          <p className="font-serif text-base text-stone-800 mb-1">
            {showPast ? 'Nenhum compromisso no histórico' : 'Nenhum compromisso agendado'}
          </p>
          <p className="text-xs text-stone-500 max-w-sm mx-auto leading-relaxed">
            {showPast
              ? 'Compromissos que já aconteceram aparecem aqui.'
              : 'Agende uma reunião e receba o aviso no WhatsApp na manhã do dia e uma hora antes.'}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map(([dayKey, items]) => {
            const head = dayHeading(dayKey);
            return (
              <div key={dayKey}>
                <div className="flex items-baseline gap-2 border-b border-stone-200 pb-1.5 mb-2.5">
                  <span className="font-mono text-xs font-bold text-stone-900">{head.label}</span>
                  {head.tag && (
                    <span className="bg-stone-900 text-white font-mono text-[9px] px-1.5 py-0.5 uppercase font-bold tracking-wider">
                      {head.tag}
                    </span>
                  )}
                  <span className="text-[10px] text-stone-500 capitalize">{head.weekday}</span>
                </div>

                <div className="space-y-2">
                  {items.map((appt) => {
                    const { time } = isoToFormFields(appt.startAt);
                    const link = linkLabel(appt);
                    const sent = appt.reminders.filter((r) => r.sentAt).length;
                    const failed = appt.reminders.filter((r) => r.skipped && !r.sentAt).length;
                    const cancelled = appt.status === 'cancelado';

                    return (
                      <div
                        key={appt.id}
                        className={`bg-white border border-stone-200 hover:border-stone-400 transition-all p-3.5 group ${
                          cancelled ? 'opacity-50' : ''
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-3 min-w-0">
                            <div className="font-mono text-sm font-bold text-stone-900 tabular-nums pt-0.5 shrink-0">
                              {time}
                            </div>
                            <div className="min-w-0">
                              <h4 className={`font-serif text-sm text-stone-900 font-semibold leading-snug ${
                                cancelled ? 'line-through' : ''
                              }`}>
                                {appt.title}
                              </h4>
                              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
                                {appt.location && (
                                  <span className="flex items-center gap-1 text-[11px] text-stone-500">
                                    <MapPin size={10} /> {appt.location}
                                  </span>
                                )}
                                {link && (
                                  <span className="flex items-center gap-1 text-[11px] text-stone-500">
                                    {appt.clientId ? <User size={10} /> : <Briefcase size={10} />} {link}
                                  </span>
                                )}
                                <span className="flex items-center gap-1 text-[11px] text-stone-400">
                                  <Clock size={10} /> {appt.durationMin} min
                                </span>
                              </div>

                              {/* Estado dos lembretes */}
                              <div className="flex flex-wrap items-center gap-1.5 mt-2">
                                {appt.reminders.length === 0 && (
                                  <span className="flex items-center gap-1 text-[10px] font-mono uppercase text-stone-400 border border-stone-200 px-1.5 py-0.5">
                                    <BellOff size={9} /> Sem lembrete
                                  </span>
                                )}
                                {appt.reminders.map((r) => {
                                  const state = r.sentAt ? 'sent' : r.skipped ? 'failed' : 'pending';
                                  const style =
                                    state === 'sent' ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                    : state === 'failed' ? 'bg-rose-50 text-rose-700 border-rose-200'
                                    : 'bg-stone-50 text-stone-600 border-stone-200';
                                  return (
                                    <span
                                      key={r.id}
                                      title={r.lastError || (r.sentAt ? `Enviado em ${new Date(r.sentAt).toLocaleString('pt-BR')}` : 'Aguardando')}
                                      className={`flex items-center gap-1 text-[10px] font-mono uppercase border px-1.5 py-0.5 ${style}`}
                                    >
                                      {state === 'sent' ? <CheckCircle2 size={9} />
                                        : state === 'failed' ? <AlertTriangle size={9} />
                                        : <Bell size={9} />}
                                      {describeRule(r)}
                                    </span>
                                  );
                                })}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                            {!showPast && !cancelled && (
                              <button
                                type="button"
                                title="Marcar como realizado"
                                onClick={() => markStatus(appt, 'realizado')}
                                className="p-1.5 text-stone-400 hover:text-emerald-600 cursor-pointer"
                              >
                                <Check size={13} />
                              </button>
                            )}
                            <button
                              type="button"
                              title="Editar"
                              onClick={() => openEdit(appt)}
                              className="p-1.5 text-stone-400 hover:text-stone-900 cursor-pointer"
                            >
                              <Edit size={13} />
                            </button>
                            <button
                              type="button"
                              title="Excluir"
                              onClick={() => setToDelete(appt.id)}
                              className="p-1.5 text-stone-400 hover:text-rose-600 cursor-pointer"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>

                        {(sent > 0 || failed > 0) && showPast && (
                          <div className="mt-2 pt-2 border-t border-stone-100 text-[10px] font-mono text-stone-400 uppercase">
                            {sent} lembrete(s) enviado(s){failed > 0 ? ` · ${failed} falhou` : ''}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Modal de compromisso                                                */}
      {/* ------------------------------------------------------------------ */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn print:hidden">
          <div className="bg-white border border-stone-300 w-full max-w-2xl max-h-[92vh] overflow-y-auto shadow-2xl">

            <div className="flex items-center justify-between border-b border-stone-200 px-5 py-3.5 sticky top-0 bg-white z-10">
              <h3 className="font-serif text-base text-stone-900 font-semibold">
                {editing ? 'Editar compromisso' : 'Novo compromisso'}
              </h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1 text-stone-400 hover:text-stone-900 cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-5 space-y-5">

              {/* O quê */}
              <div>
                <label className="block text-[10px] font-mono font-bold uppercase tracking-wider text-stone-500 mb-1">
                  Compromisso
                </label>
                <input
                  type="text"
                  value={form.title}
                  autoFocus
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="Reunião com o cliente sobre o projeto"
                  className="w-full border border-stone-300 px-3 py-2 text-sm text-stone-900 focus:outline-none focus:border-stone-900"
                />
              </div>

              {/* Quando */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="col-span-1 sm:col-span-2">
                  <label className="block text-[10px] font-mono font-bold uppercase tracking-wider text-stone-500 mb-1">
                    Data
                  </label>
                  <input
                    type="date"
                    value={form.date}
                    onChange={(e) => setForm({ ...form, date: e.target.value })}
                    className="w-full border border-stone-300 px-3 py-2 text-sm text-stone-900 focus:outline-none focus:border-stone-900"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-mono font-bold uppercase tracking-wider text-stone-500 mb-1">
                    Hora
                  </label>
                  <input
                    type="time"
                    value={form.time}
                    onChange={(e) => setForm({ ...form, time: e.target.value })}
                    className="w-full border border-stone-300 px-3 py-2 text-sm text-stone-900 focus:outline-none focus:border-stone-900"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-mono font-bold uppercase tracking-wider text-stone-500 mb-1">
                    Duração
                  </label>
                  <select
                    value={form.durationMin}
                    onChange={(e) => setForm({ ...form, durationMin: Number(e.target.value) })}
                    className="w-full border border-stone-300 px-2 py-2 text-sm text-stone-900 bg-white focus:outline-none focus:border-stone-900 cursor-pointer"
                  >
                    {[15, 30, 45, 60, 90, 120, 180, 240, 480].map((m) => (
                      <option key={m} value={m}>{m >= 60 ? `${m / 60}h` : `${m} min`}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Onde e com quem */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-mono font-bold uppercase tracking-wider text-stone-500 mb-1">
                    Local <span className="text-stone-400 font-normal normal-case">(opcional)</span>
                  </label>
                  <input
                    type="text"
                    value={form.location}
                    onChange={(e) => setForm({ ...form, location: e.target.value })}
                    placeholder="Escritório, obra, videochamada…"
                    className="w-full border border-stone-300 px-3 py-2 text-sm text-stone-900 focus:outline-none focus:border-stone-900"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-mono font-bold uppercase tracking-wider text-stone-500 mb-1">
                    Vincular a <span className="text-stone-400 font-normal normal-case">(opcional)</span>
                  </label>
                  <div className="flex gap-2">
                    <select
                      value={form.linkType}
                      onChange={(e) => setForm({ ...form, linkType: e.target.value as any, linkId: '' })}
                      className="border border-stone-300 px-2 py-2 text-xs text-stone-900 bg-white focus:outline-none focus:border-stone-900 cursor-pointer"
                    >
                      <option value="none">—</option>
                      <option value="client">Cliente</option>
                      <option value="lead">Negócio</option>
                    </select>
                    {form.linkType !== 'none' && (
                      <select
                        value={form.linkId}
                        onChange={(e) => setForm({ ...form, linkId: e.target.value })}
                        className="flex-1 min-w-0 border border-stone-300 px-2 py-2 text-xs text-stone-900 bg-white focus:outline-none focus:border-stone-900 cursor-pointer"
                      >
                        <option value="">Selecione…</option>
                        {(form.linkType === 'client' ? clients : leads).map((item: any) => (
                          <option key={item.id} value={item.id}>{item.name}</option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-mono font-bold uppercase tracking-wider text-stone-500 mb-1">
                  Observações <span className="text-stone-400 font-normal normal-case">(entram na mensagem)</span>
                </label>
                <textarea
                  rows={2}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="Levar a planta impressa"
                  className="w-full border border-stone-300 px-3 py-2 text-sm text-stone-900 focus:outline-none focus:border-stone-900 resize-none"
                />
              </div>

              {/* ---------------- Lembretes ---------------- */}
              <div className="border-t border-stone-200 pt-4">
                <div className="flex items-center justify-between mb-2.5">
                  <div>
                    <h4 className="font-mono text-[10px] font-bold uppercase tracking-wider text-stone-900">
                      Lembretes
                    </h4>
                    <p className="text-[11px] text-stone-500 mt-0.5">
                      {defaultRecipient
                        ? <>Enviados para <span className="font-mono text-stone-700">{formatPhoneBR(defaultRecipient.phone)}</span></>
                        : <span className="text-amber-700">Configure seu telefone em Configurações › WhatsApp</span>}
                    </p>
                  </div>
                  {templates.length > 0 && (
                    <div className="relative">
                      <select
                        value=""
                        onChange={(e) => e.target.value && applyTemplate(e.target.value)}
                        className="appearance-none border border-stone-300 pl-2.5 pr-7 py-1.5 text-[10px] font-mono font-bold uppercase text-stone-700 bg-white focus:outline-none focus:border-stone-900 cursor-pointer"
                      >
                        <option value="">Usar modelo…</option>
                        {templates.map((t) => (
                          <option key={t.id} value={t.id}>{t.name}</option>
                        ))}
                      </select>
                      <ChevronDown size={11} className="absolute right-2 top-1/2 -translate-y-1/2 text-stone-400 pointer-events-none" />
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  {rules.map((rule) => (
                    <div key={rule.id} className="flex items-center gap-2 bg-[#FAF9F6] border border-stone-200 px-2.5 py-2">
                      <Bell size={12} className="text-stone-400 shrink-0" />

                      {rule.mode === 'clock' ? (
                        <>
                          <select
                            value={rule.daysBefore ?? 0}
                            onChange={(e) => updateRule(rule.id, { daysBefore: Number(e.target.value) })}
                            className="border border-stone-300 px-1.5 py-1 text-xs bg-white focus:outline-none focus:border-stone-900 cursor-pointer"
                          >
                            <option value={0}>No dia</option>
                            <option value={1}>Na véspera</option>
                            <option value={2}>2 dias antes</option>
                            <option value={7}>1 semana antes</option>
                          </select>
                          <span className="text-xs text-stone-500">às</span>
                          <input
                            type="time"
                            value={rule.atTime ?? '07:00'}
                            onChange={(e) => updateRule(rule.id, { atTime: e.target.value })}
                            className="border border-stone-300 px-1.5 py-1 text-xs focus:outline-none focus:border-stone-900"
                          />
                        </>
                      ) : (
                        <>
                          <select
                            value={rule.minutesBefore ?? 60}
                            onChange={(e) => updateRule(rule.id, { minutesBefore: Number(e.target.value) })}
                            className="border border-stone-300 px-1.5 py-1 text-xs bg-white focus:outline-none focus:border-stone-900 cursor-pointer"
                          >
                            {[5, 10, 15, 30, 45, 60, 90, 120, 180, 240].map((m) => (
                              <option key={m} value={m}>{m >= 60 ? `${m / 60}h` : `${m} min`}</option>
                            ))}
                          </select>
                          <span className="text-xs text-stone-500">antes do compromisso</span>
                        </>
                      )}

                      <div className="flex-1" />

                      <select
                        value={rule.channel}
                        onChange={(e) => updateRule(rule.id, { channel: e.target.value as any })}
                        className="border border-stone-300 px-1.5 py-1 text-[10px] font-mono uppercase bg-white focus:outline-none focus:border-stone-900 cursor-pointer"
                      >
                        <option value="whatsapp">WhatsApp</option>
                        <option value="telegram">Telegram</option>
                      </select>

                      <button
                        type="button"
                        onClick={() => setRules((prev) => prev.filter((r) => r.id !== rule.id))}
                        className="p-1 text-stone-400 hover:text-rose-600 cursor-pointer"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>

                <div className="flex flex-wrap gap-2 mt-2.5">
                  <button
                    type="button"
                    onClick={() => addRule('clock')}
                    className="flex items-center gap-1 border border-stone-300 hover:border-stone-900 px-2.5 py-1.5 text-[10px] font-mono font-bold uppercase text-stone-700 cursor-pointer transition-all"
                  >
                    <Plus size={10} /> Horário fixo
                  </button>
                  <button
                    type="button"
                    onClick={() => addRule('offset')}
                    className="flex items-center gap-1 border border-stone-300 hover:border-stone-900 px-2.5 py-1.5 text-[10px] font-mono font-bold uppercase text-stone-700 cursor-pointer transition-all"
                  >
                    <Plus size={10} /> Tempo antes
                  </button>
                </div>

                {/* Salvar como modelo */}
                {rules.length > 0 && (
                  <div className="flex gap-2 mt-3 pt-3 border-t border-stone-100">
                    <input
                      type="text"
                      value={saveTemplateName}
                      onChange={(e) => setSaveTemplateName(e.target.value)}
                      placeholder="Salvar esta combinação como modelo"
                      className="flex-1 border border-stone-300 px-2.5 py-1.5 text-xs focus:outline-none focus:border-stone-900"
                    />
                    <button
                      type="button"
                      disabled={!saveTemplateName.trim() || isSavingTemplate}
                      onClick={handleSaveTemplate}
                      className="flex items-center gap-1 border border-stone-300 hover:border-stone-900 disabled:opacity-40 disabled:cursor-not-allowed px-2.5 py-1.5 text-[10px] font-mono font-bold uppercase text-stone-700 cursor-pointer transition-all"
                    >
                      <Save size={10} /> Salvar modelo
                    </button>
                  </div>
                )}
              </div>

              {/* Destinatários extras */}
              <div className="border-t border-stone-200 pt-4">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-mono text-[10px] font-bold uppercase tracking-wider text-stone-900">
                    Avisar também
                  </h4>
                  <button
                    type="button"
                    onClick={() => setExtraRecipients((p) => [...p, { name: '', phone: '', source: 'manual' }])}
                    className="flex items-center gap-1 text-[10px] font-mono font-bold uppercase text-stone-500 hover:text-stone-900 cursor-pointer"
                  >
                    <Plus size={10} /> Adicionar
                  </button>
                </div>

                {extraRecipients.length === 0 ? (
                  <p className="text-[11px] text-stone-400">
                    Só você recebe. Adicione alguém se quiser que a pessoa também seja avisada.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {extraRecipients.map((r, i) => (
                      <div key={i} className="flex gap-2 items-center">
                        <input
                          type="text"
                          value={r.name}
                          onChange={(e) => setExtraRecipients((p) => p.map((x, j) => j === i ? { ...x, name: e.target.value } : x))}
                          placeholder="Nome"
                          className="flex-1 min-w-0 border border-stone-300 px-2.5 py-1.5 text-xs focus:outline-none focus:border-stone-900"
                        />
                        <input
                          type="tel"
                          value={r.phone}
                          onChange={(e) => setExtraRecipients((p) => p.map((x, j) => j === i ? { ...x, phone: e.target.value } : x))}
                          placeholder="(44) 99999-8888"
                          className="w-40 border border-stone-300 px-2.5 py-1.5 text-xs font-mono focus:outline-none focus:border-stone-900"
                        />
                        {/* Preenche o telefone a partir do cliente/negócio vinculado. */}
                        <button
                          type="button"
                          title="Usar o telefone do vínculo"
                          disabled={form.linkType === 'none' || !form.linkId}
                          onClick={() => {
                            const src: any = form.linkType === 'client'
                              ? clients.find((c) => c.id === form.linkId)
                              : leads.find((l) => l.id === form.linkId);
                            if (!src) return;
                            setExtraRecipients((p) => p.map((x, j) => j === i
                              ? { ...x, name: src.contactPerson || src.name || x.name, phone: src.phone || x.phone, source: form.linkType as any }
                              : x));
                          }}
                          className="p-1.5 text-stone-400 hover:text-stone-900 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                        >
                          <Phone size={12} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setExtraRecipients((p) => p.filter((_, j) => j !== i))}
                          className="p-1.5 text-stone-400 hover:text-rose-600 cursor-pointer"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {formError && (
                <div className="flex items-start gap-2 bg-rose-50 border border-rose-200 px-3 py-2">
                  <AlertTriangle size={13} className="text-rose-600 mt-0.5 shrink-0" />
                  <p className="text-xs text-rose-800">{formError}</p>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 border-t border-stone-200 px-5 py-3.5 sticky bottom-0 bg-white">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 text-xs font-mono font-bold uppercase tracking-wider text-stone-500 hover:text-stone-900 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={handleSave}
                className="flex items-center gap-1.5 bg-stone-900 hover:bg-stone-700 disabled:opacity-50 text-white px-4 py-2 text-xs font-mono font-bold uppercase tracking-wider transition-all cursor-pointer"
              >
                <Send size={12} />
                {saving ? 'Salvando…' : editing ? 'Salvar alterações' : 'Agendar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmação de exclusão */}
      {toDelete && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-[60] animate-fadeIn print:hidden">
          <div className="bg-white border border-stone-300 w-full max-w-sm p-5 shadow-2xl">
            <h3 className="font-serif text-base text-stone-900 font-semibold mb-1.5">Excluir compromisso</h3>
            <p className="text-xs text-stone-600 leading-relaxed mb-4">
              O compromisso e os lembretes que ainda não foram enviados serão removidos.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setToDelete(null)}
                className="px-3.5 py-2 text-xs font-mono font-bold uppercase text-stone-500 hover:text-stone-900 cursor-pointer"
              >
                Manter
              </button>
              <button
                type="button"
                onClick={handleDelete}
                className="bg-rose-600 hover:bg-rose-700 text-white px-3.5 py-2 text-xs font-mono font-bold uppercase cursor-pointer transition-all"
              >
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
