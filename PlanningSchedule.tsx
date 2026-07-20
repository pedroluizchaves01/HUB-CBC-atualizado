import React, { useState } from 'react';
import { 
  Calendar, 
  Sliders, 
  Plus, 
  Edit, 
  Trash2, 
  Maximize2, 
  Minimize2, 
  AlertTriangle, 
  CheckCircle, 
  PiggyBank, 
  ChevronDown, 
  ChevronUp, 
  Check, 
  Printer, 
  Download,
  Upload,
  Camera,
  Paperclip,
  MessageSquare,
  History
} from 'lucide-react';
import Markdown from 'react-markdown';
import { Project, Transaction } from '../types';
import { getAccessToken } from '../lib/firebaseAuth';
import { generateScheduleFromAnswers } from '../lib/scheduleGenerator';

interface PlanningScheduleProps {
  timelinePhases: any[];
  setTimelinePhases: React.Dispatch<React.SetStateAction<any[]>>;
  projects: Project[];
  transactions: Transaction[];
  cronogramaProjectId: string;
  setCronogramaProjectId: (id: string) => void;
  isCronogramaCollapsed: boolean;
  setIsCronogramaCollapsed: (collapsed: boolean) => void;
  formatCurrency: (value: number) => string;
}

export const PlanningSchedule: React.FC<PlanningScheduleProps> = ({
  timelinePhases,
  setTimelinePhases,
  projects,
  transactions,
  cronogramaProjectId,
  setCronogramaProjectId,
  isCronogramaCollapsed,
  setIsCronogramaCollapsed,
  formatCurrency
}) => {
  // View states
  const [planningViewMode, setPlanningViewMode] = useState<'analytical' | 'synthetic'>('analytical');
  const [isFullScreenEditOpen, setIsFullScreenEditOpen] = useState(false);
  const [bufferSlider, setBufferSlider] = useState<number>(10); // Default 10% safety buffer

  // Print states
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [printType, setPrintType] = useState<'analytical' | 'synthetic' | 'both'>('both');

  // AI-powered states
  const [aiPlanningFile, setAiPlanningFile] = useState<File | null>(null);
  const [aiPlanningLoading, setAiPlanningLoading] = useState<boolean>(false);
  const [aiPlanningError, setAiPlanningError] = useState<string | null>(null);
  const [aiPlanningStep, setAiPlanningStep] = useState<string>('');
  const [extractedPhases, setExtractedPhases] = useState<any[] | null>(null);
  const [isAiConfirmOpen, setIsAiConfirmOpen] = useState<boolean>(false);
  const [planningDriveFile, setPlanningDriveFile] = useState<{ id: string; webViewLink: string } | null>(null);
  const [planningDriveError, setPlanningDriveError] = useState<string | null>(null);
  const [phaseSource, setPhaseSource] = useState<'ia_arquivo' | 'gerador'>('ia_arquivo');

  // Generator (questionnaire) states — geração nativa sem IA
  const [isGeneratorFormOpen, setIsGeneratorFormOpen] = useState<boolean>(false);
  const [generatorAnswers, setGeneratorAnswers] = useState({
    projectKind: 'nova_construcao' as 'nova_construcao' | 'reforma' | 'comercial',
    standard: 'medio' as 'popular' | 'medio' | 'alto',
    areaM2: '',
    totalBudget: '',
    startDate: new Date().toISOString().split('T')[0],
    durationMonths: '6',
  });
  const [generatorError, setGeneratorError] = useState<string | null>(null);

  // Schedule refinement (checkpoint / ajuste via IA) states
  const [scheduleComment, setScheduleComment] = useState<string | null>(null);
  const [scheduleCheckpointPrompt, setScheduleCheckpointPrompt] = useState<string>('');
  const [isRefiningSchedule, setIsRefiningSchedule] = useState<boolean>(false);
  const [scheduleRefiningError, setScheduleRefiningError] = useState<string | null>(null);
  const [scheduleCheckpointHistory, setScheduleCheckpointHistory] = useState<string[]>([]);

  // Phase editing states
  const [editingPhase, setEditingPhase] = useState<any | null>(null);
  const [phaseFormError, setPhaseFormError] = useState<string | null>(null);
  const [phaseInput, setPhaseInput] = useState({
    name: '',
    startDate: new Date().toISOString().split('T')[0],
    endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    progress: 0,
    costPrev: '',
    costReal: '0',
    monthlyProgress: {} as Record<string, number>
  });

  // Dialog/Confirmations local states
  const [phaseSaveConfirm, setPhaseSaveConfirm] = useState<{ isOpen: boolean; isEdit: boolean; payload: any } | null>(null);
  const [phaseDeleteConfirm, setPhaseDeleteConfirm] = useState<{ isOpen: boolean; phaseId: string; phaseName: string } | null>(null);

  const activeProjectPhases = timelinePhases.filter(ph => ph.projectId === cronogramaProjectId);
  const activeProj = projects.find(p => p.id === cronogramaProjectId);

  // Helper date parsing and scheduling math
  const getProjectPeriods = (projectPhases: any[]) => {
    if (projectPhases.length === 0) return [];
    
    let minDateStr = '9999-12-31';
    let maxDateStr = '0000-01-01';

    projectPhases.forEach(p => {
      if (p.startDate && p.startDate < minDateStr) minDateStr = p.startDate;
      if (p.endDate && p.endDate > maxDateStr) maxDateStr = p.endDate;
    });

    const start = new Date(minDateStr + 'T00:00:00');
    const end = new Date(maxDateStr + 'T23:59:59');

    if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) {
      return [];
    }

    const periods: { key: string; label: string; year: number; month: number }[] = [];
    const current = new Date(start.getFullYear(), start.getMonth(), 1);

    while (current <= end) {
      const year = current.getFullYear();
      const month = current.getMonth();
      const monthsPt = [
        'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
        'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'
      ];
      periods.push({
        key: `${year}-${String(month + 1).padStart(2, '0')}`,
        label: `${monthsPt[month]}/${String(year).slice(-2)}`,
        year,
        month
      });
      current.setMonth(current.getMonth() + 1);
    }

    return periods; // Retorna todos os meses; a truncagem visual é feita em displayPeriods
  };

  const getPhaseMonths = (startStr: string, endStr: string) => {
    const start = new Date(startStr + 'T00:00:00');
    const end = new Date(endStr + 'T23:59:59');
    
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) {
      return [];
    }

    const months: { key: string; label: string; year: number; month: number }[] = [];
    const current = new Date(start.getFullYear(), start.getMonth(), 1);

    while (current <= end) {
      const year = current.getFullYear();
      const month = current.getMonth();
      const monthsPt = [
        'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
        'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'
      ];
      months.push({
        key: `${year}-${String(month + 1).padStart(2, '0')}`,
        label: `${monthsPt[month]}/${String(year).slice(-2)}`,
        year,
        month
      });
      current.setMonth(current.getMonth() + 1);
    }
    return months;
  };

  // Todos os meses do projeto (usados para agregados financeiros e Curva S).
  const periods = getProjectPeriods(activeProjectPhases);
  // Subconjunto exibido nas tabelas (máx. 18 colunas por desempenho/layout).
  const displayPeriods = periods.slice(0, 18);

  const getPhaseDistributionForMonth = (phase: any, year: number, month: number) => {
    const start = new Date(phase.startDate + 'T00:00:00');
    const end = new Date(phase.endDate + 'T23:59:59');
    
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) {
      return { planned: 0, realized: 0, percent: 0, realizedPercent: 0, plannedPhysicalPercent: 0 };
    }

    const monthStart = new Date(year, month, 1, 0, 0, 0);
    const monthEnd = new Date(year, month + 1, 0, 23, 59, 59);

    const totalDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
    const overlapStart = new Date(Math.max(start.getTime(), monthStart.getTime()));
    const overlapEnd = new Date(Math.min(end.getTime(), monthEnd.getTime()));

    if (overlapStart <= overlapEnd) {
      const overlapDays = Math.max(1, Math.round((overlapEnd.getTime() - overlapStart.getTime()) / (1000 * 60 * 60 * 24)));
      const ratio = Math.min(1, overlapDays / totalDays);
      
      const key = `${year}-${String(month + 1).padStart(2, '0')}`;
      const hasMonthlyData = phase.monthlyProgress && phase.monthlyProgress[key] !== undefined;

      // Progresso físico PLANEJADO do mês (distribuição informada ou proporcional aos dias).
      const plannedPhysicalPercent = hasMonthlyData ? phase.monthlyProgress[key] : (ratio * 100);
      // Peso do mês na duração da fase (usado para ratear o custo realizado, sem sobrescrevê-lo).
      const monthWeight = hasMonthlyData ? (plannedPhysicalPercent / 100) : ratio;

      // Custo planejado do mês.
      const planned = phase.costPrev * monthWeight;
      // Custo realizado do mês: rateado a partir do costReal informado (NÃO do progresso planejado).
      const realized = phase.costReal * monthWeight;
      // Percentual de custo realizado do mês (acumulado tende a costReal/costPrev).
      const realizedPercent = phase.costPrev > 0 ? (realized / phase.costPrev) * 100 : 0;

      return {
        planned: planned,
        realized: realized,
        percent: ratio * 100,
        realizedPercent: realizedPercent,
        plannedPhysicalPercent: plannedPhysicalPercent
      };
    }

    return { planned: 0, realized: 0, percent: 0, realizedPercent: 0, plannedPhysicalPercent: 0 };
  };

  const monthlyTotals = periods.map(period => {
    let totalPlanned = 0;
    let totalRealized = 0;
    let weightedProgressSum = 0;
    let totalWeight = 0;

    activeProjectPhases.forEach(phase => {
      const dist = getPhaseDistributionForMonth(phase, period.year, period.month);
      totalPlanned += dist.planned;
      totalRealized += dist.realized;

      if (dist.planned > 0) {
        // Média ponderada usa o progresso físico DO MÊS, não o total da fase.
        weightedProgressSum += dist.plannedPhysicalPercent * dist.planned;
        totalWeight += dist.planned;
      }
    });

    const avgProgress = totalWeight > 0 ? Math.round(weightedProgressSum / totalWeight) : 0;

    return {
      key: period.key,
      planned: totalPlanned,
      realized: totalRealized,
      avgProgress
    };
  });

  let cumulativePlanned = 0;
  let cumulativeRealized = 0;
  // Acumulados calculados sobre TODOS os meses, para a Curva S fechar 100%.
  const monthlyTotalsWithCumulativeAll = monthlyTotals.map(item => {
    cumulativePlanned += item.planned;
    cumulativeRealized += item.realized;
    return {
      ...item,
      cumulativePlanned,
      cumulativeRealized
    };
  });
  // Apenas os meses exibidos nas tabelas (mantém acumulados corretos até cada coluna).
  const monthlyTotalsWithCumulative = monthlyTotalsWithCumulativeAll.slice(0, 18);

  const totalProjectPlanned = activeProjectPhases.reduce((sum, ph) => sum + ph.costPrev, 0);
  const totalProjectRealized = activeProjectPhases.reduce((sum, ph) => sum + ph.costReal, 0);

  // Actions
  const startEditingPhase = (phase: any) => {
    setEditingPhase(phase);
    setPhaseInput({
      name: phase.name,
      startDate: phase.startDate,
      endDate: phase.endDate,
      progress: phase.progress,
      costPrev: String(phase.costPrev),
      costReal: String(phase.costReal),
      monthlyProgress: phase.monthlyProgress || {}
    });
  };

  const cancelEditingPhase = () => {
    setEditingPhase(null);
    setPhaseFormError(null);
    setPhaseInput({
      name: '',
      startDate: new Date().toISOString().split('T')[0],
      endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      progress: 0,
      costPrev: '',
      costReal: '0',
      monthlyProgress: {}
    });
  };

  // AI File Upload Handlers
  const handleAiPlanningUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const file = files[0];
      const validExtensions = ['.pdf', '.xlsx', '.xls'];
      const imageExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif', '.gif', '.bmp'];
      const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
      const isImage = file.type.startsWith('image/') || imageExtensions.includes(ext);
      if (validExtensions.includes(ext) || file.type === 'application/pdf' || isImage) {
        setAiPlanningFile(file);
        setAiPlanningError(null);
      } else {
        setAiPlanningError('Formato inválido. Envie um PDF, Excel (.pdf, .xlsx, .xls) ou uma imagem (foto)');
        setAiPlanningFile(null);
      }
    }
  };

  const handleProcessPlanningWithAi = async () => {
    if (!aiPlanningFile) return;

    setAiPlanningLoading(true);
    setAiPlanningError(null);
    setAiPlanningStep('Lendo arquivo...');

    const steps = [
      'Lendo arquivo e decodificando conteúdo...',
      'Processando dados com a Inteligência Artificial Gemini...',
      'Mapeando etapas de obra e identificando prazos...',
      'Calculando custos previstos e reais das etapas...',
      'Organizando cronograma físico-financeiro...'
    ];

    let stepIndex = 0;
    const interval = setInterval(() => {
      if (stepIndex < steps.length - 1) {
        stepIndex++;
        setAiPlanningStep(steps[stepIndex]);
      }
    }, 4000);

    try {
      const reader = new FileReader();
      const filePromise = new Promise<string>((resolve, reject) => {
        reader.onload = (event) => {
          const result = event.target?.result as string;
          resolve(result.split(',')[1]);
        };
        reader.onerror = (error) => reject(error);
        reader.readAsDataURL(aiPlanningFile);
      });

      const base64Data = await filePromise;
      let mimeType = aiPlanningFile.type;
      if (!mimeType) {
        const lowerName = aiPlanningFile.name.toLowerCase();
        if (lowerName.endsWith('.pdf')) mimeType = 'application/pdf';
        else if (lowerName.endsWith('.xlsx')) mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        else if (lowerName.endsWith('.xls')) mimeType = 'application/vnd.ms-excel';
        else if (lowerName.endsWith('.png')) mimeType = 'image/png';
        else if (lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg')) mimeType = 'image/jpeg';
        else if (lowerName.endsWith('.webp')) mimeType = 'image/webp';
        else if (lowerName.endsWith('.heic') || lowerName.endsWith('.heif')) mimeType = 'image/heic';
        else if (lowerName.endsWith('.gif')) mimeType = 'image/gif';
        else if (lowerName.endsWith('.bmp')) mimeType = 'image/bmp';
        else mimeType = 'application/octet-stream';
      }

      setPlanningDriveFile(null);
      setPlanningDriveError(null);
      const accessToken = await getAccessToken();

      const response = await fetch('/api/planning/parse-document', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          fileBase64: base64Data,
          mimeType,
          fileName: aiPlanningFile.name,
          accessToken: accessToken || undefined
        })
      });

      clearInterval(interval);

      if (!response.ok) {
        let serverMessage = 'Falha no servidor ao analisar o arquivo.';
        try {
          const errJson = await response.json();
          if (errJson?.error) serverMessage = errJson.error;
        } catch {}
        throw new Error(serverMessage);
      }

      const data = await response.json();
      if (data.success && data.phases) {
        setExtractedPhases(data.phases);
        setPlanningDriveFile(data.driveFile || null);
        setPlanningDriveError(data.driveError || null);
        setIsAiConfirmOpen(true);
      } else {
        throw new Error('Nenhuma etapa pôde ser extraída pela IA. Tente outro arquivo.');
      }
    } catch (err: any) {
      clearInterval(interval);
      console.error(err);
      setAiPlanningError(err.message || 'Houve um erro ao processar o arquivo com IA. Por favor, verifique se o arquivo não está corrompido ou tente novamente.');
    } finally {
      setAiPlanningLoading(false);
    }
  };

  // Normaliza datas vindas da IA para o formato ISO 'YYYY-MM-DD' usado nos cálculos.
  // Aceita 'DD/MM/YYYY', 'YYYY-MM-DD' e datetimes ISO; retorna fallback quando inválida.
  const normalizeAiDate = (raw: any, fallback: string): string => {
    if (typeof raw !== 'string') return fallback;
    const value = raw.trim();
    if (!value) return fallback;

    // Já em ISO (aceita datetime, mantém apenas a parte da data).
    const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) {
      const iso = `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
      return isNaN(new Date(iso + 'T00:00:00').getTime()) ? fallback : iso;
    }

    // Formato brasileiro DD/MM/YYYY (ou com '-' / '.' como separador).
    const brMatch = value.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
    if (brMatch) {
      const day = brMatch[1].padStart(2, '0');
      const month = brMatch[2].padStart(2, '0');
      let year = brMatch[3];
      if (year.length === 2) year = `20${year}`;
      const iso = `${year}-${month}-${day}`;
      return isNaN(new Date(iso + 'T00:00:00').getTime()) ? fallback : iso;
    }

    return fallback;
  };

  const handleApplyAiPhases = (shouldReplace: boolean) => {
    if (!extractedPhases) return;

    const defaultStart = new Date().toISOString().split('T')[0];
    const defaultEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const newPhases = extractedPhases.map((p, idx) => ({
      id: `phase-ai-${Date.now()}-${idx}`,
      projectId: cronogramaProjectId,
      name: p.name || 'Fase sem nome',
      startDate: normalizeAiDate(p.startDate, defaultStart),
      endDate: normalizeAiDate(p.endDate, defaultEnd),
      progress: p.progress !== undefined ? Number(p.progress) : 0,
      costPrev: p.costPrev !== undefined ? Number(p.costPrev) : 0,
      costReal: p.costReal !== undefined ? Number(p.costReal) : 0,
      monthlyProgress: p.monthlyProgress || {}
    }));

    if (shouldReplace) {
      setTimelinePhases(prev => [
        ...prev.filter(ph => ph.projectId !== cronogramaProjectId),
        ...newPhases
      ]);
    } else {
      setTimelinePhases(prev => [...prev, ...newPhases]);
    }

    setExtractedPhases(null);
    setAiPlanningFile(null);
    setIsAiConfirmOpen(false);
    setScheduleComment(null);
    setScheduleCheckpointHistory([]);
  };

  // Geração NATIVA (sem IA) do cronograma a partir das respostas do questionário.
  const handleGenerateSchedule = () => {
    setGeneratorError(null);

    const areaNum = parseFloat(generatorAnswers.areaM2.replace(',', '.'));
    const budgetNum = parseFloat(generatorAnswers.totalBudget.replace(/\./g, '').replace(',', '.'));
    const durationNum = parseFloat(generatorAnswers.durationMonths.replace(',', '.'));

    if (!budgetNum || budgetNum <= 0) {
      setGeneratorError('Informe um orçamento total válido.');
      return;
    }
    if (!durationNum || durationNum <= 0) {
      setGeneratorError('Informe um prazo total (em meses) válido.');
      return;
    }
    if (!generatorAnswers.startDate) {
      setGeneratorError('Informe a data de início da obra.');
      return;
    }

    const generated = generateScheduleFromAnswers({
      projectKind: generatorAnswers.projectKind,
      standard: generatorAnswers.standard,
      areaM2: areaNum || 0,
      totalBudget: budgetNum,
      startDate: generatorAnswers.startDate,
      durationMonths: durationNum,
    });

    setExtractedPhases(generated);
    setPhaseSource('gerador');
    setIsAiConfirmOpen(true);
    setIsGeneratorFormOpen(false);
    setScheduleComment(null);
    setScheduleCheckpointHistory(['Cronograma gerado a partir do questionário (tabela de referência da construção civil).']);
  };

  // Ajuste via IA (checkpoint) do cronograma — passo opcional da abordagem híbrida.
  const handleRefineSchedule = async () => {
    if (!scheduleCheckpointPrompt.trim() || !extractedPhases) return;

    setIsRefiningSchedule(true);
    setScheduleRefiningError(null);

    try {
      const response = await fetch('/api/planning/refine-schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPhases: extractedPhases,
          userMessage: scheduleCheckpointPrompt.trim(),
        }),
      });

      if (!response.ok) {
        let serverMessage = 'Falha no servidor ao ajustar o cronograma.';
        try {
          const errJson = await response.json();
          if (errJson?.error) serverMessage = errJson.error;
        } catch {}
        throw new Error(serverMessage);
      }

      const data = await response.json();
      if (data.success && data.phases) {
        setExtractedPhases(data.phases);
        setScheduleComment(data.comment || null);
        setScheduleCheckpointHistory(prev => [...prev, scheduleCheckpointPrompt.trim()]);
        setScheduleCheckpointPrompt('');
      } else {
        throw new Error('Não foi possível aplicar as alterações solicitadas.');
      }
    } catch (err: any) {
      console.error(err);
      setScheduleRefiningError(err.message || 'Erro ao ajustar o cronograma com a IA.');
    } finally {
      setIsRefiningSchedule(false);
    }
  };

  // Phase Save & Delete Handlers
  const handleConfirmSavePhase = () => {
    if (!phaseSaveConfirm) return;
    const { isEdit, payload } = phaseSaveConfirm;

    if (isEdit) {
      setTimelinePhases(prev => prev.map(ph => ph.id === payload.id ? payload : ph));
    } else {
      setTimelinePhases(prev => [...prev, payload]);
    }

    setPhaseSaveConfirm(null);
    cancelEditingPhase();
  };

  const handleConfirmDeletePhase = () => {
    if (!phaseDeleteConfirm) return;
    const { phaseId } = phaseDeleteConfirm;

    setTimelinePhases(prev => prev.filter(ph => ph.id !== phaseId));
    setPhaseDeleteConfirm(null);
  };

  const renderPhaseForm = () => {
    return (
      <div className="bg-stone-50 border border-stone-200 p-5">
        <div className="flex justify-between items-center border-b border-stone-200 pb-2.5 mb-4">
          <div>
            <h4 className="font-serif text-xs font-bold text-stone-950 uppercase tracking-wide">
              {editingPhase ? 'Alterar Dados da Etapa' : 'Cadastrar Nova Etapa de Planejamento'}
            </h4>
            <p className="text-[10px] text-stone-500 mt-0.5">
              {editingPhase 
                ? `Editando as informações da fase "${editingPhase.name}". Preencha os campos abaixo.` 
                : 'Crie um novo item para integrar as planilhas analíticas e sintéticas do cronograma.'}
            </p>
          </div>
          {editingPhase && (
            <button
              type="button"
              onClick={cancelEditingPhase}
              className="text-[9px] font-mono uppercase tracking-widest text-stone-500 underline hover:text-stone-800 cursor-pointer"
            >
              Cancelar Edição
            </button>
          )}
        </div>

        <form onSubmit={(e) => {
          e.preventDefault();
          const { name, startDate, endDate, progress, costPrev, costReal, monthlyProgress } = phaseInput;
          if (!name.trim() || !costPrev) return;

          const months = getPhaseMonths(startDate, endDate);
          const totalMonthlySum = months.reduce((sum, m) => sum + (monthlyProgress[m.key] || 0), 0);
          if (totalMonthlySum > 100) {
            setPhaseFormError(`A soma das porcentagens mensais não pode ser superior a 100% (atual: ${totalMonthlySum}%). Por favor, ajuste os valores.`);
            return;
          }

          const payload = {
            id: editingPhase ? editingPhase.id : `phase-${Date.now()}`,
            projectId: cronogramaProjectId,
            name: name.trim(),
            startDate,
            endDate,
            progress: Number(progress),
            costPrev: parseFloat(costPrev),
            costReal: parseFloat(costReal) || 0,
            monthlyProgress: monthlyProgress
          };

          setPhaseSaveConfirm({
            isOpen: true,
            isEdit: !!editingPhase,
            payload
          });
        }} className="space-y-4 font-sans">
          {phaseFormError && (
            <div className="bg-red-50 border border-red-200 text-red-800 p-3 text-xs font-mono flex items-start gap-2">
              <span className="flex-shrink-0">⚠️</span>
              <span>{phaseFormError}</span>
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
            <div className="md:col-span-8">
              <label className="block text-[8px] font-mono uppercase tracking-wider text-stone-500 font-bold mb-1">Nome da Etapa / Serviço</label>
              <input
                type="text"
                placeholder="Ex: Alvenaria estrutural do 1º pavimento"
                className="w-full bg-white border border-stone-200 py-1.5 px-3 text-xs focus:outline-none focus:border-stone-400 font-sans"
                value={phaseInput.name}
                onChange={(e) => setPhaseInput({ ...phaseInput, name: e.target.value })}
                required
              />
            </div>

            <div className="md:col-span-4">
              <label className="block text-[8px] font-mono uppercase tracking-wider text-stone-500 font-bold mb-1">Custo Previsto (R$)</label>
              <input
                type="number"
                placeholder="Ex: 45000"
                className="w-full bg-white border border-stone-200 py-1.5 px-3 text-xs focus:outline-none focus:border-stone-400 font-mono"
                value={phaseInput.costPrev}
                onChange={(e) => setPhaseInput({ ...phaseInput, costPrev: e.target.value })}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
            <div className="md:col-span-6">
              <label className="block text-[8px] font-mono uppercase tracking-wider text-stone-500 font-bold mb-1">Data de Início</label>
              <input
                type="date"
                className="w-full bg-white border border-stone-200 py-1.5 px-3 text-xs focus:outline-none focus:border-stone-400 font-sans"
                value={phaseInput.startDate}
                onChange={(e) => setPhaseInput({ ...phaseInput, startDate: e.target.value })}
                required
              />
            </div>

            <div className="md:col-span-6">
              <label className="block text-[8px] font-mono uppercase tracking-wider text-stone-500 font-bold mb-1">Data de Término</label>
              <input
                type="date"
                className="w-full bg-white border border-stone-200 py-1.5 px-3 text-xs focus:outline-none focus:border-stone-400 font-sans"
                value={phaseInput.endDate}
                onChange={(e) => setPhaseInput({ ...phaseInput, endDate: e.target.value })}
                required
              />
            </div>
          </div>

          {/* Month-by-month progress */}
          {(() => {
            const { startDate, endDate, costPrev } = phaseInput;
            const months = getPhaseMonths(startDate, endDate);
            if (months.length === 0) return null;

            return (
              <div className="border-t border-stone-200 pt-4 space-y-3">
                <div>
                  <span className="block text-[9px] font-mono uppercase tracking-wider text-stone-500 font-bold">
                    Cronograma de Distribuição Física Planejada Mensal (%)
                  </span>
                  <p className="text-[10px] text-stone-500 mt-0.5 leading-normal font-sans">
                    Informe o percentual físico planejado para esta etapa em cada mês de sua duração. A soma deve totalizar 100% ao término do período.
                  </p>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {months.map(m => {
                    const currentPct = phaseInput.monthlyProgress[m.key] !== undefined 
                      ? phaseInput.monthlyProgress[m.key] 
                      : 0;
                    const calculatedValue = (currentPct / 100) * (parseFloat(costPrev) || 0);

                    return (
                      <div key={m.key} className="bg-white border border-stone-200 p-2.5 space-y-1.5 flex flex-col justify-between">
                        <span className="text-[9px] font-mono text-stone-500 uppercase tracking-wider block font-bold">
                          📅 {m.label}
                        </span>
                        <div className="space-y-1">
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              min="0"
                              max="100"
                              placeholder="0"
                              className="w-full bg-[#FAF9F6] border border-stone-200 text-center py-1 text-xs focus:outline-none focus:bg-white font-mono"
                              value={currentPct || ''}
                              onChange={(e) => {
                                const otherMonthsSum = months.reduce((sum, mon) => {
                                  if (mon.key === m.key) return sum;
                                  return sum + (phaseInput.monthlyProgress[mon.key] || 0);
                                }, 0);
                                const maxAllowedForThisMonth = Math.max(0, 100 - otherMonthsSum);
                                let inputVal = e.target.value === '' ? 0 : parseFloat(e.target.value) || 0;
                                
                                if (inputVal > maxAllowedForThisMonth) {
                                  setPhaseFormError(`A soma das porcentagens não pode ultrapassar 100%. O valor máximo permitido para este mês é de ${maxAllowedForThisMonth.toFixed(1)}%.`);
                                  inputVal = maxAllowedForThisMonth;
                                } else {
                                  setPhaseFormError(null);
                                }

                                const val = Math.max(0, inputVal);
                                const newMonthlyProgress = {
                                  ...phaseInput.monthlyProgress,
                                  [m.key]: val
                                };
                                
                                const totalProgress = months.reduce((sum, mon) => {
                                  const pVal = mon.key === m.key ? val : (newMonthlyProgress[mon.key] || 0);
                                  return sum + pVal;
                                }, 0);

                                const totalCostReal = months.reduce((sum, mon) => {
                                  const pVal = mon.key === m.key ? val : (newMonthlyProgress[mon.key] || 0);
                                  return sum + ((pVal / 100) * (parseFloat(costPrev) || 0));
                                }, 0);

                                setPhaseInput({
                                  ...phaseInput,
                                  progress: Math.min(100, Math.round(totalProgress)),
                                  costReal: totalCostReal.toFixed(2),
                                  monthlyProgress: newMonthlyProgress
                                });
                              }}
                            />
                            <span className="text-xs text-stone-400 font-mono">%</span>
                          </div>
                          <span className="block text-[8px] font-mono text-stone-400 text-center">
                            = {formatCurrency(calculatedValue)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 border-t border-stone-200 pt-4">
            <div className="md:col-span-4">
              <label className="block text-[8px] font-mono uppercase tracking-wider text-stone-500 font-bold mb-1">Custo Realizado Acumulado (R$)</label>
              <input
                type="number"
                placeholder="Ex: 24000"
                className="w-full bg-[#FAF9F6] border border-stone-200 py-1.5 px-3 text-xs focus:outline-none focus:border-stone-400 font-mono"
                value={phaseInput.costReal}
                onChange={(e) => setPhaseInput({ ...phaseInput, costReal: e.target.value })}
              />
            </div>

            <div className="md:col-span-4">
              <label className="block text-[8px] font-mono uppercase tracking-wider text-stone-500 font-bold mb-1">Progresso Físico Realizado (%)</label>
              <input
                type="range"
                min="0"
                max="100"
                step="1"
                className="w-full mt-2 cursor-pointer h-1.5 bg-stone-200 rounded-lg appearance-none accent-stone-850"
                value={phaseInput.progress}
                onChange={(e) => setPhaseInput({ ...phaseInput, progress: Number(e.target.value) })}
              />
              <div className="flex justify-between items-center text-[9px] font-mono text-stone-500 mt-1">
                <span>0%</span>
                <span className="text-stone-900 font-bold font-sans text-xs">{phaseInput.progress}% realizado</span>
                <span>100%</span>
              </div>
            </div>

            <div className="md:col-span-4 flex items-end">
              <button
                type="submit"
                className="w-full bg-stone-950 hover:bg-stone-800 text-white font-mono uppercase tracking-wider text-[10px] py-2.5 px-4 font-bold transition-all shadow-md cursor-pointer"
              >
                {editingPhase ? 'Salvar Alterações' : 'Adicionar Etapa'}
              </button>
            </div>
          </div>
        </form>
      </div>
    );
  };

  return (
    <div className="bg-white border border-stone-200 shadow-xs mb-6">
      {/* Header bar */}
      <div 
        onClick={() => setIsCronogramaCollapsed(!isCronogramaCollapsed)}
        className="bg-stone-50 border-b border-stone-200 px-5 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer hover:bg-stone-100/40 transition-all select-none"
      >
        <div className="flex items-center gap-3">
          <span className="text-stone-500 font-mono text-xs">
            {isCronogramaCollapsed ? '▶' : '▼'}
          </span>
          <div>
            <h3 className="font-serif text-base text-stone-900 font-bold flex items-center gap-2">
              <Calendar size={18} className="text-stone-600" />
              Cronograma Físico-Financeiro
            </h3>
            <p className="text-xs text-stone-500 mt-0.5">
              Visualização detalhada analítica, demonstrativo sintético de fluxo de caixa e curva S
            </p>
          </div>
        </div>

        {/* Local Project Switcher */}
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <span className="text-[10px] font-mono uppercase tracking-wider text-stone-500 font-bold">Obra / Cliente:</span>
          <select
            value={cronogramaProjectId}
            onChange={(e) => {
              setCronogramaProjectId(e.target.value);
              cancelEditingPhase();
            }}
            className="bg-white border border-stone-300 py-1 px-2.5 text-xs focus:outline-none focus:border-stone-500 transition-all rounded-none font-sans font-medium"
          >
            {projects.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Body content */}
      {!isCronogramaCollapsed && (
        <div className="p-6 space-y-6">
          {/* AI Auto-Fill / Document upload widget */}
          <div className="bg-stone-50 border border-stone-200 p-5 space-y-4">
            <div>
              <h4 className="font-serif text-xs font-bold text-stone-950 uppercase tracking-wide flex items-center gap-2">
                <span className="text-sm">🪄</span> Preenchimento Automático do Cronograma com Inteligência Artificial
              </h4>
              <p className="text-[11px] text-stone-500 mt-0.5">
                Anexe um orçamento analítico ou cronograma físico-financeiro existente em formato PDF ou Excel (.pdf, .xlsx, .xls). A IA do Gemini mapeará as etapas, prazos e custos estimados automaticamente para você.
              </p>
            </div>

            <div className="flex flex-col md:flex-row items-center gap-4">
              <div className="w-full md:flex-1">
                {/* Dual Upload Buttons */}
                <div className="grid grid-cols-1 gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => document.getElementById('ai-planning-picker')?.click()}
                    className="flex items-center justify-center gap-2 border-2 border-dashed border-stone-300 hover:border-stone-500 bg-white hover:bg-[#FAF9F6] py-4 px-3 text-xs font-mono uppercase font-bold tracking-wider text-stone-800 transition-all cursor-pointer group"
                  >
                    <Upload size={16} className="text-stone-500 group-hover:text-stone-800" />
                    <span>Adicionar Arquivo Local</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => document.getElementById('camera-planning-picker')?.click()}
                    className="flex items-center justify-center gap-2 border-2 border-dashed border-stone-300 hover:border-stone-500 bg-white hover:bg-[#FAF9F6] py-4 px-3 text-xs font-mono uppercase font-bold tracking-wider text-stone-800 transition-all cursor-pointer group"
                  >
                    <Camera size={16} className="text-stone-500 group-hover:text-stone-800" />
                    <span>Tirar Foto</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsGeneratorFormOpen(prev => !prev)}
                    className="flex items-center justify-center gap-2 border-2 border-dashed border-sky-300 hover:border-sky-500 bg-sky-50 hover:bg-sky-100 py-4 px-3 text-xs font-mono uppercase font-bold tracking-wider text-sky-800 transition-all cursor-pointer group"
                  >
                    <Sliders size={16} className="text-sky-600" />
                    <span>Gerar por Perguntas (sem arquivo)</span>
                  </button>
                </div>

                {isGeneratorFormOpen && (
                  <div className="bg-sky-50 border border-sky-200 p-4 mt-3 space-y-3">
                    <p className="text-[10.5px] text-sky-900 leading-relaxed">
                      Responda o questionário abaixo e o sistema monta um cronograma físico-financeiro completo automaticamente,
                      usando tabelas de referência da construção civil (sem IA). Depois, se quiser, dá pra ajustar por comando de texto.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[8px] font-mono uppercase tracking-wider text-stone-500 font-bold mb-1">Tipo de Obra</label>
                        <select
                          value={generatorAnswers.projectKind}
                          onChange={(e) => setGeneratorAnswers({ ...generatorAnswers, projectKind: e.target.value as any })}
                          className="w-full bg-white border border-stone-300 py-1.5 px-2 text-xs focus:outline-none focus:border-sky-500"
                        >
                          <option value="nova_construcao">Nova Construção Residencial</option>
                          <option value="reforma">Reforma</option>
                          <option value="comercial">Construção Comercial</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[8px] font-mono uppercase tracking-wider text-stone-500 font-bold mb-1">Padrão de Acabamento</label>
                        <select
                          value={generatorAnswers.standard}
                          onChange={(e) => setGeneratorAnswers({ ...generatorAnswers, standard: e.target.value as any })}
                          className="w-full bg-white border border-stone-300 py-1.5 px-2 text-xs focus:outline-none focus:border-sky-500"
                        >
                          <option value="popular">Popular / Econômico</option>
                          <option value="medio">Médio</option>
                          <option value="alto">Alto Padrão</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[8px] font-mono uppercase tracking-wider text-stone-500 font-bold mb-1">Área Construída (m²)</label>
                        <input
                          type="text"
                          inputMode="decimal"
                          placeholder="Ex: 150"
                          value={generatorAnswers.areaM2}
                          onChange={(e) => setGeneratorAnswers({ ...generatorAnswers, areaM2: e.target.value })}
                          className="w-full bg-white border border-stone-300 py-1.5 px-2 text-xs focus:outline-none focus:border-sky-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[8px] font-mono uppercase tracking-wider text-stone-500 font-bold mb-1">Orçamento Total (R$)</label>
                        <input
                          type="text"
                          inputMode="decimal"
                          placeholder="Ex: 400000"
                          value={generatorAnswers.totalBudget}
                          onChange={(e) => setGeneratorAnswers({ ...generatorAnswers, totalBudget: e.target.value })}
                          className="w-full bg-white border border-stone-300 py-1.5 px-2 text-xs focus:outline-none focus:border-sky-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[8px] font-mono uppercase tracking-wider text-stone-500 font-bold mb-1">Data de Início</label>
                        <input
                          type="date"
                          value={generatorAnswers.startDate}
                          onChange={(e) => setGeneratorAnswers({ ...generatorAnswers, startDate: e.target.value })}
                          className="w-full bg-white border border-stone-300 py-1.5 px-2 text-xs focus:outline-none focus:border-sky-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[8px] font-mono uppercase tracking-wider text-stone-500 font-bold mb-1">Prazo Total (meses)</label>
                        <input
                          type="text"
                          inputMode="decimal"
                          placeholder="Ex: 8"
                          value={generatorAnswers.durationMonths}
                          onChange={(e) => setGeneratorAnswers({ ...generatorAnswers, durationMonths: e.target.value })}
                          className="w-full bg-white border border-stone-300 py-1.5 px-2 text-xs focus:outline-none focus:border-sky-500"
                        />
                      </div>
                    </div>

                    {generatorError && (
                      <p className="text-[10px] text-red-600 font-mono">{generatorError}</p>
                    )}

                    <button
                      type="button"
                      onClick={handleGenerateSchedule}
                      className="w-full sm:w-auto bg-sky-800 hover:bg-sky-700 text-white py-2.5 px-5 text-[10px] font-mono uppercase tracking-widest font-bold transition-all cursor-pointer"
                    >
                      📐 Gerar Cronograma Automaticamente
                    </button>
                  </div>
                )}

                <input
                  id="ai-planning-picker"
                  type="file"
                  accept=".pdf, .xlsx, .xls, .xlsm, .xlsb, .csv, .ods, .doc, .docx, image/*"
                  onChange={handleAiPlanningUpload}
                  className="hidden"
                />

                <input
                  id="camera-planning-picker"
                  type="file"
                  onChange={handleAiPlanningUpload}
                  className="hidden"
                  accept="image/*"
                  capture="environment"
                />
                
                {aiPlanningFile && (
                  <div className="bg-stone-50 border border-stone-200 p-2.5 flex items-center justify-between text-xs mt-2">
                    <div className="flex items-center gap-1.5 truncate">
                      <Paperclip size={12} className="text-stone-500 flex-shrink-0" />
                      <span className="truncate font-mono text-[10.5px]" title={aiPlanningFile.name}>
                        {aiPlanningFile.name}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setAiPlanningFile(null)}
                      className="text-stone-400 hover:text-stone-600 font-mono text-[10px]"
                    >
                      Remover
                    </button>
                  </div>
                )}

                {aiPlanningError && (
                  <p className="text-[10px] text-red-600 mt-2 font-mono">{aiPlanningError}</p>
                )}
              </div>

              {aiPlanningFile && !aiPlanningLoading && (
                <button
                  type="button"
                  onClick={handleProcessPlanningWithAi}
                  className="w-full md:w-auto bg-[#1E1E1E] text-white hover:bg-stone-850 py-3.5 px-6 text-[10px] font-mono uppercase tracking-widest font-bold transition-all shadow-sm border border-transparent cursor-pointer"
                >
                  ✨ Analisar e Preencher Cronograma
                </button>
              )}
            </div>

            {/* AI loading */}
            {aiPlanningLoading && (
              <div className="bg-stone-100 border border-stone-200 p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-stone-850 border-t-transparent"></div>
                  <span className="text-xs font-bold text-stone-800 font-serif">Módulo de IA Chaves Brites Correa está trabalhando...</span>
                </div>
                <p className="text-xs font-mono text-stone-600 animate-pulse">{aiPlanningStep}</p>
              </div>
            )}

            {/* AI Confirmation list preview */}
            {isAiConfirmOpen && extractedPhases && (
              <div className="bg-stone-900 text-white p-5 space-y-4 border border-stone-850 shadow-lg">
                <div className="flex justify-between items-start border-b border-stone-800 pb-2.5">
                  <div>
                    <h5 className="font-serif text-xs font-bold uppercase tracking-wider text-stone-100">
                      {phaseSource === 'gerador' ? 'Cronograma gerado com sucesso! 📐' : 'Etapas extraídas com sucesso! ✨'}
                    </h5>
                    <p className="text-[10px] text-stone-400 mt-0.5">
                      {phaseSource === 'gerador'
                        ? `Cronograma nativo gerado a partir do questionário (${extractedPhases.length} etapas, tabela de referência da construção civil).`
                        : `A Inteligência Artificial Gemini identificou ${extractedPhases.length} etapas de planejamento.`}
                    </p>
                  </div>
                  <button 
                    onClick={() => setIsAiConfirmOpen(false)}
                    className="text-stone-400 hover:text-white font-bold"
                  >
                    ✕
                  </button>
                </div>

                {/* Ajuste via IA (checkpoint) — opcional, funciona tanto pro gerador quanto pra extração por arquivo */}
                <div className="bg-stone-950 border border-stone-800 p-3.5 space-y-2.5">
                  <span className="block text-[9px] font-mono uppercase tracking-wider text-stone-400 font-bold flex items-center gap-1.5">
                    <MessageSquare size={11} className="text-stone-400" />
                    Ajustar com IA (opcional)
                  </span>
                  <p className="text-[9.5px] text-stone-500 leading-normal">
                    Ex: "aumente a fundação em 2 semanas", "adicione uma fase de paisagismo no final", "meu terreno é em aclive, inclua terraplanagem no início".
                  </p>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="text"
                      value={scheduleCheckpointPrompt}
                      onChange={(e) => setScheduleCheckpointPrompt(e.target.value)}
                      placeholder="Instruções para ajustar o cronograma..."
                      className="flex-1 bg-stone-900 border border-stone-800 text-stone-100 py-2 px-3 text-xs focus:outline-none focus:border-stone-600 font-sans"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleRefineSchedule();
                        }
                      }}
                    />
                    <button
                      type="button"
                      disabled={isRefiningSchedule || !scheduleCheckpointPrompt.trim()}
                      onClick={handleRefineSchedule}
                      className="bg-stone-800 hover:bg-stone-700 disabled:opacity-50 text-white font-mono uppercase tracking-wider text-[10px] py-2 px-4 font-bold transition-all flex items-center gap-1.5 justify-center"
                    >
                      {isRefiningSchedule ? (
                        <>
                          <div className="animate-spin rounded-full h-3 w-3 border border-white border-t-transparent"></div>
                          <span>Processando...</span>
                        </>
                      ) : (
                        <span>Ajustar com IA</span>
                      )}
                    </button>
                  </div>
                  {scheduleRefiningError && (
                    <p className="text-[10px] text-red-400 font-mono">{scheduleRefiningError}</p>
                  )}
                  {scheduleCheckpointHistory.length > 0 && (
                    <div className="pt-2 border-t border-stone-900 flex items-center gap-2 flex-wrap">
                      <span className="text-[9px] font-mono text-stone-500 font-bold flex items-center gap-1">
                        <History size={10} /> Histórico:
                      </span>
                      {scheduleCheckpointHistory.map((hist, hIdx) => (
                        <span key={hIdx} className="bg-stone-900 border border-stone-800 text-stone-400 text-[8px] font-mono py-0.5 px-2">
                          {hIdx === 0 ? '✓ Origem' : `Checkpoint ${hIdx}: "${hist}"`}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {scheduleComment && (
                  <div className="bg-[#FAF9F6] text-stone-900 border-l-4 border-amber-500 p-4 font-sans text-xs">
                    <span className="block text-[9px] font-mono uppercase tracking-widest text-amber-800 font-bold mb-2">
                      📋 O que foi alterado
                    </span>
                    <div className="markdown-body prose prose-stone prose-xs leading-relaxed max-w-none text-stone-800">
                      <Markdown>{scheduleComment}</Markdown>
                    </div>
                  </div>
                )}

                <div className="max-h-40 overflow-y-auto space-y-2 border border-stone-800 p-3 bg-stone-950 font-mono text-[9px] text-stone-300 divide-y divide-stone-800">
                  {extractedPhases.map((p, idx) => (
                    <div key={idx} className="pt-2 first:pt-0 flex justify-between items-center gap-4">
                      <div className="truncate">
                        <span className="text-stone-500 mr-1">#{idx+1}</span>
                        <span className="text-white font-bold">{p.name}</span>
                      </div>
                      <div className="flex-shrink-0 text-right space-y-0.5">
                        <div>📅 {p.startDate} até {p.endDate}</div>
                        <div className="text-emerald-400 font-bold">{formatCurrency(p.costPrev || 0)}</div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex flex-col sm:flex-row gap-2 pt-2 justify-end">
                  <button
                    type="button"
                    onClick={() => setIsAiConfirmOpen(false)}
                    className="bg-stone-850 hover:bg-stone-800 text-stone-300 py-2 px-4 text-[10px] font-mono uppercase tracking-wider transition-all cursor-pointer"
                  >
                    Descartar
                  </button>
                  <button
                    type="button"
                    onClick={() => handleApplyAiPhases(false)}
                    className="bg-stone-700 hover:bg-stone-600 text-white py-2 px-4 text-[10px] font-mono uppercase tracking-wider transition-all cursor-pointer"
                  >
                    Mesclar / Acrescentar ao Atual
                  </button>
                  <button
                    type="button"
                    onClick={() => handleApplyAiPhases(true)}
                    className="bg-emerald-700 hover:bg-emerald-600 text-white py-2 px-4 text-[10px] font-mono uppercase tracking-wider transition-all cursor-pointer font-bold"
                  >
                    Substituir Cronograma do Projeto
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Controls Bar */}
          <div className="bg-stone-50 border border-stone-200 p-4 flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono uppercase tracking-wider text-stone-500 font-bold">Visualização:</span>
              <div className="bg-stone-200 p-0.5 border border-stone-300 inline-flex font-mono text-[9px] uppercase tracking-wider font-bold">
                <button
                  type="button"
                  onClick={() => setPlanningViewMode('analytical')}
                  className={`px-3 py-1.5 cursor-pointer transition-all ${planningViewMode === 'analytical' ? 'bg-white text-stone-900 shadow-xs' : 'text-stone-400 hover:text-stone-700'}`}
                >
                  Visão Analítica
                </button>
                <button
                  type="button"
                  onClick={() => setPlanningViewMode('synthetic')}
                  className={`px-3 py-1.5 cursor-pointer transition-all ${planningViewMode === 'synthetic' ? 'bg-white text-stone-900 shadow-xs' : 'text-stone-400 hover:text-stone-700'}`}
                >
                  Visão Sintética
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsPrintModalOpen(true)}
              className="bg-stone-900 hover:bg-stone-800 text-white py-1.5 px-3.5 text-[10px] font-mono uppercase tracking-wider font-bold transition-all shadow-sm border border-transparent flex items-center gap-1.5 cursor-pointer"
            >
              <span>📥 Exportar PDF (Paisagem)</span>
            </button>
          </div>

          {/* Normal Desktop Content */}
          <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
            
            {/* MAIN SCHEDULE MATRIX TABLE */}
            <div className="bg-white border border-stone-200 p-5 xl:col-span-3 space-y-6 overflow-hidden">
              <div className="flex items-center justify-between border-b border-stone-100 pb-3 flex-wrap gap-2">
                <div>
                  <h3 className="font-serif text-sm text-stone-950 font-bold flex items-center gap-1.5">
                    <Sliders size={15} className="text-stone-600" />
                    {planningViewMode === 'analytical' ? 'Cronograma Físico-Financeiro Analítico' : 'Fluxo de Caixa Físico-Financeiro Sintético'}
                  </h3>
                  <p className="text-[11px] text-stone-500 mt-0.5">
                    {planningViewMode === 'analytical' 
                      ? 'Detalhamento de custos previstos e reais distribuídos proporcionalmente ao longo do tempo.' 
                      : 'Consolidado mensal de fluxo de caixa e curva de progresso físico acumulado.'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {planningViewMode === 'analytical' && (
                    <button
                      type="button"
                      onClick={() => setIsFullScreenEditOpen(true)}
                      className="bg-[#1E1E1E] hover:bg-stone-850 text-white font-mono text-[9px] font-bold py-1 px-2.5 flex items-center gap-1.5 transition-all cursor-pointer shadow-sm uppercase tracking-wider border border-transparent"
                    >
                      <Maximize2 size={11} />
                      Editar em Tela Cheia
                    </button>
                  )}
                  <div className="font-mono text-[9px] text-stone-500 uppercase tracking-widest bg-stone-50 px-2 py-1 border border-stone-150">
                    Total Geral Previsto: <strong className="text-stone-900">{formatCurrency(totalProjectPlanned)}</strong>
                  </div>
                </div>
              </div>

              {/* RENDER ANALYTICAL VIEW */}
              {planningViewMode === 'analytical' && (
                <div className="space-y-4">
                  {activeProjectPhases.length === 0 ? (
                    <div className="text-center py-12 border border-dashed border-stone-200 text-stone-400 text-xs font-serif italic">
                      Nenhuma etapa ou fase de planejamento cadastrada para esta obra. Use o formulário ou a IA para começar.
                    </div>
                  ) : (
                    <div className="overflow-x-auto border border-stone-200">
                      <table className="w-full border-collapse min-w-[800px] text-[11px] text-stone-800">
                        <thead>
                          <tr className="bg-stone-100 text-[8px] font-mono uppercase tracking-wider text-stone-500 border-b border-stone-200">
                            <th className="border-r border-stone-200 p-2.5 text-left w-64 min-w-[240px]">Etapa / Descrição do Serviço</th>
                            <th className="border-r border-stone-200 p-2.5 text-center w-28">Prazos Limites</th>
                            <th className="border-r border-stone-200 p-2.5 text-center w-16">Progresso</th>
                            <th className="border-r border-stone-200 p-2.5 text-right w-24">Custo Previsto</th>
                            {displayPeriods.map(period => (
                              <th key={period.key} className="border-r border-stone-200 p-2 text-center min-w-[100px] bg-stone-50">
                                {period.label}
                              </th>
                            ))}
                            <th className="p-2.5 text-center w-16">Ações</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-stone-200 bg-white">
                          {activeProjectPhases.map(phase => {
                            return (
                              <tr key={phase.id} className="hover:bg-stone-50/50 align-middle">
                                <td className="border-r border-stone-200 p-2.5 font-bold text-stone-900">
                                  <div className="space-y-1">
                                    <p className="leading-tight">{phase.name}</p>
                                    <div className="w-full bg-stone-200 h-1.5 rounded-full overflow-hidden mt-1 max-w-[200px]">
                                      <div className="bg-stone-800 h-1.5 transition-all duration-300" style={{ width: `${phase.progress}%` }} />
                                    </div>
                                  </div>
                                </td>
                                <td className="border-r border-stone-200 p-2 text-center font-mono text-[9px] text-stone-500">
                                  <div className="space-y-0.5">
                                    <span className="block text-stone-800 font-bold">{phase.startDate}</span>
                                    <span className="block text-stone-300">até</span>
                                    <span className="block text-stone-800 font-bold">{phase.endDate}</span>
                                  </div>
                                </td>
                                <td className="border-r border-stone-200 p-2 text-center font-mono font-bold text-stone-800">
                                  {phase.progress}%
                                </td>
                                <td className="border-r border-stone-200 p-2 text-right font-mono text-stone-700 font-medium">
                                  {formatCurrency(phase.costPrev)}
                                </td>
                                
                                {displayPeriods.map(period => {
                                  const dist = getPhaseDistributionForMonth(phase, period.year, period.month);
                                  return (
                                    <td key={period.key} className="border-r border-stone-200 p-2 text-center bg-stone-50/20 font-mono text-[10px]">
                                      {dist.planned > 0 ? (
                                        <div className="space-y-0.5">
                                          <span className="block text-stone-700 font-medium">{formatCurrency(dist.planned)}</span>
                                          <span className="block text-[8px] text-stone-400">({dist.percent.toFixed(0)}%)</span>
                                        </div>
                                      ) : (
                                        <span className="text-stone-300">-</span>
                                      )}
                                    </td>
                                  );
                                })}

                                <td className="p-2 text-center">
                                  <div className="flex flex-col items-center justify-center gap-1">
                                    <button
                                      type="button"
                                      onClick={() => startEditingPhase(phase)}
                                      className="p-1 text-stone-400 hover:text-stone-900 hover:bg-stone-100 rounded transition-all cursor-pointer"
                                      title="Alterar dados da fase"
                                    >
                                      <Edit size={12} />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setPhaseDeleteConfirm({
                                          isOpen: true,
                                          phaseId: phase.id,
                                          phaseName: phase.name
                                        });
                                      }}
                                      className="p-1 text-stone-400 hover:text-red-700 hover:bg-red-50 rounded transition-all cursor-pointer"
                                      title="Excluir fase"
                                    >
                                      <Trash2 size={12} />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* RENDER SYNTHETIC VIEW */}
              {planningViewMode === 'synthetic' && (
                <div className="space-y-4">
                  {activeProjectPhases.length === 0 ? (
                    <div className="text-center py-12 border border-dashed border-stone-200 text-stone-400 text-xs font-serif italic">
                      Nenhuma etapa ou fase de planejamento cadastrada para esta obra. Use o formulário para começar.
                    </div>
                  ) : (
                    <div className="overflow-x-auto border border-stone-200">
                      <table className="w-full border-collapse min-w-[800px] text-[11px] text-stone-800">
                        <thead>
                          <tr className="bg-stone-150 border-b border-stone-200 text-[8px] font-mono uppercase text-stone-600 text-left">
                            <th className="p-3 w-64">Métricas de Planejamento Mensal</th>
                            {displayPeriods.map(period => (
                              <th key={period.key} className="p-3 text-center bg-stone-50">
                                {period.label}
                              </th>
                            ))}
                            <th className="p-3 text-right w-32 bg-stone-100">Total Acumulado</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-stone-150 bg-white">
                          <tr className="hover:bg-stone-50/20">
                            <td className="p-3 font-mono font-bold text-stone-700">1. Previsto Mensal (Custos)</td>
                            {monthlyTotalsWithCumulative.map(item => (
                              <td key={item.key} className="p-3 text-center font-mono text-stone-850">
                                {item.planned > 0 ? formatCurrency(item.planned) : <span className="text-stone-300">-</span>}
                              </td>
                            ))}
                            <td className="p-3 text-right font-mono font-bold text-stone-900 bg-stone-100">
                              {formatCurrency(totalProjectPlanned)}
                            </td>
                          </tr>

                          <tr className="hover:bg-stone-50/20 bg-stone-50/10">
                            <td className="p-3 font-mono font-bold text-stone-700">2. Previsto Acumulado (Curva S)</td>
                            {monthlyTotalsWithCumulative.map(item => {
                              const pct = totalProjectPlanned > 0 ? (item.cumulativePlanned / totalProjectPlanned) * 100 : 0;
                              return (
                                <td key={item.key} className="p-3 text-center font-mono">
                                  <span className="block text-stone-900 font-bold">{formatCurrency(item.cumulativePlanned)}</span>
                                  <span className="block text-[8px] text-stone-400">({pct.toFixed(0)}%)</span>
                                </td>
                              );
                            })}
                            <td className="p-3 text-right font-mono font-bold text-stone-900 bg-stone-100">
                              -
                            </td>
                          </tr>

                          <tr className="hover:bg-stone-50/20">
                            <td className="p-3 font-mono font-bold text-stone-700">3. Realizado Mensal (Custos)</td>
                            {monthlyTotalsWithCumulative.map(item => (
                              <td key={item.key} className="p-3 text-center font-mono text-stone-850">
                                {item.realized > 0 ? formatCurrency(item.realized) : <span className="text-stone-300">-</span>}
                              </td>
                            ))}
                            <td className="p-3 text-right font-mono font-bold text-stone-900 bg-stone-100">
                              {formatCurrency(totalProjectRealized)}
                            </td>
                          </tr>

                          <tr className="hover:bg-stone-50/20 bg-stone-50/10">
                            <td className="p-3 font-mono font-bold text-stone-700">4. Realizado Acumulado</td>
                            {monthlyTotalsWithCumulative.map(item => {
                              const pct = totalProjectPlanned > 0 ? (item.cumulativeRealized / totalProjectPlanned) * 100 : 0;
                              return (
                                <td key={item.key} className="p-3 text-center font-mono">
                                  <span className="block text-stone-900 font-bold">{formatCurrency(item.cumulativeRealized)}</span>
                                  <span className="block text-[8px] text-stone-400">({pct.toFixed(0)}%)</span>
                                </td>
                              );
                            })}
                            <td className="p-3 text-right font-mono font-bold text-stone-900 bg-stone-100">
                              -
                            </td>
                          </tr>

                          <tr className="hover:bg-stone-50/20">
                            <td className="p-3 font-mono font-bold text-stone-700">5. Progresso Físico Médio</td>
                            {monthlyTotalsWithCumulative.map(item => (
                              <td key={item.key} className="p-3 text-center font-mono font-bold text-stone-900">
                                {item.planned > 0 ? `${item.avgProgress}%` : <span className="text-stone-300">-</span>}
                              </td>
                            ))}
                            <td className="p-3 text-right font-mono font-bold text-stone-900 bg-stone-100">
                              -
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Sidebar with Buffer */}
            <div className="space-y-6 xl:col-span-1">
              
              {/* Buffer slider block */}
              <div className="bg-white border border-stone-200 p-5 space-y-4">
                <div className="border-b border-stone-100 pb-2.5">
                  <h3 className="font-serif text-sm text-stone-950 font-bold flex items-center gap-1.5">
                    <PiggyBank size={15} className="text-stone-600" />
                    Margem de Segurança e Buffer
                  </h3>
                  <p className="text-[11px] text-stone-500 mt-0.5">Defina o buffer reservado para imprevistos técnicos.</p>
                </div>

                {(() => {
                  if (!activeProj) return null;
                  const txs = transactions.filter(t => t.projectId === cronogramaProjectId);
                  const totalSpent = txs.reduce((acc, t) => acc + t.value, 0);
                  const budget = activeProj.budget;
                  const bufferVal = (budget * bufferSlider) / 100;
                  const currentBalance = budget - totalSpent;
                  const safetyAlert = currentBalance < bufferVal;

                  return (
                    <div className="space-y-4">
                      <div className="space-y-2 text-xs">
                        <div className="flex justify-between items-center">
                          <span className="text-stone-600">Buffer Selecionado:</span>
                          <strong className="text-stone-900 font-mono">{bufferSlider}%</strong>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="30"
                          value={bufferSlider}
                          onChange={(e) => setBufferSlider(parseInt(e.target.value))}
                          className="w-full accent-stone-800 h-1 bg-stone-200 appearance-none rounded-lg outline-none cursor-pointer"
                        />
                        <div className="flex justify-between font-mono text-[8px] text-stone-400">
                          <span>0%</span>
                          <span>15% (Rec.)</span>
                          <span>30%</span>
                        </div>
                      </div>

                      <div className="bg-stone-50 border border-stone-200 p-3 space-y-2 font-mono text-xs">
                        <div className="flex justify-between text-[10px]">
                          <span>ORÇADO ORIGINAL:</span>
                          <span className="text-stone-800 font-bold">{formatCurrency(budget)}</span>
                        </div>
                        <div className="flex justify-between text-[10px]">
                          <span>REALIZADO GLOBAL:</span>
                          <span className="text-stone-800 font-bold">{formatCurrency(totalSpent)}</span>
                        </div>
                        <div className="flex justify-between text-[10px] bg-amber-50 px-1 py-0.5">
                          <span>RESERVA (BUFFER):</span>
                          <span className="text-amber-800 font-bold">{formatCurrency(bufferVal)}</span>
                        </div>
                        <div className="flex justify-between text-[10px] border-t border-stone-200 pt-1">
                          <span>SALDO ATUAL:</span>
                          <span className={`font-bold ${currentBalance >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{formatCurrency(currentBalance)}</span>
                        </div>
                      </div>

                      {safetyAlert ? (
                        <div className="border border-red-200 bg-red-50 p-2.5 text-red-950 flex items-start gap-2 text-[10px] leading-relaxed font-sans">
                          <AlertTriangle size={14} className="text-red-600 flex-shrink-0 mt-0.5" />
                          <div>
                            <strong className="font-bold">⚠️ Risco Orçamentário!</strong>
                            <p className="mt-0.5 text-red-800">Saldo menor que buffer de segurança.</p>
                          </div>
                        </div>
                      ) : (
                        <div className="border border-emerald-200 bg-emerald-50 p-2.5 text-emerald-950 flex items-start gap-2 text-[10px] leading-relaxed font-sans">
                          <CheckCircle size={14} className="text-emerald-600 flex-shrink-0 mt-0.5" />
                          <div>
                            <strong className="font-bold">✓ Margem Assegurada</strong>
                            <p className="mt-0.5 text-emerald-800 font-medium">Saldo suficiente para contingências.</p>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>

            </div>

            {/* Inline Registration/Editing Form - Placed right below the schedule table and perfectly aligned */}
            <div className="bg-white border border-stone-200 p-5 xl:col-span-3">
              {renderPhaseForm()}
            </div>

          </div>

        </div>
      )}

      {/* Save Confirm Dialog overlay */}
      {phaseSaveConfirm && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="bg-white border border-stone-200 max-w-sm w-full p-5 space-y-4 shadow-xl text-center">
            <h4 className="font-serif text-sm font-bold text-stone-900 uppercase">Confirmar Operação</h4>
            <p className="text-xs text-stone-600 leading-normal">
              Deseja salvar as alterações na etapa <strong>{phaseSaveConfirm.payload.name}</strong>? Os demonstrativos físico-financeiros serão recalculados imediatamente.
            </p>
            <div className="flex justify-center gap-3">
              <button
                type="button"
                onClick={() => setPhaseSaveConfirm(null)}
                className="bg-stone-150 hover:bg-stone-200 text-stone-700 py-1.5 px-4 font-mono text-[9px] uppercase tracking-wider transition-all cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmSavePhase}
                className="bg-stone-950 hover:bg-stone-850 text-white py-1.5 px-5 font-mono text-[9px] uppercase tracking-wider font-bold transition-all cursor-pointer"
              >
                Confirmar e Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm Dialog overlay */}
      {phaseDeleteConfirm && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="bg-white border border-stone-200 max-w-sm w-full p-5 space-y-4 shadow-xl text-center">
            <h4 className="font-serif text-sm font-bold text-stone-900 uppercase">Excluir Etapa</h4>
            <p className="text-xs text-stone-600 leading-normal">
              Deseja realmente excluir permanentemente a etapa <strong>{phaseDeleteConfirm.phaseName}</strong> do planejamento? Essa ação é irreversível.
            </p>
            <div className="flex justify-center gap-3">
              <button
                type="button"
                onClick={() => setPhaseDeleteConfirm(null)}
                className="bg-stone-150 hover:bg-stone-200 text-stone-700 py-1.5 px-4 font-mono text-[9px] uppercase tracking-wider transition-all cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmDeletePhase}
                className="bg-rose-700 hover:bg-rose-600 text-white py-1.5 px-5 font-mono text-[9px] uppercase tracking-wider font-bold transition-all cursor-pointer"
              >
                Confirmar e Excluir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FULL SCREEN EDITOR MODAL */}
      {isFullScreenEditOpen && (
        <div className="fixed inset-0 bg-[#F5F5F3] z-[9999] overflow-hidden flex flex-col font-sans">
          <div className="bg-[#1E1E1E] text-white px-6 py-4 flex items-center justify-between shadow-md">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-stone-800 text-white rounded">
                <Maximize2 size={16} />
              </div>
              <div>
                <h2 className="font-serif text-sm md:text-base font-bold tracking-tight">
                  Edição Completa do Cronograma Físico-Financeiro Analítico
                </h2>
                <p className="text-[10px] text-stone-400 mt-0.5 font-mono">
                  Projeto Selecionado: <strong className="text-stone-100">{activeProj?.name}</strong>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="hidden md:flex items-center gap-2 bg-stone-800/60 border border-stone-700 px-3 py-1.5 font-mono text-[10px] uppercase text-stone-300">
                Total Geral Previsto: <strong className="text-white">{formatCurrency(totalProjectPlanned)}</strong>
              </div>
              <button
                type="button"
                onClick={() => setIsFullScreenEditOpen(false)}
                className="bg-stone-800 hover:bg-stone-700 text-stone-200 hover:text-white p-2 rounded transition-all cursor-pointer flex items-center gap-1.5 text-xs uppercase font-mono font-bold"
              >
                <Minimize2 size={14} />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-auto p-6 space-y-6">
            <div className="bg-white border border-stone-200 p-6 space-y-4">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-xs text-stone-800">
                  <thead>
                    <tr className="bg-stone-100 font-mono text-[10px] uppercase border-b border-stone-200">
                      <th className="p-3 w-72">Etapa / Descrição do Serviço</th>
                      <th className="p-3 text-center w-36">Prazos</th>
                      <th className="p-3 text-center w-20">Progresso</th>
                      <th className="p-3 text-right w-28">Custo Previsto</th>
                      {displayPeriods.map(period => (
                        <th key={period.key} className="p-3 text-center min-w-[110px] bg-stone-50">
                          {period.label}
                        </th>
                      ))}
                      <th className="p-3 text-center w-20">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-150 bg-white">
                    {activeProjectPhases.map(phase => (
                      <tr key={phase.id} className="hover:bg-stone-50/50">
                        <td className="p-3 font-bold font-serif text-stone-900">{phase.name}</td>
                        <td className="p-3 text-center font-mono text-[10px] text-stone-600">
                          {phase.startDate} a {phase.endDate}
                        </td>
                        <td className="p-3 text-center font-mono font-bold">{phase.progress}%</td>
                        <td className="p-3 text-right font-mono font-semibold">{formatCurrency(phase.costPrev)}</td>
                        {displayPeriods.map(period => {
                          const dist = getPhaseDistributionForMonth(phase, period.year, period.month);
                          return (
                            <td key={period.key} className="p-3 text-center bg-stone-50/10 font-mono">
                              {dist.planned > 0 ? (
                                <div>
                                  <span className="block font-bold">{formatCurrency(dist.planned)}</span>
                                  <span className="block text-[8px] text-stone-400">({dist.percent.toFixed(0)}%)</span>
                                </div>
                              ) : '-'}
                            </td>
                          );
                        })}
                        <td className="p-3 text-center">
                          <button
                            type="button"
                            onClick={() => startEditingPhase(phase)}
                            className="p-1 text-stone-500 hover:text-stone-900 transition-all cursor-pointer"
                          >
                            Editar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PRINT MODAL OVERLAY */}
      {isPrintModalOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 print:hidden">
          <div className="bg-white border border-stone-200 max-w-lg w-full p-6 space-y-4 shadow-xl">
            <div className="flex justify-between items-start border-b border-stone-150 pb-3">
              <div>
                <h3 className="font-serif text-base font-bold text-stone-900">📥 Exportar Cronograma para PDF</h3>
                <p className="text-xs text-stone-500 mt-0.5">Configuração do layout de impressão A4 Paisagem</p>
              </div>
              <button
                type="button"
                onClick={() => setIsPrintModalOpen(false)}
                className="text-stone-400 hover:text-stone-900 text-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 text-xs font-sans">
              <div>
                <label className="block text-[9px] font-mono uppercase tracking-wider text-stone-500 font-bold mb-2">Selecione as Visões para Exportação</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setPrintType('both')}
                    className={`py-2 px-3 border text-xs font-mono font-bold transition-all cursor-pointer text-center ${printType === 'both' ? 'bg-stone-950 text-white border-stone-950' : 'bg-white text-stone-700 border-stone-200 hover:bg-stone-50'}`}
                  >
                    Completo (Ambos)
                  </button>
                  <button
                    type="button"
                    onClick={() => setPrintType('analytical')}
                    className={`py-2 px-3 border text-xs font-mono font-bold transition-all cursor-pointer text-center ${printType === 'analytical' ? 'bg-stone-950 text-white border-stone-950' : 'bg-white text-stone-700 border-stone-200 hover:bg-stone-50'}`}
                  >
                    Apenas Analítico
                  </button>
                  <button
                    type="button"
                    onClick={() => setPrintType('synthetic')}
                    className={`py-2 px-3 border text-xs font-mono font-bold transition-all cursor-pointer text-center ${printType === 'synthetic' ? 'bg-stone-950 text-white border-stone-950' : 'bg-white text-stone-700 border-stone-200 hover:bg-stone-50'}`}
                  >
                    Apenas Sintético
                  </button>
                </div>
              </div>

              <div className="bg-stone-50 border border-stone-200 p-4 space-y-2 text-xs">
                <h4 className="font-bold text-stone-900 flex items-center gap-1.5">
                  💡 Orientações Importantes para Salvar em PDF:
                </h4>
                <ul className="list-decimal pl-4 space-y-1.5 text-stone-600 leading-normal">
                  <li>O navegador abrirá a tela de visualização de impressão.</li>
                  <li>No campo **Destino / Printer**, escolha a opção <strong className="text-stone-900">Salvar como PDF</strong> (ou <strong className="text-stone-900">Save as PDF</strong>).</li>
                  <li>Configure o **Layout / Orientação** para <strong className="text-stone-900">Paisagem</strong> (Landscape).</li>
                  <li>Selecione o tamanho de papel <strong className="text-stone-900">A4</strong>.</li>
                  <li>Nas configurações adicionais (Mais Definições), ative a opção <strong className="text-stone-900">Gráficos de Segundo Plano</strong> (Background Graphics) para preservar todas as cores e barras do cronograma.</li>
                </ul>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-stone-150 font-mono text-[10px] uppercase">
              <button
                type="button"
                onClick={() => setIsPrintModalOpen(false)}
                className="bg-stone-100 hover:bg-stone-200 text-stone-700 px-4 py-2 border border-stone-300 font-bold cursor-pointer transition-all"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsPrintModalOpen(false);
                  setTimeout(() => {
                    window.print();
                  }, 300);
                }}
                className="bg-stone-900 hover:bg-stone-800 text-white px-5 py-2 font-bold cursor-pointer transition-all flex items-center gap-1.5"
              >
                <span>🖨️ Abrir Assistente de Impressão</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
