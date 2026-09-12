// ============================================================
// Tabela financeira detalhada para a visão do cliente (obras).
// Mostra os gastos realizados com filtros (busca, fornecedor, categoria,
// status) e agrupamento (por fornecedor ou por categoria). Somente leitura.
// ============================================================
import React, { useMemo, useState } from 'react';
import { Search, Filter, ChevronDown, ChevronRight } from 'lucide-react';
import { Transaction, TransactionCategory } from '../types';

const CATEGORY_LABEL: Record<string, string> = {
  materiais: 'Materiais',
  mao_de_obra: 'Mão de Obra',
  projetos_complementares: 'Projetos Complementares',
  taxas: 'Taxas',
  decoracao: 'Decoração',
  outros: 'Outros',
};
const STATUS_LABEL: Record<string, string> = {
  pago: 'Pago', pendente: 'Pendente', reembolsado: 'Reembolsado',
};

interface Props {
  transactions: Transaction[];
  formatCurrency?: (v: number) => string;
}

export default function ClientFinanceTable({ transactions, formatCurrency }: Props) {
  const fmt = formatCurrency || ((v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));

  const [busca, setBusca] = useState('');
  const [catFiltro, setCatFiltro] = useState<string>('todas');
  const [fornecedorFiltro, setFornecedorFiltro] = useState<string>('todos');
  const [statusFiltro, setStatusFiltro] = useState<string>('todos');
  const [agrupar, setAgrupar] = useState<'nenhum' | 'fornecedor' | 'categoria'>('nenhum');
  const [gruposFechados, setGruposFechados] = useState<Record<string, boolean>>({});

  // Lista de fornecedores únicos (para o filtro).
  const fornecedores = useMemo(() => {
    const set = new Set<string>();
    transactions.forEach(t => { if (t.supplier) set.add(t.supplier); });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [transactions]);

  // Aplica os filtros.
  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return transactions.filter(t => {
      if (catFiltro !== 'todas' && t.category !== catFiltro) return false;
      if (fornecedorFiltro !== 'todos' && t.supplier !== fornecedorFiltro) return false;
      if (statusFiltro !== 'todos' && t.status !== statusFiltro) return false;
      if (q) {
        const alvo = `${t.description} ${t.supplier} ${t.invoiceNumber || ''}`.toLowerCase();
        if (!alvo.includes(q)) return false;
      }
      return true;
    }).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }, [transactions, busca, catFiltro, fornecedorFiltro, statusFiltro]);

  const totalFiltrado = useMemo(() => filtradas.reduce((s, t) => s + (t.value || 0), 0), [filtradas]);

  // Agrupa (se aplicável).
  const grupos = useMemo(() => {
    if (agrupar === 'nenhum') return null;
    const mapa: Record<string, { itens: Transaction[]; total: number }> = {};
    filtradas.forEach(t => {
      const chave = agrupar === 'fornecedor' ? (t.supplier || 'Sem fornecedor') : (CATEGORY_LABEL[t.category] || t.category);
      if (!mapa[chave]) mapa[chave] = { itens: [], total: 0 };
      mapa[chave].itens.push(t);
      mapa[chave].total += t.value || 0;
    });
    return Object.entries(mapa).sort((a, b) => b[1].total - a[1].total);
  }, [filtradas, agrupar]);

  const limparFiltros = () => {
    setBusca(''); setCatFiltro('todas'); setFornecedorFiltro('todos'); setStatusFiltro('todos'); setAgrupar('nenhum');
  };
  const temFiltro = busca || catFiltro !== 'todas' || fornecedorFiltro !== 'todos' || statusFiltro !== 'todos' || agrupar !== 'nenhum';

  const selClass = "bg-white border border-stone-200 py-1.5 px-2 text-xs focus:outline-none focus:border-stone-400 rounded";

  const linha = (t: Transaction) => (
    <tr key={t.id} className="border-b border-stone-100 hover:bg-stone-50">
      <td className="py-2 px-3 text-xs text-stone-500 whitespace-nowrap">{t.date ? new Date(t.date + 'T00:00:00').toLocaleDateString('pt-BR') : '—'}</td>
      <td className="py-2 px-3 text-xs text-stone-800">{t.description}</td>
      <td className="py-2 px-3 text-xs text-stone-600">{t.supplier || '—'}</td>
      <td className="py-2 px-3 text-xs">
        <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold" style={{
          background: t.category === 'mao_de_obra' ? '#e0f0f4' : t.category === 'materiais' ? '#fdeede' : '#eef0f3',
          color: t.category === 'mao_de_obra' ? '#25636f' : t.category === 'materiais' ? '#9a5a1a' : '#555',
        }}>{CATEGORY_LABEL[t.category] || t.category}</span>
      </td>
      <td className="py-2 px-3 text-xs text-stone-500">{STATUS_LABEL[t.status] || t.status}</td>
      <td className="py-2 px-3 text-xs font-bold text-stone-900 text-right whitespace-nowrap">{fmt(t.value || 0)}</td>
    </tr>
  );

  return (
    <div className="bg-white border border-stone-200 rounded-2xl overflow-hidden">
      <div className="px-5 py-4 border-b border-stone-150">
        <h4 className="font-mono text-xs uppercase tracking-wider text-stone-900 font-bold">Gastos realizados na obra</h4>
        <p className="text-[11px] text-stone-500 mt-0.5">Filtre por fornecedor, tipo ou busque; agrupe para ver os totais.</p>
      </div>

      {/* Filtros */}
      <div className="px-5 py-3 bg-stone-50 border-b border-stone-150 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5 bg-white border border-stone-200 rounded px-2 py-1.5 flex-1 min-w-[180px]">
          <Search size={13} className="text-stone-400" />
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar descrição, fornecedor, NF…"
            className="text-xs outline-none flex-1 bg-transparent" />
        </div>
        <select value={catFiltro} onChange={e => setCatFiltro(e.target.value)} className={selClass}>
          <option value="todas">Todos os tipos</option>
          {Object.keys(CATEGORY_LABEL).map(c => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
        </select>
        <select value={fornecedorFiltro} onChange={e => setFornecedorFiltro(e.target.value)} className={selClass}>
          <option value="todos">Todos os fornecedores</option>
          {fornecedores.map(f => <option key={f} value={f}>{f}</option>)}
        </select>
        <select value={statusFiltro} onChange={e => setStatusFiltro(e.target.value)} className={selClass}>
          <option value="todos">Todos os status</option>
          {Object.keys(STATUS_LABEL).map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
        <select value={agrupar} onChange={e => setAgrupar(e.target.value as any)} className={selClass}>
          <option value="nenhum">Sem agrupamento</option>
          <option value="fornecedor">Agrupar por fornecedor</option>
          <option value="categoria">Agrupar por tipo</option>
        </select>
        {temFiltro && (
          <button onClick={limparFiltros} className="text-[11px] font-mono uppercase text-stone-500 hover:text-stone-800 px-2 py-1.5">Limpar</button>
        )}
      </div>

      {/* Resumo do que está filtrado */}
      <div className="px-5 py-2 bg-white border-b border-stone-150 flex items-center justify-between">
        <span className="text-[11px] text-stone-500">{filtradas.length} lançamento(s)</span>
        <span className="text-xs font-bold text-stone-900">Total: {fmt(totalFiltrado)}</span>
      </div>

      {/* Tabela ou grupos */}
      <div className="overflow-x-auto">
        {filtradas.length === 0 ? (
          <p className="text-xs text-stone-400 text-center py-8">Nenhum gasto encontrado com esses filtros.</p>
        ) : agrupar === 'nenhum' ? (
          <table className="w-full">
            <thead>
              <tr className="border-b border-stone-200 bg-stone-50">
                <th className="py-2 px-3 text-[10px] font-mono uppercase text-stone-400 text-left">Data</th>
                <th className="py-2 px-3 text-[10px] font-mono uppercase text-stone-400 text-left">Descrição</th>
                <th className="py-2 px-3 text-[10px] font-mono uppercase text-stone-400 text-left">Fornecedor</th>
                <th className="py-2 px-3 text-[10px] font-mono uppercase text-stone-400 text-left">Tipo</th>
                <th className="py-2 px-3 text-[10px] font-mono uppercase text-stone-400 text-left">Status</th>
                <th className="py-2 px-3 text-[10px] font-mono uppercase text-stone-400 text-right">Valor</th>
              </tr>
            </thead>
            <tbody>{filtradas.map(linha)}</tbody>
          </table>
        ) : (
          <div>
            {grupos!.map(([chave, { itens, total }]) => {
              const fechado = gruposFechados[chave];
              return (
                <div key={chave} className="border-b border-stone-150">
                  <button onClick={() => setGruposFechados(prev => ({ ...prev, [chave]: !prev[chave] }))}
                    className="w-full flex items-center justify-between px-4 py-2.5 bg-stone-100 hover:bg-stone-150 text-left">
                    <span className="flex items-center gap-2 text-xs font-bold text-stone-800">
                      {fechado ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                      {chave} <span className="text-stone-400 font-normal">({itens.length})</span>
                    </span>
                    <span className="text-xs font-bold text-stone-900">{fmt(total)}</span>
                  </button>
                  {!fechado && (
                    <table className="w-full">
                      <tbody>{itens.map(linha)}</tbody>
                    </table>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
