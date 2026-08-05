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
  Sun, Wind, Thermometer, Droplets, Compass as CompassIcon,
} from 'lucide-react';
import { subscribeCollection, saveDoc, removeDoc } from '../lib/firebaseDb';
import { PROJECT_BG } from '../lib/projectBackground';
import { sendTelegramDocument } from '../lib/telegramService';
import { analisarConfortoTermico, coordsDeLocalizacao, type Orientacao } from '../lib/thermalAnalysis';

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

export default function ProjectEnvironment({
  role, userName, clientId, clients = [], obras = [], onLogout, onSwitchEnvironment, onGoToSelect,
}: Props) {
  const [allProjects, setAllProjects] = useState<ArchProject[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<ArchProject | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ArchProject | null>(null);

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

  const persist = (p: ArchProject) => {
    // Proteção: mede o tamanho do documento antes de enviar. Arquivos do formato
    // antigo (base64 inline) podem inchar o projeto e estourar o limite de salvamento.
    try {
      const bytes = new Blob([JSON.stringify(p)]).size;
      if (bytes > 60 * 1024 * 1024) {
        const legado = p.phases.reduce((n, ph) => n + ph.files.filter(f => f.storage !== 'telegram' && f.base64 && f.base64.length > 200000).length, 0);
        alert(
          `Este projeto está muito grande para salvar (${(bytes / 1024 / 1024).toFixed(0)}MB).` +
          (legado > 0
            ? `\n\nHá ${legado} arquivo(s) antigo(s) guardado(s) dentro do projeto. Remova-o(s) e reenvie pelo botão "Enviar arquivo" (que agora usa o Telegram), depois salve novamente.`
            : `\n\nReduza o conteúdo e tente de novo.`)
        );
        return Promise.resolve();
      }
    } catch { /* se não der para medir, segue o fluxo normal */ }
    return saveDoc('arch_projects', p.id, p);
  };

  return (
    <div className="projeto-dark min-h-screen text-white relative">
      {/* Fundo: foto de arquitetura, estática, cobrindo tudo, desfocada + véu escuro */}
      <div className="fixed inset-0 z-0 pointer-events-none" aria-hidden>
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${PROJECT_BG})`, filter: 'blur(8px) brightness(0.55)', transform: 'scale(1.06)' }}
        />
        {/* Véu escuro para garantir contraste do texto branco */}
        <div className="absolute inset-0 bg-black/55" />
      </div>

      <header className="bg-black/40 backdrop-blur-xl border-b border-white/15 sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 flex items-center justify-center bg-black">
              <Compass size={19} className="text-white" strokeWidth={1.5} />
            </span>
            <div className="leading-none">
              <p className="text-[10px] font-mono uppercase tracking-[0.22em] text-black/50 mb-1">Chaves Brites Correa</p>
              <h1 className="text-lg tracking-tight" style={{ fontFamily: 'var(--font-serif)', fontWeight: 700 }}>
                Estúdio<span style={{ fontWeight: 300 }}> de Projetos</span>
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-1 sm:gap-2">
            <button onClick={onSwitchEnvironment}
              className="flex items-center gap-1.5 text-xs font-mono uppercase tracking-wider text-black hover:bg-black hover:text-white px-2.5 sm:px-3 py-1.5 border border-black transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-1">
              <ArrowLeftRight size={13} /> <span className="hidden sm:inline">Ir para Obra</span>
            </button>
            <button onClick={onLogout}
              className="flex items-center gap-1.5 text-xs font-mono uppercase tracking-wider text-black/60 hover:text-black px-2.5 py-1.5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-black">
              <LogOut size={13} /> <span className="hidden sm:inline">Sair</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-5 py-8 relative z-10">
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
            <div className="flex items-end justify-between mb-8 gap-4">
              <div>
                <h2 className="text-3xl sm:text-4xl tracking-tight leading-[1.05]" style={{ fontFamily: 'var(--font-serif)' }}>
                  <span style={{ fontWeight: 300 }}>{isAdmin ? 'Projetos de ' : 'Seus '}</span>
                  <span style={{ fontWeight: 700 }}>{isAdmin ? 'Arquitetura' : 'Projetos'}</span>
                </h2>
                <p className="text-sm text-black/60 mt-2" style={{ fontWeight: 300 }}>Acompanhe cada etapa, veja os arquivos e aprove para avançar.</p>
              </div>
              {isAdmin && (
                <button onClick={() => setEditing(newProject())}
                  className="flex items-center gap-2 bg-black text-white px-5 py-2.5 text-sm transition-transform hover:scale-[1.02] active:scale-100 flex-shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2"
                  style={{ fontWeight: 600 }}>
                  <Plus size={16} strokeWidth={2.5} /> <span className="hidden sm:inline">Novo projeto</span>
                </button>
              )}
            </div>

            {projects.length === 0 ? (
              <div className="border border-black py-20 text-center">
                <FolderOpen size={32} className="text-black mx-auto mb-4" strokeWidth={1} />
                <p className="text-black mb-1" style={{ fontWeight: 700 }}>Nenhum projeto ainda.</p>
                <p className="text-sm text-black/60" style={{ fontWeight: 300 }}>
                  {isAdmin ? 'Crie o primeiro projeto para começar.' : 'Assim que um projeto seu for criado, ele aparece aqui.'}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-px bg-black border border-black">
                {projects.map((p, i) => {
                  const pct = progressOf(p);
                  const waiting = p.phases.some(ph => ph.state === 'aguardando_aprovacao');
                  return (
                    <div key={p.id} className="bg-white relative group">
                      <motion.button
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.04 }}
                        onClick={() => setSelected(p.id)}
                        className="w-full text-left p-6 hover:bg-black hover:text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-black block">
                        <div className="flex items-start justify-between mb-8">
                          <Ruler size={20} strokeWidth={1.5} className="group-hover:text-white" />
                          {waiting && !isAdmin && (
                            <span className="text-[9px] font-mono uppercase tracking-wider border border-current px-2 py-0.5">
                              Pendente
                            </span>
                          )}
                        </div>
                        <h3 className="text-xl leading-tight mb-1" style={{ fontFamily: 'var(--font-serif)', fontWeight: 700 }}>{p.name || 'Sem nome'}</h3>
                        <p className="text-xs mb-6 opacity-60" style={{ fontWeight: 300 }}>{p.clientName} · {p.type}</p>
                        <div className="flex items-baseline justify-between mb-2">
                          <span className="text-[10px] font-mono uppercase tracking-wider opacity-60">Progresso</span>
                          <span className="text-lg font-mono" style={{ fontWeight: 700 }}>{pct}%</span>
                        </div>
                        <div className="h-px bg-current opacity-20 relative">
                          <div className="absolute left-0 top-0 h-px bg-current opacity-100" style={{ width: `${pct}%` }} />
                        </div>
                      </motion.button>
                      {/* Excluir — só admin, com confirmação */}
                      {isAdmin && (
                        <button
                          onClick={(e) => { e.stopPropagation(); setConfirmDelete(p); }}
                          className="absolute top-4 right-4 p-1.5 text-black/30 hover:text-white hover:bg-black opacity-0 group-hover:opacity-100 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:opacity-100"
                          title="Excluir projeto" aria-label={`Excluir ${p.name}`}>
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
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
          onDelete={editing.name ? () => { setConfirmDelete(editing); } : undefined}
        />
      )}

      {/* Confirmação de exclusão */}
      {confirmDelete && (
        <ConfirmDialog
          title="Excluir projeto"
          message={<>Tem certeza que deseja excluir <strong>{confirmDelete.name}</strong>? Esta ação é permanente e apaga todos os arquivos e o histórico das etapas.</>}
          confirmLabel="Excluir projeto"
          onConfirm={async () => {
            await removeDoc('arch_projects', confirmDelete.id);
            if (selected === confirmDelete.id) setSelected(null);
            if (editing?.id === confirmDelete.id) setEditing(null);
            setConfirmDelete(null);
          }}
          onCancel={() => setConfirmDelete(null)}
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
  const addFiles = async (idx: number, files: FileList, onStatus?: (msg: string | null) => void) => {
    const parsed: ArchFile[] = [];
    const arr = Array.from(files);
    for (let k = 0; k < arr.length; k++) {
      const f = arr[k];
      // Limite do Telegram Bot API: 50 MB por arquivo.
      if (f.size > 50 * 1024 * 1024) {
        onStatus?.(null);
        alert(`"${f.name}" tem ${(f.size / 1024 / 1024).toFixed(0)}MB e excede o limite de 50MB por arquivo. Comprima o PDF ou divida em partes.`);
        continue;
      }
      try {
        onStatus?.(`Enviando ${arr.length > 1 ? `(${k + 1}/${arr.length}) ` : ''}${f.name}…`);
        parsed.push(await uploadArchFile(f));
      } catch (e: any) {
        onStatus?.(null);
        alert(`Falha ao enviar "${f.name}": ${e?.message || 'erro no upload'}. Verifique se o Telegram está configurado nas configurações.`);
      }
    }
    onStatus?.(null);
    if (parsed.length > 0) {
      update(project.phases.map((ph, i) => i === idx ? { ...ph, files: [...ph.files, ...parsed] } : ph));
    }
  };
  const removeFile = (idx: number, fileId: string) =>
    update(project.phases.map((ph, i) => i === idx ? { ...ph, files: ph.files.filter(f => f.id !== fileId) } : ph));
  const addComment = (idx: number, text: string) => update(withEvent(idx, { kind: 'comentario', text }));

  return (
    <div>
      <button onClick={onBack} className="text-sm text-black/60 hover:text-black mb-5 flex items-center gap-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-black px-1" style={{ fontWeight: 500 }}>← Voltar aos projetos</button>

      {/* Carimbo de projeto (title block) — preto sólido, assinatura de prancheta */}
      <div className="mb-6 border-2 border-black">
        <div className="relative p-6 sm:p-8 text-white bg-black">
          {/* Grade branca sutil no fundo */}
          <div className="absolute inset-0 opacity-[0.08] pointer-events-none" aria-hidden>
            <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
              <defs><pattern id="tb-grid" width="24" height="24" patternUnits="userSpaceOnUse">
                <path d="M 24 0 L 0 0 0 24" fill="none" stroke="white" strokeWidth="1" /></pattern></defs>
              <rect width="100%" height="100%" fill="url(#tb-grid)" />
            </svg>
          </div>
          <div className="relative flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-mono uppercase tracking-[0.25em] text-white/50 mb-2">Projeto</p>
              <h2 className="text-3xl sm:text-4xl tracking-tight leading-[1.05]" style={{ fontFamily: 'var(--font-serif)', fontWeight: 700 }}>{project.name}</h2>
            </div>
            {isAdmin && (
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <button onClick={onEdit} className="flex items-center gap-1.5 text-xs font-mono uppercase tracking-wider text-white hover:bg-white hover:text-black px-3 py-1.5 border border-white/40 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white">
                  <Pencil size={13} /> <span className="hidden sm:inline">Editar</span>
                </button>
              </div>
            )}
          </div>
          {/* Ficha técnica: células de carimbo */}
          <div className="relative grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-4 mt-6 pt-5 border-t border-white/20">
            {[
              ['Cliente', project.clientName || '—'],
              ['Tipo', project.type],
              ['Área', project.area ? `${project.area} m²` : '—'],
              ['Responsável', project.responsible || '—'],
            ].map(([label, val]) => (
              <div key={label} className="min-w-0">
                <p className="text-[9px] font-mono uppercase tracking-[0.18em] text-white/40 mb-1">{label}</p>
                <p className="text-sm truncate" style={{ fontWeight: 600 }} title={val}>{val}</p>
              </div>
            ))}
          </div>
        </div>
        {/* Progresso integrado, na base */}
        <div className="bg-white px-6 sm:px-8 py-4 border-t-2 border-black">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-mono uppercase tracking-[0.15em] text-black/60">Progresso do projeto</span>
            <span className="text-lg font-mono" style={{ fontWeight: 700 }}>{progress}%</span>
          </div>
          <div className="h-1 bg-black/10 relative">
            <motion.div className="absolute left-0 top-0 h-1 bg-black"
              initial={{ width: 0 }} animate={{ width: `${progress}%` }} transition={{ duration: 0.8, ease: 'easeOut' }} />
          </div>
        </div>
      </div>

      {/* Resumo do estudo de conforto térmico */}
      <ThermalSummary project={project} />

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
            onAddFiles={(files, onStatus) => addFiles(i, files, onStatus)}
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
function ThermalSummary({ project }: { project: ArchProject }) {
  const [showReport, setShowReport] = useState(false);
  const hasLocation = !!(project.localizacao && project.latitude != null && project.longitude != null);

  if (!hasLocation) {
    return (
      <div className="border-2 border-black border-dashed p-4 mb-6 flex items-center gap-3">
        <Sun size={18} className="flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm" style={{ fontWeight: 700 }}>Estudo de conforto térmico</p>
          <p className="text-xs text-black/60" style={{ fontWeight: 300 }}>
            Informe a localização do projeto (ou vincule uma obra) para gerar o estudo automático de premissas.
          </p>
        </div>
      </div>
    );
  }

  const r = analisarConfortoTermico({
    localizacao: project.localizacao!,
    latitude: project.latitude!,
    longitude: project.longitude!,
    tipoEdificacao: project.type,
    orientacao: (project.orientacao as Orientacao) || 'N',
    areaConstruida: project.area ? Number(project.area) : undefined,
  });

  const chips: { Icon: React.ComponentType<any>; label: string; value: string }[] = [
    { Icon: Thermometer, label: 'Temp. média', value: `${r.dados.tempMedia}°C` },
    { Icon: Droplets, label: 'Umidade', value: `${r.dados.umidadeMedia}%` },
    { Icon: Wind, label: 'Ventos', value: r.dados.ventosPredominantes },
    { Icon: CompassIcon, label: 'Exposição', value: r.exposicao },
  ];

  return (
    <>
      <div className="border-2 border-black mb-6">
        <div className="flex items-center justify-between px-4 py-3 border-b-2 border-black">
          <p className="text-sm flex items-center gap-2" style={{ fontWeight: 700 }}>
            <Sun size={15} /> Conforto térmico — {r.dados.classificacao}
          </p>
          <button onClick={() => setShowReport(true)}
            className="text-xs px-3 py-1.5 bg-black text-white hover:bg-white hover:text-black border border-black transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-black" style={{ fontWeight: 600 }}>
            Ver estudo completo
          </button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-black">
          {chips.map(c => (
            <div key={c.label} className="bg-white px-4 py-3">
              <p className="text-[9px] font-mono uppercase tracking-[0.15em] text-black/50 flex items-center gap-1 mb-1"><c.Icon size={10} /> {c.label}</p>
              <p className="text-sm" style={{ fontWeight: 700 }}>{c.value}</p>
            </div>
          ))}
        </div>
        <div className="px-4 py-3 border-t-2 border-black">
          <p className="text-[10px] font-mono uppercase tracking-[0.12em] text-black/50 mb-1.5">Desafio principal</p>
          <p className="text-sm" style={{ fontWeight: 300 }}>{r.desafio} · Potencial: {r.potencial} · Eficiência estimada {r.eficiencia}</p>
        </div>
      </div>

      {showReport && <ThermalReport project={project} result={r} onClose={() => setShowReport(false)} />}
    </>
  );
}

// Relatório completo do estudo térmico (modal em tela cheia)
function ThermalReport({ project, result, onClose }: {
  project: ArchProject; result: ReturnType<typeof analisarConfortoTermico>; onClose: () => void;
}) {
  const r = result;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const Section = ({ title, items }: { title: string; items: string[] }) => (
    <div className="mb-5">
      <p className="text-[10px] font-mono uppercase tracking-[0.15em] text-white/50 mb-2">{title}</p>
      <ul className="space-y-1.5">
        {items.map((it, i) => (
          <li key={i} className="text-sm text-white/90 flex gap-2" style={{ fontWeight: 300 }}>
            <span className="text-white/40 flex-shrink-0">—</span> {it}
          </li>
        ))}
      </ul>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[250] bg-black/90 flex items-start justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div className="w-full max-w-2xl my-8" style={{ background: '#0a0a0a', border: '2px solid #fff' }} onClick={e => e.stopPropagation()}>
        {/* Cabeçalho */}
        <div className="flex items-start justify-between px-6 py-5 border-b-2 border-white">
          <div>
            <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-white/50 mb-1">Estudo de conforto térmico</p>
            <h2 className="text-2xl text-white tracking-tight" style={{ fontFamily: 'var(--font-serif)', fontWeight: 700 }}>{project.name}</h2>
            <p className="text-sm text-white/60 mt-1" style={{ fontWeight: 300 }}>{project.localizacao} · {r.dados.clima}</p>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white p-1.5 hover:bg-white/10" title="Fechar (ESC)"><X size={20} /></button>
        </div>

        <div className="px-6 py-5">
          {/* Métricas principais */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-white/20 border border-white/20 mb-6">
            {[
              ['Classificação', r.dados.classificacao],
              ['Temp. média', `${r.dados.tempMedia}°C`],
              ['Amplitude', `${r.dados.tempMax - r.dados.tempMin}°C`],
              ['Umidade', `${r.dados.umidadeMedia}%`],
              ['Ventos', r.dados.ventosPredominantes],
              ['Velocidade', `${r.dados.velocidadeVento} m/s`],
              ['Exposição', r.exposicao],
              ['Período crítico', r.periodoCritico],
            ].map(([label, val]) => (
              <div key={label} style={{ background: '#0a0a0a' }} className="px-3 py-2.5">
                <p className="text-[9px] font-mono uppercase tracking-[0.12em] text-white/40 mb-0.5">{label}</p>
                <p className="text-sm text-white" style={{ fontWeight: 600 }}>{val}</p>
              </div>
            ))}
          </div>

          {/* Ventos por período */}
          <div className="border border-white/20 p-4 mb-6">
            <p className="text-[10px] font-mono uppercase tracking-[0.15em] text-white/50 mb-2 flex items-center gap-1.5"><Wind size={12} /> Ventos predominantes</p>
            <p className="text-sm text-white/90" style={{ fontWeight: 300 }}>
              Período quente: <b style={{ fontWeight: 700 }}>{r.dados.periodoVentoQuente}</b> · Período frio: <b style={{ fontWeight: 700 }}>{r.dados.periodoVentoFrio}</b>
            </p>
          </div>

          {/* Recomendações principais */}
          <Section title="Recomendações principais" items={r.recomendacoes} />
          {/* Soluções */}
          <Section title="Estratégias arquitetônicas" items={r.dados.solucoes.arquitetonicas} />
          <Section title="Estratégias construtivas" items={r.dados.solucoes.construtivas} />
          <Section title="Detalhes técnicos" items={r.dados.solucoes.detalhes} />

          <p className="text-[10px] text-white/40 mt-6" style={{ fontWeight: 300 }}>
            Estudo automático de premissas, gerado a partir da localização e orientação. Serve como diretriz inicial de projeto e deve ser validado pelo responsável técnico.
          </p>
        </div>
      </div>
    </div>
  );
}


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
