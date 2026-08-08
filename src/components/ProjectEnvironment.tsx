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
  Download, FileText, ChevronRight, MessageSquare, ThumbsUp, Send, Eye, Loader2,
  Sun, Wind, Thermometer, Droplets, Compass as CompassIcon, ClipboardList,
  Home, Menu, BookOpen, Leaf, Building2,
} from 'lucide-react';
import { subscribeCollection, saveDoc, removeDoc } from '../lib/firebaseDb';
import { PROJECT_BG } from '../lib/projectBackground';
import { sendTelegramDocument } from '../lib/telegramService';
import { analisarConfortoTermico, coordsDeLocalizacao, type Orientacao } from '../lib/thermalAnalysis';
import { openThermalReport } from '../lib/thermalReportHtml';
import { NORMAS_TECNICAS, REFERENCIAS, comentarioTecnico, comentarioOrientacao } from '../lib/thermalAnalysis';
import { WindRose, SolarChart, TempBars, ComfortBar } from './thermal/ThermalCharts';
import { DEFAULT_BRIEFING, BRIEFING_GROUPS, type BriefingQuestion, type BriefingAnswer } from '../lib/briefingTemplate';

interface Props {
  role: string;
  userName?: string;
  currentUserId?: string;
  clientId?: string;
  clients?: { id: string; name: string }[];
  obras?: { id: string; name: string; clientId: string; type?: string; location?: string; area?: number }[];
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
  uploadedAt: string;
  // Storage: arquivos vão para o Telegram (fileId/url). base64 fica só como
  // miniatura leve de imagens (preview rápido) — nunca o arquivo pesado.
  storage?: 'telegram' | 'inline';
  fileId?: string;      // id no Telegram (quando storage='telegram')
  url?: string;         // caminho do proxy para visualizar/baixar
  size?: number;        // tamanho em bytes do arquivo original
  base64?: string;      // miniatura (imagens) ou conteúdo (legado/inline)
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
  // Premissas para o estudo de conforto térmico
  localizacao?: string;    // "Cidade, UF"
  latitude?: number;
  longitude?: number;
  orientacao?: string;     // fachada frontal: N, S, L, O, NE, SE, SO, NO
  // Briefing do cliente (primeira etapa). Perguntas editáveis pelo arquiteto.
  briefingQuestions?: BriefingQuestion[];
  briefingAnswers?: BriefingAnswer[];
  briefingDone?: boolean;
  briefingDoneAt?: string;
}

// Paleta MONOCROMÁTICA: preto absoluto (#000) e branco absoluto (#fff).
// A hierarquia vem do PESO da Poppins (light 300 ↔ bold 700/900), não da cor.
// Estados diferenciados por preenchimento e peso, sem cor.
const PRETO = '#000000';
const BRANCO = '#ffffff';
const uid = (p = 'arch') => `${p}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

// Cada estado: fill (fundo do marcador), stroke (borda), fg (cor do conteúdo do marcador),
// filled (se o marcador é preto sólido), weight (peso do rótulo).
const STATE_META: Record<PhaseState, {
  label: string; filled: boolean; muted: boolean; Icon: React.ComponentType<any>;
}> = {
  bloqueada:            { label: 'Bloqueada',                filled: false, muted: true,  Icon: Lock },
  em_elaboracao:        { label: 'Em elaboração',            filled: false, muted: false, Icon: Clock },
  aguardando_aprovacao: { label: 'Aguardando aprovação',    filled: false, muted: false, Icon: AlertTriangle },
  ajustes:              { label: 'Ajustes solicitados',     filled: false, muted: false, Icon: MessageSquare },
  aprovada:             { label: 'Aprovada',                 filled: true,  muted: false, Icon: CheckCircle2 },
};

// Lê um File como base64 (data URL).
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Falha ao ler o arquivo.'));
    reader.onload = () => resolve(reader.result as string);
    reader.readAsDataURL(file);
  });
}

// Gera uma miniatura leve (JPEG) de uma imagem, para preview rápido no card.
function makeThumbnail(base64: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const maxW = 320; // miniatura pequena — só para o card (mantém o documento leve)
      const scale = Math.min(1, maxW / img.width);
      const canvas = document.createElement('canvas');
      canvas.width = img.width * scale; canvas.height = img.height * scale;
      const ctx = canvas.getContext('2d');
      if (!ctx) return resolve('');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.6));
    };
    img.onerror = () => resolve('');
    img.src = base64;
  });
}

// Sobe o arquivo ao Telegram (storage) e devolve o ArchFile com a referência.
// Imagens ganham uma miniatura leve inline para preview instantâneo.
// O arquivo completo (PDF/imagem em alta) fica no Telegram, acessível por url/fileId.
async function uploadArchFile(file: File): Promise<ArchFile> {
  const base64 = await fileToBase64(file);
  const isImg = file.type.startsWith('image/');
  const thumb = isImg ? await makeThumbnail(base64) : undefined;

  const sent = await sendTelegramDocument(base64, file.name, file.type || 'application/octet-stream');
  return {
    id: uid('file'),
    name: file.name,
    type: file.type,
    uploadedAt: new Date().toISOString(),
    storage: 'telegram',
    fileId: sent.fileId,
    url: sent.url,
    size: file.size,
    base64: thumb, // só a miniatura (ou undefined para PDFs)
  };
}

// ============ SHELL DE NAVEGAÇÃO ============
// === NOVO SHELL DE NAVEGAÇÃO (parte 2/3 do ProjectEnvironment) ===
// Este arquivo é concatenado após as fundações. Não é importado diretamente.

// ---------------------------------------------------------------------------
// Componente principal: lista de projetos (admin) OU entra direto no projeto (cliente)
// ---------------------------------------------------------------------------
export default function ProjectEnvironment({
  role, userName, clientId, clients = [], obras = [], onLogout, onSwitchEnvironment, onGoToSelect,
}: Props) {
  const [allProjects, setAllProjects] = useState<ArchProject[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<ArchProject | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ArchProject | null>(null);
  // Admin pode ver o projeto "como cliente" (preview).
  const [previewClient, setPreviewClient] = useState(false);

  const isAdminReal = role === 'admin' || role === 'marketing';

  useEffect(() => {
    const unsub = subscribeCollection('arch_projects', setAllProjects, [], 'cbc_arch_projects_v1');
    return () => unsub();
  }, []);

  const projects = isAdminReal ? allProjects : allProjects.filter(p => p.clientId && p.clientId === clientId);
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
    phases: PHASE_TEMPLATE.map((name) => ({ name, state: 'bloqueada' as PhaseState, files: [], events: [] })),
    createdAt: new Date().toISOString(), notes: '',
    briefingQuestions: DEFAULT_BRIEFING.map(q => ({ ...q })),
    briefingAnswers: [], briefingDone: false,
  });

  const persist = (p: ArchProject) => {
    try {
      const bytes = new Blob([JSON.stringify(p)]).size;
      if (bytes > 60 * 1024 * 1024) {
        alert(`Este projeto está muito grande para salvar (${(bytes / 1024 / 1024).toFixed(0)}MB). Remova arquivos antigos e reenvie pelo botão de arquivo.`);
        return Promise.resolve();
      }
    } catch { /* segue */ }
    return saveDoc('arch_projects', p.id, p);
  };

  const saveEditing = async () => {
    if (!editing || !editing.name.trim()) return;
    await persist(editing);
    setSelected(editing.id);
    setEditing(null);
  };

  // ----- Página do projeto (shell com sidebar) -----
  if (selectedProject) {
    return (
      <div className="projeto-dark min-h-screen text-white relative">
        <ProjectBackground />
        <ProjectShell
          project={selectedProject}
          isAdminReal={isAdminReal}
          previewClient={previewClient}
          onTogglePreview={() => setPreviewClient(v => !v)}
          userName={userName}
          role={role}
          progress={progressOf(selectedProject)}
          onBack={() => { setSelected(null); setPreviewClient(false); }}
          onEdit={() => setEditing(selectedProject)}
          onPersist={persist}
          onLogout={onLogout}
          onSwitchEnvironment={onSwitchEnvironment}
          onGoToSelect={onGoToSelect}
          clients={clients}
          obras={obras}
        />
        {editing && (
          <ProjectEditor
            project={editing} clients={clients} obras={obras}
            onCancel={() => setEditing(null)} onChange={setEditing}
            onSave={saveEditing} onDelete={undefined}
          />
        )}
      </div>
    );
  }

  // ----- Cliente sem projeto selecionado: entra direto no seu projeto -----
  if (!isAdminReal) {
    const meu = projects[0];
    useEffect(() => { if (meu) setSelected(meu.id); }, [meu?.id]);
    return (
      <div className="projeto-dark min-h-screen text-white relative">
        <ProjectBackground />
        <div className="relative z-10 flex items-center justify-center min-h-screen px-6">
          <div className="text-center max-w-md">
            <Compass size={40} strokeWidth={1.25} className="mx-auto mb-4 opacity-60" />
            <p className="text-lg" style={{ fontFamily: 'var(--font-serif)', fontWeight: 700 }}>
              {meu ? 'Abrindo seu projeto…' : 'Nenhum projeto ainda'}
            </p>
            <p className="text-sm text-white/60 mt-2" style={{ fontWeight: 300 }}>
              {meu ? '' : 'Assim que seu arquiteto criar seu projeto, ele aparecerá aqui.'}
            </p>
            <button onClick={onLogout} className="mt-6 text-xs font-mono uppercase tracking-wider text-white/50 hover:text-white">Sair</button>
          </div>
        </div>
      </div>
    );
  }

  // ----- Admin: lista/seleção de projetos -----
  return (
    <div className="projeto-dark min-h-screen text-white relative">
      <ProjectBackground />
      <header className="bg-black/40 backdrop-blur-xl border-b border-white/15 sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 bg-black flex items-center justify-center"><Compass size={20} /></span>
            <div>
              <p className="text-[10px] font-mono uppercase tracking-[0.22em] text-white/50">Chaves Brites Correa</p>
              <h1 className="text-lg"><span style={{ fontWeight: 700 }}>Estúdio</span><span style={{ fontWeight: 300 }}> de Projetos</span></h1>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs font-mono uppercase">
            <button onClick={onSwitchEnvironment} className="px-3 py-1.5 border border-white/40 hover:bg-white hover:text-black transition-colors flex items-center gap-1.5"><ArrowLeftRight size={13} /> Obra</button>
            {onGoToSelect && <button onClick={onGoToSelect} className="px-3 py-1.5 text-white/60 hover:text-white">Início</button>}
            <button onClick={onLogout} className="px-3 py-1.5 text-white/60 hover:text-white flex items-center gap-1.5"><LogOut size={13} /> Sair</button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-5 py-8 relative z-10">
        <div className="flex items-end justify-between mb-8">
          <div>
            <h2 className="text-3xl tracking-tight" style={{ fontFamily: 'var(--font-serif)' }}>
              <span style={{ fontWeight: 300 }}>Projetos de </span><span style={{ fontWeight: 700 }}>Arquitetura</span>
            </h2>
            <p className="text-sm text-white/60 mt-2" style={{ fontWeight: 300 }}>Selecione um projeto para entrar, ou cadastre um novo.</p>
          </div>
          <button onClick={() => setEditing(newProject())}
            className="flex items-center gap-2 bg-black text-white px-5 py-2.5 text-sm border border-white/35 hover:bg-white hover:text-black transition-colors" style={{ fontWeight: 600 }}>
            <Plus size={16} /> Novo projeto
          </button>
        </div>

        {projects.length === 0 ? (
          <div className="border-2 border-dashed border-white/30 p-12 text-center">
            <FolderOpen size={36} strokeWidth={1.25} className="mx-auto mb-3 opacity-50" />
            <p className="text-sm text-white/60" style={{ fontWeight: 300 }}>Nenhum projeto cadastrado. Clique em "Novo projeto" para começar.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map(p => {
              const prog = progressOf(p);
              return (
                <div key={p.id} className="group relative border-2 border-white/25 hover:border-white bg-black/30 backdrop-blur-md transition-colors cursor-pointer"
                  onClick={() => setSelected(p.id)}>
                  <div className="p-6">
                    <div className="flex items-start justify-between mb-8">
                      <Ruler size={22} strokeWidth={1.5} />
                      <button onClick={e => { e.stopPropagation(); setConfirmDelete(p); }}
                        className="opacity-0 group-hover:opacity-100 text-white/40 hover:text-white transition-opacity" title="Excluir"><Trash2 size={16} /></button>
                    </div>
                    <h3 className="text-xl leading-tight" style={{ fontFamily: 'var(--font-serif)', fontWeight: 700 }}>{p.name}</h3>
                    <p className="text-xs text-white/60 mt-1" style={{ fontWeight: 300 }}>{p.clientName || 'Sem cliente'} · {p.type}</p>
                    <div className="mt-6">
                      <div className="flex justify-between items-baseline mb-2">
                        <span className="text-[10px] font-mono uppercase tracking-[0.1em] text-white/50">Progresso</span>
                        <span className="text-lg font-mono" style={{ fontWeight: 700 }}>{prog}%</span>
                      </div>
                      <div className="h-px bg-white/20 relative">
                        <div className="absolute left-0 top-0 h-px bg-white" style={{ width: `${prog}%` }} />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {editing && (
        <ProjectEditor
          project={editing} clients={clients} obras={obras}
          onCancel={() => setEditing(null)} onChange={setEditing}
          onSave={saveEditing}
          onDelete={editing.name ? () => { setConfirmDelete(editing); setEditing(null); } : undefined}
        />
      )}
      {confirmDelete && (
        <ConfirmDialog
          title="Excluir projeto"
          message={`Tem certeza que deseja excluir "${confirmDelete.name}"? Esta ação é permanente e apaga todos os arquivos e o histórico.`}
          confirmLabel="Excluir projeto"
          onCancel={() => setConfirmDelete(null)}
          onConfirm={async () => { await removeDoc('arch_projects', confirmDelete.id); setConfirmDelete(null); if (selected === confirmDelete.id) setSelected(null); }}
        />
      )}
    </div>
  );
}

// Fundo compartilhado (foto desfocada + véu).
function ProjectBackground() {
  return (
    <div className="fixed inset-0 z-0 pointer-events-none" aria-hidden>
      <div className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url(${PROJECT_BG})`, filter: 'blur(8px) brightness(0.5)', transform: 'scale(1.06)' }} />
      <div className="absolute inset-0 bg-black/60" />
    </div>
  );
}

// ============ PÁGINAS ============
// === PROJECT SHELL — sidebar fixa + páginas (parte 3/3) ===

type PageId = 'inicio' | 'termico' | 'briefing' | string; // string = fase-<idx>

function ProjectShell({
  project, isAdminReal, previewClient, onTogglePreview, userName, role, progress,
  onBack, onEdit, onPersist, onLogout, onSwitchEnvironment, onGoToSelect, clients, obras,
}: {
  project: ArchProject;
  isAdminReal: boolean;
  previewClient: boolean;
  onTogglePreview: () => void;
  userName?: string;
  role: string;
  progress: number;
  onBack: () => void;
  onEdit: () => void;
  onPersist: (p: ArchProject) => Promise<any> | void;
  onLogout: () => void;
  onSwitchEnvironment: () => void;
  onGoToSelect?: () => void;
  clients: { id: string; name: string }[];
  obras: any[];
}) {
  // Papel efetivo: admin que ativou "ver como cliente" age como cliente.
  const isAdmin = isAdminReal && !previewClient;
  const [page, setPage] = useState<PageId>('inicio');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const hasThermal = !!(project.localizacao && project.latitude != null && project.longitude != null);

  // Itens do menu lateral.
  const navItems: { id: PageId; label: string; Icon: React.ComponentType<any>; badge?: string; locked?: boolean }[] = [
    { id: 'inicio', label: 'Início', Icon: Home },
    { id: 'termico', label: 'Conforto Térmico', Icon: Sun, locked: !hasThermal },
    { id: 'briefing', label: 'Briefing de Premissas', Icon: ClipboardList, badge: project.briefingDone ? '✓' : undefined },
    ...project.phases.map((ph, i) => ({
      id: `fase-${i}`, label: ph.name, Icon: phaseIcon(ph.state),
      locked: ph.state === 'bloqueada',
    })),
  ];

  const NavButton = ({ item }: { item: typeof navItems[number] }) => {
    const active = page === item.id;
    return (
      <button
        onClick={() => { setPage(item.id); setSidebarOpen(false); }}
        className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors text-sm relative ${
          active ? 'bg-white text-black' : 'text-white/70 hover:text-white hover:bg-white/10'
        }`}
        style={{ fontWeight: active ? 700 : 400 }}
      >
        <item.Icon size={16} className="flex-shrink-0" />
        <span className="flex-1 min-w-0 truncate">{item.label}</span>
        {item.badge && <span className="text-xs">{item.badge}</span>}
        {item.locked && <Lock size={12} className="opacity-50 flex-shrink-0" />}
      </button>
    );
  };

  return (
    <div className="relative z-10 flex min-h-screen">
      {/* Sidebar */}
      <aside className={`fixed lg:sticky top-0 left-0 h-screen w-72 flex-shrink-0 bg-black/60 backdrop-blur-xl border-r border-white/15 z-30 transition-transform ${
        sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
      } flex flex-col`}>
        {/* topo da sidebar */}
        <div className="p-5 border-b border-white/15">
          <button onClick={onBack} className="text-xs font-mono uppercase tracking-wider text-white/50 hover:text-white flex items-center gap-1.5 mb-4">
            ← Projetos
          </button>
          <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-white/40 mb-1">Projeto</p>
          <h1 className="text-xl leading-tight" style={{ fontFamily: 'var(--font-serif)', fontWeight: 700 }}>{project.name}</h1>
          <p className="text-xs text-white/50 mt-1" style={{ fontWeight: 300 }}>{project.clientName}</p>
          {/* progresso */}
          <div className="mt-4">
            <div className="flex justify-between items-baseline mb-1.5">
              <span className="text-[9px] font-mono uppercase tracking-[0.1em] text-white/40">Progresso</span>
              <span className="text-sm font-mono" style={{ fontWeight: 700 }}>{progress}%</span>
            </div>
            <div className="h-px bg-white/20 relative"><div className="absolute left-0 top-0 h-px bg-white" style={{ width: `${progress}%` }} /></div>
          </div>
        </div>

        {/* navegação */}
        <nav className="flex-1 overflow-y-auto py-3">
          <p className="px-4 text-[9px] font-mono uppercase tracking-[0.15em] text-white/30 mb-1">Etapas</p>
          {navItems.map(item => <NavButton key={item.id} item={item} />)}
        </nav>

        {/* rodapé da sidebar */}
        <div className="p-4 border-t border-white/15 space-y-1">
          {isAdminReal && (
            <button onClick={onTogglePreview}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs border border-white/30 hover:bg-white hover:text-black transition-colors" style={{ fontWeight: 600 }}>
              <Eye size={13} /> {previewClient ? 'Ver como admin' : 'Ver como cliente'}
            </button>
          )}
          {isAdminReal && (
            <button onClick={onEdit} className="w-full flex items-center gap-2 px-3 py-2 text-xs text-white/60 hover:text-white transition-colors">
              <Pencil size={13} /> Editar projeto
            </button>
          )}
          <div className="flex items-center gap-1 pt-1">
            <button onClick={onSwitchEnvironment} className="flex-1 text-[10px] font-mono uppercase text-white/50 hover:text-white px-2 py-1.5 border border-white/20">Obra</button>
            <button onClick={onLogout} className="flex-1 text-[10px] font-mono uppercase text-white/50 hover:text-white px-2 py-1.5 border border-white/20">Sair</button>
          </div>
        </div>
      </aside>

      {/* Overlay mobile */}
      {sidebarOpen && <div className="fixed inset-0 bg-black/50 z-20 lg:hidden" onClick={() => setSidebarOpen(false)} />}

      {/* Conteúdo */}
      <div className="flex-1 min-w-0">
        {/* barra mobile */}
        <div className="lg:hidden sticky top-0 z-10 bg-black/50 backdrop-blur-xl border-b border-white/15 px-4 py-3 flex items-center gap-3">
          <button onClick={() => setSidebarOpen(true)} className="p-1"><Menu size={20} /></button>
          <span className="text-sm truncate" style={{ fontWeight: 600 }}>{project.name}</span>
        </div>

        {/* badge "vendo como cliente" */}
        {isAdminReal && previewClient && (
          <div className="bg-white/10 border-b border-white/20 px-6 py-2 text-center">
            <span className="text-xs font-mono uppercase tracking-wider text-white/80">👁 Visualizando como o cliente vê</span>
          </div>
        )}

        <div className="max-w-4xl mx-auto px-6 py-8">
          <ProjectPage page={page} project={project} isAdmin={isAdmin} userName={userName} role={role} onPersist={onPersist} onNavigate={setPage} />
        </div>
      </div>
    </div>
  );
}

// Roteador de páginas.
function ProjectPage({ page, project, isAdmin, userName, role, onPersist, onNavigate }: {
  page: PageId; project: ArchProject; isAdmin: boolean; userName?: string; role: string;
  onPersist: (p: ArchProject) => Promise<any> | void; onNavigate: (p: PageId) => void;
}) {
  if (page === 'inicio') return <PageInicio project={project} isAdmin={isAdmin} userName={userName} onNavigate={onNavigate} />;
  if (page === 'termico') return <PageTermico project={project} />;
  if (page === 'briefing') return <PageBriefing project={project} isAdmin={isAdmin} userName={userName} role={role} onPersist={onPersist} />;
  if (page.startsWith('fase-')) {
    const idx = parseInt(page.split('-')[1], 10);
    return <PageFase project={project} idx={idx} isAdmin={isAdmin} userName={userName} role={role} onPersist={onPersist} />;
  }
  return null;
}

function phaseIcon(state: PhaseState): React.ComponentType<any> {
  if (state === 'aprovada') return CheckCircle2;
  if (state === 'aguardando_aprovacao') return Clock;
  if (state === 'ajustes') return AlertTriangle;
  if (state === 'bloqueada') return Lock;
  return Ruler;
}
// === PÁGINAS: Início, Briefing, Fase ===

// Página inicial: contrato + boas-vindas + explicação do fluxo.
function PageInicio({ project, isAdmin, userName, onNavigate }: {
  project: ArchProject; isAdmin: boolean; userName?: string; onNavigate: (p: PageId) => void;
}) {
  const fluxo = [
    { n: '01', t: 'Conforto Térmico', d: 'Estudo técnico das premissas climáticas do seu terreno.', pg: 'termico' as PageId },
    { n: '02', t: 'Briefing de Premissas', d: 'Você conta o que deseja: programa, estilo, necessidades.', pg: 'briefing' as PageId },
    { n: '03', t: 'Fases do Projeto', d: 'Do levantamento ao detalhamento — você acompanha e aprova cada etapa.', pg: 'fase-0' as PageId },
  ];
  return (
    <div>
      {/* Boas-vindas */}
      <div className="mb-8">
        <p className="text-[10px] font-mono uppercase tracking-[0.25em] text-white/40 mb-3">
          {userName ? `Olá, ${userName}` : 'Bem-vindo'}
        </p>
        <h1 className="text-4xl tracking-tight leading-tight" style={{ fontFamily: 'var(--font-serif)' }}>
          <span style={{ fontWeight: 300 }}>Bem-vindo à sua </span><span style={{ fontWeight: 700 }}>área de projetos</span>
        </h1>
        <p className="text-white/70 mt-4 leading-relaxed max-w-2xl" style={{ fontWeight: 300 }}>
          Aqui você acompanha todo o desenvolvimento do seu projeto arquitetônico, do estudo inicial ao detalhamento final.
          Cada etapa aparece no menu à esquerda. Você poderá visualizar arquivos, responder o briefing, aprovar entregas
          e conversar com o arquiteto ao longo do caminho.
        </p>
      </div>

      {/* Dados do contrato */}
      <div className="border-2 border-white/30 bg-black/30 backdrop-blur-md mb-8">
        <div className="px-5 py-3 border-b-2 border-white/30 flex items-center gap-2">
          <FileText size={15} /> <p className="text-sm" style={{ fontWeight: 700 }}>Seu contrato</p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-white/15">
          {[
            ['Projeto', project.name],
            ['Cliente', project.clientName || '—'],
            ['Tipo', project.type],
            ['Área', project.area ? `${project.area} m²` : '—'],
            ['Responsável técnico', project.responsible || '—'],
            ['Localização', project.localizacao || '—'],
            ['Início', new Date(project.createdAt).toLocaleDateString('pt-BR')],
            ['Status', project.status === 'ativo' ? 'Em andamento' : project.status],
          ].map(([label, val]) => (
            <div key={label} className="bg-black/40 px-4 py-3">
              <p className="text-[9px] font-mono uppercase tracking-[0.12em] text-white/40 mb-1">{label}</p>
              <p className="text-sm" style={{ fontWeight: 600 }}>{val}</p>
            </div>
          ))}
        </div>
        {project.notes && (
          <div className="px-5 py-3 border-t-2 border-white/30">
            <p className="text-[9px] font-mono uppercase tracking-[0.12em] text-white/40 mb-1">Observações</p>
            <p className="text-sm text-white/80" style={{ fontWeight: 300 }}>{project.notes}</p>
          </div>
        )}
      </div>

      {/* Como funciona o fluxo */}
      <div>
        <p className="text-[10px] font-mono uppercase tracking-[0.15em] text-white/40 mb-4">Como funciona</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {fluxo.map(f => (
            <button key={f.n} onClick={() => onNavigate(f.pg)}
              className="text-left border-2 border-white/25 hover:border-white bg-black/30 backdrop-blur-md p-5 transition-colors group">
              <p className="text-3xl font-mono text-white/30 group-hover:text-white transition-colors" style={{ fontWeight: 700 }}>{f.n}</p>
              <p className="text-base mt-2" style={{ fontFamily: 'var(--font-serif)', fontWeight: 700 }}>{f.t}</p>
              <p className="text-xs text-white/60 mt-1 leading-relaxed" style={{ fontWeight: 300 }}>{f.d}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// Página do briefing (reusa a lógica do BriefingCard, agora como página).
function PageBriefing({ project, isAdmin, userName, role, onPersist }: {
  project: ArchProject; isAdmin: boolean; userName?: string; role: string;
  onPersist: (p: ArchProject) => Promise<any> | void;
}) {
  const saveBriefingAnswers = (answers: BriefingAnswer[]) => onPersist({ ...project, briefingAnswers: answers });
  const finishBriefing = (answers: BriefingAnswer[]) => {
    const phases = project.phases.map((ph, i) => {
      if (i === 0 && ph.state === 'bloqueada') {
        return { ...ph, state: 'em_elaboracao' as PhaseState, events: [...ph.events, {
          id: uid('ev'), kind: 'comentario' as const, author: userName || 'Cliente', role,
          at: new Date().toISOString(), text: 'Briefing respondido pelo cliente. Levantamento liberado.',
        }] };
      }
      return ph;
    });
    onPersist({ ...project, briefingAnswers: answers, briefingDone: true, briefingDoneAt: new Date().toISOString(), phases });
  };
  return (
    <div>
      <PageHeader eyebrow="Etapa 02" title="Briefing de Premissas" subtitle="Programa de necessidades e desejos do cliente" />
      <BriefingCard project={project} isAdmin={isAdmin} onSaveAnswers={saveBriefingAnswers} onFinish={finishBriefing} />
    </div>
  );
}

// Página de uma fase do projeto (reusa o PhaseCard).
function PageFase({ project, idx, isAdmin, userName, role, onPersist }: {
  project: ArchProject; idx: number; isAdmin: boolean; userName?: string; role: string;
  onPersist: (p: ArchProject) => Promise<any> | void;
}) {
  const phase = project.phases[idx];
  if (!phase) return null;

  const update = (phases: ArchPhase[]) => onPersist({ ...project, phases });
  const withEvent = (ev: Omit<PhaseEvent, 'id' | 'at' | 'author' | 'role'>): ArchPhase[] =>
    project.phases.map((ph, i) => i === idx ? {
      ...ph, events: [...ph.events, { ...ev, id: uid('ev'), author: userName || '', role, at: new Date().toISOString() }],
    } : ph);

  const addFiles = async (files: FileList, onStatus?: (m: string | null) => void) => {
    const parsed: ArchFile[] = [];
    const arr = Array.from(files);
    for (let k = 0; k < arr.length; k++) {
      const f = arr[k];
      if (f.size > 50 * 1024 * 1024) { onStatus?.(null); alert(`"${f.name}" excede 50MB.`); continue; }
      try { onStatus?.(`Enviando ${arr.length > 1 ? `(${k + 1}/${arr.length}) ` : ''}${f.name}…`); parsed.push(await uploadArchFile(f)); }
      catch (e: any) { onStatus?.(null); alert(`Falha ao enviar "${f.name}": ${e?.message || 'erro'}.`); }
    }
    onStatus?.(null);
    if (parsed.length) update(project.phases.map((ph, i) => i === idx ? { ...ph, files: [...ph.files, ...parsed] } : ph));
  };
  const removeFile = (fileId: string) => update(project.phases.map((ph, i) => i === idx ? { ...ph, files: ph.files.filter(f => f.id !== fileId) } : ph));
  const sendForApproval = () => { let ph = withEvent({ kind: 'envio', text: 'Entrega enviada para aprovação.' }); ph = ph.map((p, i) => i === idx ? { ...p, state: 'aguardando_aprovacao' as PhaseState } : p); update(ph); };
  const approve = () => {
    let ph = withEvent({ kind: 'aprovacao', text: 'Etapa aprovada pelo cliente.' });
    ph = ph.map((p, i) => {
      if (i === idx) return { ...p, state: 'aprovada' as PhaseState, approvedBy: userName, approvedAt: new Date().toISOString() };
      if (i === idx + 1 && p.state === 'bloqueada') return { ...p, state: 'em_elaboracao' as PhaseState };
      return p;
    });
    update(ph);
  };
  const requestChanges = (motivo: string) => { let ph = withEvent({ kind: 'ajuste', text: motivo }); ph = ph.map((p, i) => i === idx ? { ...p, state: 'ajustes' as PhaseState } : p); update(ph); };
  const addComment = (text: string) => update(withEvent({ kind: 'comentario', text }));

  return (
    <div>
      <PageHeader eyebrow={`Fase ${String(idx + 1).padStart(2, '0')}`} title={phase.name} subtitle={STATE_META[phase.state].label} />
      <PhaseCard
        phase={phase} index={idx} total={project.phases.length} isAdmin={isAdmin}
        userName={userName || ''} isOpen locked={phase.state === 'bloqueada'} onToggle={() => {}}
        onAddFiles={addFiles} onRemoveFile={removeFile} onAddComment={addComment}
        onApprove={approve} onRequestChanges={requestChanges} onSendForApproval={sendForApproval}
      />
    </div>
  );
}

// Cabeçalho padrão de página.
function PageHeader({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle?: string }) {
  return (
    <div className="mb-6">
      <p className="text-[10px] font-mono uppercase tracking-[0.25em] text-white/40 mb-2">{eyebrow}</p>
      <h1 className="text-3xl tracking-tight" style={{ fontFamily: 'var(--font-serif)', fontWeight: 700 }}>{title}</h1>
      {subtitle && <p className="text-sm text-white/60 mt-1" style={{ fontWeight: 300 }}>{subtitle}</p>}
    </div>
  );
}
// === PÁGINA: Dashboard de Conforto Térmico ===

function PageTermico({ project }: { project: ArchProject }) {
  const hasLocation = !!(project.localizacao && project.latitude != null && project.longitude != null);
  if (!hasLocation) {
    return (
      <div>
        <PageHeader eyebrow="Etapa 01" title="Estudo de Conforto Térmico" />
        <div className="border-2 border-dashed border-white/30 p-10 text-center">
          <Sun size={32} strokeWidth={1.25} className="mx-auto mb-3 opacity-50" />
          <p className="text-sm text-white/60" style={{ fontWeight: 300 }}>
            Informe a localização do projeto (no cadastro) para gerar o estudo técnico automático.
          </p>
        </div>
      </div>
    );
  }

  const r = analisarConfortoTermico({
    localizacao: project.localizacao!, latitude: project.latitude!, longitude: project.longitude!,
    tipoEdificacao: project.type, orientacao: (project.orientacao as Orientacao) || 'N',
    areaConstruida: project.area ? Number(project.area) : undefined,
  });
  const d = r.dados;

  const metrics: { Icon: React.ComponentType<any>; label: string; value: string; sub: string; grad: string }[] = [
    { Icon: Thermometer, label: 'Temp. média', value: `${d.tempMedia}°C`, sub: `${d.tempMin}–${d.tempMax}°C`, grad: 'linear-gradient(135deg,#F76707,#E8590C)' },
    { Icon: Droplets, label: 'Umidade', value: `${d.umidadeMedia}%`, sub: `${d.precipitacao}mm/ano`, grad: 'linear-gradient(135deg,#1C7ED6,#1971C2)' },
    { Icon: Wind, label: 'Ventos', value: d.ventosPredominantes, sub: `${d.velocidadeVento} m/s`, grad: 'linear-gradient(135deg,#0CA678,#087f5b)' },
    { Icon: Sun, label: 'Insolação', value: r.insolacao, sub: r.exposicao, grad: 'linear-gradient(135deg,#F59F00,#E8590C)' },
  ];

  const Card = ({ title, icon: Icon, children, accent }: { title: string; icon: React.ComponentType<any>; children: React.ReactNode; accent?: string }) => (
    <div className="border-2 border-white/25 bg-black/30 backdrop-blur-md">
      <div className="px-4 py-2.5 border-b-2 border-white/25 flex items-center gap-2">
        <Icon size={14} style={{ color: accent }} /> <p className="text-xs font-mono uppercase tracking-[0.1em]" style={{ fontWeight: 700 }}>{title}</p>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );

  return (
    <div>
      <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
        <PageHeader eyebrow="Etapa 01" title="Estudo de Conforto Térmico" subtitle={`${project.localizacao} · Clima ${d.clima}`} />
        <button onClick={() => openThermalReport(r, {
          projeto: project.name, localizacao: project.localizacao!, latitude: project.latitude!,
          longitude: project.longitude!, tipo: project.type, area: project.area,
        })}
          className="flex items-center gap-1.5 text-xs text-white px-4 py-2 border border-white/30 transition-colors" style={{ fontWeight: 600, background: 'linear-gradient(135deg,#1C7ED6,#1971C2)' }}>
          <Download size={13} /> Exportar PDF
        </button>
      </div>

      {/* Métricas */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        {metrics.map(m => (
          <div key={m.label} className="p-4 text-white flex items-center gap-3" style={{ background: m.grad }}>
            <div className="w-11 h-11 flex-shrink-0 bg-white/20 flex items-center justify-center"><m.Icon size={22} /></div>
            <div>
              <p className="text-[9px] uppercase tracking-[0.1em] opacity-90" style={{ fontWeight: 500 }}>{m.label}</p>
              <p className="text-xl leading-none" style={{ fontWeight: 800 }}>{m.value}</p>
              <p className="text-[9px] opacity-85" style={{ fontWeight: 300 }}>{m.sub}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Zona de conforto */}
      <div className="border-2 border-white/25 bg-black/30 backdrop-blur-md p-4 mb-4">
        <p className="text-xs font-mono uppercase tracking-[0.1em] text-white/50 mb-2" style={{ fontWeight: 700 }}>Faixa de conforto térmico</p>
        <ComfortBar media={d.tempMedia} />
        <p className="text-[10px] text-white/40 mt-1" style={{ fontWeight: 300 }}>A zona de conforto (18–26°C) é destacada. O marcador indica a temperatura média local.</p>
      </div>

      {/* Gráficos: rosa dos ventos + carta solar + temp mensal */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <Card title="Rosa dos Ventos" icon={Wind} accent="#1C7ED6">
          <div className="aspect-square max-w-[220px] mx-auto"><WindRose predominante={d.ventosPredominantes} /></div>
          <p className="text-[11px] text-white/60 mt-2 leading-relaxed" style={{ fontWeight: 300 }}>
            Ventos predominantes de <b className="text-white">{d.ventosPredominantes}</b>. Quente: {d.periodoVentoQuente}. Frio: {d.periodoVentoFrio}.
          </p>
        </Card>
        <Card title="Trajetória Solar" icon={Sun} accent="#F59F00">
          <SolarChart latitude={d.latitude} />
          <p className="text-[11px] text-white/60 mt-2 leading-relaxed" style={{ fontWeight: 300 }}>
            {comentarioOrientacao((project.orientacao as string) || 'N')}
          </p>
        </Card>
        <Card title="Temperatura ao longo do ano" icon={Thermometer} accent="#E8590C">
          <TempBars media={d.tempMedia} max={d.tempMax} min={d.tempMin} />
          <p className="text-[11px] text-white/60 mt-2 leading-relaxed" style={{ fontWeight: 300 }}>
            Período crítico: <b className="text-white">{r.periodoCritico}</b>. Amplitude de {d.tempMax - d.tempMin}°C.
          </p>
        </Card>
      </div>

      {/* Fundamentação técnica */}
      <div className="border-2 border-white/25 bg-black/30 backdrop-blur-md p-5 mb-4">
        <p className="text-xs font-mono uppercase tracking-[0.1em] text-white/50 mb-2 flex items-center gap-2" style={{ fontWeight: 700 }}>
          <BookOpen size={14} /> Fundamentação técnica
        </p>
        <p className="text-sm text-white/85 leading-relaxed" style={{ fontWeight: 300 }}>{comentarioTecnico(d.classificacao)}</p>
      </div>

      {/* Estratégias em 3 colunas */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <StrategyList title="Recomendações" icon={Leaf} items={r.recomendacoes} accent="#E8590C" />
        <StrategyList title="Arquitetônicas" icon={Building2} items={d.solucoes.arquitetonicas} accent="#1C7ED6" />
        <StrategyList title="Construtivas" icon={Ruler} items={d.solucoes.construtivas} accent="#0CA678" />
      </div>

      {/* Detalhes técnicos */}
      <div className="border-2 border-white/25 bg-black/30 backdrop-blur-md p-5 mb-4">
        <p className="text-xs font-mono uppercase tracking-[0.1em] text-white/50 mb-3" style={{ fontWeight: 700 }}>Diretrizes dimensionais</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
          {d.solucoes.detalhes.map((it, i) => (
            <div key={i} className="flex gap-2 text-sm text-white/80" style={{ fontWeight: 300 }}>
              <span className="text-white/40">—</span> {it}
            </div>
          ))}
        </div>
      </div>

      {/* Normas e referências */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="border-2 border-white/25 bg-black/30 backdrop-blur-md p-5">
          <p className="text-xs font-mono uppercase tracking-[0.1em] text-white/50 mb-3 flex items-center gap-2" style={{ fontWeight: 700 }}>
            <FileText size={14} /> Normas aplicáveis
          </p>
          <div className="space-y-3">
            {NORMAS_TECNICAS.map(n => (
              <div key={n.codigo} className="border-l-2 border-white/30 pl-3">
                <p className="text-sm" style={{ fontWeight: 700 }}>{n.codigo}</p>
                <p className="text-xs text-white/70" style={{ fontWeight: 400 }}>{n.titulo}</p>
                <p className="text-[11px] text-white/50 mt-0.5" style={{ fontWeight: 300 }}>{n.aplicacao}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="border-2 border-white/25 bg-black/30 backdrop-blur-md p-5">
          <p className="text-xs font-mono uppercase tracking-[0.1em] text-white/50 mb-3 flex items-center gap-2" style={{ fontWeight: 700 }}>
            <BookOpen size={14} /> Referências bibliográficas
          </p>
          <div className="space-y-2.5">
            {REFERENCIAS.map((ref, i) => (
              <div key={i} className="text-xs leading-relaxed" style={{ fontWeight: 300 }}>
                <span className="text-white/80" style={{ fontWeight: 500 }}>{ref.autor}</span>{' '}
                <span className="text-white/60 italic">{ref.obra}</span>{' '}
                <span className="text-white/40">({ref.ano})</span>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-white/40 mt-4" style={{ fontWeight: 300 }}>
            Estudo automático de premissas gerado a partir da localização e orientação. Serve como diretriz inicial e deve ser validado pelo responsável técnico.
          </p>
        </div>
      </div>
    </div>
  );
}

function StrategyList({ title, icon: Icon, items, accent }: { title: string; icon: React.ComponentType<any>; items: string[]; accent: string }) {
  return (
    <div className="border-2 border-white/25 bg-black/30 backdrop-blur-md">
      <div className="px-4 py-2.5 border-b-2 border-white/25 flex items-center gap-2">
        <Icon size={14} style={{ color: accent }} /> <p className="text-xs font-mono uppercase tracking-[0.1em]" style={{ fontWeight: 700 }}>{title}</p>
      </div>
      <ul className="p-4 space-y-2">
        {items.map((it, i) => (
          <li key={i} className="flex gap-2 text-sm text-white/80 leading-snug" style={{ fontWeight: 300 }}>
            <span style={{ color: accent }} className="flex-shrink-0 mt-0.5">▸</span> {it}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ============ PEÇAS REUTILIZÁVEIS ============
function BriefingCard({ project, isAdmin, onSaveAnswers, onFinish }: {
  project: ArchProject;
  isAdmin: boolean;
  onSaveAnswers: (a: BriefingAnswer[]) => void;
  onFinish: (a: BriefingAnswer[]) => void;
}) {
  const [open, setOpen] = useState(!project.briefingDone);
  const questions = project.briefingQuestions && project.briefingQuestions.length > 0
    ? project.briefingQuestions
    : DEFAULT_BRIEFING;

  const [draft, setDraft] = useState<Record<string, string>>(() => {
    const m: Record<string, string> = {};
    (project.briefingAnswers || []).forEach(a => { m[a.questionId] = a.answer; });
    return m;
  });

  const toAnswers = (): BriefingAnswer[] =>
    questions.map(q => ({ questionId: q.id, answer: draft[q.id] || '' })).filter(a => a.answer.trim() !== '');

  const respondidas = questions.filter(q => (draft[q.id] || '').trim() !== '').length;
  const total = questions.length;
  const pct = total > 0 ? Math.round((respondidas / total) * 100) : 0;

  const grupos = BRIEFING_GROUPS.filter(g => questions.some(q => q.group === g));
  const gruposExtras = Array.from(new Set(questions.map(q => q.group))).filter(g => !BRIEFING_GROUPS.includes(g));
  const ordemGrupos = [...grupos, ...gruposExtras];

  // ----- Visão do ADMIN: lê as respostas -----
  if (isAdmin) {
    return (
      <div className="border-2 border-black mb-6">
        <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between px-4 py-3 border-b-2 border-black hover:bg-stone-50 transition-colors">
          <p className="text-sm flex items-center gap-2" style={{ fontWeight: 700 }}>
            <ClipboardList size={15} /> Briefing do cliente
            {project.briefingDone
              ? <span className="text-[10px] font-mono uppercase tracking-wider bg-black text-white px-2 py-0.5">Respondido</span>
              : <span className="text-[10px] font-mono uppercase tracking-wider border border-black px-2 py-0.5">Aguardando cliente</span>}
          </p>
          <ChevronRight size={16} className={`transition-transform ${open ? 'rotate-90' : ''}`} />
        </button>
        {open && (
          <div className="p-4 space-y-4">
            {!project.briefingDone && respondidas === 0 && (
              <p className="text-xs text-black/60" style={{ fontWeight: 300 }}>
                O cliente ainda não respondeu o briefing. As respostas aparecerão aqui assim que ele preencher. Você pode editar as perguntas no botão "Editar projeto".
              </p>
            )}
            {ordemGrupos.map(grupo => {
              const qs = questions.filter(q => q.group === grupo);
              const respondidasGrupo = qs.filter(q => (draft[q.id] || '').trim() !== '');
              if (respondidasGrupo.length === 0 && !project.briefingDone) return null;
              return (
                <div key={grupo}>
                  <p className="text-[10px] font-mono uppercase tracking-[0.12em] text-black/50 font-bold mb-2">{grupo}</p>
                  <div className="space-y-2.5">
                    {qs.map(q => (
                      <div key={q.id} className="border-l-2 border-black pl-3">
                        <p className="text-xs text-black/60" style={{ fontWeight: 500 }}>{q.text}</p>
                        <p className="text-sm mt-0.5" style={{ fontWeight: 300 }}>
                          {(draft[q.id] || '').trim() || <span className="text-black/30 italic">— sem resposta —</span>}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ----- Visão do CLIENTE já concluído: resumo compacto -----
  if (project.briefingDone && !open) {
    return (
      <div className="border-2 border-black mb-6 flex items-center justify-between px-4 py-3">
        <p className="text-sm flex items-center gap-2" style={{ fontWeight: 700 }}>
          <CheckCircle2 size={16} /> Briefing concluído — obrigado!
        </p>
        <button onClick={() => setOpen(true)} className="text-xs px-3 py-1.5 border border-black hover:bg-black hover:text-white transition-colors" style={{ fontWeight: 600 }}>
          Revisar respostas
        </button>
      </div>
    );
  }

  // ----- Visão do CLIENTE: responde -----
  return (
    <div className="border-2 border-black mb-6">
      <div className="px-4 py-4 border-b-2 border-black">
        <p className="text-lg flex items-center gap-2" style={{ fontFamily: 'var(--font-serif)', fontWeight: 700 }}>
          <ClipboardList size={18} /> Briefing do seu projeto
        </p>
        <p className="text-xs text-black/60 mt-1" style={{ fontWeight: 300 }}>
          Conte para o arquiteto o que você deseja. Quanto mais detalhes, melhor o projeto. Você pode salvar e continuar depois.
        </p>
        <div className="flex items-center gap-2 mt-3">
          <div className="flex-1 h-1 bg-stone-200 relative">
            <div className="absolute left-0 top-0 h-1 bg-black transition-all" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-[11px] font-mono" style={{ fontWeight: 600 }}>{respondidas}/{total}</span>
        </div>
      </div>

      <div className="p-4 space-y-5 max-h-[60vh] overflow-y-auto">
        {ordemGrupos.map(grupo => (
          <div key={grupo}>
            <p className="text-[10px] font-mono uppercase tracking-[0.12em] text-black/50 font-bold mb-3 pb-1 border-b border-black/20">{grupo}</p>
            <div className="space-y-4">
              {questions.filter(q => q.group === grupo).map(q => (
                <div key={q.id}>
                  <label className="block text-sm mb-1.5" style={{ fontWeight: 500 }}>{q.text}</label>
                  <textarea
                    value={draft[q.id] || ''}
                    onChange={e => setDraft(d => ({ ...d, [q.id]: e.target.value }))}
                    rows={2}
                    placeholder="Sua resposta..."
                    className="w-full border-2 border-black px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black placeholder:text-black/30"
                    style={{ fontWeight: 300 }}
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row items-stretch gap-2 p-4 border-t-2 border-black">
        <button
          onClick={() => onSaveAnswers(toAnswers())}
          className="flex items-center justify-center gap-1.5 border-2 border-black px-4 py-2.5 text-sm hover:bg-stone-50 transition-colors"
          style={{ fontWeight: 600 }}>
          <Send size={14} /> Salvar rascunho
        </button>
        <button
          onClick={() => {
            if (respondidas < total) {
              if (!confirm(`Você respondeu ${respondidas} de ${total} perguntas. Deseja enviar assim mesmo? As não respondidas ficarão em branco.`)) return;
            }
            onFinish(toAnswers());
            setOpen(false);
          }}
          className="flex-1 flex items-center justify-center gap-1.5 bg-black text-white px-4 py-2.5 text-sm hover:bg-white hover:text-black border-2 border-black transition-colors"
          style={{ fontWeight: 700 }}>
          <CheckCircle2 size={15} /> Concluir briefing e enviar
        </button>
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
  onAddFiles: (files: FileList, onStatus?: (msg: string | null) => void) => void; onRemoveFile: (id: string) => void; onAddComment: (t: string) => void;
}) {
  const meta = STATE_META[phase.state];
  const Icon = meta.Icon;
  const locked = phase.state === 'bloqueada';
  const [askChanges, setAskChanges] = useState(false);
  const [viewing, setViewing] = useState<ArchFile | null>(null);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [motivo, setMotivo] = useState('');
  const [comment, setComment] = useState('');

  const connectorColor = phase.state === 'aprovada' ? '#000' : '#d6d3d1';

  return (
    <div className="relative">
      {index < total - 1 && (
        <div className="absolute left-[32px] top-[52px] bottom-[-12px] w-0.5 z-0" style={{ background: connectorColor }} />
      )}

      <div className={`bg-white border overflow-hidden transition-all ${
        phase.state === 'aguardando_aprovacao' ? 'border-black border-2' : phase.state === 'bloqueada' ? 'border-stone-300' : 'border-black'
      }`}>
        <button onClick={onToggle} disabled={locked}
          className={`w-full flex items-center gap-3 p-4 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-black ${locked ? 'cursor-default' : 'cursor-pointer hover:bg-stone-50'}`}>
          {/* Marcador: aprovada = preto sólido; ativa = contorno preto grosso; bloqueada = cinza fino */}
          <span className="relative w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 z-10 font-mono text-xs bg-white"
            style={{
              background: meta.filled ? '#000' : '#fff',
              color: meta.filled ? '#fff' : (meta.muted ? '#a8a29e' : '#000'),
              border: meta.muted ? '1px solid #d6d3d1' : (meta.filled ? '2px solid #000' : '2px solid #000'),
              fontWeight: 700,
            }}>
            {meta.filled
              ? <Icon size={16} className="text-white" />
              : String(index + 1).padStart(2, '0')}
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-sm" style={{ fontFamily: 'var(--font-serif)', fontWeight: 700, color: meta.muted ? '#a8a29e' : '#000' }}>{phase.name}</p>
            <p className="text-[10px] font-mono uppercase tracking-[0.12em] mt-0.5 flex items-center gap-1" style={{ color: meta.muted ? '#a8a29e' : '#000', fontWeight: 500 }}>
              <Icon size={11} /> {meta.label}
            </p>
          </div>
          {phase.files.length > 0 && (
            <span className="text-[11px] text-black/60 flex items-center gap-1 flex-shrink-0 font-mono"><FileText size={12} /> {phase.files.length}</span>
          )}
          {!locked && <ChevronRight size={16} className={`text-black transition-transform flex-shrink-0 ${isOpen ? 'rotate-90' : ''}`} />}
        </button>

        {isOpen && !locked && (
          <div className="px-4 pb-4 border-t border-black pt-4 space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] font-mono uppercase tracking-[0.12em] text-black font-bold">Arquivos desta etapa</p>
                {isAdmin && (
                  <label className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 border border-black transition-colors ${uploadStatus ? 'opacity-50 cursor-wait' : 'cursor-pointer hover:bg-black hover:text-white'}`} style={{ fontWeight: 600 }}>
                    {uploadStatus ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
                    {uploadStatus ? 'Enviando…' : 'Enviar arquivo'}
                    <input type="file" multiple accept="image/*,application/pdf" className="hidden" disabled={!!uploadStatus}
                      onChange={e => { if (e.target.files) { onAddFiles(e.target.files, setUploadStatus); e.target.value = ''; } }} />
                  </label>
                )}
              </div>
              {uploadStatus && (
                <p className="text-[11px] text-black/70 mb-2 flex items-center gap-1.5" style={{ fontWeight: 300 }}>
                  <Loader2 size={11} className="animate-spin" /> {uploadStatus}
                </p>
              )}
              {phase.files.length === 0 ? (
                <p className="text-xs text-black/50 py-4 text-center border border-dashed border-black/30" style={{ fontWeight: 300 }}>
                  {isAdmin ? 'Nenhum arquivo ainda. Envie plantas, PDFs ou imagens.' : 'Os arquivos desta etapa aparecerão aqui.'}
                </p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {phase.files.map(f => (
                    <FileCard key={f.id} file={f} isAdmin={isAdmin} onRemove={() => onRemoveFile(f.id)} onView={() => setViewing(f)} />
                  ))}
                </div>
              )}
            </div>

            {!isAdmin && phase.state === 'aguardando_aprovacao' && (
              <div className="border-2 border-black p-4">
                <p className="text-sm mb-1" style={{ fontWeight: 700 }}>Esta etapa aguarda sua aprovação</p>
                <p className="text-xs text-black/60 mb-3" style={{ fontWeight: 300 }}>Revise os arquivos acima. Ao aprovar, a próxima etapa é liberada.</p>
                {!askChanges ? (
                  <div className="flex flex-col sm:flex-row gap-2">
                    <button onClick={onApprove}
                      className="flex items-center justify-center gap-1.5 bg-black text-white px-4 py-2.5 text-sm hover:bg-white hover:text-black border-2 border-black transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2" style={{ fontWeight: 700 }}>
                      <ThumbsUp size={15} /> Aprovar etapa
                    </button>
                    <button onClick={() => setAskChanges(true)}
                      className="flex items-center justify-center gap-1.5 bg-white border-2 border-black text-black px-4 py-2.5 text-sm hover:bg-black hover:text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2" style={{ fontWeight: 600 }}>
                      <MessageSquare size={15} /> Solicitar ajustes
                    </button>
                  </div>
                ) : (
                  <div>
                    <textarea value={motivo} onChange={e => setMotivo(e.target.value)} rows={2}
                      placeholder="Descreva o que precisa ser ajustado..."
                      className="w-full border-2 border-black px-3 py-2 text-sm text-black placeholder:text-black/40 focus:outline-none focus:ring-2 focus:ring-black mb-2" style={{ fontWeight: 300 }} />
                    <div className="flex flex-col sm:flex-row gap-2">
                      <button onClick={() => { if (motivo.trim()) { onRequestChanges(motivo.trim()); setMotivo(''); setAskChanges(false); } }}
                        disabled={!motivo.trim()}
                        className="flex items-center justify-center gap-1.5 bg-black text-white px-4 py-2.5 text-sm disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white hover:text-black border-2 border-black transition-colors" style={{ fontWeight: 700 }}>
                        <Send size={14} /> Enviar solicitação
                      </button>
                      <button onClick={() => { setAskChanges(false); setMotivo(''); }} className="text-sm text-black/60 hover:text-black px-3 py-2.5" style={{ fontWeight: 600 }}>Cancelar</button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {isAdmin && (phase.state === 'em_elaboracao' || phase.state === 'ajustes') && (
              <div>
                <button onClick={onSendForApproval} disabled={phase.files.length === 0}
                  className="w-full sm:w-auto flex items-center justify-center gap-1.5 bg-black text-white px-4 py-2.5 text-sm disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white hover:text-black border-2 border-black transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2"
                  style={{ fontWeight: 700 }}>
                  <Send size={14} /> Enviar para aprovação do cliente
                </button>
                {phase.files.length === 0 && (
                  <p className="text-xs text-black/50 mt-1.5" style={{ fontWeight: 300 }}>Envie ao menos um arquivo antes de mandar para aprovação.</p>
                )}
                {phase.state === 'ajustes' && phase.files.length > 0 && (
                  <p className="text-xs mt-2 flex items-center gap-1 text-black" style={{ fontWeight: 500 }}><AlertTriangle size={12} /> O cliente pediu ajustes. Corrija, atualize os arquivos e reenvie.</p>
                )}
              </div>
            )}

            {phase.state === 'aprovada' && phase.approvedAt && (
              <div className="bg-black text-white p-3 flex items-center gap-2">
                <CheckCircle2 size={16} className="text-white flex-shrink-0" />
                <p className="text-xs" style={{ fontWeight: 300 }}>
                  Aprovada por <b style={{ fontWeight: 700 }}>{phase.approvedBy}</b> em {new Date(phase.approvedAt).toLocaleString('pt-BR')}.
                </p>
              </div>
            )}

            {phase.events.length > 0 && (
              <div>
                <p className="text-[10px] font-mono uppercase tracking-[0.12em] text-black font-bold mb-2">Histórico da etapa</p>
                <div className="space-y-2.5">
                  {phase.events.slice().reverse().map(ev => (
                    <div key={ev.id} className="flex gap-2.5 text-xs">
                      <span className="flex-shrink-0 mt-0.5 text-black">
                        {ev.kind === 'aprovacao' ? <CheckCircle2 size={14} />
                          : ev.kind === 'ajuste' ? <MessageSquare size={14} />
                          : ev.kind === 'envio' ? <Send size={14} />
                          : <MessageSquare size={14} />}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-black" style={{ fontWeight: 400 }}>{ev.text}</p>
                        <p className="text-[10px] text-black/50 mt-0.5 font-mono">{ev.author} · {new Date(ev.at).toLocaleString('pt-BR')}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <input value={comment} onChange={e => setComment(e.target.value)}
                placeholder="Deixe um comentário..." className="flex-1 border-2 border-black px-3 py-2 text-sm text-black placeholder:text-black/40 focus:outline-none focus:ring-2 focus:ring-black" style={{ fontWeight: 300 }} />
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

// Resolve a URL do arquivo: Telegram (proxy) ou base64 legado (inline).
function fileHref(file: ArchFile): string {
  if (file.storage === 'telegram' && file.url) return file.url;
  return file.base64 || '';
}

function FileCard({ file, isAdmin, onRemove, onView }: {
  file: ArchFile; isAdmin: boolean; onRemove: () => void; onView: () => void;
}) {
  const isImg = file.type.startsWith('image/');
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  const href = fileHref(file);
  const sizeLabel = file.size ? `${(file.size / 1024 / 1024).toFixed(1)} MB` : '';
  const download = () => {
    // Baixa o arquivo COMPLETO (Telegram) — abre o proxy numa nova aba para o navegador salvar.
    const a = document.createElement('a');
    a.href = href; a.download = file.name; a.target = '_blank'; a.rel = 'noopener'; a.click();
  };
  // Preview do card: miniatura leve (base64) para imagens; ícone para PDF.
  const thumb = isImg ? file.base64 : undefined;
  return (
    <div className="border border-black overflow-hidden relative group bg-white">
      <button onClick={onView} className="w-full h-28 bg-stone-100 flex items-center justify-center relative overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-black">
        {thumb
          ? <img src={thumb} alt={file.name} className="w-full h-full object-cover grayscale" />
          : <div className="flex flex-col items-center gap-1 text-black">
              <FileText size={30} strokeWidth={1.25} />
              <span className="text-[9px] font-mono uppercase tracking-wider">{isPdf ? 'PDF' : 'Arquivo'}{sizeLabel ? ` · ${sizeLabel}` : ''}</span>
            </div>}
        <span className="absolute inset-0 bg-black/0 group-hover:bg-black/70 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
          <span className="flex items-center gap-1.5 text-white text-xs bg-black px-3 py-1.5 border border-white" style={{ fontWeight: 700 }}>
            <Eye size={13} /> Visualizar
          </span>
        </span>
      </button>
      <div className="p-2 flex items-center gap-1 border-t border-black">
        <span className="flex-1 min-w-0 text-[11px] text-black truncate" title={file.name} style={{ fontWeight: 300 }}>{file.name}</span>
        <button onClick={download} className="text-black/50 hover:text-black p-0.5" title="Baixar arquivo completo"><Download size={13} /></button>
        {isAdmin && <button onClick={onRemove} className="text-black/50 hover:text-black p-0.5" title="Remover"><Trash2 size={13} /></button>}
      </div>
    </div>
  );
}

// Visualizador de arquivo em tela cheia (popup). PDFs e imagens 100% online.
// ---------------------------------------------------------------------------
// Resumo do estudo de conforto térmico (no detalhe do projeto)
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Briefing do cliente — primeira etapa do projeto
// ---------------------------------------------------------------------------
function FileViewer({ file, onClose }: { file: ArchFile; onClose: () => void }) {
  const isImg = file.type.startsWith('image/');
  const href = fileHref(file);
  const download = () => {
    const a = document.createElement('a');
    a.href = href; a.download = file.name; a.target = '_blank'; a.rel = 'noopener'; a.click();
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
            <img src={href} alt={file.name} className="max-w-full max-h-full object-contain rounded-lg shadow-2xl" />
          </div>
        ) : (
          <iframe
            src={href}
            title={file.name}
            className="w-full h-full rounded-lg bg-white shadow-2xl border-none"
          />
        )}
      </div>
    </div>
  );
}

// Editor das perguntas do briefing (usado dentro do ProjectEditor).
function BriefingEditor({ questions, onChange }: {
  questions: BriefingQuestion[];
  onChange: (qs: BriefingQuestion[]) => void;
}) {
  const [openEd, setOpenEd] = useState(false);
  const grupos = Array.from(new Set(questions.map(q => q.group)));

  const updateText = (id: string, text: string) =>
    onChange(questions.map(q => q.id === id ? { ...q, text } : q));
  const remove = (id: string) => onChange(questions.filter(q => q.id !== id));
  const addTo = (group: string) =>
    onChange([...questions, { id: uid('q'), group, text: 'Nova pergunta' }]);

  return (
    <div className="border-2 border-black">
      <button type="button" onClick={() => setOpenEd(!openEd)} className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-stone-50 transition-colors">
        <span className="text-[10px] font-mono uppercase tracking-[0.12em] font-bold flex items-center gap-1.5">
          <ClipboardList size={12} /> Perguntas do briefing ({questions.length})
        </span>
        <ChevronRight size={15} className={`transition-transform ${openEd ? 'rotate-90' : ''}`} />
      </button>
      {openEd && (
        <div className="p-3 border-t-2 border-black space-y-4 max-h-[50vh] overflow-y-auto">
          <p className="text-[10px] text-stone-400">O cliente responde estas perguntas como primeira etapa. Edite os textos, remova ou adicione o que quiser.</p>
          {grupos.map(grupo => (
            <div key={grupo}>
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] font-mono uppercase tracking-[0.12em] text-black/50 font-bold">{grupo}</p>
                <button type="button" onClick={() => addTo(grupo)} className="text-[10px] flex items-center gap-1 border border-black px-2 py-0.5 hover:bg-black hover:text-white transition-colors" style={{ fontWeight: 600 }}>
                  <Plus size={10} /> Pergunta
                </button>
              </div>
              <div className="space-y-2">
                {questions.filter(q => q.group === grupo).map(q => (
                  <div key={q.id} className="flex items-start gap-2">
                    <textarea
                      value={q.text}
                      onChange={e => updateText(q.id, e.target.value)}
                      rows={2}
                      className="flex-1 border border-black px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-black"
                      style={{ fontWeight: 300 }}
                    />
                    <button type="button" onClick={() => remove(q.id)} className="text-black/40 hover:text-black p-1 flex-shrink-0" title="Remover pergunta">
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ProjectEditor({
  project, clients, obras, onChange, onSave, onCancel, onDelete,
}: {
  project: ArchProject;
  clients: { id: string; name: string }[];
  obras: { id: string; name: string; clientId: string; type?: string; location?: string; area?: number }[];
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
              className="w-full border-2 border-black px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black" />
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
                className="w-full border-2 border-black px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
              >
                <option value="">Selecione um cliente cadastrado…</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            ) : (
              <input value={p.clientName} onChange={e => set({ clientName: e.target.value })}
                placeholder="Nome do cliente"
                className="w-full border-2 border-black px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black" />
            )}
          </div>

          {/* Obra / centro de custo: puxa das obras cadastradas (opcional) */}
          <div>
            <label className="block text-[10px] font-mono uppercase tracking-wider text-stone-500 font-bold mb-1">
              Obra vinculada <span className="text-stone-400 normal-case font-normal">(opcional)</span>
            </label>
            <select
              value={p.obraId || ''}
              onChange={e => {
                const obraId = e.target.value;
                const obra = obras.find(o => o.id === obraId);
                // Puxa da obra o que houver; completa só os campos ainda vazios.
                const patch: Partial<ArchProject> = { obraId };
                if (obra) {
                  if (obra.location && !p.localizacao) {
                    patch.localizacao = obra.location;
                    const c = coordsDeLocalizacao(obra.location);
                    if (c) { patch.latitude = c.lat; patch.longitude = c.lon; }
                  }
                  if (obra.area && !p.area) patch.area = String(obra.area);
                }
                set(patch);
              }}
              disabled={obrasDisponiveis.length === 0}
              className="w-full border-2 border-black px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black disabled:bg-stone-100 disabled:text-black/40"
            >
              <option value="">
                {obrasDisponiveis.length === 0
                  ? (p.clientId ? 'Este cliente não tem obras cadastradas' : 'Selecione o cliente primeiro')
                  : 'Nenhuma (projeto independente)'}
              </option>
              {obrasDisponiveis.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
            <p className="text-[10px] text-stone-400 mt-1">Liga o projeto a uma obra e puxa a localização dela para o estudo térmico.</p>
          </div>

          {/* Premissas do estudo de conforto térmico */}
          <div className="border-2 border-black p-3 space-y-3">
            <p className="text-[10px] font-mono uppercase tracking-[0.12em] font-bold flex items-center gap-1.5">
              <Sun size={12} /> Premissas do estudo térmico
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-3">
                <label className="block text-[10px] font-mono uppercase tracking-wider text-stone-500 font-bold mb-1">Localização (Cidade, UF)</label>
                <input value={p.localizacao || ''} placeholder="Ex.: Campo Mourão, PR"
                  onChange={e => {
                    const loc = e.target.value;
                    const patch: Partial<ArchProject> = { localizacao: loc };
                    const c = coordsDeLocalizacao(loc);
                    if (c) { patch.latitude = c.lat; patch.longitude = c.lon; }
                    set(patch);
                  }}
                  className="w-full border-2 border-black px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black" />
              </div>
              <div>
                <label className="block text-[10px] font-mono uppercase tracking-wider text-stone-500 font-bold mb-1">Latitude</label>
                <input type="number" step="0.01" value={p.latitude ?? ''} placeholder="-24.04"
                  onChange={e => set({ latitude: e.target.value === '' ? undefined : Number(e.target.value) })}
                  className="w-full border-2 border-black px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black" />
              </div>
              <div>
                <label className="block text-[10px] font-mono uppercase tracking-wider text-stone-500 font-bold mb-1">Longitude</label>
                <input type="number" step="0.01" value={p.longitude ?? ''} placeholder="-52.38"
                  onChange={e => set({ longitude: e.target.value === '' ? undefined : Number(e.target.value) })}
                  className="w-full border-2 border-black px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black" />
              </div>
              <div>
                <label className="block text-[10px] font-mono uppercase tracking-wider text-stone-500 font-bold mb-1">Orientação frontal</label>
                <select value={p.orientacao || 'N'} onChange={e => set({ orientacao: e.target.value })}
                  className="w-full border-2 border-black px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black">
                  {['N', 'S', 'L', 'O', 'NE', 'SE', 'SO', 'NO'].map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
            </div>
            <p className="text-[10px] text-stone-400">A latitude/longitude são preenchidas automaticamente para cidades conhecidas; ajuste se necessário.</p>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-[10px] font-mono uppercase tracking-wider text-stone-500 font-bold mb-1">Tipo</label>
              <select value={p.type} onChange={e => set({ type: e.target.value })}
                className="w-full border-2 border-black px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black">
                {['Residencial', 'Comercial', 'Reforma', 'Corporativo', 'Institucional', 'Outro'].map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-mono uppercase tracking-wider text-stone-500 font-bold mb-1">Área (m²)</label>
              <input value={p.area} onChange={e => set({ area: e.target.value })}
                className="w-full border-2 border-black px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black" />
            </div>
            <div>
              <label className="block text-[10px] font-mono uppercase tracking-wider text-stone-500 font-bold mb-1">Responsável</label>
              <input value={p.responsible} onChange={e => set({ responsible: e.target.value })}
                className="w-full border-2 border-black px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black" />
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-mono uppercase tracking-wider text-stone-500 font-bold mb-1">Observações</label>
            <textarea value={p.notes} onChange={e => set({ notes: e.target.value })} rows={2}
              className="w-full border-2 border-black px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black" />
          </div>

          {/* Perguntas do briefing (editáveis) */}
          <BriefingEditor
            questions={p.briefingQuestions && p.briefingQuestions.length > 0 ? p.briefingQuestions : DEFAULT_BRIEFING}
            onChange={qs => set({ briefingQuestions: qs })}
          />
        </div>
        <div className="flex items-center gap-2 mt-5 pt-4 border-t-2 border-black">
          <button onClick={onSave} disabled={!p.name.trim()}
            className="flex-1 bg-black text-white px-4 py-2.5 text-sm disabled:opacity-30 hover:bg-white hover:text-black border-2 border-black transition-colors" style={{ fontWeight: 700 }}>Salvar projeto</button>
          {onDelete && <button onClick={onDelete} className="text-black hover:bg-black hover:text-white p-2.5 border-2 border-black transition-colors" title="Excluir projeto"><Trash2 size={16} /></button>}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Diálogo de confirmação (preto/branco) — usado para exclusões
// ---------------------------------------------------------------------------
function ConfirmDialog({
  title, message, confirmLabel, onConfirm, onCancel,
}: {
  title: string;
  message: React.ReactNode;
  confirmLabel: string;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}) {
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-[300] bg-black/80 flex items-center justify-center p-4" onClick={onCancel}>
      <div className="border-2 border-white w-full max-w-md" style={{ background: '#0a0a0a' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2.5 px-5 py-4 border-b-2 border-white">
          <AlertTriangle size={18} strokeWidth={2} />
          <h3 className="text-lg" style={{ fontFamily: 'var(--font-serif)', fontWeight: 700 }}>{title}</h3>
        </div>
        <div className="px-5 py-5">
          <p className="text-sm leading-relaxed" style={{ fontWeight: 300, color: 'rgba(255,255,255,0.85)' }}>{message}</p>
        </div>
        <div className="flex gap-px border-t-2 border-white" style={{ background: 'rgba(255,255,255,0.3)' }}>
          <button
            onClick={onCancel}
            disabled={busy}
            className="flex-1 py-3 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white"
            style={{ fontWeight: 600, background: '#0a0a0a' }}>
            Cancelar
          </button>
          <button
            onClick={async () => { setBusy(true); await onConfirm(); }}
            disabled={busy}
            className="flex-1 py-3 text-sm transition-colors flex items-center justify-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white disabled:opacity-60"
            style={{ fontWeight: 700, background: '#ffffff', color: '#000000' }}>
            {busy ? <Loader2 size={15} className="animate-spin" style={{ color: '#000' }} /> : <Trash2 size={15} style={{ color: '#000' }} />}
            <span style={{ color: '#000000' }}>{confirmLabel}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
