import React, { useState } from 'react';
import { 
  FileSpreadsheet, 
  Plus, 
  Trash2, 
  Edit3, 
  Search, 
  Calendar, 
  DollarSign, 
  Package, 
  ShoppingCart,
  Layers,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Upload,
  MessageSquare,
  History,
  Check,
  CheckCircle,
  AlertTriangle,
  Printer,
  Camera,
  Paperclip,
  X
} from 'lucide-react';
import Markdown from 'react-markdown';
import { MaterialItem, Project } from '../types';
import { getAccessToken } from '../lib/firebaseAuth';

interface PlanningMaterialsProps {
  materialsList: MaterialItem[];
  setMaterialsList: React.Dispatch<React.SetStateAction<any[]>>;
  projects: Project[];
  materiaisProjectId: string;
  setMateriaisProjectId: (id: string) => void;
  isMateriaisCollapsed: boolean;
  setIsMateriaisCollapsed: (collapsed: boolean) => void;
  formatCurrency: (value: number) => string;
}

export const PlanningMaterials: React.FC<PlanningMaterialsProps> = ({
  materialsList,
  setMaterialsList,
  projects,
  materiaisProjectId,
  setMateriaisProjectId,
  isMateriaisCollapsed,
  setIsMateriaisCollapsed,
  formatCurrency
}) => {
  // Local state for searching/filtering
  const [searchTerm, setSearchTerm] = useState('');

  // Form states
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MaterialItem | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // AI-powered Materials States
  const [aiMaterialsFile, setAiMaterialsFile] = useState<File | null>(null);
  const [aiMaterialsLoading, setAiMaterialsLoading] = useState<boolean>(false);
  const [aiMaterialsError, setAiMaterialsError] = useState<string | null>(null);
  const [aiMaterialsStep, setAiMaterialsStep] = useState<string>('');

  // Preview / Checkpoint States
  const [tempMaterials, setTempMaterials] = useState<any[] | null>(null);
  const [tempComment, setTempComment] = useState<string | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState<boolean>(false);
  const [materialsDriveFile, setMaterialsDriveFile] = useState<{ id: string; webViewLink: string } | null>(null);
  const [materialsDriveError, setMaterialsDriveError] = useState<string | null>(null);
  const [isPrintPreviewOpen, setIsPrintPreviewOpen] = useState<boolean>(false);
  const [materialsWarnings, setMaterialsWarnings] = useState<string[]>([]);
  const [materialsEngine, setMaterialsEngine] = useState<string | null>(null);
  const [groupingSuggestions, setGroupingSuggestions] = useState<{ itemIndices: number[]; itemNames: string[]; reason: string }[]>([]);
  const [dismissedGroupKeys, setDismissedGroupKeys] = useState<Set<string>>(new Set());

  // Refinement / Checkpoint prompt states
  const [checkpointPrompt, setCheckpointPrompt] = useState<string>('');
  const [isRefining, setIsRefining] = useState<boolean>(false);
  const [refiningError, setRefiningError] = useState<string | null>(null);
  const [checkpointHistory, setCheckpointHistory] = useState<string[]>([]);

  // Camera states and refs
  const cameraFileInputRef = React.useRef<HTMLInputElement>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);

  // Camera control and cleanup
  const startCamera = async () => {
    setIsCameraActive(true);
    setCameraError(null);
    setCameraStream(null);

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
      processCameraPhoto(base64Data, 'image/jpeg', `foto_materiais_${Date.now()}.jpg`);
    }
  };

  const processCameraPhoto = async (base64Data: string, mimeType: string, fileName: string) => {
    setAiMaterialsLoading(true);
    setAiMaterialsError(null);
    setAiMaterialsStep('Lendo foto capturada...');

    // Set mock/preview file so UI shows it
    try {
      const byteCharacters = atob(base64Data);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], {type: mimeType});
      const file = new File([blob], fileName, {type: mimeType});
      setAiMaterialsFile(file);
    } catch (e) {
      console.error('Erro ao converter arquivo:', e);
    }

    const steps = [
      'Iniciando processamento de imagem...',
      'Analisando foto de materiais com a IA Gemini...',
      'Mapeando itens da foto, quantidades e unidades...',
      'Estruturando dados e gerando parecer...'
    ];

    let stepIndex = 0;
    const interval = setInterval(() => {
      if (stepIndex < steps.length - 1) {
        stepIndex++;
        setAiMaterialsStep(steps[stepIndex]);
      }
    }, 3000);

    try {
      setMaterialsDriveFile(null);
      setMaterialsDriveError(null);
      const accessToken = await getAccessToken();

      const response = await fetch('/api/planning/parse-materials', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          fileBase64: base64Data,
          mimeType,
          fileName,
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
      if (data.success && data.materials) {
        setTempMaterials(data.materials);
        setTempComment(data.comment);
        setMaterialsDriveFile(data.driveFile || null);
        setMaterialsDriveError(data.driveError || null);
        setIsPreviewOpen(true);
        setCheckpointHistory(['Foto capturada analisada com sucesso.']);
      } else {
        throw new Error('Nenhum material pôde ser extraído da foto pela IA. Garanta que a imagem esteja nítida e bem iluminada.');
      }
    } catch (err: any) {
      clearInterval(interval);
      console.error(err);
      setAiMaterialsError(err.message || 'Erro ao processar imagem capturada.');
    } finally {
      setAiMaterialsLoading(false);
    }
  };

  const handleCameraFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setAiMaterialsError('O tamanho do arquivo excede o limite de 5MB por documento.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64Data = result.split(',')[1];
      processCameraPhoto(base64Data, file.type || 'image/jpeg', file.name || `camera_${Date.now()}.jpg`);
    };
    reader.readAsDataURL(file);
  };

  React.useEffect(() => {
    return () => {
      if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [cameraStream]);

  // AI File Upload Handlers
  const handleAiMaterialsUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (file.size > 5 * 1024 * 1024) {
        setAiMaterialsError('O tamanho do arquivo excede o limite de 5MB por documento.');
        setAiMaterialsFile(null);
        return;
      }
      const validExtensions = ['.pdf', '.xlsx', '.xls', '.csv', '.ods', '.xlsm', '.xlsb', '.xml', '.sheet'];
      const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
      const isPdf = ext === '.pdf' || file.type === 'application/pdf';
      const isSpreadsheet = validExtensions.includes(ext) || 
                            file.type.includes('sheet') || 
                            file.type.includes('excel') || 
                            file.type.includes('spreadsheet') || 
                            file.type.includes('csv') ||
                            file.type.includes('xml');

      if (isPdf || isSpreadsheet) {
        setAiMaterialsFile(file);
        setAiMaterialsError(null);
      } else {
        setAiMaterialsError('Formato inválido. Envie arquivos em PDF ou Planilhas Excel (.pdf, .xlsx, .xls, .xlsm, .csv, .ods, .xlsb)');
        setAiMaterialsFile(null);
      }
    }
  };

  const handleProcessMaterialsWithAi = async () => {
    if (!aiMaterialsFile) return;

    setAiMaterialsLoading(true);
    setAiMaterialsError(null);
    setAiMaterialsStep('Lendo arquivo de materiais...');

    const isPdfFile = aiMaterialsFile.type === 'application/pdf' || aiMaterialsFile.name.toLowerCase().endsWith('.pdf');
    const steps = isPdfFile
      ? [
          'Lendo camada de texto do PDF...',
          'Reconhecendo colunas da tabela (material, quantidade, valores, datas)...',
          'Reconstruindo linhas e extraindo cada item...',
          'Verificando itens com nomes parecidos para sugestão de agrupamento...',
        ]
      : [
          'Lendo arquivo e decodificando estrutura...',
          'Analisando linhas do orçamento / cotação com a IA Gemini...',
          'Mapeando descrições, quantidades e unidades de medida...',
          'Analisando fornecedores, valores unitários e prazos...',
          'Estruturando dados e elaborando parecer de suprimentos...',
        ];

    let stepIndex = 0;
    const interval = setInterval(() => {
      if (stepIndex < steps.length - 1) {
        stepIndex++;
        setAiMaterialsStep(steps[stepIndex]);
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
        reader.readAsDataURL(aiMaterialsFile);
      });

      const base64Data = await filePromise;
      let mimeType = aiMaterialsFile.type;
      if (!mimeType) {
        const ext = aiMaterialsFile.name.substring(aiMaterialsFile.name.lastIndexOf('.')).toLowerCase();
        if (ext === '.pdf') mimeType = 'application/pdf';
        else if (ext === '.xlsx') mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        else if (ext === '.xls') mimeType = 'application/vnd.ms-excel';
        else if (ext === '.csv') mimeType = 'text/csv';
        else if (ext === '.ods') mimeType = 'application/vnd.oasis.opendocument.spreadsheet';
        else if (ext === '.xlsm') mimeType = 'application/vnd.ms-excel.sheet.macroEnabled.12';
        else if (ext === '.xlsb') mimeType = 'application/vnd.ms-excel.sheet.binary.macroEnabled.12';
        else mimeType = 'application/octet-stream';
      }

      setMaterialsDriveFile(null);
      setMaterialsDriveError(null);
      const accessToken = await getAccessToken();

      const response = await fetch('/api/planning/parse-materials', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          fileBase64: base64Data,
          mimeType,
          fileName: aiMaterialsFile.name,
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
      if (data.success && data.materials) {
        setTempMaterials(data.materials);
        setTempComment(data.comment || null);
        setMaterialsDriveFile(data.driveFile || null);
        setMaterialsDriveError(data.driveError || null);
        setMaterialsWarnings(Array.isArray(data.warnings) ? data.warnings : []);
        setGroupingSuggestions(Array.isArray(data.groupingSuggestions) ? data.groupingSuggestions : []);
        setDismissedGroupKeys(new Set());
        setMaterialsEngine(data.engine || null);
        setIsPreviewOpen(true);
        setCheckpointHistory(['Extração inicial do arquivo concluída.']);
      } else {
        throw new Error('Nenhum material pôde ser extraído do arquivo pela IA. Verifique se o arquivo está legível.');
      }
    } catch (err: any) {
      clearInterval(interval);
      console.error(err);
      setAiMaterialsError(err.message || 'Houve um erro ao processar os materiais com a IA. Por favor, tente novamente.');
    } finally {
      setAiMaterialsLoading(false);
    }
  };

  // Chave estável para identificar uma sugestão de agrupamento (baseada nos nomes envolvidos)
  const groupKey = (g: { itemNames: string[] }) => g.itemNames.slice().sort().join('|');

  const handleDismissGroupSuggestion = (g: { itemNames: string[] }) => {
    setDismissedGroupKeys(prev => new Set(prev).add(groupKey(g)));
  };

  const handleMergeGroup = (g: { itemIndices: number[]; itemNames: string[] }) => {
    if (!tempMaterials) return;
    const rows = g.itemIndices.map(idx => tempMaterials[idx]).filter(Boolean);
    if (rows.length < 2) return;

    // Nome: mantém o mais longo/descritivo do grupo
    const mergedName = rows.reduce((longest, r) => (r.name || '').length > longest.length ? (r.name || '') : longest, '');

    // Quantidade: soma; se as unidades divergirem, mantém a mais frequente e avisa nas notas
    const totalQty = rows.reduce((sum, r) => sum + (parseFloat(r.quantityVal) || 0), 0);
    const unitCounts: Record<string, number> = {};
    rows.forEach(r => {
      const u = (r.quantityUnit || r.unit || '').trim();
      if (u) unitCounts[u] = (unitCounts[u] || 0) + 1;
    });
    const units = Object.keys(unitCounts);
    const mergedUnit = units.sort((a, b) => unitCounts[b] - unitCounts[a])[0] || '';
    const unitsDiffer = units.length > 1;

    // Valor unitário: média ponderada pelo valor total combinado
    const totalValue = rows.reduce((sum, r) => sum + ((parseFloat(r.quantityVal) || 0) * (parseFloat(r.unitValue) || 0)), 0);
    const mergedUnitValue = totalQty > 0 ? Math.round((totalValue / totalQty) * 100) / 100 : 0;

    // Fornecedores: se todos iguais, mantém; senão lista os distintos
    const suppliers = Array.from(new Set(rows.map(r => (r.supplier || '').trim()).filter(Boolean)));
    const mergedSupplier = suppliers.length <= 1 ? (suppliers[0] || 'Cotação') : suppliers.join(' + ');

    // Datas: pedido mais antigo, entrega mais recente
    const orderDates = rows.map(r => r.orderDate).filter(Boolean).sort();
    const deliveryDates = rows.map(r => r.deliveryDate).filter(Boolean).sort();
    const mergedOrderDate = orderDates[0] || new Date().toISOString().split('T')[0];
    const mergedDeliveryDate = deliveryDates[deliveryDates.length - 1] || mergedOrderDate;

    const notesParts = [`Item agrupado a partir de: ${rows.map(r => r.name).join(', ')}.`];
    if (unitsDiffer) notesParts.push(`Atenção: as unidades originais divergiam (${units.join(', ')}) — confira a quantidade total.`);

    const mergedItem = {
      name: mergedName,
      quantityVal: Math.round(totalQty * 100) / 100,
      quantityUnit: mergedUnit,
      unit: mergedUnit,
      supplier: mergedSupplier,
      unitValue: mergedUnitValue,
      orderDate: mergedOrderDate,
      deliveryDate: mergedDeliveryDate,
      notes: notesParts.join(' '),
    };

    const indicesSet = new Set(g.itemIndices);
    const firstIndex = Math.min(...g.itemIndices);
    const newMaterials = tempMaterials
      .filter((_, idx) => !indicesSet.has(idx))
      .concat([]); // cópia
    // Insere o item mesclado na posição relativa do primeiro item do grupo
    const insertAt = tempMaterials.slice(0, firstIndex).filter((_, idx) => !indicesSet.has(idx)).length;
    newMaterials.splice(insertAt, 0, mergedItem);

    setTempMaterials(newMaterials);
    handleDismissGroupSuggestion(g);
    setCheckpointHistory(prev => [...prev, `Agrupamento manual: ${rows.length} itens unidos em "${mergedName}".`]);
  };

  const handleRefineMaterials = async () => {
    if (!checkpointPrompt.trim() || !tempMaterials) return;

    setIsRefining(true);
    setRefiningError(null);

    try {
      const response = await fetch('/api/planning/refine-materials', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          currentMaterials: tempMaterials,
          userMessage: checkpointPrompt.trim()
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
      if (data.success && data.materials) {
        setTempMaterials(data.materials);
        setTempComment(data.comment);
        setCheckpointHistory(prev => [...prev, checkpointPrompt.trim()]);
        setCheckpointPrompt('');
      } else {
        throw new Error('Não foi possível aplicar as alterações solicitadas.');
      }
    } catch (err: any) {
      console.error(err);
      setRefiningError(err.message || 'Erro ao refinar materiais com a IA.');
    } finally {
      setIsRefining(false);
    }
  };

  const handleConsolidateMaterials = (shouldReplace: boolean) => {
    if (!tempMaterials) return;

    const formattedNewItems = tempMaterials.map((m, idx) => {
      const quantityStr = m.quantityUnit && m.quantityUnit.trim()
        ? `${m.quantityVal} ${m.quantityUnit.trim()}`
        : `${m.quantityVal}`;

      return {
        id: `mat-ai-${Date.now()}-${idx}`,
        projectId: materiaisProjectId,
        name: m.name || 'Material sem nome',
        quantity: quantityStr,
        unit: m.quantityUnit ? m.quantityUnit.trim() : undefined,
        unitValue: m.unitValue !== undefined ? Number(m.unitValue) : 0,
        supplier: m.supplier || 'Cotação',
        estimatedValue: (m.quantityVal || 0) * (m.unitValue || 0),
        orderDate: m.orderDate || new Date().toISOString().split('T')[0],
        deliveryDate: m.deliveryDate || undefined,
        notes: m.notes || ''
      };
    });

    if (shouldReplace) {
      setMaterialsList(prev => [
        ...prev.filter(m => m.projectId !== materiaisProjectId),
        ...formattedNewItems
      ]);
    } else {
      setMaterialsList(prev => [...prev, ...formattedNewItems]);
    }

    setTempMaterials(null);
    setTempComment(null);
    setIsPreviewOpen(false);
    setAiMaterialsFile(null);
    setCheckpointHistory([]);
    setGroupingSuggestions([]);
    setMaterialsWarnings([]);
    setDismissedGroupKeys(new Set());
  };

  const [formInput, setFormInput] = useState({
    name: '',
    quantityVal: '', // numeric quantity
    quantityUnit: '', // unit (sacos, m², etc.)
    supplier: '',
    unitValue: '', // unit price
    orderDate: new Date().toISOString().split('T')[0],
    deliveryDate: '',
    notes: ''
  });

  const activeProject = projects.find(p => p.id === materiaisProjectId);
  const activeMaterials = materialsList.filter(m => m.projectId === materiaisProjectId);

  // Apply search filter
  const filteredMaterials = activeMaterials.filter(m => {
    const matchesSearch = m.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          m.supplier.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (m.notes && m.notes.toLowerCase().includes(searchTerm.toLowerCase()));
    return matchesSearch;
  });

  // helper function to parse old quantity formats (e.g. "50 sacos" -> { value: 50, unit: "sacos" })
  const parseQuantityStr = (qtyStr: string) => {
    if (!qtyStr) return { value: 1, unit: '' };
    const num = parseFloat(qtyStr);
    if (isNaN(num)) return { value: 1, unit: qtyStr };
    // remove the number and spaces to get the unit
    const unit = qtyStr.replace(/^[0-9.,\s]+/, '').trim();
    return { value: num, unit };
  };

  // Summary Metrics
  const totalItems = activeMaterials.length;
  const totalValue = activeMaterials.reduce((sum, m) => {
    // Fonte única de verdade: usa item.estimatedValue (igual à coluna "Valor Total" da tabela),
    // sem reparsear a string de quantidade, para o card não divergir do total da tabela.
    return sum + (m.estimatedValue || 0);
  }, 0);

  const currentProject = projects.find(p => p.id === materiaisProjectId);
  const projectName = currentProject ? currentProject.name : 'Obra Geral';

  const handleStartAdd = () => {
    setEditingItem(null);
    setFormInput({
      name: '',
      quantityVal: '',
      quantityUnit: '',
      supplier: '',
      unitValue: '',
      orderDate: new Date().toISOString().split('T')[0],
      deliveryDate: '',
      notes: ''
    });
    setFormError(null);
    setIsFormOpen(true);
  };

  const handleStartEdit = (item: MaterialItem) => {
    const parsedQty = parseQuantityStr(item.quantity);
    const qtyVal = item.quantity ? String(parsedQty.value) : '';
    const qtyUnit = item.unit || parsedQty.unit || '';
    
    // Calculate unit value if it doesn't exist
    const calculatedUnitValue = item.unitValue !== undefined 
      ? item.unitValue 
      : (item.estimatedValue / (parsedQty.value || 1));

    setEditingItem(item);
    setFormInput({
      name: item.name,
      quantityVal: qtyVal,
      quantityUnit: qtyUnit,
      supplier: item.supplier,
      unitValue: item.estimatedValue && parsedQty.value 
        ? String(Number(calculatedUnitValue.toFixed(2))) 
        : String(item.unitValue || ''),
      orderDate: item.orderDate,
      deliveryDate: item.deliveryDate || '',
      notes: item.notes || ''
    });
    setFormError(null);
    setIsFormOpen(true);
  };

  const handleDelete = (id: string) => {
    if (confirm('Deseja realmente remover este material da lista de planejamento?')) {
      setMaterialsList(prev => prev.filter(m => m.id !== id));
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const { name, quantityVal, quantityUnit, supplier, unitValue, orderDate, deliveryDate, notes } = formInput;

    if (!name.trim()) {
      setFormError('O nome/descrição do material é obrigatório.');
      return;
    }

    const qtyNum = parseFloat(quantityVal) || 0;
    const unitValNum = parseFloat(unitValue) || 0;
    const computedTotal = qtyNum * unitValNum;

    // Combine number and unit to form quantity string (e.g., "50 sacos")
    const quantityStr = quantityUnit.trim() 
      ? `${qtyNum} ${quantityUnit.trim()}`
      : `${qtyNum}`;

    if (editingItem) {
      // Update existing item
      setMaterialsList(prev => prev.map(m => m.id === editingItem.id ? {
        ...m,
        name: name.trim(),
        quantity: quantityStr,
        unit: quantityUnit.trim() || undefined,
        unitValue: unitValNum,
        supplier: supplier.trim(),
        estimatedValue: computedTotal, // backward compatibility total
        orderDate,
        deliveryDate: deliveryDate || undefined,
        notes: notes.trim()
      } : m));
    } else {
      // Insert new item
      const newItem: MaterialItem = {
        id: `mat-${Date.now()}`,
        projectId: materiaisProjectId,
        name: name.trim(),
        quantity: quantityStr,
        unit: quantityUnit.trim() || undefined,
        unitValue: unitValNum,
        supplier: supplier.trim(),
        estimatedValue: computedTotal,
        orderDate,
        deliveryDate: deliveryDate || undefined,
        notes: notes.trim()
      };
      setMaterialsList(prev => [...prev, newItem]);
    }

    setIsFormOpen(false);
    setEditingItem(null);
    setFormError(null);
  };

  // Compute live total for the form
  const liveQty = parseFloat(formInput.quantityVal) || 0;
  const liveUnitVal = parseFloat(formInput.unitValue) || 0;
  const liveTotal = liveQty * liveUnitVal;

  return (
    <div className="bg-white border border-stone-200 shadow-xs mb-6">
      {/* Header bar */}
      <div 
        onClick={() => setIsMateriaisCollapsed(!isMateriaisCollapsed)}
        className="bg-stone-50 border-b border-stone-200 px-5 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer hover:bg-stone-100/40 transition-all select-none"
      >
        <div className="flex items-center gap-3">
          <span className="text-stone-500 font-mono text-xs">
            {isMateriaisCollapsed ? '▶' : '▼'}
          </span>
          <div>
            <h3 className="font-serif text-base text-stone-900 font-bold flex items-center gap-2">
              <FileSpreadsheet size={18} className="text-stone-600" />
              Lista de Materiais de Planejamento
            </h3>
            <p className="text-xs text-stone-500 mt-0.5">
              Defina todos os insumos da obra com quantidades, estimativas de custos, fornecedores e datas previstas antes do início das atividades.
            </p>
          </div>
        </div>

        {/* Project Selector */}
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <span className="text-[10px] font-mono uppercase tracking-wider text-stone-500 font-bold">Obra / Cliente:</span>
          <select
            value={materiaisProjectId}
            onChange={(e) => setMateriaisProjectId(e.target.value)}
            className="bg-white border border-stone-300 py-1 px-2.5 text-xs focus:outline-none focus:border-stone-500 transition-all rounded-none font-sans font-medium"
          >
            {projects.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Body content */}
      {!isMateriaisCollapsed && (
        <div className="p-6 space-y-6">
          
          {/* AI-powered Materials Upload & Extraction Engine */}
          <div className="bg-stone-50 border border-stone-200 p-5 space-y-4">
            <div>
              <h4 className="font-serif text-xs font-bold text-stone-950 uppercase tracking-wide flex items-center gap-2">
                <span className="text-sm">🪄</span> Preenchimento Automático de Materiais com Inteligência Artificial
              </h4>
              <p className="text-[11px] text-stone-500 mt-0.5">
                Anexe uma lista de materiais, planilha de insumos ou cotação em PDF (lido por um leitor nativo, sem uso de IA) ou Excel (.xlsx, .xls, via IA). Todos os itens, quantidades, fornecedores, valores e datas são mapeados automaticamente — inclusive sugestões de agrupamento para itens com nomes parecidos.
              </p>
            </div>

            <div className="flex flex-col md:flex-row items-center gap-4">
              <div className="w-full md:flex-1">
                {/* Dual Upload Buttons */}
                <div className="grid grid-cols-1 gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => document.getElementById('ai-materials-picker')?.click()}
                    className="flex items-center justify-center gap-2 border-2 border-dashed border-stone-300 hover:border-stone-500 bg-white hover:bg-[#FAF9F6] py-4 px-3 text-xs font-mono uppercase font-bold tracking-wider text-stone-800 transition-all cursor-pointer group"
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
                    className="flex items-center justify-center gap-2 border-2 border-dashed border-stone-300 hover:border-stone-500 bg-white hover:bg-[#FAF9F6] py-4 px-3 text-xs font-mono uppercase font-bold tracking-wider text-stone-800 transition-all cursor-pointer group"
                  >
                    <Camera size={16} className="text-stone-500 group-hover:text-stone-800" />
                    <span>Tirar Foto</span>
                  </button>
                </div>

                <input
                  id="ai-materials-picker"
                  type="file"
                  accept=".pdf, .xlsx, .xls, .xlsm, .xlsb, .csv, .ods, .doc, .docx, image/*"
                  onChange={handleAiMaterialsUpload}
                  className="hidden"
                />

                <input
                  type="file"
                  ref={cameraFileInputRef}
                  onChange={handleCameraFileChange}
                  className="hidden"
                  accept="image/*"
                  capture="environment"
                />
                
                {aiMaterialsFile && (
                  <div className="bg-stone-50 border border-stone-200 p-2.5 flex items-center justify-between text-xs mt-2">
                    <div className="flex items-center gap-1.5 truncate">
                      <Paperclip size={12} className="text-stone-500 flex-shrink-0" />
                      <span className="truncate font-mono text-[10.5px]" title={aiMaterialsFile.name}>
                        {aiMaterialsFile.name}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setAiMaterialsFile(null)}
                      className="text-stone-400 hover:text-stone-600 font-mono text-[10px]"
                    >
                      Remover
                    </button>
                  </div>
                )}

                {aiMaterialsError && (
                  <p className="text-[10px] text-red-600 mt-2 font-mono">{aiMaterialsError}</p>
                )}
              </div>

              {aiMaterialsFile && !aiMaterialsLoading && (
                <button
                  type="button"
                  onClick={handleProcessMaterialsWithAi}
                  className="w-full md:w-auto bg-[#1E1E1E] text-white hover:bg-stone-850 py-3.5 px-6 text-[10px] font-mono uppercase tracking-widest font-bold transition-all shadow-sm border border-transparent cursor-pointer"
                >
                  ✨ Analisar e Preencher Materiais
                </button>
              )}
            </div>

            {/* AI loading */}
            {aiMaterialsLoading && (
              <div className="bg-stone-100 border border-stone-200 p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-stone-850 border-t-transparent"></div>
                  <span className="text-xs font-bold text-stone-800 font-serif">
                    {aiMaterialsFile && (aiMaterialsFile.type === 'application/pdf' || aiMaterialsFile.name.toLowerCase().endsWith('.pdf'))
                      ? 'Leitor Nativo de PDF está processando os materiais...'
                      : 'Módulo de IA Chaves Brites Correa está analisando os materiais...'}
                  </span>
                </div>
                <p className="text-xs font-mono text-stone-600 animate-pulse">{aiMaterialsStep}</p>
              </div>
            )}
          </div>

          {/* AI Checkpoints and Preview Panel */}
          {isPreviewOpen && tempMaterials && (
            <div className="bg-stone-900 text-white p-5 space-y-5 border border-stone-850 shadow-lg font-sans">
              <div className="flex justify-between items-start border-b border-stone-800 pb-3">
                <div>
                  <h4 className="font-serif text-sm font-bold uppercase tracking-wider text-stone-100 flex items-center gap-2">
                    <Sparkles size={16} className="text-yellow-400 animate-pulse" />
                    Pré-Visualização e Checkpoint de Alterações (IA)
                  </h4>
                  <p className="text-[10px] text-stone-400 mt-0.5">
                    Estes itens foram extraídos pela Inteligência Artificial. Você pode fazer ajustes na lista solicitando à IA por comando de texto antes de salvar permanentemente.
                  </p>
                </div>
                <button 
                  onClick={() => {
                    if (confirm('Deseja descartar este rascunho de extração?')) {
                      setIsPreviewOpen(false);
                      setTempMaterials(null);
                      setTempComment(null);
                      setAiMaterialsFile(null);
                      setGroupingSuggestions([]);
                      setMaterialsWarnings([]);
                    }
                  }}
                  className="text-stone-400 hover:text-white font-bold text-sm"
                >
                  ✕
                </button>
              </div>

              <span className="inline-block text-[8px] font-mono uppercase bg-stone-800 text-stone-300 px-1.5 py-0.5 font-bold">
                {materialsEngine === 'leitor-nativo-pdf' ? 'Leitor Nativo de PDF (sem IA)' : 'Extração por IA (Gemini)'}
              </span>

              {materialsWarnings.length > 0 && (
                <div className="bg-amber-950/40 border border-amber-800 p-2.5 text-[11px] text-amber-200 leading-relaxed">
                  {materialsWarnings.map((w, i) => (
                    <p key={i}>⚠ {w}</p>
                  ))}
                </div>
              )}

              {groupingSuggestions.filter(g => !dismissedGroupKeys.has(groupKey(g))).length > 0 && (
                <div className="bg-sky-950/40 border border-sky-800 p-3.5 space-y-2.5">
                  <span className="block text-[9px] font-mono uppercase tracking-wider text-sky-300 font-bold flex items-center gap-1.5">
                    <Layers size={12} /> Sugestões de Agrupamento — Itens com Nomes Parecidos
                  </span>
                  {groupingSuggestions.filter(g => !dismissedGroupKeys.has(groupKey(g))).map((g, gi) => (
                    <div key={gi} className="bg-stone-950/60 border border-sky-900 p-2.5 flex flex-col sm:flex-row sm:items-center gap-2 justify-between">
                      <div className="text-[10.5px] text-stone-300 font-sans">
                        <span className="block text-sky-400 text-[9px] font-mono uppercase mb-1">{g.reason}</span>
                        {g.itemNames.map((n, i) => (
                          <span key={i} className="block">• {n}</span>
                        ))}
                      </div>
                      <div className="flex gap-1.5 flex-shrink-0">
                        <button
                          type="button"
                          onClick={() => handleMergeGroup(g)}
                          className="bg-sky-800 hover:bg-sky-700 text-white text-[9px] font-mono uppercase tracking-wider py-1.5 px-2.5 font-bold transition-all whitespace-nowrap"
                        >
                          Agrupar Itens
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDismissGroupSuggestion(g)}
                          className="bg-stone-800 hover:bg-stone-700 text-stone-400 text-[9px] font-mono uppercase tracking-wider py-1.5 px-2.5 transition-all whitespace-nowrap"
                        >
                          Ignorar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}



              {/* Chat checkpoint input / controller */}
              <div className="bg-stone-950 border border-stone-800 p-4 space-y-3">
                <span className="block text-[9px] font-mono uppercase tracking-wider text-stone-400 font-bold flex items-center gap-1.5">
                  <MessageSquare size={12} className="text-stone-400" />
                  Checkpoints de Alteração - Prompt de Comando para IA
                </span>
                <p className="text-[10px] text-stone-500 leading-normal">
                  Deseja mudar alguma coisa na pré-visualização abaixo? Solicite abaixo (Ex: "mude o valor unitário do cimento para 40 reais", "adicione 50 metros de areia média", "remova o porcelanato", "aplique desconto de 10%"). A IA atualizará a tabela e o parecer imediatamente.
                </p>

                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    value={checkpointPrompt}
                    onChange={(e) => setCheckpointPrompt(e.target.value)}
                    placeholder="Instruções para alteração (ex: aumente a quantidade de todos em 10%...)"
                    className="flex-1 bg-stone-900 border border-stone-800 text-stone-100 py-2 px-3 text-xs focus:outline-none focus:border-stone-600 font-sans"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleRefineMaterials();
                      }
                    }}
                  />
                  <button
                    type="button"
                    disabled={isRefining || !checkpointPrompt.trim()}
                    onClick={handleRefineMaterials}
                    className="bg-stone-800 hover:bg-stone-700 disabled:opacity-50 text-white font-mono uppercase tracking-wider text-[10px] py-2 px-4 font-bold transition-all flex items-center gap-1.5 justify-center"
                  >
                    {isRefining ? (
                      <>
                        <div className="animate-spin rounded-full h-3 w-3 border border-white border-t-transparent"></div>
                        <span>Processando...</span>
                      </>
                    ) : (
                      <>
                        <span>Ajustar com IA</span>
                      </>
                    )}
                  </button>
                </div>

                {refiningError && (
                  <p className="text-[10px] text-red-400 font-mono">{refiningError}</p>
                )}

                {/* Checkpoint history */}
                {checkpointHistory.length > 0 && (
                  <div className="pt-2 border-t border-stone-900 flex items-center gap-2 flex-wrap">
                    <span className="text-[9px] font-mono text-stone-500 font-bold flex items-center gap-1">
                      <History size={10} /> Histórico de Checkpoints:
                    </span>
                    {checkpointHistory.map((hist, hIdx) => (
                      <span key={hIdx} className="bg-stone-900 border border-stone-800 text-stone-400 text-[8px] font-mono py-0.5 px-2">
                        {hIdx === 0 ? '✓ Extração' : `Checkpoint ${hIdx}: "${hist}"`}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* AI Guidance and Observations Commentary */}
              {tempComment && (
                <div className="bg-[#FAF9F6] text-stone-900 border-l-4 border-amber-500 p-4 font-sans text-xs">
                  <span className="block text-[9px] font-mono uppercase tracking-widest text-amber-800 font-bold mb-2 flex items-center gap-1">
                    📋 Observações e Orientações Técnicas (Gemini)
                  </span>
                  <div className="markdown-body prose prose-stone prose-xs leading-relaxed max-w-none text-stone-800">
                    <Markdown>{tempComment}</Markdown>
                  </div>
                </div>
              )}

              {/* Temp list preview table */}
              <div className="space-y-2">
                <span className="block text-[9px] font-mono uppercase tracking-wider text-stone-400 font-bold">
                  📋 Itens Extraídos e Atualizados ({tempMaterials.length})
                </span>
                <div className="overflow-x-auto border border-stone-800 bg-stone-950 max-h-60">
                  <table className="w-full border-collapse min-w-[800px] text-[10px] text-stone-300 font-mono">
                    <thead>
                      <tr className="bg-stone-900 text-stone-400 border-b border-stone-850 text-left uppercase text-[8px] tracking-wider">
                        <th className="p-2 w-12 text-center">Nº</th>
                        <th className="p-2">Material / Serviço</th>
                        <th className="p-2 text-center w-28">Quant.</th>
                        <th className="p-2 text-center w-20">Unidade</th>
                        <th className="p-2 w-36">Fornecedor</th>
                        <th className="p-2 text-right w-24">Valor Unit.</th>
                        <th className="p-2 text-right w-24">Valor Total</th>
                        <th className="p-2 text-center w-24">Entrega</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-900">
                      {tempMaterials.map((tm, idx) => {
                        const rowTotal = (tm.quantityVal || 0) * (tm.unitValue || 0);
                        return (
                          <tr key={idx} className="hover:bg-stone-900/40">
                            <td className="p-2 text-center text-stone-500">{idx + 1}</td>
                            <td className="p-2 text-white font-sans font-medium">
                              <div>
                                <span>{tm.name}</span>
                                {tm.notes && (
                                  <span className="block text-[9px] text-stone-500 font-sans mt-0.5 italic">{tm.notes}</span>
                                )}
                              </div>
                            </td>
                            <td className="p-2 text-center text-stone-200 font-sans font-bold">{tm.quantityVal}</td>
                            <td className="p-2 text-center text-stone-400">{tm.quantityUnit || tm.unit || '-'}</td>
                            <td className="p-2 text-stone-300 font-sans truncate max-w-[120px]">{tm.supplier || 'Cotação'}</td>
                            <td className="p-2 text-right text-stone-400">{formatCurrency(tm.unitValue || 0)}</td>
                            <td className="p-2 text-right text-emerald-400 font-bold">{formatCurrency(rowTotal)}</td>
                            <td className="p-2 text-center text-stone-400 text-[9px]">{tm.deliveryDate || tm.deliveryDate || '-'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Save/Consolidate buttons */}
              <div className="flex flex-col sm:flex-row gap-2.5 pt-3 border-t border-stone-800 justify-end">
                <button
                  type="button"
                  onClick={() => {
                    if (confirm('Deseja realmente descartar este rascunho de extração?')) {
                      setIsPreviewOpen(false);
                      setTempMaterials(null);
                      setTempComment(null);
                      setAiMaterialsFile(null);
                      setGroupingSuggestions([]);
                      setMaterialsWarnings([]);
                    }
                  }}
                  className="bg-stone-800 hover:bg-stone-700 text-stone-300 py-2 px-4 text-[10px] font-mono uppercase tracking-wider transition-all cursor-pointer"
                >
                  Descartar Rascunho
                </button>
                <button
                  type="button"
                  onClick={() => handleConsolidateMaterials(false)}
                  className="bg-stone-700 hover:bg-stone-600 text-white py-2 px-4 text-[10px] font-mono uppercase tracking-wider transition-all cursor-pointer"
                >
                  Mesclar / Acrescentar à Obra
                </button>
                <button
                  type="button"
                  onClick={() => handleConsolidateMaterials(true)}
                  className="bg-emerald-700 hover:bg-emerald-600 text-white py-2 px-4 text-[10px] font-mono uppercase tracking-wider transition-all cursor-pointer font-bold flex items-center gap-1.5 justify-center"
                >
                  <CheckCircle size={12} />
                  Substituir Lista da Obra
                </button>
              </div>
            </div>
          )}

          {/* Elegant 2-Card Summary Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-stone-50 border border-stone-200 p-4 space-y-1">
              <span className="text-[9px] font-mono uppercase tracking-widest text-stone-400 block font-bold">Total de Itens Planejados</span>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-bold font-serif text-stone-900">{totalItems}</span>
                <span className="text-xs text-stone-500">materiais listados</span>
              </div>
            </div>

            <div className="bg-stone-50 border border-stone-200 p-4 space-y-1">
              <span className="text-[9px] font-mono uppercase tracking-widest text-stone-400 block font-bold">Valor Total Previsto de Suprimentos</span>
              <span className="text-xl font-bold font-mono text-stone-900 block">{formatCurrency(totalValue)}</span>
            </div>
          </div>

          {/* Search, Filter, and Action Row */}
          <div className="flex flex-col md:flex-row items-center justify-between gap-4 pt-1">
            <div className="flex items-center gap-2.5 w-full md:w-auto">
              <div className="relative w-full md:w-80">
                <span className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-stone-400">
                  <Search size={14} />
                </span>
                <input
                  type="text"
                  placeholder="Buscar material, fornecedor ou observações..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="bg-white border border-stone-250 pl-9 pr-4 py-1.5 text-xs focus:outline-none focus:border-stone-400 transition-all font-sans w-full placeholder-stone-400"
                />
              </div>
            </div>

            {/* Actions: Print & Add */}
            <div className="flex items-center gap-2 w-full md:w-auto self-stretch sm:self-auto justify-end">
              <button
                type="button"
                onClick={() => setIsPrintPreviewOpen(true)}
                className="bg-white hover:bg-stone-100 text-stone-800 border border-stone-300 py-1.5 px-4 text-[10px] font-mono uppercase tracking-wider font-bold transition-all shadow-sm flex items-center gap-1.5 cursor-pointer justify-center"
                title="Visualizar e Imprimir Relatório em A4 Retrato"
              >
                <Printer size={13} />
                <span>Imprimir (A4)</span>
              </button>

              <button
                type="button"
                onClick={handleStartAdd}
                className="bg-[#1E1E1E] hover:bg-stone-850 text-white py-1.5 px-4 text-[10px] font-mono uppercase tracking-wider font-bold transition-all shadow-sm flex items-center gap-1.5 cursor-pointer justify-center"
              >
                <Plus size={13} />
                <span>Adicionar Material</span>
              </button>
            </div>
          </div>

          {/* Form Card (Inline expandable) */}
          {isFormOpen && (
            <div className="bg-stone-50 border border-stone-200 p-5 space-y-4">
              <div className="flex justify-between items-center border-b border-stone-200 pb-2.5">
                <div>
                  <h4 className="font-serif text-xs font-bold text-stone-900 uppercase tracking-wide">
                    {editingItem ? '✏️ Editar Registro de Material' : '＋ Cadastrar Novo Material de Obra'}
                  </h4>
                  <p className="text-[10px] text-stone-500 mt-0.5">
                    Preencha os campos obrigatórios para compor a listagem físico-financeira de suprimentos.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="text-stone-400 hover:text-stone-700 font-bold text-sm cursor-pointer"
                >
                  ✕
                </button>
              </div>

              {formError && (
                <div className="bg-red-50 border border-red-200 text-red-800 p-2.5 text-[11px] font-mono flex items-start gap-2">
                  <span className="flex-shrink-0">⚠️</span>
                  <span>{formError}</span>
                </div>
              )}

              <form onSubmit={handleSave} className="space-y-4 text-xs font-sans">
                {/* Row 1: Material, Quantidade, Unidade, Fornecedor */}
                <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                  <div className="md:col-span-4">
                    <label className="block text-[8px] font-mono uppercase tracking-wider text-stone-500 font-bold mb-1">Material / Descrição *</label>
                    <input
                      type="text"
                      placeholder="Ex: Cimento CP II - Votoran"
                      className="w-full bg-white border border-stone-250 py-1.5 px-3 text-xs focus:outline-none focus:border-stone-400 rounded-none"
                      value={formInput.name}
                      onChange={(e) => setFormInput({ ...formInput, name: e.target.value })}
                      required
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-[8px] font-mono uppercase tracking-wider text-stone-500 font-bold mb-1">Quantidade *</label>
                    <input
                      type="number"
                      step="any"
                      placeholder="Ex: 50"
                      className="w-full bg-white border border-stone-250 py-1.5 px-3 text-xs focus:outline-none focus:border-stone-400 rounded-none"
                      value={formInput.quantityVal}
                      onChange={(e) => setFormInput({ ...formInput, quantityVal: e.target.value })}
                      required
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-[8px] font-mono uppercase tracking-wider text-stone-500 font-bold mb-1">Unidade</label>
                    <input
                      type="text"
                      placeholder="Ex: sacos, m², un"
                      className="w-full bg-white border border-stone-250 py-1.5 px-3 text-xs focus:outline-none focus:border-stone-400 rounded-none"
                      value={formInput.quantityUnit}
                      onChange={(e) => setFormInput({ ...formInput, quantityUnit: e.target.value })}
                    />
                  </div>

                  <div className="md:col-span-4">
                    <label className="block text-[8px] font-mono uppercase tracking-wider text-stone-500 font-bold mb-1">Fornecedor</label>
                    <input
                      type="text"
                      placeholder="Ex: Comercial Gerdau ou Portobello"
                      className="w-full bg-white border border-stone-250 py-1.5 px-3 text-xs focus:outline-none focus:border-stone-400 rounded-none"
                      value={formInput.supplier}
                      onChange={(e) => setFormInput({ ...formInput, supplier: e.target.value })}
                    />
                  </div>
                </div>

                {/* Row 2: Valor Unitário, Valor Total (Read-only), Data do Pedido, Data de Entrega */}
                <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                  <div className="md:col-span-3">
                    <label className="block text-[8px] font-mono uppercase tracking-wider text-stone-500 font-bold mb-1">Valor Unitário (R$)</label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="Ex: 35.00"
                      className="w-full bg-white border border-stone-250 py-1.5 px-3 text-xs focus:outline-none focus:border-stone-400 font-mono rounded-none"
                      value={formInput.unitValue}
                      onChange={(e) => setFormInput({ ...formInput, unitValue: e.target.value })}
                    />
                  </div>

                  <div className="md:col-span-3">
                    <label className="block text-[8px] font-mono uppercase tracking-wider text-stone-500 font-bold mb-1">Valor Total (R$)</label>
                    <div className="w-full bg-stone-100 border border-stone-250 py-1.5 px-3 text-xs font-mono font-bold text-stone-700 select-all">
                      {formatCurrency(liveTotal)}
                    </div>
                  </div>

                  <div className="md:col-span-3">
                    <label className="block text-[8px] font-mono uppercase tracking-wider text-stone-500 font-bold mb-1">Data do Pedido (Compra)</label>
                    <input
                      type="date"
                      className="w-full bg-white border border-stone-250 py-1.5 px-3 text-xs focus:outline-none focus:border-stone-400 font-mono rounded-none"
                      value={formInput.orderDate}
                      onChange={(e) => setFormInput({ ...formInput, orderDate: e.target.value })}
                    />
                  </div>

                  <div className="md:col-span-3">
                    <label className="block text-[8px] font-mono uppercase tracking-wider text-stone-500 font-bold mb-1">Expectativa de Entrega</label>
                    <input
                      type="date"
                      className="w-full bg-white border border-stone-250 py-1.5 px-3 text-xs focus:outline-none focus:border-stone-400 font-mono rounded-none"
                      value={formInput.deliveryDate}
                      onChange={(e) => setFormInput({ ...formInput, deliveryDate: e.target.value })}
                    />
                  </div>
                </div>

                {/* Notes textarea */}
                <div>
                  <label className="block text-[8px] font-mono uppercase tracking-wider text-stone-500 font-bold mb-1">Observações / Notas</label>
                  <textarea
                    rows={2}
                    placeholder="Ex: Detalhes de entrega, contato do fornecedor, ou especificações técnicas adicionais."
                    className="w-full bg-white border border-stone-250 py-1.5 px-3 text-xs focus:outline-none focus:border-stone-400 resize-none rounded-none"
                    value={formInput.notes}
                    onChange={(e) => setFormInput({ ...formInput, notes: e.target.value })}
                  />
                </div>

                <div className="flex justify-end gap-2 border-t border-stone-200 pt-3">
                  <button
                    type="button"
                    onClick={() => setIsFormOpen(false)}
                    className="bg-stone-150 hover:bg-stone-200 text-stone-700 py-1.5 px-4 font-mono text-[9px] uppercase tracking-wider transition-all cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="bg-stone-900 hover:bg-stone-850 text-white py-1.5 px-5 font-mono text-[9px] uppercase tracking-wider font-bold transition-all cursor-pointer"
                  >
                    {editingItem ? 'Salvar Alterações' : 'Salvar Material'}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Table of Materials */}
          <div className="overflow-x-auto border border-stone-200">
            {filteredMaterials.length === 0 ? (
              <div className="text-center py-12 text-stone-400 text-xs italic bg-white font-serif">
                {searchTerm 
                  ? 'Nenhum material encontrado com o filtro inserido.' 
                  : 'Nenhum material cadastrado para esta obra de planejamento. Cadastre o primeiro item acima.'}
              </div>
            ) : (
              <table className="w-full border-collapse min-w-[900px] text-[11px] text-stone-800">
                <thead>
                  <tr className="bg-stone-100 text-[8px] font-mono uppercase tracking-wider text-stone-500 border-b border-stone-200 text-left">
                    <th className="p-3 font-bold w-16 text-center">Nº</th>
                    <th className="p-3 font-bold w-60">Material / Insumo</th>
                    <th className="p-3 font-bold w-32 text-center">Quantidade</th>
                    <th className="p-3 font-bold w-40">Fornecedor</th>
                    <th className="p-3 font-bold w-32 text-right">Valor Unitário</th>
                    <th className="p-3 font-bold w-32 text-right">Valor Total</th>
                    <th className="p-3 font-bold w-28 text-center">Data do Pedido</th>
                    <th className="p-3 font-bold w-28 text-center">Data de Entrega</th>
                    <th className="p-3 font-bold w-20 text-center">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-150 bg-white">
                  {filteredMaterials.map((item, index) => {
                    const parsedQty = parseQuantityStr(item.quantity);
                    const qtyVal = parsedQty.value;
                    const qtyUnit = item.unit || parsedQty.unit;
                    
                    // Unit value resolution (with backwards compatibility fallback)
                    const unitValue = item.unitValue !== undefined 
                      ? item.unitValue 
                      : (item.estimatedValue / (qtyVal || 1));

                    // Total value calculation
                    const totalValue = item.estimatedValue;

                    return (
                      <tr key={item.id} className="hover:bg-stone-50/40 transition-all align-middle">
                        {/* Nº do item (1-indexed based on filtered array index) */}
                        <td className="p-3 text-center font-mono text-stone-500 text-[10px]">
                          {index + 1}
                        </td>

                        {/* Material name and notes snippet below it */}
                        <td className="p-3 font-serif leading-normal">
                          <span className="font-bold text-stone-900 block">{item.name}</span>
                          {item.notes && (
                            <span className="text-[10px] text-stone-400 block mt-0.5 truncate max-w-xs font-sans" title={item.notes}>
                              {item.notes}
                            </span>
                          )}
                        </td>

                        {/* Quantidade (value + unit) */}
                        <td className="p-3 text-center text-stone-700 font-sans font-medium">
                          <span className="font-semibold">{qtyVal}</span> {qtyUnit && <span className="text-stone-500 text-[10px] ml-0.5">{qtyUnit}</span>}
                        </td>

                        {/* Fornecedor */}
                        <td className="p-3 text-stone-700 truncate max-w-[140px]" title={item.supplier}>
                          {item.supplier || <span className="text-stone-300 italic">Não informado</span>}
                        </td>

                        {/* Valor Unitário */}
                        <td className="p-3 text-right font-mono text-stone-600">
                          {formatCurrency(unitValue)}
                        </td>

                        {/* Valor Total */}
                        <td className="p-3 text-right font-mono font-semibold text-stone-900">
                          {formatCurrency(totalValue)}
                        </td>

                        {/* Data do Pedido */}
                        <td className="p-3 text-center font-mono text-stone-600 text-[10px]">
                          {item.orderDate || <span className="text-stone-300">-</span>}
                        </td>

                        {/* Data de Entrega */}
                        <td className="p-3 text-center font-mono text-stone-600 text-[10px]">
                          {item.deliveryDate || <span className="text-stone-300">Não def.</span>}
                        </td>

                        {/* Ações */}
                        <td className="p-3">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleStartEdit(item)}
                              className="text-stone-500 hover:text-stone-900 p-1 cursor-pointer transition-all hover:bg-stone-100"
                              title="Editar material"
                            >
                              <Edit3 size={12} />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(item.id)}
                              className="text-stone-400 hover:text-rose-700 p-1 cursor-pointer transition-all hover:bg-stone-100"
                              title="Excluir material"
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
            )}
          </div>
        </div>
      )}

      {/* A4 Portrait Print Preview Modal */}
      {isPrintPreviewOpen && (
        <div className="fixed inset-0 z-50 bg-stone-900/80 backdrop-blur-xs overflow-y-auto p-4 md:p-8 flex flex-col items-center justify-start print-root-container print:p-0 print:bg-white print:static print:overflow-visible">
          
          {/* Print controls header (hidden in print) */}
          <div className="w-full max-w-[210mm] bg-white border border-stone-200 p-4 mb-4 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-md print:hidden font-sans">
            <div className="text-left">
              <h4 className="font-serif text-sm font-bold text-stone-900 flex items-center gap-2">
                <Printer size={16} /> Visualização de Impressão A4 Retrato
              </h4>
              <p className="text-[10px] text-stone-500 mt-0.5">
                Layout formatado com cabeçalho oficial para impressão A4 ou exportação direta para PDF.
              </p>
            </div>
            
            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              <button
                type="button"
                onClick={() => setIsPrintPreviewOpen(false)}
                className="bg-stone-100 hover:bg-stone-200 text-stone-700 py-1.5 px-4 text-[10px] font-mono uppercase tracking-wider transition-all cursor-pointer border border-stone-250 font-bold"
              >
                Voltar à Obra
              </button>
              
              <button
                type="button"
                onClick={() => {
                  window.print();
                }}
                className="bg-stone-900 hover:bg-stone-850 text-white py-1.5 px-5 text-[10px] font-mono uppercase tracking-wider font-bold transition-all cursor-pointer flex items-center gap-1.5"
              >
                <Printer size={13} />
                <span>Imprimir / Gerar PDF</span>
              </button>
            </div>
          </div>

          {/* Printable A4 Sheet container */}
          <div 
            id="a4-print-area"
            className="w-full max-w-[210mm] min-h-[297mm] bg-white text-stone-900 p-[15mm] md:p-[20mm] shadow-2xl relative text-left border border-stone-200 flex flex-col justify-between print:shadow-none print:border-none print:p-0 print:m-0 print:w-full print:min-h-0"
            style={{ boxSizing: "border-box" }}
          >
            {/* Custom Print Style Injection */}
            <style dangerouslySetInnerHTML={{ __html: `
              @media print {
                body {
                  background: white !important;
                  color: black !important;
                }
                /* Hide everything in the whole app except our modal and its print area */
                #root > div:not(.print-root-container),
                .fixed:not(.print-root-container),
                header, nav, footer, sidebar, button, .print\\:hidden {
                  display: none !important;
                }
                /* Ensure modal container fills viewport without scrollbars */
                .print-root-container {
                  position: absolute !important;
                  left: 0 !important;
                  top: 0 !important;
                  width: 100% !important;
                  height: auto !important;
                  padding: 0 !important;
                  margin: 0 !important;
                  background: white !important;
                  overflow: visible !important;
                  z-index: 9999999 !important;
                }
                #a4-print-area {
                  width: 100% !important;
                  max-width: 100% !important;
                  min-height: 0 !important;
                  padding: 0 !important;
                  margin: 0 !important;
                  border: none !important;
                  box-shadow: none !important;
                  background: white !important;
                  color: black !important;
                }
                @page {
                  size: A4 portrait;
                  margin: 15mm;
                }
              }
            `}} />

            {/* Inner Content wrapper */}
            <div className="space-y-6">
              
              {/* Formal Header Block */}
              <div className="border-b-2 border-stone-900 pb-4">
                <div className="flex justify-between items-start gap-4">
                  <div>
                    <h1 className="font-serif text-lg font-extrabold uppercase tracking-wide text-stone-950">
                      Chaves Brites Correa Construtora
                    </h1>
                    <p className="text-[9px] font-mono uppercase tracking-widest text-stone-500 mt-0.5">
                      Planejamento, Gestão e Engenharia de Obras
                    </p>
                  </div>
                  <div className="text-right font-mono text-[9px] text-stone-500 space-y-0.5">
                    <div>CHAVES BRITES CORREA CONSTRUTORA LTDA</div>
                    <div>CONTROLE DE SUPRIMENTOS FÍSICO-FINANCEIRO</div>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-y-2 items-center justify-between text-[10px] border-t border-stone-200 pt-3 text-stone-850 font-sans">
                  <div>
                    <span className="font-bold">Obra / Projeto:</span> {projectName}
                  </div>
                  <div>
                    <span className="font-bold">Data de Emissão:</span> {new Date().toLocaleDateString('pt-BR')}
                  </div>
                  <div>
                    <span className="font-bold">Status:</span> PLANEJAMENTO ATIVO
                  </div>
                </div>
              </div>

              {/* Title Section */}
              <div className="text-center py-2 bg-stone-50 border-y border-stone-200">
                <h2 className="font-serif text-xs font-bold uppercase tracking-wider text-stone-900">
                  Relatório Oficial de Planejamento de Materiais
                </h2>
              </div>

              {/* Summary stats block */}
              <div className="grid grid-cols-3 gap-4 bg-stone-50/50 p-3 border border-stone-200 text-xs">
                <div>
                  <span className="block text-[8px] font-mono uppercase text-stone-400 font-bold">Total de Itens</span>
                  <span className="font-serif font-bold text-stone-900 text-sm">{totalItems} materiais</span>
                </div>
                <div>
                  <span className="block text-[8px] font-mono uppercase text-stone-400 font-bold">Orçamento Total Previsto</span>
                  <span className="font-mono font-bold text-stone-950 text-sm">{formatCurrency(totalValue)}</span>
                </div>
                <div>
                  <span className="block text-[8px] font-mono uppercase text-stone-400 font-bold">Responsabilidade</span>
                  <span className="font-sans font-medium text-stone-700 text-[11px]">Chaves Brites Correa Construtora</span>
                </div>
              </div>

              {/* Printable Table */}
              <div className="space-y-1">
                <table className="w-full border-collapse text-[10px] text-stone-900 font-sans">
                  <thead>
                    <tr className="bg-stone-100 text-[8px] font-mono uppercase tracking-wider text-stone-600 border-b border-stone-200 text-left">
                      <th className="p-2 font-bold w-12 text-center border border-stone-200">Nº</th>
                      <th className="p-2 font-bold border border-stone-200">Material / Insumo</th>
                      <th className="p-2 font-bold w-24 text-center border border-stone-200">Quantidade</th>
                      <th className="p-2 font-bold w-36 border border-stone-200">Fornecedor</th>
                      <th className="p-2 font-bold w-24 text-right border border-stone-200">Unitário</th>
                      <th className="p-2 font-bold w-24 text-right border border-stone-200">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-200">
                    {filteredMaterials.map((item, index) => {
                      const parsedQty = parseQuantityStr(item.quantity);
                      const qtyVal = parsedQty.value;
                      const qtyUnit = item.unit || parsedQty.unit;
                      const unitValue = item.unitValue !== undefined 
                        ? item.unitValue 
                        : (item.estimatedValue / (qtyVal || 1));

                      return (
                        <tr key={item.id} className="align-top">
                          <td className="p-2 text-center font-mono text-stone-500 border border-stone-200">
                            {index + 1}
                          </td>
                          <td className="p-2 border border-stone-200">
                            <span className="font-bold text-stone-950 block text-[11px]">{item.name}</span>
                            {item.notes && (
                              <span className="text-[9px] text-stone-500 block mt-0.5 font-sans leading-normal">
                                {item.notes}
                              </span>
                            )}
                          </td>
                          <td className="p-2 text-center border border-stone-200 font-sans">
                            <span className="font-semibold text-stone-900">{qtyVal}</span> {qtyUnit && <span className="text-stone-500 text-[9px]">{qtyUnit}</span>}
                          </td>
                          <td className="p-2 border border-stone-200 text-stone-700 truncate max-w-[120px]">
                            {item.supplier || <span className="text-stone-300 italic">Não informado</span>}
                          </td>
                          <td className="p-2 text-right font-mono text-stone-600 border border-stone-200">
                            {formatCurrency(unitValue)}
                          </td>
                          <td className="p-2 text-right font-mono font-bold text-stone-900 border border-stone-200">
                            {formatCurrency(item.estimatedValue)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-stone-50 font-bold">
                      <td colSpan={4} className="p-2 text-right text-stone-700 uppercase text-[8px] font-mono border border-stone-200">
                        Total Geral Previsto:
                      </td>
                      <td colSpan={2} className="p-2 text-right font-mono text-stone-950 text-[11px] border border-stone-200">
                        {formatCurrency(totalValue)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

            </div>

            {/* Formal Signature Footers for A4 */}
            <div className="pt-12 space-y-8 mt-12">
              <div className="grid grid-cols-2 gap-8 text-[9px] font-sans text-center">
                <div className="space-y-1">
                  <div className="border-t border-stone-400 pt-1.5 w-48 mx-auto text-stone-700">
                    Engenheiro Responsável
                  </div>
                  <div className="text-stone-400 text-[8px] font-mono">Chaves Brites Correa Construtora</div>
                </div>
                <div className="space-y-1">
                  <div className="border-t border-stone-400 pt-1.5 w-48 mx-auto text-stone-700">
                    Gestor de Suprimentos / Compras
                  </div>
                  <div className="text-stone-400 text-[8px] font-mono">Chaves Brites Correa Construtora</div>
                </div>
              </div>

              <div className="border-t border-stone-200 pt-3 flex justify-between items-center text-[8px] font-mono text-stone-400">
                <div>Chaves Brites Correa Construtora • Gestão Físico-Financeira de Obras de Alto Padrão</div>
                <div>Página 1 de 1</div>
              </div>
            </div>

          </div>

        </div>
      )}

      {/* Interactive Camera Modal Overlay */}
      {isCameraActive && (
        <div className="fixed inset-0 z-50 bg-black/95 backdrop-blur-sm flex flex-col items-center justify-center p-4">
          <div className="relative w-full max-w-md bg-stone-900 border border-stone-800 p-6 space-y-4 flex flex-col items-center">
            {/* Header */}
            <div className="w-full flex items-center justify-between border-b border-stone-800 pb-3">
              <div className="flex items-center gap-2">
                <Camera className="text-stone-400 animate-pulse" size={16} />
                <span className="font-mono text-xs text-stone-300 uppercase tracking-wider font-bold text-left font-sans">Captura de Lista de Materiais</span>
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
                  <span className="text-red-500 font-bold block text-2xl">⚠️</span>
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
                      Alinhe a lista de materiais aqui
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
};
