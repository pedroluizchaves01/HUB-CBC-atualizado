// ============================================================
// Editor de marcação sobre planta (imagem).
// O cliente desenha com caneta (traços livres), adiciona comentários
// em pontos (pins numerados) e posiciona ÍCONES TÉCNICOS (ex.: elétrica)
// sobre uma imagem enviada pelo arquiteto.
// Ao salvar, gera a imagem "achatada" (planta + marcações) e a lista de
// comentários, que são enviados ao arquiteto num pedido de ajuste.
//
// Catálogo de ícones extensível: para adicionar uma nova categoria (ex.:
// "Hidráulica", "Mobiliário"), basta acrescentar um item a CATALOGO_ICONES
// e um caso em desenharGlifo()/GlifoSVG() — o resto (paleta, colocação,
// numeração, lista de comentários, imagem final) já funciona sozinho.
// ============================================================
import React, { useRef, useState, useEffect } from 'react';
import { Pen, MapPin, Undo2, Trash2, X, Check, Loader2, Minus, Plus, Maximize2, Sparkles } from 'lucide-react';

interface Pin {
  id: number; x: number; y: number; text: string;
  iconId?: string; // se definido, o marcador é um ícone técnico (não um comentário genérico)
} // x,y em fração 0-1
interface Stroke { color: string; width: number; points: { x: number; y: number }[]; } // pontos em fração 0-1

interface Props {
  imageUrl: string;
  fileName: string;
  onCancel: () => void;
  // Recebe a imagem final (dataURL PNG) + resumo textual dos comentários.
  onSave: (result: { dataUrl: string; comentarios: string; fileName: string }) => Promise<void> | void;
}

const CORES = ['#e5352b', '#1d6ff2', '#12a150', '#f5a300', '#111111'];

// ---- Catálogo de ícones técnicos (extensível por categoria) ----
interface IconeMarcador { id: string; label: string; cor: string; }
interface CategoriaIcones { categoria: string; itens: IconeMarcador[]; }

const CATALOGO_ICONES: CategoriaIcones[] = [
  {
    categoria: 'Elétrica',
    itens: [
      { id: 'tomada', label: 'Tomada', cor: '#1d6ff2' },
      { id: 'interruptor', label: 'Interruptor', cor: '#f5a300' },
      { id: 'ponto_luz', label: 'Ponto de luz', cor: '#e8b800' },
      { id: 'ventilador', label: 'Ventilador de teto', cor: '#12a1a0' },
      { id: 'ar_condicionado', label: 'Ar-condicionado', cor: '#2fa0e0' },
      { id: 'tv_dados', label: 'TV / Ponto de dados', cor: '#7d5bf8' },
    ],
  },
  // Próximas categorias (Hidráulica, Mobiliário...) entram aqui.
];
const TODOS_ICONES: IconeMarcador[] = CATALOGO_ICONES.flatMap(c => c.itens);
const iconePorId = (id?: string) => TODOS_ICONES.find(i => i.id === id);

// Desenha o glifo de um ícone técnico num <canvas>, centrado em (0,0), já
// transladado — usado na geração da imagem final. Traços em branco.
function desenharGlifo(ctx: CanvasRenderingContext2D, iconId: string, r: number) {
  ctx.save();
  ctx.strokeStyle = '#fff';
  ctx.fillStyle = '#fff';
  ctx.lineWidth = Math.max(1.2, r * 0.12);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  switch (iconId) {
    case 'tomada': {
      // duas "furos" redondos, como uma tomada de parede
      ctx.beginPath(); ctx.arc(-r * 0.28, 0, r * 0.16, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(r * 0.28, 0, r * 0.16, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'interruptor': {
      // placa (contorno) + alavanca (preenchida) no topo
      ctx.strokeRect(-r * 0.32, -r * 0.55, r * 0.64, r * 1.1);
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(-r * 0.2, -r * 0.4, r * 0.4, r * 0.4, r * 0.08);
      else ctx.rect(-r * 0.2, -r * 0.4, r * 0.4, r * 0.4);
      ctx.fill();
      break;
    }
    case 'ponto_luz': {
      // círculo central + raios (sol / lâmpada)
      ctx.beginPath(); ctx.arc(0, 0, r * 0.28, 0, Math.PI * 2); ctx.stroke();
      for (let a = 0; a < 6; a++) {
        const ang = (a / 6) * Math.PI * 2;
        const x1 = Math.cos(ang) * r * 0.42, y1 = Math.sin(ang) * r * 0.42;
        const x2 = Math.cos(ang) * r * 0.62, y2 = Math.sin(ang) * r * 0.62;
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      }
      break;
    }
    case 'ventilador': {
      // 4 pás (linhas curtas) em cruz + eixo central
      for (let a = 0; a < 4; a++) {
        const ang = (a / 4) * Math.PI * 2 + Math.PI / 4;
        const x2 = Math.cos(ang) * r * 0.55, y2 = Math.sin(ang) * r * 0.55;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(x2, y2); ctx.stroke();
      }
      ctx.beginPath(); ctx.arc(0, 0, r * 0.12, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'ar_condicionado': {
      // corpo do aparelho (retângulo) + linhas de fluxo de ar
      ctx.strokeRect(-r * 0.5, -r * 0.32, r * 1.0, r * 0.4);
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.moveTo(i * r * 0.22, r * 0.12);
        ctx.lineTo(i * r * 0.22 + r * 0.1, r * 0.4);
        ctx.stroke();
      }
      break;
    }
    case 'tv_dados': {
      // tela (retângulo) + pé
      ctx.strokeRect(-r * 0.5, -r * 0.38, r * 1.0, r * 0.62);
      ctx.beginPath(); ctx.moveTo(-r * 0.18, r * 0.24); ctx.lineTo(r * 0.18, r * 0.24); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, r * 0.24); ctx.lineTo(0, r * 0.42); ctx.stroke();
      break;
    }
    default: {
      // fallback: ponto simples
      ctx.beginPath(); ctx.arc(0, 0, r * 0.2, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.restore();
}

// Versão em JSX/SVG do mesmo glifo, para o editor ao vivo (mesmas proporções).
function GlifoSVG({ iconId, r }: { iconId: string; r: number }) {
  const sw = Math.max(1.2, r * 0.12);
  const common = { stroke: '#fff', fill: 'none', strokeWidth: sw, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  switch (iconId) {
    case 'tomada':
      return <>
        <circle cx={-r * 0.28} cy={0} r={r * 0.16} fill="#fff" />
        <circle cx={r * 0.28} cy={0} r={r * 0.16} fill="#fff" />
      </>;
    case 'interruptor':
      return <>
        <rect x={-r * 0.32} y={-r * 0.55} width={r * 0.64} height={r * 1.1} {...common} />
        <rect x={-r * 0.2} y={-r * 0.4} width={r * 0.4} height={r * 0.4} rx={r * 0.08} fill="#fff" />
      </>;
    case 'ponto_luz': {
      const raios = Array.from({ length: 6 }, (_, a) => {
        const ang = (a / 6) * Math.PI * 2;
        return <line key={a} x1={Math.cos(ang) * r * 0.42} y1={Math.sin(ang) * r * 0.42} x2={Math.cos(ang) * r * 0.62} y2={Math.sin(ang) * r * 0.62} {...common} />;
      });
      return <><circle cx={0} cy={0} r={r * 0.28} {...common} />{raios}</>;
    }
    case 'ventilador': {
      const pas = Array.from({ length: 4 }, (_, a) => {
        const ang = (a / 4) * Math.PI * 2 + Math.PI / 4;
        return <line key={a} x1={0} y1={0} x2={Math.cos(ang) * r * 0.55} y2={Math.sin(ang) * r * 0.55} {...common} />;
      });
      return <>{pas}<circle cx={0} cy={0} r={r * 0.12} fill="#fff" /></>;
    }
    case 'ar_condicionado':
      return <>
        <rect x={-r * 0.5} y={-r * 0.32} width={r * 1.0} height={r * 0.4} {...common} />
        {[-1, 0, 1].map(i => (
          <line key={i} x1={i * r * 0.22} y1={r * 0.12} x2={i * r * 0.22 + r * 0.1} y2={r * 0.4} {...common} />
        ))}
      </>;
    case 'tv_dados':
      return <>
        <rect x={-r * 0.5} y={-r * 0.38} width={r * 1.0} height={r * 0.62} {...common} />
        <line x1={-r * 0.18} y1={r * 0.24} x2={r * 0.18} y2={r * 0.24} {...common} />
        <line x1={0} y1={r * 0.24} x2={0} y2={r * 0.42} {...common} />
      </>;
    default:
      return <circle cx={0} cy={0} r={r * 0.2} fill="#fff" />;
  }
}

export default function PlanMarkupEditor({ imageUrl, fileName, onCancel, onSave }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgDims, setImgDims] = useState({ w: 0, h: 0 });
  const [zoom, setZoom] = useState(1);

  const [tool, setTool] = useState<'pen' | 'pin' | 'icon'>('pen');
  const [cor, setCor] = useState(CORES[0]);
  const [espessura, setEspessura] = useState(3);
  const [iconAtivo, setIconAtivo] = useState<string>(TODOS_ICONES[0].id);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [pins, setPins] = useState<Pin[]>([]);
  const [desenhando, setDesenhando] = useState(false);
  const [pinAberto, setPinAberto] = useState<number | null>(null);
  const [salvando, setSalvando] = useState(false);

  // Converte coordenada do evento para fração 0-1 relativa à imagem.
  const toFrac = (clientX: number, clientY: number) => {
    const rect = imgRef.current!.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (clientY - rect.top) / rect.height)),
    };
  };

  const getXY = (e: React.PointerEvent) => toFrac(e.clientX, e.clientY);

  const onPointerDown = (e: React.PointerEvent) => {
    if (!imgLoaded) return;
    if (tool === 'pin' || tool === 'icon') {
      const { x, y } = getXY(e);
      const id = (pins[pins.length - 1]?.id || 0) + 1;
      if (tool === 'icon') {
        const icone = iconePorId(iconAtivo);
        setPins([...pins, { id, x, y, text: icone?.label || '', iconId: iconAtivo }]);
        setPinAberto(id);
      } else {
        setPins([...pins, { id, x, y, text: '' }]);
        setPinAberto(id);
      }
      return;
    }
    // caneta
    setDesenhando(true);
    const { x, y } = getXY(e);
    setStrokes(prev => [...prev, { color: cor, width: espessura, points: [{ x, y }] }]);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!desenhando || tool !== 'pen') return;
    const { x, y } = getXY(e);
    setStrokes(prev => {
      const novo = [...prev];
      novo[novo.length - 1] = { ...novo[novo.length - 1], points: [...novo[novo.length - 1].points, { x, y }] };
      return novo;
    });
  };
  const onPointerUp = () => setDesenhando(false);

  const desfazer = () => {
    // desfaz o último elemento adicionado (traço ou pin/ícone) — o mais recente por ora: traço
    if (strokes.length) setStrokes(strokes.slice(0, -1));
    else if (pins.length) setPins(pins.slice(0, -1));
  };
  const limpar = () => { setStrokes([]); setPins([]); setPinAberto(null); };

  const path = (s: Stroke) => {
    if (!imgDims.w) return '';
    return s.points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x * imgDims.w} ${p.y * imgDims.h}`).join(' ');
  };

  // Gera a imagem final achatada (planta + traços + pins + ícones) num canvas.
  const gerarImagemFinal = async (): Promise<string> => {
    const img = imgRef.current!;
    const canvas = document.createElement('canvas');
    // usa a resolução natural da imagem para qualidade
    const W = img.naturalWidth || imgDims.w;
    const H = img.naturalHeight || imgDims.h;
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0, W, H);
    // traços
    strokes.forEach(s => {
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.width * (W / imgDims.w); // escala a espessura
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.beginPath();
      s.points.forEach((p, i) => {
        const px = p.x * W, py = p.y * H;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      });
      ctx.stroke();
    });
    // pins e ícones
    pins.forEach(pin => {
      const px = pin.x * W, py = pin.y * H;
      const r = Math.max(14, W * 0.014);
      const icone = iconePorId(pin.iconId);
      ctx.fillStyle = icone?.cor || '#e5352b';
      ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.fill();
      if (icone) {
        // desenha o glifo do ícone técnico centrado no marcador
        ctx.save();
        ctx.translate(px, py);
        desenharGlifo(ctx, icone.id, r);
        ctx.restore();
        // selo pequeno no canto com o número (mantém a correlação com a lista)
        const br = r * 0.42;
        const bx = px + r * 0.75, by = py - r * 0.75;
        ctx.fillStyle = '#111';
        ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = `bold ${br * 1.15}px sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(String(pin.id), bx, by);
      } else {
        // comentário genérico: número dentro do círculo, como antes
        ctx.fillStyle = '#fff';
        ctx.font = `bold ${r * 1.1}px sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(String(pin.id), px, py);
      }
    });
    return canvas.toDataURL('image/png');
  };

  const salvar = async () => {
    if (salvando) return;
    setSalvando(true);
    try {
      const dataUrl = await gerarImagemFinal();
      const comentarios = pins.length
        ? pins.map(p => {
            const icone = iconePorId(p.iconId);
            const rotulo = icone ? `${icone.label}${p.text && p.text !== icone.label ? ` — ${p.text}` : ''}` : (p.text || '(sem texto)');
            return `${p.id}. ${rotulo}`;
          }).join('\n')
        : '';
      await onSave({ dataUrl, comentarios, fileName: `marcacao-${fileName.replace(/\.[^.]+$/, '')}.png` });
    } catch (e: any) {
      alert(`Erro ao gerar a planta marcada: ${e?.message || 'erro'}.`);
    } finally {
      setSalvando(false);
    }
  };

  useEffect(() => {
    const onResize = () => {
      if (imgRef.current) setImgDims({ w: imgRef.current.clientWidth, h: imgRef.current.clientHeight });
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const btn = (active: boolean) =>
    `flex items-center gap-1.5 px-3 py-2 text-[12px] rounded-lg transition-colors ${active ? 'bg-black text-white' : 'bg-white text-stone-700 border border-stone-200 hover:border-stone-400'}`;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-3" onClick={onCancel}>
      <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[95vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Cabeçalho / ferramentas */}
        <div className="px-4 py-3 border-b border-stone-150 flex items-center gap-2 flex-wrap">
          <b className="text-[13px] flex-1 min-w-0 truncate" style={{ fontWeight: 700 }}>Anotar na planta — {fileName}</b>
          <button onClick={() => setTool('pen')} className={btn(tool === 'pen')}><Pen size={13} /> Caneta</button>
          <button onClick={() => setTool('pin')} className={btn(tool === 'pin')}><MapPin size={13} /> Comentário</button>
          <button onClick={() => setTool('icon')} className={btn(tool === 'icon')}><Sparkles size={13} /> Ícones</button>
          <button onClick={desfazer} className="flex items-center gap-1.5 px-3 py-2 text-[12px] rounded-lg bg-white text-stone-700 border border-stone-200 hover:border-stone-400"><Undo2 size={13} /> Desfazer</button>
          <button onClick={limpar} className="flex items-center gap-1.5 px-3 py-2 text-[12px] rounded-lg bg-white text-stone-700 border border-stone-200 hover:border-red-400 hover:text-red-600"><Trash2 size={13} /> Limpar</button>
          {/* Zoom */}
          <div className="flex items-center gap-1 bg-white border border-stone-200 rounded-lg px-1">
            <button onClick={() => setZoom(z => Math.max(0.5, +(z - 0.25).toFixed(2)))} className="px-2 py-1.5 text-stone-600 hover:text-black" title="Diminuir zoom"><Minus size={13} /></button>
            <span className="text-[11px] text-stone-500 font-mono w-10 text-center">{Math.round(zoom * 100)}%</span>
            <button onClick={() => setZoom(z => Math.min(4, +(z + 0.25).toFixed(2)))} className="px-2 py-1.5 text-stone-600 hover:text-black" title="Aumentar zoom"><Plus size={13} /></button>
            <button onClick={() => setZoom(1)} className="px-2 py-1.5 text-stone-600 hover:text-black" title="Redefinir zoom"><Maximize2 size={12} /></button>
          </div>
          <button onClick={onCancel} className="ml-1 text-stone-400 hover:text-stone-800"><X size={18} /></button>
        </div>

        {/* Cor e espessura (só caneta) */}
        {tool === 'pen' && (
          <div className="px-4 py-2 border-b border-stone-100 flex items-center gap-3 bg-stone-50">
            <span className="text-[11px] text-stone-500 font-mono uppercase">Cor</span>
            {CORES.map(c => (
              <button key={c} onClick={() => setCor(c)} className="w-6 h-6 rounded-full border-2" style={{ background: c, borderColor: cor === c ? '#000' : 'transparent' }} />
            ))}
            <span className="text-[11px] text-stone-500 font-mono uppercase ml-3">Espessura</span>
            <input type="range" min={1} max={10} value={espessura} onChange={e => setEspessura(Number(e.target.value))} />
          </div>
        )}

        {/* Paleta de ícones técnicos (por categoria) */}
        {tool === 'icon' && (
          <div className="px-4 py-2.5 border-b border-stone-100 bg-stone-50 flex flex-col gap-2">
            {CATALOGO_ICONES.map(cat => (
              <div key={cat.categoria} className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] text-stone-400 font-mono uppercase tracking-wide w-16 flex-shrink-0">{cat.categoria}</span>
                {cat.itens.map(icone => (
                  <button key={icone.id} onClick={() => setIconAtivo(icone.id)}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] border transition-colors"
                    style={{
                      background: iconAtivo === icone.id ? icone.cor : '#fff',
                      color: iconAtivo === icone.id ? '#fff' : '#44403c',
                      borderColor: iconAtivo === icone.id ? icone.cor : '#e7e5e4',
                      fontWeight: 600,
                    }}>
                    <svg width={16} height={16} viewBox="-13 -13 26 26">
                      <circle cx={0} cy={0} r={12} fill={iconAtivo === icone.id ? 'rgba(255,255,255,0.001)' : icone.cor} />
                      <GlifoSVG iconId={icone.id} r={13} />
                    </svg>
                    {icone.label}
                  </button>
                ))}
              </div>
            ))}
            <p className="text-[10px] text-stone-400">Escolha o ícone e toque na planta para posicioná-lo. Você pode complementar com um comentário na lista abaixo.</p>
          </div>
        )}

        {/* Área de desenho */}
        <div className="flex-1 overflow-auto bg-stone-100 p-3" ref={wrapRef}>
          <div className="relative inline-block mx-auto" style={{ touchAction: 'none', transform: `scale(${zoom})`, transformOrigin: 'top left' }}>
            <img
              ref={imgRef}
              src={imageUrl}
              alt="planta"
              className="max-w-full block select-none"
              draggable={false}
              onLoad={() => {
                setImgLoaded(true);
                if (imgRef.current) setImgDims({ w: imgRef.current.clientWidth, h: imgRef.current.clientHeight });
              }}
            />
            {/* camada de desenho */}
            <svg
              ref={svgRef}
              className="absolute inset-0 w-full h-full"
              style={{ cursor: tool === 'pen' ? 'crosshair' : 'copy' }}
              viewBox={imgDims.w ? `0 0 ${imgDims.w} ${imgDims.h}` : undefined}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerLeave={onPointerUp}
            >
              {strokes.map((s, i) => (
                <path key={i} d={path(s)} stroke={s.color} strokeWidth={s.width} fill="none" strokeLinejoin="round" strokeLinecap="round" />
              ))}
              {pins.map(pin => {
                const icone = iconePorId(pin.iconId);
                return (
                  <g key={pin.id} transform={`translate(${pin.x * imgDims.w}, ${pin.y * imgDims.h})`}>
                    <circle r={13} fill={icone?.cor || '#e5352b'} />
                    {icone ? (
                      <>
                        <GlifoSVG iconId={icone.id} r={13} />
                        {/* selo com o número, no canto */}
                        <g transform="translate(9.75, -9.75)">
                          <circle r={5.5} fill="#111" />
                          <text textAnchor="middle" dominantBaseline="middle" fill="#fff" fontSize={7} fontWeight="bold">{pin.id}</text>
                        </g>
                      </>
                    ) : (
                      <text textAnchor="middle" dominantBaseline="middle" fill="#fff" fontSize={14} fontWeight="bold">{pin.id}</text>
                    )}
                  </g>
                );
              })}
            </svg>
          </div>
        </div>

        {/* Lista de comentários / ícones posicionados */}
        {pins.length > 0 && (
          <div className="px-4 py-2 border-t border-stone-150 max-h-40 overflow-y-auto bg-white">
            <p className="text-[10px] font-mono uppercase text-stone-400 mb-1">Comentários e pontos marcados</p>
            <div className="space-y-1.5">
              {pins.map(pin => {
                const icone = iconePorId(pin.iconId);
                return (
                  <div key={pin.id} className="flex items-start gap-2">
                    <span className="w-5 h-5 rounded-full text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: icone?.cor || '#e5352b' }}>
                      {icone ? <svg width={12} height={12} viewBox="-13 -13 26 26"><GlifoSVG iconId={icone.id} r={13} /></svg> : pin.id}
                    </span>
                    {icone && <span className="text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0 mt-0.5" style={{ background: `${icone.cor}1a`, color: icone.cor, fontWeight: 700 }}>{icone.label}</span>}
                    <input
                      value={pin.text}
                      autoFocus={pinAberto === pin.id}
                      onChange={e => setPins(pins.map(p => p.id === pin.id ? { ...p, text: e.target.value } : p))}
                      placeholder={icone ? 'Detalhe (opcional): altura, observação...' : 'Descreva a sugestão neste ponto...'}
                      className="flex-1 border border-stone-200 rounded px-2 py-1 text-xs focus:outline-none focus:border-stone-400"
                    />
                    <button onClick={() => setPins(pins.filter(p => p.id !== pin.id))} className="text-stone-400 hover:text-red-600 p-1"><Trash2 size={12} /></button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Rodapé */}
        <div className="px-4 py-3 border-t border-stone-150 flex items-center justify-between gap-2">
          <span className="text-[11px] text-stone-400">Desenhe com a caneta, adicione comentários ou posicione ícones técnicos.</span>
          <div className="flex gap-2">
            <button onClick={onCancel} className="px-4 py-2 text-[12px] text-stone-500 hover:text-stone-800" style={{ fontWeight: 600 }}>Cancelar</button>
            <button onClick={salvar} disabled={salvando || (strokes.length === 0 && pins.length === 0)}
              className="flex items-center gap-1.5 px-5 py-2 text-[12px] rounded-lg text-white disabled:opacity-40" style={{ background: 'linear-gradient(140deg,#7d5bf8,#4f2fd4)', fontWeight: 700 }}>
              {salvando ? <><Loader2 size={13} className="animate-spin" /> Enviando…</> : <><Check size={13} /> Enviar sugestão ao arquiteto</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
