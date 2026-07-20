import React, { useState, useEffect, useRef } from 'react';
import { 
  TrendingUp, 
  Plus, 
  Trash2, 
  FileText, 
  Loader2, 
  Paperclip, 
  ExternalLink,
  Sparkles,
  Upload, 
  CheckCircle2, 
  AlertCircle,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Camera,
  X,
  Edit2
} from 'lucide-react';
import { Transaction, TransactionCategory, Project } from '../types';
import { uploadBase64ToFirebase } from '../lib/firebaseStorage';
import { getTelegramConfig, buildTelegramFileName } from '../lib/telegramService';

interface AcompanhamentoFinanceiroProps {
  projectId: string;
  project: Project | undefined;
  transactions: Transaction[];
  addTransaction: (tx: Transaction) => Promise<void>;
  editTransaction?: (tx: Transaction) => Promise<void>;
  deleteTransaction: (id: string) => void;
}

export default function AcompanhamentoFinanceiro({
  projectId,
  project,
  transactions,
  addTransaction,
  editTransaction,
  deleteTransaction,
}: AcompanhamentoFinanceiroProps) {
  // File Name Pattern from Telegram Configuration
  const [fileNamePattern, setFileNamePattern] = useState('{centro} - {data} - {fornecedor} - {descricao} - {valor}');

  useEffect(() => {
    const fetchTelegramConfig = async () => {
      try {
        const data = await getTelegramConfig();
        if (data.fileNamePattern) {
          setFileNamePattern(data.fileNamePattern);
        }
      } catch (error) {
        console.error('Erro ao carregar padrão de nome de arquivo do Telegram:', error);
      }
    };
    fetchTelegramConfig();
  }, []);

  // Panel state
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Form states
  const [isManualFormOpen, setIsManualFormOpen] = useState(false);
  const [manualFile, setManualFile] = useState<{ name: string; type: string; base64: string } | null>(null);
  const [isSavingManual, setIsSavingManual] = useState(false);
  const [manualForm, setManualForm] = useState({
    supplier: '',
    description: '',
    value: '',
    category: 'materiais' as TransactionCategory,
    date: new Date().toISOString().split('T')[0],
    notes: '',
    invoiceNumber: '',
  });
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);

  // Helper utility to compress images using HTML5 canvas
  const compressImage = (base64: string, mimeType: string): Promise<string> => {
    return new Promise((resolve) => {
      if (!mimeType || !mimeType.startsWith('image/')) {
        resolve(base64);
        return;
      }
      const img = new Image();
      img.src = base64;
      img.onload = () => {
        const maxW = 1200;
        const maxH = 1200;
        let w = img.width;
        let h = img.height;
        if (w > maxW || h > maxH) {
          if (w > h) {
            h = Math.round((h * maxW) / w);
            w = maxW;
          } else {
            w = Math.round((w * maxH) / h);
            h = maxH;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(base64);
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.65));
      };
      img.onerror = () => resolve(base64);
    });
  };

  // AI Invoice states
  const [selectedFile, setSelectedFile] = useState<{ name: string; type: string; base64: string } | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  
  // Scanned / Preview invoice data
  const [scannedData, setScannedData] = useState<{
    supplier: string;
    date: string;
    value: number;
    category: TransactionCategory;
    description: string;
    notes: string;
    invoiceNumber: string;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraFileInputRef = useRef<HTMLInputElement>(null);

  // Camera states
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // AI Bulk states & tabs
  const [activeTab, setActiveTab] = useState<'single' | 'bulk'>('single');
  const [bulkFile, setBulkFile] = useState<{ name: string; type: string; base64: string } | null>(null);
  const [isBulkParsing, setIsBulkParsing] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkWarnings, setBulkWarnings] = useState<string[]>([]);
  const [bulkEngine, setBulkEngine] = useState<string | null>(null);
  const [bulkTransactions, setBulkTransactions] = useState<{
    supplier: string;
    description: string;
    value: number;
    category: TransactionCategory;
    date: string;
    notes?: string;
    invoiceNumber?: string;
    selected?: boolean;
  }[] | null>(null);

  const bulkFileInputRef = useRef<HTMLInputElement>(null);

  const handleBulkFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    processBulkFile(file);
  };

  const processBulkFile = (file: File) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const base64String = reader.result as string;
      setBulkFile({
        name: file.name,
        type: file.type,
        base64: base64String,
      });
      triggerBulkParse(base64String, file.type, file.name);
    };
    reader.onerror = (error) => {
      console.error('Erro na leitura do arquivo em lote:', error);
      setBulkError('Erro ao carregar o arquivo localmente.');
    };
  };

  const triggerBulkParse = async (base64: string, mimeType: string, name: string) => {
    setIsBulkParsing(true);
    setBulkError(null);
    setBulkTransactions(null);

    try {
      const cleanBase64 = base64.includes(';base64,') ? base64.split(';base64,')[1] : base64;
      
      const res = await fetch('/api/acompanhamento/parse-bulk-transactions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fileBase64: cleanBase64,
          mimeType,
          fileName: name,
        }),
      });

      if (!res.ok) {
        let serverMessage = 'Falha no servidor ao analisar a planilha/PDF de gastos.';
        try {
          const errJson = await res.json();
          if (errJson?.error) serverMessage = errJson.error;
        } catch {}
        throw new Error(serverMessage);
      }

      const responseData = await res.json();
      if (responseData.success && responseData.transactions) {
        setBulkTransactions(
          responseData.transactions.map((t: any) => ({
            supplier: t.supplier || 'Diverso/Não Identificado',
            description: t.description || 'Gasto importado',
            value: parseFloat(t.value) || 0,
            category: (['materiais', 'mao_de_obra', 'projetos_complementares', 'taxas', 'decoracao', 'outros'].includes(t.category)
              ? t.category
              : 'outros') as TransactionCategory,
            date: t.date || new Date().toISOString().split('T')[0],
            notes: t.notes || '',
            invoiceNumber: t.invoiceNumber || '',
            selected: true,
          }))
        );
        setBulkWarnings(Array.isArray(responseData.warnings) ? responseData.warnings : []);
        setBulkEngine(responseData.engine || null);
      } else {
        throw new Error(responseData.error || 'Nenhum lançamento foi encontrado ou extraído.');
      }
    } catch (err: any) {
      console.error('Erro ao analisar lote de gastos:', err);
      setBulkError(err.message || 'Erro ao processar o arquivo de gastos.');
    } finally {
      setIsBulkParsing(false);
    }
  };

  const handleSaveBulkTransactions = async () => {
    if (!bulkTransactions) return;

    const selectedTxs = bulkTransactions.filter(t => t.selected);
    if (selectedTxs.length === 0) {
      alert('Nenhum lançamento selecionado para importação.');
      return;
    }

    // Descarta linhas com valor inválido (não finito ou menor/igual a zero)
    const validTxs = selectedTxs.filter(t => Number.isFinite(t.value) && t.value > 0);
    const invalidCount = selectedTxs.length - validTxs.length;
    if (validTxs.length === 0) {
      alert('Nenhum lançamento com valor válido (maior que R$ 0,00) para importar.');
      return;
    }
    if (invalidCount > 0) {
      alert(`${invalidCount} lançamento(s) com valor inválido (≤ R$ 0,00) serão ignorados.`);
    }

    const newTxs: Transaction[] = validTxs.map((t, index) => ({
      id: `tx-${Date.now()}-${index}`,
      projectId,
      supplier: t.supplier,
      description: t.description,
      value: t.value,
      category: t.category,
      date: t.date,
      status: 'pago',
      notes: t.notes ? t.notes.trim() : undefined,
      invoiceNumber: t.invoiceNumber ? t.invoiceNumber.trim() : undefined,
    }));

    try {
      // Aguarda todas as gravações antes de limpar o estado e sinalizar sucesso
      await Promise.all(newTxs.map(tx => addTransaction(tx)));
    } catch (err) {
      console.error('Erro ao importar lançamentos em lote:', err);
      alert('Ocorreu um erro ao importar os lançamentos. Nenhuma alteração foi confirmada. Tente novamente.');
      return;
    }

    setBulkFile(null);
    setBulkTransactions(null);
    setBulkError(null);
    setBulkWarnings([]);
    setBulkEngine(null);
    if (bulkFileInputRef.current) {
      bulkFileInputRef.current.value = '';
    }
    alert(`${newTxs.length} lançamentos financeiros importados com sucesso!`);
  };

  const handleCancelBulk = () => {
    setBulkFile(null);
    setBulkTransactions(null);
    setBulkError(null);
    setBulkWarnings([]);
    setBulkEngine(null);
    if (bulkFileInputRef.current) {
      bulkFileInputRef.current.value = '';
    }
  };

  // Camera control and cleanup
  const startCamera = async () => {
    setIsCameraActive(true);
    setCameraError(null);
    setCameraStream(null);

    // Give state some time to render the video element if needed
    setTimeout(async () => {
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          throw new Error('Acesso à câmera não é suportado pelo seu navegador atual. Use o botão de câmera nativa do celular abaixo.');
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
        });

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
      // Set canvas dimensions matching the video stream
      const width = video.videoWidth || 640;
      const height = video.videoHeight || 480;
      canvas.width = width;
      canvas.height = height;
      
      // Draw frame
      context.drawImage(video, 0, 0, width, height);
      
      // Extract as base64 jpeg
      const base64String = canvas.toDataURL('image/jpeg', 0.85);
      
      setSelectedFile({
        name: `foto_comprovante_${Date.now()}.jpg`,
        type: 'image/jpeg',
        base64: base64String,
      });

      // Stop camera stream
      stopCamera();
    }
  };

  const handleCameraFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    processSelectedFile(file);
  };

  useEffect(() => {
    return () => {
      if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [cameraStream]);



  // Helper formats
  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(val);
  };

  const getCategoryBadgeColor = (cat: TransactionCategory) => {
    switch (cat) {
      case 'materiais':
        return 'bg-amber-50 text-amber-800 border-amber-200';
      case 'mao_de_obra':
        return 'bg-emerald-50 text-emerald-800 border-emerald-200';
      case 'projetos_complementares':
        return 'bg-blue-50 text-blue-800 border-blue-200';
      case 'taxas':
        return 'bg-purple-50 text-purple-800 border-purple-200';
      case 'decoracao':
        return 'bg-rose-50 text-rose-800 border-rose-200';
      default:
        return 'bg-stone-100 text-stone-700 border-stone-200';
    }
  };

  const getCategoryLabel = (cat: TransactionCategory) => {
    switch (cat) {
      case 'materiais': return 'Materiais';
      case 'mao_de_obra': return 'Mão de Obra';
      case 'projetos_complementares': return 'Projetos Compl.';
      case 'taxas': return 'Taxas/Impostos';
      case 'decoracao': return 'Decoração';
      default: return 'Outros';
    }
  };

  // Filter project transactions
  const projectTransactions = transactions
    .filter(t => t.projectId === projectId)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const totalSpent = projectTransactions.reduce((acc, t) => acc + t.value, 0);

  // File Upload Handlers (for AI reading & storage)
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    processSelectedFile(file);
  };

  const processSelectedFile = (file: File) => {
    if (file.size > 5 * 1024 * 1024) {
      setAiError('O tamanho do arquivo excede o limite de 5MB por documento.');
      return;
    }
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = async () => {
      let base64String = reader.result as string;
      if (file.type.startsWith('image/')) {
        base64String = await compressImage(base64String, file.type);
      }
      setSelectedFile({
        name: file.name,
        type: file.type,
        base64: base64String,
      });
    };
    reader.onerror = (error) => {
      console.error('Erro na leitura do arquivo:', error);
      setAiError('Erro ao carregar o arquivo localmente.');
    };
  };

  const triggerAiScan = async (base64: string, mimeType: string, name: string) => {
    setIsParsing(true);
    setAiError(null);
    setScannedData(null);

    try {
      const cleanBase64 = base64.includes(';base64,') ? base64.split(';base64,')[1] : base64;
      
      const res = await fetch('/api/acompanhamento/parse-invoice', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fileBase64: cleanBase64,
          mimeType,
          fileName: name,
        }),
      });

      if (!res.ok) {
        let serverMessage = 'Falha no servidor ao analisar a nota fiscal.';
        try {
          const errJson = await res.json();
          if (errJson?.error) serverMessage = errJson.error;
        } catch {}
        throw new Error(serverMessage);
      }

      const responseData = await res.json();
      if (responseData.success && responseData.invoice) {
        const { supplier, date, value, category, description, notes, invoiceNumber } = responseData.invoice;
        setScannedData({
          supplier: supplier || '',
          date: date || new Date().toISOString().split('T')[0],
          value: value || 0,
          category: (category === 'mao_de_obra' || category === 'materiais' ? category : 'outros') as TransactionCategory,
          description: description || '',
          notes: notes || '',
          invoiceNumber: invoiceNumber || '',
        });
      } else {
        throw new Error(responseData.error || 'Não foi possível extrair os dados da nota.');
      }
    } catch (err: any) {
      console.error('Erro no escaneamento com IA:', err);
      setAiError(err.message || 'Houve um problema ao processar o arquivo com Inteligência Artificial.');
      // Pre-populate empty data to allow manual entry with original attachment
      setScannedData({
        supplier: '',
        date: new Date().toISOString().split('T')[0],
        value: 0,
        category: 'materiais',
        description: '',
        notes: '',
        invoiceNumber: '',
      });
    } finally {
      setIsParsing(false);
    }
  };

  // Submit Gasto (Manual ou Edição)
  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualForm.supplier.trim() || !manualForm.value) return;

    // Valida valor: precisa ser um número finito e maior que zero
    const v = parseFloat(manualForm.value);
    if (!Number.isFinite(v) || v <= 0) {
      alert('Por favor, informe um valor maior que R$ 0,00.');
      return;
    }

    setIsSavingManual(true);

    try {
      let firebaseStorageUrl = '';
      let formattedFilename = '';
      let receiptName = editingTransaction ? editingTransaction.receiptName : undefined;
      let receiptBase64 = editingTransaction ? editingTransaction.receiptBase64 : undefined;
      let receiptUrl = editingTransaction ? editingTransaction.receiptUrl : undefined;

      if (manualFile) {
        // Format filename based on configured pattern using the shared utility function
        formattedFilename = buildTelegramFileName(fileNamePattern, {
          centro: project?.name || 'Cliente',
          data: manualForm.date,
          fornecedor: manualForm.supplier,
          descricao: manualForm.description || 'Lançamento Manual',
          valor: v,
          extension: manualFile.name
        });

        try {
          const uploadResult = await uploadBase64ToFirebase(
            manualFile.base64,
            `nfs/${projectId}/${formattedFilename}`,
            manualFile.type
          );
          firebaseStorageUrl = uploadResult.url;
          // Guarda o nome legível do arquivo; a URL fica apenas em receiptUrl
          receiptName = formattedFilename;
          receiptBase64 = (firebaseStorageUrl && firebaseStorageUrl.startsWith('http') && !firebaseStorageUrl.startsWith('blob:')) ? undefined : (manualFile.base64.length < 400000 ? manualFile.base64 : undefined);
          receiptUrl = firebaseStorageUrl || undefined;
          if (uploadResult.error) {
            console.warn('Firebase Storage upload notice/fallback:', uploadResult.error);
          }
        } catch (err) {
          console.error('Erro ao fazer upload da NF para o Firebase Storage:', err);
        }
      }

      if (editingTransaction) {
        const updatedTx: Transaction = {
          ...editingTransaction,
          supplier: manualForm.supplier.trim(),
          description: manualForm.description.trim() || 'Lançamento Manual',
          value: v,
          category: manualForm.category,
          date: manualForm.date,
          notes: manualForm.notes.trim() || undefined,
          invoiceNumber: manualForm.invoiceNumber.trim() || undefined,
          receiptName,
          receiptBase64,
          receiptUrl
        };

        if (editTransaction) {
          await editTransaction(updatedTx);
        } else {
          await addTransaction(updatedTx);
        }
        setEditingTransaction(null);
      } else {
        const newTx: Transaction = {
          id: `tx-${Date.now()}`,
          projectId,
          supplier: manualForm.supplier.trim(),
          description: manualForm.description.trim() || 'Lançamento Manual',
          value: v,
          category: manualForm.category,
          date: manualForm.date,
          status: 'pago',
          notes: manualForm.notes.trim() || undefined,
          invoiceNumber: manualForm.invoiceNumber.trim() || undefined,
          ...(manualFile ? {
            receiptName,
            receiptBase64,
            receiptUrl
          } : {})
        };

        await addTransaction(newTx);
      }
      
      // Clear fields
      setManualForm({
        supplier: '',
        description: '',
        value: '',
        category: 'materiais',
        date: new Date().toISOString().split('T')[0],
        notes: '',
        invoiceNumber: '',
      });
      setManualFile(null);
      setIsManualFormOpen(false);
    } catch (err) {
      console.error('Erro ao salvar lançamento manual:', err);
      alert('Ocorreu um erro ao gravar o gasto.');
    } finally {
      setIsSavingManual(false);
    }
  };

  // Confirm Scanned Invoice & Save
  const handleSaveScannedInvoice = async () => {
    if (!scannedData || !selectedFile) return;

    if (!scannedData.supplier.trim()) {
      alert('Por favor, informe o Fornecedor.');
      return;
    }
    if (!Number.isFinite(scannedData.value) || scannedData.value <= 0) {
      alert('Por favor, informe um valor maior que R$ 0,00.');
      return;
    }

    // Format filename based on configured pattern using the shared utility function
    const formattedFilename = buildTelegramFileName(fileNamePattern, {
      centro: project?.name || 'Cliente',
      data: scannedData.date,
      fornecedor: scannedData.supplier,
      descricao: scannedData.description,
      valor: scannedData.value,
      extension: selectedFile.name
    });

    let firebaseStorageUrl = '';

    // Upload to Firebase Storage (Telegram backend channel)
    try {
      const uploadResult = await uploadBase64ToFirebase(
        selectedFile.base64,
        `nfs/${projectId}/${formattedFilename}`,
        selectedFile.type
      );
      firebaseStorageUrl = uploadResult.url;
      if (uploadResult.error) {
        console.warn('Firebase Storage upload notice/fallback:', uploadResult.error);
      }
    } catch (err) {
      console.error('Erro ao fazer upload da NF para o Firebase Storage:', err);
    }

    const newTx: Transaction = {
      id: `tx-${Date.now()}`,
      projectId,
      supplier: scannedData.supplier,
      description: scannedData.description || 'Lançamento automático via NF',
      value: scannedData.value,
      category: scannedData.category,
      date: scannedData.date,
      status: 'pago',
      notes: scannedData.notes || undefined,
      invoiceNumber: scannedData.invoiceNumber || undefined,
      // Guarda o nome legível do arquivo; a URL fica apenas em receiptUrl
      receiptName: formattedFilename,
      receiptBase64: (firebaseStorageUrl && firebaseStorageUrl.startsWith('http') && !firebaseStorageUrl.startsWith('blob:')) ? undefined : (selectedFile.base64.length < 400000 ? selectedFile.base64 : undefined),
      receiptUrl: firebaseStorageUrl || undefined,
    };

    try {
      await addTransaction(newTx);
      
      // Clear states
      setSelectedFile(null);
      setScannedData(null);
      setAiError(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (err: any) {
      console.error('Erro ao salvar lançamento escaneado:', err);
      alert('Ocorreu um erro ao gravar o gasto de nota fiscal: ' + (err.message || err));
    }
  };

  const handleCancelScanned = () => {
    setSelectedFile(null);
    setScannedData(null);
    setAiError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className={`bg-white border border-stone-200 p-6 transition-all duration-300 ${isCollapsed ? 'space-y-0 pb-4' : 'space-y-6'}`}>
      
      {/* Module Title */}
      <div className={`flex flex-col md:flex-row md:items-center md:justify-between gap-4 ${isCollapsed ? '' : 'border-b border-stone-100 pb-4'}`}>
        <div>
          <h3 className="font-serif text-base text-stone-950 font-bold flex flex-wrap items-center gap-2">
            <TrendingUp size={16} className="text-stone-700" />
            <span>Módulo Financeiro de Acompanhamento da Obra</span>
            {isCollapsed && (
              <span className="font-mono text-[11px] bg-stone-100 text-stone-800 px-2 py-0.5 font-bold border border-stone-200 uppercase tracking-wider">
                Total Pago: {formatCurrency(totalSpent)}
              </span>
            )}
          </h3>
          <p className="text-xs text-stone-500 mt-0.5">
            Lançamento e controle de despesas executadas (materiais, mão de obra e serviços gerais).
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!isCollapsed && (
            <button
              type="button"
              onClick={() => setIsManualFormOpen(!isManualFormOpen)}
              className="bg-stone-100 hover:bg-stone-200 text-stone-800 text-xs font-mono uppercase tracking-wider px-3 py-1.5 border border-stone-300 font-bold flex items-center gap-1 cursor-pointer transition-all"
            >
              <Plus size={13} />
              Lançar Manual
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
          {/* Manual Lançamento Form */}
      {isManualFormOpen && (
        <form onSubmit={handleManualSubmit} className="bg-stone-50 border border-stone-200 p-4 space-y-4">
          <div className="border-b border-stone-200 pb-2">
            <h4 className="font-mono text-xs uppercase tracking-wider text-stone-800 font-bold">
              {editingTransaction ? 'Editar Lançamento Financeiro' : 'Novo Lançamento Financeiro'}
            </h4>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <label className="block text-[8px] font-mono uppercase text-stone-400 font-bold">Fornecedor / Prestador</label>
              <input
                type="text"
                required
                className="w-full bg-white border border-stone-200 py-1.5 px-2.5 text-xs focus:outline-none"
                placeholder="Ex: Madeireira CBC, João Pedreiro"
                value={manualForm.supplier}
                onChange={e => setManualForm({ ...manualForm, supplier: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-[8px] font-mono uppercase text-stone-400 font-bold">Nº de NF / Comprovante</label>
              <input
                type="text"
                className="w-full bg-white border border-stone-200 py-1.5 px-2.5 text-xs focus:outline-none"
                placeholder="Ex: 12456, s/n"
                value={manualForm.invoiceNumber}
                onChange={e => setManualForm({ ...manualForm, invoiceNumber: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-[8px] font-mono uppercase text-stone-400 font-bold">Valor (R$)</label>
              <input
                type="number"
                step="0.01"
                required
                className="w-full bg-white border border-stone-200 py-1.5 px-2.5 text-xs focus:outline-none font-mono"
                placeholder="0.00"
                value={manualForm.value}
                onChange={e => setManualForm({ ...manualForm, value: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-[8px] font-mono uppercase text-stone-400 font-bold">Data do Pagamento</label>
              <input
                type="date"
                required
                className="w-full bg-white border border-stone-200 py-1.5 px-2.5 text-xs focus:outline-none"
                value={manualForm.date}
                onChange={e => setManualForm({ ...manualForm, date: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-[8px] font-mono uppercase text-stone-400 font-bold">Categoria</label>
              <select
                className="w-full bg-white border border-stone-200 py-1.5 px-2 text-xs focus:outline-none"
                value={manualForm.category}
                onChange={e => setManualForm({ ...manualForm, category: e.target.value as TransactionCategory })}
              >
                <option value="materiais">🧱 Materiais de Construção</option>
                <option value="mao_de_obra">👷 Mão de Obra / Serviços</option>
                <option value="projetos_complementares">📐 Projetos Complementares</option>
                <option value="taxas">📄 Taxas / Impostos / Aluguel</option>
                <option value="decoracao">🛋️ Decoração / Interiores</option>
                <option value="outros">📦 Outros Gastos</option>
              </select>
            </div>
            <div>
              <label className="block text-[8px] font-mono uppercase text-stone-400 font-bold">Descrição Curta</label>
              <input
                type="text"
                className="w-full bg-white border border-stone-200 py-1.5 px-2.5 text-xs focus:outline-none"
                placeholder="Ex: Compra de blocos cerâmicos, pagamento da 2ª medição"
                value={manualForm.description}
                onChange={e => setManualForm({ ...manualForm, description: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-[8px] font-mono uppercase text-stone-400 font-bold">Observações / Chave / Informações Bancárias</label>
              <textarea
                className="w-full bg-white border border-stone-200 py-1.5 px-2.5 text-xs focus:outline-none h-12 resize-none"
                placeholder="Número de nota fiscal, dados do Pix, etc."
                value={manualForm.notes}
                onChange={e => setManualForm({ ...manualForm, notes: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-[8px] font-mono uppercase text-stone-400 font-bold">Anexar Documento / Comprovante (Opcional)</label>
              <div className="flex flex-col gap-1">
                <div className="flex gap-2 items-center h-12">
                  {manualFile ? (
                    <div className="flex items-center justify-between border border-emerald-200 bg-emerald-50 text-emerald-800 text-xs py-1.5 px-2.5 w-full">
                      <span className="truncate font-mono text-[11px] max-w-[200px]" title={manualFile.name}>
                        📎 {manualFile.name} (Pronto/Otimizado)
                      </span>
                      <button
                        type="button"
                        onClick={() => setManualFile(null)}
                        className="text-stone-500 hover:text-red-650 transition-colors p-1"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ) : (
                    <label className="w-full h-full bg-white hover:bg-stone-50 border border-dashed border-stone-300 flex items-center justify-center gap-1.5 cursor-pointer text-stone-600 text-xs font-mono uppercase tracking-wider font-bold transition-all">
                      <Upload size={14} className="text-stone-400" />
                      <span>Selecionar Arquivo</span>
                      <input
                        type="file"
                        className="hidden"
                        accept="image/jpeg,image/png,image/webp,application/pdf"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          if (file.size > 5 * 1024 * 1024) {
                            alert('O tamanho do arquivo excede o limite de 5MB.');
                            return;
                          }
                          const reader = new FileReader();
                          reader.readAsDataURL(file);
                          reader.onload = async () => {
                            let base64String = reader.result as string;
                            if (file.type.startsWith('image/')) {
                              base64String = await compressImage(base64String, file.type);
                            }
                            setManualFile({
                              name: file.name,
                              type: file.type,
                              base64: base64String,
                            });
                          };
                        }}
                      />
                    </label>
                  )}
                </div>
                <span className="text-[9px] text-stone-400 font-sans italic leading-tight">
                  Imagens e PDFs são comprimidos automaticamente para caber no banco de dados e garantir rápida transmissão.
                </span>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-stone-250">
            <button
              type="button"
              disabled={isSavingManual}
              onClick={() => {
                setManualFile(null);
                setEditingTransaction(null);
                setManualForm({
                  supplier: '',
                  description: '',
                  value: '',
                  category: 'materiais',
                  date: new Date().toISOString().split('T')[0],
                  notes: '',
                  invoiceNumber: '',
                });
                setIsManualFormOpen(false);
              }}
              className="px-3 py-1.5 text-xs font-mono uppercase text-stone-500 hover:text-stone-800 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSavingManual}
              className="bg-stone-900 text-white hover:bg-stone-800 py-1.5 px-4 text-xs font-mono uppercase tracking-wider font-bold cursor-pointer disabled:opacity-55 disabled:cursor-not-allowed flex items-center gap-1.5"
            >
              {isSavingManual && <Loader2 className="animate-spin" size={13} />}
              <span>{isSavingManual ? 'Gravando...' : (editingTransaction ? 'Salvar Alterações' : 'Gravar Gasto')}</span>
            </button>
          </div>
        </form>
      )}

      {/* AI INVOICE SCANNING AREA */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left column: Drag and Drop Area */}
        <div className="lg:col-span-1 space-y-4">
          <div className="border border-stone-200 p-4 space-y-3">
            <div className="flex border-b border-stone-100 pb-1 mb-2">
              <button
                type="button"
                onClick={() => setActiveTab('single')}
                className={`flex-1 pb-1.5 text-center font-mono text-[9px] uppercase font-bold tracking-wider cursor-pointer border-b-2 transition-all ${activeTab === 'single' ? 'border-stone-900 text-stone-900' : 'border-transparent text-stone-400 hover:text-stone-600'}`}
              >
                NF Única
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('bulk')}
                className={`flex-1 pb-1.5 text-center font-mono text-[9px] uppercase font-bold tracking-wider cursor-pointer border-b-2 transition-all ${activeTab === 'bulk' ? 'border-stone-900 text-stone-900' : 'border-transparent text-stone-400 hover:text-stone-600'}`}
              >
                Lote (Excel/PDF)
              </button>
            </div>

            {activeTab === 'single' ? (
              <div className="space-y-4">
                <h4 className="font-serif text-xs text-stone-950 font-bold flex items-center gap-1.5">
                  <Paperclip size={14} className="text-stone-700" />
                  Anexar Nota Fiscal / Comprovante
                </h4>

                {!selectedFile ? (
                  <>
                    <p className="text-[11px] text-stone-500">
                      Selecione um arquivo de Nota Fiscal, recibo ou cupom (PDF ou Imagem) para anexar ao seu lançamento financeiro.
                    </p>

                    {/* Dual Upload Buttons */}
                    <div className="grid grid-cols-1 gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="flex items-center justify-center gap-2 border-2 border-dashed border-stone-300 hover:border-stone-500 bg-white hover:bg-[#FAF9F6] py-5 px-3 text-xs font-mono uppercase font-bold tracking-wider text-stone-800 transition-all cursor-pointer group"
                      >
                        <Upload size={16} className="text-stone-500 group-hover:text-stone-800" />
                        <span>Adicionar Arquivo Local</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
                            startCamera();
                          } else {
                            cameraFileInputRef.current?.click();
                          }
                        }}
                        className="flex items-center justify-center gap-2 border-2 border-dashed border-stone-300 hover:border-stone-500 bg-white hover:bg-[#FAF9F6] py-5 px-3 text-xs font-mono uppercase font-bold tracking-wider text-stone-800 transition-all cursor-pointer group"
                      >
                        <Camera size={16} className="text-stone-500 group-hover:text-stone-800" />
                        <span>Tirar Foto</span>
                      </button>
                    </div>

                    <input 
                      type="file" 
                      ref={fileInputRef} 
                      onChange={handleFileChange} 
                      className="hidden" 
                      accept="application/pdf,image/*,.xlsx,.xls,.doc,.docx" 
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
                ) : (
                  // File is loaded, now let the user choose the flow
                  <div className="space-y-4">
                    <div className="bg-emerald-50/50 border border-emerald-200 p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[9px] font-mono uppercase text-emerald-800 font-bold bg-emerald-100 px-1.5 py-0.5">
                          Documento Carregado
                        </span>
                        <button
                          type="button"
                          onClick={handleCancelScanned}
                          className="text-stone-500 hover:text-red-650 flex items-center gap-1 font-mono text-[9px] uppercase font-bold transition-all"
                        >
                          <X size={12} />
                          <span>Descartar</span>
                        </button>
                      </div>
                      
                      <div className="flex items-center gap-2 text-stone-800 text-xs py-1.5">
                        <Paperclip size={14} className="text-emerald-700 flex-shrink-0 animate-bounce" />
                        <span className="font-mono text-[11px] truncate font-semibold" title={selectedFile.name}>
                          {selectedFile.name}
                        </span>
                      </div>
                    </div>

                    <div className="space-y-2.5">
                      <span className="block text-[9px] font-mono uppercase text-stone-400 font-bold tracking-wider">
                        Como deseja preencher esta despesa?
                      </span>

                      {/* Option 1: AI (Gemini) */}
                      <button
                        type="button"
                        onClick={() => triggerAiScan(selectedFile.base64, selectedFile.type, selectedFile.name)}
                        className="w-full text-left p-3 border border-stone-250 hover:border-stone-900 bg-stone-50/50 hover:bg-[#FCFBF9] transition-all flex items-start gap-3 group cursor-pointer"
                      >
                        <div className="bg-stone-900 text-white p-2 group-hover:scale-105 transition-transform">
                          <Sparkles size={16} className="text-amber-300 animate-pulse" />
                        </div>
                        <div className="space-y-0.5 flex-1 min-w-0">
                          <span className="block text-xs font-bold text-stone-900 uppercase font-mono tracking-wide">
                            Analisar com IA (Recomendado)
                          </span>
                          <span className="block text-[10px] text-stone-500 leading-normal">
                            O Gemini lerá automaticamente o fornecedor, valores, data e número da nota em poucos segundos.
                          </span>
                        </div>
                      </button>

                      {/* Option 2: Manual with document attached */}
                      <button
                        type="button"
                        onClick={() => {
                          setManualFile(selectedFile);
                          setIsManualFormOpen(true);
                          setSelectedFile(null); // Clear from current single area so it focuses only on the manual form
                          if (fileInputRef.current) fileInputRef.current.value = '';
                        }}
                        className="w-full text-left p-3 border border-stone-250 hover:border-stone-900 bg-stone-50/50 hover:bg-[#FCFBF9] transition-all flex items-start gap-3 group cursor-pointer"
                      >
                        <div className="bg-stone-100 text-stone-800 border border-stone-300 p-2 group-hover:scale-105 transition-transform">
                          <FileText size={16} className="text-stone-700" />
                        </div>
                        <div className="space-y-0.5 flex-1 min-w-0">
                          <span className="block text-xs font-bold text-stone-900 uppercase font-mono tracking-wide">
                            Preencher Manualmente
                          </span>
                          <span className="block text-[10px] text-stone-500 leading-normal">
                            Abra o formulário para digitar manualmente. O comprovante já ficará anexado a este gasto.
                          </span>
                        </div>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <h4 className="font-serif text-xs text-stone-950 font-bold flex items-center gap-1.5">
                  <Sparkles size={14} className="text-stone-700 animate-pulse" />
                  Importar em Lote
                </h4>
                <p className="text-[11px] text-stone-500">
                  Importe uma tabela de gastos em PDF (lida por um leitor nativo, sem uso de IA), uma planilha do Excel (.xlsx, .xls) ou uma lista de despesas em CSV (essas duas últimas via IA).
                </p>

                {/* Drag & Drop Stage */}
                <div 
                  onClick={() => bulkFileInputRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const file = e.dataTransfer.files?.[0];
                    if (file) processBulkFile(file);
                  }}
                  className="border-2 border-dashed border-stone-300 hover:border-stone-500 py-8 px-4 text-center cursor-pointer transition-all bg-[#FAF9F6] group"
                >
                  <input 
                    type="file" 
                    ref={bulkFileInputRef} 
                    onChange={handleBulkFileChange} 
                    className="hidden" 
                    accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv,application/pdf" 
                  />
                  <Upload size={24} className="mx-auto text-stone-400 group-hover:text-stone-600 mb-2 transition-all" />
                  <span className="text-xs font-mono uppercase tracking-wide font-bold text-stone-700 block mb-0.5">
                    Selecionar Planilha / PDF
                  </span>
                  <span className="text-[9px] text-stone-400 block font-sans">
                    Arraste o arquivo Excel, CSV ou PDF ou clique para abrir.
                  </span>
                </div>

                {bulkFile && (
                  <div className="bg-stone-50 border border-stone-200 p-2.5 flex items-center justify-between text-xs rounded-none">
                    <div className="flex items-center gap-1.5 truncate">
                      <Paperclip size={12} className="text-stone-500 flex-shrink-0" />
                      <span className="truncate font-mono text-[10.5px]" title={bulkFile.name}>
                        {bulkFile.name}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={handleCancelBulk}
                      className="text-red-500 hover:text-red-700 font-mono text-[10px] uppercase ml-1"
                    >
                      Excluir
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right column: AI Parsing result / validation */}
        <div className="lg:col-span-2">
          {isBulkParsing ? (
            <div className="border border-stone-200 h-full min-h-[180px] p-8 flex flex-col items-center justify-center text-center bg-[#FCFBF9] space-y-3">
              <Loader2 size={28} className="text-stone-700 animate-spin" />
              <div className="space-y-1">
                <h5 className="font-serif text-sm font-bold text-stone-900">Processando Lote</h5>
                <p className="text-xs text-stone-500 max-w-sm leading-relaxed">
                  Lendo a tabela de gastos... Identificando fornecedores, descrições, valores, categorias e datas de despesas da obra para importação simultânea. Por favor, aguarde alguns instantes.
                </p>
              </div>
            </div>
          ) : bulkTransactions ? (
            // Bulk transactions review table
            <div className="border border-stone-200 p-5 space-y-4 bg-[#FCFBF9]">
              <div className="border-b border-stone-200 pb-2.5 flex items-center justify-between">
                <h4 className="font-serif text-xs text-stone-950 font-bold flex items-center gap-1.5">
                  <Sparkles size={15} className="text-stone-700" />
                  Revisar Lançamentos Extraídos ({bulkTransactions.length})
                </h4>
                <span className="text-[8px] font-mono uppercase bg-stone-100 text-stone-800 px-1.5 py-0.5 font-bold">
                  {bulkEngine === 'leitor-nativo-pdf' ? 'Leitor Nativo de PDF (sem IA)' : 'Importação em Lote por IA'}
                </span>
              </div>

              {bulkWarnings.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 p-2.5 text-[11px] text-amber-900 leading-relaxed">
                  {bulkWarnings.map((w, i) => (
                    <p key={i}>⚠ {w}</p>
                  ))}
                  <p className="mt-1 text-amber-700">Confira as observações de cada linha na coluna correspondente antes de importar.</p>
                </div>
              )}

              <div className="overflow-x-auto border border-stone-150 max-h-[300px] bg-white">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-stone-50 font-mono text-[9px] uppercase text-stone-500 border-b border-stone-200">
                      <th className="p-2 w-8 text-center">
                        <input
                          type="checkbox"
                          checked={bulkTransactions.every(t => t.selected)}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setBulkTransactions(bulkTransactions.map(t => ({ ...t, selected: checked })));
                          }}
                          className="h-3 w-3 accent-stone-900 cursor-pointer"
                        />
                      </th>
                      <th className="p-2 w-6"></th>
                      <th className="p-2 w-24">Data</th>
                      <th className="p-2">Fornecedor</th>
                      <th className="p-2">Descrição</th>
                      <th className="p-2 w-28">Categoria</th>
                      <th className="p-2 text-right w-24">Valor</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-150 font-sans">
                    {bulkTransactions.map((t, idx) => (
                      <tr key={idx} className={`hover:bg-stone-50/50 align-middle ${!t.selected ? 'opacity-50' : ''}`}>
                        <td className="p-2 text-center">
                          <input
                            type="checkbox"
                            checked={!!t.selected}
                            onChange={(e) => {
                              const updated = [...bulkTransactions];
                              updated[idx].selected = e.target.checked;
                              setBulkTransactions(updated);
                            }}
                            className="h-3 w-3 accent-stone-900 cursor-pointer"
                          />
                        </td>
                        <td className="p-2 text-center">
                          {t.notes ? (
                            <span title={t.notes} className="inline-flex cursor-help">
                              <AlertTriangle size={12} className="text-amber-500" />
                            </span>
                          ) : null}
                        </td>
                        <td className="p-2">
                          <input
                            type="date"
                            value={t.date}
                            onChange={(e) => {
                              const updated = [...bulkTransactions];
                              updated[idx].date = e.target.value;
                              setBulkTransactions(updated);
                            }}
                            className="bg-transparent border-0 focus:bg-white focus:ring-1 focus:ring-stone-400 p-1 w-full text-[11px] font-mono"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="text"
                            value={t.supplier}
                            onChange={(e) => {
                              const updated = [...bulkTransactions];
                              updated[idx].supplier = e.target.value;
                              setBulkTransactions(updated);
                            }}
                            className="bg-transparent border-0 focus:bg-white focus:ring-1 focus:ring-stone-400 p-1 w-full font-bold text-stone-900 text-[11px]"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="text"
                            value={t.description}
                            onChange={(e) => {
                              const updated = [...bulkTransactions];
                              updated[idx].description = e.target.value;
                              setBulkTransactions(updated);
                            }}
                            className="bg-transparent border-0 focus:bg-white focus:ring-1 focus:ring-stone-400 p-1 w-full text-stone-600 text-[11px]"
                          />
                        </td>
                        <td className="p-2">
                          <select
                            value={t.category}
                            onChange={(e) => {
                              const updated = [...bulkTransactions];
                              updated[idx].category = e.target.value as TransactionCategory;
                              setBulkTransactions(updated);
                            }}
                            className="bg-transparent border-0 focus:bg-white focus:ring-1 focus:ring-stone-400 p-1 w-full text-[10px] font-mono"
                          >
                            <option value="materiais">🧱 Materiais</option>
                            <option value="mao_de_obra">👷 Mão de Obra</option>
                            <option value="projetos_complementares">📐 Proj. Compl.</option>
                            <option value="taxas">🏛️ Taxas</option>
                            <option value="decoracao">🛋️ Decoração</option>
                            <option value="outros">📦 Outros</option>
                          </select>
                        </td>
                        <td className="p-2">
                          <input
                            type="number"
                            step="0.01"
                            value={t.value}
                            onChange={(e) => {
                              const updated = [...bulkTransactions];
                              updated[idx].value = parseFloat(e.target.value) || 0;
                              setBulkTransactions(updated);
                            }}
                            className="bg-transparent border-0 focus:bg-white focus:ring-1 focus:ring-stone-400 p-1 w-full font-mono text-right font-bold text-stone-950 text-[11px]"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-2">
                <span className="text-[10px] text-stone-500 font-mono">
                  Selecionados: <strong>{bulkTransactions.filter(t => t.selected).length} de {bulkTransactions.length}</strong> | Total: <strong>{formatCurrency(bulkTransactions.filter(t => t.selected).reduce((acc, t) => acc + t.value, 0))}</strong>
                </span>
                <div className="flex gap-2 self-end">
                  <button
                    type="button"
                    onClick={handleCancelBulk}
                    className="px-3 py-1.5 text-xs font-mono uppercase text-stone-500 hover:text-stone-800 cursor-pointer"
                  >
                    Descartar
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveBulkTransactions}
                    className="bg-stone-900 text-white hover:bg-stone-800 py-1.5 px-4 text-xs font-mono uppercase tracking-wider font-bold cursor-pointer"
                  >
                    Importar Selecionados
                  </button>
                </div>
              </div>
            </div>
          ) : bulkError ? (
            <div className="border border-red-200 bg-red-50/5 p-5 space-y-4 h-full min-h-[180px] flex flex-col justify-center">
              <div className="bg-red-50 border border-red-200 p-3 text-xs text-red-800 flex items-start gap-2.5">
                <AlertTriangle size={16} className="text-red-600 mt-0.5 flex-shrink-0" />
                <div>
                  <strong className="block font-bold text-red-900">Erro na Importação Inteligente</strong>
                  <span className="text-[11px] text-red-700 leading-normal">
                    {bulkError}
                  </span>
                </div>
              </div>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleCancelBulk}
                  className="bg-stone-900 text-white hover:bg-stone-800 py-1.5 px-4 text-xs font-mono uppercase tracking-wider font-bold cursor-pointer"
                >
                  Tentar Novamente
                </button>
              </div>
            </div>
          ) : isParsing ? (
            <div className="border border-stone-200 h-full min-h-[180px] p-8 flex flex-col items-center justify-center text-center bg-[#FCFBF9] space-y-3">
              <Loader2 size={28} className="text-stone-700 animate-spin" />
              <div className="space-y-1">
                <h5 className="font-serif text-sm font-bold text-stone-900">Análise de Documento com IA</h5>
                <p className="text-xs text-stone-500 max-w-sm leading-relaxed">
                  Lendo Nota Fiscal com o Gemini 3.5... extraindo fornecedor, datas de faturamento, valores totais e itens do cupom. Por favor, aguarde alguns instantes.
                </p>
              </div>
            </div>
          ) : scannedData ? (
            // Validation screen
            <div className={`border p-5 space-y-4 ${aiError ? 'border-amber-200 bg-amber-50/5' : 'border-emerald-200 bg-emerald-50/10'}`}>
              {aiError ? (
                <div className="bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800 flex items-start gap-2.5">
                  <AlertTriangle size={16} className="text-amber-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <strong className="block font-bold text-amber-900">Aviso da IA: Leitura automática indisponível</strong>
                    <span className="text-[11px] text-amber-700 leading-normal">
                      Não conseguimos extrair as informações automaticamente do arquivo ({aiError}).
                      Contudo, <strong>o seu arquivo permanece anexado</strong>. Por favor, preencha os campos abaixo manualmente para que ele seja salvo e enviado ao Telegram com a nomenclatura formatada.
                    </span>
                  </div>
                </div>
              ) : (
                <div className="border-b border-emerald-150 pb-2.5 flex items-center justify-between">
                  <h4 className="font-serif text-xs text-emerald-950 font-bold flex items-center gap-1.5">
                    <CheckCircle2 size={15} className="text-emerald-700" />
                    Dados Extraídos com Sucesso! Verifique abaixo:
                  </h4>
                  <span className="text-[8px] font-mono uppercase bg-emerald-100 text-emerald-800 px-1.5 py-0.5 font-bold">
                    Extração Inteligente
                  </span>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div>
                  <label className="block text-[8px] font-mono uppercase text-stone-400 font-bold">Fornecedor / Prestador</label>
                  <input
                    type="text"
                    className="w-full bg-white border border-stone-200 py-1.5 px-2.5 text-xs focus:outline-none"
                    value={scannedData.supplier}
                    onChange={e => setScannedData({ ...scannedData, supplier: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-[8px] font-mono uppercase text-stone-400 font-bold">Nº de NF / Comprovante</label>
                  <input
                    type="text"
                    className="w-full bg-white border border-stone-200 py-1.5 px-2.5 text-xs focus:outline-none"
                    value={scannedData.invoiceNumber}
                    onChange={e => setScannedData({ ...scannedData, invoiceNumber: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-[8px] font-mono uppercase text-stone-400 font-bold">Valor Calculado (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    className="w-full bg-white border border-stone-200 py-1.5 px-2.5 text-xs focus:outline-none font-mono font-bold"
                    value={scannedData.value}
                    onChange={e => setScannedData({ ...scannedData, value: parseFloat(e.target.value) || 0 })}
                  />
                </div>
                <div>
                  <label className="block text-[8px] font-mono uppercase text-stone-400 font-bold">Data Identificada</label>
                  <input
                    type="date"
                    className="w-full bg-white border border-stone-200 py-1.5 px-2.5 text-xs focus:outline-none"
                    value={scannedData.date}
                    onChange={e => setScannedData({ ...scannedData, date: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[8px] font-mono uppercase text-stone-400 font-bold">Categoria Definida</label>
                  <select
                    className="w-full bg-white border border-stone-200 py-1.5 px-2 text-xs focus:outline-none"
                    value={scannedData.category}
                    onChange={e => setScannedData({ ...scannedData, category: e.target.value as TransactionCategory })}
                  >
                    <option value="materiais">🧱 Materiais de Construção</option>
                    <option value="mao_de_obra">👷 Mão de Obra / Serviços</option>
                    <option value="outros">📦 Outros Gastos</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[8px] font-mono uppercase text-stone-400 font-bold">Descrição Proposta</label>
                  <input
                    type="text"
                    className="w-full bg-white border border-stone-200 py-1.5 px-2.5 text-xs focus:outline-none"
                    value={scannedData.description}
                    onChange={e => setScannedData({ ...scannedData, description: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <label className="block text-[8px] font-mono uppercase text-stone-400 font-bold">Observações Adicionais Extraídas</label>
                <textarea
                  className="w-full bg-white border border-stone-200 py-1.5 px-2.5 text-xs focus:outline-none h-12 resize-none text-stone-600"
                  value={scannedData.notes}
                  onChange={e => setScannedData({ ...scannedData, notes: e.target.value })}
                />
              </div>

              {/* Filename Preview */}
              <div className="bg-stone-50 border border-stone-200 p-3 space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <span className="inline-block w-1.5 h-1.5 bg-[#FF5A35] rounded-full"></span>
                  <span className="block text-[8px] font-mono font-bold uppercase tracking-wider text-stone-500">
                    Nome do Arquivo Final no Telegram:
                  </span>
                </div>
                <p className="text-[11px] font-mono font-semibold text-stone-800 break-all bg-white p-2 border border-stone-150 select-all">
                  {(() => {
                    if (!scannedData || !selectedFile) return '';
                    return buildTelegramFileName(fileNamePattern, {
                      centro: project?.name || 'Cliente',
                      data: scannedData.date,
                      fornecedor: scannedData.supplier,
                      descricao: scannedData.description,
                      valor: scannedData.value,
                      extension: selectedFile.name
                    });
                  })()}
                </p>
                <span className="block text-[8px] text-stone-400 font-sans leading-relaxed">
                  Gerado automaticamente conforme o padrão de exportação administrativo.
                </span>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-emerald-150">
                <button
                  type="button"
                  onClick={handleCancelScanned}
                  className="px-3 py-1.5 text-xs font-mono uppercase text-stone-500 hover:text-stone-800 cursor-pointer"
                >
                  Descartar
                </button>
                <button
                  type="button"
                  onClick={handleSaveScannedInvoice}
                  className="bg-emerald-800 text-white hover:bg-emerald-900 py-1.5 px-4 text-xs font-mono uppercase tracking-wider font-bold cursor-pointer flex items-center gap-1.5"
                >
                  Confirmar e Salvar Lançamento
                </button>
              </div>
            </div>
          ) : (
            // Default placeholder waiting
            <div className="border border-stone-200 h-full min-h-[180px] p-8 flex flex-col items-center justify-center text-center bg-stone-50/10 text-stone-400">
              <FileText size={28} className="text-stone-300 mb-2" />
              <span className="text-xs font-mono uppercase font-bold tracking-wide text-stone-500 mb-1">
                Visualização do Lançamento por IA
              </span>
              <p className="text-[11px] max-w-xs leading-normal">
                Faça o upload ou arraste um documento ao lado. A extração dos valores será demonstrada aqui de forma interativa para sua confirmação antes do salvamento.
              </p>
            </div>
          )}
        </div>

      </div>

      {/* Financial statement summary */}
      <div className="bg-stone-50 border border-stone-200 p-4 grid grid-cols-2 md:grid-cols-3 gap-4">
        <div>
          <span className="block text-[8px] font-mono uppercase text-stone-400 font-bold">Gasto Total Acumulado</span>
          <span className="font-mono font-bold text-stone-950 text-[15px]">{formatCurrency(totalSpent)}</span>
        </div>
        <div>
          <span className="block text-[8px] font-mono uppercase text-stone-400 font-bold">Gasto com Materiais</span>
          <span className="font-mono font-bold text-amber-800 text-[14px]">
            {formatCurrency(projectTransactions.filter(t => t.category === 'materiais').reduce((acc, t) => acc + t.value, 0))}
          </span>
        </div>
        <div>
          <span className="block text-[8px] font-mono uppercase text-stone-400 font-bold">Gasto com Mão de Obra</span>
          <span className="font-mono font-bold text-emerald-800 text-[14px]">
            {formatCurrency(projectTransactions.filter(t => t.category === 'mao_de_obra').reduce((acc, t) => acc + t.value, 0))}
          </span>
        </div>
      </div>

      {/* Transactions List */}
      <div className="space-y-3">
        <div className="flex justify-between items-center border-b border-stone-100 pb-2">
          <h4 className="font-mono text-xs uppercase tracking-wider text-stone-800 font-bold">
            Extrato de Gastos Lançados ({projectTransactions.length})
          </h4>
        </div>

        <div className="overflow-x-auto border border-stone-200">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-stone-50 font-mono text-[9px] uppercase tracking-wider text-stone-500 border-b border-stone-200">
                <th className="p-3 w-28">Data</th>
                <th className="p-3">Fornecedor / Prestador</th>
                <th className="p-3">Descrição</th>
                <th className="p-3 w-32">Categoria</th>
                <th className="p-3 text-right w-32">Valor</th>
                <th className="p-3 text-center w-24">Comprovante</th>
                <th className="p-3 text-center w-12">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-150 font-sans">
              {projectTransactions.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-stone-400 text-xs">
                    Nenhum pagamento ou gasto registrado para esta obra.
                  </td>
                </tr>
              ) : (
                projectTransactions.map((tx) => (
                  <tr key={tx.id} className="hover:bg-stone-50/50 align-middle">
                    <td className="p-3 font-mono text-[11px] text-stone-500">
                      {tx.date}
                    </td>
                    <td className="p-3">
                      <div className="font-bold text-stone-900">{tx.supplier}</div>
                      {tx.invoiceNumber && (
                        <div className="text-[10px] text-stone-500 font-mono mt-0.5" title="Número da Nota Fiscal / Comprovante">
                          NF: {tx.invoiceNumber}
                        </div>
                      )}
                    </td>
                    <td className="p-3 text-stone-600">
                      {tx.description}
                    </td>
                    <td className="p-3">
                      <span className={`inline-block px-2 py-0.5 text-[9px] font-mono border rounded-none ${getCategoryBadgeColor(tx.category)}`}>
                        {getCategoryLabel(tx.category)}
                      </span>
                    </td>
                    <td className="p-3 text-right font-mono font-bold text-stone-950">
                      {formatCurrency(tx.value)}
                    </td>
                    <td className="p-3 text-center">
                      {tx.receiptUrl ? (
                        <a
                          href={tx.receiptUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-emerald-800 py-1 px-2 text-[9px] font-mono uppercase font-bold inline-flex items-center gap-1 cursor-pointer transition-all rounded-none"
                          title="Visualizar Nota Fiscal na Nuvem (Firebase)"
                        >
                          <Paperclip size={10} className="text-emerald-600" />
                          Anexo Nuvem ↗
                        </a>
                      ) : tx.receiptBase64 ? (
                        <a
                          href={tx.receiptBase64}
                          download={tx.receiptName ? tx.receiptName.replace('Local: ', '') : 'comprovante.pdf'}
                          className="bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-800 py-1 px-2 text-[9px] font-mono uppercase font-bold inline-flex items-center gap-1 cursor-pointer transition-all rounded-none"
                          title="Baixar ou Visualizar Arquivo Anexado"
                        >
                          <Paperclip size={10} className="text-amber-600" />
                          Anexo ↗
                        </a>
                      ) : tx.receiptName ? (
                        <span className="text-[10px] text-stone-400 font-mono italic" title={tx.receiptName}>
                          Simulado
                        </span>
                      ) : (
                        <span className="text-[10px] text-stone-400 font-mono">
                          —
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingTransaction(tx);
                            setManualForm({
                              supplier: tx.supplier,
                              description: tx.description,
                              value: tx.value.toString(),
                              category: tx.category,
                              date: tx.date,
                              notes: tx.notes || '',
                              invoiceNumber: tx.invoiceNumber || '',
                            });
                            setManualFile(null);
                            setIsManualFormOpen(true);
                          }}
                          className="text-stone-400 hover:text-stone-700 transition-all cursor-pointer p-1"
                          title="Editar Lançamento"
                        >
                          <Edit2 size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (window.confirm('Tem certeza que deseja excluir este lançamento financeiro permanentemente?')) {
                              deleteTransaction(tx.id);
                            }
                          }}
                          className="text-stone-400 hover:text-red-700 transition-all cursor-pointer p-1"
                          title="Excluir Gasto"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

        </>
      )}

      {/* Interactive Camera Modal Overlay */}
      {isCameraActive && (
        <div className="fixed inset-0 z-50 bg-black/95 backdrop-blur-sm flex flex-col items-center justify-center p-4">
          <div className="relative w-full max-w-md bg-stone-900 border border-stone-800 p-6 space-y-4 flex flex-col items-center">
            {/* Header */}
            <div className="w-full flex items-center justify-between border-b border-stone-800 pb-3">
              <div className="flex items-center gap-2">
                <Camera className="text-stone-400 animate-pulse" size={16} />
                <span className="font-mono text-xs text-stone-300 uppercase tracking-wider font-bold text-left">Captura de Documento</span>
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
                  <AlertCircle size={32} className="text-red-500 mx-auto" />
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
                      Alinhe o Comprovante ou Nota Fiscal aqui
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
