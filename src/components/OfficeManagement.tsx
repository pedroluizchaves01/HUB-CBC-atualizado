import React, { useState, useEffect, useMemo } from 'react';
import { Client } from '../types';
import { 
  DollarSign, 
  Users, 
  Plus, 
  Trash2, 
  Edit, 
  TrendingUp, 
  TrendingDown, 
  Briefcase, 
  Search, 
  Filter, 
  ChevronRight, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  ArrowUpRight, 
  ArrowDownRight, 
  Percent, 
  Layers, 
  Check, 
  UserPlus, 
  UserCheck,
  FileText,
  Mail,
  Phone,
  Calendar,
  X,
  UploadCloud,
  Upload,
  Sparkles,
  Camera,
  Paperclip
} from 'lucide-react';
import { motion } from 'motion/react';
import { initAuth, googleSignIn, getAccessToken } from '../lib/firebaseAuth';
import { subscribeCollection, saveDoc, removeDoc } from '../lib/firebaseDb';
import { uploadBase64ToFirebase } from '../lib/firebaseStorage';
import { getTelegramConfig, buildTelegramFileName } from '../lib/telegramService';

// Office interfaces
export interface OfficeTransaction {
  id: string;
  description: string;
  type: 'entrada' | 'saida';
  category: string;
  value: number;
  date: string;
  status: 'confirmado' | 'pendente';
  notes?: string;
  receiptUrl?: string;
  receiptName?: string;
  receiptFileId?: string;
  payerName?: string;      // Quem pagou (extraído do comprovante ou digitado)
  receiverName?: string;   // Quem recebeu (extraído do comprovante ou digitado)
  documentNumber?: string; // Nº do comprovante/transação (E2E, autenticação, protocolo)
}

export interface OfficeLead {
  id: string;
  name: string;
  contactPerson: string;
  email: string;
  phone: string;
  status: 'prospeccao' | 'reuniao' | 'proposta' | 'negociacao' | 'fechado' | 'perdido';
  estimatedValue: number;
  description: string;
  notes?: string;
  createdAt: string;
  convertedClientId?: string;
}

interface OfficeManagementProps {
  clients: Client[];
  onAddClient: (client: Client, pass: string) => Promise<void>;
}

// Map categories to user-friendly labels and styles
const ENTRY_CATEGORIES = {
  servico_projeto: { label: 'Projeto de Arquitetura', bg: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  consultoria: { label: 'Consultoria Técnica', bg: 'bg-teal-50 text-teal-700 border-teal-200' },
  taxa_gestao: { label: 'Taxa de Gestão de Obra', bg: 'bg-sky-50 text-sky-700 border-sky-200' },
  outras_entradas: { label: 'Outros Recebimentos', bg: 'bg-stone-100 text-stone-700 border-stone-200' },
};

const EXIT_CATEGORIES = {
  pro_labore: { label: 'Pró-labore Sócios', bg: 'bg-amber-50 text-amber-700 border-amber-200' },
  aluguel_escritorio: { label: 'Aluguel & Condomínio', bg: 'bg-rose-50 text-rose-700 border-rose-200' },
  colaboradores: { label: 'Salários & Prestadores', bg: 'bg-orange-50 text-orange-700 border-orange-200' },
  impostos: { label: 'Impostos e Taxas', bg: 'bg-red-50 text-red-700 border-red-200' },
  softwares: { label: 'Licenças de Software', bg: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  marketing: { label: 'Marketing & Divulgação', bg: 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200' },
  utilidades: { label: 'Energia / Internet / Água', bg: 'bg-violet-50 text-violet-700 border-violet-200' },
  outras_saidas: { label: 'Outras Despesas', bg: 'bg-stone-100 text-stone-700 border-stone-200' },
};

const CRM_STAGES = [
  { id: 'prospeccao', label: 'Prospecção', color: 'border-t-stone-400 bg-stone-50 text-stone-700' },
  { id: 'reuniao', label: 'Reunião Inicial', color: 'border-t-blue-400 bg-blue-50/50 text-blue-700' },
  { id: 'proposta', label: 'Proposta Enviada', color: 'border-t-amber-400 bg-amber-50/50 text-amber-700' },
  { id: 'negociacao', label: 'Em Negociação', color: 'border-t-purple-400 bg-purple-50/50 text-purple-700' },
  { id: 'fechado', label: 'Fechado (Ganho)', color: 'border-t-emerald-400 bg-emerald-50 text-emerald-700' },
  { id: 'perdido', label: 'Perdido', color: 'border-t-red-400 bg-red-50 text-red-700' }
];

export function OfficeManagement({ clients, onAddClient }: OfficeManagementProps) {
  // Tabs: 'financeiro' | 'crm'
  const [activeSubTab, setActiveSubTab] = useState<'financeiro' | 'crm'>('financeiro');

  // Modals / Forms States
  const [isTxModalOpen, setIsTxModalOpen] = useState(false);
  const [editingTx, setEditingTx] = useState<OfficeTransaction | null>(null);
  const [txForm, setTxForm] = useState({
    description: '',
    type: 'entrada' as 'entrada' | 'saida',
    category: 'servico_projeto',
    value: '',
    date: new Date().toISOString().split('T')[0],
    status: 'confirmado' as 'confirmado' | 'pendente',
    notes: '',
    receiptUrl: '',
    receiptName: '',
    receiptFileId: '',
    payerName: '',
    receiverName: '',
    documentNumber: ''
  });

  const [isGoogleLinked, setIsGoogleLinked] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [selectedOfficeFile, setSelectedOfficeFile] = useState<{ name: string; type: string; base64: string } | null>(null);

  const cameraFileInputRef = React.useRef<HTMLInputElement>(null);

  // Camera states
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  // Ref do MediaStream ativo e do timeout de abertura da câmera (evita vazamento se desmontar)
  const streamRef = React.useRef<MediaStream | null>(null);
  const startCameraTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = React.useRef(true);
  // Guarda o resultado do upload já realizado para reutilizar em retries da IA (evita reenvio duplicado)
  const uploadedReceiptRef = React.useRef<{ base64: string; url: string; fileId: string; name: string } | null>(null);

  const analyzeAndUploadReceiptBase64 = async (base64: string, mimeType: string, fileName: string) => {
    setIsAnalyzing(true);

    // Se já existe um upload deste mesmo arquivo (retry após falha da IA), reutiliza-o em vez de reenviar.
    let uploadResult: { url: string; error: string | null } = { url: '', error: null };
    if (uploadedReceiptRef.current && uploadedReceiptRef.current.base64 === base64) {
      uploadResult = { url: uploadedReceiptRef.current.url, error: null };
    }

    try {
      // 1. Upload to Firebase Storage (Requirement 1) — só reenvia se ainda não houver upload deste arquivo
      if (!(uploadedReceiptRef.current && uploadedReceiptRef.current.base64 === base64)) {
        const config = await getTelegramConfig();
        const formattedName = buildTelegramFileName(config.fileNamePattern, {
          centro: 'Escritório CBC',
          data: txForm.date || new Date().toISOString().split('T')[0],
          fornecedor: 'Recibo',
          descricao: txForm.description || fileName || 'Recibo',
          valor: txForm.value ? parseFloat(txForm.value) : '',
          extension: fileName
        });
        const storagePath = `office_receipts/${formattedName}`;
        uploadResult = await uploadBase64ToFirebase(base64, storagePath, mimeType);

        // Guarda o resultado do upload para reutilizar caso a IA falhe e o usuário tente novamente.
        if (uploadResult.url) {
          uploadedReceiptRef.current = {
            base64,
            url: uploadResult.url,
            fileId: '',
            name: fileName
          };
        }
      }

      // 2. Analyze with Gemini
      const token = await getAccessToken();

      const response = await fetch("/api/office/analyze-receipt", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          fileBase64: base64,
          mimeType,
          fileName,
          accessToken: token || undefined
        })
      });

      if (!response.ok) {
        let serverMessage = 'Falha no servidor ao analisar o arquivo.';
        try {
          const errJson = await response.json();
          if (errJson?.error) serverMessage = errJson.error;
        } catch {}
        throw new Error(serverMessage);
      }

      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || "A IA não conseguiu analisar o arquivo.");
      }

      const receipt = data.receiptData;
      // Preenche apenas os campos ainda vazios para não sobrescrever o que o usuário já digitou (evita race com isAnalyzing)
      setTxForm(prev => ({
        ...prev,
        description: prev.description || receipt.description || prev.description,
        type: prev.type ? prev.type : ((receipt.type === 'entrada' || receipt.type === 'saida') ? receipt.type : prev.type),
        category: prev.category || receipt.category || prev.category,
        value: prev.value || (receipt.value ? receipt.value.toString() : prev.value),
        date: prev.date || receipt.date || prev.date,
        payerName: prev.payerName || receipt.payerName || prev.payerName,
        receiverName: prev.receiverName || receipt.receiverName || prev.receiverName,
        documentNumber: prev.documentNumber || receipt.documentNumber || prev.documentNumber,
        receiptUrl: uploadResult.url || data.driveFile?.webViewLink || prev.receiptUrl,
        receiptName: fileName,
        receiptFileId: data.driveFile?.id || prev.receiptFileId
      }));

      setSelectedOfficeFile(null);

      const engineLabel = data.engine === 'gemini'
        ? 'lido pela IA Gemini'
        : 'lido pelo motor interno de OCR (sem IA externa)';
      const lowConfidenceWarning = (typeof data.confidence === 'number' && data.confidence < 0.6)
        ? '\n\nAtenção: a leitura automática teve confiança baixa — confira os campos preenchidos antes de salvar.'
        : '';

      if (uploadResult.error) {
        alert(`Comprovante ${engineLabel} com sucesso!${lowConfidenceWarning}\n\nNota de Armazenamento: ${uploadResult.error}`);
      } else {
        alert(`Comprovante ${engineLabel} com sucesso e armazenado com segurança no Firebase Storage!${lowConfidenceWarning}`);
      }

    } catch (err: any) {
      console.error("Erro na análise/upload:", err);
      // Se o upload já ocorreu, preserva o comprovante anexado mesmo que a análise da IA falhe.
      if (uploadResult.url) {
        setTxForm(prev => ({
          ...prev,
          receiptUrl: prev.receiptUrl || uploadResult.url,
          receiptName: prev.receiptName || fileName
        }));
      }
      alert("Falha ao analisar comprovante: " + (err.message || "Erro desconhecido"));
    } finally {
      setIsAnalyzing(false);
    }
  };

  const startCamera = async () => {
    setIsCameraActive(true);
    setCameraError(null);
    setCameraStream(null);

    startCameraTimeoutRef.current = setTimeout(async () => {
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          throw new Error('Acesso à câmera não é suportado pelo seu navegador atual. Use o botão de câmera nativa do celular abaixo.');
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
        });

        // Se o componente desmontou (ou a câmera foi fechada) enquanto o getUserMedia resolvia, para o stream imediatamente.
        if (!isMountedRef.current) {
          stream.getTracks().forEach(track => track.stop());
          return;
        }

        streamRef.current = stream;
        setCameraStream(stream);
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(e => {
            console.error('Erro ao dar play no vídeo:', e);
          });
        }
      } catch (err: any) {
        console.error('Erro ao abrir a câmera:', err);
        let errorMsg = 'Permissão de acesso à câmera negada ou bloqueada pelo navegador.';
        if (err.name === 'NotAllowedError') {
          errorMsg = 'Permissão de câmera negada. Por favor, ative a permissão de câmera nas configurações do navegador ou use o botão abaixo para abrir a câmera nativa.';
        } else if (err.message) {
          errorMsg = err.message;
        }
        setCameraError(errorMsg);
      }
    }, 150);
  };

  const stopCamera = () => {
    if (startCameraTimeoutRef.current) {
      clearTimeout(startCameraTimeoutRef.current);
      startCameraTimeoutRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
    }
    setCameraStream(null);
    setIsCameraActive(false);
  };

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');
    
    if (context) {
      const width = video.videoWidth || 640;
      const height = video.videoHeight || 480;
      canvas.width = width;
      canvas.height = height;
      
      context.drawImage(video, 0, 0, width, height);
      
      const base64String = canvas.toDataURL('image/jpeg', 0.85);
      
      // Stop camera stream
      stopCamera();

      // Convert base64 dataurl to raw base64 and process
      const base64Data = base64String.split(',')[1];
      setSelectedOfficeFile({
        name: `comprovante_camera_${Date.now()}.jpg`,
        type: 'image/jpeg',
        base64: base64Data
      });
    } else {
      // Contexto 2D indisponível: encerra a câmera e orienta o usuário a usar a câmera nativa.
      stopCamera();
      setCameraError('Não foi possível processar a imagem da câmera neste dispositivo. Use o botão de câmera nativa do celular.');
      alert('Não foi possível capturar a foto pela câmera do navegador. Por favor, use o botão de câmera nativa do celular.');
    }
  };

  const handleCameraFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const file = input.files?.[0];
    if (!file) {
      input.value = '';
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      alert("O arquivo excede o limite permitido de 5MB.");
      input.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64Data = result.split(',')[1];
      setSelectedOfficeFile({
        name: file.name || `camera_${Date.now()}.jpg`,
        type: file.type || 'image/jpeg',
        base64: base64Data
      });
    };
    reader.readAsDataURL(file);
    // Permite reanexar o mesmo arquivo posteriormente.
    input.value = '';
  };

  // Cleanup ao desmontar: marca desmontado, limpa o timeout e para o stream do ref (evita vazamento de MediaStream).
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (startCameraTimeoutRef.current) {
        clearTimeout(startCameraTimeoutRef.current);
        startCameraTimeoutRef.current = null;
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
      if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [cameraStream]);

  // Custom non-blocking Delete states (works in iframe sandbox)
  const [txToDelete, setTxToDelete] = useState<string | null>(null);
  const [leadToDelete, setLeadToDelete] = useState<string | null>(null);

  // --- PERSISTENT DATA FOR OFFICE ---
  const [officeTransactions, setOfficeTransactions] = useState<OfficeTransaction[]>([]);
  const [officeLeads, setOfficeLeads] = useState<OfficeLead[]>([]);

  const INITIAL_OFFICE_TRANSACTIONS = [
    { id: 'otx-1', description: 'Projeto Residencial G+A (Entrada 1/2)', type: 'entrada', category: 'servico_projeto', value: 15000, date: '2026-06-10', status: 'confirmado', notes: 'Sinal de aprovação para início do projeto conceitual.' },
    { id: 'otx-2', description: 'Consultoria Técnica Comercial Loft Pinheiros', type: 'entrada', category: 'consultoria', value: 4500, date: '2026-06-15', status: 'confirmado' },
    { id: 'otx-3', description: 'Aluguel Escritório Sede Paulista', type: 'saida', category: 'aluguel_escritorio', value: 3800, date: '2026-06-05', status: 'confirmado', notes: 'Referente ao mês de competência Maio/2026.' },
    { id: 'otx-4', description: 'Assinatura Mensal AutoDesk Revit + CAD', type: 'saida', category: 'softwares', value: 850, date: '2026-06-12', status: 'confirmado' },
    { id: 'otx-5', description: 'Pró-Labore Sócios (Correa, Brites, Chaves)', type: 'saida', category: 'pro_labore', value: 12000, date: '2026-06-30', status: 'confirmado' },
    { id: 'otx-6', description: 'Taxa de Gestão Obra Consultório Odonto', type: 'entrada', category: 'taxa_gestao', value: 5200, date: '2026-07-10', status: 'pendente' },
    { id: 'otx-7', description: 'Imposto Simples Nacional (Competência Junho)', type: 'saida', category: 'impostos', value: 1850, date: '2026-07-20', status: 'pendente' }
  ];

  // Dados de exemplo — contatos FICTÍCIOS (e-mails .example / telefones de documentação).
  // Substitua pelos leads reais no CRM; não versione dados pessoais de terceiros (LGPD).
  const INITIAL_OFFICE_LEADS = [
    { id: 'olead-1', name: 'Reforma Cobertura Duplex Itaim', contactPerson: 'Contato Exemplo 1', email: 'lead1@exemplo.example', phone: '(11) 40000-1001', status: 'negociacao', estimatedValue: 45000, description: 'Projeto de interiores completo e gestão de reforma em cobertura duplex de 220m².', createdAt: '2026-06-25' },
    { id: 'olead-2', name: 'Residência Quinta da Baroneza II', contactPerson: 'Contato Exemplo 2', email: 'lead2@exemplo.example', phone: '(11) 40000-1002', status: 'proposta', estimatedValue: 180000, description: 'Estudo preliminar e conceitual de arquitetura para casa de campo de alto padrão.', createdAt: '2026-06-28' },
    { id: 'olead-3', name: 'Consultório Dermatologia Jardins', contactPerson: 'Contato Exemplo 3', email: 'lead3@exemplo.example', phone: '(11) 40000-1003', status: 'prospeccao', estimatedValue: 28000, description: 'Adequação de layout clínico com 3 consultórios e recepção sob normas ANVISA.', createdAt: '2026-07-02' },
    { id: 'olead-4', name: 'Edifício Comercial Pinheiros (Lobby)', contactPerson: 'Contato Exemplo 4', email: 'lead4@exemplo.example', phone: '(11) 40000-1004', status: 'fechado', estimatedValue: 65000, description: 'Revitalização do hall social do edifício de escritórios.', createdAt: '2026-06-18' }
  ];

  useEffect(() => {
    const unsubTx = subscribeCollection('office_transactions', setOfficeTransactions, INITIAL_OFFICE_TRANSACTIONS, 'cbc_office_transactions');
    const unsubLeads = subscribeCollection('office_leads', setOfficeLeads, INITIAL_OFFICE_LEADS, 'cbc_office_leads');

    return () => {
      unsubTx();
      unsubLeads();
    };
  }, []);

  // Google OAuth configuration & initialization
  useEffect(() => {
    initAuth(
      (user, token) => {
        setIsGoogleLinked(true);
      },
      () => {
        setIsGoogleLinked(false);
      }
    );
  }, []);

  useEffect(() => {
    const checkGoogleConnection = async () => {
      const token = await getAccessToken();
      setIsGoogleLinked(!!token);
    };
    if (isTxModalOpen) {
      checkGoogleConnection();
    }
  }, [isTxModalOpen]);

  const handleLinkGoogle = async () => {
    try {
      const res = await googleSignIn();
      if (res) {
        setIsGoogleLinked(true);
        alert("Google Drive conectado com sucesso para o envio de comprovantes!");
      }
    } catch (err: any) {
      console.error("Erro ao conectar Google:", err);
      alert("Falha ao conectar com o Google: " + (err.message || err));
    }
  };

  const handleAnalyzeAndUploadReceipt = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      alert("O arquivo excede o limite permitido de 5MB.");
      return;
    }

    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => {
          const result = reader.result as string;
          const base64String = result.split(',')[1];
          resolve(base64String);
        };
        reader.onerror = (err) => reject(err);
      });

      setSelectedOfficeFile({
        name: file.name,
        type: file.type,
        base64: base64
      });
    } catch (err: any) {
      console.error("Erro na leitura do arquivo:", err);
      alert("Falha ao carregar o arquivo: " + (err.message || "Erro desconhecido"));
    } finally {
      e.target.value = '';
    }
  };

  // --- STATE FOR FORMS / FILTERS ---
  // Financial Filters
  const [txSearch, setTxSearch] = useState('');
  const [txTypeFilter, setTxTypeFilter] = useState<'all' | 'entrada' | 'saida'>('all');
  const [txStatusFilter, setTxStatusFilter] = useState<'all' | 'confirmado' | 'pendente'>('all');
  const [txCategoryFilter, setTxCategoryFilter] = useState('all');

  // CRM Filters
  const [crmSearch, setCrmSearch] = useState('');
  const [crmStageFilter, setCrmStageFilter] = useState('all');

  const [isLeadModalOpen, setIsLeadModalOpen] = useState(false);
  const [editingLead, setEditingLead] = useState<OfficeLead | null>(null);
  const [leadForm, setLeadForm] = useState({
    name: '',
    contactPerson: '',
    email: '',
    phone: '',
    status: 'prospeccao' as 'prospeccao' | 'reuniao' | 'proposta' | 'negociacao' | 'fechado' | 'perdido',
    estimatedValue: '',
    description: '',
    notes: ''
  });

  // Conversion process
  const [conversionLead, setConversionLead] = useState<OfficeLead | null>(null);
  const [conversionForm, setConversionForm] = useState({
    username: '',
    password: '',
    error: null as string | null,
    success: null as string | null
  });

  // --- FINANCIAL CALCULATION METRICS ---
  const financialMetrics = useMemo(() => {
    let totalEntradas = 0;
    let totalSaidas = 0;
    let pendenteEntradas = 0;
    let pendenteSaidas = 0;

    officeTransactions.forEach(tx => {
      const val = tx.value;
      if (tx.type === 'entrada') {
        if (tx.status === 'confirmado') {
          totalEntradas += val;
        } else {
          pendenteEntradas += val;
        }
      } else {
        if (tx.status === 'confirmado') {
          totalSaidas += val;
        } else {
          pendenteSaidas += val;
        }
      }
    });

    return {
      realEntradas: totalEntradas,
      realSaidas: totalSaidas,
      realBalance: totalEntradas - totalSaidas,
      pendEntries: pendenteEntradas,
      pendExits: pendenteSaidas,
      estimatedBalance: (totalEntradas + pendenteEntradas) - (totalSaidas + pendenteSaidas)
    };
  }, [officeTransactions]);

  // --- FILTERED LISTS ---
  const filteredTransactions = useMemo(() => {
    return officeTransactions.filter(tx => {
      const matchesSearch = tx.description.toLowerCase().includes(txSearch.toLowerCase()) || (tx.notes || '').toLowerCase().includes(txSearch.toLowerCase());
      const matchesType = txTypeFilter === 'all' || tx.type === txTypeFilter;
      const matchesStatus = txStatusFilter === 'all' || tx.status === txStatusFilter;
      const matchesCategory = txCategoryFilter === 'all' || tx.category === txCategoryFilter;
      return matchesSearch && matchesType && matchesStatus && matchesCategory;
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [officeTransactions, txSearch, txTypeFilter, txStatusFilter, txCategoryFilter]);

  const filteredLeads = useMemo(() => {
    return officeLeads.filter(lead => {
      const matchesSearch = lead.name.toLowerCase().includes(crmSearch.toLowerCase()) || 
                            lead.contactPerson.toLowerCase().includes(crmSearch.toLowerCase()) ||
                            lead.description.toLowerCase().includes(crmSearch.toLowerCase());
      const matchesStage = crmStageFilter === 'all' || lead.status === crmStageFilter;
      return matchesSearch && matchesStage;
    });
  }, [officeLeads, crmSearch, crmStageFilter]);

  // CRM funnel calculations
  const crmMetrics = useMemo(() => {
    const totalPipeline = officeLeads
      .filter(l => l.status !== 'fechado' && l.status !== 'perdido')
      .reduce((sum, l) => sum + l.estimatedValue, 0);

    const closedWonValue = officeLeads
      .filter(l => l.status === 'fechado')
      .reduce((sum, l) => sum + l.estimatedValue, 0);

    const stageCounts = officeLeads.reduce((acc, lead) => {
      acc[lead.status] = (acc[lead.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      totalPipeline,
      closedWonValue,
      stageCounts
    };
  }, [officeLeads]);

  // --- FORM HANDLERS ---
  const handleOpenAddTx = () => {
    setEditingTx(null);
    setSelectedOfficeFile(null);
    setTxForm({
      description: '',
      type: 'saida', // default to salida as receipts are usually expenses
      category: 'outras_saidas',
      value: '',
      date: new Date().toISOString().split('T')[0],
      status: 'confirmado',
      notes: '',
      receiptUrl: '',
      receiptName: '',
      receiptFileId: '',
      payerName: '',
      receiverName: '',
      documentNumber: ''
    });
    setIsTxModalOpen(true);
  };

  const handleOpenEditTx = (tx: OfficeTransaction) => {
    setEditingTx(tx);
    setSelectedOfficeFile(null);
    setTxForm({
      description: tx.description,
      type: tx.type,
      category: tx.category,
      value: tx.value.toString(),
      date: tx.date,
      status: tx.status,
      notes: tx.notes || '',
      receiptUrl: tx.receiptUrl || '',
      receiptName: tx.receiptName || '',
      receiptFileId: tx.receiptFileId || '',
      payerName: tx.payerName || '',
      receiverName: tx.receiverName || '',
      documentNumber: tx.documentNumber || ''
    });
    setIsTxModalOpen(true);
  };

  const handleSaveTx = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!txForm.description || !txForm.value || parseFloat(txForm.value) <= 0) {
      alert('Preencha os campos obrigatórios com valores válidos.');
      return;
    }

    const valueNum = parseFloat(txForm.value);
    setIsAnalyzing(true);

    try {
      let finalReceiptUrl = txForm.receiptUrl || '';
      let finalReceiptName = txForm.receiptName || '';
      let finalReceiptFileId = txForm.receiptFileId || '';

      if (selectedOfficeFile) {
        const config = await getTelegramConfig();
        const formattedName = buildTelegramFileName(config.fileNamePattern, {
          centro: 'Escritório CBC',
          data: txForm.date || new Date().toISOString().split('T')[0],
          fornecedor: 'Recibo',
          descricao: txForm.description || selectedOfficeFile.name || 'Recibo',
          valor: valueNum,
          extension: selectedOfficeFile.name
        });
        const storagePath = `office_receipts/${formattedName}`;
        const uploadResult = await uploadBase64ToFirebase(selectedOfficeFile.base64, storagePath, selectedOfficeFile.type);

        if (uploadResult.error) {
          // Espelha o tratamento do fluxo de IA: informa o usuário e não marca o comprovante como anexado com sucesso.
          console.error("Erro no upload do comprovante manual:", uploadResult.error);
          alert(`Não foi possível anexar o comprovante com segurança: ${uploadResult.error}`);
        } else if (uploadResult.url) {
          finalReceiptUrl = uploadResult.url;
          finalReceiptName = selectedOfficeFile.name;
        }
      }

      if (editingTx) {
        // Edit
        const updatedTx: OfficeTransaction = {
          ...editingTx,
          description: txForm.description,
          type: txForm.type,
          category: txForm.category,
          value: valueNum,
          date: txForm.date,
          status: txForm.status,
          notes: txForm.notes,
          payerName: txForm.payerName || undefined,
          receiverName: txForm.receiverName || undefined,
          documentNumber: txForm.documentNumber || undefined,
          receiptUrl: finalReceiptUrl || undefined,
          receiptName: finalReceiptName || undefined,
          receiptFileId: finalReceiptFileId || undefined
        };
        await saveDoc('office_transactions', editingTx.id, updatedTx);
      } else {
        // Create
        const txId = `otx-${Date.now()}`;
        const newTx: OfficeTransaction = {
          id: txId,
          description: txForm.description,
          type: txForm.type,
          category: txForm.category,
          value: valueNum,
          date: txForm.date,
          status: txForm.status,
          notes: txForm.notes,
          payerName: txForm.payerName || undefined,
          receiverName: txForm.receiverName || undefined,
          documentNumber: txForm.documentNumber || undefined,
          receiptUrl: finalReceiptUrl || undefined,
          receiptName: finalReceiptName || undefined,
          receiptFileId: finalReceiptFileId || undefined
        };
        await saveDoc('office_transactions', txId, newTx);
      }
      setSelectedOfficeFile(null);
      setIsTxModalOpen(false);
    } catch (err: any) {
      console.error("Erro ao salvar transação:", err);
      alert("Falha ao salvar transação no banco de dados: " + (err.message || err));
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleDeleteTx = (id: string) => {
    setTxToDelete(id);
  };

  const confirmDeleteTx = async () => {
    if (txToDelete) {
      try {
        await removeDoc('office_transactions', txToDelete);
        setTxToDelete(null);
      } catch (err: any) {
        console.error("Erro ao excluir transação:", err);
        alert("Falha ao excluir transação: " + (err.message || err));
      }
    }
  };

  const handleOpenAddLead = () => {
    setEditingLead(null);
    setLeadForm({
      name: '',
      contactPerson: '',
      email: '',
      phone: '',
      status: 'prospeccao',
      estimatedValue: '',
      description: '',
      notes: ''
    });
    setIsLeadModalOpen(true);
  };

  const handleOpenEditLead = (lead: OfficeLead) => {
    setEditingLead(lead);
    setLeadForm({
      name: lead.name,
      contactPerson: lead.contactPerson,
      email: lead.email,
      phone: lead.phone,
      status: lead.status,
      estimatedValue: lead.estimatedValue.toString(),
      description: lead.description,
      notes: lead.notes || ''
    });
    setIsLeadModalOpen(true);
  };

  const handleSaveLead = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!leadForm.name || !leadForm.contactPerson) {
      alert('Preencha pelo menos o Nome do Cliente e a Pessoa de Contato.');
      return;
    }

    const valueNum = leadForm.estimatedValue ? parseFloat(leadForm.estimatedValue) : 0;

    try {
      if (editingLead) {
        const updatedLead: OfficeLead = {
          ...editingLead,
          name: leadForm.name,
          contactPerson: leadForm.contactPerson,
          email: leadForm.email,
          phone: leadForm.phone,
          status: leadForm.status,
          estimatedValue: valueNum,
          description: leadForm.description,
          notes: leadForm.notes
        };
        await saveDoc('office_leads', editingLead.id, updatedLead);
      } else {
        const leadId = `olead-${Date.now()}`;
        const newLead: OfficeLead = {
          id: leadId,
          name: leadForm.name,
          contactPerson: leadForm.contactPerson,
          email: leadForm.email,
          phone: leadForm.phone,
          status: leadForm.status,
          estimatedValue: valueNum,
          description: leadForm.description,
          notes: leadForm.notes,
          createdAt: new Date().toISOString().split('T')[0]
        };
        await saveDoc('office_leads', leadId, newLead);
      }
      setIsLeadModalOpen(false);
    } catch (err: any) {
      console.error("Erro ao salvar lead:", err);
      alert("Falha ao salvar lead: " + (err.message || err));
    }
  };

  const handleDeleteLead = (id: string) => {
    setLeadToDelete(id);
  };

  const confirmDeleteLead = async () => {
    if (leadToDelete) {
      try {
        await removeDoc('office_leads', leadToDelete);
        setLeadToDelete(null);
      } catch (err: any) {
        console.error("Erro ao excluir lead:", err);
        alert("Falha ao excluir lead: " + (err.message || err));
      }
    }
  };

  const handleDragStageChange = async (leadId: string, newStage: any) => {
    try {
      await saveDoc('office_leads', leadId, { status: newStage });
    } catch (err: any) {
      console.error("Erro ao atualizar estágio do lead:", err);
    }
  };

  // --- LEAD TO CLIENT SYSTEM CONVERSION ---
  const handleStartConversion = (lead: OfficeLead) => {
    const defaultUsername = lead.contactPerson.toLowerCase().replace(/\s+/g, '.');
    setConversionLead(lead);
    setConversionForm({
      username: defaultUsername,
      password: 'cbc' + Math.floor(1000 + Math.random() * 9000),
      error: null,
      success: null
    });
  };

  const handleConfirmConversion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!conversionLead) return;

    if (!conversionForm.username.trim() || !conversionForm.password.trim()) {
      setConversionForm(prev => ({ ...prev, error: 'Usuário e senha são obrigatórios.' }));
      return;
    }

    try {
      const activeClientId = `client-${Date.now()}`;
      
      const newActiveClient: Client = {
        id: activeClientId,
        name: conversionLead.name,
        email: conversionLead.email || `${conversionForm.username}@escritorio.com.br`,
        phone: conversionLead.phone || '(11) 99999-9999',
        username: conversionForm.username.trim(),
        createdAt: new Date().toISOString().split('T')[0]
      };

      // Call store's addClient prop
      await onAddClient(newActiveClient, conversionForm.password.trim());

      // Update lead in Firestore
      const updatedNotes = `${conversionLead.notes || ''}\n[CONVERTIDO EM CLIENTE ATIVO DO SISTEMA EM ${new Date().toLocaleDateString('pt-BR')}]`;
      await saveDoc('office_leads', conversionLead.id, {
        status: 'fechado',
        convertedClientId: activeClientId,
        notes: updatedNotes
      });

      setConversionForm(prev => ({
        ...prev,
        success: `Conversão realizada com sucesso! Cliente "${conversionLead.name}" agora está ativo. Credenciais de acesso enviadas para o sistema.`,
        error: null
      }));

      // Close modal after a short timeout
      setTimeout(() => {
        setConversionLead(null);
      }, 3500);

    } catch (err: any) {
      setConversionForm(prev => ({ ...prev, error: err.message || 'Erro ao converter lead em cliente ativo.' }));
    }
  };

  return (
    <div className="space-y-8 animate-fadeIn">
      
      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-stone-200 pb-5">
        <div>
          <span className="bg-stone-900 text-white font-mono text-[9px] px-2 py-0.5 tracking-wider uppercase inline-block mb-1.5 font-bold">
            Área de Trabalho Exclusiva
          </span>
          <h2 className="font-serif text-xl md:text-2xl text-stone-900 tracking-tight font-semibold">
            Gestão Interna do Escritório
          </h2>
          <p className="text-xs text-stone-500 mt-0.5">
            Módulo independente para controle financeiro da empresa e pipeline de prospecção comercial (CRM).
          </p>
        </div>

        {/* Workspace Switcher Sub-tabs */}
        <div className="flex items-center gap-1.5 bg-stone-100 p-1 border border-stone-200">
          <button
            type="button"
            onClick={() => setActiveSubTab('financeiro')}
            className={`px-3 py-1.5 text-xs font-mono font-bold uppercase transition-all cursor-pointer ${
              activeSubTab === 'financeiro' 
                ? 'bg-white text-stone-900 border border-stone-200 shadow-sm' 
                : 'text-stone-500 hover:text-stone-900'
            }`}
          >
            <div className="flex items-center gap-1.5">
              <DollarSign size={13} />
              <span>Finanças Escritório</span>
            </div>
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab('crm')}
            className={`px-3 py-1.5 text-xs font-mono font-bold uppercase transition-all cursor-pointer ${
              activeSubTab === 'crm' 
                ? 'bg-white text-stone-900 border border-stone-200 shadow-sm' 
                : 'text-stone-500 hover:text-stone-900'
            }`}
          >
            <div className="flex items-center gap-1.5">
              <Users size={13} />
              <span>Clientes & Negócios</span>
            </div>
          </button>
        </div>
      </div>

      {/* ============================================================== */}
      {/* FINANCIAL WORKSPACE PANEL */}
      {/* ============================================================== */}
      {activeSubTab === 'financeiro' && (
        <div className="space-y-8">
          
          {/* STATISTICS GRID */}
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
            
            <div className="bg-white border-2 border-emerald-100 p-4 space-y-1 shadow-sm">
              <div className="flex items-center justify-between text-stone-400">
                <span className="text-[9px] font-mono uppercase font-bold tracking-wider">Entradas Confirmadas</span>
                <TrendingUp size={15} className="text-emerald-500" />
              </div>
              <p className="text-lg font-serif font-semibold text-emerald-700">
                {financialMetrics.realEntradas.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </p>
              <div className="text-[8.5px] font-mono text-stone-400">
                Cobranças e honorários recebidos
              </div>
            </div>

            <div className="bg-white border-2 border-red-100 p-4 space-y-1 shadow-sm">
              <div className="flex items-center justify-between text-stone-400">
                <span className="text-[9px] font-mono uppercase font-bold tracking-wider">Saídas Confirmadas</span>
                <TrendingDown size={15} className="text-red-500" />
              </div>
              <p className="text-lg font-serif font-semibold text-red-700">
                {financialMetrics.realSaidas.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </p>
              <div className="text-[8.5px] font-mono text-stone-400">
                Aluguel, softwares, salários pagos
              </div>
            </div>

            <div className={`bg-white p-4 space-y-1 border-2 shadow-sm ${financialMetrics.realBalance >= 0 ? 'border-stone-900' : 'border-rose-300'}`}>
              <div className="flex items-center justify-between text-stone-400">
                <span className="text-[9px] font-mono uppercase font-bold tracking-wider">Saldo Real Caixa</span>
                <Layers size={13} className={financialMetrics.realBalance >= 0 ? 'text-stone-900' : 'text-rose-500'} />
              </div>
              <p className={`text-lg font-serif font-semibold ${financialMetrics.realBalance >= 0 ? 'text-stone-950' : 'text-rose-700'}`}>
                {financialMetrics.realBalance.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </p>
              <div className="text-[8.5px] font-mono text-stone-400">
                Entradas efetivas menos saídas
              </div>
            </div>

            <div className="bg-stone-50 border border-stone-200 p-4 space-y-1">
              <div className="flex items-center justify-between text-stone-400">
                <span className="text-[9px] font-mono uppercase font-bold tracking-wider">A Receber (Previsto)</span>
                <Clock size={13} className="text-blue-500" />
              </div>
              <p className="text-lg font-serif font-semibold text-blue-800">
                {financialMetrics.pendEntries.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </p>
              <div className="text-[8.5px] font-mono text-stone-400">
                Faturas emitidas pendentes
              </div>
            </div>

            <div className="bg-stone-50 border border-stone-200 p-4 space-y-1">
              <div className="flex items-center justify-between text-stone-400">
                <span className="text-[9px] font-mono uppercase font-bold tracking-wider">A Pagar (Previsto)</span>
                <Clock size={13} className="text-amber-500" />
              </div>
              <p className="text-lg font-serif font-semibold text-amber-800">
                {financialMetrics.pendExits.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </p>
              <div className="text-[8.5px] font-mono text-stone-400">
                Provisões de despesas agendadas
              </div>
            </div>

            <div className="bg-stone-900 p-4 space-y-1 text-white">
              <div className="flex items-center justify-between text-stone-400">
                <span className="text-[9px] font-mono uppercase font-bold tracking-wider">Saldo Projetado</span>
                <ArrowUpRight size={14} className="text-emerald-400" />
              </div>
              <p className="text-lg font-serif font-semibold text-emerald-400">
                {financialMetrics.estimatedBalance.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </p>
              <div className="text-[8.5px] font-mono text-stone-500">
                Considerando provisões deste mês
              </div>
            </div>

          </div>

          {/* FILTERS AND SEARCH */}
          <div className="bg-white border border-stone-200 p-5 space-y-4 shadow-sm">
            
            <div className="flex flex-col lg:flex-row items-center justify-between gap-4">
              
              <div className="relative w-full lg:max-w-xs">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400" size={14} />
                <input
                  type="text"
                  placeholder="Buscar movimentação..."
                  value={txSearch}
                  onChange={(e) => setTxSearch(e.target.value)}
                  className="w-full bg-[#FBFBFA] border border-stone-300 hover:border-stone-400 focus:border-stone-900 py-2 pl-9 pr-4 text-xs focus:outline-none placeholder-stone-400 font-mono transition-colors"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
                
                {/* Type filter */}
                <div className="flex items-center gap-1">
                  <span className="text-[9px] font-mono uppercase text-stone-400 font-bold mr-1">Tipo:</span>
                  <select
                    value={txTypeFilter}
                    onChange={(e) => setTxTypeFilter(e.target.value as any)}
                    className="bg-white border border-stone-200 px-2 py-1.5 text-xs font-mono"
                  >
                    <option value="all">Todas</option>
                    <option value="entrada">Entradas (+)</option>
                    <option value="saida">Saídas (-)</option>
                  </select>
                </div>

                {/* Status filter */}
                <div className="flex items-center gap-1">
                  <span className="text-[9px] font-mono uppercase text-stone-400 font-bold mr-1">Status:</span>
                  <select
                    value={txStatusFilter}
                    onChange={(e) => setTxStatusFilter(e.target.value as any)}
                    className="bg-white border border-stone-200 px-2 py-1.5 text-xs font-mono"
                  >
                    <option value="all">Todos</option>
                    <option value="confirmado">Efetivados</option>
                    <option value="pendente">Provisões/Pendentes</option>
                  </select>
                </div>

                {/* Category filter */}
                <div className="flex items-center gap-1">
                  <span className="text-[9px] font-mono uppercase text-stone-400 font-bold mr-1">Categoria:</span>
                  <select
                    value={txCategoryFilter}
                    onChange={(e) => setTxCategoryFilter(e.target.value)}
                    className="bg-white border border-stone-200 px-2 py-1.5 text-xs font-mono max-w-[180px]"
                  >
                    <option value="all">Todas</option>
                    <optgroup label="Entradas">
                      {Object.entries(ENTRY_CATEGORIES).map(([key, val]) => (
                        <option key={key} value={key}>{val.label}</option>
                      ))}
                    </optgroup>
                    <optgroup label="Saídas">
                      {Object.entries(EXIT_CATEGORIES).map(([key, val]) => (
                        <option key={key} value={key}>{val.label}</option>
                      ))}
                    </optgroup>
                  </select>
                </div>

                <button
                  onClick={handleOpenAddTx}
                  className="ml-auto lg:ml-2 bg-[#1E1E1E] text-white px-3.5 py-2 text-[10px] font-mono uppercase tracking-widest hover:bg-stone-800 transition-all cursor-pointer border border-stone-900 flex items-center gap-1.5"
                >
                  <Plus size={13} />
                  <span>Nova Operação</span>
                </button>

              </div>
            </div>
          </div>

          {/* TRANSACTIONS TABLE */}
          <div className="bg-white border border-stone-200 shadow-sm overflow-hidden">
            <div className="border-b border-stone-100 px-6 py-4 flex items-center justify-between">
              <h3 className="font-serif text-xs uppercase tracking-wider font-bold text-stone-800">
                Registros de Movimentação do Caixa do Escritório
              </h3>
              <span className="font-mono text-[9px] text-stone-400">
                Exibindo {filteredTransactions.length} registros
              </span>
            </div>

            {filteredTransactions.length === 0 ? (
              <div className="p-12 text-center text-stone-400 text-xs italic">
                Nenhum lançamento localizado com os filtros selecionados.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-stone-50 text-stone-500 font-mono text-[9px] uppercase border-b border-stone-200">
                      <th className="p-4 font-bold">Data</th>
                      <th className="p-4 font-bold">Descrição</th>
                      <th className="p-4 font-bold">Categoria</th>
                      <th className="p-4 font-bold">Status</th>
                      <th className="p-4 font-bold text-right">Valor</th>
                      <th className="p-4 font-bold text-center">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {filteredTransactions.map((tx) => {
                      const isEntry = tx.type === 'entrada';
                      const categoryInfo = isEntry 
                        ? ENTRY_CATEGORIES[tx.category as keyof typeof ENTRY_CATEGORIES]
                        : EXIT_CATEGORIES[tx.category as keyof typeof EXIT_CATEGORIES];
                      
                      return (
                        <tr key={tx.id} className="hover:bg-stone-50/50 transition-colors">
                          <td className="p-4 font-mono text-[10.5px] text-stone-500 whitespace-nowrap">
                            {new Date(tx.date).toLocaleDateString('pt-BR')}
                          </td>
                          <td className="p-4">
                            <span className="font-sans font-bold text-stone-900 block">
                              {tx.description}
                            </span>
                            {tx.notes && (
                              <span className="text-[10px] text-stone-400 block mt-0.5 max-w-sm truncate italic">
                                {tx.notes}
                              </span>
                            )}
                            {(tx.payerName || tx.receiverName) && (
                              <span className="text-[9.5px] text-stone-500 block mt-0.5 max-w-sm truncate font-mono">
                                {tx.payerName ? `Pagou: ${tx.payerName}` : ''}
                                {tx.payerName && tx.receiverName ? ' • ' : ''}
                                {tx.receiverName ? `Recebeu: ${tx.receiverName}` : ''}
                              </span>
                            )}
                            {tx.documentNumber && (
                              <span className="text-[9px] text-stone-400 block max-w-sm truncate font-mono" title={tx.documentNumber}>
                                Comprovante nº {tx.documentNumber}
                              </span>
                            )}
                            {tx.receiptUrl && (
                              <a
                                href={tx.receiptUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 text-[9.5px] font-mono text-emerald-700 hover:text-emerald-900 bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded-none mt-1 hover:underline tracking-tight"
                                title="Ver comprovante no Google Drive"
                              >
                                <FileText size={10} />
                                <span>Ver Comprovante Drive</span>
                              </a>
                            )}
                          </td>
                          <td className="p-4 whitespace-nowrap">
                            <span className={`inline-block px-2 py-0.5 border text-[9px] font-mono font-bold uppercase rounded-none ${
                              categoryInfo?.bg || 'bg-stone-50 text-stone-600 border-stone-200'
                            }`}>
                              {categoryInfo?.label || 'Outros'}
                            </span>
                          </td>
                          <td className="p-4 whitespace-nowrap">
                            <span className={`inline-flex items-center gap-1 font-mono text-[9px] uppercase font-bold ${
                              tx.status === 'confirmado' ? 'text-emerald-700' : 'text-amber-700'
                            }`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${tx.status === 'confirmado' ? 'bg-emerald-600' : 'bg-amber-500 animate-pulse'}`}></span>
                              {tx.status === 'confirmado' ? 'Efetivado' : 'Provisório'}
                            </span>
                          </td>
                          <td className="p-4 text-right whitespace-nowrap">
                            <span className={`font-serif font-bold ${isEntry ? 'text-emerald-700' : 'text-stone-900'}`}>
                              {isEntry ? '+' : '-'} {tx.value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                            </span>
                          </td>
                          <td className="p-4 text-center whitespace-nowrap">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                onClick={() => handleOpenEditTx(tx)}
                                className="p-1 border border-stone-200 text-stone-600 hover:bg-stone-100 transition-colors cursor-pointer"
                                title="Editar Lançamento"
                              >
                                <Edit size={11} />
                              </button>
                              <button
                                onClick={() => handleDeleteTx(tx.id)}
                                className="p-1 border border-stone-200 text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                                title="Deletar Lançamento"
                              >
                                <Trash2 size={11} />
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
        </div>
      )}

      {/* ============================================================== */}
      {/* CRM CLIENTS AND NEGOTIATIONS WORKSPACE */}
      {/* ============================================================== */}
      {activeSubTab === 'crm' && (
        <div className="space-y-8">
          
          {/* CRM FUNNEL METRICS BANNER */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white border border-stone-200 p-5 space-y-1 shadow-sm">
              <span className="text-[9px] font-mono uppercase text-stone-400 font-bold tracking-wider">Leads Comercial Ativos</span>
              <p className="text-xl font-serif font-bold text-stone-900">
                {officeLeads.filter(l => l.status !== 'fechado' && l.status !== 'perdido').length} em andamento
              </p>
              <div className="text-[8.5px] font-mono text-stone-400">Total de oportunidades abertas</div>
            </div>

            <div className="bg-white border border-stone-200 p-5 space-y-1 shadow-sm">
              <span className="text-[9px] font-mono uppercase text-stone-400 font-bold tracking-wider">Volume do Pipeline</span>
              <p className="text-xl font-serif font-bold text-indigo-700">
                {crmMetrics.totalPipeline.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </p>
              <div className="text-[8.5px] font-mono text-stone-400">Potencial financeiro em negociação</div>
            </div>

            <div className="bg-white border border-emerald-100 p-5 space-y-1 shadow-sm">
              <span className="text-[9px] font-mono uppercase text-emerald-500 font-bold tracking-wider">Contratos Fechados (CBC)</span>
              <p className="text-xl font-serif font-bold text-emerald-700">
                {crmMetrics.closedWonValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </p>
              <div className="text-[8.5px] font-mono text-emerald-500">Valor total de propostas ganhas</div>
            </div>

            <div className="bg-stone-900 p-5 space-y-1 text-white">
              <span className="text-[9px] font-mono uppercase text-stone-400 font-bold tracking-wider">Taxa de Conversão</span>
              <p className="text-xl font-serif font-bold text-amber-400">
                {officeLeads.length > 0 
                  ? `${Math.round((officeLeads.filter(l => l.status === 'fechado').length / officeLeads.length) * 100)}%` 
                  : '0%'}
              </p>
              <div className="text-[8.5px] font-mono text-stone-400">Fechados vs Total histórico</div>
            </div>
          </div>

          {/* CRM BOARD FILTERS */}
          <div className="bg-white border border-stone-200 p-5 flex flex-col lg:flex-row items-center justify-between gap-4 shadow-sm">
            <div className="relative w-full lg:max-w-xs">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400" size={14} />
              <input
                type="text"
                placeholder="Buscar cliente ou proposta..."
                value={crmSearch}
                onChange={(e) => setCrmSearch(e.target.value)}
                className="w-full bg-[#FBFBFA] border border-stone-300 hover:border-stone-400 focus:border-stone-900 py-2 pl-9 pr-4 text-xs focus:outline-none placeholder-stone-400 font-mono transition-colors"
              />
            </div>

            <div className="flex items-center gap-3 w-full lg:w-auto">
              <div className="flex items-center gap-1">
                <span className="text-[9px] font-mono uppercase text-stone-400 font-bold">Estágio:</span>
                <select
                  value={crmStageFilter}
                  onChange={(e) => setCrmStageFilter(e.target.value)}
                  className="bg-white border border-stone-200 px-2.5 py-1.5 text-xs font-mono"
                >
                  <option value="all">Todos</option>
                  {CRM_STAGES.map(stage => (
                    <option key={stage.id} value={stage.id}>{stage.label}</option>
                  ))}
                </select>
              </div>

              <button
                onClick={handleOpenAddLead}
                className="ml-auto bg-[#1E1E1E] text-white px-3.5 py-2 text-[10px] font-mono uppercase tracking-widest hover:bg-stone-800 transition-all cursor-pointer border border-stone-900 flex items-center gap-1.5"
              >
                <Plus size={13} />
                <span>Nova Oportunidade</span>
              </button>
            </div>
          </div>

          {/* CRM FUNNEL COLUMNS */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4 overflow-x-auto pb-4">
            {CRM_STAGES.map((stage) => {
              const leadsInStage = filteredLeads.filter(l => l.status === stage.id);
              const stageSumValue = leadsInStage.reduce((sum, l) => sum + l.estimatedValue, 0);

              return (
                <div 
                  key={stage.id} 
                  className="bg-stone-50 border border-stone-200 p-3 flex flex-col min-h-[500px] w-full min-w-[190px] space-y-3"
                >
                  {/* Column Header */}
                  <div className={`border-t-4 ${stage.color.split(' ')[0]} pt-2 pb-1.5 px-1 border-b border-stone-200/60`}>
                    <div className="flex justify-between items-center">
                      <span className="font-serif font-bold text-stone-950 text-xs">
                        {stage.label}
                      </span>
                      <span className="font-mono text-[9px] font-bold text-stone-400">
                        ({leadsInStage.length})
                      </span>
                    </div>
                    {stageSumValue > 0 && (
                      <span className="block text-[9.5px] font-mono font-bold text-stone-600 mt-1">
                        {stageSumValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })}
                      </span>
                    )}
                  </div>

                  {/* Leads Cards */}
                  <div className="flex-grow space-y-2.5 overflow-y-auto max-h-[600px] pr-0.5">
                    {leadsInStage.length === 0 ? (
                      <div className="text-center py-10 text-[10px] font-mono text-stone-400 italic border border-dashed border-stone-200 bg-white/20">
                        Nenhum lead
                      </div>
                    ) : (
                      leadsInStage.map((lead) => (
                        <div 
                          key={lead.id} 
                          className="bg-white border border-stone-200 p-3 space-y-2 hover:shadow-md hover:border-stone-400 transition-all relative group"
                        >
                          <div className="space-y-1">
                            <h4 className="font-sans font-bold text-stone-900 text-xs leading-normal">
                              {lead.name}
                            </h4>
                            <p className="text-[10px] font-mono text-stone-400 block">
                              {lead.contactPerson}
                            </p>
                          </div>

                          <p className="text-[10px] text-stone-500 font-sans leading-normal line-clamp-3">
                            {lead.description || "Sem detalhes da negociação."}
                          </p>

                          <div className="text-[10.5px] font-serif font-semibold text-stone-950">
                            {lead.estimatedValue > 0 
                              ? lead.estimatedValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }) 
                              : "Sob Medida"}
                          </div>

                          <div className="space-y-1 pt-1.5 border-t border-stone-100 text-[9px] text-stone-400">
                            {lead.phone && <div className="flex items-center gap-1"><Phone size={10} /> {lead.phone}</div>}
                            {lead.email && <div className="flex items-center gap-1 truncate"><Mail size={10} /> {lead.email}</div>}
                          </div>

                          {/* Quick stage move & actions */}
                          <div className="flex items-center justify-between pt-1 border-t border-stone-100 opacity-90 lg:opacity-0 group-hover:opacity-100 transition-opacity gap-1">
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => handleOpenEditLead(lead)}
                                className="p-1 border border-stone-100 hover:bg-stone-50 text-stone-600"
                                title="Editar Lead"
                              >
                                <Edit size={10} />
                              </button>
                              <button
                                onClick={() => handleDeleteLead(lead.id)}
                                className="p-1 border border-stone-100 hover:bg-rose-50 text-red-600"
                                title="Excluir"
                              >
                                <Trash2 size={10} />
                              </button>
                            </div>

                            {/* Direct system conversion */}
                            {lead.status === 'fechado' && !lead.convertedClientId && (
                              <button
                                onClick={() => handleStartConversion(lead)}
                                className="bg-emerald-600 text-white hover:bg-emerald-700 px-2 py-0.5 text-[8px] font-mono uppercase tracking-wider font-bold flex items-center gap-1 cursor-pointer"
                                title="Cadastrar como Cliente Ativo do Escritório"
                              >
                                <UserPlus size={10} />
                                <span>Ativar Cliente</span>
                              </button>
                            )}

                            {lead.convertedClientId && (
                              <span className="text-[8px] font-mono text-emerald-600 font-bold uppercase flex items-center gap-0.5">
                                <Check size={10} /> Ativado
                              </span>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>

        </div>
      )}

      {/* ============================================================== */}
      {/* CONFIRM DELETE TX MODAL */}
      {/* ============================================================== */}
      {txToDelete && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-[60] animate-fadeIn print:hidden">
          <div className="bg-white border-2 border-stone-900 w-full max-w-sm p-6 relative shadow-2xl space-y-4">
            <div className="border-b border-stone-200 pb-2">
              <h3 className="font-serif text-sm font-bold text-stone-950 uppercase tracking-wider">
                Confirmar Exclusão
              </h3>
              <p className="text-[10px] text-stone-500">Esta ação é permanente e não poderá ser desfeita.</p>
            </div>
            
            <p className="text-xs text-stone-700 leading-relaxed font-sans">
              Deseja realmente excluir esta movimentação financeira do escritório?
            </p>

            <div className="flex justify-end gap-2 text-xs font-mono uppercase">
              <button
                type="button"
                onClick={() => setTxToDelete(null)}
                className="border border-stone-300 hover:bg-stone-50 text-stone-700 px-4 py-2 cursor-pointer transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmDeleteTx}
                className="bg-red-600 text-white hover:bg-red-700 px-4 py-2 cursor-pointer transition-colors"
              >
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* CONFIRM DELETE LEAD MODAL */}
      {/* ============================================================== */}
      {leadToDelete && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-[60] animate-fadeIn print:hidden">
          <div className="bg-white border-2 border-stone-900 w-full max-w-sm p-6 relative shadow-2xl space-y-4">
            <div className="border-b border-stone-200 pb-2">
              <h3 className="font-serif text-sm font-bold text-stone-950 uppercase tracking-wider">
                Confirmar Exclusão
              </h3>
              <p className="text-[10px] text-stone-500">Esta ação é permanente e não poderá ser desfeita.</p>
            </div>
            
            <p className="text-xs text-stone-700 leading-relaxed font-sans">
              Deseja realmente excluir este cliente em negociação?
            </p>

            <div className="flex justify-end gap-2 text-xs font-mono uppercase">
              <button
                type="button"
                onClick={() => setLeadToDelete(null)}
                className="border border-stone-300 hover:bg-stone-50 text-stone-700 px-4 py-2 cursor-pointer transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmDeleteLead}
                className="bg-red-600 text-white hover:bg-red-700 px-4 py-2 cursor-pointer transition-colors"
              >
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* FINANCIAL ADD/EDIT MODAL */}
      {/* ============================================================== */}
      {isTxModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn print:hidden">
          <div className="bg-white border-2 border-stone-900 w-full max-w-md p-6 relative shadow-2xl space-y-4">
            <button
              onClick={() => setIsTxModalOpen(false)}
              className="absolute right-4 top-4 text-stone-400 hover:text-stone-900 cursor-pointer"
            >
              <X size={18} />
            </button>

            <div className="border-b border-stone-200 pb-2">
              <h3 className="font-serif text-sm font-bold text-stone-950 uppercase tracking-wider">
                {editingTx ? 'Editar Movimentação Financeira' : 'Nova Operação de Caixa do Escritório'}
              </h3>
              <p className="text-[10px] text-stone-500">Mantenha a contabilidade interna do escritório alinhada.</p>
            </div>

            <form onSubmit={handleSaveTx} className="space-y-4 text-xs font-sans">
              
              {/* IMPORTAÇÃO INTELIGENTE DE COMPROVANTES (IA) */}
              <div className="bg-stone-50 border border-stone-200 p-4 space-y-4 rounded-none">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono uppercase text-stone-700 font-bold flex items-center gap-1">
                    <Sparkles size={12} className="text-stone-950 animate-pulse text-amber-500" />
                    <span>Anexar Nota Fiscal / Recibo</span>
                  </span>
                </div>

                {!selectedOfficeFile && !txForm.receiptUrl ? (
                  <>
                    <p className="text-[10px] text-stone-500 leading-relaxed">
                      Selecione um arquivo de Nota Fiscal, recibo ou cupom (PDF ou Imagem) para anexar ao lançamento financeiro do escritório.
                    </p>

                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <button
                        type="button"
                        disabled={isAnalyzing}
                        onClick={() => document.getElementById('receipt_upload_file')?.click()}
                        className="flex flex-col items-center justify-center gap-1.5 border-2 border-dashed border-stone-300 hover:border-stone-500 bg-white hover:bg-[#FAF9F6] py-4 px-3 text-[10px] font-mono uppercase font-bold tracking-wider text-stone-800 transition-all cursor-pointer group"
                      >
                        <Upload size={14} className="text-stone-500 group-hover:text-stone-800" />
                        <span>Arquivo Local</span>
                      </button>

                      <button
                        type="button"
                        disabled={isAnalyzing}
                        onClick={() => {
                          if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
                            startCamera();
                          } else {
                            cameraFileInputRef.current?.click();
                          }
                        }}
                        className="flex flex-col items-center justify-center gap-1.5 border-2 border-dashed border-stone-300 hover:border-stone-500 bg-white hover:bg-[#FAF9F6] py-4 px-3 text-[10px] font-mono uppercase font-bold tracking-wider text-stone-800 transition-all cursor-pointer group"
                      >
                        <Camera size={14} className="text-stone-500 group-hover:text-stone-800" />
                        <span>Tirar Foto</span>
                      </button>
                    </div>

                    <input
                      type="file"
                      accept="application/pdf,image/png,image/jpeg,image/jpg"
                      id="receipt_upload_file"
                      className="hidden"
                      onChange={handleAnalyzeAndUploadReceipt}
                      disabled={isAnalyzing}
                    />

                    <input
                      type="file"
                      ref={cameraFileInputRef}
                      onChange={handleCameraFileChange}
                      className="hidden"
                      accept="image/*"
                      capture="environment"
                    />
                  </>
                ) : selectedOfficeFile ? (
                  // File loaded, but not processed
                  <div className="space-y-3">
                    <div className="bg-emerald-50/50 border border-emerald-200 p-2.5 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[8px] font-mono uppercase text-emerald-800 font-bold bg-emerald-100 px-1.5 py-0.5">
                          Documento Carregado
                        </span>
                        <button
                          type="button"
                          onClick={() => setSelectedOfficeFile(null)}
                          className="text-stone-500 hover:text-red-600 flex items-center gap-1 font-mono text-[8px] uppercase font-bold transition-all"
                        >
                          <X size={10} />
                          <span>Descartar</span>
                        </button>
                      </div>
                      
                      <div className="flex items-center gap-1.5 text-stone-800 text-[11px] py-0.5">
                        <Paperclip size={12} className="text-emerald-700 flex-shrink-0 animate-bounce" />
                        <span className="font-mono truncate font-semibold" title={selectedOfficeFile.name}>
                          {selectedOfficeFile.name}
                        </span>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <span className="block text-[8px] font-mono uppercase text-stone-400 font-bold tracking-wider">
                        Como deseja preencher esta despesa?
                      </span>

                      {/* AI Analyser Button */}
                      <button
                        type="button"
                        disabled={isAnalyzing}
                        onClick={() => analyzeAndUploadReceiptBase64(selectedOfficeFile.base64, selectedOfficeFile.type, selectedOfficeFile.name)}
                        className="w-full text-left p-2.5 border border-stone-250 hover:border-stone-900 bg-stone-50/50 hover:bg-[#FCFBF9] transition-all flex items-start gap-2.5 group cursor-pointer"
                      >
                        <div className="bg-stone-900 text-white p-1.5 group-hover:scale-105 transition-transform flex-shrink-0">
                          <Sparkles size={14} className="text-amber-300 animate-pulse" />
                        </div>
                        <div className="space-y-0.5 flex-1 min-w-0">
                          <span className="block text-[11px] font-bold text-stone-900 uppercase font-mono tracking-wide">
                            Analisar com IA (Recomendado)
                          </span>
                          <span className="block text-[9.5px] text-stone-500 leading-normal">
                            Os campos serão preenchidos automaticamente: pela IA Gemini (quando configurada no servidor) ou pelo motor interno de OCR, que funciona sem IA externa.
                          </span>
                        </div>
                      </button>

                      {/* Manual Button */}
                      <button
                        type="button"
                        onClick={() => {
                          alert("Comprovante anexado! Por favor, digite os dados da despesa abaixo e clique em Salvar.");
                        }}
                        className="w-full text-left p-2.5 border border-stone-250 hover:border-stone-900 bg-stone-50/50 hover:bg-[#FCFBF9] transition-all flex items-start gap-2.5 group cursor-pointer"
                      >
                        <div className="bg-stone-100 text-stone-800 border border-stone-300 p-1.5 group-hover:scale-105 transition-transform flex-shrink-0">
                          <FileText size={14} className="text-stone-700" />
                        </div>
                        <div className="space-y-0.5 flex-1 min-w-0">
                          <span className="block text-[11px] font-bold text-stone-900 uppercase font-mono tracking-wide">
                            Preencher Manualmente
                          </span>
                          <span className="block text-[9.5px] text-stone-500 leading-normal">
                            O arquivo ficará anexado. Digite os dados diretamente no formulário abaixo.
                          </span>
                        </div>
                      </button>
                    </div>
                  </div>
                ) : (
                  // Already uploaded / exists (e.g. edit mode or after IA analysis)
                  <div className="bg-emerald-50 border border-emerald-200 p-2.5 flex items-center justify-between">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <CheckCircle2 size={12} className="text-emerald-600 flex-shrink-0" />
                      <span className="text-[10px] text-emerald-800 font-mono truncate" title={txForm.receiptName}>
                        {txForm.receiptName || 'comprovante.pdf'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                      {txForm.receiptUrl && (
                        <a
                          href={txForm.receiptUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[10px] font-mono text-emerald-700 hover:text-emerald-900 underline"
                        >
                          Ver
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setTxForm(prev => ({
                            ...prev,
                            receiptUrl: '',
                            receiptName: '',
                            receiptFileId: ''
                          }));
                          setSelectedOfficeFile(null);
                        }}
                        className="text-[10px] font-mono text-red-650 hover:text-red-800 font-bold"
                      >
                        Excluir
                      </button>
                    </div>
                  </div>
                )}

                {/* Progress or status */}
                {isAnalyzing && (
                  <div className="text-[9.5px] font-mono text-amber-700 flex items-center gap-1.5 animate-pulse">
                    <Clock size={12} />
                    <span>Processando comprovante e extraindo dados...</span>
                  </div>
                )}
              </div>

              <div className="space-y-1">
                <label className="block text-[9.5px] font-mono uppercase text-stone-500 font-bold">Descrição da Operação *</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Aluguel da Sede, Cobrança Projeto Arq. Residencial..."
                  value={txForm.description}
                  onChange={(e) => setTxForm(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full bg-[#FBFBFA] border border-stone-300 focus:border-stone-900 p-2 text-xs focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-[9.5px] font-mono uppercase text-stone-500 font-bold">Tipo *</label>
                  <select
                    value={txForm.type}
                    onChange={(e) => {
                      const type = e.target.value as 'entrada' | 'saida';
                      setTxForm(prev => ({ 
                        ...prev, 
                        type,
                        category: type === 'entrada' ? 'servico_projeto' : 'aluguel_escritorio'
                      }));
                    }}
                    className="w-full bg-[#FBFBFA] border border-stone-300 p-2 text-xs focus:outline-none"
                  >
                    <option value="entrada">Entrada (+ Receita)</option>
                    <option value="saida">Saída (- Despesa)</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="block text-[9.5px] font-mono uppercase text-stone-500 font-bold">Categoria *</label>
                  <select
                    value={txForm.category}
                    onChange={(e) => setTxForm(prev => ({ ...prev, category: e.target.value }))}
                    className="w-full bg-[#FBFBFA] border border-stone-300 p-2 text-xs focus:outline-none"
                  >
                    {txForm.type === 'entrada' ? (
                      Object.entries(ENTRY_CATEGORIES).map(([key, val]) => (
                        <option key={key} value={key}>{val.label}</option>
                      ))
                    ) : (
                      Object.entries(EXIT_CATEGORIES).map(([key, val]) => (
                        <option key={key} value={key}>{val.label}</option>
                      ))
                    )}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-[9.5px] font-mono uppercase text-stone-500 font-bold">Valor (R$) *</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    min="0.01"
                    placeholder="0.00"
                    value={txForm.value}
                    onChange={(e) => setTxForm(prev => ({ ...prev, value: e.target.value }))}
                    className="w-full bg-[#FBFBFA] border border-stone-300 focus:border-stone-900 p-2 text-xs focus:outline-none font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-[9.5px] font-mono uppercase text-stone-500 font-bold">Data da Operação *</label>
                  <input
                    type="date"
                    required
                    value={txForm.date}
                    onChange={(e) => setTxForm(prev => ({ ...prev, date: e.target.value }))}
                    className="w-full bg-[#FBFBFA] border border-stone-300 focus:border-stone-900 p-2 text-xs focus:outline-none font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-[9.5px] font-mono uppercase text-stone-500 font-bold">Quem Pagou</label>
                  <input
                    type="text"
                    placeholder="Ex: CBC Arquitetura LTDA..."
                    value={txForm.payerName}
                    onChange={(e) => setTxForm(prev => ({ ...prev, payerName: e.target.value }))}
                    className="w-full bg-[#FBFBFA] border border-stone-300 focus:border-stone-900 p-2 text-xs focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-[9.5px] font-mono uppercase text-stone-500 font-bold">Quem Recebeu</label>
                  <input
                    type="text"
                    placeholder="Ex: Fornecedor, prestador..."
                    value={txForm.receiverName}
                    onChange={(e) => setTxForm(prev => ({ ...prev, receiverName: e.target.value }))}
                    className="w-full bg-[#FBFBFA] border border-stone-300 focus:border-stone-900 p-2 text-xs focus:outline-none"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="block text-[9.5px] font-mono uppercase text-stone-500 font-bold">Nº do Comprovante</label>
                <input
                  type="text"
                  placeholder="ID da transação, E2E, autenticação, protocolo..."
                  value={txForm.documentNumber}
                  onChange={(e) => setTxForm(prev => ({ ...prev, documentNumber: e.target.value }))}
                  className="w-full bg-[#FBFBFA] border border-stone-300 focus:border-stone-900 p-2 text-xs focus:outline-none font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-[9.5px] font-mono uppercase text-stone-500 font-bold">Status *</label>
                <select
                  value={txForm.status}
                  onChange={(e) => setTxForm(prev => ({ ...prev, status: e.target.value as any }))}
                  className="w-full bg-[#FBFBFA] border border-stone-300 p-2 text-xs focus:outline-none"
                >
                  <option value="confirmado">Efetivado (Dinheiro em Caixa / Pago)</option>
                  <option value="pendente">Provisório (Futuro / Pendente de Liberação)</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="block text-[9.5px] font-mono uppercase text-stone-500 font-bold">Anotações Internas</label>
                <textarea
                  rows={2}
                  placeholder="Adicione observações para prestação de contas..."
                  value={txForm.notes}
                  onChange={(e) => setTxForm(prev => ({ ...prev, notes: e.target.value }))}
                  className="w-full bg-[#FBFBFA] border border-stone-300 focus:border-stone-900 p-2 text-xs focus:outline-none font-sans"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-stone-100">
                <button
                  type="button"
                  onClick={() => setIsTxModalOpen(false)}
                  className="bg-white border border-stone-300 hover:bg-stone-50 px-4 py-2 font-mono uppercase text-[10px] tracking-wider cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="bg-[#1E1E1E] text-white border border-stone-900 hover:bg-stone-800 px-4 py-2 font-mono uppercase text-[10px] tracking-wider cursor-pointer"
                >
                  Salvar Operação
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* CRM ADD/EDIT LEAD MODAL */}
      {/* ============================================================== */}
      {isLeadModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn print:hidden">
          <div className="bg-white border-2 border-stone-900 w-full max-w-lg p-6 relative shadow-2xl space-y-4">
            <button
              onClick={() => setIsLeadModalOpen(false)}
              className="absolute right-4 top-4 text-stone-400 hover:text-stone-900 cursor-pointer"
            >
              <X size={18} />
            </button>

            <div className="border-b border-stone-200 pb-2">
              <h3 className="font-serif text-sm font-bold text-stone-950 uppercase tracking-wider">
                {editingLead ? 'Editar Oportunidade (Lead)' : 'Nova Oportunidade Comercial'}
              </h3>
              <p className="text-[10px] text-stone-500">Registre novas negociações para a carteira do escritório Chaves Brites Correa.</p>
            </div>

            <form onSubmit={handleSaveLead} className="space-y-4 text-xs font-sans">
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-[9.5px] font-mono uppercase text-stone-500 font-bold">Cliente / Empreendimento *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Reforma Apartamento Itaim..."
                    value={leadForm.name}
                    onChange={(e) => setLeadForm(prev => ({ ...prev, name: e.target.value }))}
                    className="w-full bg-[#FBFBFA] border border-stone-300 focus:border-stone-900 p-2 text-xs focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-[9.5px] font-mono uppercase text-stone-500 font-bold">Pessoa de Contato Principal *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Carlos Albuquerque..."
                    value={leadForm.contactPerson}
                    onChange={(e) => setLeadForm(prev => ({ ...prev, contactPerson: e.target.value }))}
                    className="w-full bg-[#FBFBFA] border border-stone-300 focus:border-stone-900 p-2 text-xs focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-[9.5px] font-mono uppercase text-stone-500 font-bold">E-mail</label>
                  <input
                    type="email"
                    placeholder="Ex: carlos@email.com"
                    value={leadForm.email}
                    onChange={(e) => setLeadForm(prev => ({ ...prev, email: e.target.value }))}
                    className="w-full bg-[#FBFBFA] border border-stone-300 focus:border-stone-900 p-2 text-xs focus:outline-none font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-[9.5px] font-mono uppercase text-stone-500 font-bold">Telefone / WhatsApp</label>
                  <input
                    type="text"
                    placeholder="Ex: (11) 99999-9999"
                    value={leadForm.phone}
                    onChange={(e) => setLeadForm(prev => ({ ...prev, phone: e.target.value }))}
                    className="w-full bg-[#FBFBFA] border border-stone-300 focus:border-stone-900 p-2 text-xs focus:outline-none font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-[9.5px] font-mono uppercase text-stone-500 font-bold">Estágio de Vendas *</label>
                  <select
                    value={leadForm.status}
                    onChange={(e) => setLeadForm(prev => ({ ...prev, status: e.target.value as any }))}
                    className="w-full bg-[#FBFBFA] border border-stone-300 p-2 text-xs focus:outline-none"
                  >
                    {CRM_STAGES.map(stage => (
                      <option key={stage.id} value={stage.id}>{stage.label}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="block text-[9.5px] font-mono uppercase text-stone-500 font-bold">Valor Estimado do Contrato (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={leadForm.estimatedValue}
                    onChange={(e) => setLeadForm(prev => ({ ...prev, estimatedValue: e.target.value }))}
                    className="w-full bg-[#FBFBFA] border border-stone-300 focus:border-stone-900 p-2 text-xs focus:outline-none font-mono"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="block text-[9.5px] font-mono uppercase text-stone-500 font-bold">Escopo do Serviço / Necessidades</label>
                <textarea
                  rows={2}
                  placeholder="Breve descrição do projeto, área aproximada, exigências especiais..."
                  value={leadForm.description}
                  onChange={(e) => setLeadForm(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full bg-[#FBFBFA] border border-stone-300 focus:border-stone-900 p-2 text-xs focus:outline-none font-sans"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-[9.5px] font-mono uppercase text-stone-500 font-bold">Histórico de Interações / Observações</label>
                <textarea
                  rows={2}
                  placeholder="Últimos telefonemas, feedback da proposta..."
                  value={leadForm.notes}
                  onChange={(e) => setLeadForm(prev => ({ ...prev, notes: e.target.value }))}
                  className="w-full bg-[#FBFBFA] border border-stone-300 focus:border-stone-900 p-2 text-xs focus:outline-none font-sans"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-stone-100">
                <button
                  type="button"
                  onClick={() => setIsLeadModalOpen(false)}
                  className="bg-white border border-stone-300 hover:bg-stone-50 px-4 py-2 font-mono uppercase text-[10px] tracking-wider cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="bg-[#1E1E1E] text-white border border-stone-900 hover:bg-stone-800 px-4 py-2 font-mono uppercase text-[10px] tracking-wider cursor-pointer"
                >
                  Salvar Oportunidade
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* DIRECT SYSTEM CONVERSION MODAL */}
      {/* ============================================================== */}
      {conversionLead && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn print:hidden">
          <div className="bg-white border-2 border-emerald-900 w-full max-w-md p-6 relative shadow-2xl space-y-4">
            <button
              onClick={() => setConversionLead(null)}
              className="absolute right-4 top-4 text-stone-400 hover:text-stone-900 cursor-pointer"
            >
              <X size={18} />
            </button>

            <div className="border-b border-stone-200 pb-2 flex items-center gap-2">
              <UserCheck size={18} className="text-emerald-700" />
              <div>
                <h3 className="font-serif text-sm font-bold text-emerald-950 uppercase tracking-wider">
                  Ativar Cliente no Sistema
                </h3>
                <p className="text-[10px] text-stone-500">Crie uma conta e um perfil ativo para login do cliente.</p>
              </div>
            </div>

            {conversionForm.success ? (
              <div className="bg-emerald-50 border border-emerald-200 p-4 space-y-3">
                <p className="text-xs text-emerald-800 font-sans font-bold leading-normal">
                  ✓ {conversionForm.success}
                </p>
                <div className="bg-white border border-emerald-100 p-2.5 font-mono text-[10.5px] text-stone-700 space-y-1">
                  <div><strong>Painel de Acesso:</strong> www.escritoriocbc.com/login</div>
                  <div><strong>Usuário Gerado:</strong> <span className="bg-stone-100 px-1 py-0.2">{conversionForm.username}</span></div>
                  <div><strong>Senha de Acesso:</strong> <span className="bg-stone-100 px-1 py-0.2">{conversionForm.password}</span></div>
                </div>
                <p className="text-[9.5px] text-stone-400 italic">
                  Compartilhe estas credenciais de segurança com o cliente para que ele possa acompanhar os gastos, orçamentos e relatórios em tempo real.
                </p>
              </div>
            ) : (
              <form onSubmit={handleConfirmConversion} className="space-y-4 text-xs font-sans">
                
                <div className="bg-emerald-50/40 p-3.5 border border-emerald-100 space-y-2">
                  <div className="text-[11px] text-emerald-900 font-bold font-sans">
                    Conversão Comercial Ganha:
                  </div>
                  <div className="font-sans text-stone-700 space-y-1">
                    <div><strong>Nome do Cliente:</strong> {conversionLead.name}</div>
                    <div><strong>Contato Responsável:</strong> {conversionLead.contactPerson}</div>
                    <div><strong>E-mail:</strong> {conversionLead.email || 'Não cadastrado'}</div>
                    <div><strong>Telefone:</strong> {conversionLead.phone || 'Não cadastrado'}</div>
                    <div><strong>Valor Estimado:</strong> {conversionLead.estimatedValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div>
                  </div>
                </div>

                {conversionForm.error && (
                  <div className="bg-red-50 border border-red-200 p-2.5 text-[11px] text-red-800 font-bold">
                    ⚠️ {conversionForm.error}
                  </div>
                )}

                <div className="space-y-3.5">
                  <h4 className="font-mono text-[9px] font-bold text-stone-400 uppercase tracking-widest">
                    Configuração de Credenciais
                  </h4>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="block text-[9px] font-mono uppercase text-stone-500 font-bold">Usuário (Username) *</label>
                      <input
                        type="text"
                        required
                        value={conversionForm.username}
                        onChange={(e) => setConversionForm(prev => ({ ...prev, username: e.target.value }))}
                        className="w-full bg-[#FBFBFA] border border-stone-300 p-2 text-xs focus:outline-none font-mono"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="block text-[9px] font-mono uppercase text-stone-500 font-bold">Senha de Entrada *</label>
                      <input
                        type="text"
                        required
                        value={conversionForm.password}
                        onChange={(e) => setConversionForm(prev => ({ ...prev, password: e.target.value }))}
                        className="w-full bg-[#FBFBFA] border border-stone-300 p-2 text-xs focus:outline-none font-mono"
                      />
                    </div>
                  </div>
                </div>

                <div className="pt-2 flex items-center justify-end gap-2 border-t border-stone-100">
                  <button
                    type="button"
                    onClick={() => setConversionLead(null)}
                    className="bg-white border border-stone-300 hover:bg-stone-50 px-4 py-2 font-mono uppercase text-[10px] tracking-wider cursor-pointer"
                  >
                    Voltar
                  </button>
                  <button
                    type="submit"
                    className="bg-emerald-700 text-white border border-emerald-900 hover:bg-emerald-800 px-4 py-2 font-mono uppercase text-[10px] tracking-wider cursor-pointer flex items-center gap-1"
                  >
                    <CheckCircle2 size={13} />
                    <span>Confirmar Ativação</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Interactive Camera Modal Overlay */}
      {isCameraActive && (
        <div className="fixed inset-0 z-50 bg-black/95 backdrop-blur-sm flex flex-col items-center justify-center p-4">
          <div className="relative w-full max-w-md bg-stone-900 border border-stone-800 p-6 space-y-4 flex flex-col items-center animate-none">
            {/* Header */}
            <div className="w-full flex items-center justify-between border-b border-stone-800 pb-3">
              <div className="flex items-center gap-2">
                <Camera className="text-stone-400 animate-pulse" size={16} />
                <span className="font-mono text-xs text-stone-300 uppercase tracking-wider font-bold text-left">Captura de Comprovante</span>
              </div>
              <button
                type="button"
                onClick={stopCamera}
                className="text-stone-400 hover:text-white transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Video Stream / Error Container */}
            <div className="relative w-full aspect-[3/4] bg-stone-950 border border-stone-800 flex items-center justify-center overflow-hidden">
              {cameraError ? (
                <div className="p-4 text-center space-y-3">
                  <AlertCircle size={32} className="text-red-500 mx-auto animate-bounce" />
                  <p className="text-xs text-stone-300 leading-relaxed font-sans">{cameraError}</p>
                  <button
                    type="button"
                    onClick={() => {
                      stopCamera();
                      cameraFileInputRef.current?.click();
                    }}
                    className="bg-stone-800 text-white hover:bg-stone-700 py-1.5 px-4 text-[10px] font-mono uppercase tracking-wider font-bold cursor-pointer transition-colors"
                  >
                    Usar Câmera Nativa do Celular
                  </button>
                </div>
              ) : (
                <>
                  {/* Guide rectangle overlay */}
                  <div className="absolute inset-4 border-2 border-dashed border-white/20 pointer-events-none flex items-center justify-center z-10">
                    <span className="text-[9px] font-mono uppercase text-white/40 tracking-widest text-center max-w-[180px]">
                      Alinhe o comprovante aqui
                    </span>
                  </div>
                  
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover"
                  />
                </>
              )}
            </div>

            {/* Actions */}
            {!cameraError && (
              <div className="w-full flex justify-between items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={stopCamera}
                  className="text-xs font-mono uppercase text-stone-400 hover:text-stone-200 py-2 cursor-pointer"
                >
                  Cancelar
                </button>
                
                <button
                  type="button"
                  onClick={capturePhoto}
                  className="flex-1 bg-stone-100 hover:bg-white text-stone-900 py-2.5 px-4 text-xs font-mono uppercase tracking-widest font-bold flex items-center justify-center gap-2 cursor-pointer transition-colors"
                >
                  <Camera size={14} />
                  <span>Tirar Foto</span>
                </button>
              </div>
            )}

            {/* Hidden Canvas for capture rendering */}
            <canvas ref={canvasRef} className="hidden" />
          </div>
        </div>
      )}

    </div>
  );
}
