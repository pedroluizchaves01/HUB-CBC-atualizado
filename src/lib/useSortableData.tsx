// src/lib/useSortableData.tsx
//
// Hook reutilizável para ordenação de tabelas por clique no cabeçalho.
// Usado por todas as listas do sistema para dar ordenação asc/desc consistente.
//
// Uso típico:
//   const { sorted, sortKey, sortDir, requestSort, getSortProps } = useSortableData(items, {
//     key: 'date', direction: 'desc', type: 'date',
//   });
//   ...
//   <SortableHeader label="Data" sortKey="date" type="date" {...getSortProps()} />
//   {sorted.map(...)}
//
// A tipagem de cada coluna (text | number | date) garante ordenação correta:
// datas por tempo, números por valor, texto por localeCompare pt-BR.

import React, { useMemo, useState, useCallback } from 'react';

export type SortType = 'text' | 'number' | 'date';
export type SortDirection = 'asc' | 'desc';

export interface SortConfig {
  key: string;
  direction: SortDirection;
  type?: SortType;
}

/** Extrai o valor de uma coluna de um objeto, suportando caminhos "a.b.c". */
function getValueByPath(obj: any, path: string): any {
  if (!path) return undefined;
  if (path.indexOf('.') === -1) return obj?.[path];
  return path.split('.').reduce((acc, k) => (acc == null ? acc : acc[k]), obj);
}

function toComparable(value: any, type: SortType): number | string {
  if (value == null) return type === 'text' ? '' : -Infinity;

  if (type === 'number') {
    if (typeof value === 'number') return isFinite(value) ? value : -Infinity;
    // Extrai número de strings tipo "R$ 1.234,56" ou "1500 kg".
    const cleaned = String(value).replace(/[^\d,.-]/g, '');
    if (!cleaned) return -Infinity;
    // Trata separador brasileiro: se tem vírgula decimal.
    let s = cleaned;
    const hasComma = s.includes(','); const hasDot = s.includes('.');
    if (hasComma && hasDot) {
      s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
    } else if (hasComma) {
      s = s.replace(',', '.');
    }
    const n = parseFloat(s);
    return isFinite(n) ? n : -Infinity;
  }

  if (type === 'date') {
    const t = new Date(value.length <= 10 ? value + 'T00:00:00' : value).getTime();
    return isFinite(t) ? t : -Infinity;
  }

  // texto
  return String(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export interface UseSortableDataResult<T> {
  sorted: T[];
  sortKey: string | null;
  sortDir: SortDirection;
  /** Alterna a ordenação de uma coluna: asc → desc → asc… */
  requestSort: (key: string, type?: SortType) => void;
  /** Props para espalhar num <SortableHeader>: {sortKey, sortDir, onSort}. */
  getSortProps: () => { sortKey: string | null; sortDir: SortDirection; onSort: (key: string, type?: SortType) => void };
}

export function useSortableData<T>(items: T[], initial?: SortConfig): UseSortableDataResult<T> {
  const [config, setConfig] = useState<SortConfig | null>(initial || null);

  const requestSort = useCallback((key: string, type: SortType = 'text') => {
    setConfig((prev) => {
      if (prev && prev.key === key) {
        // Mesmo campo: inverte a direção.
        return { key, type, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
      }
      // Novo campo: começa ascendente (datas começam desc por serem mais úteis assim).
      return { key, type, direction: type === 'date' ? 'desc' : 'asc' };
    });
  }, []);

  const sorted = useMemo(() => {
    if (!config) return items;
    const { key, direction, type = 'text' } = config;
    const factor = direction === 'asc' ? 1 : -1;
    // Cópia para não mutar o array original.
    return [...items].sort((a, b) => {
      const va = toComparable(getValueByPath(a, key), type);
      const vb = toComparable(getValueByPath(b, key), type);
      if (typeof va === 'string' && typeof vb === 'string') {
        return va.localeCompare(vb, 'pt-BR') * factor;
      }
      if (va < vb) return -1 * factor;
      if (va > vb) return 1 * factor;
      return 0;
    });
  }, [items, config]);

  return {
    sorted,
    sortKey: config?.key ?? null,
    sortDir: config?.direction ?? 'asc',
    requestSort,
    getSortProps: () => ({ sortKey: config?.key ?? null, sortDir: config?.direction ?? 'asc', onSort: requestSort }),
  };
}

// ---------------------------------------------------------------------------
// Cabeçalho clicável reutilizável
// ---------------------------------------------------------------------------

export interface SortableHeaderProps {
  label: React.ReactNode;
  sortKeyName: string;
  type?: SortType;
  sortKey: string | null;
  sortDir: SortDirection;
  onSort: (key: string, type?: SortType) => void;
  className?: string;
  align?: 'left' | 'center' | 'right';
}

/**
 * <th> clicável com indicador de ordenação. Mostra ↕ quando inativo,
 * ↑/↓ quando é a coluna ativa. Acessível (role button + teclado).
 */
export const SortableHeader: React.FC<SortableHeaderProps> = ({
  label, sortKeyName, type = 'text', sortKey, sortDir, onSort, className = '', align = 'left',
}) => {
  const active = sortKey === sortKeyName;
  const alignClass = align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : 'justify-start';
  return (
    <th
      className={`cursor-pointer select-none hover:bg-stone-200/60 transition-colors ${className}`}
      onClick={() => onSort(sortKeyName, type)}
      title="Clique para ordenar"
      aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <span className={`inline-flex items-center gap-1 ${alignClass} w-full`}>
        {label}
        <span className={`text-[9px] leading-none ${active ? 'text-stone-900' : 'text-stone-300'}`}>
          {active ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}
        </span>
      </span>
    </th>
  );
};
