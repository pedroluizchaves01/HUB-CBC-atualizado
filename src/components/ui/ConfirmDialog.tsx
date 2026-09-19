// src/components/ui/ConfirmDialog.tsx
// Modal de confirmação compartilhado. Mesma API do ConfirmDialog que já
// existia isolado dentro de ProjectEnvironment.tsx — generalizado aqui
// para toda a aplicação, lendo os tokens do tema em que está encaixado.
// Fecha com Esc, trava o botão durante a ação (evita duplo clique).
import React, { useState, useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';
import Button from './Button';

interface ConfirmDialogProps {
  title: string;
  message: React.ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  variant?: 'default' | 'danger'; // 'danger' para ações destrutivas (excluir, remover)
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}

export default function ConfirmDialog({
  title, message, confirmLabel, cancelLabel = 'Cancelar', variant = 'default', onConfirm, onCancel,
}: ConfirmDialogProps) {
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel, busy]);

  const handleConfirm = async () => {
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ui-modal-backdrop" onClick={() => !busy && onCancel()}>
      <div className="ui-modal-card" onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <span
            className={variant === 'danger' ? 'ui-modal-icon-danger' : 'ui-modal-icon-warn'}
            style={{ width: 36, height: 36, borderRadius: 'var(--ui-radius-sm)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <AlertTriangle size={18} />
          </span>
          <h3 className="ui-modal-title">{title}</h3>
        </div>
        <p className="ui-modal-message">{message}</p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={busy}>{cancelLabel}</Button>
          <Button variant={variant === 'danger' ? 'danger' : 'primary'} size="sm" onClick={handleConfirm} loading={busy}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
