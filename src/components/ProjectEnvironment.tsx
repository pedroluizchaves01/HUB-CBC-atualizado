// src/components/ProjectEnvironment.tsx
//
// Ambiente de PROJETOS — arquitetura/engenharia. Independente do ambiente de Obra.
// Primeira versão: shell com navegação própria e um dashboard de projetos com fases.
// Os dados vivem em coleções próprias ('arch_projects'), sem tocar nas de obra.
//
// Estrutura pensada para crescer: cada projeto tem fases (Estudo Preliminar,
// Anteprojeto, Projeto Executivo, etc.) com status e progresso.

import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'motion/react';
import {
  Compass, LayoutGrid, FolderOpen, Plus, ArrowLeftRight, LogOut,
  Ruler, FileStack, CheckCircle2, Clock, Circle, X, Pencil, Trash2,
} from 'lucide-react';
import { subscribeCollection, saveDoc, removeDoc } from '../lib/firebaseDb';

interface Props {
  role: string;
  userName?: string;
  currentUserId?: string;
  clientId?: string;
  onLogout: () => void;
  onSwitchEnvironment: () => void;
}

// Fases típicas de um projeto de arquitetura/engenharia (ordem do fluxo).
const PHASE_TEMPLATE = [
  'Levantamento e Programa',
  'Estudo Preliminar',
  'Anteprojeto',
  'Projeto Legal (Aprovação)',
  'Projeto Executivo',
  'Detalhamento e Complementares',
];

type PhaseStatus = 'nao_iniciado' | 'em_andamento' | 'concluido';

interface ArchPhase {
  name: string;
  status: PhaseStatus;
}
interface ArchProject {
  id: string;
  name: string;
  clientName: string;
  type: string;          // residencial, comercial, reforma...
  area?: string;         // m²
  responsible?: string;
  status: 'ativo' | 'pausado' | 'concluido';
  phases: ArchPhase[];
  createdAt: string;
  notes?: string;
}

const AZUL = '#3E7C8B';
const uid = () => `arch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const STATUS_META: Record<PhaseStatus, { label: string; color: string; Icon: React.ComponentType<any> }> = {
  nao_iniciado: { label: 'Não iniciado', color: '#a8a29e', Icon: Circle },
  em_andamento: { label: 'Em andamento', color: AZUL, Icon: Clock },
  concluido: { label: 'Concluído', color: '#059669', Icon: CheckCircle2 },
};

export default function ProjectEnvironment({
  role, userName, onLogout, onSwitchEnvironment,
}: Props) {
  const [projects, setProjects] = useState<ArchProject[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<ArchProject | null>(null);

  const isAdmin = role === 'admin' || role === 'marketing';

  useEffect(() => {
    const unsub = subscribeCollection('arch_projects', setProjects, [], 'cbc_arch_projects_v1');
    return () => unsub();
  }, []);

  const selectedProject = projects.find(p => p.id === selected);

  const progressOf = (p: ArchProject) => {
    if (!p.phases?.length) return 0;
    const done = p.phases.filter(ph => ph.status === 'concluido').length;
    const partial = p.phases.filter(ph => ph.status === 'em_andamento').length * 0.5;
    return Math.round(((done + partial) / p.phases.length) * 100);
  };

  const newProject = (): ArchProject => ({
    id: uid(),
    name: '',
    clientName: '',
    type: 'Residencial',
    area: '',
    responsible: '',
    status: 'ativo',
    phases: PHASE_TEMPLATE.map(name => ({ name, status: 'nao_iniciado' as PhaseStatus })),
    createdAt: new Date().toISOString(),
    notes: '',
  });

  const saveProject = async (p: ArchProject) => {
    await saveDoc('arch_projects', p.id, p);
    setEditing(null);
  };
  const deleteProject = async (id: string) => {
    await removeDoc('arch_projects', id);
    if (selected === id) setSelected(null);
  };

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900">
      {/* Barra superior */}
      <header className="bg-white border-b border-stone-200 sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: `${AZUL}18` }}>
              <Compass size={18} style={{ color: AZUL }} />
            </span>
            <div className="leading-tight">
              <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-stone-400">Chaves Brites Correa</p>
              <h1 className="text-base font-bold" style={{ fontFamily: 'var(--font-serif)' }}>Projetos</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onSwitchEnvironment}
              className="flex items-center gap-1.5 text-xs font-mono uppercase tracking-wider text-stone-500 hover:text-stone-900 px-3 py-1.5 rounded-lg hover:bg-stone-100 transition-colors"
            >
              <ArrowLeftRight size={13} /> Trocar ambiente
            </button>
            <button
              onClick={onLogout}
              className="flex items-center gap-1.5 text-xs font-mono uppercase tracking-wider text-stone-400 hover:text-stone-700 transition-colors"
            >
              <LogOut size={13} /> Sair
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-5 py-8">
        {selectedProject ? (
          <ProjectDetail
            project={selectedProject}
            progress={progressOf(selectedProject)}
            isAdmin={isAdmin}
            onBack={() => setSelected(null)}
            onEdit={() => setEditing(selectedProject)}
            onChangePhase={async (idx, status) => {
              const updated = { ...selectedProject, phases: selectedProject.phases.map((ph, i) => i === idx ? { ...ph, status } : ph) };
              await saveDoc('arch_projects', updated.id, updated);
            }}
          />
        ) : (
          <>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-serif)' }}>
                  {isAdmin ? 'Projetos de Arquitetura e Engenharia' : 'Seus Projetos'}
                </h2>
                <p className="text-sm text-stone-500 mt-0.5">Acompanhe as fases de cada projeto, do estudo preliminar ao executivo.</p>
              </div>
              {isAdmin && (
                <button
                  onClick={() => setEditing(newProject())}
                  className="flex items-center gap-2 text-white px-4 py-2 rounded-lg text-sm font-bold transition-colors"
                  style={{ background: AZUL }}
                >
                  <Plus size={16} /> Novo projeto
                </button>
              )}
            </div>

            {projects.length === 0 ? (
              <div className="bg-white border border-stone-200 rounded-2xl py-16 text-center">
                <FolderOpen size={32} className="text-stone-300 mx-auto mb-3" />
                <p className="text-stone-500 mb-1">Nenhum projeto por aqui ainda.</p>
                <p className="text-sm text-stone-400">
                  {isAdmin ? 'Crie o primeiro projeto para começar a acompanhar suas fases.' : 'Assim que um projeto for criado, ele aparece aqui.'}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {projects.map((p, i) => {
                  const pct = progressOf(p);
                  return (
                    <motion.button
                      key={p.id}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.05 }}
                      onClick={() => setSelected(p.id)}
                      className="bg-white border border-stone-200 rounded-2xl p-5 text-left hover:border-stone-300 hover:shadow-sm transition-all group"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <span className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${AZUL}14` }}>
                          <Ruler size={18} style={{ color: AZUL }} />
                        </span>
                        <span className={`text-[10px] font-mono uppercase tracking-wider px-2 py-1 rounded-full ${
                          p.status === 'ativo' ? 'bg-emerald-50 text-emerald-700'
                          : p.status === 'concluido' ? 'bg-stone-100 text-stone-500'
                          : 'bg-amber-50 text-amber-700'
                        }`}>
                          {p.status}
                        </span>
                      </div>
                      <h3 className="font-bold text-stone-900 mb-0.5">{p.name || 'Sem nome'}</h3>
                      <p className="text-xs text-stone-500 mb-3">{p.clientName} · {p.type}</p>
                      <div className="flex items-center justify-between text-[11px] text-stone-400 mb-1.5">
                        <span>Progresso</span>
                        <span className="font-bold" style={{ color: AZUL }}>{pct}%</span>
                      </div>
                      <div className="h-1.5 bg-stone-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: AZUL }} />
                      </div>
                    </motion.button>
                  );
                })}
              </div>
            )}
          </>
        )}
      </main>

      {/* Editor de projeto (admin) */}
      {editing && (
        <ProjectEditor
          project={editing}
          onChange={setEditing}
          onSave={() => saveProject(editing)}
          onCancel={() => setEditing(null)}
          onDelete={editing.name ? () => deleteProject(editing.id) : undefined}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Detalhe de um projeto: lista de fases com status editável
// ---------------------------------------------------------------------------
function ProjectDetail({
  project, progress, isAdmin, onBack, onEdit, onChangePhase,
}: {
  project: ArchProject;
  progress: number;
  isAdmin: boolean;
  onBack: () => void;
  onEdit: () => void;
  onChangePhase: (idx: number, status: PhaseStatus) => void;
}) {
  const cycleStatus = (s: PhaseStatus): PhaseStatus =>
    s === 'nao_iniciado' ? 'em_andamento' : s === 'em_andamento' ? 'concluido' : 'nao_iniciado';

  return (
    <div>
      <button onClick={onBack} className="text-sm text-stone-500 hover:text-stone-900 mb-4 flex items-center gap-1.5">
        ← Voltar aos projetos
      </button>

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
            <span className="text-stone-500">Progresso geral do projeto</span>
            <span className="font-bold" style={{ color: AZUL }}>{progress}%</span>
          </div>
          <div className="h-2.5 bg-stone-100 rounded-full overflow-hidden">
            <motion.div className="h-full rounded-full" style={{ background: AZUL }}
              initial={{ width: 0 }} animate={{ width: `${progress}%` }} transition={{ duration: 0.8 }} />
          </div>
        </div>
        {project.notes && <p className="text-sm text-stone-600 mt-4 bg-stone-50 rounded-lg p-3">{project.notes}</p>}
      </div>

      <div className="bg-white border border-stone-200 rounded-2xl p-6">
        <h3 className="font-bold text-stone-900 mb-1 flex items-center gap-2">
          <FileStack size={17} style={{ color: AZUL }} /> Fases do projeto
        </h3>
        <p className="text-xs text-stone-500 mb-4">
          {isAdmin ? 'Clique no status de uma fase para avançá-la.' : 'Acompanhe o andamento de cada fase.'}
        </p>
        <div className="space-y-2">
          {project.phases.map((ph, i) => {
            const meta = STATUS_META[ph.status];
            const Icon = meta.Icon;
            return (
              <div key={i} className="flex items-center gap-3 py-2 border-b border-stone-100 last:border-none">
                <span className="w-6 h-6 rounded-full bg-stone-100 flex items-center justify-center text-[10px] font-bold text-stone-500 flex-shrink-0">
                  {i + 1}
                </span>
                <span className="flex-1 text-sm text-stone-700">{ph.name}</span>
                <button
                  disabled={!isAdmin}
                  onClick={() => isAdmin && onChangePhase(i, cycleStatus(ph.status))}
                  className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full transition-colors ${isAdmin ? 'cursor-pointer hover:opacity-80' : 'cursor-default'}`}
                  style={{ background: `${meta.color}18`, color: meta.color }}
                >
                  <Icon size={13} /> {meta.label}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Editor de projeto (criar/editar)
// ---------------------------------------------------------------------------
function ProjectEditor({
  project, onChange, onSave, onCancel, onDelete,
}: {
  project: ArchProject;
  onChange: (p: ArchProject) => void;
  onSave: () => void;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  const p = project;
  const set = (patch: Partial<ArchProject>) => onChange({ ...p, ...patch });

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={onCancel}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold" style={{ fontFamily: 'var(--font-serif)' }}>
            {p.name ? 'Editar projeto' : 'Novo projeto'}
          </h3>
          <button onClick={onCancel} className="text-stone-400 hover:text-stone-600"><X size={18} /></button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-[10px] font-mono uppercase tracking-wider text-stone-500 font-bold mb-1">Nome do projeto</label>
            <input value={p.name} onChange={e => set({ name: e.target.value })}
              placeholder="Ex.: Residência Paulo e Juliana"
              className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#3E7C8B]" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-mono uppercase tracking-wider text-stone-500 font-bold mb-1">Cliente</label>
              <input value={p.clientName} onChange={e => set({ clientName: e.target.value })}
                className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#3E7C8B]" />
            </div>
            <div>
              <label className="block text-[10px] font-mono uppercase tracking-wider text-stone-500 font-bold mb-1">Tipo</label>
              <select value={p.type} onChange={e => set({ type: e.target.value })}
                className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#3E7C8B]">
                {['Residencial', 'Comercial', 'Reforma', 'Corporativo', 'Institucional', 'Outro'].map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
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
            <label className="block text-[10px] font-mono uppercase tracking-wider text-stone-500 font-bold mb-1">Status</label>
            <select value={p.status} onChange={e => set({ status: e.target.value as any })}
              className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#3E7C8B]">
              <option value="ativo">Ativo</option>
              <option value="pausado">Pausado</option>
              <option value="concluido">Concluído</option>
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-mono uppercase tracking-wider text-stone-500 font-bold mb-1">Observações</label>
            <textarea value={p.notes} onChange={e => set({ notes: e.target.value })} rows={2}
              className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#3E7C8B]" />
          </div>
        </div>

        <div className="flex items-center gap-2 mt-5 pt-4 border-t border-stone-150">
          <button onClick={onSave} disabled={!p.name.trim()}
            className="flex-1 text-white px-4 py-2 rounded-lg text-sm font-bold disabled:opacity-40" style={{ background: AZUL }}>
            Salvar projeto
          </button>
          {onDelete && (
            <button onClick={onDelete} className="text-red-500 hover:bg-red-50 p-2 rounded-lg">
              <Trash2 size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
