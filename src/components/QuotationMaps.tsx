import React, { useState, useEffect, useRef } from 'react';
import { 
  ClipboardList, 
  CheckCircle2, 
  Trash2, 
  Plus, 
  FileImage, 
  Phone, 
  Mail, 
  Truck, 
  Calendar, 
  ShieldCheck, 
  AlertCircle, 
  ThumbsUp, 
  Check, 
  Edit, 
  X,
  FileDown,
  ChevronRight,
  TrendingUp,
  Award,
  Loader2,
  Paperclip,
  ExternalLink,
  Folder,
  Sparkles,
  Upload,
  Printer,
  Camera,
  Search,
  Star,
  Tag,
  Users,
  RefreshCw
} from 'lucide-react';
import { Project, QuotationMap, QuotationItem, QuotationSupplier, Transaction, TransactionCategory } from '../types';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { subscribeCollection, saveDoc, removeDoc } from '../lib/firebaseDb';
import { uploadBase64ToFirebase } from '../lib/firebaseStorage';
import { getTelegramConfig, buildTelegramFileName } from '../lib/telegramService';
import { initAuth, googleSignIn, getAccessToken } from '../lib/firebaseAuth';
import { User as FirebaseUser } from 'firebase/auth';

// ----------------------------------------------------
// OKLCH TO RGB CONVERTER & CSS SANITIZER FOR HTML2CANVAS
// ----------------------------------------------------
function oklchToRgb(l_ok: number, c_ok: number, h_ok: number) {
  const h_rad = (h_ok * Math.PI) / 180;
  const a = c_ok * Math.cos(h_rad);
  const b = c_ok * Math.sin(h_rad);

  const L_ = l_ok + 0.3963377774 * a + 0.2158037573 * b;
  const M_ = l_ok - 0.1055613458 * a - 0.0638541728 * b;
  const S_ = l_ok - 0.0894841775 * a - 1.2914855480 * b;

  const l = L_ * L_ * L_;
  const m = M_ * M_ * M_;
  const s = S_ * S_ * S_;

  const r = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const b_val = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;

  const fn = (c: number) => {
    const abs = Math.abs(c);
    const res = abs > 0.0031308 ? 1.055 * Math.pow(abs, 1 / 2.4) - 0.055 : 12.92 * abs;
    return Math.min(255, Math.max(0, Math.round((c < 0 ? -res : res) * 255)));
  };

  return {
    r: fn(r),
    g: fn(g),
    b: fn(b_val)
  };
}

function convertOklchContentToRgb(content: string): string {
  try {
    const numMatches = content.match(/[-+]?[0-9]*\.?[0-9]+/g);
    if (numMatches && numMatches.length >= 3) {
      const l = parseFloat(numMatches[0]);
      const c = parseFloat(numMatches[1]);
      const h = parseFloat(numMatches[2]);
      
      const rgb = oklchToRgb(l, c, h);
      
      const parts = content.split('/');
      if (parts.length > 1) {
        const alphaPart = parts[1].trim();
        const alphaFloatMatches = alphaPart.match(/[-+]?[0-9]*\.?[0-9]+/);
        if (alphaFloatMatches && !alphaPart.includes('var')) {
          let alphaVal = parseFloat(alphaFloatMatches[0]);
          if (alphaPart.includes('%')) {
            alphaVal = alphaVal / 100;
          }
          if (!isNaN(alphaVal)) {
            return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alphaVal})`;
          }
        }
      }
      return `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
    }
  } catch (e) {
    console.error('Error converting oklch content:', content, e);
  }
  return 'rgb(128,128,128)';
}

function oklabToRgb(l_ok: number, a: number, b: number) {
  const L_ = l_ok + 0.3963377774 * a + 0.2158037573 * b;
  const M_ = l_ok - 0.1055613458 * a - 0.0638541728 * b;
  const S_ = l_ok - 0.0894841775 * a - 1.2914855480 * b;

  const l = L_ * L_ * L_;
  const m = M_ * M_ * M_;
  const s = S_ * S_ * S_;

  const r = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const b_val = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;

  const fn = (c: number) => {
    const abs = Math.abs(c);
    const res = abs > 0.0031308 ? 1.055 * Math.pow(abs, 1 / 2.4) - 0.055 : 12.92 * abs;
    return Math.min(255, Math.max(0, Math.round((c < 0 ? -res : res) * 255)));
  };

  return {
    r: fn(r),
    g: fn(g),
    b: fn(b_val)
  };
}

function convertOklabContentToRgb(content: string): string {
  try {
    const numMatches = content.match(/[-+]?[0-9]*\.?[0-9]+/g);
    if (numMatches && numMatches.length >= 3) {
      const l = parseFloat(numMatches[0]);
      const a = parseFloat(numMatches[1]);
      const b = parseFloat(numMatches[2]);
      
      const rgb = oklabToRgb(l, a, b);
      
      const parts = content.split('/');
      if (parts.length > 1) {
        const alphaPart = parts[1].trim();
        const alphaFloatMatches = alphaPart.match(/[-+]?[0-9]*\.?[0-9]+/);
        if (alphaFloatMatches && !alphaPart.includes('var')) {
          let alphaVal = parseFloat(alphaFloatMatches[0]);
          if (alphaPart.includes('%')) {
            alphaVal = alphaVal / 100;
          }
          if (!isNaN(alphaVal)) {
            return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alphaVal})`;
          }
        }
      }
      return `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
    }
  } catch (e) {
    console.error('Error converting oklab content:', content, e);
  }
  return 'rgb(128,128,128)';
}

function replaceModernColors(cssText: string): string {
  let result = '';
  let i = 0;
  while (i < cssText.length) {
    if (cssText.substring(i, i + 6) === 'oklch(') {
      let parenCount = 1;
      const start = i + 6;
      let j = start;
      while (j < cssText.length && parenCount > 0) {
        if (cssText[j] === '(') parenCount++;
        else if (cssText[j] === ')') parenCount--;
        j++;
      }
      const inside = cssText.substring(start, j - 1);
      const converted = convertOklchContentToRgb(inside);
      result += converted;
      i = j;
    } else if (cssText.substring(i, i + 6) === 'oklab(') {
      let parenCount = 1;
      const start = i + 6;
      let j = start;
      while (j < cssText.length && parenCount > 0) {
        if (cssText[j] === '(') parenCount++;
        else if (cssText[j] === ')') parenCount--;
        j++;
      }
      const inside = cssText.substring(start, j - 1);
      const converted = convertOklabContentToRgb(inside);
      result += converted;
      i = j;
    } else {
      result += cssText[i];
      i++;
    }
  }
  return result;
}

function getSanitizedCss(): string {
  let cssText = '';
  try {
    for (let i = 0; i < document.styleSheets.length; i++) {
      const sheet = document.styleSheets[i];
      try {
        const rules = sheet.cssRules || sheet.rules;
        if (!rules) continue;
        for (let j = 0; j < rules.length; j++) {
          cssText += rules[j].cssText + '\n';
        }
      } catch (e) {
        // Handle cross-origin or unavailable sheets gracefully
        console.warn('Could not read rules from sheet:', sheet.href, e);
      }
    }
  } catch (e) {
    console.error('Error reading document styleSheets:', e);
  }
  
  if (cssText) {
    return replaceModernColors(cssText);
  }
  return '';
}

function sanitizeDocumentOklch(clonedDoc: Document) {
  // Get all clean CSS from the active document styleSheets
  const cleanCss = getSanitizedCss();
  
  // Remove all existing link tags (external styles) and style tags in clonedDoc to prevent html2canvas from parsing or fetching them
  const links = clonedDoc.getElementsByTagName('link');
  for (let i = links.length - 1; i >= 0; i--) {
    const link = links[i];
    if (link.getAttribute('rel') === 'stylesheet') {
      link.parentNode?.removeChild(link);
    }
  }
  
  const styles = clonedDoc.getElementsByTagName('style');
  for (let i = styles.length - 1; i >= 0; i--) {
    styles[i].parentNode?.removeChild(styles[i]);
  }
  
  // Create a single clean style tag with all sanitized CSS
  if (cleanCss) {
    const cleanStyleEl = clonedDoc.createElement('style');
    cleanStyleEl.textContent = cleanCss;
    clonedDoc.head.appendChild(cleanStyleEl);
  }

  // Also replace inline styles on all elements
  const allElements = clonedDoc.getElementsByTagName('*');
  for (let i = 0; i < allElements.length; i++) {
    const el = allElements[i] as HTMLElement;
    if (el && typeof el.getAttribute === 'function') {
      try {
        const styleAttr = el.getAttribute('style');
        if (styleAttr && (styleAttr.includes('oklch') || styleAttr.includes('oklab'))) {
          el.setAttribute('style', replaceModernColors(styleAttr));
        }
      } catch (e) {}
    }
  }
}

function sanitizeMainDocumentStyles() {
  try {
    const styleElements = document.getElementsByTagName('style');
    for (let i = 0; i < styleElements.length; i++) {
      const styleEl = styleElements[i];
      if (styleEl.textContent && (styleEl.textContent.includes('oklch') || styleEl.textContent.includes('oklab'))) {
        styleEl.textContent = replaceModernColors(styleEl.textContent);
      }
    }
  } catch (e) {
    console.error('Error sanitizing main document styles:', e);
  }
}

export interface UnifiedSupplier {
  id: string;
  name: string;
  phone: string;
  email: string;
  paymentTerms: string;
  deliveryFee: number;
  deliveryTime: string;
  category?: string;
  isFavorite?: boolean;
  useCount?: number;
}

export interface UnifiedMaterial {
  id: string;
  name: string;
  unit: string;
  averageValue: number;
  totalQuantityPaid: number;
  totalSpent: number;
  lastUpdated: string;
  records: {
    projectId: string;
    projectName: string;
    supplier: string;
    date: string;
    quantity: number;
    unitValue: number;
  }[];
}

function normalizeSupplierName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, ' ');
}

function normalizeMaterialName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[-_./\\()]/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

interface QuotationMapsProps {
  projectId: string;
  project?: Project;
  readOnly?: boolean;
  clientName?: string;
  addTransaction?: (tx: Transaction) => void;
}

export default function QuotationMaps({
  projectId,
  project,
  readOnly = false,
  clientName = "Cliente",
  addTransaction
}: QuotationMapsProps) {
  const [maps, setMapsState] = useState<QuotationMap[]>([]);
  const [selectedMapId, setSelectedMapId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportingPDF, setExportingPDF] = useState(false);

  // Sub-tab Navigation state
  const [activeSubTab, setActiveSubTab] = useState<'maps' | 'suppliers' | 'materials'>('maps');
  const [unifiedSuppliers, setUnifiedSuppliersState] = useState<UnifiedSupplier[]>([]);
  const [unifiedMaterials, setUnifiedMaterialsState] = useState<UnifiedMaterial[]>([]);
  const [supplierSearchQuery, setSupplierSearchQuery] = useState('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState('');
  const [materialSearchQuery, setMaterialSearchQuery] = useState('');

  // Load Unified Databases from Firestore or seed defaults
  useEffect(() => {
    const demoSups = [
      {
        id: 'sup-1',
        name: 'Depósito Vale do Paraíba',
        phone: '(11) 98111-2233',
        email: 'vendas@depositovale.com.br',
        paymentTerms: 'Boleto Faturado 30 dias',
        deliveryFee: 120,
        deliveryTime: 'Até 48 horas',
      },
      {
        id: 'sup-2',
        name: 'Silva Materiais de Construção',
        phone: '(11) 97444-5566',
        email: 'silva.materiais@terra.com.br',
        paymentTerms: 'Pix (5% Desconto)',
        deliveryFee: 150,
        deliveryTime: 'Entrega Imediata',
      },
      {
        id: 'sup-3',
        name: 'Central da Construção',
        phone: '(11) 96555-7788',
        email: 'orcamentos@centralconstrucao.com',
        paymentTerms: 'À Vista no Dinheiro/Pix',
        deliveryFee: 80,
        deliveryTime: '3 dias úteis',
      }
    ];

    const defaultMats: UnifiedMaterial[] = [
      {
        id: 'mat-1',
        name: 'Cimento CP-II (50kg)',
        unit: 'Saco',
        averageValue: 32.50,
        totalQuantityPaid: 150,
        totalSpent: 4875.00,
        lastUpdated: new Date().toISOString().split('T')[0],
        records: [
          {
            projectId: projectId,
            projectName: project?.name || 'Reforma Clínica OralMed',
            supplier: 'Depósito Vale do Paraíba',
            date: new Date().toISOString().split('T')[0],
            quantity: 100,
            unitValue: 32.00
          },
          {
            projectId: projectId,
            projectName: project?.name || 'Reforma Clínica OralMed',
            supplier: 'Central da Construção',
            date: new Date().toISOString().split('T')[0],
            quantity: 50,
            unitValue: 33.50
          }
        ]
      },
      {
        id: 'mat-2',
        name: 'Areia Fina Lavada',
        unit: 'm³',
        averageValue: 120.00,
        totalQuantityPaid: 20,
        totalSpent: 2400.00,
        lastUpdated: new Date().toISOString().split('T')[0],
        records: [
          {
            projectId: projectId,
            projectName: project?.name || 'Reforma Clínica OralMed',
            supplier: 'Silva Materiais de Construção',
            date: new Date().toISOString().split('T')[0],
            quantity: 10,
            unitValue: 110.00
          },
          {
            projectId: projectId,
            projectName: project?.name || 'Reforma Clínica OralMed',
            supplier: 'Depósito Vale do Paraíba',
            date: new Date().toISOString().split('T')[0],
            quantity: 10,
            unitValue: 130.00
          }
        ]
      }
    ];

    const defaultMap: QuotationMap = {
      id: `map-demo-${Date.now()}`,
      projectId: projectId,
      number: 1,
      title: 'Cotação de Cimento e Areia - Fase de Reboco',
      date: new Date().toISOString().split('T')[0],
      status: 'pendente',
      items: [
        { id: '1', name: 'Cimento CP-II (50kg)', unit: 'Saco', quantity: 50 },
        { id: '2', name: 'Areia Fina Lavada', unit: 'm³', quantity: 10 }
      ],
      suppliers: [
        {
          id: 'sup-1',
          name: 'Depósito Vale do Paraíba',
          phone: '(11) 98111-2233',
          email: 'vendas@depositovale.com.br',
          paymentTerms: 'Boleto Faturado 30 dias',
          deliveryFee: 120,
          deliveryTime: 'Até 48 horas',
          itemPrices: { '1': 32.00, '2': 125.00 }
        },
        {
          id: 'sup-2',
          name: 'Silva Materiais de Construção',
          phone: '(11) 97444-5566',
          email: 'silva.materiais@terra.com.br',
          paymentTerms: 'Pix (5% Desconto)',
          deliveryFee: 150,
          deliveryTime: 'Entrega Imediata',
          itemPrices: { '1': 34.50, '2': 110.00 }
        },
        {
          id: 'sup-3',
          name: 'Central da Construção',
          phone: '(11) 96555-7788',
          email: 'orcamentos@centralconstrucao.com',
          paymentTerms: 'À Vista no Dinheiro/Pix',
          deliveryFee: 80,
          deliveryTime: '3 dias úteis',
          itemPrices: { '1': 31.00, '2': 130.00 }
        }
      ],
      observations: 'Cotação para suprimento urgente de argamassa de reboco. Central de Construção possui o melhor preço geral.'
    };

    const unsubSuppliers = subscribeCollection('unified_suppliers', (data) => {
      setUnifiedSuppliersState(data.sort((a, b) => a.name.localeCompare(b.name)));
    }, demoSups, 'cbc_unified_suppliers');

    const unsubMaterials = subscribeCollection('unified_materials', (data) => {
      setUnifiedMaterialsState(data.sort((a, b) => a.name.localeCompare(b.name)));
    }, defaultMats, 'cbc_unified_materials');

    const unsubMaps = subscribeCollection('quotation_maps', (data) => {
      const projMaps = data.filter(m => m.projectId === projectId);
      setMapsState(projMaps);
      if (projMaps.length > 0) {
        setSelectedMapId(prev => prev || projMaps[0].id);
      }
    }, [defaultMap], 'cbc_quotation_maps_v3');

    return () => {
      unsubSuppliers();
      unsubMaterials();
      unsubMaps();
    };
  }, [projectId]);

  // Generic updater to Firestore helper
  const syncToFirestore = async (collectionName: string, prevList: any[], nextList: any[]) => {
    try {
      const prevIds = prevList.map(x => x.id);
      const nextIds = nextList.map(x => x.id);
      const deletedIds = prevIds.filter(id => !nextIds.includes(id));

      for (const id of deletedIds) {
        await removeDoc(collectionName, id);
      }

      for (const item of nextList) {
        const prevItem = prevList.find(x => x.id === item.id);
        if (!prevItem || JSON.stringify(prevItem) !== JSON.stringify(item)) {
          await saveDoc(collectionName, item.id, item);
        }
      }
    } catch (err) {
      console.error(`Erro ao sincronizar ${collectionName} com o Firestore:`, err);
    }
  };

  const setUnifiedSuppliers = (action: any) => {
    const nextList = typeof action === 'function' ? action(unifiedSuppliers) : action;
    setUnifiedSuppliersState(nextList);
    syncToFirestore('unified_suppliers', unifiedSuppliers, nextList);
  };

  const setUnifiedMaterials = (action: any) => {
    const nextList = typeof action === 'function' ? action(unifiedMaterials) : action;
    setUnifiedMaterialsState(nextList);
    syncToFirestore('unified_materials', unifiedMaterials, nextList);
  };

  const setMaps = (action: any) => {
    const nextList = typeof action === 'function' ? action(maps) : action;
    setMapsState(nextList);
    syncToFirestore('quotation_maps', maps, nextList);
  };

  const registerSuppliersInUnifiedDb = (sups: QuotationSupplier[]) => {
    let list = [...unifiedSuppliers];
    
    let updated = false;
    sups.forEach(s => {
      if (!s.name.trim()) return;
      const normalized = normalizeSupplierName(s.name);
      const existingIdx = list.findIndex(item => normalizeSupplierName(item.name) === normalized);
      
      if (existingIdx >= 0) {
        list[existingIdx] = {
          ...list[existingIdx],
          phone: s.phone || list[existingIdx].phone,
          email: s.email || list[existingIdx].email,
          paymentTerms: s.paymentTerms || list[existingIdx].paymentTerms,
          deliveryFee: s.deliveryFee > 0 ? s.deliveryFee : list[existingIdx].deliveryFee,
          deliveryTime: s.deliveryTime || list[existingIdx].deliveryTime
        };
        updated = true;
      } else {
        list.push({
          id: `sup-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
          name: s.name.trim(),
          phone: s.phone,
          email: s.email,
          paymentTerms: s.paymentTerms,
          deliveryFee: s.deliveryFee,
          deliveryTime: s.deliveryTime
        });
        updated = true;
      }
    });
    
    if (updated) {
      setUnifiedSuppliers(list.sort((a, b) => a.name.localeCompare(b.name)));
    }
  };

  const registerPaidMaterials = (
    items: { name: string; unit: string; quantity: number; unitValue: number; totalValue: number }[],
    projId: string,
    projName: string,
    supplier: string,
    date: string
  ) => {
    let list = [...unifiedMaterials];

    items.forEach(item => {
      if (!item.name.trim()) return;
      const normalized = normalizeMaterialName(item.name);
      const existingIdx = list.findIndex(m => normalizeMaterialName(m.name) === normalized);

      const record = {
        projectId: projId,
        projectName: projName,
        supplier: supplier,
        date: date,
        quantity: item.quantity,
        unitValue: item.unitValue
      };

      if (existingIdx >= 0) {
        const current = list[existingIdx];
        const newRecords = [...current.records, record];
        const newTotalSpent = current.totalSpent + item.totalValue;
        const newTotalQuantity = current.totalQuantityPaid + item.quantity;
        const newAvg = newTotalQuantity > 0 ? newTotalSpent / newTotalQuantity : 0;

        list[existingIdx] = {
          ...current,
          unit: item.unit || current.unit,
          averageValue: Number(newAvg.toFixed(2)),
          totalQuantityPaid: newTotalQuantity,
          totalSpent: Number(newTotalSpent.toFixed(2)),
          lastUpdated: date > current.lastUpdated ? date : current.lastUpdated,
          records: newRecords
        };
      } else {
        list.push({
          id: `mat-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
          name: item.name.trim(),
          unit: item.unit || 'UN',
          averageValue: item.unitValue,
          totalQuantityPaid: item.quantity,
          totalSpent: item.totalValue,
          lastUpdated: date,
          records: [record]
        });
      }
    });

    setUnifiedMaterials(list.sort((a, b) => a.name.localeCompare(b.name)));
  };

  const handleSupplierSelection = (supplierId: string, chosen: UnifiedSupplier) => {
    setFormSuppliers(prev => prev.map(s => {
      if (s.id === supplierId) {
        return {
          ...s,
          name: chosen.name,
          phone: chosen.phone || s.phone,
          email: chosen.email || s.email,
          paymentTerms: chosen.paymentTerms || s.paymentTerms,
          deliveryFee: chosen.deliveryFee > 0 ? chosen.deliveryFee : s.deliveryFee,
          deliveryTime: chosen.deliveryTime || s.deliveryTime
        };
      }
      return s;
    }));
  };

  // Auth and Google states
  const [googleUser, setGoogleUser] = useState<FirebaseUser | null>(null);
  const [googleAccessToken, setGoogleAccessToken] = useState<string | null>(null);
  const [googleIsLoggingIn, setGoogleIsLoggingIn] = useState(false);

  // Google Contacts and Custom Supplier Management States
  interface GoogleContact {
    resourceName: string;
    name: string;
    email?: string;
    phone?: string;
    category?: string;
    isLinked?: boolean;
  }
  const [googleContacts, setGoogleContacts] = useState<GoogleContact[]>([]);
  const [isFetchingContacts, setIsFetchingContacts] = useState(false);
  const [contactsError, setContactsError] = useState<string | null>(null);
  const [showGoogleContactsSyncPanel, setShowGoogleContactsSyncPanel] = useState(false);
  const [showAllSuppliers, setShowAllSuppliers] = useState(false);

  // Manual Creation form states
  const [showAddManualSupplier, setShowAddManualSupplier] = useState(false);
  const [newManualName, setNewManualName] = useState('');
  const [newManualPhone, setNewManualPhone] = useState('');
  const [newManualEmail, setNewManualEmail] = useState('');
  const [newManualPayment, setNewManualPayment] = useState('');
  const [newManualTime, setNewManualTime] = useState('');
  const [newManualCategory, setNewManualCategory] = useState('Materiais');

  // Supplier editing states
  const [isEditingSupplierId, setIsEditingSupplierId] = useState<string | null>(null);
  const [editSupplierName, setEditSupplierName] = useState('');
  const [editSupplierPhone, setEditSupplierPhone] = useState('');
  const [editSupplierEmail, setEditSupplierEmail] = useState('');
  const [editSupplierPayment, setEditSupplierPayment] = useState('');
  const [editSupplierTime, setEditSupplierTime] = useState('');
  const [editSupplierCategory, setEditSupplierCategory] = useState('');

  // NF File Attachment & AI states
  const [nfFile, setNfFile] = useState<{ name: string; type: string; base64: string } | null>(null);
  const [isParsingNf, setIsParsingNf] = useState(false);
  const [nfAiError, setNfAiError] = useState<string | null>(null);
  const [nfScannedData, setNfScannedData] = useState<{
    supplier: string;
    date: string;
    value: number;
    category: TransactionCategory;
    description: string;
    notes: string;
    invoiceNumber: string;
    items?: {
      name: string;
      unit: string;
      quantity: number;
      unitValue: number;
      totalValue: number;
    }[];
  } | null>(null);
  const [isUploadingNfToDrive, setIsUploadingNfToDrive] = useState(false);
  const [saveNfToDriveChecked, setSaveNfToDriveChecked] = useState(true);

  const nfFileInputRef = useRef<HTMLInputElement>(null);
  const cameraNfInputRef = useRef<HTMLInputElement>(null);

  // Material request attachment & AI states
  const [requestFile, setRequestFile] = useState<{ name: string; type: string; base64: string } | null>(null);
  const [isParsingRequest, setIsParsingRequest] = useState(false);
  const [requestAiError, setRequestAiError] = useState<string | null>(null);
  const [requestDriveFile, setRequestDriveFile] = useState<{ id: string; webViewLink: string } | null>(null);
  const [requestDriveError, setRequestDriveError] = useState<string | null>(null);

  const requestFileInputRef = useRef<HTMLInputElement>(null);
  const cameraRequestInputRef = useRef<HTMLInputElement>(null);

  const processSelectedRequestFile = (file: File) => {
    if (file.size > 5 * 1024 * 1024) {
      setRequestAiError('O tamanho do arquivo excede o limite de 5MB por documento.');
      return;
    }
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const base64String = reader.result as string;
      setRequestFile({
        name: file.name,
        type: file.type,
        base64: base64String,
      });
      triggerRequestAiScan(base64String, file.type, file.name);
    };
    reader.onerror = (error) => {
      console.error('Erro na leitura do arquivo:', error);
      setRequestAiError('Erro ao carregar o arquivo localmente.');
    };
  };

  const triggerRequestAiScan = async (base64: string, mimeType: string, name: string) => {
    setIsParsingRequest(true);
    setRequestAiError(null);
    setRequestDriveFile(null);
    setRequestDriveError(null);

    try {
      const cleanBase64 = base64.includes(';base64,') ? base64.split(';base64,')[1] : base64;
      
      const res = await fetch('/api/quotations/parse-material-request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fileBase64: cleanBase64,
          mimeType,
          fileName: name
        }),
      });

      if (!res.ok) {
        let serverMessage = 'Falha no servidor ao analisar a requisição de materiais.';
        try {
          const errJson = await res.json();
          if (errJson?.error) serverMessage = errJson.error;
        } catch {}
        throw new Error(serverMessage);
      }

      const responseData = await res.json();
      if (responseData.success && responseData.quotationData) {
        const { title, items } = responseData.quotationData;
        
        setRequestDriveFile(responseData.driveFile || null);
        setRequestDriveError(responseData.driveError || null);

        if (title) {
          setFormTitle(title);
        }

        if (items && items.length > 0) {
          const formattedItems = items.map((item: any, idx: number) => ({
            id: `item-${Date.now()}-${idx}`,
            name: item.name,
            unit: item.unit || 'UN',
            quantity: item.quantity || 1,
          }));

          setFormItems(formattedItems);

          // Update suppliers prices to 0 for these new items
          setFormSuppliers(prev => prev.map(sup => {
            const prices: Record<string, number> = {};
            formattedItems.forEach((item: any) => {
              prices[item.id] = 0;
            });
            return {
              ...sup,
              itemPrices: prices
            };
          }));
        }
        
        // Reset file state
        setRequestFile(null);
      } else {
        throw new Error(responseData.error || 'Não foi possível extrair a lista de materiais da imagem.');
      }
    } catch (err: any) {
      console.error('Erro ao analisar requisição com IA:', err);
      setRequestAiError(err.message || 'Houve um problema ao processar o arquivo com Inteligência Artificial.');
    } finally {
      setIsParsingRequest(false);
    }
  };

  const handleCancelRequestFile = () => {
    setRequestFile(null);
    setRequestAiError(null);
    if (requestFileInputRef.current) {
      requestFileInputRef.current.value = '';
    }
  };

  // Sanitize document styles on mount to ensure html2canvas has standard colors
  useEffect(() => {
    sanitizeMainDocumentStyles();
  }, []);

  // 1. Google Authentication Subscription
  useEffect(() => {
    const unsubscribe = initAuth(
      (firebaseUser, token) => {
        setGoogleUser(firebaseUser);
        setGoogleAccessToken(token);
      },
      () => {
        setGoogleUser(null);
        setGoogleAccessToken(null);
      }
    );
    return () => unsubscribe();
  }, []);

  // Form States for creation/editing
  const [formTitle, setFormTitle] = useState('');
  const [formDate, setFormDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [formObservations, setFormObservations] = useState('');
  const [formItems, setFormItems] = useState<QuotationItem[]>([
    { id: '1', name: 'Cimento CP-II (50kg)', unit: 'Saco', quantity: 50 },
    { id: '2', name: 'Areia Fina Lavada', unit: 'm³', quantity: 10 }
  ]);
  const [formSuppliers, setFormSuppliers] = useState<QuotationSupplier[]>([
    {
      id: 'sup-1',
      name: 'Depósito Vale do Paraíba',
      phone: '(11) 98111-2233',
      email: 'vendas@depositovale.com.br',
      paymentTerms: 'Boleto Faturado 30 dias',
      deliveryFee: 120,
      deliveryTime: 'Até 48 horas',
      itemPrices: { '1': 32.00, '2': 125.00 }
    },
    {
      id: 'sup-2',
      name: 'Silva Materiais de Construção',
      phone: '(11) 97444-5566',
      email: 'silva.materiais@terra.com.br',
      paymentTerms: 'Pix (5% Desconto)',
      deliveryFee: 150,
      deliveryTime: 'Entrega Imediata',
      itemPrices: { '1': 34.50, '2': 110.00 }
    },
    {
      id: 'sup-3',
      name: 'Central da Construção',
      phone: '(11) 96555-7788',
      email: 'orcamentos@centralconstrucao.com',
      paymentTerms: 'À Vista no Dinheiro/Pix',
      deliveryFee: 80,
      deliveryTime: '3 dias úteis',
      itemPrices: { '1': 31.00, '2': 130.00 }
    }
  ]);

  // Temporary item inputs
  const [newItemName, setNewItemName] = useState('');
  const [newItemUnit, setNewItemUnit] = useState('Saco');
  const [newItemQty, setNewItemQty] = useState<number>(1);

  const captureRef = useRef<HTMLDivElement>(null);

  // 1. Initial Load and Save Local Storage
  const saveMapsToStorage = (newProjectMaps: QuotationMap[]) => {
    setMaps(newProjectMaps);
    if (newProjectMaps.length > 0 && !selectedMapId) {
      setSelectedMapId(newProjectMaps[0].id);
    }

    // Sync suppliers with unified database
    newProjectMaps.forEach(m => {
      registerSuppliersInUnifiedDb(m.suppliers);
    });
  };

  const handleNfFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    processSelectedNfFile(file);
  };

  const processSelectedNfFile = (file: File) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const base64String = reader.result as string;
      setNfFile({
        name: file.name,
        type: file.type,
        base64: base64String,
      });
      triggerNfAiScan(base64String, file.type, file.name);
    };
    reader.onerror = (error) => {
      console.error('Erro na leitura do arquivo:', error);
      setNfAiError('Erro ao carregar o arquivo localmente.');
    };
  };

  const triggerNfAiScan = async (base64: string, mimeType: string, name: string) => {
    setIsParsingNf(true);
    setNfAiError(null);
    setNfScannedData(null);

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
        const { supplier, date, value, category, description, notes, invoiceNumber, items } = responseData.invoice;
        setNfScannedData({
          supplier: supplier || '',
          date: date || new Date().toISOString().split('T')[0],
          value: value || 0,
          category: (category === 'mao_de_obra' || category === 'materiais' ? category : 'materiais') as TransactionCategory,
          description: description || '',
          notes: notes || '',
          invoiceNumber: invoiceNumber || '',
          items: items || [],
        });
      } else {
        throw new Error(responseData.error || 'Não foi possível extrair os dados da nota.');
      }
    } catch (err: any) {
      console.error('Erro no escaneamento com IA:', err);
      setNfAiError(err.message || 'Houve um problema ao processar o arquivo com Inteligência Artificial.');
    } finally {
      setIsParsingNf(false);
    }
  };

  const handleSaveNfScanned = async () => {
    if (!selectedMap || !nfScannedData || !nfFile) return;

    let fileUrl = '';
    setIsUploadingNfToDrive(true);
    
    try {
      const config = await getTelegramConfig();
      const formattedName = buildTelegramFileName(config.fileNamePattern, {
        centro: project?.name || clientName || 'Cliente',
        data: nfScannedData.date,
        fornecedor: nfScannedData.supplier,
        descricao: nfScannedData.description || `NF Compra - Ref: ${selectedMap.title}`,
        valor: nfScannedData.value,
        extension: nfFile.name
      });
      const path = `notas_fiscais/${projectId}/${formattedName}`;
      const res = await uploadBase64ToFirebase(nfFile.base64, path, nfFile.type);
      if (res.url) {
        fileUrl = res.url;
      }
    } catch (err) {
      console.error('Falha ao subir arquivo para o Telegram:', err);
      alert('Atenção: O gasto será lançado localmente, mas ocorreu um erro ao enviar o arquivo para o Telegram.');
    } finally {
      setIsUploadingNfToDrive(false);
    }

    // 1. Create financial transaction
    if (addTransaction) {
      const newTx: Transaction = {
        id: `tx-${Date.now()}`,
        projectId,
        supplier: nfScannedData.supplier,
        description: nfScannedData.description || `NF Compra - Ref: ${selectedMap.title}`,
        value: nfScannedData.value,
        category: nfScannedData.category,
        date: nfScannedData.date,
        status: 'pago',
        notes: nfScannedData.notes || undefined,
        invoiceNumber: nfScannedData.invoiceNumber || undefined,
        receiptName: fileUrl || 'Local File: ' + nfFile.name,
        receiptUrl: fileUrl || undefined,
      };
      addTransaction(newTx);
    }

    // 2. Update Quotation Map in list
    const updated = maps.map(m => {
      if (m.id === selectedMap.id) {
        return {
          ...m,
          status: 'pago' as const,
          invoiceNumber: nfScannedData.invoiceNumber,
          invoiceUrl: fileUrl || 'Local File: ' + nfFile.name,
          invoiceScannedData: {
            supplier: nfScannedData.supplier,
            value: nfScannedData.value,
            date: nfScannedData.date,
            category: nfScannedData.category,
            description: nfScannedData.description,
          }
        };
      }
      return m;
    });

    saveMapsToStorage(updated);

    // Register paid materials in the unified average price database
    let paidItems = nfScannedData.items;
    if (!paidItems || paidItems.length === 0) {
      const selectedSup = selectedMap.suppliers.find(s => s.id === selectedMap.selectedSupplierId);
      if (selectedSup) {
        paidItems = selectedMap.items.map(item => {
          const unitValue = selectedSup.itemPrices[item.id] || 0;
          return {
            name: item.name,
            unit: item.unit,
            quantity: item.quantity,
            unitValue: unitValue,
            totalValue: Number((item.quantity * unitValue).toFixed(2))
          };
        });
      }
    }
    if (paidItems && paidItems.length > 0) {
      registerPaidMaterials(
        paidItems,
        projectId,
        project?.name || 'Obra',
        nfScannedData.supplier,
        nfScannedData.date
      );
    }

    // Clear scanning states
    setNfFile(null);
    setNfScannedData(null);
    setNfAiError(null);
    if (nfFileInputRef.current) {
      nfFileInputRef.current.value = '';
    }

    alert('Nota fiscal anexada com sucesso! O mapa de cotação foi liquidado como pago e o gasto correspondente foi registrado no Módulo Financeiro de Acompanhamento da Obra.');
  };

  const handleCancelNfScanned = () => {
    setNfFile(null);
    setNfScannedData(null);
    setNfAiError(null);
    if (nfFileInputRef.current) {
      nfFileInputRef.current.value = '';
    }
  };

  const handleGoogleLogin = async () => {
    setGoogleIsLoggingIn(true);
    try {
      await googleSignIn();
    } catch (err) {
      console.error('Erro no login do Google:', err);
      alert('Falha ao autenticar com o Google.');
    } finally {
      setGoogleIsLoggingIn(false);
    }
  };

  // Google Contacts and Custom Supplier Management Functions
  const handleFetchGoogleContacts = async (token?: string) => {
    const activeToken = token || googleAccessToken;
    if (!activeToken) {
      setContactsError('Google não conectado. Por favor, conecte para buscar contatos.');
      return;
    }

    if (activeToken === 'mock_google_access_token_cbc_123' || activeToken.startsWith('mock_')) {
      console.log('[Google People Mock] Using mock token. Returning mock contacts.');
      setIsFetchingContacts(true);
      setContactsError(null);
      // Simulate slight delay for realism
      await new Promise(resolve => setTimeout(resolve, 600));
      const mockContacts: GoogleContact[] = [
        {
          resourceName: 'people/mock-1',
          name: 'Antônio da Silva (Mão de Obra)',
          email: 'antonio.silva@gmail.com',
          phone: '(11) 98765-4321',
          category: 'Mão de Obra',
          isLinked: false
        },
        {
          resourceName: 'people/mock-2',
          name: 'Comercial Gerdau',
          email: 'vendas@gerdau.com.br',
          phone: '(11) 4004-3737',
          category: 'Materiais',
          isLinked: false
        },
        {
          resourceName: 'people/mock-3',
          name: 'Depósito Santa Cruz',
          email: 'contato@depsantacruz.com.br',
          phone: '(11) 3322-1100',
          category: 'Materiais',
          isLinked: false
        },
        {
          resourceName: 'people/mock-4',
          name: 'Votorantim Cimentos',
          email: 'atendimento@votorantim.com.br',
          phone: '(11) 3003-7771',
          category: 'Materiais',
          isLinked: false
        },
        {
          resourceName: 'people/mock-5',
          name: 'Carlos Pinturas (Pintor)',
          email: 'carlos.pinturas@outlook.com',
          phone: '(11) 99123-4567',
          category: 'Mão de Obra',
          isLinked: false
        }
      ];
      setGoogleContacts(mockContacts);
      setIsFetchingContacts(false);
      return;
    }
    
    setIsFetchingContacts(true);
    setContactsError(null);
    try {
      // Itera por todas as páginas via nextPageToken para não truncar em ~1000 contatos.
      const connections: any[] = [];
      let nextPageToken: string | undefined = undefined;
      do {
        const baseUrl = 'https://people.googleapis.com/v1/people/me/connections?personFields=names,emailAddresses,phoneNumbers&pageSize=1000';
        const url = nextPageToken ? `${baseUrl}&pageToken=${encodeURIComponent(nextPageToken)}` : baseUrl;
        const response = await fetch(url, {
          headers: {
            'Authorization': `Bearer ${activeToken}`,
            'Accept': 'application/json'
          }
        });

        if (!response.ok) {
          throw new Error(`Erro API People: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        if (data.connections) {
          connections.push(...data.connections);
        }
        nextPageToken = data.nextPageToken || undefined;
      } while (nextPageToken);

      const formatted: GoogleContact[] = connections.map((conn: any) => {
        const resourceName = conn.resourceName;
        const nameObj = conn.names?.[0];
        const emailObj = conn.emailAddresses?.[0];
        const phoneObj = conn.phoneNumbers?.[0];
        
        return {
          resourceName,
          name: nameObj?.displayName || nameObj?.givenName || 'Contato Sem Nome',
          email: emailObj?.value || '',
          phone: phoneObj?.value || '',
          category: 'Materiais',
          isLinked: false
        };
      });
      
      const validContacts = formatted.filter(c => c.name !== 'Contato Sem Nome');
      setGoogleContacts(validContacts.sort((a, b) => a.name.localeCompare(b.name)));
    } catch (err: any) {
      console.error('Erro ao carregar contatos do Google Contacts:', err);
      setContactsError('Houve um erro ao buscar seus contatos do Google Contacts. Certifique-se de que a permissão foi concedida.');
    } finally {
      setIsFetchingContacts(false);
    }
  };

  const handleToggleFavorite = (supId: string) => {
    const updated = unifiedSuppliers.map(s => {
      if (s.id === supId) {
        return { ...s, isFavorite: !s.isFavorite };
      }
      return s;
    });
    setUnifiedSuppliers(updated);
  };

  const handleUpdateCategory = (supId: string, category: string) => {
    const updated = unifiedSuppliers.map(s => {
      if (s.id === supId) {
        return { ...s, category };
      }
      return s;
    });
    setUnifiedSuppliers(updated);
  };

  const handleSaveSupplierEdit = (supId: string) => {
    const updated = unifiedSuppliers.map(s => {
      if (s.id === supId) {
        return {
          ...s,
          name: editSupplierName,
          phone: editSupplierPhone,
          email: editSupplierEmail,
          paymentTerms: editSupplierPayment,
          deliveryTime: editSupplierTime,
          category: editSupplierCategory
        };
      }
      return s;
    });
    setUnifiedSuppliers(updated);
    setIsEditingSupplierId(null);
  };

  const handleDeleteSupplier = (supId: string) => {
    if (window.confirm('Tem certeza que deseja remover este fornecedor do banco unificado?')) {
      const updated = unifiedSuppliers.filter(s => s.id !== supId);
      setUnifiedSuppliers(updated);
    }
  };

  const handleCreateManualSupplier = () => {
    if (!newManualName.trim()) {
      alert('Por favor, insira o nome do fornecedor.');
      return;
    }
    const newSup: UnifiedSupplier = {
      id: `sup-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      name: newManualName.trim(),
      phone: newManualPhone.trim(),
      email: newManualEmail.trim(),
      paymentTerms: newManualPayment.trim(),
      deliveryFee: 0,
      deliveryTime: newManualTime.trim(),
      category: newManualCategory,
      isFavorite: false,
      useCount: 0
    };
    
    const updated = [newSup, ...unifiedSuppliers];
    setUnifiedSuppliers(updated.sort((a, b) => a.name.localeCompare(b.name)));
    
    setNewManualName('');
    setNewManualPhone('');
    setNewManualEmail('');
    setNewManualPayment('');
    setNewManualTime('');
    setNewManualCategory('Materiais');
    setShowAddManualSupplier(false);
  };

  const handleLinkGoogleContact = (contact: GoogleContact, category: string) => {
    const normalized = normalizeSupplierName(contact.name || '');
    const alreadyExists = unifiedSuppliers.some(s => normalizeSupplierName(s.name) === normalized);
    
    if (alreadyExists) {
      alert(`O fornecedor "${contact.name}" já está cadastrado.`);
      return;
    }
    
    const newSup: UnifiedSupplier = {
      id: `sup-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      name: contact.name || '',
      phone: contact.phone || '',
      email: contact.email || '',
      paymentTerms: '',
      deliveryFee: 0,
      deliveryTime: '',
      category: category || 'Materiais',
      isFavorite: false,
      useCount: 0
    };
    
    const updated = [newSup, ...unifiedSuppliers];
    setUnifiedSuppliers(updated.sort((a, b) => a.name.localeCompare(b.name)));
    
    setGoogleContacts(prev => prev.map(c => {
      if (c.resourceName === contact.resourceName) {
        return { ...c, isLinked: true };
      }
      return c;
    }));
  };

  // Automatically fetch Google Contacts if logged in and navigating to the suppliers tab
  useEffect(() => {
    if (googleAccessToken && activeSubTab === 'suppliers' && googleContacts.length === 0) {
      handleFetchGoogleContacts(googleAccessToken);
    }
  }, [googleAccessToken, activeSubTab]);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };

  const selectedMap = maps.find(m => m.id === selectedMapId);

  // ----------------------------------------------------
  // CALCULATIONS FOR ACTIVE MAP
  // ----------------------------------------------------
  const getCheapestUnitPrice = (map: QuotationMap, itemId: string) => {
    let minPrice = Infinity;
    let bestSupplierId = '';
    map.suppliers.forEach(sup => {
      const p = sup.itemPrices[itemId];
      if (p !== undefined && p < minPrice) {
        minPrice = p;
        bestSupplierId = sup.id;
      }
    });
    return { minPrice, bestSupplierId };
  };

  const getSupplierTotal = (map: QuotationMap, supplier: QuotationSupplier) => {
    const subtotal = map.items.reduce((sum, item) => {
      const price = supplier.itemPrices[item.id] || 0;
      return sum + (price * item.quantity);
    }, 0);
    return {
      subtotal,
      deliveryFee: supplier.deliveryFee,
      total: subtotal + supplier.deliveryFee
    };
  };

  const getBestSupplierGlobal = (map: QuotationMap) => {
    let minTotal = Infinity;
    let bestSupplier: QuotationSupplier | null = null;
    map.suppliers.forEach(sup => {
      // Elegível apenas o fornecedor que cotou TODOS os itens (preço > 0).
      // Fornecedores com itens não cotados (preço 0/ausente) ficam incompletos e nunca são recomendados.
      const cotouTodos = map.items.length > 0 && map.items.every(item => {
        const p = sup.itemPrices[item.id];
        return p !== undefined && p > 0;
      });
      if (!cotouTodos) return;
      const { total } = getSupplierTotal(map, sup);
      if (total < minTotal) {
        minTotal = total;
        bestSupplier = sup;
      }
    });
    return bestSupplier;
  };

  // ----------------------------------------------------
  // ACTIONS
  // ----------------------------------------------------
  const handleAddNewItem = () => {
    if (!newItemName.trim() || newItemQty <= 0) return;
    const id = `item-${Date.now()}`;
    const newItem: QuotationItem = {
      id,
      name: newItemName.trim(),
      unit: newItemUnit,
      quantity: newItemQty
    };
    setFormItems([...formItems, newItem]);
    
    // Set initial price for suppliers
    setFormSuppliers(prev => prev.map(sup => ({
      ...sup,
      itemPrices: { ...sup.itemPrices, [id]: 0 }
    })));

    setNewItemName('');
    setNewItemQty(1);
  };

  const handleEditFormItem = (itemId: string, field: 'name' | 'unit' | 'quantity', value: string) => {
    setFormItems(prev => prev.map(item => {
      if (item.id !== itemId) return item;
      if (field === 'quantity') {
        return { ...item, quantity: value === '' ? 0 : Number(value) };
      }
      return { ...item, [field]: value };
    }));
  };

  const handleDeleteFormItem = (itemId: string) => {
    setFormItems(prev => prev.filter(item => item.id !== itemId));
    setFormSuppliers(prev => prev.map(sup => {
      const updatedPrices = { ...sup.itemPrices };
      delete updatedPrices[itemId];
      return { ...sup, itemPrices: updatedPrices };
    }));
  };

  const handlePriceChange = (supplierId: string, itemId: string, price: number) => {
    setFormSuppliers(prev => prev.map(sup => {
      if (sup.id === supplierId) {
        return {
          ...sup,
          itemPrices: { ...sup.itemPrices, [itemId]: price }
        };
      }
      return sup;
    }));
  };

  const handleSupplierFieldChange = (supplierId: string, field: keyof QuotationSupplier, value: any) => {
    setFormSuppliers(prev => prev.map(sup => {
      if (sup.id === supplierId) {
        return { ...sup, [field]: value };
      }
      return sup;
    }));
  };

  const openCreateForm = () => {
    // Prefill with default state
    const nextNum = maps.length > 0 ? Math.max(...maps.map(m => m.number)) + 1 : 1;
    setFormTitle(`Mapa de Cotação #${nextNum.toString().padStart(2, '0')}`);
    setFormDate(new Date().toISOString().split('T')[0]);
    setFormObservations('');
    setFormItems([
      { id: '1', name: 'Cimento CP-II (50kg)', unit: 'Saco', quantity: 50 },
      { id: '2', name: 'Areia Fina Lavada', unit: 'm³', quantity: 10 }
    ]);
    setFormSuppliers([
      {
        id: 'sup-1',
        name: 'Depósito Vale do Paraíba',
        phone: '(11) 98111-2233',
        email: 'vendas@depositovale.com.br',
        paymentTerms: 'Boleto Faturado 30 dias',
        deliveryFee: 120,
        deliveryTime: 'Até 48 horas',
        itemPrices: { '1': 32.00, '2': 125.00 }
      },
      {
        id: 'sup-2',
        name: 'Silva Materiais de Construção',
        phone: '(11) 97444-5566',
        email: 'silva.materiais@terra.com.br',
        paymentTerms: 'Pix (5% Desconto)',
        deliveryFee: 150,
        deliveryTime: 'Entrega Imediata',
        itemPrices: { '1': 34.50, '2': 110.00 }
      },
      {
        id: 'sup-3',
        name: 'Central da Construção',
        phone: '(11) 96555-7788',
        email: 'orcamentos@centralconstrucao.com',
        paymentTerms: 'À Vista no Dinheiro/Pix',
        deliveryFee: 80,
        deliveryTime: '3 dias úteis',
        itemPrices: { '1': 31.00, '2': 130.00 }
      }
    ]);
    setIsEditing(false);
    setIsCreating(true);
  };

  const openEditForm = (map: QuotationMap) => {
    setFormTitle(map.title);
    setFormDate(map.date);
    setFormObservations(map.observations || '');
    setFormItems(map.items);
    setFormSuppliers(map.suppliers);
    setIsEditing(true);
    setIsCreating(false);
  };

  const handleSaveForm = () => {
    if (!formTitle.trim()) {
      alert('Por favor, informe um título.');
      return;
    }
    if (formItems.length === 0) {
      alert('Adicione pelo menos um item à lista de cotação.');
      return;
    }

    if (isCreating) {
      const nextNum = maps.length > 0 ? Math.max(...maps.map(m => m.number)) + 1 : 1;
      const newMap: QuotationMap = {
        id: `map-${Date.now()}`,
        projectId,
        number: nextNum,
        title: formTitle,
        date: formDate,
        status: 'rascunho',
        items: formItems,
        suppliers: formSuppliers,
        observations: formObservations
      };
      const updated = [...maps, newMap];
      saveMapsToStorage(updated);
      setSelectedMapId(newMap.id);
    } else if (isEditing && selectedMapId) {
      const updated = maps.map(m => {
        if (m.id === selectedMapId) {
          return {
            ...m,
            title: formTitle,
            date: formDate,
            items: formItems,
            suppliers: formSuppliers,
            observations: formObservations
          };
        }
        return m;
      });
      saveMapsToStorage(updated);
    }

    setIsCreating(false);
    setIsEditing(false);
  };

  const handleDeleteMap = (mapId: string) => {
    if (!window.confirm('Excluir este mapa de cotação permanentemente?')) return;
    const updated = maps.filter(m => m.id !== mapId);
    saveMapsToStorage(updated);
    if (selectedMapId === mapId) {
      setSelectedMapId(updated.length > 0 ? updated[0].id : null);
    }
  };

  const handleAuthorizePurchase = (supplierId: string) => {
    if (!selectedMap) return;
    const supplier = selectedMap.suppliers.find(s => s.id === supplierId);
    if (!supplier) return;

    if (!window.confirm(`Você confirma a autorização de compra para o fornecedor "${supplier.name}"?`)) return;

    const updated = maps.map(m => {
      if (m.id === selectedMap.id) {
        return {
          ...m,
          status: 'aprovado' as const,
          selectedSupplierId: supplierId,
          authorizedAt: new Date().toLocaleDateString('pt-BR'),
          authorizedBy: clientName
        };
      }
      return m;
    });

    saveMapsToStorage(updated);
  };

  const handleRejectMap = () => {
    if (!selectedMap) return;
    if (!window.confirm('Deseja rejeitar este mapa de cotação?')) return;

    const updated = maps.map(m => {
      if (m.id === selectedMap.id) {
        return {
          ...m,
          status: 'rejeitado' as const
        };
      }
      return m;
    });

    saveMapsToStorage(updated);
  };

  const handleSendToClient = () => {
    if (!selectedMap) return;
    const updated = maps.map(m => {
      if (m.id === selectedMap.id) {
        return { ...m, status: 'pendente' as const };
      }
      return m;
    });
    saveMapsToStorage(updated);
    alert('Mapa de Cotação publicado com sucesso! Agora o cliente poderá analisar e autorizar as compras no portal.');
  };

  // ----------------------------------------------------
  // JPEG EXPORT FUNCTION (HIGH RESOLUTION)
  // ----------------------------------------------------
  const handleExportJPEG = async () => {
    if (!captureRef.current) return;
    setExporting(true);
    try {
      // 1. Sanitize main document styles to remove oklch/oklab before html2canvas runs
      sanitizeMainDocumentStyles();
      
      // Small delay to ensure browser parses updated styles
      await new Promise(resolve => setTimeout(resolve, 300));
      
      const canvas = await html2canvas(captureRef.current, {
        scale: 2, // higher resolution
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
        onclone: (clonedDoc) => {
          sanitizeDocumentOklch(clonedDoc);
          const element = clonedDoc.getElementById('quotation-map-capture');
          if (element) {
            // Force it to be wide and remove any scroll limits or fixed widths
            element.style.width = '1200px';
            element.style.maxWidth = 'none';
            element.style.overflow = 'visible';
            
            // Also find any nested overflow-x-auto containers and make them visible
            const scrollContainers = element.querySelectorAll('.overflow-x-auto');
            scrollContainers.forEach((container: any) => {
              container.classList.remove('overflow-x-auto');
              container.style.overflow = 'visible';
              container.style.width = '100%';
              container.style.maxWidth = 'none';
            });
          }
        }
      });
      const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
      const link = document.createElement('a');
      link.download = `mapa_cotacao_${selectedMap?.number.toString().padStart(2, '0') || '01'}.jpg`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error('Error generating JPEG:', err);
      alert('Houve um erro ao gerar a imagem JPEG. Por favor, tente novamente ou use a opção de Impressão.');
    } finally {
      setExporting(false);
    }
  };

  // ----------------------------------------------------
  // VECTOR PDF EXPORT FUNCTION (A4 LANDSCAPE) - OPTIMIZED FOR PRINT
  // ----------------------------------------------------
  const handleExportPDF = () => {
    if (!selectedMap) return;
    setExportingPDF(true);
    try {
      const doc = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4'
      });

      // Page width for layout calculations
      const pageWidth = doc.internal.pageSize.getWidth(); // 297mm
      
      // 1. TYPOGRAPHIC LOGO (Top-Left)
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(0, 0, 0); // Black
      doc.text('CHAVES', 14, 15);
      doc.text('BRITES', 14, 19.5);
      doc.text('CORREA', 14, 24);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(80, 80, 80); // Gray text
      doc.text('ARQUITETURA', 38, 19.5);
      doc.text('ENGENHARIA', 38, 24);

      // 2. DOCUMENT TITLE & PROJECT DETAILS (Center-Left)
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.setTextColor(28, 25, 23); // stone-900
      doc.text(`MAPA DE COTAÇÃO #${selectedMap.number.toString().padStart(2, '0')}`, 90, 16);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(80, 80, 80);
      doc.text(`Projeto: ${project?.name || "Obra CBC"}`, 90, 21.5);
      if (project?.clientId) {
        doc.text(`Cliente: ${clientName}`, 90, 26);
      }

      // 3. EMISSION DATE & CODE BOX (Top-Right, Fixed Emoji Encoding Symbol Bug)
      doc.setFillColor(250, 250, 249); // stone-50
      doc.setDrawColor(231, 229, 228); // stone-200
      doc.rect(pageWidth - 75, 11, 61, 16, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.5);
      doc.setTextColor(168, 162, 158); // stone-400
      doc.text('DATA DE EMISSÃO', pageWidth - 71, 15);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(68, 64, 60); // stone-700
      // Removed emoji prefix (📅) entirely to fix the encoding bug (which showed up as Ø=ÜÅ)
      doc.text(selectedMap.date, pageWidth - 71, 19.5);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.5);
      doc.setTextColor(120, 113, 108); // stone-500
      doc.text(`CÓDIGO: CBC-MC-${selectedMap.number.toString().padStart(3, '0')}`, pageWidth - 71, 24.5);

      // 4. QUOTATION TITLE & OBSERVATIONS (Full Width Below)
      let nextY = 32;
      
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(28, 25, 23);
      doc.text(selectedMap.title, 14, nextY);
      
      nextY += 4;
      if (selectedMap.observations) {
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(7.5);
        doc.setTextColor(120, 113, 108);
        const splitObs = doc.splitTextToSize(`Observações: ${selectedMap.observations}`, pageWidth - 28);
        doc.text(splitObs, 14, nextY);
        nextY += (splitObs.length * 3.5) + 1;
      }

      // 5. MATRIX COMPARATIVE TABLE (Includes Supplier Info directly inside headers for modularity)
      const headers = [
        'Especificação do Material / Quantidade',
        ...selectedMap.suppliers.map((sup, idx) => {
          const isRecommended = getBestSupplierGlobal(selectedMap)?.id === sup.id;
          const isAuthorized = selectedMap.selectedSupplierId === sup.id;
          
          let text = `FORNECEDOR ${idx + 1}\n${sup.name}`;
          
          // Elegantly merge delivery/payment terms directly into the headers since secondary table is removed
          if (sup.deliveryTime || sup.paymentTerms) {
            text += `\nPrazo: ${sup.deliveryTime || 'N/I'} • Pgto: ${sup.paymentTerms || 'N/I'}`;
          }
          
          if (isAuthorized) {
            text += '\n[★ AUTORIZADO]';
          } else if (isRecommended) {
            text += '\n[RECOMENDADO]';
          }
          return text;
        })
      ];

      const bodyRows = selectedMap.items.map((item) => {
        const row = [
          `${item.name}\nQtd: ${item.quantity} ${item.unit}s`
        ];
        
        selectedMap.suppliers.forEach((sup) => {
          const { bestSupplierId } = getCheapestUnitPrice(selectedMap, item.id);
          const price = sup.itemPrices[item.id] || 0;
          const totalItem = price * item.quantity;
          const isCheapest = sup.id === bestSupplierId;
          
          let text = '';
          if (price > 0) {
            text = `${formatCurrency(price)}\nTotal: ${formatCurrency(totalItem)}`;
            if (isCheapest) {
              text += '\n(Melhor Preço)';
            }
          } else {
            text = 'Não cotado';
          }
          row.push(text);
        });
        return row;
      });

      // Add Subtotal row
      const subtotalRow = [
        'Subtotal de Itens',
        ...selectedMap.suppliers.map(sup => {
          const { subtotal } = getSupplierTotal(selectedMap, sup);
          return formatCurrency(subtotal);
        })
      ];
      bodyRows.push(subtotalRow);

      // Add Delivery row
      const deliveryRow = [
        'Custo do Frete',
        ...selectedMap.suppliers.map(sup => {
          return sup.deliveryFee > 0 ? formatCurrency(sup.deliveryFee) : 'Grátis';
        })
      ];
      bodyRows.push(deliveryRow);

      // Add Grand Total row
      const totalRow = [
        'VALOR TOTAL DA COMPRA',
        ...selectedMap.suppliers.map(sup => {
          const { total } = getSupplierTotal(selectedMap, sup);
          const isAuthorized = selectedMap.selectedSupplierId === sup.id;
          const isBest = getBestSupplierGlobal(selectedMap)?.id === sup.id;
          let text = formatCurrency(total);
          if (isAuthorized) {
            text += '\n[AUTORIZADO]';
          } else if (isBest) {
            text += '\n[RECOMENDADO]';
          }
          return text;
        })
      ];
      bodyRows.push(totalRow);

      // Draw autoTable matrix
      autoTable(doc, {
        startY: nextY + 3,
        head: [headers],
        body: bodyRows,
        theme: 'grid',
        styles: {
          font: 'helvetica',
          fontSize: 7.5,
          cellPadding: 2.5,
          lineColor: [214, 211, 209], // stone-300
          lineWidth: 0.1,
        },
        headStyles: {
          fillColor: [41, 37, 36], // stone-800
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          halign: 'center',
          valign: 'middle'
        },
        columnStyles: {
          0: { halign: 'left', fontStyle: 'bold', cellWidth: 70 }
        },
        didParseCell: (data) => {
          // Highlight cheapest unit prices in light green
          if (data.row.index < selectedMap.items.length && data.column.index > 0) {
            const item = selectedMap.items[data.row.index];
            const supplier = selectedMap.suppliers[data.column.index - 1];
            const price = supplier.itemPrices[item.id] || 0;
            const { bestSupplierId } = getCheapestUnitPrice(selectedMap, item.id);
            if (supplier.id === bestSupplierId && price > 0) {
              data.cell.styles.fillColor = [209, 250, 229]; // light emerald-100
              data.cell.styles.textColor = [6, 78, 59]; // dark emerald-900
            }
          }
          
          // Style summary rows at the bottom
          if (data.row.index >= selectedMap.items.length) {
            data.cell.styles.fontStyle = 'bold';
            
            // Grand Total row
            if (data.row.index === selectedMap.items.length + 2) {
              const isHeaderColumn = data.column.index === 0;
              if (isHeaderColumn) {
                data.cell.styles.fillColor = [41, 37, 36]; // dark stone
                data.cell.styles.textColor = [255, 255, 255];
              } else {
                const supplier = selectedMap.suppliers[data.column.index - 1];
                const isAuthorized = selectedMap.selectedSupplierId === supplier.id;
                const isBest = getBestSupplierGlobal(selectedMap)?.id === supplier.id;
                if (isAuthorized) {
                  data.cell.styles.fillColor = [6, 95, 70]; // emerald-800
                  data.cell.styles.textColor = [255, 255, 255];
                } else if (isBest) {
                  data.cell.styles.fillColor = [254, 243, 199]; // amber-100
                  data.cell.styles.textColor = [120, 53, 4]; // amber-900
                } else {
                  data.cell.styles.fillColor = [245, 245, 244]; // stone-100
                  data.cell.styles.textColor = [41, 37, 36];
                }
              }
            } else {
              // Subtotal or Frete rows
              data.cell.styles.fillColor = [250, 250, 249]; // stone-50
            }
          }
        }
      });

      // Save PDF
      doc.save(`${clientName} - Mapa de Cotação ${selectedMap.number.toString().padStart(2, '0')}.pdf`);
    } catch (err) {
      console.error('Error exporting PDF:', err);
      alert('Houve um erro ao gerar o PDF. Por favor, use a opção de Impressão.');
    } finally {
      setExportingPDF(false);
    }
  };

  // ----------------------------------------------------
  // NATIVE PRINT FUNCTION (BEST RESOLUTION PDF & PRINT)
  // ----------------------------------------------------
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="bg-white border border-stone-200 print:border-none print:bg-white">
      <style>{`
        @media print {
          body {
            background: white !important;
            color: black !important;
          }
          header, footer, nav, aside, button, 
          .no-print, .print\\:hidden, 
          [role="tablist"], 
          .bg-stone-50, .border-stone-200,
          .bg-stone-100 {
            display: none !important;
          }
          .grid, .xl\\:grid-cols-4, .xl\\:grid {
            display: block !important;
          }
          .xl\\:col-span-1, div.border-r, div.col-span-1 {
            display: none !important;
          }
          .xl\\:col-span-3, div.col-span-3, div.p-5 {
            padding: 0 !important;
            margin: 0 !important;
            display: block !important;
            width: 100% !important;
            max-width: 100% !important;
          }
          #quotation-map-capture {
            display: block !important;
            width: 100% !important;
            max-width: 100% !important;
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            margin: 0 !important;
            padding: 8mm !important;
            border: none !important;
            box-shadow: none !important;
            overflow: visible !important;
          }
          .overflow-x-auto {
            overflow: visible !important;
            display: block !important;
            width: 100% !important;
            max-width: none !important;
          }
          table {
            width: 100% !important;
            table-layout: auto !important;
            page-break-inside: avoid !important;
          }
          tr {
            page-break-inside: avoid !important;
            page-break-after: auto !important;
          }
          thead {
            display: table-header-group !important;
          }
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }
      `}</style>
      {/* HEADER SECTION */}
      <div className="p-5 border-b border-stone-150 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-[#FDFDFD] print:hidden">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-stone-100 border border-stone-200 text-stone-700">
            <ClipboardList size={20} />
          </div>
          <div>
            <h3 className="font-serif text-base text-stone-900 font-bold uppercase tracking-tight">
              Mapas de Cotação Comparativo
            </h3>
            <p className="text-[11px] text-stone-500 mt-0.5">
              Compare orçamentos em múltiplos fornecedores, analise o melhor custo global e exporte autorizações.
            </p>
          </div>
        </div>
        {!readOnly && !isCreating && !isEditing && (
          <button
            type="button"
            onClick={openCreateForm}
            className="bg-stone-950 text-white hover:bg-stone-850 px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider font-bold cursor-pointer flex items-center gap-1.5 self-start sm:self-center"
          >
            <Plus size={14} />
            Nova Cotação
          </button>
        )}
      </div>

      {/* SUB-TAB NAVIGATION BAR */}
      {!isCreating && !isEditing && (
        <div className="flex border-b border-stone-200 bg-[#FCFBF9] print:hidden">
          <button
            type="button"
            onClick={() => setActiveSubTab('maps')}
            className={`px-5 py-3.5 text-xs font-mono uppercase tracking-wider font-bold transition-all border-r border-stone-200 cursor-pointer ${
              activeSubTab === 'maps'
                ? 'bg-white text-stone-900 border-b-2 border-b-stone-950 font-black shadow-sm'
                : 'text-stone-500 hover:bg-stone-50 hover:text-stone-850'
            }`}
          >
            📊 Mapas de Cotação ({maps.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab('suppliers')}
            className={`px-5 py-3.5 text-xs font-mono uppercase tracking-wider font-bold transition-all border-r border-stone-200 cursor-pointer ${
              activeSubTab === 'suppliers'
                ? 'bg-white text-stone-900 border-b-2 border-b-stone-950 font-black shadow-sm'
                : 'text-stone-500 hover:bg-stone-50 hover:text-stone-850'
            }`}
          >
            🏬 Banco de Fornecedores ({unifiedSuppliers.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab('materials')}
            className={`px-5 py-3.5 text-xs font-mono uppercase tracking-wider font-bold transition-all cursor-pointer ${
              activeSubTab === 'materials'
                ? 'bg-white text-stone-900 border-b-2 border-b-stone-950 font-black shadow-sm'
                : 'text-stone-500 hover:bg-stone-50 hover:text-stone-850'
            }`}
          >
            🏷️ Média de Preços ({unifiedMaterials.length})
          </button>
        </div>
      )}

      {/* CREATION OR EDITING FORM PANEL */}
      {(isCreating || isEditing) ? (
        <div className="p-6 bg-stone-50/50 space-y-6">
          <div className="flex items-center justify-between border-b border-stone-200 pb-3">
            <h4 className="font-serif text-sm text-stone-900 font-bold">
              {isCreating ? 'Novo Mapa de Cotação Comparativo' : 'Editar Mapa de Cotação'}
            </h4>
            <button 
              type="button" 
              onClick={() => { setIsCreating(false); setIsEditing(false); }}
              className="text-stone-400 hover:text-stone-600 p-1"
            >
              <X size={18} />
            </button>
          </div>

          {/* ATTACH REQUEST FILE FOR AI PARSING */}
          {isCreating && (
            <div className="bg-stone-50 border border-stone-200 p-4 space-y-3">
              <div className="flex items-start gap-2.5">
                <span className="text-stone-700 bg-amber-100 border border-amber-200 text-xs px-2 py-0.5 font-bold font-mono">IA</span>
                <div>
                  <h5 className="text-[11px] font-sans font-bold text-stone-900 uppercase tracking-wide flex items-center gap-1.5">
                    ✨ Preencher mapa automaticamente via IA
                  </h5>
                  <p className="text-[10px] text-stone-500 mt-0.5">
                    Anexe um print de WhatsApp, foto de caderno, recibo ou lista de materiais. Nossa inteligência artificial vai ler a lista, sugerir um título e preencher os materiais para você!
                  </p>
                </div>
              </div>

              {/* Dual Upload Buttons for Request */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1">
                <button
                  type="button"
                  onClick={() => requestFileInputRef.current?.click()}
                  className="flex items-center justify-center gap-2 border-2 border-dashed border-stone-200 hover:border-stone-400 bg-white hover:bg-[#FAF9F6] py-4 px-3 text-xs font-mono uppercase font-bold tracking-wider text-stone-800 transition-all cursor-pointer"
                >
                  <Upload size={14} className="text-stone-500" />
                  <span>Adicionar Arquivo Local</span>
                </button>

                <button
                  type="button"
                  onClick={() => cameraRequestInputRef.current?.click()}
                  className="flex items-center justify-center gap-2 border-2 border-dashed border-stone-200 hover:border-stone-400 bg-white hover:bg-[#FAF9F6] py-4 px-3 text-xs font-mono uppercase font-bold tracking-wider text-stone-800 transition-all cursor-pointer"
                >
                  <Camera size={14} className="text-stone-500" />
                  <span>Tirar Foto</span>
                </button>
              </div>

              <input 
                type="file" 
                ref={requestFileInputRef} 
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) processSelectedRequestFile(file);
                }}
                accept="image/*" 
                className="hidden" 
              />

              <input 
                type="file" 
                ref={cameraRequestInputRef} 
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) processSelectedRequestFile(file);
                }}
                accept="image/*" 
                capture="environment"
                className="hidden" 
              />
              
              {isParsingRequest && (
                <div className="flex flex-col items-center gap-2 py-2.5 bg-white border border-stone-200">
                  <div className="w-5 h-5 border-2 border-stone-950 border-t-transparent rounded-full animate-spin"></div>
                  <span className="text-[11px] font-mono text-stone-600 font-bold uppercase tracking-wider animate-pulse">
                    IA processando imagem...
                  </span>
                  <span className="text-[9px] text-stone-400 italic">
                    Lendo materiais, unidades e quantidades solicitadas...
                  </span>
                </div>
              )}

              {!isParsingRequest && requestFile && (
                <div className="bg-emerald-50 border border-emerald-200 p-2.5 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5 truncate">
                    <FileImage size={14} className="text-amber-600 animate-pulse" />
                    <span className="truncate font-mono text-[10.5px]" title={requestFile.name}>
                      {requestFile.name}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCancelRequestFile();
                    }}
                    className="text-rose-600 hover:text-rose-800 font-mono text-[10px] uppercase font-bold"
                  >
                    Remover
                  </button>
                </div>
              )}

              {requestAiError && (
                <div className="bg-red-50 border border-red-150 p-2.5 text-[10px] text-red-700 flex justify-between items-center">
                  <span>⚠️ {requestAiError}</span>
                  <button 
                    type="button" 
                    onClick={() => setRequestAiError(null)}
                    className="font-mono font-bold hover:text-red-900 px-2 py-0.5 bg-white border border-red-200 cursor-pointer"
                  >
                    OK
                  </button>
                </div>
              )}


            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-[9px] font-mono uppercase text-stone-500 font-bold mb-1">Título do Mapa / Finalidade</label>
              <input
                type="text"
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                className="w-full bg-white border border-stone-200 py-1.5 px-3 text-xs focus:outline-none focus:border-stone-400"
                placeholder="Ex: Cimento, Areia e Ferragens para Fundação"
              />
            </div>
            <div>
              <label className="block text-[9px] font-mono uppercase text-stone-500 font-bold mb-1">Data do Mapa</label>
              <input
                type="date"
                value={formDate}
                onChange={(e) => setFormDate(e.target.value)}
                className="w-full bg-white border border-stone-200 py-1.5 px-3 text-xs focus:outline-none focus:border-stone-400"
              />
            </div>
          </div>

          {/* SECTION 1: ITEMS MANAGEMENT */}
          <div className="bg-white border border-stone-200 p-4 space-y-3">
            <h5 className="text-[10px] font-mono uppercase text-stone-800 font-bold tracking-wider border-b border-stone-100 pb-2">
              1. Lista de Materiais para Cotação
            </h5>

            {/* Form Inline Add Item */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 bg-[#FAF9F6] p-3 border border-stone-200">
              <div className="sm:col-span-2">
                <label className="block text-[8px] font-mono uppercase text-stone-400 font-bold mb-0.5">Descrição do Item</label>
                <input
                  type="text"
                  value={newItemName}
                  onChange={(e) => setNewItemName(e.target.value)}
                  placeholder="Ex: Saco de Cimento Mauá 50kg"
                  className="w-full bg-white border border-stone-200 py-1 px-2 text-[11px] focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[8px] font-mono uppercase text-stone-400 font-bold mb-0.5">Unidade</label>
                <select
                  value={newItemUnit}
                  onChange={(e) => setNewItemUnit(e.target.value)}
                  className="w-full bg-white border border-stone-200 py-1 px-2 text-[11px] focus:outline-none"
                >
                  <option value="Saco">Saco</option>
                  <option value="m³">Metros Cúbicos (m³)</option>
                  <option value="Milheiro">Milheiro</option>
                  <option value="Unid">Unidade</option>
                  <option value="Barra">Barra</option>
                  <option value="Kg">Quilo (kg)</option>
                  <option value="Rolo">Rolo</option>
                </select>
              </div>
              <div className="flex items-end gap-1.5">
                <div className="w-full">
                  <label className="block text-[8px] font-mono uppercase text-stone-400 font-bold mb-0.5">Quantidade</label>
                  <input
                    type="number"
                    value={newItemQty === 0 ? '' : newItemQty}
                    onChange={(e) => setNewItemQty(Number(e.target.value))}
                    min="1"
                    className="w-full bg-white border border-stone-200 py-1 px-2 text-[11px] focus:outline-none"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleAddNewItem}
                  className="bg-stone-900 text-white hover:bg-stone-850 px-3 py-1.5 text-[11px] font-mono font-bold"
                >
                  Adicionar
                </button>
              </div>
            </div>

            {/* List of current added items */}
            <div className="border border-stone-200 overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-stone-50 border-b border-stone-200">
                    <th className="p-2 font-mono text-[9px] uppercase text-stone-500 font-bold">Item</th>
                    <th className="p-2 font-mono text-[9px] uppercase text-stone-500 font-bold text-center">Unidade</th>
                    <th className="p-2 font-mono text-[9px] uppercase text-stone-500 font-bold text-center">Qtd</th>
                    <th className="p-2 font-mono text-[9px] uppercase text-stone-500 font-bold text-center w-16">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {formItems.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="p-4 text-center text-stone-400 font-mono text-[10px]">
                        Nenhum material adicionado ainda.
                      </td>
                    </tr>
                  ) : (
                    formItems.map((item, idx) => (
                      <tr key={item.id} className="hover:bg-stone-50/50">
                        <td className="p-1">
                          <input
                            type="text"
                            value={item.name}
                            onChange={(e) => handleEditFormItem(item.id, 'name', e.target.value)}
                            className="w-full bg-transparent hover:bg-white focus:bg-white border border-transparent hover:border-stone-200 focus:border-stone-400 py-1 px-1.5 text-xs font-sans font-medium text-stone-800 focus:outline-none"
                          />
                        </td>
                        <td className="p-1">
                          <input
                            type="text"
                            value={item.unit}
                            onChange={(e) => handleEditFormItem(item.id, 'unit', e.target.value)}
                            className="w-full bg-transparent hover:bg-white focus:bg-white border border-transparent hover:border-stone-200 focus:border-stone-400 py-1 px-1.5 text-xs font-mono text-stone-600 text-center focus:outline-none"
                          />
                        </td>
                        <td className="p-1">
                          <input
                            type="number"
                            value={item.quantity === 0 ? '' : item.quantity}
                            onChange={(e) => handleEditFormItem(item.id, 'quantity', e.target.value)}
                            min="0"
                            step="any"
                            className="w-full bg-transparent hover:bg-white focus:bg-white border border-transparent hover:border-stone-200 focus:border-stone-400 py-1 px-1.5 text-xs font-mono text-stone-800 font-bold text-center focus:outline-none"
                          />
                        </td>
                        <td className="p-2 text-center">
                          <button
                            type="button"
                            onClick={() => handleDeleteFormItem(item.id)}
                            className="text-stone-400 hover:text-red-600 p-1"
                          >
                            <Trash2 size={13} />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* SECTION 2: SUPPLIERS DETAILS */}
          <div className="bg-white border border-stone-200 p-4 space-y-4">
            <h5 className="text-[10px] font-mono uppercase text-stone-800 font-bold tracking-wider border-b border-stone-100 pb-2">
              2. Informações dos 3 Fornecedores
            </h5>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {formSuppliers.map((sup, idx) => (
                <div key={sup.id} className="border border-stone-200 p-3 bg-[#FCFBF9] space-y-2.5">
                  <div className="flex items-center gap-1.5 border-b border-stone-150 pb-1.5">
                    <span className="bg-stone-900 text-white font-mono text-[8.5px] font-bold px-1.5 py-0.5">
                      F{idx + 1}
                    </span>
                    <div className="relative flex-grow">
                      <input
                        type="text"
                        value={sup.name}
                        onChange={(e) => handleSupplierFieldChange(sup.id, 'name', e.target.value)}
                        placeholder={`Fornecedor ${idx + 1}`}
                        className="w-full bg-white border border-stone-200 py-0.5 pl-2 pr-20 text-[11px] font-sans font-bold text-stone-850 focus:outline-none"
                      />
                      {unifiedSuppliers.length > 0 && (
                        <select
                          onChange={(e) => {
                            const selectedId = e.target.value;
                            if (selectedId) {
                              const chosen = unifiedSuppliers.find(u => u.id === selectedId);
                              if (chosen) handleSupplierSelection(sup.id, chosen);
                            }
                            e.target.value = ""; // reset selection
                          }}
                          className="absolute right-1 top-1/2 -translate-y-1/2 bg-stone-100 hover:bg-stone-200 border border-stone-300 text-[9px] font-mono py-0.5 px-1 outline-none max-w-[90px] cursor-pointer"
                          defaultValue=""
                        >
                          <option value="" disabled>Histórico</option>
                          {unifiedSuppliers.map(u => (
                            <option key={u.id} value={u.id}>{u.name}</option>
                          ))}
                        </select>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[7.5px] font-mono uppercase text-stone-400 font-bold">Telefone de Contato</label>
                      <input
                        type="text"
                        value={sup.phone}
                        onChange={(e) => handleSupplierFieldChange(sup.id, 'phone', e.target.value)}
                        placeholder="(00) 00000-0000"
                        className="w-full bg-white border border-stone-200 py-0.5 px-1.5 text-[10px] focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[7.5px] font-mono uppercase text-stone-400 font-bold">E-mail de Contato</label>
                      <input
                        type="text"
                        value={sup.email}
                        onChange={(e) => handleSupplierFieldChange(sup.id, 'email', e.target.value)}
                        placeholder="vendas@fornecedor.com"
                        className="w-full bg-white border border-stone-200 py-0.5 px-1.5 text-[10px] focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[7.5px] font-mono uppercase text-stone-400 font-bold">Forma de Pagamento</label>
                      <input
                        type="text"
                        value={sup.paymentTerms}
                        onChange={(e) => handleSupplierFieldChange(sup.id, 'paymentTerms', e.target.value)}
                        placeholder="Ex: Pix, 30 DDL"
                        className="w-full bg-white border border-stone-200 py-0.5 px-1.5 text-[10px] focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[7.5px] font-mono uppercase text-stone-400 font-bold">Prazo de Entrega</label>
                      <input
                        type="text"
                        value={sup.deliveryTime}
                        onChange={(e) => handleSupplierFieldChange(sup.id, 'deliveryTime', e.target.value)}
                        placeholder="Ex: 2 dias, Imediato"
                        className="w-full bg-white border border-stone-200 py-0.5 px-1.5 text-[10px] focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[7.5px] font-mono uppercase text-stone-400 font-bold">Custo de Frete (R$)</label>
                    <input
                      type="number"
                      value={sup.deliveryFee === 0 ? '' : sup.deliveryFee}
                      onChange={(e) => handleSupplierFieldChange(sup.id, 'deliveryFee', Number(e.target.value))}
                      placeholder="0,00"
                      className="w-full bg-white border border-stone-200 py-0.5 px-1.5 text-[10px] font-mono focus:outline-none"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* SECTION 3: PRICES MATRIX */}
          {formItems.length > 0 && (
            <div className="bg-white border border-stone-200 p-4 space-y-3">
              <h5 className="text-[10px] font-mono uppercase text-stone-800 font-bold tracking-wider border-b border-stone-100 pb-2">
                3. Matriz de Preços Unitários (R$)
              </h5>

              <div className="border border-stone-200 overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-stone-50 border-b border-stone-200">
                      <th className="p-2 font-mono text-[9px] uppercase text-stone-500 font-bold">Material</th>
                      <th className="p-2 font-mono text-[9px] uppercase text-stone-500 font-bold text-center">Qtd</th>
                      {formSuppliers.map((sup, idx) => (
                        <th key={sup.id} className="p-2 font-mono text-[9px] uppercase text-stone-800 font-bold text-center bg-[#FAF9F6]">
                          {sup.name || `F${idx + 1}`} (Unitário R$)
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {formItems.map((item) => (
                      <tr key={item.id} className="hover:bg-stone-50/50">
                        <td className="p-2 font-sans font-medium text-stone-700">
                          {item.name} <span className="text-[9px] text-stone-400">({item.unit})</span>
                        </td>
                        <td className="p-2 text-center font-mono font-bold text-stone-800">{item.quantity}</td>
                        {formSuppliers.map((sup) => (
                          <td key={sup.id} className="p-2 bg-[#FCFBF9]">
                            <div className="flex items-center justify-center">
                              <span className="text-[10px] font-mono text-stone-400 mr-1">R$</span>
                              <input
                                type="number"
                                step="0.01"
                                value={sup.itemPrices[item.id] || ''}
                                onChange={(e) => handlePriceChange(sup.id, item.id, Number(e.target.value))}
                                className="w-20 bg-white border border-stone-200 py-0.5 px-1 font-mono text-xs text-center focus:outline-none focus:border-stone-400"
                                placeholder="0,00"
                              />
                            </div>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div>
            <label className="block text-[9px] font-mono uppercase text-stone-500 font-bold mb-1">Observações Internas / Recomendações</label>
            <textarea
              value={formObservations}
              onChange={(e) => setFormObservations(e.target.value)}
              placeholder="Digite notas sobre descontos, agilidade de atendimento ou preferência de fornecedor..."
              className="w-full bg-white border border-stone-200 py-1.5 px-3 text-xs focus:outline-none focus:border-stone-400 h-16 resize-none"
            />
          </div>

          <div className="flex justify-end gap-2 border-t border-stone-200 pt-4">
            <button
              type="button"
              onClick={() => { setIsCreating(false); setIsEditing(false); }}
              className="border border-stone-300 hover:bg-stone-50 text-stone-700 px-4 py-1.5 font-mono text-[11px] uppercase tracking-wider font-bold cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSaveForm}
              className="bg-stone-900 text-white hover:bg-stone-850 px-5 py-1.5 font-mono text-[11px] uppercase tracking-wider font-bold cursor-pointer flex items-center gap-1.5"
            >
              <CheckCircle2 size={13} />
              Gravar Comparativo
            </button>
          </div>
        </div>
      ) : activeSubTab === 'maps' ? (
        /* STANDARD MASTER-DETAIL CONTAINER */
        <div className="grid grid-cols-1 xl:grid-cols-4 divide-y xl:divide-y-0 xl:divide-x divide-stone-200">
          
          {/* LEFT PANEL: LIST OF QUOTATIONS */}
          <div className="p-4 space-y-3 bg-[#FAFBFB] print:hidden">
            <span className="text-[9px] font-mono uppercase tracking-widest text-stone-400 font-bold block">
              Histórico de Cotações ({maps.length})
            </span>

            <div className="space-y-2 max-h-[300px] xl:max-h-[550px] overflow-y-auto pr-1">
              {maps.length === 0 ? (
                <div className="text-center py-8 border border-dashed border-stone-200 text-stone-400 text-xs">
                  Nenhuma cotação cadastrada.
                </div>
              ) : (
                maps.map((map) => {
                  const isSelected = map.id === selectedMapId;
                  const bestSup = getBestSupplierGlobal(map);
                  const { total } = bestSup ? getSupplierTotal(map, bestSup) : { total: 0 };
                  
                  return (
                    <button
                      key={map.id}
                      type="button"
                      onClick={() => {
                        setSelectedMapId(map.id);
                        setIsCreating(false);
                        setIsEditing(false);
                      }}
                      className={`w-full text-left p-3 border transition-all cursor-pointer flex flex-col gap-1.5 rounded-none ${
                        isSelected 
                          ? 'bg-white border-stone-800 ring-1 ring-stone-800' 
                          : 'bg-white border-stone-200 hover:border-stone-400'
                      }`}
                    >
                      <div className="flex justify-between items-start gap-1">
                        <span className="font-mono text-[9px] font-bold text-stone-500">
                          MAPA #{map.number.toString().padStart(2, '0')}
                        </span>
                        <span className={`text-[8px] font-mono px-1.5 py-0.5 uppercase tracking-wider border font-bold ${
                          map.status === 'pago'
                            ? 'bg-emerald-600 text-white border-emerald-700'
                            : map.status === 'aprovado'
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                            : map.status === 'pendente'
                            ? 'bg-amber-50 text-amber-800 border-amber-200 animate-pulse'
                            : map.status === 'rejeitado'
                            ? 'bg-red-50 text-red-800 border-red-200'
                            : 'bg-stone-50 text-stone-600 border-stone-200'
                        }`}>
                          {map.status}
                        </span>
                      </div>

                      <h4 className="font-serif text-[11.5px] font-bold text-stone-900 leading-tight block truncate">
                        {map.title}
                      </h4>

                      <div className="flex justify-between items-center text-[9px] font-mono text-stone-400 pt-1.5 border-t border-stone-100">
                        <span>📅 {map.date}</span>
                        {bestSup && (
                          <span className="text-emerald-700 font-bold">
                            Min: {formatCurrency(total)}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* RIGHT PANEL: SELECTED QUOTATION DETAILS */}
          <div className="xl:col-span-3 p-5 space-y-5 print:p-0 print:space-y-0">
            {!selectedMap ? (
              <div className="text-center py-16 text-stone-400 space-y-2">
                <ClipboardList size={30} className="mx-auto text-stone-300" />
                <p className="text-xs">Selecione uma cotação na lista lateral para visualizar a análise completa.</p>
              </div>
            ) : (
              <div className="space-y-5 print:space-y-0">
                
                {/* STATUS BAR & ACTION BUTTONS */}
                <div className="bg-[#FAFBFB] border border-stone-200 p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4 print:hidden">
                  <div>
                    <span className="text-[8px] font-mono uppercase text-stone-400 font-bold">Status Atual</span>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={`text-[10px] font-mono px-2 py-0.5 uppercase tracking-wider border font-bold ${
                        selectedMap.status === 'pago'
                          ? 'bg-emerald-600 text-white border-emerald-700'
                          : selectedMap.status === 'aprovado'
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                          : selectedMap.status === 'pendente'
                          ? 'bg-amber-50 text-amber-800 border-amber-200'
                          : selectedMap.status === 'rejeitado'
                          ? 'bg-red-50 text-red-800 border-red-200'
                          : 'bg-stone-50 text-stone-600 border-stone-200'
                      }`}>
                        {selectedMap.status}
                      </span>
                      {selectedMap.status === 'aprovado' && (
                        <span className="text-[10px] text-emerald-800 font-sans flex items-center gap-1 font-semibold">
                          <ShieldCheck size={14} className="text-emerald-600" />
                          Compra Autorizada
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 print:hidden">
                    {/* JPEG EXPORT BUTTON */}
                    <button
                      type="button"
                      onClick={handleExportJPEG}
                      disabled={exporting}
                      className="bg-stone-100 hover:bg-stone-200 text-stone-800 border border-stone-300 px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider font-bold cursor-pointer flex items-center gap-1.5"
                    >
                      {exporting ? (
                        <>Gerando JPEG...</>
                      ) : (
                        <>
                          <FileImage size={13} />
                          Exportar JPEG
                        </>
                      )}
                    </button>

                    {/* VECTOR PDF EXPORT BUTTON */}
                    <button
                      type="button"
                      onClick={handleExportPDF}
                      disabled={exportingPDF}
                      className="bg-stone-100 hover:bg-stone-200 text-stone-800 border border-stone-300 px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider font-bold cursor-pointer flex items-center gap-1.5"
                    >
                      {exportingPDF ? (
                        <>Gerando PDF...</>
                      ) : (
                        <>
                          <FileDown size={13} />
                          Exportar PDF (A4)
                        </>
                      )}
                    </button>

                    {/* NATIVE PRINT/PDF BUTTON */}
                    <button
                      type="button"
                      onClick={handlePrint}
                      className="bg-stone-900 hover:bg-stone-850 text-white border border-stone-950 px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider font-bold cursor-pointer flex items-center gap-1.5"
                    >
                      <Printer size={13} />
                      Imprimir / Salvar PDF
                    </button>

                    {/* ADMIN PRIVILEGES */}
                    {!readOnly && (
                      <>
                        <button
                          type="button"
                          onClick={() => openEditForm(selectedMap)}
                          className="bg-stone-100 hover:bg-stone-200 text-stone-800 border border-stone-300 px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider font-bold cursor-pointer flex items-center gap-1.5"
                        >
                          <Edit size={13} />
                          Editar
                        </button>

                        {selectedMap.status === 'rascunho' && (
                          <button
                            type="button"
                            onClick={handleSendToClient}
                            className="bg-emerald-800 hover:bg-emerald-900 text-white px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider font-bold cursor-pointer flex items-center gap-1.5"
                          >
                            <Check size={13} />
                            Enviar ao Cliente
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => handleDeleteMap(selectedMap.id)}
                          className="bg-white border border-red-200 text-red-700 hover:bg-red-50 px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider font-bold cursor-pointer flex items-center gap-1.5"
                        >
                          <Trash2 size={13} />
                          Excluir
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* SHOWING WHO AUTHORIZED */}
                {selectedMap.status === 'aprovado' && (
                  <div className="bg-emerald-50 border border-emerald-200 p-4 flex items-start gap-3 print:hidden">
                    <ShieldCheck className="text-emerald-700 mt-0.5 shrink-0" size={20} />
                    <div className="space-y-1">
                      <h4 className="font-sans font-bold text-emerald-950 text-xs uppercase tracking-wider">
                        Compra Homologada e Autorizada pelo Cliente
                      </h4>
                      <p className="text-[11.5px] text-emerald-800 leading-relaxed">
                        Este mapa de cotação foi assinado digitalmente e autorizado por <strong>{selectedMap.authorizedBy || 'Cliente'}</strong> em <strong>{selectedMap.authorizedAt}</strong>. 
                        A compra foi direcionada ao fornecedor <strong>{selectedMap.suppliers.find(s => s.id === selectedMap.selectedSupplierId)?.name}</strong>.
                      </p>
                    </div>
                  </div>
                )}

                {/* NF STATUS / INFO (IF PAID) */}
                {selectedMap.status === 'pago' && (
                  <div className="bg-stone-50 border border-stone-200 p-4 space-y-3 print:hidden">
                    <div className="flex items-start gap-3">
                      <div className="p-2 bg-emerald-50 text-emerald-800 border border-emerald-200 shrink-0">
                        <CheckCircle2 size={18} />
                      </div>
                      <div className="space-y-1">
                        <h4 className="font-serif text-xs uppercase font-bold text-stone-900 tracking-wider">
                          Cotação Liquidada (Status: Pago)
                        </h4>
                        <p className="text-xs text-stone-600">
                          A nota fiscal correspondente a esta compra foi anexada e analisada com sucesso pela Inteligência Artificial.
                        </p>
                      </div>
                    </div>
                    {selectedMap.invoiceScannedData && (
                      <div className="bg-white border border-stone-150 p-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                        <div>
                          <span className="block text-[8px] font-mono uppercase text-stone-400 font-bold">Fornecedor</span>
                          <span className="font-sans font-bold text-stone-800">{selectedMap.invoiceScannedData.supplier}</span>
                        </div>
                        <div>
                          <span className="block text-[8px] font-mono uppercase text-stone-400 font-bold">Valor Pago</span>
                          <span className="font-mono font-bold text-emerald-700">{formatCurrency(selectedMap.invoiceScannedData.value)}</span>
                        </div>
                        <div>
                          <span className="block text-[8px] font-mono uppercase text-stone-400 font-bold">Data da Compra</span>
                          <span className="font-mono text-stone-600">{selectedMap.invoiceScannedData.date}</span>
                        </div>
                        <div>
                          <span className="block text-[8px] font-mono uppercase text-stone-400 font-bold">Número da NF</span>
                          <span className="font-mono text-stone-600">#{selectedMap.invoiceNumber || 'Não inf.'}</span>
                        </div>
                      </div>
                    )}
                    {selectedMap.invoiceUrl && (
                      <div className="flex justify-end">
                        {selectedMap.invoiceUrl.startsWith('http') ? (
                          <a
                            href={selectedMap.invoiceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 bg-white border border-stone-200 px-3 py-1 font-mono text-[9px] uppercase tracking-wider font-bold text-stone-700 hover:bg-stone-50"
                          >
                            <ExternalLink size={11} />
                            Visualizar Anexo ↗
                          </a>
                        ) : (
                          <span className="font-mono text-[9px] text-stone-400 italic">
                            📄 {selectedMap.invoiceUrl}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* ATTACH INVOICE SECTION (IF PENDING OR APPROVED) */}
                {(selectedMap.status === 'pendente' || selectedMap.status === 'aprovado') && (
                  <div className="bg-white border border-stone-200 p-5 space-y-4 print:hidden">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-stone-100 pb-3">
                      <div>
                        <h4 className="font-serif text-xs uppercase font-bold text-stone-900 tracking-wider flex items-center gap-1.5">
                          <Paperclip size={14} className="text-stone-700" />
                          Anexar Nota Fiscal de Compra (NF)
                        </h4>
                        <p className="text-[10px] text-stone-500 mt-0.5">
                          Anexe o arquivo de compra para liquidar esta cotação como "Paga" e registrar o gasto automaticamente.
                        </p>
                      </div>
                      

                    </div>

                    {!nfFile ? (
                      <div className="space-y-2">
                        {/* Dual Upload Buttons for NF Scanned */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1">
                          <button
                            type="button"
                            onClick={() => nfFileInputRef.current?.click()}
                            className="flex items-center justify-center gap-2 border-2 border-dashed border-stone-200 hover:border-stone-400 bg-white hover:bg-[#FAF9F6] py-4 px-3 text-xs font-mono uppercase font-bold tracking-wider text-stone-800 transition-all cursor-pointer"
                          >
                            <Upload size={14} className="text-stone-500" />
                            <span>Adicionar Arquivo Local</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => cameraNfInputRef.current?.click()}
                            className="flex items-center justify-center gap-2 border-2 border-dashed border-stone-200 hover:border-stone-400 bg-white hover:bg-[#FAF9F6] py-4 px-3 text-xs font-mono uppercase font-bold tracking-wider text-stone-800 transition-all cursor-pointer"
                          >
                            <Camera size={14} className="text-stone-500" />
                            <span>Tirar Foto</span>
                          </button>
                        </div>

                        <input
                          type="file"
                          ref={nfFileInputRef}
                          onChange={handleNfFileChange}
                          accept="image/*,application/pdf,.xlsx,.xls,.doc,.docx"
                          className="hidden"
                        />

                        <input
                          type="file"
                          ref={cameraNfInputRef}
                          onChange={handleNfFileChange}
                          accept="image/*"
                          capture="environment"
                          className="hidden"
                        />
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {/* Selected File Info */}
                        <div className="bg-stone-50 border border-stone-200 p-3 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Paperclip size={14} className="text-stone-500" />
                            <span className="font-mono text-xs text-stone-700 truncate max-w-xs">{nfFile.name}</span>
                          </div>
                          <button
                            type="button"
                            onClick={handleCancelNfScanned}
                            className="text-stone-400 hover:text-stone-600 p-1"
                          >
                            <X size={14} />
                          </button>
                        </div>

                        {/* Loading / Parsing indicator */}
                        {isParsingNf && (
                          <div className="p-8 text-center space-y-2 border border-stone-150 bg-stone-50/50">
                            <Loader2 size={24} className="animate-spin mx-auto text-stone-600" />
                            <p className="font-serif text-xs font-bold text-stone-850 flex items-center justify-center gap-1.5 animate-pulse">
                              <Sparkles size={13} className="text-stone-700" />
                              Inteligência Artificial analisando a Nota Fiscal...
                            </p>
                            <p className="text-[10px] text-stone-400 font-mono">Extraindo fornecedor, valores, data de emissão e itens.</p>
                          </div>
                        )}

                        {/* Error scan display */}
                        {nfAiError && (
                          <div className="p-4 bg-red-50 border border-red-200 flex items-start gap-2 text-xs text-red-800">
                            <AlertCircle size={15} className="shrink-0 mt-0.5 text-red-600" />
                            <div className="space-y-1">
                              <p className="font-bold">Falha ao escanear com IA</p>
                              <p className="text-[11px] opacity-90">{nfAiError}</p>
                              <button
                                type="button"
                                onClick={() => triggerNfAiScan(nfFile.base64, nfFile.type, nfFile.name)}
                                className="underline font-mono text-[10px] font-bold block mt-1 hover:text-red-950"
                              >
                                Tentar novamente
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Scanned Data Form Confirmation */}
                        {nfScannedData && (
                          <div className="bg-stone-50/50 border border-stone-200 p-4 space-y-3">
                            <h5 className="font-serif text-[11px] uppercase tracking-wider font-bold text-stone-900 border-b border-stone-100 pb-1.5 flex items-center gap-1">
                              <Sparkles size={11} className="text-stone-700" />
                              Verificação de Dados Extraídos pela IA
                            </h5>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                              <div>
                                <label className="block text-[8px] font-mono uppercase text-stone-400 font-bold mb-0.5">Fornecedor Identificado</label>
                                <input
                                  type="text"
                                  value={nfScannedData.supplier}
                                  onChange={(e) => setNfScannedData({ ...nfScannedData, supplier: e.target.value })}
                                  className="w-full bg-white border border-stone-200 py-1 px-2 font-semibold text-stone-850 focus:outline-none"
                                />
                              </div>

                              <div>
                                <label className="block text-[8px] font-mono uppercase text-stone-400 font-bold mb-0.5">Valor Total da NF</label>
                                <div className="flex items-center bg-white border border-stone-200 px-2 py-0.5">
                                  <span className="text-[10px] text-stone-400 mr-1 font-mono">R$</span>
                                  <input
                                    type="number"
                                    step="0.01"
                                    value={nfScannedData.value}
                                    onChange={(e) => setNfScannedData({ ...nfScannedData, value: parseFloat(e.target.value) || 0 })}
                                    className="w-full bg-white border-0 p-0 font-mono focus:outline-none text-stone-850"
                                  />
                                </div>
                              </div>

                              <div>
                                <label className="block text-[8px] font-mono uppercase text-stone-400 font-bold mb-0.5">Data de Emissão / Pagamento</label>
                                <input
                                  type="date"
                                  value={nfScannedData.date}
                                  onChange={(e) => setNfScannedData({ ...nfScannedData, date: e.target.value })}
                                  className="w-full bg-white border border-stone-200 py-1 px-2 font-mono text-stone-700 focus:outline-none"
                                />
                              </div>

                              <div>
                                <label className="block text-[8px] font-mono uppercase text-stone-400 font-bold mb-0.5">Número da Nota Fiscal (NF-e)</label>
                                <input
                                  type="text"
                                  value={nfScannedData.invoiceNumber}
                                  onChange={(e) => setNfScannedData({ ...nfScannedData, invoiceNumber: e.target.value })}
                                  placeholder="Não identificado"
                                  className="w-full bg-white border border-stone-200 py-1 px-2 font-mono text-stone-700 focus:outline-none"
                                />
                              </div>

                              <div className="sm:col-span-2">
                                <label className="block text-[8px] font-mono uppercase text-stone-400 font-bold mb-0.5">Descrição / Finalidade</label>
                                <input
                                  type="text"
                                  value={nfScannedData.description}
                                  onChange={(e) => setNfScannedData({ ...nfScannedData, description: e.target.value })}
                                  placeholder={`Compra para ${selectedMap.title}`}
                                  className="w-full bg-white border border-stone-200 py-1 px-2 text-stone-700 focus:outline-none"
                                />
                              </div>
                            </div>

                            {/* Finalize scan confirm buttons */}
                            <div className="flex justify-end gap-2 border-t border-stone-100 pt-3">
                              <button
                                type="button"
                                onClick={handleCancelNfScanned}
                                className="border border-stone-300 hover:bg-stone-50 text-stone-700 px-3 py-1 font-mono text-[10px] uppercase font-bold"
                              >
                                Cancelar
                              </button>
                              <button
                                type="button"
                                onClick={handleSaveNfScanned}
                                disabled={isUploadingNfToDrive}
                                className="bg-emerald-800 hover:bg-emerald-900 disabled:bg-emerald-800/60 text-white px-4 py-1 font-mono text-[10px] uppercase tracking-wider font-bold cursor-pointer flex items-center gap-1.5"
                              >
                                {isUploadingNfToDrive ? (
                                  <>
                                    <Loader2 size={11} className="animate-spin" />
                                    Enviando para o Telegram...
                                  </>
                                ) : (
                                  <>
                                    <CheckCircle2 size={11} />
                                    Confirmar Lançamento e Pagar
                                  </>
                                )}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* HIGH FIDELITY PRINTABLE / CAPTURABLE CONTAINER */}
                <div 
                  id="quotation-map-capture" 
                  ref={captureRef}
                  className="bg-white border border-stone-200 p-6 md:p-8 space-y-6 relative"
                >
                  {/* Decorative Border Frame */}
                  <div className="absolute inset-2 border border-stone-150 pointer-events-none" />

                  {/* Document Header */}
                  <div className="flex flex-col md:flex-row justify-between items-start border-b-2 border-stone-900 pb-5 gap-4 relative z-10">
                    <div className="space-y-2">
                      <span className="font-mono text-[10px] font-bold text-stone-500 uppercase tracking-widest block">
                        DOCUMENTO TÉCNICO DE COTAÇÃO • MAPA DE PREÇOS
                      </span>
                      <h1 className="font-serif text-xl md:text-2xl font-bold text-stone-950 uppercase tracking-tight">
                        MAPA DE COTAÇÃO #{selectedMap.number.toString().padStart(2, '0')}
                      </h1>
                      <p className="text-[11px] text-stone-600 font-sans leading-tight">
                        <strong>Obra / Projeto:</strong> {project?.name || "Obra CBC"}
                        {project?.clientId && <span className="ml-4"><strong>Cliente:</strong> {clientName}</span>}
                      </p>
                    </div>

                    <div className="text-left md:text-right space-y-1 bg-stone-50 p-2.5 border border-stone-200 md:self-end">
                      <span className="block text-[8px] font-mono uppercase text-stone-400 font-bold">Data de Emissão</span>
                      <span className="font-mono text-xs font-bold text-stone-800 block">📅 {selectedMap.date}</span>
                      <span className="block text-[8.5px] font-mono uppercase font-bold text-stone-500 mt-1">
                        Código: CBC-MC-{selectedMap.number.toString().padStart(3, '0')}
                      </span>
                    </div>
                  </div>

                  {/* Summary context */}
                  <div className="space-y-1 relative z-10">
                    <h3 className="font-serif text-sm font-bold text-stone-900">
                      {selectedMap.title}
                    </h3>
                    {selectedMap.observations && (
                      <p className="text-[11px] text-stone-500 italic leading-relaxed">
                        <strong>Observações da Cotação:</strong> {selectedMap.observations}
                      </p>
                    )}
                  </div>

                  {/* CENTRAL MATRIX COMPARISON TABLE */}
                  <div className="border border-stone-300 overflow-x-auto relative z-10 bg-white">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-stone-100 border-b-2 border-stone-300">
                          <th className="p-3 font-mono text-[10px] uppercase text-stone-800 font-bold border-r border-stone-250 w-2/5">
                            Especificação do Material / Quantidade
                          </th>
                          {selectedMap.suppliers.map((sup, idx) => {
                            const isRecommended = getBestSupplierGlobal(selectedMap)?.id === sup.id;
                            return (
                              <th 
                                key={sup.id} 
                                className={`p-3 text-center border-r border-stone-250 last:border-r-0 ${
                                  isRecommended ? 'bg-amber-50/50' : 'bg-stone-50'
                                }`}
                              >
                                <span className="block text-[8px] font-mono text-stone-400 font-bold">FORNECEDOR {idx + 1}</span>
                                <span className="block font-sans font-bold text-stone-900 text-xs truncate max-w-[150px]">
                                  {sup.name}
                                </span>
                                {isRecommended && (
                                  <span className="inline-block bg-amber-100 text-amber-800 border border-amber-200 text-[7px] font-mono font-bold uppercase tracking-wider px-1.5 py-0.2 mt-0.5">
                                    Custo Global Min
                                  </span>
                                )}
                              </th>
                            );
                          })}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-250 font-sans">
                        {selectedMap.items.map((item) => {
                          const { bestSupplierId } = getCheapestUnitPrice(selectedMap, item.id);
                          
                          return (
                            <tr key={item.id} className="hover:bg-stone-50/40">
                              <td className="p-3 border-r border-stone-200">
                                <span className="block font-medium text-stone-900 text-xs">
                                  {item.name}
                                </span>
                                <span className="block font-mono text-[9px] text-stone-500 mt-0.5">
                                  Qtd: <strong>{item.quantity} {item.unit}s</strong>
                                </span>
                              </td>
                              
                              {selectedMap.suppliers.map((sup) => {
                                const price = sup.itemPrices[item.id] || 0;
                                const totalItem = price * item.quantity;
                                const isCheapest = sup.id === bestSupplierId;

                                return (
                                  <td 
                                    key={sup.id} 
                                    className={`p-3 text-center border-r border-stone-200 last:border-r-0 transition-colors ${
                                      isCheapest ? 'bg-emerald-50/70' : ''
                                    }`}
                                  >
                                    <div className="space-y-0.5">
                                      <span className={`block font-mono text-xs font-bold ${isCheapest ? 'text-emerald-800' : 'text-stone-700'}`}>
                                        {price > 0 ? formatCurrency(price) : 'Não cotado'}
                                      </span>
                                      {price > 0 && (
                                        <span className="block font-mono text-[9px] text-stone-400">
                                          Total: {formatCurrency(totalItem)}
                                        </span>
                                      )}
                                      {isCheapest && price > 0 && (
                                        <span className="inline-flex items-center gap-0.5 text-emerald-700 text-[8px] font-mono uppercase font-bold bg-emerald-100/60 px-1 py-0.2">
                                          <Check size={8} /> Melhor Preço
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })}

                        {/* SUMMARIZED FOOTER VALUES */}
                        <tr className="bg-stone-50/80 border-t border-stone-300 font-mono text-[10.5px]">
                          <td className="p-3 font-bold uppercase text-stone-600 border-r border-stone-200">
                            Subtotal de Itens
                          </td>
                          {selectedMap.suppliers.map((sup) => {
                            const { subtotal } = getSupplierTotal(selectedMap, sup);
                            return (
                              <td key={sup.id} className="p-3 text-center font-bold text-stone-850 border-r border-stone-200 last:border-r-0">
                                {formatCurrency(subtotal)}
                              </td>
                            );
                          })}
                        </tr>

                        <tr className="bg-stone-50/80 border-t border-stone-200 font-mono text-[10.5px]">
                          <td className="p-3 font-bold uppercase text-stone-600 border-r border-stone-200">
                            Custo do Frete
                          </td>
                          {selectedMap.suppliers.map((sup) => (
                            <td key={sup.id} className="p-3 text-center text-stone-700 border-r border-stone-200 last:border-r-0">
                              {sup.deliveryFee > 0 ? formatCurrency(sup.deliveryFee) : <span className="text-emerald-700 font-bold">Grátis</span>}
                            </td>
                          ))}
                        </tr>

                        {/* FINAL RECOMMENDATION LINE GRAND TOTAL */}
                        <tr className="bg-stone-900 text-white font-mono text-xs font-bold border-t-2 border-stone-950">
                          <td className="p-3 uppercase border-r border-stone-800">
                            VALOR TOTAL DA COMPRA
                          </td>
                          {selectedMap.suppliers.map((sup) => {
                            const { total } = getSupplierTotal(selectedMap, sup);
                            const isBest = getBestSupplierGlobal(selectedMap)?.id === sup.id;
                            const isAuthorized = selectedMap.selectedSupplierId === sup.id;

                            return (
                              <td 
                                key={sup.id} 
                                className={`p-3 text-center border-r border-stone-800 last:border-r-0 relative overflow-hidden ${
                                  isAuthorized 
                                    ? 'bg-emerald-800 text-white' 
                                    : isBest 
                                    ? 'bg-[#2A2A28] text-white' 
                                    : ''
                                }`}
                              >
                                <span className="block text-[13px] font-black tracking-tight">{formatCurrency(total)}</span>
                                {isAuthorized ? (
                                  <span className="block text-[7px] font-mono uppercase font-black text-emerald-200 tracking-widest mt-0.5">
                                    ★ AUTORIZADO
                                  </span>
                                ) : isBest ? (
                                  <span className="block text-[7px] font-mono uppercase font-black text-amber-400 tracking-widest mt-0.5">
                                    RECOMENDADO
                                  </span>
                                ) : null}
                              </td>
                            );
                          })}
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {/* SUPPLIER DETAILS GRID CARD INFO */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1 relative z-10">
                    {selectedMap.suppliers.map((sup, idx) => {
                      const isBest = getBestSupplierGlobal(selectedMap)?.id === sup.id;
                      const isAuthorized = selectedMap.selectedSupplierId === sup.id;

                      return (
                        <div 
                          key={sup.id} 
                          className={`p-3.5 border text-xs flex flex-col justify-between gap-3 bg-stone-50 ${
                            isAuthorized 
                              ? 'border-emerald-600 bg-emerald-50/20' 
                              : isBest 
                              ? 'border-stone-400 bg-[#FCFBF9]' 
                              : 'border-stone-200'
                          }`}
                        >
                          <div className="space-y-2">
                            <div className="flex justify-between items-center border-b border-stone-200 pb-1.5">
                              <h4 className="font-sans font-bold text-stone-900 leading-tight">
                                {sup.name}
                              </h4>
                              <span className="font-mono text-[8px] bg-stone-200 text-stone-700 px-1 py-0.2 font-bold uppercase tracking-wider">
                                Fornecedor {idx + 1}
                              </span>
                            </div>

                            <ul className="space-y-1 text-[11px] text-stone-600 font-sans">
                              <li className="flex items-center gap-1.5">
                                <Phone size={11} className="text-stone-400" />
                                <span className="truncate"><strong>Fone:</strong> {sup.phone || 'Não inf.'}</span>
                              </li>
                              <li className="flex items-center gap-1.5">
                                <Mail size={11} className="text-stone-400" />
                                <span className="truncate"><strong>Email:</strong> {sup.email || 'Não inf.'}</span>
                              </li>
                              <li className="flex items-center gap-1.5">
                                <Truck size={11} className="text-stone-400" />
                                <span><strong>Prazo:</strong> {sup.deliveryTime || 'Não inf.'}</span>
                              </li>
                              <li className="flex items-start gap-1.5">
                                <Calendar size={11} className="text-stone-400 mt-0.5" />
                                <span><strong>Pagamento:</strong> {sup.paymentTerms || 'Não inf.'}</span>
                              </li>
                            </ul>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* SIGNATURES BLOCK */}
                  <div className="border-t-2 border-dashed border-stone-300 pt-8 mt-4 grid grid-cols-1 md:grid-cols-2 gap-8 relative z-10">
                    <div className="space-y-3">
                      <span className="block text-[8px] font-mono uppercase text-stone-400 font-bold">Arquitetura / Gerenciamento CBC</span>
                      <div className="h-10 flex items-end">
                        <span className="font-mono text-xs text-stone-700 italic border-b border-stone-300 pb-1 w-full max-w-[250px]">
                          Responsável Técnico CBC
                        </span>
                      </div>
                      <p className="text-[10px] text-stone-400 max-w-sm">
                        Documento emitido eletronicamente pela equipe de gerenciamento técnico, atestando conformidade com a lista de materiais do planejamento físico-financeiro da obra.
                      </p>
                    </div>

                    <div className="space-y-3 flex flex-col items-start md:items-end md:text-right">
                      <span className="block text-[8px] font-mono uppercase text-stone-400 font-bold">Homologação do Proprietário / Cliente</span>
                      <div className="h-10 flex items-end justify-end w-full max-w-[250px] border-b border-stone-300 pb-1 text-center">
                        {selectedMap.status === 'aprovado' ? (
                          <div className="flex flex-col items-center justify-end w-full">
                            <span className="font-serif text-xs text-emerald-800 font-bold uppercase tracking-widest flex items-center gap-1">
                              <ShieldCheck size={14} /> AUTORIZADO DIGITALMENTE
                            </span>
                            <span className="text-[8px] font-mono text-stone-500">
                              Por {selectedMap.authorizedBy} em {selectedMap.authorizedAt}
                            </span>
                          </div>
                        ) : selectedMap.status === 'rejeitado' ? (
                          <span className="text-xs text-red-600 font-bold font-mono">REJEITADO PELO CLIENTE</span>
                        ) : (
                          <span className="text-stone-300 text-[11px] font-sans italic">Aguardando Aprovação Formal</span>
                        )}
                      </div>
                      <p className="text-[10px] text-stone-400 max-w-sm">
                        Ao assinar ou clicar em autorizar, o contratante valida os materiais especificados, o fornecedor eleito, os contatos e os valores totais deste comparativo.
                      </p>
                    </div>
                  </div>
                </div>

              </div>
            )}
          </div>

        </div>
      ) : activeSubTab === 'suppliers' ? (
        <div className="p-6 space-y-6 bg-stone-50/20">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-stone-200 pb-5">
            <div>
              <h4 className="font-serif text-base text-stone-900 font-bold uppercase tracking-tight flex items-center gap-2">
                🏬 Banco de Fornecedores & Contatos
              </h4>
              <p className="text-[11px] text-stone-500 mt-1">
                Vincule seus contatos do Google, organize por categorias e destaque os parceiros mais utilizados em suas obras.
              </p>
            </div>
            
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowAddManualSupplier(!showAddManualSupplier);
                  setIsEditingSupplierId(null);
                }}
                className="bg-stone-950 text-white hover:bg-stone-850 px-3.5 py-1.5 text-xs font-mono font-bold flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <Plus size={14} />
                {showAddManualSupplier ? 'Fechar Formulário' : 'Novo Fornecedor'}
              </button>

              {googleAccessToken ? (
                <div className="flex items-center gap-2 bg-stone-100 border border-stone-200 py-1 px-2.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
                  <span className="text-[10px] font-mono font-bold text-stone-600 truncate max-w-[120px]">
                    Google Contacts Conectado
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setShowGoogleContactsSyncPanel(!showGoogleContactsSyncPanel);
                      if (!showGoogleContactsSyncPanel && googleContacts.length === 0) {
                        handleFetchGoogleContacts();
                      }
                    }}
                    className="text-[10px] font-mono font-bold text-stone-900 hover:underline ml-2 cursor-pointer"
                  >
                    {showGoogleContactsSyncPanel ? 'Ocultar Contatos' : 'Ver Contatos ↗'}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleGoogleLogin}
                  disabled={googleIsLoggingIn}
                  className="bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-950 px-3.5 py-1.5 text-xs font-mono font-bold flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  <Users size={14} className="text-amber-700" />
                  {googleIsLoggingIn ? 'Conectando...' : 'Vincular Google Contacts'}
                </button>
              )}
            </div>
          </div>

          {/* ADD MANUAL SUPPLIER FORM CONTAINER */}
          {showAddManualSupplier && (
            <div className="bg-white border border-stone-300 p-5 space-y-4 shadow-sm animate-fade-in">
              <div className="border-b border-stone-150 pb-2 flex justify-between items-center">
                <h5 className="font-serif text-xs font-bold text-stone-900 uppercase tracking-tight">
                  Cadastrar Novo Fornecedor Manualmente
                </h5>
                <button 
                  type="button" 
                  onClick={() => setShowAddManualSupplier(false)}
                  className="text-stone-400 hover:text-stone-600 cursor-pointer"
                >
                  <X size={15} />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[10px] font-mono uppercase font-bold text-stone-500 mb-1">Nome / Razão Social *</label>
                  <input
                    type="text"
                    value={newManualName}
                    onChange={(e) => setNewManualName(e.target.value)}
                    placeholder="Ex: Depósito Silva"
                    className="w-full bg-white border border-stone-200 py-1.5 px-3 text-xs focus:outline-none focus:border-stone-400 font-medium"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-mono uppercase font-bold text-stone-500 mb-1">Telefone</label>
                  <input
                    type="text"
                    value={newManualPhone}
                    onChange={(e) => setNewManualPhone(e.target.value)}
                    placeholder="Ex: (11) 99999-9999"
                    className="w-full bg-white border border-stone-200 py-1.5 px-3 text-xs focus:outline-none focus:border-stone-400 font-medium"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-mono uppercase font-bold text-stone-500 mb-1">E-mail</label>
                  <input
                    type="email"
                    value={newManualEmail}
                    onChange={(e) => setNewManualEmail(e.target.value)}
                    placeholder="Ex: contato@fornecedor.com"
                    className="w-full bg-white border border-stone-200 py-1.5 px-3 text-xs focus:outline-none focus:border-stone-400 font-medium"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-mono uppercase font-bold text-stone-500 mb-1">Condições de Pagamento</label>
                  <input
                    type="text"
                    value={newManualPayment}
                    onChange={(e) => setNewManualPayment(e.target.value)}
                    placeholder="Ex: Boleto 30d, Pix"
                    className="w-full bg-white border border-stone-200 py-1.5 px-3 text-xs focus:outline-none focus:border-stone-400 font-medium"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-mono uppercase font-bold text-stone-500 mb-1">Prazo de Entrega</label>
                  <input
                    type="text"
                    value={newManualTime}
                    onChange={(e) => setNewManualTime(e.target.value)}
                    placeholder="Ex: 2 dias úteis"
                    className="w-full bg-white border border-stone-200 py-1.5 px-3 text-xs focus:outline-none focus:border-stone-400 font-medium"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-mono uppercase font-bold text-stone-500 mb-1">Categoria de Fornecimento</label>
                  <select
                    value={newManualCategory}
                    onChange={(e) => setNewManualCategory(e.target.value)}
                    className="w-full bg-white border border-stone-200 py-1.5 px-3 text-xs focus:outline-none focus:border-stone-400 font-bold"
                  >
                    <option value="Materiais">Materiais</option>
                    <option value="Mão de Obra">Mão de Obra</option>
                    <option value="Projetos e Engenharia">Projetos e Engenharia</option>
                    <option value="Acabamento">Acabamento</option>
                    <option value="Elétrica e Hidráulica">Elétrica e Hidráulica</option>
                    <option value="Estrutura e Metalurgia">Estrutura e Metalurgia</option>
                    <option value="Taxas e Licenças">Taxas e Licenças</option>
                    <option value="Decoração">Decoração</option>
                    <option value="Outros">Outros</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddManualSupplier(false)}
                  className="bg-stone-100 hover:bg-stone-200 text-stone-700 px-4 py-1.5 text-xs font-mono font-bold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleCreateManualSupplier}
                  className="bg-stone-900 hover:bg-stone-850 text-white px-4 py-1.5 text-xs font-mono font-bold cursor-pointer"
                >
                  Salvar Fornecedor
                </button>
              </div>
            </div>
          )}

          {/* GOOGLE CONTACTS DIRECTORY EXPANSION VIEW */}
          {showGoogleContactsSyncPanel && googleAccessToken && (
            <div className="bg-[#FAF9F6] border border-stone-200 p-5 space-y-4 shadow-inner">
              <div className="flex justify-between items-center border-b border-stone-200 pb-2">
                <div className="flex items-center gap-2">
                  <span className="p-1.5 bg-amber-100 text-amber-800 text-xs flex items-center justify-center">
                    <Users size={14} />
                  </span>
                  <div>
                    <h5 className="font-serif text-xs font-bold text-stone-900 uppercase">
                      Seus Contatos do Google Contacts
                    </h5>
                    <p className="text-[10px] text-stone-500 font-sans">
                      Visualize e vincule rapidamente seus contatos do Google como fornecedores de obra.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleFetchGoogleContacts(googleAccessToken)}
                    disabled={isFetchingContacts}
                    className="p-1 hover:bg-stone-100 border border-stone-300 text-stone-600 disabled:opacity-50 cursor-pointer"
                    title="Atualizar Contatos"
                  >
                    <RefreshCw size={12} className={isFetchingContacts ? 'animate-spin' : ''} />
                  </button>
                  <button 
                    type="button" 
                    onClick={() => setShowGoogleContactsSyncPanel(false)}
                    className="text-stone-400 hover:text-stone-600 cursor-pointer"
                  >
                    <X size={15} />
                  </button>
                </div>
              </div>

              {contactsError ? (
                <div className="bg-red-50 border border-red-200 p-3 text-xs text-red-800 font-mono">
                  {contactsError}
                </div>
              ) : isFetchingContacts ? (
                <div className="py-8 flex flex-col items-center justify-center space-y-2">
                  <Loader2 className="animate-spin text-stone-400" size={24} />
                  <span className="text-xs text-stone-500 font-mono">Carregando contatos de sua conta Google...</span>
                </div>
              ) : googleContacts.length === 0 ? (
                <div className="py-6 text-center text-xs text-stone-400 font-mono">
                  Nenhum contato retornado do Google Contacts. Certifique-se de que possui contatos cadastrados.
                </div>
              ) : (
                <div className="space-y-3">
                  <span className="block text-[9px] font-mono uppercase text-stone-400 font-bold">
                    Contatos Disponíveis ({googleContacts.length})
                  </span>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[300px] overflow-y-auto pr-1">
                    {googleContacts.map((contact, cIdx) => {
                      const isAlreadyLinked = unifiedSuppliers.some(s => normalizeSupplierName(s.name) === normalizeSupplierName(contact.name));
                      return (
                        <div key={contact.resourceName || cIdx} className="bg-white border border-stone-200 p-3 flex flex-col justify-between gap-2.5 shadow-sm">
                          <div>
                            <div className="flex justify-between items-start">
                              <h6 className="font-sans font-bold text-xs text-stone-900 truncate max-w-[150px]" title={contact.name}>
                                {contact.name}
                              </h6>
                              {isAlreadyLinked || contact.isLinked ? (
                                <span className="text-[8px] font-mono font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 px-1.5 py-0.2 uppercase">
                                  Vinculado
                                </span>
                              ) : (
                                <span className="text-[8px] font-mono font-bold bg-stone-100 text-stone-600 px-1.5 py-0.2 uppercase">
                                  Google
                                </span>
                              )}
                            </div>
                            <div className="space-y-0.5 text-[10px] text-stone-500 font-sans mt-1">
                              <p className="truncate">{contact.email || "Sem e-mail"}</p>
                              <p>{contact.phone || "Sem fone"}</p>
                            </div>
                          </div>

                          {!(isAlreadyLinked || contact.isLinked) && (
                            <div className="border-t border-stone-100 pt-2 flex items-center justify-between gap-1.5">
                              <select
                                value={contact.category || 'Materiais'}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setGoogleContacts(prev => prev.map(c => {
                                    if (c.resourceName === contact.resourceName) {
                                      return { ...c, category: val };
                                    }
                                    return c;
                                  }));
                                }}
                                className="bg-stone-50 border border-stone-200 py-0.5 px-1.5 text-[9.5px] text-stone-700 font-bold focus:outline-none flex-grow"
                              >
                                <option value="Materiais">Materiais</option>
                                <option value="Mão de Obra">Mão de Obra</option>
                                <option value="Projetos e Engenharia">Projetos</option>
                                <option value="Acabamento">Acabamento</option>
                                <option value="Elétrica e Hidráulica">Elétrica</option>
                                <option value="Estrutura e Metalurgia">Estrutura</option>
                                <option value="Taxas e Licenças">Taxas</option>
                                <option value="Decoração">Decoração</option>
                                <option value="Outros">Outros</option>
                              </select>
                              <button
                                type="button"
                                onClick={() => handleLinkGoogleContact(contact, contact.category || 'Materiais')}
                                className="bg-stone-900 hover:bg-stone-850 text-white text-[9px] font-mono uppercase font-bold py-1 px-2.5 flex-shrink-0 transition-colors cursor-pointer"
                              >
                                Vincular
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* MAIN SEARCH & FEEDBACK CONTAINER */}
          <div className="max-w-xl mx-auto text-center space-y-4 py-4">
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400" size={16} />
              <input
                type="text"
                value={supplierSearchQuery}
                onChange={(e) => setSupplierSearchQuery(e.target.value)}
                placeholder="Digite o nome para buscar no banco de fornecedores..."
                className="w-full bg-white border-2 border-stone-300 hover:border-stone-400 focus:border-stone-900 py-2.5 pl-10 pr-4 text-xs focus:outline-none placeholder-stone-400 font-bold transition-colors shadow-sm"
              />
            </div>

            {/* Category Filter Pills */}
            <div className="space-y-1.5">
              <span className="block text-[8px] font-mono uppercase text-stone-400 font-bold">
                Filtrar por Categoria / Área:
              </span>
              <div className="flex flex-wrap justify-center gap-1 max-w-xl mx-auto">
                {[
                  { value: '', label: 'Todas as Áreas' },
                  { value: 'Materiais', label: 'Materiais' },
                  { value: 'Mão de Obra', label: 'Mão de Obra' },
                  { value: 'Projetos e Engenharia', label: 'Projetos & Eng.' },
                  { value: 'Acabamento', label: 'Acabamentos' },
                  { value: 'Elétrica e Hidráulica', label: 'Elétrica/Hidráulica' },
                  { value: 'Estrutura e Metalurgia', label: 'Estrutura/Metalurgia' },
                  { value: 'Outros', label: 'Outros' }
                ].map(item => (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => setSelectedCategoryFilter(item.value)}
                    className={`text-[9px] font-mono font-bold px-2.5 py-1 border transition-all cursor-pointer ${
                      selectedCategoryFilter === item.value
                        ? 'bg-stone-900 border-stone-950 text-white'
                        : 'bg-white border-stone-200 text-stone-600 hover:bg-stone-50'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
            
            <div className="flex items-center justify-center gap-2 pt-1">
              <input
                type="checkbox"
                id="showAllSuppliersCheckbox"
                checked={showAllSuppliers}
                onChange={(e) => setShowAllSuppliers(e.target.checked)}
                className="h-4 w-4 text-stone-900 border-stone-300 rounded focus:ring-0 cursor-pointer"
              />
              <label htmlFor="showAllSuppliersCheckbox" className="text-xs text-stone-700 font-bold select-none cursor-pointer">
                Mostrar todos os fornecedores cadastrados
              </label>
            </div>
            
            {supplierSearchQuery.trim() === '' && !showAllSuppliers && (
              <p className="text-[10.5px] text-stone-400 font-sans leading-relaxed">
                🔍 A lista de fornecedores está oculta para otimizar o espaço. 
                <br />
                <strong>Digite o nome de um parceiro</strong> para buscar, selecione uma categoria, ou marque a caixa acima para exibir todos.
              </p>
            )}
          </div>

          {/* SECTION 1: HIGHLIGHTED / MOST USED SUPPLIERS (isFavorite === true) */}
          {supplierSearchQuery.trim() === '' && !showAllSuppliers && (
            <div className="space-y-4">
              <div className="flex items-center gap-1.5 border-b border-stone-200 pb-1.5">
                <Star size={13} className="text-amber-500 fill-amber-500" />
                <h5 className="font-serif text-[11px] font-bold text-stone-900 uppercase tracking-wider">
                  Fornecedores em Destaque (Mais Utilizados)
                </h5>
                <span className="text-[8px] font-mono text-stone-400 font-bold">
                  ({unifiedSuppliers.filter(s => s.isFavorite).filter(s => selectedCategoryFilter === '' || s.category === selectedCategoryFilter).length} em destaque)
                </span>
              </div>

              {unifiedSuppliers.filter(s => s.isFavorite).filter(s => selectedCategoryFilter === '' || s.category === selectedCategoryFilter).length === 0 ? (
                <div className="text-center py-8 text-stone-400 text-xs bg-stone-50/50 border border-dashed border-stone-200">
                  {selectedCategoryFilter 
                    ? `Nenhum fornecedor em destaque na categoria "${selectedCategoryFilter}".` 
                    : "Nenhum fornecedor em destaque. Digite um nome na busca acima e clique na estrela do cartão para marcá-lo como preferido ou mais utilizado."}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {unifiedSuppliers
                    .filter(s => s.isFavorite)
                    .filter(s => selectedCategoryFilter === '' || s.category === selectedCategoryFilter)
                    .map((sup) => (
                      <div key={sup.id} className="bg-white border-2 border-amber-200 p-4 space-y-3 shadow-sm hover:border-amber-300 transition-all relative">
                        <button
                          type="button"
                          onClick={() => handleToggleFavorite(sup.id)}
                          className="absolute top-3.5 right-3.5 text-amber-500 hover:scale-110 transition-transform cursor-pointer"
                          title="Remover dos destaques"
                        >
                          <Star size={16} className="fill-amber-500" />
                        </button>

                        <div className="border-b border-stone-100 pb-2">
                          <span className="text-[8px] font-mono font-bold uppercase bg-amber-50 text-amber-800 border border-amber-200 px-1.5 py-0.5">
                            {sup.category || "Materiais"}
                          </span>
                          <h5 className="font-sans font-bold text-stone-900 text-xs mt-1.5 truncate pr-6" title={sup.name}>
                            {sup.name}
                          </h5>
                        </div>
                        
                        <div className="space-y-1 text-[11px] text-stone-600 font-sans">
                          <div className="flex items-center gap-2">
                            <Phone size={12} className="text-stone-400 flex-shrink-0" />
                            <span>{sup.phone || "Sem telefone"}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Mail size={12} className="text-stone-400 flex-shrink-0" />
                            <span className="truncate">{sup.email || "Sem e-mail"}</span>
                          </div>
                        </div>

                        <div className="border-t border-stone-100 pt-2 flex items-center justify-end gap-2 text-[10px] font-mono">
                          <button
                            type="button"
                            onClick={() => {
                              setIsEditingSupplierId(sup.id);
                              setEditSupplierName(sup.name);
                              setEditSupplierPhone(sup.phone || '');
                              setEditSupplierEmail(sup.email || '');
                              setEditSupplierPayment(sup.paymentTerms || '');
                              setEditSupplierTime(sup.deliveryTime || '');
                              setEditSupplierCategory(sup.category || 'Materiais');
                              setSupplierSearchQuery(sup.name);
                            }}
                            className="text-stone-600 hover:text-stone-900 font-bold cursor-pointer"
                          >
                            Editar
                          </button>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>
          )}

          {/* SECTION 2: SEARCH RESULTS (Only shown if search query has length > 0 or show all is active or a category is selected) */}
          {(supplierSearchQuery.trim() !== '' || showAllSuppliers || selectedCategoryFilter !== '') && (
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-stone-200 pb-1.5">
                <span className="text-[10px] font-mono text-stone-500 uppercase tracking-wider font-bold">
                  {showAllSuppliers && supplierSearchQuery.trim() === '' 
                    ? (selectedCategoryFilter ? `Todos os Fornecedores em "${selectedCategoryFilter}"` : 'Todos os Fornecedores Cadastrados') 
                    : (selectedCategoryFilter ? `Resultados da Busca - ${selectedCategoryFilter}` : 'Resultados da Busca')}
                </span>
                {(supplierSearchQuery.trim() !== '' || selectedCategoryFilter !== '') && (
                  <button
                    type="button"
                    onClick={() => {
                      setSupplierSearchQuery('');
                      setSelectedCategoryFilter('');
                    }}
                    className="text-[10px] font-mono text-stone-400 hover:text-stone-900 hover:underline cursor-pointer"
                  >
                    Limpar Filtros
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {unifiedSuppliers
                  .filter(s => s.name.toLowerCase().includes(supplierSearchQuery.toLowerCase()))
                  .filter(s => selectedCategoryFilter === '' || s.category === selectedCategoryFilter)
                  .map((sup) => {
                    const isEditing = isEditingSupplierId === sup.id;
                    return (
                      <div 
                        key={sup.id} 
                        className={`p-4 space-y-3 bg-white border shadow-sm transition-all relative ${
                          isEditing ? 'border-stone-900 ring-1 ring-stone-900' : 'border-stone-200 hover:border-stone-300'
                        }`}
                      >
                        {!isEditing && (
                          <button
                            type="button"
                            onClick={() => handleToggleFavorite(sup.id)}
                            className="absolute top-4 right-4 text-stone-400 hover:text-amber-500 transition-colors cursor-pointer"
                            title={sup.isFavorite ? "Remover dos favoritos" : "Marcar como favorito"}
                          >
                            <Star size={16} className={sup.isFavorite ? "fill-amber-500 text-amber-500" : ""} />
                          </button>
                        )}

                        {isEditing ? (
                          // INLINE EDIT FORM
                          <div className="space-y-2.5 text-xs">
                            <span className="text-[8px] font-mono uppercase font-bold text-stone-400">Editando Fornecedor</span>
                            <div>
                              <label className="block text-[8px] font-mono uppercase text-stone-500 font-bold mb-0.5">Nome</label>
                              <input
                                type="text"
                                value={editSupplierName}
                                onChange={(e) => setEditSupplierName(e.target.value)}
                                className="w-full bg-stone-50 border border-stone-200 px-2 py-1 text-xs focus:outline-none"
                              />
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="block text-[8px] font-mono uppercase text-stone-500 font-bold mb-0.5">Telefone</label>
                                <input
                                  type="text"
                                  value={editSupplierPhone}
                                  onChange={(e) => setEditSupplierPhone(e.target.value)}
                                  className="w-full bg-stone-50 border border-stone-200 px-2 py-1 text-xs focus:outline-none"
                                />
                              </div>
                              <div>
                                <label className="block text-[8px] font-mono uppercase text-stone-500 font-bold mb-0.5">E-mail</label>
                                <input
                                  type="email"
                                  value={editSupplierEmail}
                                  onChange={(e) => setEditSupplierEmail(e.target.value)}
                                  className="w-full bg-stone-50 border border-stone-200 px-2 py-1 text-xs focus:outline-none"
                                />
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="block text-[8px] font-mono uppercase text-stone-500 font-bold mb-0.5">Pagamento</label>
                                <input
                                  type="text"
                                  value={editSupplierPayment}
                                  onChange={(e) => setEditSupplierPayment(e.target.value)}
                                  className="w-full bg-stone-50 border border-stone-200 px-2 py-1 text-xs focus:outline-none"
                                />
                              </div>
                              <div>
                                <label className="block text-[8px] font-mono uppercase text-stone-500 font-bold mb-0.5">Entrega</label>
                                <input
                                  type="text"
                                  value={editSupplierTime}
                                  onChange={(e) => setEditSupplierTime(e.target.value)}
                                  className="w-full bg-stone-50 border border-stone-200 px-2 py-1 text-xs focus:outline-none"
                                />
                              </div>
                            </div>
                            <div>
                              <label className="block text-[8px] font-mono uppercase text-stone-500 font-bold mb-0.5">Categoria</label>
                              <select
                                value={editSupplierCategory}
                                onChange={(e) => setEditSupplierCategory(e.target.value)}
                                className="w-full bg-stone-50 border border-stone-200 px-2 py-1 text-xs focus:outline-none font-bold"
                              >
                                <option value="Materiais font-bold">Materiais</option>
                                <option value="Mão de Obra">Mão de Obra</option>
                                <option value="Projetos e Engenharia">Projetos e Engenharia</option>
                                <option value="Acabamento">Acabamento</option>
                                <option value="Elétrica e Hidráulica">Elétrica e Hidráulica</option>
                                <option value="Estrutura e Metalurgia">Estrutura e Metalurgia</option>
                                <option value="Taxas e Licenças">Taxas e Licenças</option>
                                <option value="Decoração">Decoração</option>
                                <option value="Outros">Outros</option>
                              </select>
                            </div>

                            <div className="flex justify-end gap-1.5 pt-1.5 border-t border-stone-100">
                              <button
                                type="button"
                                onClick={() => setIsEditingSupplierId(null)}
                                className="bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold font-mono px-2 py-1 text-[9px] uppercase cursor-pointer"
                              >
                                Cancelar
                              </button>
                              <button
                                type="button"
                                onClick={() => handleSaveSupplierEdit(sup.id)}
                                className="bg-stone-900 hover:bg-stone-850 text-white font-bold font-mono px-2.5 py-1 text-[9px] uppercase cursor-pointer"
                              >
                                Salvar
                              </button>
                            </div>
                          </div>
                        ) : (
                          // DEFAULT DISPLAY VIEW
                          <div className="flex flex-col h-full justify-between gap-3">
                            <div>
                              <div className="border-b border-stone-100 pb-2">
                                <span className="text-[8.5px] font-mono font-bold uppercase bg-stone-150 text-stone-700 px-2 py-0.5">
                                  {sup.category || "Materiais"}
                                </span>
                                <h5 className="font-sans font-bold text-stone-900 text-xs mt-1.5 truncate pr-6" title={sup.name}>
                                  {sup.name}
                                </h5>
                              </div>
                              
                              <div className="space-y-1.5 text-[11px] text-stone-600 font-sans mt-3">
                                <div className="flex items-center gap-2">
                                  <Phone size={12} className="text-stone-400 flex-shrink-0" />
                                  <span>{sup.phone || "Sem telefone"}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Mail size={12} className="text-stone-400 flex-shrink-0" />
                                  <span className="truncate">{sup.email || "Sem e-mail"}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Award size={12} className="text-stone-400 flex-shrink-0" />
                                  <span>Pagamento: <strong className="text-stone-800">{sup.paymentTerms || "Não definido"}</strong></span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Truck size={12} className="text-stone-400 flex-shrink-0" />
                                  <span>Entrega: <strong className="text-stone-800">{sup.deliveryTime || "Não definido"}</strong></span>
                                </div>
                              </div>
                            </div>

                            <div className="border-t border-stone-100 pt-2.5 flex items-center justify-between text-[10px] font-mono font-bold">
                              <button
                                type="button"
                                onClick={() => handleDeleteSupplier(sup.id)}
                                className="text-red-600 hover:text-red-800 cursor-pointer"
                              >
                                Excluir
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setIsEditingSupplierId(sup.id);
                                  setEditSupplierName(sup.name);
                                  setEditSupplierPhone(sup.phone || '');
                                  setEditSupplierEmail(sup.email || '');
                                  setEditSupplierPayment(sup.paymentTerms || '');
                                  setEditSupplierTime(sup.deliveryTime || '');
                                  setEditSupplierCategory(sup.category || 'Materiais');
                                }}
                                className="text-stone-700 hover:text-stone-900 cursor-pointer"
                              >
                                Editar dados
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                
                {unifiedSuppliers
                  .filter(s => s.name.toLowerCase().includes(supplierSearchQuery.toLowerCase()))
                  .filter(s => selectedCategoryFilter === '' || s.category === selectedCategoryFilter).length === 0 && (
                  <div className="col-span-full text-center py-12 text-stone-400 text-xs bg-white border border-dashed border-stone-200">
                    Nenhum fornecedor encontrado no banco local {selectedCategoryFilter ? `na categoria "${selectedCategoryFilter}"` : ''} para "{supplierSearchQuery}".
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="p-6 space-y-6 bg-stone-50/20">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-stone-200 pb-4">
            <div>
              <h4 className="font-serif text-sm text-stone-900 font-bold uppercase tracking-tight flex items-center gap-2">
                🏷️ Banco de Preços de Materiais (Média Geral)
              </h4>
              <p className="text-[11px] text-stone-500 mt-1">
                Valores médios reais pagos em materiais de todas as obras, extraídos de notas fiscais digitalizadas pela IA.
              </p>
            </div>
            <div className="w-full sm:w-64">
              <input
                type="text"
                value={materialSearchQuery}
                onChange={(e) => setMaterialSearchQuery(e.target.value)}
                placeholder="Buscar material por nome..."
                className="w-full bg-white border border-stone-200 py-1.5 px-3 text-xs focus:outline-none focus:border-stone-400 placeholder-stone-400 font-bold"
              />
            </div>
          </div>

          <div className="border border-stone-200 overflow-x-auto bg-white shadow-sm">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-stone-50 font-mono text-[9px] uppercase tracking-wider text-stone-500 border-b border-stone-200">
                  <th className="p-3">Material</th>
                  <th className="p-3 text-center">Unidade</th>
                  <th className="p-3 text-right">Preço Médio Pago</th>
                  <th className="p-3 text-center">Qtd. Total Paga</th>
                  <th className="p-3 text-right">Total Acumulado</th>
                  <th className="p-3">Última Atualização</th>
                  <th className="p-3">Histórico de Obras / Fornecedores</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 font-sans">
                {unifiedMaterials
                  .filter(m => m.name.toLowerCase().includes(materialSearchQuery.toLowerCase()))
                  .map((mat) => (
                    <tr key={mat.id} className="hover:bg-stone-50/50 align-top">
                      <td className="p-3 font-medium text-stone-900">
                        {mat.name}
                      </td>
                      <td className="p-3 text-center font-mono text-stone-500">
                        {mat.unit}
                      </td>
                      <td className="p-3 text-right font-mono font-bold text-emerald-700">
                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(mat.averageValue)}
                      </td>
                      <td className="p-3 text-center font-mono text-stone-700">
                        {mat.totalQuantityPaid}
                      </td>
                      <td className="p-3 text-right font-mono text-stone-800 font-medium">
                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(mat.totalSpent)}
                      </td>
                      <td className="p-3 font-mono text-stone-400">
                        {mat.lastUpdated}
                      </td>
                      <td className="p-3 space-y-1 w-80">
                        {mat.records?.slice(0, 3).map((rec, rIdx) => (
                          <div key={rIdx} className="bg-stone-50 border border-stone-150 p-1.5 text-[9.5px] leading-tight space-y-0.5">
                            <div className="flex justify-between font-mono font-bold text-stone-700">
                              <span>{rec.projectName}</span>
                              <span>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(rec.unitValue)}</span>
                            </div>
                            <div className="flex justify-between text-stone-500">
                              <span className="truncate max-w-[150px]">{rec.supplier}</span>
                              <span>{rec.date} (Qtd: {rec.quantity})</span>
                            </div>
                          </div>
                        ))}
                        {mat.records && mat.records.length > 3 && (
                          <div className="text-[8px] font-mono text-stone-400 text-right font-bold pr-1">
                            + {mat.records.length - 3} mais lançamentos
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                {unifiedMaterials.filter(m => m.name.toLowerCase().includes(materialSearchQuery.toLowerCase())).length === 0 && (
                  <tr>
                    <td colSpan={7} className="text-center py-12 text-stone-400 text-xs bg-white">
                      Nenhum material encontrado para esta busca.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
