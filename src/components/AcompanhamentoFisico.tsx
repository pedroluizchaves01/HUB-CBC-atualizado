import React, { useState, useRef, useEffect } from 'react';
import { 
  Activity, 
  Plus, 
  Trash2, 
  Camera, 
  Calendar, 
  FileText, 
  Loader2, 
  ChevronDown, 
  ChevronUp, 
  AlertCircle, 
  CheckCircle2, 
  Folder, 
  Sliders, 
  Info,
  Clock,
  TrendingUp,
  X,
  Upload,
  Coins,
  TrendingDown
} from 'lucide-react';
import { Project, PhysicalWeeklyLog, Transaction } from '../types';
import { uploadBase64ToFirebase } from '../lib/firebaseStorage';
import { getTelegramConfig, buildTelegramFileName } from '../lib/telegramService';

interface AcompanhamentoFisicoProps {
  projectId: string;
  project: Project | undefined;
  timelinePhases: any[];
  setTimelinePhases?: React.Dispatch<React.SetStateAction<any[]>>;
  weeklyLogs: PhysicalWeeklyLog[];
  addWeeklyLog?: (log: PhysicalWeeklyLog) => void;
  deleteWeeklyLog?: (id: string) => void;
  readOnly?: boolean;
  transactions?: Transaction[];
}

export default function AcompanhamentoFisico({
  projectId,
  project,
  timelinePhases,
  setTimelinePhases,
  weeklyLogs,
  addWeeklyLog,
  deleteWeeklyLog,
  readOnly = false,
  transactions = []
}: AcompanhamentoFisicoProps) {
  // Panel state
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Form states
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [newLog, setNewLog] = useState({
    date: new Date().toISOString().split('T')[0],
    weekLabel: '',
    description: '',
    phaseProgressions: {} as Record<string, number>,
    photos: [] as { id: string; url: string; name: string; description?: string }[]
  });

  // Photo uploading states
  const [isUploading, setIsUploading] = useState(false);
  const [tempPhotos, setTempPhotos] = useState<{ id: string; name: string; url: string; file?: File }[]>([]);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Active Project Data
  const activePhases = timelinePhases.filter(ph => ph.projectId === projectId);
  const activeLogs = weeklyLogs
    .filter(log => log.projectId === projectId)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  // Autofill current phase progress when opening the form
  useEffect(() => {
    if (activePhases.length > 0) {
      const initialProgressions: Record<string, number> = {};
      activePhases.forEach(phase => {
        initialProgressions[phase.id] = phase.progress || 0;
      });
      setNewLog(prev => ({
        ...prev,
        phaseProgressions: initialProgressions,
        weekLabel: `Semana ${activeLogs.length + 1}`
      }));
    }
  }, [isFormOpen, projectId]);



  // ----------------------------------------------------
  // S-CURVE CRONOGRAMA FÍSICO-FINANCEIRO CALCULATION
  // ----------------------------------------------------
  
  // Calculate planned progress for a given date
  const getPlannedProgressAtDate = (dateStr: string) => {
    if (activePhases.length === 0) return 0;
    
    const targetDate = new Date(dateStr + 'T00:00:00');
    let weightedSum = 0;
    let totalWeight = 0;

    activePhases.forEach(phase => {
      const start = new Date(phase.startDate + 'T00:00:00');
      const end = new Date(phase.endDate + 'T00:00:00');
      const weight = Number(phase.costPrev) || 1; // Fallback weight
      totalWeight += weight;

      if (targetDate < start) {
        // Not started yet
        weightedSum += 0;
      } else if (targetDate >= end) {
        // Concluded
        weightedSum += 100 * weight;
      } else {
        // In progress
        const totalDuration = Math.max(1, end.getTime() - start.getTime());
        const elapsed = targetDate.getTime() - start.getTime();
        const percent = (elapsed / totalDuration) * 100;
        weightedSum += percent * weight;
      }
    });

    return totalWeight > 0 ? weightedSum / totalWeight : 0;
  };

  // Calculate actual progress based on a specific log
  const getActualProgressFromLog = (log: PhysicalWeeklyLog) => {
    if (activePhases.length === 0) return 0;
    
    let weightedSum = 0;
    let totalWeight = 0;

    activePhases.forEach(phase => {
      const weight = Number(phase.costPrev) || 1;
      totalWeight += weight;

      const progress = log.phaseProgressions[phase.id] !== undefined 
        ? log.phaseProgressions[phase.id] 
        : (phase.progress || 0);

      weightedSum += progress * weight;
    });

    return totalWeight > 0 ? weightedSum / totalWeight : 0;
  };

  // Generate timeline points for the comparison graph
  const generateChartData = () => {
    if (activePhases.length === 0) return [];

    // Find the date range of the project
    let minDateStr = activePhases[0].startDate;
    let maxDateStr = activePhases[0].endDate;

    activePhases.forEach(phase => {
      if (phase.startDate < minDateStr) minDateStr = phase.startDate;
      if (phase.endDate > maxDateStr) maxDateStr = phase.endDate;
    });

    // Also include latest log date if it exceeds maxDateStr
    activeLogs.forEach(log => {
      if (log.date > maxDateStr) maxDateStr = log.date;
    });

    const startDate = new Date(minDateStr + 'T00:00:00');
    const endDate = new Date(maxDateStr + 'T00:00:00');
    const totalDays = Math.max(1, (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));

    // Generate 8-12 uniform timeline check points
    const steps = Math.min(10, Math.max(4, activeLogs.length + 3));
    const points: { date: string; dateLabel: string; planned: number; actual: number | null }[] = [];

    for (let i = 0; i <= steps; i++) {
      const currentPointDate = new Date(startDate.getTime() + (totalDays * (i / steps)) * 24 * 60 * 60 * 1000);
      const yyyymmdd = currentPointDate.toISOString().split('T')[0];
      const displayLabel = currentPointDate.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

      // Calculate planned progress for this point
      const plannedVal = getPlannedProgressAtDate(yyyymmdd);

      // Find actual progress up to this date
      // We look at the latest weekly log that happened before or on this point
      const pastLogs = activeLogs.filter(log => log.date <= yyyymmdd);
      let actualVal: number | null = null;

      if (pastLogs.length > 0) {
        // Use the latest log in this subset
        const latestLog = pastLogs[pastLogs.length - 1];
        actualVal = getActualProgressFromLog(latestLog);
      } else if (yyyymmdd === minDateStr) {
        actualVal = 0;
      }

      points.push({
        date: yyyymmdd,
        dateLabel: displayLabel,
        planned: Math.round(plannedVal * 10) / 10,
        actual: actualVal !== null ? Math.round(actualVal * 10) / 10 : null
      });
    }

    // Ensure we also inject exact points for the weekly logs to avoid smoothing discrepancies
    activeLogs.forEach(log => {
      const exists = points.some(p => p.date === log.date);
      if (!exists) {
        const plannedVal = getPlannedProgressAtDate(log.date);
        const actualVal = getActualProgressFromLog(log);
        const logDateObj = new Date(log.date + 'T00:00:00');
        const displayLabel = logDateObj.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

        points.push({
          date: log.date,
          dateLabel: displayLabel,
          planned: Math.round(plannedVal * 10) / 10,
          actual: Math.round(actualVal * 10) / 10
        });
      }
    });

    // Sort by date chronologically
    return points.sort((a, b) => a.date.localeCompare(b.date));
  };

  const chartData = generateChartData();

  // Current statistics
  const currentPlanned = activePhases.length > 0 ? getPlannedProgressAtDate(new Date().toISOString().split('T')[0]) : 0;
  
  const latestLog = activeLogs.length > 0 ? activeLogs[activeLogs.length - 1] : null;
  const currentActual = latestLog ? getActualProgressFromLog(latestLog) : 0;
  
  const progressDeviation = currentActual - currentPlanned; // Positive is advance, negative is delay

  // ----------------------------------------------------
  // COMPARATIVO FÍSICO-FINANCEIRO CALCULATION
  // ----------------------------------------------------
  const projectTransactions = transactions.filter(t => t.projectId === projectId);
  const totalSpent = projectTransactions.reduce((acc, t) => acc + t.value, 0);
  const projectBudget = project?.budget || 0;
  const financialProgressPercent = projectBudget > 0 ? (totalSpent / projectBudget) * 100 : 0;
  const physicalFinancialGap = currentActual - financialProgressPercent;

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };

  // ----------------------------------------------------
  // FILE / PHOTO LOGIC
  // ----------------------------------------------------

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = () => {
        const url = reader.result as string;
        setTempPhotos(prev => [...prev, {
          id: `photo-temp-${Date.now()}-${Math.random()}`,
          name: file.name,
          url,
          file
        }]);
      };
      reader.readAsDataURL(file);
    });

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeTempPhoto = (id: string) => {
    setTempPhotos(prev => prev.filter(p => p.id !== id));
  };

  // Submit Weekly Log Form
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLog.weekLabel.trim() || !newLog.description.trim()) return;

    setIsUploading(true);
    const uploadedPhotosList: { id: string; url: string; name: string; description?: string }[] = [];

    try {
      // 1. Upload photos to Telegram/Firebase storage
      for (const photo of tempPhotos) {
        let finalUrl = photo.url;

        if (photo.file) {
          try {
            const config = await getTelegramConfig();
            const baseFormattedName = buildTelegramFileName(config.fileNamePattern, {
              centro: project?.name || 'Cliente',
              data: newLog.date,
              descricao: `${newLog.weekLabel} - ${newLog.description}`.substring(0, 50),
              extension: photo.name
            });
            const uniqueId = Math.floor(Math.random() * 10000);
            const dotIdx = baseFormattedName.lastIndexOf('.');
            const formattedName = dotIdx !== -1
              ? `${baseFormattedName.substring(0, dotIdx)}-${uniqueId}${baseFormattedName.substring(dotIdx)}`
              : `${baseFormattedName}-${uniqueId}`;

            const path = `acompanhamento_fisico/${projectId}/${formattedName}`;
            const res = await uploadBase64ToFirebase(photo.url, path, photo.file.type);
            if (res.url) {
              finalUrl = res.url;
            }
          } catch (err) {
            console.error('Error uploading photo to Telegram:', err);
          }
        }

        uploadedPhotosList.push({
          id: `photo-${Date.now()}-${Math.random()}`,
          url: finalUrl,
          name: photo.name,
          description: '' // can be expanded or left empty
        });
      }

      // 2. Assemble new weekly log
      const logId = `wl-${Date.now()}`;
      const logToAdd: PhysicalWeeklyLog = {
        id: logId,
        projectId,
        date: newLog.date,
        weekLabel: newLog.weekLabel.trim(),
        description: newLog.description.trim(),
        phaseProgressions: { ...newLog.phaseProgressions },
        photos: uploadedPhotosList
      };

      // 3. Update active timeline phases progress to match this weekly update
      const updatedPhases = timelinePhases.map(phase => {
        if (phase.projectId === projectId && newLog.phaseProgressions[phase.id] !== undefined) {
          return {
            ...phase,
            progress: newLog.phaseProgressions[phase.id]
          };
        }
        return phase;
      });
      setTimelinePhases(updatedPhases);

      // 4. Save Weekly Log
      addWeeklyLog(logToAdd);

      // 5. Reset Form
      setNewLog({
        date: new Date().toISOString().split('T')[0],
        weekLabel: '',
        description: '',
        phaseProgressions: {},
        photos: []
      });
      setTempPhotos([]);
      setIsFormOpen(false);
    } catch (err) {
      console.error('Error submitting physical log:', err);
      alert('Erro ao gravar o lançamento físico.');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className={`bg-white border border-stone-200 p-6 transition-all duration-300 ${isCollapsed ? 'space-y-0 pb-4' : 'space-y-6'}`}>
      
      {/* Header */}
      <div className={`flex flex-col md:flex-row md:items-center md:justify-between gap-4 ${isCollapsed ? '' : 'border-b border-stone-100 pb-4'}`}>
        <div>
          <h3 className="font-serif text-base text-stone-950 font-bold flex flex-wrap items-center gap-2">
            <Activity size={16} className="text-stone-700 animate-pulse" />
            <span>Acompanhamento Físico e Relatório Fotográfico Semanal</span>
            {isCollapsed && (
              <span className={`font-mono text-[11px] px-2 py-0.5 font-bold border uppercase tracking-wider ${
                progressDeviation >= 0 
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200' 
                  : 'bg-rose-50 text-rose-800 border-rose-200'
              }`}>
                Físico: {Math.round(currentActual)}% (Previsto: {Math.round(currentPlanned)}%)
              </span>
            )}
          </h3>
          <p className="text-xs text-stone-500 mt-0.5">
            Compare o previsto do planejamento contra o executado em canteiro, com fotos semanais organizadas.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {!isCollapsed && activePhases.length > 0 && !readOnly && (
            <button
              type="button"
              onClick={() => setIsFormOpen(!isFormOpen)}
              className="bg-stone-900 text-white hover:bg-stone-850 text-xs font-mono uppercase tracking-wider px-3 py-1.5 font-bold flex items-center gap-1 cursor-pointer transition-all"
            >
              <Plus size={13} />
              Lançar Progresso Semanal
            </button>
          )}
          <button
            type="button"
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="bg-white hover:bg-stone-50 border border-stone-300 text-stone-800 text-xs font-mono uppercase tracking-wider px-3 py-1.5 font-bold flex items-center gap-1.5 cursor-pointer transition-all"
            title={isCollapsed ? "Expandir Painel" : "Recolher Painel"}
          >
            {isCollapsed ? (
              <>
                <ChevronDown size={14} className="text-stone-600" />
                <span>Expandir</span>
              </>
            ) : (
              <>
                <ChevronUp size={14} className="text-stone-600" />
                <span>Minimizar</span>
              </>
            )}
          </button>
        </div>
      </div>

      {!isCollapsed && (
        <>
          {activePhases.length === 0 ? (
            <div className="bg-[#FAF9F6] border border-stone-200 p-8 text-center rounded-none space-y-3">
              <Info size={24} className="mx-auto text-stone-400" />
              <div className="space-y-1">
                <h5 className="font-serif text-sm font-bold text-stone-900">Nenhum cronograma planejado</h5>
                <p className="text-xs text-stone-500 max-w-md mx-auto leading-relaxed">
                  Para utilizar o acompanhamento físico e gerar o dashboard "Previsto x Executado", você precisa primeiro definir as fases da obra na aba **"Cronograma de Atividades e Medições" (módulo de planejamento)** acima.
                </p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              
              {/* Left Side: S-Curve Dashboard and deviations */}
              <div className="lg:col-span-7 space-y-6">
                
                {/* Gauge & Metrics Card */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-[#FAF9F6] border border-stone-200 p-4">
                    <span className="block text-[8px] font-mono uppercase text-stone-400 font-bold">Avanço Físico Real</span>
                    <div className="flex items-baseline gap-1 mt-1">
                      <span className="font-mono font-bold text-stone-950 text-xl">{Math.round(currentActual)}%</span>
                      <span className="text-[10px] text-stone-500 font-mono">concluído</span>
                    </div>
                    <div className="w-full bg-stone-200 h-1 mt-2.5">
                      <div className="bg-emerald-600 h-full" style={{ width: `${Math.min(100, currentActual)}%` }} />
                    </div>
                  </div>

                  <div className="bg-[#FAF9F6] border border-stone-200 p-4">
                    <span className="block text-[8px] font-mono uppercase text-stone-400 font-bold">Planejado Estimado</span>
                    <div className="flex items-baseline gap-1 mt-1">
                      <span className="font-mono font-bold text-stone-650 text-xl">{Math.round(currentPlanned)}%</span>
                      <span className="text-[10px] text-stone-500 font-mono">previsto para hoje</span>
                    </div>
                    <div className="w-full bg-stone-200 h-1 mt-2.5">
                      <div className="bg-stone-500 h-full" style={{ width: `${Math.min(100, currentPlanned)}%` }} />
                    </div>
                  </div>

                  <div className="bg-[#FAF9F6] border border-stone-200 p-4">
                    <span className="block text-[8px] font-mono uppercase text-stone-400 font-bold">Desvio de Cronograma</span>
                    <div className="flex items-baseline gap-1.5 mt-1">
                      {progressDeviation >= 0 ? (
                        <>
                          <span className="font-mono font-bold text-emerald-700 text-xl">+{Math.round(progressDeviation)}%</span>
                          <span className="text-[9px] bg-emerald-100 text-emerald-800 px-1 font-bold font-mono">Adiantado</span>
                        </>
                      ) : (
                        <>
                          <span className="font-mono font-bold text-red-700 text-xl">{Math.round(progressDeviation)}%</span>
                          <span className="text-[9px] bg-red-100 text-red-800 px-1 font-bold font-mono">Atrasado</span>
                        </>
                      )}
                    </div>
                    <p className="text-[9px] text-stone-500 mt-2 font-sans">
                      {progressDeviation >= 0 
                        ? 'Excelente! A obra física está com avanço superior ao planejado.' 
                        : 'Atenção: A obra física apresenta atraso em relação ao planejado.'}
                    </p>
                  </div>
                </div>

                {/* VISUAL CHART (PREVISTO X EXECUTADO) - CUSTOM RESPONSIVE SVG */}
                <div className="border border-stone-200 p-4 bg-white space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-mono text-xs uppercase tracking-wider text-stone-800 font-bold flex items-center gap-1.5">
                        <TrendingUp size={14} className="text-stone-700" />
                        Curva S de Progresso: Planejado x Realizado
                      </h4>
                      <p className="text-[10px] text-stone-500 mt-0.5">Visão analítica física-financeira ponderada pelo orçamento de cada etapa.</p>
                    </div>
                    <div className="flex items-center gap-3 text-[10px] font-mono">
                      <div className="flex items-center gap-1.5">
                        <div className="w-3 h-0.5 bg-stone-400 border-t border-dashed" />
                        <span className="text-stone-500">Previsto (Planejado)</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="w-3 h-1 bg-emerald-600" />
                        <span className="text-stone-900 font-bold">Executado (Real)</span>
                      </div>
                    </div>
                  </div>

                  {/* SVG Chart Frame */}
                  <div className="relative w-full h-[220px] bg-stone-50/50 border border-stone-150 p-2 select-none">
                    {chartData.length > 0 ? (
                      <svg viewBox="0 0 500 200" className="w-full h-full overflow-visible">
                        {/* Grid lines (0, 25, 50, 75, 100%) */}
                        {[0, 25, 50, 75, 100].map((yVal, idx) => {
                          const yPos = 170 - (yVal * 1.4); // Scale to fit y range 0-100 in 170px height
                          return (
                            <g key={idx}>
                              <line 
                                x1="35" 
                                y1={yPos} 
                                x2="480" 
                                y2={yPos} 
                                stroke="#e5e5e0" 
                                strokeWidth="0.75" 
                                strokeDasharray={yVal === 0 || yVal === 100 ? "0" : "2 2"} 
                              />
                              <text x="5" y={yPos + 3} className="text-[8px] font-mono fill-stone-400 font-bold">{yVal}%</text>
                            </g>
                          );
                        })}

                        {/* X-axis ticks & date labels */}
                        {chartData.map((pt, idx) => {
                          const xPos = 40 + (idx * (430 / (chartData.length - 1)));
                          return (
                            <g key={idx}>
                              <line x1={xPos} y1="170" x2={xPos} y2="173" stroke="#a8a29e" strokeWidth="1" />
                              <text 
                                x={xPos} 
                                y="185" 
                                textAnchor="middle" 
                                className="text-[7.5px] font-mono fill-stone-500"
                              >
                                {pt.dateLabel}
                              </text>
                            </g>
                          );
                        })}

                        {/* PLANNED PATH (PREVISTO) */}
                        <path
                          d={chartData.reduce((acc, pt, idx) => {
                            const x = 40 + (idx * (430 / (chartData.length - 1)));
                            const y = 170 - (pt.planned * 1.4);
                            return acc + `${idx === 0 ? 'M' : 'L'} ${x} ${y}`;
                          }, '')}
                          fill="none"
                          stroke="#78716c"
                          strokeWidth="1.5"
                          strokeDasharray="4 3"
                          opacity="0.85"
                        />

                        {/* ACTUAL PATH (EXECUTADO) */}
                        <path
                          d={chartData.reduce((acc, pt, idx) => {
                            if (pt.actual === null) return acc;
                            const x = 40 + (idx * (430 / (chartData.length - 1)));
                            const y = 170 - (pt.actual * 1.4);
                            return acc + `${idx === 0 ? 'M' : 'L'} ${x} ${y}`;
                          }, '')}
                          fill="none"
                          stroke="#10b981"
                          strokeWidth="3.2"
                          strokeLinecap="round"
                        />

                        {/* Shading area below actual path to make it gorgeous */}
                        <path
                          d={chartData.reduce((acc, pt, idx) => {
                            if (pt.actual === null) return acc;
                            const x = 40 + (idx * (430 / (chartData.length - 1)));
                            const y = 170 - (pt.actual * 1.4);
                            return acc + `${idx === 0 ? 'M' : 'L'} ${x} ${y}`;
                          }, '') + ` L ${40 + (chartData.filter(p => p.actual !== null).length - 1) * (430 / (chartData.length - 1))} 170 L 40 170 Z`}
                          fill="#10b981"
                          opacity="0.06"
                        />

                        {/* Data dots for actual logs */}
                        {chartData.map((pt, idx) => {
                          if (pt.actual === null) return null;
                          const x = 40 + (idx * (430 / (chartData.length - 1)));
                          const y = 170 - (pt.actual * 1.4);
                          return (
                            <g key={idx}>
                              {/* Glowing outer dot */}
                              <circle cx={x} cy={y} r="5" fill="#10b981" opacity="0.3" />
                              <circle cx={x} cy={y} r="3" fill="#047857" stroke="#ffffff" strokeWidth="1" />
                            </g>
                          );
                        })}

                        {/* Tooltip hint lines on hovering over chart points */}
                        {chartData.map((pt, idx) => {
                          const x = 40 + (idx * (430 / (chartData.length - 1)));
                          return (
                            <rect
                              key={idx}
                              x={x - 15}
                              y="20"
                              width="30"
                              height="150"
                              fill="transparent"
                              className="cursor-pointer group"
                            >
                              <title>{`Data: ${pt.date}\nPrevisto: ${pt.planned}%\nReal: ${pt.actual !== null ? pt.actual + '%' : 'Ainda não lançado'}`}</title>
                            </rect>
                          );
                        })}
                      </svg>
                    ) : (
                      <div className="flex items-center justify-center h-full text-xs text-stone-400 font-mono">
                        Dados de cronograma indisponíveis
                      </div>
                    )}
                  </div>
                </div>

                {/* Stage Progressions Comparison List */}
                <div className="border border-stone-200 p-4 space-y-3">
                  <h4 className="font-mono text-xs uppercase tracking-wider text-stone-800 font-bold">
                    Acompanhamento de Metas por Fase de Obra
                  </h4>
                  <div className="space-y-3">
                    {activePhases.map(phase => {
                      // Calculate planned progress for today for this specific phase
                      const today = new Date().toISOString().split('T')[0];
                      const start = new Date(phase.startDate + 'T00:00:00');
                      const end = new Date(phase.endDate + 'T00:00:00');
                      const now = new Date(today + 'T00:00:00');
                      
                      let phasePlanned = 0;
                      if (now < start) phasePlanned = 0;
                      else if (now >= end) phasePlanned = 100;
                      else {
                        const totalDur = end.getTime() - start.getTime();
                        const elap = now.getTime() - start.getTime();
                        phasePlanned = Math.round((elap / totalDur) * 100);
                      }

                      const phaseActual = phase.progress || 0;
                      const phaseDeviation = phaseActual - phasePlanned;

                      return (
                        <div key={phase.id} className="border-b border-stone-100 pb-2.5 last:border-0 last:pb-0">
                          <div className="flex justify-between text-xs font-semibold text-stone-900 mb-1">
                            <span>{phase.name}</span>
                            <div className="flex items-center gap-1.5 font-mono text-[11px]">
                              <span className="text-stone-500">Previsto: {phasePlanned}%</span>
                              <span className="text-stone-400">|</span>
                              <span className="text-emerald-700 font-bold">Real: {phaseActual}%</span>
                              {phaseDeviation !== 0 && (
                                <span className={`text-[10px] font-bold ${phaseDeviation >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                                  ({phaseDeviation >= 0 ? `+${phaseDeviation}` : phaseDeviation}%)
                                </span>
                              )}
                            </div>
                          </div>
                          
                          {/* Visual bars */}
                          <div className="relative w-full h-3 bg-stone-100 rounded-none flex overflow-hidden border border-stone-200">
                            {/* Planned Bar (dotted/grey background indicator) */}
                            <div 
                              className="absolute top-0 bottom-0 left-0 bg-stone-200 border-r border-stone-450" 
                              style={{ width: `${phasePlanned}%` }} 
                            />
                            {/* Actual Progress Bar */}
                            <div 
                              className="absolute top-0 bottom-0 left-0 bg-emerald-600/85" 
                              style={{ width: `${phaseActual}%` }} 
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Comparativo Físico-Financeiro (Desvio de Desembolso) */}
                <div className="border border-stone-200 p-5 bg-white space-y-4">
                  <div className="flex items-center justify-between border-b border-stone-150 pb-3">
                    <div className="flex items-center gap-2">
                      <Coins className="text-stone-700" size={16} />
                      <h4 className="font-mono text-xs uppercase tracking-wider text-stone-900 font-bold">
                        Análise de Desvio Físico-Financeiro
                      </h4>
                    </div>
                    {projectBudget > 0 && (
                      <span className={`text-[9.5px] font-mono px-2 py-0.5 font-bold uppercase tracking-wider border ${
                        physicalFinancialGap > 5 
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-200' 
                          : physicalFinancialGap < -5 
                          ? 'bg-red-50 text-red-800 border-red-200' 
                          : 'bg-stone-50 text-stone-700 border-stone-200'
                      }`}>
                        {physicalFinancialGap > 5 ? 'Obra Eficiente' : physicalFinancialGap < -5 ? 'Atenção / Desvio' : 'Equilibrado'}
                      </span>
                    )}
                  </div>

                  {projectBudget === 0 ? (
                    <div className="text-center py-4 px-2 space-y-2">
                      <AlertCircle size={20} className="mx-auto text-stone-400" />
                      <p className="text-xs text-stone-500 leading-relaxed max-w-sm mx-auto">
                        Por favor, defina o orçamento total do projeto no painel administrativo para habilitar a análise automática de desvio físico-financeiro.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {/* Metric Gauges Side by Side */}
                      <div className="grid grid-cols-2 gap-4">
                        <div className="bg-[#FAF9F6] border border-stone-200 p-3.5">
                          <div className="flex justify-between items-start mb-1">
                            <span className="text-[8px] font-mono uppercase text-stone-400 font-bold">Avanço Físico (Obra)</span>
                            <span className="font-mono text-[11px] font-bold text-emerald-700">{Math.round(currentActual)}%</span>
                          </div>
                          <div className="w-full bg-stone-200 h-1.5 rounded-none overflow-hidden">
                            <div className="bg-emerald-600 h-full" style={{ width: `${Math.min(100, currentActual)}%` }} />
                          </div>
                          <span className="block text-[9px] text-stone-500 font-mono mt-2">
                            Ponderado por fases
                          </span>
                        </div>

                        <div className="bg-[#FAF9F6] border border-stone-200 p-3.5">
                          <div className="flex justify-between items-start mb-1">
                            <span className="text-[8px] font-mono uppercase text-stone-400 font-bold">Desembolso Financeiro</span>
                            <span className="font-mono text-[11px] font-bold text-amber-700">{Math.round(financialProgressPercent)}%</span>
                          </div>
                          <div className="w-full bg-stone-200 h-1.5 rounded-none overflow-hidden">
                            <div className="bg-amber-600 h-full" style={{ width: `${Math.min(100, financialProgressPercent)}%` }} />
                          </div>
                          <span className="block text-[9px] text-stone-500 font-mono mt-2">
                            {formatCurrency(totalSpent)} consumidos
                          </span>
                        </div>
                      </div>

                      {/* Gap / Deviation meter */}
                      <div className="border border-stone-200 p-4 bg-stone-50/50 space-y-2.5">
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] font-mono uppercase text-stone-500 font-bold">Gap de Execução (Físico - Financeiro)</span>
                          <div className="flex items-center gap-1">
                            {physicalFinancialGap > 5 ? (
                              <span className="font-mono text-xs font-bold text-emerald-700 bg-emerald-100/70 px-1.5 py-0.5 rounded-none flex items-center gap-0.5">
                                +{Math.round(physicalFinancialGap)}% de Superávit
                              </span>
                            ) : physicalFinancialGap < -5 ? (
                              <span className="font-mono text-xs font-bold text-red-700 bg-red-100/70 px-1.5 py-0.5 rounded-none flex items-center gap-0.5">
                                {Math.round(physicalFinancialGap)}% de Déficit
                              </span>
                            ) : (
                              <span className="font-mono text-xs font-bold text-stone-700 bg-stone-150 px-1.5 py-0.5 rounded-none">
                                {physicalFinancialGap >= 0 ? '+' : ''}{Math.round(physicalFinancialGap)}% Alinhado
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Gap Visual Slider Meter */}
                        <div className="relative w-full h-4 bg-stone-200 rounded-none overflow-hidden flex items-center border border-stone-300">
                          {/* Centered zero line */}
                          <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-stone-400 z-10" />
                          
                          {/* Deviation filling bar */}
                          {physicalFinancialGap !== 0 && (
                            <div 
                              className={`absolute h-full top-0 ${
                                physicalFinancialGap > 0 ? 'bg-emerald-600/70' : 'bg-red-600/70'
                              }`}
                              style={{
                                left: physicalFinancialGap > 0 ? '50%' : `${Math.max(0, 50 - Math.abs(physicalFinancialGap))}%`,
                                width: `${Math.min(50, Math.abs(physicalFinancialGap))}%`
                              }}
                            />
                          )}
                          <div className="absolute left-2 text-[8px] font-mono text-stone-500 font-bold z-15">DÉFICIT (Mais Gasto)</div>
                          <div className="absolute right-2 text-[8px] font-mono text-stone-500 font-bold z-15">SUPERÁVIT (Mais Obra)</div>
                        </div>

                        {/* Text diagnostic */}
                        <p className="text-[11px] text-stone-600 leading-relaxed font-sans mt-2">
                          {physicalFinancialGap > 5 ? (
                            <>
                              <strong>Diagnóstico de Eficiência:</strong> A obra física avançou <strong className="text-emerald-700">{Math.round(currentActual)}%</strong> enquanto apenas <strong className="text-stone-900">{Math.round(financialProgressPercent)}%</strong> do orçamento total de <strong>{formatCurrency(projectBudget)}</strong> foi consumido. Isso representa uma eficiência de <strong>{Math.round(physicalFinancialGap)}%</strong>, indicando excelente controle de custos ou suprimentos instalados ainda pendentes de faturamento.
                            </>
                          ) : physicalFinancialGap < -5 ? (
                            <>
                              <strong>Diagnóstico de Alerta:</strong> O desembolso financeiro (<strong className="text-amber-800">{Math.round(financialProgressPercent)}%</strong>) está acima do avanço físico real (<strong className="text-stone-900">{Math.round(currentActual)}%</strong>). Isso aponta para um déficit de execução de <strong className="text-red-700">{Math.round(Math.abs(physicalFinancialGap))}%</strong> do projeto. É recomendável auditar desvios de custos, revisar adiantamentos de mão de obra ou acelerar as frentes de trabalho.
                            </>
                          ) : (
                            <>
                              <strong>Diagnóstico Saudável:</strong> O avanço físico de <strong className="text-stone-900">{Math.round(currentActual)}%</strong> está em perfeita harmonia com o desembolso financeiro de <strong className="text-stone-900">{Math.round(financialProgressPercent)}%</strong> (desvio mínimo de <strong>{Math.round(physicalFinancialGap)}%</strong>). O ritmo de execução está balanceado e de acordo com o planejado financeiro.
                            </>
                          )}
                        </p>
                      </div>

                      {/* Financial values overview footer */}
                      <div className="grid grid-cols-3 gap-2 pt-2 border-t border-stone-150">
                        <div>
                          <span className="block text-[7.5px] font-mono uppercase text-stone-400 font-bold">Orçamento Total</span>
                          <span className="font-mono font-bold text-stone-900 text-[11px]">{formatCurrency(projectBudget)}</span>
                        </div>
                        <div>
                          <span className="block text-[7.5px] font-mono uppercase text-stone-400 font-bold">Total Desembolsado</span>
                          <span className="font-mono font-bold text-stone-800 text-[11px]">{formatCurrency(totalSpent)}</span>
                        </div>
                        <div>
                          <span className="block text-[7.5px] font-mono uppercase text-stone-400 font-bold">Saldo Orçamentário</span>
                          <span className={`font-mono font-bold text-[11px] ${(projectBudget - totalSpent) >= 0 ? 'text-stone-700' : 'text-red-600'}`}>
                            {formatCurrency(projectBudget - totalSpent)}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

              </div>

              {/* Right Side: Log feed and photo report */}
              <div className="lg:col-span-5 space-y-6">
                
                {/* Add log weekly form (Inline collapsible) */}
                {isFormOpen && (
                  <form onSubmit={handleSubmit} className="border border-stone-300 p-4 bg-stone-50 space-y-4">
                    <div className="border-b border-stone-200 pb-2 flex items-center justify-between">
                      <h4 className="font-mono text-xs uppercase tracking-wider text-stone-900 font-bold">Lançar Acompanhamento Físico</h4>
                      <button 
                        type="button" 
                        onClick={() => setIsFormOpen(false)}
                        className="text-stone-400 hover:text-stone-700"
                      >
                        <X size={14} />
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[8px] font-mono uppercase text-stone-500 font-bold">Identificação da Semana</label>
                        <input
                          type="text"
                          required
                          className="w-full bg-white border border-stone-200 py-1 px-2.5 text-xs focus:outline-none"
                          placeholder="Ex: Semana 5"
                          value={newLog.weekLabel}
                          onChange={e => setNewLog({ ...newLog, weekLabel: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className="block text-[8px] font-mono uppercase text-stone-500 font-bold">Data do Registro</label>
                        <input
                          type="date"
                          required
                          className="w-full bg-white border border-stone-200 py-1 px-2 text-xs focus:outline-none font-mono"
                          value={newLog.date}
                          onChange={e => setNewLog({ ...newLog, date: e.target.value })}
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[8px] font-mono uppercase text-stone-500 font-bold">Serviços Executados (Resumo Semanal)</label>
                      <textarea
                        required
                        className="w-full bg-white border border-stone-200 py-1.5 px-2.5 text-xs focus:outline-none h-16 resize-none leading-normal text-stone-700"
                        placeholder="Descreva o que foi realizado na obra nesta semana..."
                        value={newLog.description}
                        onChange={e => setNewLog({ ...newLog, description: e.target.value })}
                      />
                    </div>

                    {/* Progressions for each phase */}
                    <div className="space-y-3 bg-white border border-stone-200 p-3">
                      <span className="block text-[8px] font-mono uppercase text-stone-500 font-bold border-b border-stone-100 pb-1">
                        Ajustar Porcentagem Concluída de Cada Etapa
                      </span>
                      <div className="space-y-2.5 max-h-[160px] overflow-y-auto pr-1">
                        {activePhases.map(phase => {
                          const currentVal = newLog.phaseProgressions[phase.id] !== undefined 
                            ? newLog.phaseProgressions[phase.id] 
                            : (phase.progress || 0);
                          return (
                            <div key={phase.id} className="space-y-1">
                              <div className="flex justify-between text-[11px] text-stone-800">
                                <span className="font-medium truncate max-w-[70%]" title={phase.name}>{phase.name}</span>
                                <span className="font-mono font-bold text-emerald-800">{currentVal}%</span>
                              </div>
                              <input
                                type="range"
                                min="0"
                                max="100"
                                step="5"
                                className="w-full accent-stone-900 cursor-pointer h-1.5 bg-stone-100 appearance-none border border-stone-200"
                                value={currentVal}
                                onChange={e => {
                                  const updatedProgressions = { ...newLog.phaseProgressions };
                                  updatedProgressions[phase.id] = parseInt(e.target.value);
                                  setNewLog({ ...newLog, phaseProgressions: updatedProgressions });
                                }}
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Weekly Photo attachments */}
                    <div className="space-y-2">
                      <label className="block text-[8px] font-mono uppercase text-stone-500 font-bold">Fotos do Relatório Semanal</label>
                      
                      {/* Dual Upload Buttons */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1">
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="flex items-center justify-center gap-2 border-2 border-dashed border-stone-300 hover:border-stone-500 bg-white hover:bg-stone-50/50 py-3 px-3 text-[10px] font-mono uppercase font-bold tracking-wider text-stone-800 transition-all cursor-pointer"
                        >
                          <Upload size={13} className="text-stone-500" />
                          <span>Adicionar Fotos Locais</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => cameraInputRef.current?.click()}
                          className="flex items-center justify-center gap-2 border-2 border-dashed border-stone-300 hover:border-stone-500 bg-white hover:bg-stone-50/50 py-3 px-3 text-[10px] font-mono uppercase font-bold tracking-wider text-stone-800 transition-all cursor-pointer"
                        >
                          <Camera size={13} className="text-stone-500" />
                          <span>Tirar Foto</span>
                        </button>
                      </div>

                      <input 
                        type="file" 
                        ref={fileInputRef} 
                        onChange={handlePhotoSelect} 
                        className="hidden" 
                        multiple 
                        accept="image/*" 
                      />

                      <input 
                        type="file" 
                        ref={cameraInputRef} 
                        onChange={handlePhotoSelect} 
                        className="hidden" 
                        accept="image/*" 
                        capture="environment"
                      />

                      {tempPhotos.length > 0 && (
                        <div className="grid grid-cols-3 gap-2 pt-1 bg-white p-2 border border-stone-200">
                          {tempPhotos.map((photo) => (
                            <div key={photo.id} className="relative group aspect-square border border-stone-200 bg-stone-50">
                              <img 
                                src={photo.url} 
                                alt={photo.name} 
                                referrerPolicy="no-referrer"
                                className="w-full h-full object-cover" 
                              />
                              <button
                                type="button"
                                onClick={() => removeTempPhoto(photo.id)}
                                className="absolute top-1 right-1 bg-stone-900 text-white rounded-none p-1 hover:bg-red-700 cursor-pointer transition-all shadow-md"
                              >
                                <X size={10} />
                              </button>
                              <div className="absolute bottom-0 left-0 right-0 bg-stone-900/75 p-0.5 text-center text-[8px] font-mono text-white truncate px-1">
                                {photo.name}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                    </div>

                    <div className="flex justify-end gap-2 pt-2 border-t border-stone-200">
                      <button
                        type="button"
                        onClick={() => setIsFormOpen(false)}
                        className="px-3 py-1.5 text-xs font-mono uppercase text-stone-500 hover:text-stone-800 cursor-pointer"
                      >
                        Descartar
                      </button>
                      <button
                        type="submit"
                        disabled={isUploading}
                        className="bg-stone-900 text-white hover:bg-stone-850 py-1.5 px-4 text-xs font-mono uppercase tracking-wider font-bold cursor-pointer flex items-center gap-1.5"
                      >
                        {isUploading ? (
                          <>
                            <Loader2 size={12} className="animate-spin" />
                            <span>Processando...</span>
                          </>
                        ) : (
                          <>
                            <span>Salvar Acompanhamento</span>
                          </>
                        )}
                      </button>
                    </div>
                  </form>
                )}

                {/* History list of physical logs (weekly list) */}
                <div className="space-y-4">
                  <h4 className="font-mono text-xs uppercase tracking-wider text-stone-800 font-bold border-b border-stone-100 pb-2 flex items-center justify-between">
                    <span>Histórico de Relatórios Semanais ({activeLogs.length})</span>
                    <Clock size={13} className="text-stone-400" />
                  </h4>

                  {activeLogs.length === 0 ? (
                    <div className="border border-dashed border-stone-200 p-6 text-center text-stone-400 text-xs font-mono">
                      Nenhum relatório físico registrado para esta obra.
                    </div>
                  ) : (
                    <div className="space-y-4 max-h-[450px] overflow-y-auto pr-1">
                      {activeLogs.slice().reverse().map((log) => {
                        const calculatedOverallLogProgress = Math.round(getActualProgressFromLog(log));
                        return (
                          <div key={log.id} className="border border-stone-200 p-4 space-y-3 bg-[#FAF9F6]">
                            <div className="flex justify-between items-start border-b border-stone-150 pb-2">
                              <div>
                                <h5 className="font-serif text-xs text-stone-900 font-bold">{log.weekLabel}</h5>
                                <span className="text-[9px] text-stone-500 font-mono inline-flex items-center gap-1 mt-0.5">
                                  <Calendar size={10} />
                                  {log.date}
                                </span>
                              </div>
                              <div className="text-right">
                                <span className="font-mono text-[11px] bg-emerald-50 text-emerald-800 font-bold px-2 py-0.5 border border-emerald-150">
                                  Avanço: {calculatedOverallLogProgress}%
                                </span>
                              </div>
                            </div>

                            <p className="text-xs text-stone-700 leading-relaxed font-sans whitespace-pre-line">
                              {log.description}
                            </p>

                            {/* Photos associated with this weekly log */}
                            {log.photos && log.photos.length > 0 && (
                              <div className="space-y-1.5 pt-1">
                                <span className="text-[8px] font-mono uppercase text-stone-400 block font-bold">Galeria de Fotos do Período</span>
                                <div className="grid grid-cols-4 gap-2">
                                  {log.photos.map((photo) => (
                                    <div key={photo.id} className="relative aspect-square border border-stone-200 bg-white group cursor-pointer overflow-hidden">
                                      <img 
                                        src={photo.url} 
                                        alt={photo.name} 
                                        referrerPolicy="no-referrer"
                                        className="w-full h-full object-cover transition-all group-hover:scale-105" 
                                      />
                                      {photo.url.startsWith('http') && (
                                        <a
                                          href={photo.url}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-[9px] font-mono transition-all"
                                          title="Ver foto em tamanho cheio"
                                        >
                                          Expandir ↗
                                        </a>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Trash button */}
                            {!readOnly && (
                              <div className="flex justify-end pt-1 border-t border-stone-150">
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (window.confirm('Excluir este relatório semanal permanentemente? Isso irá restaurar o progresso das etapas anterior.')) {
                                      if (deleteWeeklyLog) deleteWeeklyLog(log.id);
                                    }
                                  }}
                                  className="text-stone-400 hover:text-red-700 transition-all font-mono text-[9px] uppercase tracking-wider flex items-center gap-1 cursor-pointer font-bold"
                                >
                                  <Trash2 size={11} />
                                  Excluir Relatório
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                </div>

              </div>

            </div>
          )}
        </>
      )}

    </div>
  );
}
