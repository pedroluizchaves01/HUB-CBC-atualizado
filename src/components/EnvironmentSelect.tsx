// src/components/EnvironmentSelect.tsx
//
// Tela de bifurcação exibida logo após o login: a pessoa escolhe entre o
// ambiente de PROJETO (arquitetura/engenharia) e o de OBRA (execução, o que já
// existe). Dois painéis lado a lado; o que recebe o cursor se expande.
//
// Não decide permissões — apenas qual "mundo" abrir. O App cuida do resto.

import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Compass, HardHat, ArrowRight, LogOut } from 'lucide-react';

interface Props {
  userName?: string;
  onSelect: (env: 'projeto' | 'obra') => void;
  onLogout: () => void;
}

const AZUL = '#3E7C8B';       // projeto (arquitetura/engenharia)
const TERRA = '#C2703D';      // obra (execução) — cor já usada no sistema

export default function EnvironmentSelect({ userName, onSelect, onLogout }: Props) {
  const [hover, setHover] = useState<'projeto' | 'obra' | null>(null);

  const panels = [
    {
      key: 'projeto' as const,
      color: AZUL,
      Icon: Compass,
      eyebrow: 'Arquitetura & Engenharia',
      title: 'Projeto',
      desc: 'Plantas, fases de projeto e a evolução do desenho até a aprovação.',
    },
    {
      key: 'obra' as const,
      color: TERRA,
      Icon: HardHat,
      eyebrow: 'Execução & Acompanhamento',
      title: 'Obra',
      desc: 'Cronograma, medições, gastos e o andamento da construção no canteiro.',
    },
  ];

  return (
    <div className="min-h-screen bg-stone-950 text-white flex flex-col">
      {/* Topo */}
      <header className="flex items-center justify-between px-6 py-5 z-10">
        <div className="leading-tight">
          <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-stone-500">Chaves Brites Correa</p>
          <p className="text-sm text-stone-300">
            {userName ? <>Olá, <span className="font-semibold text-white">{userName}</span>.</> : 'Bem-vindo.'} Escolha por onde entrar.
          </p>
        </div>
        <button
          onClick={onLogout}
          className="flex items-center gap-1.5 text-xs font-mono uppercase tracking-wider text-stone-400 hover:text-white transition-colors"
        >
          <LogOut size={13} /> Sair
        </button>
      </header>

      {/* Painéis */}
      <div className="flex-1 flex flex-col md:flex-row">
        {panels.map((p, i) => {
          const Icon = p.Icon;
          const isHover = hover === p.key;
          const isDimmed = hover !== null && !isHover;
          return (
            <motion.button
              key={p.key}
              onClick={() => onSelect(p.key)}
              onMouseEnter={() => setHover(p.key)}
              onMouseLeave={() => setHover(null)}
              initial={{ opacity: 0, y: 20 }}
              animate={{
                opacity: isDimmed ? 0.55 : 1,
                y: 0,
                flexGrow: isHover ? 1.35 : 1,
              }}
              transition={{ duration: 0.5, delay: i * 0.12, flexGrow: { duration: 0.4 } }}
              className="relative flex-1 basis-0 group overflow-hidden cursor-pointer text-left px-8 md:px-12 py-16 md:py-0 md:flex md:flex-col md:justify-center border-t md:border-t-0 md:border-l border-stone-800 first:border-none focus:outline-none"
              style={{ minHeight: '38vh' }}
            >
              {/* Brilho de fundo na cor do painel */}
              <div
                className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                style={{ background: `radial-gradient(circle at 30% 40%, ${p.color}22, transparent 70%)` }}
              />
              {/* Barra de acento lateral */}
              <div
                className="absolute left-0 top-0 bottom-0 w-1 md:w-1.5 transition-all duration-300"
                style={{ background: p.color, opacity: isHover ? 1 : 0.4 }}
              />

              <div className="relative max-w-sm">
                <span
                  className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-6 transition-transform duration-300 group-hover:scale-110"
                  style={{ background: `${p.color}22`, border: `1px solid ${p.color}55` }}
                >
                  <Icon size={26} style={{ color: p.color }} />
                </span>
                <p className="text-[10px] font-mono uppercase tracking-[0.2em] mb-2" style={{ color: p.color }}>
                  {p.eyebrow}
                </p>
                <h2
                  className="text-5xl md:text-6xl font-bold mb-4 tracking-tight"
                  style={{ fontFamily: 'var(--font-serif)' }}
                >
                  {p.title}
                </h2>
                <p className="text-sm text-stone-400 leading-relaxed mb-6 max-w-xs">{p.desc}</p>
                <span
                  className="inline-flex items-center gap-2 text-sm font-semibold transition-all duration-300"
                  style={{ color: isHover ? p.color : '#a8a29e' }}
                >
                  Entrar
                  <ArrowRight
                    size={16}
                    className="transition-transform duration-300 group-hover:translate-x-1"
                  />
                </span>
              </div>
            </motion.button>
          );
        })}
      </div>

      {/* Rodapé */}
      <footer className="px-6 py-4 text-center">
        <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-stone-600">
          Você pode trocar de ambiente a qualquer momento
        </p>
      </footer>
    </div>
  );
}
