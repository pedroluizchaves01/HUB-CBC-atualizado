// src/components/ui/Badge.tsx
// Chip de status compartilhado. As cores (ok/warn/danger/mute) são
// SEMÂNTICAS — sucesso é sempre verde, atenção é sempre âmbar, em
// qualquer área do sistema, porque não fazem parte da identidade de
// marca (diferente do botão primário, que usa a cor de cada área).
import React from 'react';

export type BadgeTone = 'ok' | 'warn' | 'danger' | 'mute' | 'accent';

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
}

export default function Badge({ tone = 'mute', className = '', children, ...rest }: BadgeProps) {
  return (
    <span className={`ui-badge ui-badge-${tone} ${className}`} {...rest}>
      {children}
    </span>
  );
}
