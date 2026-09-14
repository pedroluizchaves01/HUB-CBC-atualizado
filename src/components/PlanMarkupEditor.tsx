// ============================================================
// Editor de marcação sobre planta (imagem).
// O cliente desenha com caneta (traços livres) e adiciona comentários
// em pontos (pins numerados) sobre uma imagem enviada pelo arquiteto.
// Ao salvar, gera a imagem "achatada" (planta + marcações) e a lista de
// comentários, que são enviados ao arquiteto num pedido de ajuste.
// ============================================================
import React, { useRef, useState, useEffect } from 'react';
import { Pen, MapPin, Undo2, Trash2, X, Check, Loader2, Minus, Plus, Maximize2 } from 'lucide-react';

interface Pin { id: number; x: number; y: number; text: string; } // x,y em fração 0-1
interface Stroke { color: string; width: number; points: { x: number; y: number }[]; } // pontos em fração 0-1

interface Props {
  imageUrl: string;
  fileName: string;
  onCancel: () => void;
  // Recebe a imagem final (dataURL PNG) + resumo textual dos comentários.
  onSave: (result: { dataUrl: string; comentarios: string; fileName: string }) => Promise<void> | void;
}

const CORES = ['#e5352b', '#1d6ff2', '#12a150', '#f5a300', '#111111'];

export default function PlanMarkupEditor({ imageUrl, fileName, onCancel, onSave }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgDims, setImgDims] = useState({ w: 0, h: 0 });
  const [zoom, setZoom] = useState(1);

  const [tool, setTool] = useState<'pen' | 'pin'>('pen');
  const [cor, setCor] = useState(CORES[0]);
  const [espessura, setEspessura] = useState(3);
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
    if (tool === 'pin') {
      const { x, y } = getXY(e);
      const id = (pins[pins.length - 1]?.id || 0) + 1;
      setPins([...pins, { id, x, y, text: '' }]);
      setPinAberto(id);
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
    // desfaz o último elemento adicionado (traço ou pin) — o mais recente por ora: traço
    if (strokes.length) setStrokes(strokes.slice(0, -1));
    else if (pins.length) setPins(pins.slice(0, -1));
  };
  const limpar = () => { setStrokes([]); setPins([]); setPinAberto(null); };

  const path = (s: Stroke) => {
    if (!imgDims.w) return '';
    return s.points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x * imgDims.w} ${p.y * imgDims.h}`).join(' ');
  };

  // Gera a imagem final achatada (planta + traços + pins) num canvas.
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
    // pins
    pins.forEach(pin => {
      const px = pin.x * W, py = pin.y * H;
      const r = Math.max(14, W * 0.014);
      ctx.fillStyle = '#e5352b';
      ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = `bold ${r * 1.1}px sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(pin.id), px, py);
    });
    return canvas.toDataURL('image/png');
  };

  const salvar = async () => {
    if (salvando) return;
    setSalvando(true);
    try {
      const dataUrl = await gerarImagemFinal();
      const comentarios = pins.length
        ? pins.map(p => `${p.id}. ${p.text || '(sem texto)'}`).join('\n')
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
              {pins.map(pin => (
                <g key={pin.id} transform={`translate(${pin.x * imgDims.w}, ${pin.y * imgDims.h})`}>
                  <circle r={13} fill="#e5352b" />
                  <text textAnchor="middle" dominantBaseline="middle" fill="#fff" fontSize={14} fontWeight="bold">{pin.id}</text>
                </g>
              ))}
            </svg>
          </div>
        </div>

        {/* Lista de comentários dos pins */}
        {pins.length > 0 && (
          <div className="px-4 py-2 border-t border-stone-150 max-h-40 overflow-y-auto bg-white">
            <p className="text-[10px] font-mono uppercase text-stone-400 mb-1">Comentários</p>
            <div className="space-y-1.5">
              {pins.map(pin => (
                <div key={pin.id} className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-[#e5352b] text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{pin.id}</span>
                  <input
                    value={pin.text}
                    autoFocus={pinAberto === pin.id}
                    onChange={e => setPins(pins.map(p => p.id === pin.id ? { ...p, text: e.target.value } : p))}
                    placeholder="Descreva a sugestão neste ponto..."
                    className="flex-1 border border-stone-200 rounded px-2 py-1 text-xs focus:outline-none focus:border-stone-400"
                  />
                  <button onClick={() => setPins(pins.filter(p => p.id !== pin.id))} className="text-stone-400 hover:text-red-600 p-1"><Trash2 size={12} /></button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Rodapé */}
        <div className="px-4 py-3 border-t border-stone-150 flex items-center justify-between gap-2">
          <span className="text-[11px] text-stone-400">Desenhe com a caneta ou toque para adicionar comentários numerados.</span>
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
