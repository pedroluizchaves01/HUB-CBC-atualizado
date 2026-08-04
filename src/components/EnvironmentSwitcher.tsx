// src/components/EnvironmentSwitcher.tsx
//
// Botão flutuante discreto para trocar de ambiente sem novo login.
// Renderizado por cima do ambiente de Obra; leva para Projeto ou para a
// tela de seleção.

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowLeftRight, Compass, HardHat, LayoutGrid } from 'lucide-react';

interface Props {
  current: 'obra' | 'projeto';
  onGoProjeto: () => void;
  onGoObra: () => void;
  onGoSelect: () => void;
}

export default function EnvironmentSwitcher({ current, onGoProjeto, onGoObra, onGoSelect }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div className="fixed bottom-5 right-5 z-[100] flex flex-col items-end gap-2">
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ duration: 0.18 }}
            className="bg-white rounded-2xl shadow-xl border border-stone-200 p-2 w-52"
          >
            <p className="text-[10px] font-mono uppercase tracking-wider text-stone-400 px-2 py-1.5">Trocar ambiente</p>
            <button
              onClick={() => { setOpen(false); current === 'obra' ? onGoProjeto() : onGoObra(); }}
              className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl hover:bg-stone-50 text-left transition-colors"
            >
              {current === 'obra' ? (
                <>
                  <span className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: '#3E7C8B18' }}>
                    <Compass size={16} style={{ color: '#3E7C8B' }} />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-stone-800">Ir para Projeto</p>
                    <p className="text-[10px] text-stone-400">Arquitetura & engenharia</p>
                  </div>
                </>
              ) : (
                <>
                  <span className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: '#C2703D18' }}>
                    <HardHat size={16} style={{ color: '#C2703D' }} />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-stone-800">Ir para Obra</p>
                    <p className="text-[10px] text-stone-400">Execução & acompanhamento</p>
                  </div>
                </>
              )}
            </button>
            <button
              onClick={() => { setOpen(false); onGoSelect(); }}
              className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl hover:bg-stone-50 text-left transition-colors"
            >
              <span className="w-8 h-8 rounded-lg bg-stone-100 flex items-center justify-center">
                <LayoutGrid size={15} className="text-stone-500" />
              </span>
              <p className="text-sm font-semibold text-stone-800">Tela de seleção</p>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <button
        onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-2 px-4 py-2.5 rounded-full shadow-lg text-white text-sm font-bold transition-transform hover:scale-105 ${current === 'obra' ? 'bg-[#C2703D]' : 'bg-[#3E7C8B]'}`}
        title="Trocar de ambiente"
      >
        <ArrowLeftRight size={16} />
        <span className="hidden sm:inline">{current === 'obra' ? 'Obra' : 'Projeto'}</span>
      </button>
    </div>
  );
}
