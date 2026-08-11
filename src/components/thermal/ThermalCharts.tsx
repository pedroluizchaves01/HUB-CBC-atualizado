// src/components/thermal/ThermalCharts.tsx
//
// Gráficos SVG desenhados à mão (sem bibliotecas externas) para o dashboard
// do estudo de conforto térmico: rosa dos ventos, carta solar esquemática,
// barras de temperatura mensal e barra de faixa de conforto.

import React from 'react';

const AZUL = '#1C7ED6';
const LARANJA = '#E8590C';
const VERDE = '#0CA678';
const AMBAR = '#F59F00';

// ---------------------------------------------------------------------------
// Rosa dos ventos — destaca as direções predominantes
// ---------------------------------------------------------------------------
export function WindRose({ predominante, size = 200 }: { predominante: string; size?: number }) {
  const cx = size / 2, cy = size / 2, r = size / 2 - 24;
  const dirs = [
    { label: 'N', ang: -90 }, { label: 'NE', ang: -45 }, { label: 'L', ang: 0 }, { label: 'SE', ang: 45 },
    { label: 'S', ang: 90 }, { label: 'SO', ang: 135 }, { label: 'O', ang: 180 }, { label: 'NO', ang: -135 },
  ];
  // Direções predominantes destacadas (ex.: "N/S" -> ['N','S'])
  const ativos = predominante.split('/').map(s => s.trim().toUpperCase());
  const polar = (ang: number, rad: number) => {
    const a = (ang * Math.PI) / 180;
    return { x: cx + rad * Math.cos(a), y: cy + rad * Math.sin(a) };
  };
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width="100%" height="100%">
      {/* círculos concêntricos */}
      {[r, r * 0.66, r * 0.33].map((rr, i) => (
        <circle key={i} cx={cx} cy={cy} r={rr} fill="none" stroke="rgba(27,24,48,0.12)" strokeWidth="1" />
      ))}
      {/* raios e labels */}
      {dirs.map(d => {
        const p = polar(d.ang, r);
        const lp = polar(d.ang, r + 14);
        const on = ativos.includes(d.label);
        const isCardinal = d.label.length === 1;
        return (
          <g key={d.label}>
            <line x1={cx} y1={cy} x2={p.x} y2={p.y} stroke={on ? AZUL : 'rgba(27,24,48,0.15)'} strokeWidth={on ? 3 : 1} />
            {on && (
              <polygon
                points={`${polar(d.ang, r).x},${polar(d.ang, r).y} ${polar(d.ang - 8, r * 0.7).x},${polar(d.ang - 8, r * 0.7).y} ${polar(d.ang + 8, r * 0.7).x},${polar(d.ang + 8, r * 0.7).y}`}
                fill={AZUL} opacity="0.85"
              />
            )}
            <text x={lp.x} y={lp.y} fill={on ? '#1b1830' : '#6b6785'} fontSize={isCardinal ? 12 : 9}
              fontWeight={on ? 700 : 400} textAnchor="middle" dominantBaseline="middle" fontFamily="var(--font-mono)">{d.label}</text>
          </g>
        );
      })}
      <circle cx={cx} cy={cy} r="3" fill="#1b1830" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Carta solar esquemática — trajetória do sol (verão x inverno) na latitude
// ---------------------------------------------------------------------------
export function SolarChart({ latitude, size = 260 }: { latitude: number; size?: number }) {
  const w = size, h = size * 0.62;
  const cx = w / 2, baseY = h - 18;
  const r = w / 2 - 20;
  const sul = latitude < 0; // hemisfério sul: sol ao norte
  // Arcos: verão (mais alto) e inverno (mais baixo)
  const arc = (altura: number, color: string, dash?: string) => {
    const ry = r * altura;
    return <path d={`M ${cx - r} ${baseY} A ${r} ${ry} 0 0 1 ${cx + r} ${baseY}`} fill="none" stroke={color} strokeWidth="2.5" strokeDasharray={dash} />;
  };
  return (
    <svg viewBox={`0 0 ${w} ${h + 8}`} width="100%" height="100%">
      {/* linha do horizonte */}
      <line x1="8" y1={baseY} x2={w - 8} y2={baseY} stroke="rgba(27,24,48,0.20)" strokeWidth="1.5" />
      {/* leste / oeste */}
      <text x="10" y={baseY + 14} fill="#6b6785" fontSize="9" fontFamily="var(--font-mono)">{sul ? 'L' : 'L'}</text>
      <text x={w - 18} y={baseY + 14} fill="#6b6785" fontSize="9" fontFamily="var(--font-mono)">O</text>
      {/* arcos solares */}
      {arc(0.92, AMBAR)}
      {arc(0.52, AZUL, '5 4')}
      {/* sol */}
      <circle cx={cx} cy={baseY - r * 0.92} r="7" fill={AMBAR} />
      <circle cx={cx} cy={baseY - r * 0.52} r="5" fill={AZUL} opacity="0.7" />
      {/* legenda */}
      <text x={cx} y={baseY - r * 0.92 - 12} fill={AMBAR} fontSize="9" fontWeight="700" textAnchor="middle" fontFamily="var(--font-mono)">VERÃO</text>
      <text x={cx + r * 0.5} y={baseY - r * 0.52 + 4} fill={AZUL} fontSize="9" fontWeight="700" textAnchor="middle" fontFamily="var(--font-mono)">INVERNO</text>
      <text x={cx} y={baseY + 14} fill="#837f99" fontSize="8" textAnchor="middle" fontFamily="var(--font-mono)">
        {sul ? 'Sol predominante ao NORTE' : 'Sol predominante ao SUL'}
      </text>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Barras de temperatura — média mensal estimada (curva senoidal em torno da média)
// ---------------------------------------------------------------------------
export function TempBars({ media, max, min, height = 150 }: { media: number; max: number; min: number; height?: number }) {
  const meses = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
  // hemisfério sul: pico no verão (jan), vale no inverno (jul)
  const amp = (max - min) / 2;
  const temps = meses.map((_, i) => {
    const fase = Math.cos(((i) / 12) * 2 * Math.PI); // jan alto
    return media + fase * amp * 0.8;
  });
  const tMax = Math.max(...temps), tMin = Math.min(...temps);
  const w = 100 / meses.length;
  const norm = (t: number) => ((t - tMin) / (tMax - tMin || 1));
  return (
    <svg viewBox={`0 0 100 ${100}`} width="100%" height={height} preserveAspectRatio="none">
      {temps.map((t, i) => {
        const bh = 20 + norm(t) * 60;
        const cor = t > media + 2 ? LARANJA : t < media - 2 ? AZUL : VERDE;
        return <rect key={i} x={i * w + 1} y={90 - bh} width={w - 2} height={bh} fill={cor} opacity="0.85" rx="0.6" />;
      })}
      {meses.map((m, i) => (
        <text key={i} x={i * w + w / 2} y={98} fill="#837f99" fontSize="4" textAnchor="middle" fontFamily="var(--font-mono)">{m}</text>
      ))}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Barra de faixa de conforto — onde a temperatura média cai na escala
// ---------------------------------------------------------------------------
export function ComfortBar({ media }: { media: number }) {
  // escala 10–34°C; zona de conforto ~18–26
  const min = 10, max = 34;
  const pos = Math.max(0, Math.min(100, ((media - min) / (max - min)) * 100));
  const confIni = ((18 - min) / (max - min)) * 100;
  const confFim = ((26 - min) / (max - min)) * 100;
  return (
    <svg viewBox="0 0 100 16" width="100%" height="42">
      <defs>
        <linearGradient id="comfortGrad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={AZUL} />
          <stop offset="45%" stopColor={VERDE} />
          <stop offset="70%" stopColor={AMBAR} />
          <stop offset="100%" stopColor={LARANJA} />
        </linearGradient>
      </defs>
      <rect x="0" y="5" width="100" height="6" rx="3" fill="url(#comfortGrad)" opacity="0.5" />
      {/* zona de conforto */}
      <rect x={confIni} y="4" width={confFim - confIni} height="8" rx="2" fill="none" stroke="#1b1830" strokeWidth="0.7" strokeDasharray="1.5 1" />
      {/* marcador da média */}
      <polygon points={`${pos},1 ${pos - 2.5},5 ${pos + 2.5},5`} fill="#1b1830" />
      <line x1={pos} y1="4" x2={pos} y2="12" stroke="#1b1830" strokeWidth="1" />
      <text x={pos} y="15.5" fill="#1b1830" fontSize="3.6" fontWeight="700" textAnchor="middle" fontFamily="var(--font-mono)">{media}°C</text>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Indicador radial (donut) — para % como umidade, eficiência
// ---------------------------------------------------------------------------
export function RadialGauge({ value, label, color = VERDE, size = 110 }: { value: number; label: string; color?: string; size?: number }) {
  const r = size / 2 - 10, cx = size / 2, cy = size / 2;
  const circ = 2 * Math.PI * r;
  const dash = (value / 100) * circ;
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(27,24,48,0.10)" strokeWidth="8" />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth="8" strokeLinecap="round"
        strokeDasharray={`${dash} ${circ}`} transform={`rotate(-90 ${cx} ${cy})`} />
      <text x={cx} y={cy - 2} fill="#1b1830" fontSize="18" fontWeight="800" textAnchor="middle" dominantBaseline="middle" fontFamily="var(--font-serif)">{value}%</text>
      <text x={cx} y={cy + 14} fill="#6b6785" fontSize="7" textAnchor="middle" fontFamily="var(--font-mono)" letterSpacing="0.1em">{label}</text>
    </svg>
  );
}
