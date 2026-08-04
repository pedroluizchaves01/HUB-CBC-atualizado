// src/components/ProjectEnvironment.tsx
//
// Ambiente de PROJETOS (arquitetura/engenharia) — Onda 1.
// Foco: o CLIENTE visualiza os arquivos de cada etapa, baixa, e dá o ACEITE
// formal (Aprovar / Solicitar ajustes) que destrava a próxima etapa.
//
// Fluxo de estados de cada etapa (roadmap com portões):
//   bloqueada → em_elaboracao → aguardando_aprovacao → (aprovada | ajustes)
//   ajustes volta para em_elaboracao (vai-e-volta); aprovada destrava a próxima.
//
// Registro formal: cada aprovação/ajuste guarda autor, data/hora e o quê (histórico).
// Arquivos: base64 (imagens comprimidas), visualizados e baixados na própria tela.
// Coleção própria 'arch_projects' — independente da obra.

import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import {
  Compass, FolderOpen, Plus, ArrowLeftRight, LogOut, Ruler, Lock,
  CheckCircle2, Clock, AlertTriangle, X, Pencil, Trash2, Upload,
  Download, FileText, ChevronRight, MessageSquare, ThumbsUp, Send, Eye,
} from 'lucide-react';
import { subscribeCollection, saveDoc, removeDoc } from '../lib/firebaseDb';

interface Props {
  role: string;
  userName?: string;
  currentUserId?: string;
  clientId?: string;
  clients?: { id: string; name: string }[];
  obras?: { id: string; name: string; clientId: string; type?: string }[];
  onLogout: () => void;
  onSwitchEnvironment: () => void;   // vai direto para Obra
  onGoToSelect?: () => void;         // vai para a tela de seleção
}

const PHASE_TEMPLATE = [
  'Levantamento e Programa',
  'Estudo Preliminar',
  'Anteprojeto',
  'Projeto Legal (Aprovação)',
  'Projeto Executivo',
  'Detalhamento e Complementares',
];

type PhaseState = 'bloqueada' | 'em_elaboracao' | 'aguardando_aprovacao' | 'ajustes' | 'aprovada';

interface ArchFile {
  id: string;
  name: string;
  type: string;
  base64: string;
  uploadedAt: string;
}
interface PhaseEvent {
  id: string;
  kind: 'envio' | 'aprovacao' | 'ajuste' | 'comentario';
  author: string;
  role: string;
  at: string;
  text?: string;
}
interface ArchPhase {
  name: string;
  state: PhaseState;
  files: ArchFile[];
  events: PhaseEvent[];
  approvedBy?: string;
  approvedAt?: string;
}
interface ArchProject {
  id: string;
  name: string;
  clientName: string;
  clientId?: string;
  obraId?: string;         // vínculo opcional com uma obra/centro de custo
  type: string;
  area?: string;
  responsible?: string;
  status: 'ativo' | 'pausado' | 'concluido';
  phases: ArchPhase[];
  createdAt: string;
  notes?: string;
}

const AZUL = '#3E7C8B';
const uid = (p = 'arch') => `${p}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const STATE_META: Record<PhaseState, { label: string; color: string; Icon: React.ComponentType<any> }> = {
  bloqueada: { label: 'Bloqueada', color: '#a8a29e', Icon: Lock },
  em_elaboracao: { label: 'Em elaboração', color: AZUL, Icon: Clock },
  aguardando_aprovacao: { label: 'Aguardando sua aprovação', color: '#B08A3E', Icon: AlertTriangle },
  ajustes: { label: 'Ajustes solicitados', color: '#C2703D', Icon: MessageSquare },
  aprovada: { label: 'Aprovada', color: '#059669', Icon: CheckCircle2 },
};

function readFileCompressed(file: File): Promise<ArchFile> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Falha ao ler o arquivo.'));
    reader.onload = () => {
      const base64 = reader.result as string;
      const mk = (b64: string): ArchFile => ({
        id: uid('file'), name: file.name, type: file.type, base64: b64, uploadedAt: new Date().toISOString(),
      });
      if (!file.type.startsWith('image/')) return resolve(mk(base64));
      const img = new Image();
      img.onload = () => {
        const maxW = 1600;
        const scale = Math.min(1, maxW / img.width);
        const canvas = document.createElement('canvas');
        canvas.width = img.width * scale; canvas.height = img.height * scale;
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(mk(base64));
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(mk(canvas.toDataURL('image/jpeg', 0.82)));
      };
      img.onerror = () => resolve(mk(base64));
      img.src = base64;
    };
    reader.readAsDataURL(file);
  });
}

export default function ProjectEnvironment({
  role, userName, clientId, clients = [], obras = [], onLogout, onSwitchEnvironment, onGoToSelect,
}: Props) {
  const [allProjects, setAllProjects] = useState<ArchProject[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<ArchProject | null>(null);

  const isAdmin = role === 'admin' || role === 'marketing';

  useEffect(() => {
    const unsub = subscribeCollection('arch_projects', setAllProjects, [], 'cbc_arch_projects_v1');
    return () => unsub();
  }, []);

  const projects = isAdmin ? allProjects : allProjects.filter(p => p.clientId && p.clientId === clientId);
  const selectedProject = projects.find(p => p.id === selected);

  const progressOf = (p: ArchProject) => {
    if (!p.phases?.length) return 0;
    const done = p.phases.filter(ph => ph.state === 'aprovada').length;
    const partial = p.phases.filter(ph => ph.state === 'aguardando_aprovacao' || ph.state === 'ajustes').length * 0.5;
    return Math.round(((done + partial) / p.phases.length) * 100);
  };

  const newProject = (): ArchProject => ({
    id: uid(), name: '', clientName: '', clientId: '', type: 'Residencial', area: '', responsible: '',
    status: 'ativo',
    phases: PHASE_TEMPLATE.map((name, i) => ({
      name, state: i === 0 ? 'em_elaboracao' : 'bloqueada', files: [], events: [],
    })),
    createdAt: new Date().toISOString(), notes: '',
  });

  const persist = (p: ArchProject) => saveDoc('arch_projects', p.id, p);

  return (
    <div className="min-h-screen text-stone-900 relative" style={{
      background: 'linear-gradient(180deg, #f4f7f8 0%, #fafaf9 40%, #fafaf9 100%)',
    }}>
      {/* Textura decorativa sutil no topo (linhas de projeto/planta) */}
      <div className="absolute top-0 left-0 right-0 h-64 overflow-hidden pointer-events-none opacity-[0.04]" aria-hidden>
        <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse">
              <path d="M 32 0 L 0 0 0 32" fill="none" stroke={AZUL} strokeWidth="1" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>
      </div>

      <header className="bg-white/70 backdrop-blur-md border-b border-stone-200/70 sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-2xl flex items-center justify-center shadow-sm" style={{ background: `linear-gradient(135deg, ${AZUL}, #2a5560)` }}>
              <Compass size={19} className="text-white" />
            </span>
            <div className="leading-tight">
              <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-stone-400">Chaves Brites Correa</p>
              <h1 className="text-lg font-bold tracking-tight" style={{ fontFamily: 'var(--font-serif)' }}>Estúdio de Projetos</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onSwitchEnvironment}
              className="flex items-center gap-1.5 text-xs font-mono uppercase tracking-wider text-stone-500 hover:text-stone-900 px-3 py-1.5 rounded-lg hover:bg-stone-100 transition-colors">
              <ArrowLeftRight size={13} /> Ir para Obra
            </button>
            <button onClick={onLogout}
              className="flex items-center gap-1.5 text-xs font-mono uppercase tracking-wider text-stone-400 hover:text-stone-700 transition-colors">
              <LogOut size={13} /> Sair
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-5 py-8 relative">
        {selectedProject ? (
          <ProjectDetail
            project={selectedProject}
            progress={progressOf(selectedProject)}
            isAdmin={isAdmin}
            userName={userName || (isAdmin ? 'Equipe CBC' : 'Cliente')}
            role={role}
            onBack={() => setSelected(null)}
            onEdit={() => setEditing(selectedProject)}
            onPersist={persist}
          />
        ) : (
          <>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-serif)' }}>
                  {isAdmin ? 'Projetos de Arquitetura e Engenharia' : 'Seus Projetos'}
                </h2>
                <p className="text-sm text-stone-500 mt-0.5">Acompanhe cada etapa, veja os arquivos e aprove para avançar.</p>
              </div>
              {isAdmin && (
                <button onClick={() => setEditing(newProject())}
                  className="flex items-center gap-2 text-white px-4 py-2 rounded-lg text-sm font-bold" style={{ background: AZUL }}>
                  <Plus size={16} /> Novo projeto
                </button>
              )}
            </div>

            {projects.length === 0 ? (
              <div className="bg-white border border-stone-200 rounded-2xl py-16 text-center">
                <FolderOpen size={32} className="text-stone-300 mx-auto mb-3" />
                <p className="text-stone-500 mb-1">Nenhum projeto por aqui ainda.</p>
                <p className="text-sm text-stone-400">
                  {isAdmin ? 'Crie o primeiro projeto para começar.' : 'Assim que um projeto seu for criado, ele aparece aqui.'}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {projects.map((p, i) => {
                  const pct = progressOf(p);
                  const waiting = p.phases.some(ph => ph.state === 'aguardando_aprovacao');
                  return (
                    <motion.button key={p.id}
                      initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                      onClick={() => setSelected(p.id)}
                      className="bg-white border border-stone-200 rounded-2xl overflow-hidden text-left hover:shadow-lg hover:-translate-y-0.5 transition-all relative group">
                      {/* Faixa superior com gradiente — assinatura visual do projeto */}
                      <div className="h-16 relative overflow-hidden" style={{ background: `linear-gradient(135deg, ${AZUL}, #2a5560)` }}>
                        <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(circle at 80% 20%, white 1px, transparent 1px)', backgroundSize: '16px 16px' }} />
                        <span className="absolute bottom-2 left-4 w-9 h-9 rounded-xl bg-white/95 flex items-center justify-center shadow-sm translate-y-1/2 z-10">
                          <Ruler size={17} style={{ color: AZUL }} />
                        </span>
                        {waiting && !isAdmin && (
                          <span className="absolute top-2 right-2 text-[9px] font-mono uppercase tracking-wider bg-white/90 text-[#B08A3E] px-2 py-1 rounded-full animate-pulse">
                            Aprovação pendente
                          </span>
                        )}
                      </div>
                      <div className="p-5 pt-7">
                        <h3 className="font-bold text-stone-900 mb-0.5" style={{ fontFamily: 'var(--font-serif)' }}>{p.name || 'Sem nome'}</h3>
                        <p className="text-xs text-stone-500 mb-3">{p.clientName} · {p.type}</p>
                        <div className="flex items-center justify-between text-[11px] text-stone-400 mb-1.5">
                          <span>Progresso</span><span className="font-bold" style={{ color: AZUL }}>{pct}%</span>
                        </div>
                        <div className="h-1.5 bg-stone-100 rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${AZUL}, #2a5560)` }} />
                        </div>
                      </div>
                    </motion.button>
                  );
                })}
              </div>
            )}
          </>
        )}
      </main>

      {editing && (
        <ProjectEditor
          project={editing}
          clients={clients}
          obras={obras}
          onChange={setEditing}
          onSave={async () => { await persist(editing); setEditing(null); }}
          onCancel={() => setEditing(null)}
          onDelete={editing.name ? async () => { await removeDoc('arch_projects', editing.id); if (selected === editing.id) setSelected(null); setEditing(null); } : undefined}
        />
      )}
    </div>
  );
}

function ProjectDetail({
  project, progress, isAdmin, userName, role, onBack, onEdit, onPersist,
}: {
  project: ArchProject;
  progress: number;
  isAdmin: boolean;
  userName: string;
  role: string;
  onBack: () => void;
  onEdit: () => void;
  onPersist: (p: ArchProject) => Promise<any> | void;
}) {
  const [openPhase, setOpenPhase] = useState<number | null>(
    project.phases.findIndex(ph => ph.state === 'aguardando_aprovacao' || ph.state === 'em_elaboracao')
  );

  const update = (phases: ArchPhase[]) => onPersist({ ...project, phases });

  const withEvent = (idx: number, ev: Omit<PhaseEvent, 'id' | 'at' | 'author' | 'role'>): ArchPhase[] =>
    project.phases.map((ph, i) => i === idx ? {
      ...ph, events: [...ph.events, { ...ev, id: uid('ev'), author: userName, role, at: new Date().toISOString() }],
    } : ph);

  const sendForApproval = (idx: number) => {
    let phases = withEvent(idx, { kind: 'envio', text: 'Entrega enviada para aprovação.' });
    phases = phases.map((ph, i) => i === idx ? { ...ph, state: 'aguardando_aprovacao' as PhaseState } : ph);
    update(phases);
  };
  const approve = (idx: number) => {
    let phases = withEvent(idx, { kind: 'aprovacao', text: 'Etapa aprovada pelo cliente.' });
    phases = phases.map((ph, i) => {
      if (i === idx) return { ...ph, state: 'aprovada' as PhaseState, approvedBy: userName, approvedAt: new Date().toISOString() };
      if (i === idx + 1 && ph.state === 'bloqueada') return { ...ph, state: 'em_elaboracao' as PhaseState };
      return ph;
    });
    update(phases);
  };
  const requestChanges = (idx: number, motivo: string) => {
    let phases = withEvent(idx, { kind: 'ajuste', text: motivo });
    phases = phases.map((ph, i) => i === idx ? { ...ph, state: 'ajustes' as PhaseState } : ph);
    update(phases);
  };
  const addFiles = async (idx: number, files: FileList) => {
    const parsed: ArchFile[] = [];
    for (const f of Array.from(files)) parsed.push(await readFileCompressed(f));
    update(project.phases.map((ph, i) => i === idx ? { ...ph, files: [...ph.files, ...parsed] } : ph));
  };
  const removeFile = (idx: number, fileId: string) =>
    update(project.phases.map((ph, i) => i === idx ? { ...ph, files: ph.files.filter(f => f.id !== fileId) } : ph));
  const addComment = (idx: number, text: string) => update(withEvent(idx, { kind: 'comentario', text }));

  return (
    <div>
      <button onClick={onBack} className="text-sm text-stone-500 hover:text-stone-900 mb-4 flex items-center gap-1.5">← Voltar aos projetos</button>

      <div className="bg-white border border-stone-200 rounded-2xl p-6 mb-5">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-serif)' }}>{project.name}</h2>
            <p className="text-sm text-stone-500 mt-1">
              {project.clientName} · {project.type}{project.area ? ` · ${project.area} m²` : ''}
              {project.responsible ? ` · Resp.: ${project.responsible}` : ''}
            </p>
          </div>
          {isAdmin && (
            <button onClick={onEdit} className="flex items-center gap-1.5 text-xs font-mono uppercase tracking-wider text-stone-500 hover:text-stone-900 px-3 py-1.5 rounded-lg hover:bg-stone-100">
              <Pencil size={13} /> Editar
            </button>
          )}
        </div>
        <div className="mt-5">
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="text-stone-500">Progresso do projeto</span>
            <span className="font-bold" style={{ color: AZUL }}>{progress}%</span>
          </div>
          <div className="h-2.5 bg-stone-100 rounded-full overflow-hidden">
            <motion.div className="h-full rounded-full" style={{ background: AZUL }}
              initial={{ width: 0 }} animate={{ width: `${progress}%` }} transition={{ duration: 0.8 }} />
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {project.phases.map((ph, i) => (
          <PhaseCard
            key={i}
            phase={ph}
            index={i}
            total={project.phases.length}
            isAdmin={isAdmin}
            isOpen={openPhase === i}
            onToggle={() => setOpenPhase(openPhase === i ? null : i)}
            onSendForApproval={() => sendForApproval(i)}
            onApprove={() => approve(i)}
            onRequestChanges={(motivo) => requestChanges(i, motivo)}
            onAddFiles={(files) => addFiles(i, files)}
            onRemoveFile={(fid) => removeFile(i, fid)}
            onAddComment={(text) => addComment(i, text)}
          />
        ))}
      </div>
    </div>
  );
}

function PhaseCard({
  phase, index, total, isAdmin, isOpen, onToggle,
  onSendForApproval, onApprove, onRequestChanges,
  onAddFiles, onRemoveFile, onAddComment,
}: {
  phase: ArchPhase; index: number; total: number; isAdmin: boolean; isOpen: boolean;
  onToggle: () => void;
  onSendForApproval: () => void; onApprove: () => void; onRequestChanges: (m: string) => void;
  onAddFiles: (files: FileList) => void; onRemoveFile: (id: string) => void; onAddComment: (t: string) => void;
}) {
  const meta = STATE_META[phase.state];
  const Icon = meta.Icon;
  const locked = phase.state === 'bloqueada';
  const [askChanges, setAskChanges] = useState(false);
  const [viewing, setViewing] = useState<ArchFile | null>(null);
  const [motivo, setMotivo] = useState('');
  const [comment, setComment] = useState('');

  const connectorColor = phase.state === 'aprovada' ? '#059669' : '#e7e5e4';

  return (
    <div className="relative">
      {index < total - 1 && (
        <div className="absolute left-[27px] top-14 bottom-[-12px] w-0.5" style={{ background: connectorColor }} />
      )}

      <div className={`bg-white border rounded-2xl overflow-hidden transition-colors ${
        phase.state === 'aguardando_aprovacao' ? 'border-[#B08A3E]/40' : 'border-stone-200'
      }`}>
        <button onClick={onToggle} disabled={locked}
          className={`w-full flex items-center gap-3 p-4 text-left ${locked ? 'cursor-default' : 'cursor-pointer hover:bg-stone-50'}`}>
          <span className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 z-10" style={{ background: `${meta.color}18` }}>
            <Icon size={16} style={{ color: meta.color }} />
          </span>
          <div className="flex-1 min-w-0">
            <p className={`text-sm font-bold ${locked ? 'text-stone-400' : 'text-stone-900'}`}>{index + 1}. {phase.name}</p>
            <p className="text-[11px] font-mono uppercase tracking-wider" style={{ color: meta.color }}>{meta.label}</p>
          </div>
          {phase.files.length > 0 && (
            <span className="text-[11px] text-stone-400 flex items-center gap-1"><FileText size={12} /> {phase.files.length}</span>
          )}
          {!locked && <ChevronRight size={16} className={`text-stone-300 transition-transform ${isOpen ? 'rotate-90' : ''}`} />}
        </button>

        {isOpen && !locked && (
          <div className="px-4 pb-4 border-t border-stone-100 pt-4 space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] font-mono uppercase tracking-wider text-stone-500 font-bold">Arquivos desta etapa</p>
                {isAdmin && (
                  <label className="flex items-center gap-1.5 text-xs font-bold cursor-pointer px-2.5 py-1 rounded-lg hover:bg-stone-100" style={{ color: AZUL }}>
                    <Upload size={13} /> Enviar arquivo
                    <input type="file" multiple accept="image/*,application/pdf" className="hidden"
                      onChange={e => e.target.files && onAddFiles(e.target.files)} />
                  </label>
                )}
              </div>
              {phase.files.length === 0 ? (
                <p className="text-xs text-stone-400 py-3 text-center bg-stone-50 rounded-lg">
                  {isAdmin ? 'Nenhum arquivo ainda. Envie plantas, PDFs ou imagens.' : 'Os arquivos desta etapa aparecerão aqui.'}
                </p>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {phase.files.map(f => (
                    <FileCard key={f.id} file={f} isAdmin={isAdmin} onRemove={() => onRemoveFile(f.id)} onView={() => setViewing(f)} />
                  ))}
                </div>
              )}
            </div>

            {!isAdmin && phase.state === 'aguardando_aprovacao' && (
              <div className="bg-[#B08A3E]/8 border border-[#B08A3E]/25 rounded-xl p-4">
                <p className="text-sm font-semibold text-stone-800 mb-1">Esta etapa aguarda sua aprovação</p>
                <p className="text-xs text-stone-500 mb-3">Revise os arquivos acima. Ao aprovar, a próxima etapa é liberada.</p>
                {!askChanges ? (
                  <div className="flex gap-2">
                    <button onClick={onApprove}
                      className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-bold">
                      <ThumbsUp size={15} /> Aprovar etapa
                    </button>
                    <button onClick={() => setAskChanges(true)}
                      className="flex items-center gap-1.5 border border-stone-300 hover:bg-stone-50 text-stone-700 px-4 py-2 rounded-lg text-sm font-bold">
                      <MessageSquare size={15} /> Solicitar ajustes
                    </button>
                  </div>
                ) : (
                  <div>
                    <textarea value={motivo} onChange={e => setMotivo(e.target.value)} rows={2}
                      placeholder="Descreva o que precisa ser ajustado..."
                      className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C2703D] mb-2" />
                    <div className="flex gap-2">
                      <button onClick={() => { if (motivo.trim()) { onRequestChanges(motivo.trim()); setMotivo(''); setAskChanges(false); } }}
                        disabled={!motivo.trim()}
                        className="flex items-center gap-1.5 bg-[#C2703D] hover:bg-[#a85f32] text-white px-4 py-2 rounded-lg text-sm font-bold disabled:opacity-40">
                        <Send size={14} /> Enviar solicitação
                      </button>
                      <button onClick={() => { setAskChanges(false); setMotivo(''); }} className="text-sm text-stone-500 px-3">Cancelar</button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {isAdmin && (phase.state === 'em_elaboracao' || phase.state === 'ajustes') && (
              <div>
                <button onClick={onSendForApproval} disabled={phase.files.length === 0}
                  className="flex items-center gap-1.5 text-white px-4 py-2 rounded-lg text-sm font-bold disabled:opacity-40" style={{ background: AZUL }}>
                  <Send size={14} /> Enviar para aprovação do cliente
                </button>
                {phase.state === 'ajustes' && (
                  <p className="text-xs text-[#C2703D] flex items-center gap-1 mt-2"><AlertTriangle size={12} /> O cliente solicitou ajustes. Faça as correções, atualize os arquivos e reenvie.</p>
                )}
              </div>
            )}

            {phase.state === 'aprovada' && phase.approvedAt && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-center gap-2">
                <CheckCircle2 size={16} className="text-emerald-600 flex-shrink-0" />
                <p className="text-xs text-emerald-800">
                  Aprovada por <b>{phase.approvedBy}</b> em {new Date(phase.approvedAt).toLocaleString('pt-BR')}.
                </p>
              </div>
            )}

            {phase.events.length > 0 && (
              <div>
                <p className="text-[10px] font-mono uppercase tracking-wider text-stone-500 font-bold mb-2">Histórico da etapa</p>
                <div className="space-y-2">
                  {phase.events.slice().reverse().map(ev => (
                    <div key={ev.id} className="flex gap-2 text-xs">
                      <span className="text-stone-300 flex-shrink-0 mt-0.5">
                        {ev.kind === 'aprovacao' ? <CheckCircle2 size={13} className="text-emerald-500" />
                          : ev.kind === 'ajuste' ? <MessageSquare size={13} className="text-[#C2703D]" />
                          : ev.kind === 'envio' ? <Send size={13} className="text-[#3E7C8B]" />
                          : <MessageSquare size={13} className="text-stone-400" />}
                      </span>
                      <div className="flex-1">
                        <p className="text-stone-700">{ev.text}</p>
                        <p className="text-[10px] text-stone-400">{ev.author} · {new Date(ev.at).toLocaleString('pt-BR')}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <input value={comment} onChange={e => setComment(e.target.value)}
                placeholder="Deixe um comentário..." className="flex-1 border border-stone-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-[#3E7C8B]" />
              <button onClick={() => { if (comment.trim()) { onAddComment(comment.trim()); setComment(''); } }}
                disabled={!comment.trim()} className="text-stone-500 hover:text-stone-900 disabled:opacity-30 px-2"><Send size={16} /></button>
            </div>
          </div>
        )}
      </div>

      {viewing && <FileViewer file={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}

function FileCard({ file, isAdmin, onRemove, onView }: {
  file: ArchFile; isAdmin: boolean; onRemove: () => void; onView: () => void;
}) {
  const isImg = file.type.startsWith('image/');
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  const download = () => {
    const a = document.createElement('a');
    a.href = file.base64; a.download = file.name; a.click();
  };
  return (
    <div className="border border-stone-200 rounded-xl overflow-hidden relative group bg-white">
      {/* Prévia — clicar abre o visualizador em tela cheia */}
      <button onClick={onView} className="w-full h-28 bg-stone-100 flex items-center justify-center relative overflow-hidden">
        {isImg
          ? <img src={file.base64} alt={file.name} className="w-full h-full object-cover" />
          : <div className="flex flex-col items-center gap-1 text-stone-400">
              <FileText size={30} style={{ color: isPdf ? '#C2703D' : undefined }} />
              <span className="text-[9px] font-mono uppercase tracking-wider">{isPdf ? 'PDF' : 'Arquivo'}</span>
            </div>}
        {/* Overlay "Visualizar" no hover */}
        <span className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
          <span className="flex items-center gap-1.5 text-white text-xs font-bold bg-black/50 px-3 py-1.5 rounded-full">
            <Eye size={13} /> Visualizar
          </span>
        </span>
      </button>
      <div className="p-2 flex items-center gap-1">
        <span className="flex-1 min-w-0 text-[11px] text-stone-600 truncate" title={file.name}>{file.name}</span>
        {/* Baixar é ação secundária */}
        <button onClick={download} className="text-stone-400 hover:text-[#3E7C8B] p-0.5" title="Baixar (opção secundária)"><Download size={13} /></button>
        {isAdmin && <button onClick={onRemove} className="text-stone-400 hover:text-red-500 p-0.5" title="Remover"><Trash2 size={13} /></button>}
      </div>
    </div>
  );
}

// Visualizador de arquivo em tela cheia (popup). PDFs e imagens 100% online.
function FileViewer({ file, onClose }: { file: ArchFile; onClose: () => void }) {
  const isImg = file.type.startsWith('image/');
  const download = () => {
    const a = document.createElement('a');
    a.href = file.base64; a.download = file.name; a.click();
  };
  // Fecha com ESC.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[200] bg-stone-900/95 flex flex-col" onClick={onClose}>
      {/* Barra superior */}
      <div className="flex items-center justify-between px-5 py-3 flex-shrink-0" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 min-w-0">
          <FileText size={16} className="text-stone-400 flex-shrink-0" />
          <span className="text-sm text-white truncate">{file.name}</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={download}
            className="flex items-center gap-1.5 text-xs font-semibold text-stone-300 hover:text-white border border-stone-600 hover:border-stone-400 px-3 py-1.5 rounded-lg transition-colors">
            <Download size={13} /> Baixar
          </button>
          <button onClick={onClose} className="text-stone-300 hover:text-white p-1.5 rounded-lg hover:bg-white/10" title="Fechar (ESC)">
            <X size={20} />
          </button>
        </div>
      </div>
      {/* Conteúdo */}
      <div className="flex-1 min-h-0 px-4 pb-4" onClick={e => e.stopPropagation()}>
        {isImg ? (
          <div className="w-full h-full flex items-center justify-center">
            <img src={file.base64} alt={file.name} className="max-w-full max-h-full object-contain rounded-lg shadow-2xl" />
          </div>
        ) : (
          <iframe
            src={file.base64}
            title={file.name}
            className="w-full h-full rounded-lg bg-white shadow-2xl border-none"
          />
        )}
      </div>
    </div>
  );
}

function ProjectEditor({
  project, clients, obras, onChange, onSave, onCancel, onDelete,
}: {
  project: ArchProject;
  clients: { id: string; name: string }[];
  obras: { id: string; name: string; clientId: string; type?: string }[];
  onChange: (p: ArchProject) => void;
  onSave: () => void; onCancel: () => void; onDelete?: () => void;
}) {
  const p = project;
  const set = (patch: Partial<ArchProject>) => onChange({ ...p, ...patch });

  // Obras filtradas pelo cliente escolhido (se houver), para o vínculo fazer sentido.
  const obrasDisponiveis = p.clientId ? obras.filter(o => o.clientId === p.clientId) : obras;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={onCancel}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold" style={{ fontFamily: 'var(--font-serif)' }}>{p.name ? 'Editar projeto' : 'Novo projeto'}</h3>
          <button onClick={onCancel} className="text-stone-400 hover:text-stone-600"><X size={18} /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="block text-[10px] font-mono uppercase tracking-wider text-stone-500 font-bold mb-1">Nome do projeto</label>
            <input value={p.name} onChange={e => set({ name: e.target.value })} placeholder="Ex.: Residência Paulo e Juliana"
              className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#3E7C8B]" />
          </div>

          {/* Cliente: puxa dos clientes já cadastrados */}
          <div>
            <label className="block text-[10px] font-mono uppercase tracking-wider text-stone-500 font-bold mb-1">Cliente</label>
            {clients.length > 0 ? (
              <select
                value={p.clientId || ''}
                onChange={e => {
                  const c = clients.find(x => x.id === e.target.value);
                  set({ clientId: e.target.value, clientName: c?.name || '', obraId: '' });
                }}
                className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#3E7C8B]"
              >
                <option value="">Selecione um cliente cadastrado…</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            ) : (
              <input value={p.clientName} onChange={e => set({ clientName: e.target.value })}
                placeholder="Nome do cliente"
                className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#3E7C8B]" />
            )}
          </div>

          {/* Obra / centro de custo: puxa das obras cadastradas (opcional) */}
          <div>
            <label className="block text-[10px] font-mono uppercase tracking-wider text-stone-500 font-bold mb-1">
              Obra vinculada <span className="text-stone-400 normal-case font-normal">(opcional)</span>
            </label>
            <select
              value={p.obraId || ''}
              onChange={e => set({ obraId: e.target.value })}
              disabled={obrasDisponiveis.length === 0}
              className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#3E7C8B] disabled:bg-stone-50 disabled:text-stone-400"
            >
              <option value="">
                {obrasDisponiveis.length === 0
                  ? (p.clientId ? 'Este cliente não tem obras cadastradas' : 'Selecione o cliente primeiro')
                  : 'Nenhuma (projeto independente)'}
              </option>
              {obrasDisponiveis.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
            <p className="text-[10px] text-stone-400 mt-1">Liga este projeto a um centro de custo/obra existente, para referência futura.</p>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-[10px] font-mono uppercase tracking-wider text-stone-500 font-bold mb-1">Tipo</label>
              <select value={p.type} onChange={e => set({ type: e.target.value })}
                className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#3E7C8B]">
                {['Residencial', 'Comercial', 'Reforma', 'Corporativo', 'Institucional', 'Outro'].map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-mono uppercase tracking-wider text-stone-500 font-bold mb-1">Área (m²)</label>
              <input value={p.area} onChange={e => set({ area: e.target.value })}
                className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#3E7C8B]" />
            </div>
            <div>
              <label className="block text-[10px] font-mono uppercase tracking-wider text-stone-500 font-bold mb-1">Responsável</label>
              <input value={p.responsible} onChange={e => set({ responsible: e.target.value })}
                className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#3E7C8B]" />
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-mono uppercase tracking-wider text-stone-500 font-bold mb-1">Observações</label>
            <textarea value={p.notes} onChange={e => set({ notes: e.target.value })} rows={2}
              className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#3E7C8B]" />
          </div>
        </div>
        <div className="flex items-center gap-2 mt-5 pt-4 border-t border-stone-150">
          <button onClick={onSave} disabled={!p.name.trim()}
            className="flex-1 text-white px-4 py-2 rounded-lg text-sm font-bold disabled:opacity-40" style={{ background: AZUL }}>Salvar projeto</button>
          {onDelete && <button onClick={onDelete} className="text-red-500 hover:bg-red-50 p-2 rounded-lg"><Trash2 size={16} /></button>}
        </div>
      </div>
    </div>
  );
}
