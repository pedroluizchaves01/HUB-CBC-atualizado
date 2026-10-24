import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Eye, EyeOff, Lock, User, ArrowRight, KeyRound, ShieldCheck, Building2, Compass, MessageSquare,
  ClipboardList, HardHat, Receipt, CheckCircle2, Loader2, FileCheck2,
} from 'lucide-react';

interface LoginProps {
  onLogin: (username: string, pb: string, rememberMe: boolean) => Promise<{ success: boolean; error?: string }>;
  /** DEV ONLY — pula o backend e entra direto como um dos usuários de exemplo. */
  onDevLogin?: (userId: string) => void;
}

const LAST_USERNAME_KEY = 'cbc_last_username';

// Histórico de etapas simulado — aparece e "carrega" em loop no painel visual,
// dando a sensação de um fluxo de trabalho real acontecendo (criar projeto,
// orçar, aprovar...). Puramente decorativo, não reflete dados reais.
const DEMO_STEPS: { label: string; Icon: React.ComponentType<any> }[] = [
  { label: 'Criando projeto', Icon: Compass },
  { label: 'Definindo escopo', Icon: ClipboardList },
  { label: 'Criando obra', Icon: HardHat },
  { label: 'Fazendo orçamento', Icon: Receipt },
  { label: 'Etapa aprovada', Icon: CheckCircle2 },
  { label: 'Medição concluída', Icon: FileCheck2 },
];

/** Widget de vidro com o histórico de etapas "carregando" em loop contínuo. */
function DemoStepsWidget() {
  // step === DEMO_STEPS.length é uma pausa com tudo concluído antes de reiniciar.
  const [step, setStep] = useState(0);
  useEffect(() => {
    const id = setInterval(() => {
      setStep((s) => (s + 1) % (DEMO_STEPS.length + 1));
    }, 1300);
    return () => clearInterval(id);
  }, []);

  const visible = DEMO_STEPS.slice(0, Math.min(step + 1, DEMO_STEPS.length));

  return (
    <div className="space-y-2">
      <AnimatePresence initial={false}>
        {visible.map((item, i) => {
          const done = i < step;
          const Icon = item.Icon;
          return (
            <motion.div
              key={item.label}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              className="flex items-center gap-2.5 text-[12px]"
              style={{ color: done ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.55)' }}
            >
              <span className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0" style={{
                background: done ? 'rgba(93,226,143,0.18)' : 'rgba(255,255,255,0.08)',
              }}>
                {done ? <CheckCircle2 size={12} style={{ color: '#5de28f' }} /> : <Loader2 size={11} className="animate-spin" style={{ color: '#FF5A35' }} />}
              </span>
              <Icon size={12} className="flex-shrink-0" style={{ color: done ? '#fff' : 'rgba(255,255,255,0.5)' }} />
              <span style={{ '--ec': done ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.55)' } as React.CSSProperties}>{item.label}</span>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

export default function Login({ onLogin, onDevLogin }: LoginProps) {
  const [username, setUsername] = useState(() => {
    try { return localStorage.getItem(LAST_USERNAME_KEY) || ''; } catch { return ''; }
  });
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Holofote que segue o mouse — igual à tela de seleção de ambiente: um no
  // fundo da página inteira (forte, branco) e outro local dentro do painel
  // escuro (mais sutil, calculado à parte porque o painel tem seu próprio
  // sistema de coordenadas).
  const [pageMouse, setPageMouse] = useState({ x: 50, y: 40 });
  const [mouse, setMouse] = useState({ x: 50, y: 40 });
  const outerRef = useRef<HTMLDivElement>(null);
  const visualPanelRef = useRef<HTMLDivElement>(null);
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const outerRect = outerRef.current?.getBoundingClientRect();
    if (outerRect) {
      setPageMouse({
        x: ((e.clientX - outerRect.left) / outerRect.width) * 100,
        y: ((e.clientY - outerRect.top) / outerRect.height) * 100,
      });
    }
    const panelRect = visualPanelRef.current?.getBoundingClientRect();
    if (panelRect) {
      setMouse({
        x: ((e.clientX - panelRect.left) / panelRect.width) * 100,
        y: ((e.clientY - panelRect.top) / panelRect.height) * 100,
      });
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!username.trim()) {
      setError('Por favor, informe o usuário.');
      return;
    }
    if (!password) {
      setError('Por favor, insira a senha.');
      return;
    }

    setLoading(true);
    onLogin(username, password, rememberMe)
      .then((result) => {
        if (!result.success && result.error) {
          setError(result.error);
        } else {
          try { localStorage.setItem(LAST_USERNAME_KEY, username.trim()); } catch { /* ignore */ }
        }
      })
      .catch(() => setError('Falha ao conectar ao servidor. Tente novamente.'))
      .finally(() => setLoading(false));
  };

  return (
    <div
      id="login_container"
      ref={outerRef}
      onMouseMove={handleMouseMove}
      className="login-screen min-h-screen flex items-center justify-center p-3 md:p-6 font-sans selection:bg-[#FF5A35] selection:text-white relative overflow-hidden"
      style={{ background: 'linear-gradient(160deg, #d6d9de 0%, #eef0f3 45%, #d1d4da 100%)', color: '#18181b', '--ec': '#18181b' } as React.CSSProperties}
    >
      {/* Grade decorativa sutil — igual à tela de seleção de ambiente */}
      <div className="absolute inset-0 pointer-events-none" style={{
        backgroundImage:
          'linear-gradient(to right, rgba(0,0,0,0.025) 1px, transparent 1px),' +
          'linear-gradient(to bottom, rgba(0,0,0,0.025) 1px, transparent 1px)',
        backgroundSize: '48px 48px',
      }} />

      {/* Holofote forte que segue o mouse pela tela inteira */}
      <div className="absolute inset-0 pointer-events-none transition-all duration-500 ease-out" style={{
        background: `radial-gradient(600px circle at ${pageMouse.x}% ${pageMouse.y}%, rgba(255,255,255,0.9) 0%, rgba(255,255,255,0.25) 35%, transparent 70%)`,
      }} />
      {/* Brilhos ambiente fixos: grafite sutil + laranja com parallax — mesma dupla da seleção de ambiente */}
      <div className="absolute pointer-events-none" style={{
        width: 600, height: 600, top: -180, left: -140,
        background: 'radial-gradient(circle, rgba(24,24,27,0.10) 0%, transparent 70%)',
      }} />
      <div className="absolute pointer-events-none transition-transform duration-700 ease-out" style={{
        width: 650, height: 650, bottom: -200, right: -160,
        background: 'radial-gradient(circle, rgba(255,90,53,0.15) 0%, transparent 70%)',
        transform: `translate(${(pageMouse.x - 50) * -0.15}px, ${(pageMouse.y - 50) * -0.15}px)`,
      }} />

      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-[980px] max-h-[calc(100vh-24px)] rounded-[32px] p-3 md:p-4 flex flex-col md:flex-row gap-3 md:gap-4 relative z-10 overflow-y-auto"
        style={{
          background: 'rgba(255,255,255,0.55)',
          backdropFilter: 'blur(24px) saturate(160%)',
          WebkitBackdropFilter: 'blur(24px) saturate(160%)',
          border: '1px solid rgba(255,255,255,0.6)',
          boxShadow: '0 40px 90px -24px rgba(15,23,42,0.22), inset 0 1px 0 rgba(255,255,255,0.7)',
        }}
      >
        {/* Brilho de borda superior — reforça o vidro, igual aos cartões da seleção de ambiente */}
        <div className="absolute top-0 left-10 right-10 h-px pointer-events-none" style={{ background: 'linear-gradient(to right, transparent, rgba(255,255,255,0.9), transparent)' }} />
        {/* ====== Coluna do formulário ====== */}
        <div className="flex-1 px-6 md:px-10 py-5 flex flex-col">
          <div className="flex-1 flex flex-col justify-center max-w-[320px] mx-auto w-full">

            {/* ===== Bloco 1 — Cabeçalho / marca ===== */}
            <div className="mb-6">
              <h2
                className="login-brand-shine uppercase leading-[0.9] mb-2 w-fit cursor-default"
                style={{ fontFamily: "'Poppins', sans-serif", fontWeight: 800, fontSize: 32, letterSpacing: '-0.02em', '--ec': 'transparent' } as React.CSSProperties}
              >
                Hub CBC
              </h2>
              <p className="max-w-[260px] leading-snug" style={{ fontSize: 12, '--ec': '#71717a' } as React.CSSProperties}>
                Centro de operações de arquitetura e engenharia de acesso restrito.
              </p>
            </div>

            {/* ===== Bloco 2 — Título da ação (entrar) ===== */}
            <div className="mb-4">
              <h1 className="text-xl font-extrabold tracking-tight mb-0.5 flex items-center gap-2" style={{ '--ec': '#18181b' } as React.CSSProperties}>
                <span className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ border: '1px solid rgba(0,0,0,0.1)' }}>
                  <KeyRound size={14} style={{ color: '#18181b' }} />
                </span>
                Entrar no painel
              </h1>
              <p className="text-[13px]" style={{ '--ec': '#71717a' } as React.CSSProperties}>
                Acesse com as credenciais fornecidas
              </p>
            </div>

            {/* ===== Bloco 3 — Preenchimento (formulário) ===== */}
            <form onSubmit={handleSubmit} className="space-y-3 mb-5">
              {error && (
                <div className="bg-rose-500/10 border border-rose-500/20 text-rose-600 p-3 rounded-xl text-xs">
                  {error}
                </div>
              )}

              <div>
                <label className="text-[13px] font-medium mb-1.5 block" style={{ '--ec': '#3f3f46' } as React.CSSProperties}>Usuário</label>
                <div className="login-boxed-field">
                  <User size={15} style={{ color: '#a1a1aa' }} />
                  <input
                    type="text"
                    placeholder="Ex: admin_cbc"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    disabled={loading}
                    autoComplete="username"
                    className="login-boxed-input"
                  />
                </div>
              </div>

              <div>
                <label className="text-[13px] font-medium mb-1.5 block" style={{ '--ec': '#3f3f46' } as React.CSSProperties}>Senha</label>
                <div className="login-boxed-field">
                  <Lock size={15} style={{ color: '#a1a1aa' }} />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={loading}
                    autoComplete="current-password"
                    className="login-boxed-input"
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="flex-shrink-0 hover:opacity-70 transition-opacity" style={{ color: '#a1a1aa' }}>
                    {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              <label className="flex items-center gap-2 cursor-pointer select-none pt-1">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  disabled={loading}
                  className="w-4 h-4 rounded border-black/20 bg-white accent-[#18181b] cursor-pointer"
                />
                <span className="text-[13px]" style={{ '--ec': '#52525b' } as React.CSSProperties}>Manter conectado por 7 dias</span>
              </label>

              <button
                type="submit"
                disabled={loading}
                className="login-submit-btn w-full py-3 rounded-xl text-sm font-semibold transition-all duration-300 cursor-pointer flex items-center justify-center gap-2 relative overflow-hidden mt-1"
                style={{ background: '#18181b', boxShadow: '0 10px 24px -8px rgba(0,0,0,0.3)', '--ec': '#fff' } as React.CSSProperties}
              >
                <span className="login-submit-shine" />
                <span className="absolute left-5 right-5 bottom-0 h-[2px] rounded-full" style={{ background: 'linear-gradient(to right, transparent, #FF5A35, transparent)' }} />
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span style={{ '--ec': '#fff' } as React.CSSProperties}>Verificando…</span>
                  </>
                ) : (
                  <>
                    <span style={{ '--ec': '#fff' } as React.CSSProperties}>Entrar</span>
                    <ArrowRight size={14} color="#fff" />
                  </>
                )}
              </button>
            </form>

            {/* ===== Bloco 4 — Rodapé (dev + acesso restrito) ===== */}
            {import.meta.env.DEV && onDevLogin && (
              <div className="pt-4 text-center" style={{ borderTop: '1px solid rgba(0,0,0,0.08)' }}>
                <span className="text-[10px] uppercase tracking-[0.1em] block mb-1.5" style={{ '--ec': '#a1a1aa' } as React.CSSProperties}>Dev — pular login</span>
                <div className="flex flex-wrap justify-center gap-2">
                  <button type="button" onClick={() => onDevLogin('admin-1')} className="text-[11px] px-3 py-1 rounded-lg cursor-pointer transition-colors hover:bg-stone-100" style={{ border: '1px solid rgba(0,0,0,0.1)', color: '#52525b' }}>Admin</button>
                  <button type="button" onClick={() => onDevLogin('user-marketing-1')} className="text-[11px] px-3 py-1 rounded-lg cursor-pointer transition-colors hover:bg-stone-100" style={{ border: '1px solid rgba(0,0,0,0.1)', color: '#52525b' }}>Marketing</button>
                  <button type="button" onClick={() => onDevLogin('user-client-1')} className="text-[11px] px-3 py-1 rounded-lg cursor-pointer transition-colors hover:bg-stone-100" style={{ border: '1px solid rgba(0,0,0,0.1)', color: '#52525b' }}>Cliente</button>
                </div>
              </div>
            )}
          </div>

          <p className="text-center text-[12px] mt-4" style={{ '--ec': '#a1a1aa' } as React.CSSProperties}>
            Acesso restrito · Chaves Brites Correa
          </p>
        </div>

        {/* ====== Painel visual — gradiente "plano técnico" + widgets flutuantes de vidro ====== */}
        <div
          ref={visualPanelRef}
          onMouseMove={handleMouseMove}
          className="hidden md:block relative flex-1 rounded-[24px] overflow-hidden"
          style={{
            background: 'linear-gradient(155deg, #1c1c1f 0%, #0a0a0c 60%, #18181b 100%)',
            minHeight: 420,
            // Painel escuro: troca o padrão herdado de --ec (preto, vindo do cartão
            // externo) por um claro, pra qualquer h1-h6/p/span aqui dentro nascer
            // legível sem precisar repetir a cor em cada elemento.
            '--ec': 'rgba(255,255,255,0.85)',
          } as React.CSSProperties}
        >
          {/* Linhas de plano técnico (blueprint), bem sutis */}
          <div className="absolute inset-0 pointer-events-none" style={{
            backgroundImage:
              'linear-gradient(to right, rgba(255,255,255,0.05) 1px, transparent 1px),' +
              'linear-gradient(to bottom, rgba(255,255,255,0.05) 1px, transparent 1px)',
            backgroundSize: '40px 40px',
          }} />
          {/* Holofote que segue o mouse */}
          <div className="absolute inset-0 pointer-events-none transition-all duration-500 ease-out" style={{
            background: `radial-gradient(550px circle at ${mouse.x}% ${mouse.y}%, rgba(255,255,255,0.09) 0%, transparent 60%)`,
          }} />
          {/* Brilho laranja ambiente, com leve parallax */}
          <div className="absolute pointer-events-none transition-transform duration-700 ease-out" style={{
            width: 420, height: 420, bottom: -120, right: -100,
            background: 'radial-gradient(circle, rgba(255,90,53,0.16) 0%, transparent 70%)',
            transform: `translate(${(mouse.x - 50) * -0.08}px, ${(mouse.y - 50) * -0.08}px)`,
          }} />

          {/* Pill "status" no topo */}
          <motion.div
            initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3, duration: 0.5 }}
            className="absolute top-6 left-6 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px]"
            style={{ background: 'rgba(255,255,255,0.08)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.14)', color: 'rgba(255,255,255,0.85)' }}
          >
            <ShieldCheck size={12} /> Ambiente verificado
          </motion.div>

          {/* Widget de vidro — histórico de etapas "ao vivo" (decorativo, em loop) */}
          <motion.div
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45, duration: 0.5 }}
            className="absolute top-20 right-6 left-6 md:left-auto md:w-[240px] rounded-2xl p-4"
            style={{ background: 'rgba(255,255,255,0.07)', backdropFilter: 'blur(18px) saturate(160%)', border: '1px solid rgba(255,255,255,0.12)', boxShadow: '0 20px 40px -16px rgba(0,0,0,0.5)', minHeight: 168 }}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] font-medium" style={{ color: 'rgba(255,255,255,0.6)' }}>Linha do tempo</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold" style={{ background: 'rgba(63,224,128,0.18)', color: '#5de28f' }}>Ao vivo</span>
            </div>
            <DemoStepsWidget />
          </motion.div>

          {/* Bolha de dica */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.6, duration: 0.5 }}
            className="absolute bottom-28 right-6 flex items-center gap-2 px-3.5 py-2.5 rounded-2xl rounded-br-sm text-[11px] max-w-[220px]"
            style={{ background: 'rgba(255,255,255,0.08)', backdropFilter: 'blur(14px)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.8)' }}
          >
            <MessageSquare size={14} className="flex-shrink-0" style={{ color: '#FF5A35' }} />
            Seus dados ficam protegidos com sessão criptografada.
          </motion.div>

          {/* Texto de rodapé do painel */}
          <div className="absolute bottom-6 left-6 right-6">
            <h3 className="text-xl font-bold mb-1" style={{ fontFamily: "'Poppins', sans-serif", '--ec': '#fff' } as React.CSSProperties}>Mesmo endereço, nova obra</h3>
            <p className="text-[12px]" style={{ '--ec': 'rgba(255,255,255,0.55)' } as React.CSSProperties}>Projetos, contratos e acompanhamento de obra em um só lugar.</p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
