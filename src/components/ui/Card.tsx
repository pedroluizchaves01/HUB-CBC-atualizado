// src/components/ui/Card.tsx
// Card compartilhado — cantos arredondados, sombra suave, borda fina
// (estilo unificado). Cor de fundo/borda vem do tema (--ui-*).
import React from 'react';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: string;
  subtitle?: string;
  actions?: React.ReactNode; // botão(ões) no canto superior direito do header
  noPadding?: boolean; // para quando o conteúdo interno já controla seu próprio espaçamento (ex.: tabela)
}

export default function Card({ title, subtitle, actions, noPadding, className = '', children, style, ...rest }: CardProps) {
  const hasHeader = !!(title || subtitle || actions);
  return (
    <div
      className={`ui-card ${className}`}
      style={noPadding ? { ...style, padding: 0 } : style}
      {...rest}
    >
      {hasHeader && (
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 16, padding: noPadding ? 'var(--ui-space-5) var(--ui-space-5) 0' : 0 }}>
          <div>
            {title && <p className="ui-card-title">{title}</p>}
            {subtitle && <p className="ui-card-subtitle">{subtitle}</p>}
          </div>
          {actions && <div style={{ flexShrink: 0 }}>{actions}</div>}
        </div>
      )}
      {children}
    </div>
  );
}
