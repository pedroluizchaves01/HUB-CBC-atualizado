// src/components/ui/Input.tsx
// Campo de formulário compartilhado: label + controle + texto de ajuda/erro,
// sempre no mesmo espaçamento e tamanho de texto (--ui-text-*), em qualquer
// área do sistema. Inclui variantes Select e Textarea com a mesma casca.
import React from 'react';

interface FieldWrapperProps {
  label?: string;
  helper?: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
}

function FieldWrapper({ label, helper, error, required, children }: FieldWrapperProps) {
  return (
    <div className="ui-field">
      {label && <label className="ui-label">{label}{required ? ' *' : ''}</label>}
      {children}
      {error ? <span className="ui-error-text">{error}</span> : helper ? <span className="ui-helper">{helper}</span> : null}
    </div>
  );
}

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  helper?: string;
  error?: string;
}
export function Input({ label, helper, error, className = '', required, ...rest }: InputProps) {
  return (
    <FieldWrapper label={label} helper={helper} error={error} required={required}>
      <input className={`ui-input ${error ? 'ui-input-error' : ''} ${className}`} required={required} {...rest} />
    </FieldWrapper>
  );
}

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  helper?: string;
  error?: string;
}
export function Select({ label, helper, error, className = '', children, required, ...rest }: SelectProps) {
  return (
    <FieldWrapper label={label} helper={helper} error={error} required={required}>
      <select className={`ui-select ${error ? 'ui-input-error' : ''} ${className}`} required={required} {...rest}>
        {children}
      </select>
    </FieldWrapper>
  );
}

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  helper?: string;
  error?: string;
}
export function Textarea({ label, helper, error, className = '', required, ...rest }: TextareaProps) {
  return (
    <FieldWrapper label={label} helper={helper} error={error} required={required}>
      <textarea className={`ui-textarea ${error ? 'ui-input-error' : ''} ${className}`} required={required} {...rest} />
    </FieldWrapper>
  );
}

export default Input;
