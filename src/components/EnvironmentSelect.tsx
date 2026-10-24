// src/components/EnvironmentSelect.tsx
//
// Tela de bifurcação exibida logo após o login: a pessoa escolhe entre o
// ambiente de PROJETO (arquitetura/engenharia) e o de OBRA (execução, o que já
// existe). Dois cartões de vidro lado a lado; o que recebe o cursor se destaca.
//
// Não decide permissões — apenas qual "mundo" abrir. O App cuida do resto.
//
// Paleta: mesma identidade das duas sessões — Projeto é preto/branco puro,
// Obra é preto/branco com destaque laranja. Fundo claro com gradiente
// glassmorphismo que reage à posição do mouse (um holofote suave que segue o
// cursor), e os dois cartões de vidro reagem exatamente da mesma forma ao
// passar o mouse (sobem, ganham sombra e um brilho na cor do ambiente).

import React, { useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Compass, HardHat, ArrowRight, LogOut } from 'lucide-react';

interface Props {
  userName?: string;
  onSelect: (env: 'projeto' | 'obra') => void;
  onLogout: () => void;
}

// Projeto = preto/grafite (mesma paleta do Estúdio de Projetos).
// Obra = laranja da marca (mesmo destaque do Centro de Obras).
const PRETO = '#18181b';
const LARANJA = '#FF5A35';

export default function EnvironmentSelect({ userName, onSelect, onLogout }: Props) {
  const [hover, setHover] = useState<'projeto' | 'obra' | null>(null);
  // Posição do mouse (0–100%) para o holofote do fundo seguir o cursor.
  const [mouse, setMouse] = useState({ x: 50, y: 40 });
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setMouse({
      x: ((e.clientX - rect.left) / rect.width) * 100,
      y: ((e.clientY - rect.top) / rect.height) * 100,
    });
  };

  const panels = [
    {
      key: 'projeto' as const,
      color: PRETO,
      grad: 'linear-gradient(140deg, #3f3f46, #000000)',
      Icon: Compass,
      eyebrow: 'Arquitetura & Engenharia',
      title: 'Projeto',
      desc: 'Plantas, fases de projeto e a evolução do desenho até a aprovação.',
    },
    {
      key: 'obra' as const,
      color: LARANJA,
      grad: 'linear-gradient(140deg, #FF7A52, #E8590C)',
      Icon: HardHat,
      eyebrow: 'Execução & Acompanhamento',
      title: 'Obra',
      desc: 'Cronograma, medições, gastos e o andamento da construção no canteiro.',
    },
  ];

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      className="env-select min-h-screen flex flex-col relative overflow-hidden"
      style={{
        background: 'linear-gradient(160deg, #d6d9de 0%, #eef0f3 45%, #d1d4da 100%)',
        color: '#18181b',
      }}
    >
      {/* Grade decorativa sutil */}
      <div className="absolute inset-0 pointer-events-none" style={{
        backgroundImage:
          'linear-gradient(to right, rgba(0,0,0,0.025) 1px, transparent 1px),' +
          'linear-gradient(to bottom, rgba(0,0,0,0.025) 1px, transparent 1px)',
        backgroundSize: '48px 48px',
      }} />

      {/* Holofote que segue o mouse — o coração do glassmorphismo interativo */}
      <div className="absolute inset-0 pointer-events-none transition-all duration-500 ease-out" style={{
        background: `radial-gradient(600px circle at ${mouse.x}% ${mouse.y}%, rgba(255,255,255,0.9) 0%, rgba(255,255,255,0.25) 35%, transparent 70%)`,
      }} />
      {/* Brilhos ambiente fixos: um grafite sutil, um laranja — mesma dupla das duas sessões */}
      <div className="absolute pointer-events-none" style={{
        width: 600, height: 600, top: -180, left: -140,
        background: 'radial-gradient(circle, rgba(24,24,27,0.10) 0%, transparent 70%)',
      }} />
      <div className="absolute pointer-events-none transition-transform duration-700 ease-out" style={{
        width: 650, height: 650, bottom: -200, right: -160,
        background: `radial-gradient(circle, ${LARANJA}26 0%, transparent 70%)`,
        transform: `translate(${(mouse.x - 50) * -0.15}px, ${(mouse.y - 50) * -0.15}px)`,
      }} />

      {/* Topo */}
      <header className="flex items-center justify-between px-6 md:px-10 py-6 z-10 relative">
        <div className="flex items-center gap-3">
          <span className="w-9 h-9 rounded-xl flex items-center justify-center text-sm flex-shrink-0 text-white" style={{
            background: 'linear-gradient(135deg, #3f3f46, #000000)',
            border: '1px solid rgba(255,255,255,0.14)',
            fontWeight: 800,
            boxShadow: '0 6px 16px rgba(0,0,0,0.25)',
          }}>C</span>
          <div className="leading-tight">
            <p className="text-[10px] font-mono uppercase tracking-[0.2em]" style={{ '--ec': '#8a8a92' } as React.CSSProperties}>Chaves Brites Correa</p>
            <p className="text-sm" style={{ '--ec': '#52525b' } as React.CSSProperties}>
              {userName ? <>Olá, <span className="font-semibold" style={{ '--ec': '#18181b' } as React.CSSProperties}>{userName}</span>.</> : 'Bem-vindo.'} Escolha por onde entrar.
            </p>
          </div>
        </div>
        <button
          onClick={onLogout}
          className="flex items-center gap-1.5 text-xs font-mono uppercase tracking-wider px-3.5 py-2 rounded-full transition-colors hover:bg-white"
          style={{ color: '#52525b', background: 'rgba(255,255,255,0.5)', border: '1px solid rgba(0,0,0,0.08)', backdropFilter: 'blur(10px)' } as React.CSSProperties}
        >
          <LogOut size={13} /> Sair
        </button>
      </header>

      {/* Cartões de vidro */}
      <div className="flex-1 flex items-center justify-center px-6 md:px-10 py-8 z-10 relative">
        <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-2 gap-5">
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
                  opacity: isDimmed ? 0.7 : 1,
                  y: isHover ? -8 : 0,
                  scale: isHover ? 1.015 : 1,
                }}
                transition={{ duration: 0.4, delay: i * 0.1, ease: [0.16, 1, 0.3, 1] }}
                className="relative group overflow-hidden cursor-pointer text-left p-8 md:p-10 rounded-[28px] focus:outline-none"
                style={{
                  background: 'rgba(255,255,255,0.55)',
                  backdropFilter: 'blur(24px) saturate(160%)',
                  WebkitBackdropFilter: 'blur(24px) saturate(160%)',
                  border: `1px solid ${isHover ? `${p.color}40` : 'rgba(255,255,255,0.6)'}`,
                  boxShadow: isHover
                    ? `0 24px 48px -12px ${p.color}3d, 0 4px 14px -4px ${p.color}26, inset 0 1px 0 rgba(255,255,255,0.7)`
                    : '0 10px 30px -10px rgba(15,23,42,0.10), inset 0 1px 0 rgba(255,255,255,0.6)',
                  minHeight: '340px',
                  transition: 'background 0.3s, border-color 0.3s, box-shadow 0.4s',
                }}
              >
                {/* Brilho de fundo na cor do painel, ao passar o mouse */}
                <div
                  className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                  style={{ background: `radial-gradient(circle at 25% 15%, ${p.color}1f, transparent 65%)` }}
                />
                {/* Brilho de borda superior — reforça o vidro */}
                <div className="absolute top-0 left-6 right-6 h-px pointer-events-none" style={{ background: 'linear-gradient(to right, transparent, rgba(255,255,255,0.9), transparent)' }} />

                <div className="relative flex flex-col h-full">
                  <span
                    className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-6 transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-3 flex-shrink-0"
                    style={{
                      background: p.grad,
                      border: '1px solid rgba(255,255,255,0.2)',
                      boxShadow: `0 10px 24px -6px ${p.color}66, inset 0 1px 0 rgba(255,255,255,0.22)`,
                    }}
                  >
                    <Icon size={26} color="#fff" />
                  </span>
                  <p className="text-[10px] font-mono uppercase tracking-[0.2em] mb-2" style={{ '--ec': p.color, fontWeight: 700 } as React.CSSProperties}>
                    {p.eyebrow}
                  </p>
                  <h2 className="text-4xl md:text-5xl font-bold mb-3 tracking-tight" style={{ fontFamily: 'var(--font-serif)', '--ec': '#18181b' } as React.CSSProperties}>
                    {p.title}
                  </h2>
                  <p className="text-sm leading-relaxed mb-6 max-w-xs flex-1" style={{ '--ec': '#52525b' } as React.CSSProperties}>{p.desc}</p>
                  <span
                    className="inline-flex items-center gap-2 text-sm font-semibold transition-all duration-300 w-fit"
                    style={{ '--ec': isHover ? p.color : '#8a8a92' } as React.CSSProperties}
                  >
                    Entrar
                    <ArrowRight size={16} className="transition-transform duration-300 group-hover:translate-x-1.5" />
                  </span>
                </div>
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* Rodapé */}
      <footer className="px-6 py-5 text-center z-10 relative">
        <p className="text-[10px] font-mono uppercase tracking-[0.2em]" style={{ '--ec': '#a1a1aa' } as React.CSSProperties}>
          Você pode trocar de ambiente a qualquer momento
        </p>
      </footer>
    </div>
  );
}
