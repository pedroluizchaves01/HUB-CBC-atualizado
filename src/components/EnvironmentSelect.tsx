// src/components/EnvironmentSelect.tsx
//
// Tela de seleção exibida logo após o login: a pessoa escolhe entre o ambiente
// de PROJETO (arquitetura) e o de OBRA (execução).
//
// Design minimalista, preto e branco. Dois botões compactos e clean; o resumo
// de cada área aparece apenas quando o cursor passa sobre o botão.
// Não decide permissões — apenas qual "mundo" abrir.

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Compass, HardHat, LogOut } from 'lucide-react';

interface Props {
  userName?: string;
  onSelect: (env: 'projeto' | 'obra') => void;
  onLogout: () => void;
}

export default function EnvironmentSelect({ userName, onSelect, onLogout }: Props) {
  const [hover, setHover] = useState<'projeto' | 'obra' | null>(null);

  const panels = [
    {
      key: 'projeto' as const,
      Icon: Compass,
      title: 'Projeto',
      desc: 'Plantas, fases de projeto e a evolução do desenho até a aprovação.',
    },
    {
      key: 'obra' as const,
      Icon: HardHat,
      title: 'Obra',
      desc: 'Cronograma, medições, gastos e o andamento da construção no canteiro.',
    },
  ];

  return (
    <div className="min-h-screen bg-white text-black flex flex-col">
      {/* Topo */}
      <header className="flex items-center justify-between px-6 py-5">
        <p className="text-[10px] font-mono uppercase tracking-[0.22em] text-black/50">Chaves Brites Correa</p>
        <button
          onClick={onLogout}
          className="flex items-center gap-1.5 text-xs font-mono uppercase tracking-wider text-black/50 hover:text-black transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-black px-1"
        >
          <LogOut size={13} /> Sair
        </button>
      </header>

      {/* Centro */}
      <div className="flex-1 flex flex-col items-center justify-center px-6">
        {/* Saudação */}
        <div className="text-center mb-10">
          <p className="text-[10px] font-mono uppercase tracking-[0.25em] text-black/40 mb-3">
            {userName ? `Olá, ${userName}` : 'Bem-vindo'}
          </p>
          <h1 className="text-2xl sm:text-3xl tracking-tight" style={{ fontFamily: 'var(--font-serif)' }}>
            <span style={{ fontWeight: 300 }}>Escolha por </span>
            <span style={{ fontWeight: 700 }}>onde entrar</span>
          </h1>
        </div>

        {/* Botões compactos */}
        <div className="flex flex-col sm:flex-row gap-4 w-full max-w-lg">
          {panels.map((p) => {
            const Icon = p.Icon;
            const isHover = hover === p.key;
            return (
              <div key={p.key} className="flex-1">
                <motion.button
                  onClick={() => onSelect(p.key)}
                  onMouseEnter={() => setHover(p.key)}
                  onMouseLeave={() => setHover(null)}
                  onFocus={() => setHover(p.key)}
                  onBlur={() => setHover(null)}
                  className="w-full flex flex-col items-center gap-3 px-6 py-7 border-2 border-black bg-white text-black hover:bg-black hover:text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2"
                >
                  <Icon size={26} strokeWidth={1.5} />
                  <span className="text-lg tracking-tight" style={{ fontFamily: 'var(--font-serif)', fontWeight: 700 }}>
                    {p.title}
                  </span>
                </motion.button>

                {/* Resumo — aparece só no hover/foco */}
                <AnimatePresence>
                  {isHover && (
                    <motion.p
                      initial={{ opacity: 0, height: 0, marginTop: 0 }}
                      animate={{ opacity: 1, height: 'auto', marginTop: 12 }}
                      exit={{ opacity: 0, height: 0, marginTop: 0 }}
                      transition={{ duration: 0.2 }}
                      className="text-xs text-black/60 text-center leading-relaxed px-2 overflow-hidden"
                      style={{ fontWeight: 300 }}
                    >
                      {p.desc}
                    </motion.p>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </div>

      {/* Rodapé */}
      <footer className="px-6 py-5 text-center">
        <p className="text-[10px] font-mono uppercase tracking-[0.22em] text-black/30">
          Você pode trocar de ambiente a qualquer momento
        </p>
      </footer>
    </div>
  );
}
