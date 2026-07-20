import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Bell, Check, CheckCheck, X } from 'lucide-react';
import { subscribeCollection, saveDoc } from '../lib/firebaseDb';
import { apiSend } from '../lib/apiClient';

export interface AppNotification {
  id: string;
  recipientUserId: string;
  actorUserId: string;
  actorName: string;
  actorRole: string;
  action: 'create' | 'update' | 'delete';
  collection: string;
  entityId: string;
  summary: string;
  read: boolean;
  createdAt: string; // ISO
}

const ACTION_DOT: Record<AppNotification['action'], string> = {
  create: 'bg-emerald-400',
  update: 'bg-blue-400',
  delete: 'bg-red-400',
};

function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'agora mesmo';
  if (diffMin < 60) return `há ${diffMin} min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `há ${diffH}h`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return `há ${diffD}d`;
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

export default function NotificationBell() {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsub = subscribeCollection('notifications', setNotifications, [], 'cbc_notifications');
    return () => unsub();
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const sorted = useMemo(
    () => [...notifications].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [notifications]
  );
  const unread = useMemo(() => sorted.filter(n => !n.read), [sorted]);

  const handleMarkOneRead = async (n: AppNotification) => {
    if (n.read) return;
    setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, read: true } : x));
    try {
      await saveDoc('notifications', n.id, { ...n, read: true });
    } catch { /* a próxima sincronização corrige se falhar */ }
  };

  const handleMarkAllRead = async () => {
    if (unread.length === 0) return;
    setNotifications(prev => prev.map(x => ({ ...x, read: true })));
    try {
      await apiSend('/api/notifications/mark-read', 'POST', {});
    } catch { /* a próxima sincronização corrige se falhar */ }
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setIsOpen(o => !o)}
        className="relative p-2 text-slate-400 hover:text-white hover:bg-white/5 rounded-full transition-all cursor-pointer"
        title="Notificações"
      >
        <Bell size={16} />
        {unread.length > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] px-1 bg-[#FF5A35] text-white text-[9px] font-bold rounded-full flex items-center justify-center border border-[#090D16]">
            {unread.length > 9 ? '9+' : unread.length}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 max-h-[420px] flex flex-col bg-[#0D1119] border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
            <span className="text-[10px] font-mono uppercase tracking-wider text-white font-bold">
              Notificações {unread.length > 0 && `(${unread.length})`}
            </span>
            <div className="flex items-center gap-2">
              {unread.length > 0 && (
                <button
                  onClick={handleMarkAllRead}
                  className="flex items-center gap-1 text-[9px] font-mono uppercase text-slate-400 hover:text-white cursor-pointer"
                  title="Marcar tudo como lido"
                >
                  <CheckCheck size={11} /> Marcar tudo
                </button>
              )}
              <button onClick={() => setIsOpen(false)} className="text-slate-500 hover:text-white cursor-pointer">
                <X size={13} />
              </button>
            </div>
          </div>

          <div className="overflow-y-auto flex-grow">
            {sorted.length === 0 ? (
              <div className="px-4 py-8 text-center text-[10px] text-slate-500 font-mono italic">
                Nenhuma notificação ainda.
              </div>
            ) : (
              sorted.slice(0, 50).map(n => (
                <button
                  key={n.id}
                  onClick={() => handleMarkOneRead(n)}
                  className={`w-full text-left px-4 py-3 border-b border-white/5 hover:bg-white/[0.03] transition-colors cursor-pointer flex items-start gap-2.5 ${
                    n.read ? 'opacity-60' : ''
                  }`}
                >
                  <span className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${n.read ? 'bg-transparent' : ACTION_DOT[n.action]}`} />
                  <div className="flex-grow min-w-0">
                    <p className="text-[11px] text-slate-200 leading-snug">{n.summary}</p>
                    <span className="text-[9px] font-mono text-slate-500">{formatRelativeTime(n.createdAt)}</span>
                  </div>
                  {n.read && <Check size={11} className="text-slate-600 shrink-0 mt-1" />}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
