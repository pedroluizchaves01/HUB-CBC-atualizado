import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Eye, EyeOff } from 'lucide-react';

interface LoginProps {
  onLogin: (username: string, pb: string) => Promise<{ success: boolean; error?: string }>;
}

export default function Login({ onLogin }: LoginProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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
    onLogin(username, password)
      .then((result) => {
        if (!result.success && result.error) setError(result.error);
      })
      .catch(() => setError('Falha ao conectar ao servidor. Tente novamente.'))
      .finally(() => setLoading(false));
  };

  return (
    <div id="login_container" className="min-h-screen bg-[#07090E] text-[#F8FAFC] font-sans selection:bg-[#FF5A35] selection:text-white flex items-center justify-center p-4 md:p-12 relative overflow-hidden">
      <div className="grid-bg"></div>
      
      {/* Decorative Blur Glows */}
      <div className="bg-glow-orange top-[-100px] left-[-100px] opacity-40"></div>
      <div className="bg-glow-purple bottom-[-100px] right-[-100px] opacity-30"></div>
      
      {/* Root Grid Layout */}
      <div id="root" className="max-w-[1200px] w-full p-4 md:p-16 grid grid-cols-1 md:grid-cols-[1fr_420px] gap-12 md:gap-24 items-center relative z-10">
        
        {/* Brand / Left Section */}
        <motion.div 
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          className="space-y-6"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/5 border border-white/10 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-[#FF5A35] animate-pulse"></span>
            <span className="font-mono text-[0.625rem] font-bold uppercase tracking-[0.15em] text-[#F8FAFC]/80">CBC | ARQUITETURA E ENGENHARIA.</span>
          </div>
          
          <h1 className="font-sans text-5xl md:text-[6rem] leading-[0.85] font-extrabold tracking-[-0.04em] uppercase select-none text-transparent bg-clip-text bg-gradient-to-br from-white via-white/90 to-white/40">
            CHAVES<br />BRITES<br />CORREA
          </h1>
          
          <p className="text-[#94A3B8] max-w-[320px] text-sm leading-[1.6]">
            Centro de operações de arquitetura e engenharia de acesso restrito.
          </p>
        </motion.div>

        {/* Auth Card Section */}
        <motion.div 
          className="glass-card border border-white/10 rounded-3xl p-8 md:p-12 shadow-[0_32px_80px_rgba(0,0,0,0.6)] relative overflow-hidden"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="absolute top-0 left-0 w-full h-[3px] bg-gradient-to-r from-[#FF5A35] to-[#7C3AED]"></div>
          
          <span className="label font-mono text-[0.65rem] uppercase tracking-[0.15em] text-[#FF5A35] font-bold mb-8 block">Autenticação</span>
          
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 p-3.5 rounded-xl text-xs font-mono">
                {error}
              </div>
            )}

            <div>
              <label className="label font-mono text-[0.65rem] uppercase tracking-[0.15em] text-slate-400 mb-2 block">
                Usuário
              </label>
              <input
                type="text"
                placeholder="Ex: admin_cbc"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={loading}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3.5 font-sans text-sm text-white placeholder-slate-500 focus:outline-none focus:border-[#FF5A35] focus:bg-white/[0.08] transition-all"
              />
            </div>

            <div>
              <label className="label font-mono text-[0.65rem] uppercase tracking-[0.15em] text-slate-400 mb-2 block">
                Senha
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3.5 font-sans text-sm text-white placeholder-slate-500 focus:outline-none focus:border-[#FF5A35] focus:bg-white/[0.08] transition-all pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white focus:outline-none transition-colors"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button 
              type="submit"
              disabled={loading}
              className="w-full bg-[#FF5A35] hover:bg-[#ff6e4d] text-white py-4 px-6 rounded-xl font-sans text-xs uppercase tracking-[0.12em] font-bold transition-all duration-300 hover:shadow-[0_0_25px_rgba(255,90,53,0.3)] hover:-translate-y-0.5 cursor-pointer flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  <span>Acessando...</span>
                </>
              ) : (
                <span>Entrar no Painel</span>
              )}
            </button>
          </form>
        </motion.div>
      </div>

      {/* Meta Copyright Fixed Footer */}
      <div className="absolute bottom-8 right-8 font-mono text-[0.6rem] text-slate-500 uppercase tracking-wider hidden md:block">
        © 2026 CHAVES BRITES CORREA. ALL RIGHTS RESERVED.
      </div>
    </div>
  );
}
