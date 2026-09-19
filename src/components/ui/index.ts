// src/components/ui/index.ts
// Ponto único de importação da biblioteca compartilhada:
// import { Button, Card, Input, Select, Textarea, Badge, ConfirmDialog } from '../ui';
export { default as Button } from './Button';
export type { ButtonVariant, ButtonSize } from './Button';
export { default as Card } from './Card';
export { default as Input, Select, Textarea } from './Input';
export { default as Badge } from './Badge';
export type { BadgeTone } from './Badge';
export { default as ConfirmDialog } from './ConfirmDialog';
