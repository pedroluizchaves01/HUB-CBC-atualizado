import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Megaphone, 
  Calendar as CalendarIcon, 
  Plus, 
  Trash2, 
  Edit, 
  Search, 
  DollarSign, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  ExternalLink, 
  ChevronRight, 
  Instagram, 
  Target,
  ChevronLeft,
  Briefcase,
  FileText,
  Check,
  Copy,
  PlusCircle,
  Folder,
  Image as ImageIcon,
  Upload,
  X,
  Sliders,
  Send,
  Eye,
  Settings,
  Grid,
  FileCheck,
  HelpCircle,
  Link2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { subscribeCollection, saveDoc, removeDoc } from '../lib/firebaseDb';
import { MarketingOutbound, MarketingPost, MarketingPress, MarketingSettings } from '../types';

const DEFAULT_OUTBOUNDS: MarketingOutbound[] = [
  {
    id: 'out_1',
    name: 'Cesta de Fechamento - Obra Barra 14',
    type: 'brinde',
    contact: 'Carlos Alberto de Souza',
    date: '2026-07-20',
    status: 'planejado',
    cost: 450,
    notes: 'Cesta gourmet premium para comemorar a assinatura do contrato.'
  },
  {
    id: 'out_2',
    name: 'Coquetel com Corretores Prime',
    type: 'evento',
    contact: 'Imobiliária Lopes Alto Padrão',
    date: '2026-07-28',
    status: 'em_andamento',
    cost: 3200,
    notes: 'Apresentação dos novos projetos sustentáveis para corretores de luxo.'
  },
  {
    id: 'out_3',
    name: 'Prospecção Loteamento Joá',
    type: 'captacao',
    contact: 'Dra. Heloísa Meireles',
    date: '2026-07-12',
    status: 'realizado',
    cost: 0,
    notes: 'Apresentação de portfólio executivo e orçamento preliminar da casa de veraneio.'
  }
];

const DEFAULT_POSTS: MarketingPost[] = [
  {
    id: 'post_1',
    title: 'Visita Técnica Obra Barra da Tijuca',
    platform: 'Instagram',
    publishDate: '2026-07-15',
    status: 'agendado',
    caption: 'Acompanhando cada detalhe da concretagem de hoje na Barra. Engenharia de ponta e arquitetura alinhadas! 🏗️📐 #ChavesBrites #Obra #AltoPadrao #Engenharia',
    images: []
  },
  {
    id: 'post_2',
    title: 'Por que planejar o fluxo de iluminação?',
    platform: 'Pinterest',
    publishDate: '2026-07-18',
    status: 'em_producao',
    caption: 'Mais do que clarear o ambiente, a iluminação define o aconchego e a imponência de um espaço de alto padrão. Salve essa referência de sala de estar integrada! 💡🏠',
    images: []
  },
  {
    id: 'post_3',
    title: 'Tour Virtual Completo - Casa Joá',
    platform: 'YouTube',
    publishDate: '2026-07-10',
    status: 'publicado',
    caption: 'Assista ao tour detalhado por este projeto de encostas que une a vista infinita do oceano com o minimalismo em concreto aparente. Link na bio! 🌊💎',
    images: []
  }
];

const DEFAULT_PRESS: MarketingPress[] = [
  {
    id: 'press_1',
    title: 'Press Release - Sustentabilidade na Construção de Luxo',
    vehicle: 'Jornal O Globo',
    date: '2026-07-22',
    status: 'enviado',
    url: 'https://drive.google.com/drive/folders/cbc_press_folders',
    notes: 'Pauta sobre concreto reciclado e design integrado.'
  },
  {
    id: 'press_2',
    title: 'Destaque de Capa - Casa Joá Minimalista',
    vehicle: 'Revista Casa Vogue',
    date: '2026-07-05',
    status: 'publicado',
    url: 'https://casavogue.globo.com/cbc-casa-joa',
    notes: 'Reportagem fotográfica exclusiva com depoimento da equipe CBC.'
  }
];

const DEFAULT_SETTINGS: MarketingSettings = {
  id: 'urls',
  outboundUrl: '',
  socialUrl: '',
  pressUrl: ''
};

export function MarketingManagement() {
  // Navigation State
  const [activeTab, setActiveTab] = useState<'outbound' | 'social' | 'press'>('outbound');
  
  // Real-time Firestore states
  const [outbounds, setOutbounds] = useState<MarketingOutbound[]>([]);
  const [posts, setPosts] = useState<MarketingPost[]>([]);
  const [press, setPress] = useState<MarketingPress[]>([]);
  const [settings, setSettings] = useState<MarketingSettings>({
    id: 'urls',
    outboundUrl: '',
    socialUrl: '',
    pressUrl: ''
  });

  // Calendar State
  const [currentDate, setCurrentDate] = useState(new Date('2026-07-15')); // Fixed around current local time
  const [selectedDate, setSelectedDate] = useState<string>('2026-07-15');
  const [isCalendarExpanded, setIsCalendarExpanded] = useState(true);
  const [calendarTagFilter, setCalendarTagFilter] = useState<'Todos' | 'Ações' | 'Redes Sociais' | 'Assessoria'>('Todos');

  // Search filter inside tabs
  const [searchQuery, setSearchQuery] = useState('');

  // Editing structures
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [tempRowData, setTempRowData] = useState<Partial<MarketingOutbound>>({});
  // Id da linha recém-criada via "Adicionar Linha" (ainda não confirmada/salva pelo usuário).
  const [newlyAddedRowId, setNewlyAddedRowId] = useState<string | null>(null);

  // Settings Link edits
  const [editingLinks, setEditingLinks] = useState(false);
  const [linksForm, setLinksForm] = useState<MarketingSettings>({ id: 'urls' });

  // Post Modals (Redes Sociais)
  const [isPostModalOpen, setIsPostModalOpen] = useState(false);
  const [editingPost, setEditingPost] = useState<MarketingPost | null>(null);
  const [postForm, setPostForm] = useState<Omit<MarketingPost, 'id'>>({
    title: '',
    platform: 'Instagram',
    publishDate: '2026-07-15',
    status: 'a_fazer',
    caption: '',
    images: []
  });

  // Press Modals (Assessoria)
  const [isPressModalOpen, setIsPressModalOpen] = useState(false);
  const [editingPress, setEditingPress] = useState<MarketingPress | null>(null);
  const [pressForm, setPressForm] = useState<Omit<MarketingPress, 'id'>>({
    title: '',
    vehicle: '',
    date: '2026-07-15',
    status: 'rascunho',
    url: '',
    notes: ''
  });

  // Notification feedback
  const [notification, setNotification] = useState<string | null>(null);

  const showNotification = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3000);
  };

  // Subscriptions setup
  useEffect(() => {
    const unsubOutbound = subscribeCollection('marketing_outbound', setOutbounds, DEFAULT_OUTBOUNDS, 'cbc_marketing_outbound');
    const unsubPosts = subscribeCollection('marketing_posts', setPosts, DEFAULT_POSTS, 'cbc_marketing_posts');
    const unsubPress = subscribeCollection('marketing_press', setPress, DEFAULT_PRESS, 'cbc_marketing_press');
    const unsubSettings = subscribeCollection('marketing_settings', (data) => {
      if (data && data.length > 0) {
        const found = data.find(d => d.id === 'urls');
        if (found) {
          setSettings(found);
          setLinksForm(found);
        }
      }
    }, [DEFAULT_SETTINGS], 'cbc_marketing_settings');

    return () => {
      unsubOutbound();
      unsubPosts();
      unsubPress();
      unsubSettings();
    };
  }, []);

  // Sync external link form on initial settings download
  useEffect(() => {
    setLinksForm(settings);
  }, [settings]);

  // Calendar year and month calculations
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const monthNames = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];

  const handlePrevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 15));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 15));
  };

  // List of calendar events mapping
  const calendarEvents = useMemo(() => {
    const events: { id: string; title: string; date: string; tag: 'Ações' | 'Redes Sociais' | 'Assessoria'; status: string; color: string; bgColor: string; borderColor: string }[] = [];
    
    outbounds.forEach(item => {
      events.push({
        id: `outbound-${item.id}`,
        title: item.name,
        date: item.date,
        tag: 'Ações',
        status: item.status,
        color: 'text-emerald-700 bg-emerald-50 border-emerald-200',
        bgColor: 'bg-emerald-500',
        borderColor: 'border-emerald-600'
      });
    });
    
    posts.forEach(item => {
      events.push({
        id: `post-${item.id}`,
        title: item.title,
        date: item.publishDate,
        tag: 'Redes Sociais',
        status: item.status,
        color: 'text-orange-700 bg-orange-50 border-orange-200',
        bgColor: 'bg-orange-500',
        borderColor: 'border-orange-600'
      });
    });
    
    press.forEach(item => {
      events.push({
        id: `press-${item.id}`,
        title: item.title,
        date: item.date,
        tag: 'Assessoria',
        status: item.status,
        color: 'text-indigo-700 bg-indigo-50 border-indigo-200',
        bgColor: 'bg-indigo-500',
        borderColor: 'border-indigo-600'
      });
    });
    
    return events;
  }, [outbounds, posts, press]);

  // Calendar days grid list mapping
  const firstDayIndex = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const calendarCells = useMemo(() => {
    const cells = [];
    // Prev filler
    for (let i = 0; i < firstDayIndex; i++) {
      cells.push(null);
    }
    // Days
    for (let i = 1; i <= daysInMonth; i++) {
      const dateString = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
      cells.push({
        day: i,
        dateString
      });
    }
    return cells;
  }, [year, month, daysInMonth, firstDayIndex]);

  // Events filtered on calendar selection & filter tag selection
  const selectedDayEvents = useMemo(() => {
    return calendarEvents.filter(evt => {
      const dateMatches = evt.date === selectedDate;
      const tagMatches = calendarTagFilter === 'Todos' || evt.tag === calendarTagFilter;
      return dateMatches && tagMatches;
    });
  }, [calendarEvents, selectedDate, calendarTagFilter]);

  // General Marketing Stats for top summary
  const summaryStats = useMemo(() => {
    const totalInvestedOutbound = outbounds.reduce((sum, item) => sum + (item.cost || 0), 0);
    const socialFinished = posts.filter(p => p.status === 'publicado').length;
    const socialScheduled = posts.filter(p => p.status === 'agendado').length;
    const pressPublished = press.filter(pr => pr.status === 'publicado').length;

    return {
      totalInvestedOutbound,
      socialFinished,
      socialScheduled,
      socialTotal: posts.length,
      pressPublished,
      pressTotal: press.length
    };
  }, [outbounds, posts, press]);

  // External settings link saves
  const handleSaveLinks = async (e: React.FormEvent) => {
    e.preventDefault();
    await saveDoc('marketing_settings', 'urls', linksForm);
    setEditingLinks(false);
    showNotification('Atalhos de links externos salvos com sucesso!');
  };

  // Outbound Tab Handlers (Planilha Sheets)
  const handleStartEditRow = (row: MarketingOutbound) => {
    setEditingRowId(row.id);
    setTempRowData(row);
  };

  const handleSaveRowInline = async (id: string) => {
    if (!tempRowData.name) {
      alert('O nome do contato ou ação de outbound é obrigatório!');
      return;
    }
    // Usa o objeto atual do state (não um stale) e evita gravar campos vazios que zerariam dados existentes.
    const original = outbounds.find(o => o.id === id);
    const merged: MarketingOutbound = {
      ...(original || ({} as MarketingOutbound)),
      ...tempRowData,
      id
    } as MarketingOutbound;
    // Se a data ficou vazia por engano, mantém a original (ou fallback) em vez de zerar.
    if (!merged.date) {
      merged.date = original?.date || selectedDate || '2026-07-15';
    }
    await saveDoc('marketing_outbound', id, merged);
    setEditingRowId(null);
    setNewlyAddedRowId(null);
    showNotification('Ação Outbound salva com sucesso!');
  };

  // Cancela a edição inline; se a linha era recém-criada e ainda não confirmada, remove-a do banco.
  const handleCancelRowInline = async (id: string) => {
    setEditingRowId(null);
    if (newlyAddedRowId === id) {
      setNewlyAddedRowId(null);
      await removeDoc('marketing_outbound', id);
    }
  };

  const handleDeleteOutbound = async (id: string) => {
    if (confirm('Deseja excluir esta ação de outbound permanentemente?')) {
      await removeDoc('marketing_outbound', id);
      showNotification('Ação excluída.');
    }
  };

  const handleAddOutboundRow = async () => {
    const id = `out_${Date.now()}`;
    const newRow: MarketingOutbound = {
      id,
      name: 'Nova Ação de Captação',
      type: 'captacao',
      contact: 'Contato ou Cliente',
      date: selectedDate || '2026-07-15',
      status: 'planejado',
      cost: 0,
      notes: ''
    };
    await saveDoc('marketing_outbound', id, newRow);
    setEditingRowId(id);
    setTempRowData(newRow);
    setNewlyAddedRowId(id);
    showNotification('Nova linha criada na planilha!');
  };

  // Redes Sociais Tab Handlers (Trello Kanban)
  const handleOpenPostModal = (post?: MarketingPost, defaultStatus?: 'a_fazer' | 'em_producao' | 'revisao' | 'agendado' | 'publicado') => {
    if (post) {
      setEditingPost(post);
      setPostForm({
        title: post.title,
        platform: post.platform,
        publishDate: post.publishDate,
        status: post.status,
        caption: post.caption || '',
        images: post.images || []
      });
    } else {
      setEditingPost(null);
      setPostForm({
        title: '',
        platform: 'Instagram',
        publishDate: selectedDate || '2026-07-15',
        status: defaultStatus || 'a_fazer',
        caption: '',
        images: []
      });
    }
    setIsPostModalOpen(true);
  };

  const handleSavePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!postForm.title) return;
    const id = editingPost ? editingPost.id : `post_${Date.now()}`;
    const data: MarketingPost = {
      id,
      ...postForm
    };
    await saveDoc('marketing_posts', id, data);
    setIsPostModalOpen(false);
    showNotification(editingPost ? 'Post atualizado no Kanban!' : 'Post adicionado ao Kanban!');
  };

  const handleDeletePost = async (id: string) => {
    if (confirm('Excluir esta publicação permanentemente?')) {
      await removeDoc('marketing_posts', id);
      showNotification('Publicação excluída.');
    }
  };

  const handleMovePostStatus = async (post: MarketingPost, direction: 'left' | 'right') => {
    const statuses: ('a_fazer' | 'em_producao' | 'revisao' | 'agendado' | 'publicado')[] = [
      'a_fazer', 'em_producao', 'revisao', 'agendado', 'publicado'
    ];
    const currentIndex = statuses.indexOf(post.status);
    let nextIndex = currentIndex;
    
    if (direction === 'left' && currentIndex > 0) {
      nextIndex = currentIndex - 1;
    } else if (direction === 'right' && currentIndex < statuses.length - 1) {
      nextIndex = currentIndex + 1;
    }
    
    if (nextIndex !== currentIndex) {
      const updatedPost = { ...post, status: statuses[nextIndex] };
      await saveDoc('marketing_posts', post.id, updatedPost);
    }
  };

  // Image Upload handler (Base64 convert and attach)
  const handlePostImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        setPostForm(prev => ({
          ...prev,
          images: [...(prev.images || []), result]
        }));
      };
      reader.readAsDataURL(file);
    });
    // Reset file input value
    e.target.value = '';
  };

  const handleRemovePostImage = (index: number) => {
    setPostForm(prev => ({
      ...prev,
      images: (prev.images || []).filter((_, idx) => idx !== index)
    }));
  };

  // Assessoria de Imprensa Handlers
  const handleOpenPressModal = (pr?: MarketingPress) => {
    if (pr) {
      setEditingPress(pr);
      setPressForm({
        title: pr.title,
        vehicle: pr.vehicle,
        date: pr.date,
        status: pr.status,
        url: pr.url || '',
        notes: pr.notes || ''
      });
    } else {
      setEditingPress(null);
      setPressForm({
        title: '',
        vehicle: '',
        date: selectedDate || '2026-07-15',
        status: 'rascunho',
        url: '',
        notes: ''
      });
    }
    setIsPressModalOpen(true);
  };

  const handleSavePress = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pressForm.title || !pressForm.vehicle) return;
    const id = editingPress ? editingPress.id : `press_${Date.now()}`;
    const data: MarketingPress = {
      id,
      ...pressForm
    };
    await saveDoc('marketing_press', id, data);
    setIsPressModalOpen(false);
    showNotification(editingPress ? 'Registro de imprensa atualizado!' : 'Novo registro de imprensa salvo!');
  };

  const handleDeletePress = async (id: string) => {
    if (confirm('Deseja excluir este registro de assessoria de imprensa?')) {
      await removeDoc('marketing_press', id);
      showNotification('Registro excluído.');
    }
  };

  // Filter content inside tabs based on search queries
  const filteredOutbounds = useMemo(() => {
    return outbounds.filter(item => {
      const query = searchQuery.toLowerCase();
      return item.name.toLowerCase().includes(query) ||
             item.contact.toLowerCase().includes(query) ||
             (item.notes && item.notes.toLowerCase().includes(query));
    });
  }, [outbounds, searchQuery]);

  const filteredPostsList = useMemo(() => {
    return posts.filter(item => {
      const query = searchQuery.toLowerCase();
      return item.title.toLowerCase().includes(query) ||
             item.platform.toLowerCase().includes(query) ||
             (item.caption && item.caption.toLowerCase().includes(query));
    });
  }, [posts, searchQuery]);

  const filteredPressList = useMemo(() => {
    return press.filter(item => {
      const query = searchQuery.toLowerCase();
      return item.title.toLowerCase().includes(query) ||
             item.vehicle.toLowerCase().includes(query) ||
             (item.notes && item.notes.toLowerCase().includes(query));
    });
  }, [press, searchQuery]);

  // Utility to format standard dates
  const formatDateString = (dateStr: string) => {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  };

  // Translate types/statuses
  const getOutboundTypeLabel = (type: string) => {
    switch(type) {
      case 'captacao': return 'Gestão de Captação';
      case 'contato': return 'Contato de Prospecção';
      case 'evento': return 'Organização de Evento';
      case 'brinde': return 'Envio de Brindes';
      default: return type;
    }
  };

  return (
    <div className="space-y-6" id="marketing_unified_operations_center">
      {/* Toast Notification */}
      <AnimatePresence>
        {notification && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-4 right-4 z-[9999] bg-[#1C1917] text-white font-mono text-[11px] uppercase tracking-wider py-3 px-5 border border-stone-800 shadow-xl flex items-center gap-2"
          >
            <CheckCircle2 size={14} className="text-[#FF5A35]" />
            {notification}
          </motion.div>
        )}
      </AnimatePresence>

      {/* HEADER SECTION */}
      <div className="border-b border-stone-200 pb-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <span className="font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-[#FF5A35]">Plataforma CBC</span>
            <h2 className="font-sans text-2xl font-bold text-stone-900 tracking-tight flex items-center gap-2 mt-0.5">
              <Megaphone className="text-[#FF5A35]" size={22} />
              Setor de Marketing & Captação
            </h2>
            <p className="text-xs text-stone-500 mt-1">
              Centro Integrado para organização de cronogramas de assessoria, gerenciamento de mídias e prospecção de clientes outbound.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setEditingLinks(!editingLinks)}
              className="px-3.5 py-2 bg-white hover:bg-stone-50 text-stone-700 font-mono text-[10px] uppercase tracking-wider font-bold border border-stone-200 flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Settings size={13} className="text-stone-400" />
              Configurar Atalhos
            </button>
          </div>
        </div>

        {/* STATISTICS OVERVIEW BAR */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
          <div className="bg-stone-50 border border-stone-200 p-4 flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-[9px] font-mono uppercase tracking-wider text-stone-400">Investimento Outbound</p>
              <p className="text-lg font-bold text-stone-900">
                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(summaryStats.totalInvestedOutbound)}
              </p>
            </div>
            <div className="p-2.5 bg-stone-200/50 text-stone-600 rounded-none">
              <DollarSign size={16} />
            </div>
          </div>

          <div className="bg-stone-50 border border-stone-200 p-4 flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-[9px] font-mono uppercase tracking-wider text-stone-400">Conteúdo Social Media</p>
              <p className="text-lg font-bold text-stone-900">
                {summaryStats.socialFinished} de {summaryStats.socialTotal} Publicados
              </p>
            </div>
            <div className="p-2.5 bg-stone-200/50 text-stone-600 rounded-none">
              <Instagram size={16} />
            </div>
          </div>

          <div className="bg-stone-50 border border-stone-200 p-4 flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-[9px] font-mono uppercase tracking-wider text-stone-400">Clippings & Assessoria</p>
              <p className="text-lg font-bold text-stone-900">
                {summaryStats.pressPublished} Matérias Ativas
              </p>
            </div>
            <div className="p-2.5 bg-stone-200/50 text-stone-600 rounded-none">
              <FileCheck size={16} />
            </div>
          </div>
        </div>
      </div>

      {/* EXTERNAL LINK CONFIGURATION DRAWER/MODAL */}
      <AnimatePresence>
        {editingLinks && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="bg-stone-50 border border-stone-200 p-5 rounded-none space-y-4">
              <div className="flex items-center justify-between border-b border-stone-200 pb-2">
                <h4 className="font-mono text-xs font-bold uppercase tracking-wider text-stone-700 flex items-center gap-1.5">
                  <Link2 size={14} className="text-[#FF5A35]" />
                  Configuração de Fallback / Atalhos de Links Externos
                </h4>
                <button onClick={() => setEditingLinks(false)} className="text-stone-400 hover:text-stone-600">
                  <X size={16} />
                </button>
              </div>

              <form onSubmit={handleSaveLinks} className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                <div className="space-y-1">
                  <label className="block text-[9px] font-mono uppercase tracking-wider text-stone-500 font-bold">Planilha de Outbound (Ex: Google Sheets)</label>
                  <input 
                    type="url"
                    placeholder="https://docs.google.com/..."
                    value={linksForm.outboundUrl || ''}
                    onChange={(e) => setLinksForm({ ...linksForm, outboundUrl: e.target.value })}
                    className="w-full bg-white border border-stone-200 p-2 text-stone-800 text-xs focus:outline-none focus:border-stone-400"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-[9px] font-mono uppercase tracking-wider text-stone-500 font-bold">Painel de Mídias Sociais (Ex: Trello / Drive)</label>
                  <input 
                    type="url"
                    placeholder="https://trello.com/..."
                    value={linksForm.socialUrl || ''}
                    onChange={(e) => setLinksForm({ ...linksForm, socialUrl: e.target.value })}
                    className="w-full bg-white border border-stone-200 p-2 text-stone-800 text-xs focus:outline-none focus:border-stone-400"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-[9px] font-mono uppercase tracking-wider text-stone-500 font-bold">Relacionamento com Imprensa (Ex: Google Drive)</label>
                  <input 
                    type="url"
                    placeholder="https://drive.google.com/..."
                    value={linksForm.pressUrl || ''}
                    onChange={(e) => setLinksForm({ ...linksForm, pressUrl: e.target.value })}
                    className="w-full bg-white border border-stone-200 p-2 text-stone-800 text-xs focus:outline-none focus:border-stone-400"
                  />
                </div>

                <div className="md:col-span-3 flex justify-end gap-2 pt-2">
                  <button 
                    type="button" 
                    onClick={() => setEditingLinks(false)} 
                    className="px-4 py-2 bg-stone-100 hover:bg-stone-200 text-stone-600 font-mono text-[9px] uppercase tracking-wider font-bold transition-all border border-stone-300"
                  >
                    Cancelar
                  </button>
                  <button 
                    type="submit" 
                    className="px-4 py-2 bg-stone-900 hover:bg-stone-800 text-white font-mono text-[9px] uppercase tracking-wider font-bold transition-all border border-stone-900"
                  >
                    Salvar Atalhos
                  </button>
                </div>
              </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* MASTER UNIFIED CALENDAR SECTION */}
      <div className="bg-white border border-stone-200 overflow-hidden">
        <div className="p-4 bg-stone-50 border-b border-stone-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <CalendarIcon className="text-stone-400" size={16} />
            <h3 className="font-mono text-[10px] font-bold uppercase tracking-widest text-stone-700">Calendário Mestre Unificado</h3>
            <span className="text-[9px] bg-stone-200/60 text-stone-600 py-0.5 px-2 font-mono uppercase font-bold text-[8px]">
              Visão Geral Integrada
            </span>
          </div>

          <div className="flex items-center gap-3">
            {/* Tag Filter */}
            <div className="flex items-center gap-1 bg-white border border-stone-200 px-2.5 py-1 text-[9px] font-mono">
              <span className="text-stone-400 uppercase">Tags:</span>
              <select
                value={calendarTagFilter}
                onChange={(e) => setCalendarTagFilter(e.target.value as any)}
                className="bg-transparent focus:outline-none text-stone-700 font-bold cursor-pointer uppercase text-[8px]"
              >
                <option value="Todos">Todas as Demandas</option>
                <option value="Ações">Ações Outbound</option>
                <option value="Redes Sociais">Redes Sociais</option>
                <option value="Assessoria">Assessoria de Imprensa</option>
              </select>
            </div>

            <button
              onClick={() => setIsCalendarExpanded(!isCalendarExpanded)}
              className="text-stone-400 hover:text-stone-600 transition-colors"
              title={isCalendarExpanded ? "Recolher Calendário" : "Expandir Calendário"}
            >
              {isCalendarExpanded ? <Sliders size={15} /> : <Grid size={15} />}
            </button>
          </div>
        </div>

        <AnimatePresence initial={false}>
          {isCalendarExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="p-4 md:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* CALENDAR GRID - Left Column */}
                <div className="lg:col-span-8 space-y-4">
                  {/* Month Selection Header */}
                  <div className="flex items-center justify-between">
                    <span className="font-serif text-base font-bold text-stone-900 tracking-tight">
                      {monthNames[month]} {year}
                    </span>
                    <div className="flex gap-1">
                      <button 
                        onClick={handlePrevMonth}
                        className="p-1 hover:bg-stone-100 border border-stone-200 text-stone-600 transition-all cursor-pointer"
                      >
                        <ChevronLeft size={14} />
                      </button>
                      <button 
                        onClick={() => setCurrentDate(new Date('2026-07-15'))}
                        className="px-2 py-1 hover:bg-stone-100 border border-stone-200 text-stone-600 font-mono text-[9px] uppercase font-bold transition-all cursor-pointer"
                      >
                        Hoje
                      </button>
                      <button 
                        onClick={handleNextMonth}
                        className="p-1 hover:bg-stone-100 border border-stone-200 text-stone-600 transition-all cursor-pointer"
                      >
                        <ChevronRight size={14} />
                      </button>
                    </div>
                  </div>

                  {/* Monthly Calendar Layout */}
                  <div className="grid grid-cols-7 border-t border-l border-stone-200 font-mono">
                    {/* Days of Week Headers */}
                    {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((d, index) => (
                      <div 
                        key={d} 
                        className={`text-center py-2 text-[8px] font-bold uppercase tracking-wider border-r border-b border-stone-200 ${
                          index === 0 || index === 6 ? 'bg-stone-50 text-stone-400' : 'bg-stone-100 text-stone-600'
                        }`}
                      >
                        {d}
                      </div>
                    ))}

                    {/* Cells */}
                    {calendarCells.map((cell, idx) => {
                      if (!cell) {
                        return <div key={`empty-${idx}`} className="bg-stone-50/50 border-r border-b border-stone-200 min-h-[55px] md:min-h-[70px]"></div>;
                      }

                      const isSelected = cell.dateString === selectedDate;
                      const hasEvents = calendarEvents.some(evt => evt.date === cell.dateString);
                      const dayEvents = calendarEvents.filter(evt => evt.date === cell.dateString);

                      return (
                        <div
                          key={`day-${cell.day}`}
                          onClick={() => setSelectedDate(cell.dateString)}
                          className={`min-h-[55px] md:min-h-[70px] p-1.5 border-r border-b border-stone-200 flex flex-col justify-between transition-colors cursor-pointer relative group ${
                            isSelected ? 'bg-orange-50/60 border-orange-200' : 'hover:bg-stone-50'
                          }`}
                        >
                          {/* Day Number */}
                          <div className="flex justify-between items-center">
                            <span className={`text-[10px] font-bold ${
                              isSelected ? 'text-[#FF5A35]' : 'text-stone-700'
                            }`}>
                              {cell.day}
                            </span>
                            {/* Simple event dots for responsive small screens */}
                            <div className="flex gap-0.5 sm:hidden">
                              {dayEvents.slice(0, 3).map((evt, i) => (
                                <span key={i} className={`w-1 h-1 rounded-full ${evt.bgColor}`}></span>
                              ))}
                            </div>
                          </div>

                          {/* Event Indicators list (Large screen only) */}
                          <div className="hidden sm:block space-y-1 mt-1 flex-grow">
                            {dayEvents.slice(0, 2).map((evt) => (
                              <div
                                key={evt.id}
                                className={`text-[8px] font-bold px-1.5 py-0.5 border leading-[1.2] truncate rounded-none ${evt.color}`}
                                title={evt.title}
                              >
                                {evt.tag === 'Ações' ? '[Ações] ' : evt.tag === 'Redes Sociais' ? '[Mídia] ' : '[Imprensa] '}
                                {evt.title}
                              </div>
                            ))}
                            {dayEvents.length > 2 && (
                              <div className="text-[7px] text-stone-400 font-bold text-center">
                                + {dayEvents.length - 2} mais
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* DEMANDS SIDEBAR - Right Column */}
                <div className="lg:col-span-4 bg-stone-50/50 border border-stone-200 p-4 flex flex-col justify-between">
                  <div className="space-y-4">
                    <div className="border-b border-stone-200 pb-2 flex items-center justify-between">
                      <span className="font-mono text-[9px] font-bold uppercase tracking-wider text-stone-500">
                        Demandas do Dia
                      </span>
                      <span className="font-mono text-[10px] text-stone-800 font-bold bg-white border border-stone-200 py-0.5 px-2">
                        {formatDateString(selectedDate)}
                      </span>
                    </div>

                    <div className="space-y-3 max-h-[220px] overflow-y-auto pr-1">
                      {selectedDayEvents.length === 0 ? (
                        <div className="text-center py-8 text-stone-400 space-y-1">
                          <Clock size={20} className="mx-auto text-stone-300" />
                          <p className="text-[10px] font-mono">Sem demandas agendadas.</p>
                        </div>
                      ) : (
                        selectedDayEvents.map((evt) => (
                          <div key={evt.id} className="bg-white border border-stone-200 p-2.5 space-y-1.5">
                            <div className="flex items-center justify-between">
                              <span className={`px-1.5 py-0.5 text-[7px] font-mono uppercase font-bold border rounded-none ${evt.color}`}>
                                {evt.tag}
                              </span>
                              <span className="text-[8px] font-mono uppercase text-stone-400">
                                {evt.status}
                              </span>
                            </div>
                            <h5 className="text-[10px] font-bold text-stone-800 leading-snug line-clamp-2">
                              {evt.title}
                            </h5>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div className="border-t border-stone-200 pt-4 mt-4 space-y-2">
                    <p className="text-[9px] font-mono uppercase tracking-wider text-stone-400 font-bold">
                      Agendar Diretamente no Dia:
                    </p>
                    <div className="grid grid-cols-3 gap-1">
                      <button
                        onClick={() => {
                          setActiveTab('outbound');
                          handleAddOutboundRow();
                        }}
                        className="py-2 bg-white hover:bg-stone-100 border border-stone-200 text-stone-700 font-mono text-[8px] uppercase font-bold transition-all"
                      >
                        + Outbound
                      </button>
                      <button
                        onClick={() => {
                          setActiveTab('social');
                          handleOpenPostModal(undefined, 'a_fazer');
                        }}
                        className="py-2 bg-white hover:bg-stone-100 border border-stone-200 text-stone-700 font-mono text-[8px] uppercase font-bold transition-all"
                      >
                        + Social
                      </button>
                      <button
                        onClick={() => {
                          setActiveTab('press');
                          handleOpenPressModal();
                        }}
                        className="py-2 bg-white hover:bg-stone-100 border border-stone-200 text-stone-700 font-mono text-[8px] uppercase font-bold transition-all"
                      >
                        + Imprensa
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* CORE MODULE TABS NAVIGATION */}
      <div className="flex border-b border-stone-200 font-mono text-[10px] uppercase tracking-wider">
        <button
          onClick={() => { setActiveTab('outbound'); setSearchQuery(''); }}
          className={`flex-1 sm:flex-none py-3 px-6 border-b-2 font-bold cursor-pointer transition-all flex items-center justify-center gap-1.5 ${
            activeTab === 'outbound'
              ? 'border-[#FF5A35] text-stone-900 bg-stone-50/50'
              : 'border-transparent text-stone-400 hover:text-stone-600'
          }`}
        >
          <Briefcase size={13} />
          1. Ações (Outbound)
        </button>
        <button
          onClick={() => { setActiveTab('social'); setSearchQuery(''); }}
          className={`flex-1 sm:flex-none py-3 px-6 border-b-2 font-bold cursor-pointer transition-all flex items-center justify-center gap-1.5 ${
            activeTab === 'social'
              ? 'border-[#FF5A35] text-stone-900 bg-stone-50/50'
              : 'border-transparent text-stone-400 hover:text-stone-600'
          }`}
        >
          <Instagram size={13} />
          2. Redes Sociais
        </button>
        <button
          onClick={() => { setActiveTab('press'); setSearchQuery(''); }}
          className={`flex-1 sm:flex-none py-3 px-6 border-b-2 font-bold cursor-pointer transition-all flex items-center justify-center gap-1.5 ${
            activeTab === 'press'
              ? 'border-[#FF5A35] text-stone-900 bg-stone-50/50'
              : 'border-transparent text-stone-400 hover:text-stone-600'
          }`}
        >
          <FileText size={13} />
          3. Assessoria de Imprensa
        </button>
      </div>

      {/* SEARCH AND QUICK LINKS ROW */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-stone-50 p-4 border border-stone-200">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 text-stone-400" size={13} />
          <input
            type="text"
            placeholder={`Pesquisar na aba de ${
              activeTab === 'outbound' ? 'Outbound...' : activeTab === 'social' ? 'Redes Sociais...' : 'Assessoria...'
            }`}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="bg-white border border-stone-200 pl-9 pr-4 py-1.5 text-xs focus:outline-none focus:border-stone-400 min-w-[280px] text-stone-800 rounded-none placeholder-stone-400"
          />
        </div>

        {/* Dynamic link fallbacks displayed on each tab */}
        <div>
          {activeTab === 'outbound' && (
            <div className="flex items-center gap-2">
              {settings.outboundUrl ? (
                <a 
                  href={settings.outboundUrl}
                  target="_blank"
                  rel="noreferrer"
                  referrerPolicy="no-referrer"
                  className="px-3 py-1.5 bg-stone-900 hover:bg-stone-800 text-white font-mono text-[9px] uppercase tracking-wider font-bold border border-stone-900 transition-colors cursor-pointer flex items-center gap-1"
                >
                  <ExternalLink size={11} /> Planilha Integrada (Sheets) ↗
                </a>
              ) : (
                <p className="text-[9px] font-mono text-stone-400 italic">Planilha externa não configurada. Use Configurar Atalhos.</p>
              )}
            </div>
          )}

          {activeTab === 'social' && (
            <div className="flex items-center gap-2">
              {settings.socialUrl ? (
                <a 
                  href={settings.socialUrl}
                  target="_blank"
                  rel="noreferrer"
                  referrerPolicy="no-referrer"
                  className="px-3 py-1.5 bg-stone-900 hover:bg-stone-800 text-white font-mono text-[9px] uppercase tracking-wider font-bold border border-stone-900 transition-colors cursor-pointer flex items-center gap-1"
                >
                  <ExternalLink size={11} /> Canal Externo de Apoio (Trello) ↗
                </a>
              ) : (
                <p className="text-[9px] font-mono text-stone-400 italic">Painel de mídias externo não configurado.</p>
              )}
            </div>
          )}

          {activeTab === 'press' && (
            <div className="flex items-center gap-2">
              {settings.pressUrl ? (
                <a 
                  href={settings.pressUrl}
                  target="_blank"
                  rel="noreferrer"
                  referrerPolicy="no-referrer"
                  className="px-3 py-1.5 bg-stone-900 hover:bg-stone-800 text-white font-mono text-[9px] uppercase tracking-wider font-bold border border-stone-900 transition-colors cursor-pointer flex items-center gap-1"
                >
                  <ExternalLink size={11} /> Pasta da Imprensa ↗
                </a>
              ) : (
                <p className="text-[9px] font-mono text-stone-400 italic">Pasta de armazenamento não configurada para comunicados.</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* RENDER ACTIVE TAB */}
      <div>
        <AnimatePresence mode="wait">
          {/* ========================================== */}
          {/* TAB 1: OUTBOUND SHEET TABLE                */}
          {/* ========================================== */}
          {activeTab === 'outbound' && (
            <motion.div
              key="tab-outbound"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-4"
            >
              <div className="bg-white border border-stone-200 overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse min-w-[900px]">
                  <thead>
                    <tr className="bg-stone-50 border-b border-stone-200 font-mono text-[9px] uppercase tracking-wider text-stone-500">
                      <th className="py-2.5 px-4 border-r border-stone-200 w-[200px]">Nome da Ação Outbound</th>
                      <th className="py-2.5 px-3 border-r border-stone-200 w-[140px]">Tipo de Ação</th>
                      <th className="py-2.5 px-3 border-r border-stone-200 w-[150px]">Contato / Destinatário</th>
                      <th className="py-2.5 px-3 border-r border-stone-200 w-[120px]">Data Planejada</th>
                      <th className="py-2.5 px-3 border-r border-stone-200 w-[110px]">Custo (R$)</th>
                      <th className="py-2.5 px-3 border-r border-stone-200 w-[120px]">Status</th>
                      <th className="py-2.5 px-3 border-r border-stone-200">Notas de Prospecção</th>
                      <th className="py-2.5 px-3 text-center w-[100px]">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {filteredOutbounds.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="py-12 text-center text-stone-400 font-mono">
                          Nenhuma ação outbound de captação localizada. Clique em "Adicionar Linha" para iniciar.
                        </td>
                      </tr>
                    ) : (
                      filteredOutbounds.map((item) => {
                        const isEditing = editingRowId === item.id;

                        return (
                          <tr key={item.id} className="hover:bg-stone-50/40 transition-colors">
                            {/* Nome */}
                            <td className="py-2 px-3 border-r border-stone-100 font-bold text-stone-800">
                              {isEditing ? (
                                <input
                                  type="text"
                                  value={tempRowData.name || ''}
                                  onChange={(e) => setTempRowData({ ...tempRowData, name: e.target.value })}
                                  className="w-full bg-stone-50 border border-stone-200 p-1 text-xs text-stone-900 outline-none"
                                />
                              ) : (
                                item.name
                              )}
                            </td>

                            {/* Tipo */}
                            <td className="py-2 px-3 border-r border-stone-100">
                              {isEditing ? (
                                <select
                                  value={tempRowData.type}
                                  onChange={(e) => setTempRowData({ ...tempRowData, type: e.target.value as any })}
                                  className="w-full bg-stone-50 border border-stone-200 p-1 text-xs text-stone-900 cursor-pointer outline-none"
                                >
                                  <option value="captacao">Gestão de Captação</option>
                                  <option value="contato">Contato Prospecção</option>
                                  <option value="evento">Organização Evento</option>
                                  <option value="brinde">Envio de Brindes</option>
                                </select>
                              ) : (
                                <span className={`px-1.5 py-0.5 text-[8px] font-mono uppercase font-bold border ${
                                  item.type === 'captacao' ? 'bg-indigo-50 border-indigo-200 text-indigo-700' :
                                  item.type === 'contato' ? 'bg-amber-50 border-amber-200 text-amber-700' :
                                  item.type === 'evento' ? 'bg-purple-50 border-purple-200 text-purple-700' :
                                  'bg-emerald-50 border-emerald-200 text-emerald-700'
                                }`}>
                                  {getOutboundTypeLabel(item.type)}
                                </span>
                              )}
                            </td>

                            {/* Contato */}
                            <td className="py-2 px-3 border-r border-stone-100 text-stone-600">
                              {isEditing ? (
                                <input
                                  type="text"
                                  value={tempRowData.contact || ''}
                                  onChange={(e) => setTempRowData({ ...tempRowData, contact: e.target.value })}
                                  className="w-full bg-stone-50 border border-stone-200 p-1 text-xs text-stone-900 outline-none"
                                />
                              ) : (
                                item.contact
                              )}
                            </td>

                            {/* Data */}
                            <td className="py-2 px-3 border-r border-stone-100 font-mono text-stone-600">
                              {isEditing ? (
                                <input
                                  type="date"
                                  value={tempRowData.date || ''}
                                  onChange={(e) => setTempRowData({ ...tempRowData, date: e.target.value })}
                                  className="w-full bg-stone-50 border border-stone-200 p-1 text-xs text-stone-900 outline-none"
                                />
                              ) : (
                                formatDateString(item.date)
                              )}
                            </td>

                            {/* Custo */}
                            <td className="py-2 px-3 border-r border-stone-100 font-mono text-stone-800">
                              {isEditing ? (
                                <input
                                  type="number"
                                  value={tempRowData.cost || 0}
                                  onChange={(e) => setTempRowData({ ...tempRowData, cost: parseFloat(e.target.value) || 0 })}
                                  className="w-full bg-stone-50 border border-stone-200 p-1 text-xs text-stone-900 outline-none"
                                />
                              ) : (
                                new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.cost || 0)
                              )}
                            </td>

                            {/* Status */}
                            <td className="py-2 px-3 border-r border-stone-100">
                              {isEditing ? (
                                <select
                                  value={tempRowData.status}
                                  onChange={(e) => setTempRowData({ ...tempRowData, status: e.target.value as any })}
                                  className="w-full bg-stone-50 border border-stone-200 p-1 text-xs text-stone-900 cursor-pointer outline-none"
                                >
                                  <option value="planejado">Planejado</option>
                                  <option value="em_andamento">Em Andamento</option>
                                  <option value="realizado">Realizado</option>
                                  <option value="cancelado">Cancelado</option>
                                </select>
                              ) : (
                                <span className={`flex items-center gap-1 text-[9px] font-mono uppercase font-bold ${
                                  item.status === 'realizado' ? 'text-emerald-600' :
                                  item.status === 'em_andamento' ? 'text-blue-500' :
                                  item.status === 'cancelado' ? 'text-stone-400 line-through' :
                                  'text-amber-500'
                                }`}>
                                  <span className={`w-1 h-1 rounded-full ${
                                    item.status === 'realizado' ? 'bg-emerald-500' :
                                    item.status === 'em_andamento' ? 'bg-blue-500' :
                                    item.status === 'cancelado' ? 'bg-stone-300' :
                                    'bg-amber-500'
                                  }`}></span>
                                  {item.status === 'em_andamento' ? 'Em Andamento' : item.status}
                                </span>
                              )}
                            </td>

                            {/* Notas */}
                            <td className="py-2 px-3 border-r border-stone-100 text-stone-500 italic max-w-[250px] truncate">
                              {isEditing ? (
                                <input
                                  type="text"
                                  value={tempRowData.notes || ''}
                                  onChange={(e) => setTempRowData({ ...tempRowData, notes: e.target.value })}
                                  className="w-full bg-stone-50 border border-stone-200 p-1 text-xs text-stone-900 outline-none"
                                  placeholder="Notas..."
                                />
                              ) : (
                                item.notes || '-'
                              )}
                            </td>

                            {/* Ações */}
                            <td className="py-2 px-3 text-center">
                              {isEditing ? (
                                <div className="flex items-center justify-center gap-2">
                                  <button
                                    onClick={() => handleSaveRowInline(item.id)}
                                    className="p-1 text-emerald-600 hover:bg-emerald-50 rounded"
                                    title="Salvar"
                                  >
                                    <CheckCircle2 size={14} />
                                  </button>
                                  <button
                                    onClick={() => handleCancelRowInline(item.id)}
                                    className="p-1 text-stone-400 hover:bg-stone-100 rounded"
                                    title="Cancelar"
                                  >
                                    <X size={14} />
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-center justify-center gap-1.5">
                                  <button
                                    onClick={() => handleStartEditRow(item)}
                                    className="p-1 text-stone-500 hover:text-stone-900 hover:bg-stone-100"
                                    title="Editar Linha"
                                  >
                                    <Edit size={13} />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteOutbound(item.id)}
                                    className="p-1 text-stone-400 hover:text-red-600 hover:bg-red-50"
                                    title="Excluir Linha"
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  onClick={handleAddOutboundRow}
                  className="bg-stone-900 hover:bg-stone-800 text-white font-mono text-[10px] uppercase tracking-wider font-bold py-2.5 px-4 flex items-center gap-1.5 border border-stone-800 transition-all cursor-pointer"
                >
                  <Plus size={14} /> Adicionar Nova Linha
                </button>
              </div>
            </motion.div>
          )}

          {/* ========================================== */}
          {/* TAB 2: SOCIAL MEDIA KANBAN BOARD           */}
          {/* ========================================== */}
          {activeTab === 'social' && (
            <motion.div
              key="tab-social"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              {/* Header inside Tab */}
              <div className="flex justify-between items-center">
                <div className="space-y-0.5">
                  <h4 className="font-mono text-[10px] font-bold uppercase tracking-widest text-stone-500">Fluxo Editorial Trello</h4>
                  <p className="text-[10px] text-stone-400 italic">Estrutura visual para planejamento mensal e uploads de criativos artesanais.</p>
                </div>
                <button
                  onClick={() => handleOpenPostModal()}
                  className="bg-stone-900 hover:bg-stone-800 text-white font-mono text-[10px] uppercase tracking-wider font-bold py-2.5 px-4 flex items-center gap-1.5 border border-stone-800 transition-all cursor-pointer"
                >
                  <Plus size={14} /> Planejar Publicação
                </button>
              </div>

              {/* KANBAN GRID BOARD */}
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                {(['a_fazer', 'em_producao', 'revisao', 'agendado', 'publicado'] as const).map((colStatus) => {
                  const colPosts = filteredPostsList.filter(p => p.status === colStatus);
                  const columnHeaderName = 
                    colStatus === 'a_fazer' ? 'A Fazer' :
                    colStatus === 'em_producao' ? 'Em Produção' :
                    colStatus === 'revisao' ? 'Revisão' :
                    colStatus === 'agendado' ? 'Agendado' : 'Publicado';

                  const colColorClass = 
                    colStatus === 'a_fazer' ? 'border-t-stone-400 bg-stone-50' :
                    colStatus === 'em_producao' ? 'border-t-blue-400 bg-blue-50/20' :
                    colStatus === 'revisao' ? 'border-t-purple-400 bg-purple-50/20' :
                    colStatus === 'agendado' ? 'border-t-orange-400 bg-orange-50/20' :
                    'border-t-emerald-400 bg-emerald-50/20';

                  return (
                    <div 
                      key={colStatus} 
                      className={`border border-stone-200 border-t-4 p-3.5 space-y-4 flex flex-col min-h-[450px] ${colColorClass}`}
                    >
                      {/* Column Header */}
                      <div className="flex items-center justify-between border-b border-stone-200/60 pb-2">
                        <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-stone-700">
                          {columnHeaderName}
                        </span>
                        <span className="text-[10px] font-mono bg-stone-200 text-stone-600 font-bold px-1.5 py-0.2 rounded-full">
                          {colPosts.length}
                        </span>
                      </div>

                      {/* Card lists */}
                      <div className="space-y-3 flex-grow overflow-y-auto max-h-[500px] pr-0.5">
                        {colPosts.length === 0 ? (
                          <div className="text-center py-10 border-2 border-dashed border-stone-200/50 text-stone-400 text-[10px] font-mono italic">
                            Sem posts aqui
                          </div>
                        ) : (
                          colPosts.map((post) => (
                            <div 
                              key={post.id} 
                              className="bg-white border border-stone-200 p-3.5 space-y-3 shadow-xs hover:shadow-sm transition-shadow relative group"
                            >
                              {/* Card Meta */}
                              <div className="flex items-center justify-between">
                                <span className={`px-2 py-0.5 text-[8px] font-mono uppercase font-bold border ${
                                  post.platform === 'Instagram' ? 'bg-orange-50 text-orange-700 border-orange-100' :
                                  post.platform === 'Pinterest' ? 'bg-red-50 text-red-700 border-red-100' :
                                  post.platform === 'YouTube' ? 'bg-rose-50 text-rose-700 border-rose-100' :
                                  'bg-stone-50 text-stone-600 border-stone-150'
                                }`}>
                                  {post.platform}
                                </span>
                                <span className="text-[8px] font-mono text-stone-400 font-bold">
                                  {formatDateString(post.publishDate)}
                                </span>
                              </div>

                              {/* Title */}
                              <h5 className="font-sans text-xs font-bold text-stone-900 leading-snug">
                                {post.title}
                              </h5>

                              {/* Dedicated Copywriting View */}
                              {post.caption ? (
                                <div className="bg-stone-50 p-2 border-l-2 border-stone-300">
                                  <p className="text-[9px] text-stone-500 italic leading-normal line-clamp-3">
                                    "{post.caption}"
                                  </p>
                                </div>
                              ) : (
                                <p className="text-[9px] text-stone-400 italic">Nenhuma copy redigida.</p>
                              )}

                              {/* Image Bank Attachment View */}
                              <div className="space-y-1">
                                <p className="text-[8px] font-mono text-stone-400 uppercase font-bold">Banco de Imagens / Artes</p>
                                {post.images && post.images.length > 0 ? (
                                  <div className="grid grid-cols-4 gap-1">
                                    {post.images.slice(0, 4).map((img, idx) => (
                                      <div key={idx} className="aspect-square bg-stone-100 border border-stone-200 overflow-hidden relative">
                                        <img 
                                          src={img} 
                                          alt="Arte da postagem" 
                                          className="w-full h-full object-cover"
                                          referrerPolicy="no-referrer"
                                        />
                                      </div>
                                    ))}
                                    {post.images.length > 4 && (
                                      <div className="aspect-square bg-stone-100 border border-stone-200 flex items-center justify-center text-[8px] font-mono text-stone-500 font-bold">
                                        +{post.images.length - 4}
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-1 text-[9px] text-stone-400 italic">
                                    <ImageIcon size={10} />
                                    Sem artes anexadas
                                  </div>
                                )}
                              </div>

                              {/* Move Controls & Edit buttons */}
                              <div className="flex items-center justify-between border-t border-stone-100 pt-2.5 mt-2.5">
                                {/* Kanban Navigation arrows */}
                                <div className="flex gap-1">
                                  <button
                                    onClick={() => handleMovePostStatus(post, 'left')}
                                    disabled={colStatus === 'a_fazer'}
                                    className="p-1 hover:bg-stone-100 border border-stone-200 rounded-none disabled:opacity-30 disabled:pointer-events-none text-stone-500"
                                    title="Mover para esquerda"
                                  >
                                    <ChevronLeft size={10} />
                                  </button>
                                  <button
                                    onClick={() => handleMovePostStatus(post, 'right')}
                                    disabled={colStatus === 'publicado'}
                                    className="p-1 hover:bg-stone-100 border border-stone-200 rounded-none disabled:opacity-30 disabled:pointer-events-none text-stone-500"
                                    title="Mover para direita"
                                  >
                                    <ChevronRight size={10} />
                                  </button>
                                </div>

                                {/* Edit Controls */}
                                <div className="flex gap-1">
                                  <button
                                    onClick={() => handleOpenPostModal(post)}
                                    className="p-1 text-stone-500 hover:text-stone-900 hover:bg-stone-100 rounded"
                                    title="Editar Postagem"
                                  >
                                    <Edit size={12} />
                                  </button>
                                  <button
                                    onClick={() => handleDeletePost(post.id)}
                                    className="p-1 text-stone-400 hover:text-red-600 hover:bg-red-50 rounded"
                                    title="Excluir Postagem"
                                  >
                                    <Trash2 size={12} />
                                  </button>
                                </div>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          )}

          {/* ========================================== */}
          {/* TAB 3: MEDIA RELATIONS (ASSESSORIA)        */}
          {/* ========================================== */}
          {activeTab === 'press' && (
            <motion.div
              key="tab-press"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-4"
            >
              <div className="flex justify-between items-center">
                <div className="space-y-0.5">
                  <h4 className="font-mono text-[10px] font-bold uppercase tracking-widest text-stone-500">Mural de Relações com a Imprensa</h4>
                  <p className="text-[10px] text-stone-400 italic">Rastreamento de pautas, press releases e clippings publicados em mídias jornalísticas.</p>
                </div>
                <button
                  onClick={() => handleOpenPressModal()}
                  className="bg-stone-900 hover:bg-stone-800 text-white font-mono text-[10px] uppercase tracking-wider font-bold py-2.5 px-4 flex items-center gap-1.5 border border-stone-800 transition-all cursor-pointer"
                >
                  <Plus size={14} /> Novo Release / Clipping
                </button>
              </div>

              {/* LIST DISPLAY */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredPressList.length === 0 ? (
                  <div className="col-span-2 bg-white border border-stone-200 p-12 text-center text-stone-400 space-y-3">
                    <FileText size={36} className="mx-auto text-stone-300" />
                    <p className="text-xs font-mono">Nenhum press release ou clipping localizado na assessoria.</p>
                  </div>
                ) : (
                  filteredPressList.map((pr) => (
                    <div 
                      key={pr.id} 
                      className="bg-white border border-stone-200 p-5 flex flex-col justify-between hover:shadow-sm transition-shadow"
                    >
                      <div className="space-y-3">
                        {/* Meta and Status */}
                        <div className="flex items-start justify-between">
                          <span className="font-mono text-[10px] text-stone-400 font-bold bg-stone-100 py-0.5 px-2">
                            {pr.vehicle}
                          </span>
                          <span className={`px-2 py-0.5 text-[8px] font-mono uppercase font-bold border rounded-none ${
                            pr.status === 'publicado' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                            pr.status === 'enviado' ? 'bg-indigo-50 text-indigo-700 border-indigo-200' :
                            pr.status === 'revisao' ? 'bg-purple-50 text-purple-700 border-purple-200' :
                            'bg-stone-50 text-stone-600 border-stone-200'
                          }`}>
                            {pr.status}
                          </span>
                        </div>

                        {/* Title & Notes */}
                        <div className="space-y-1">
                          <h4 className="font-serif text-base text-stone-900 font-bold tracking-tight">{pr.title}</h4>
                          <p className="text-xs text-stone-500 font-mono">Data do Envio: {formatDateString(pr.date)}</p>
                        </div>

                        {pr.notes && (
                          <p className="text-xs text-stone-600 leading-relaxed font-sans bg-stone-50 p-3 border border-stone-100 italic">
                            "{pr.notes}"
                          </p>
                        )}
                      </div>

                      {/* Footer Actions */}
                      <div className="flex items-center justify-between pt-4 mt-4 border-t border-stone-100">
                        <div>
                          {pr.url ? (
                            <a 
                              href={pr.url}
                              target="_blank"
                              rel="noreferrer"
                              referrerPolicy="no-referrer"
                              className="px-3 py-1.5 border border-stone-200 hover:bg-stone-50 text-stone-600 hover:text-stone-900 text-[9px] font-mono uppercase tracking-wider font-bold transition-all cursor-pointer flex items-center gap-1"
                            >
                              <ExternalLink size={12} /> Acessar Clipping ↗
                            </a>
                          ) : (
                            <span className="text-[9px] text-stone-400 font-mono italic">Sem link anexado</span>
                          )}
                        </div>

                        {/* Controls */}
                        <div className="flex gap-1">
                          <button
                            onClick={() => handleOpenPressModal(pr)}
                            className="p-1.5 hover:bg-stone-50 text-stone-500 hover:text-stone-900 border border-stone-100 transition-all cursor-pointer"
                            title="Editar"
                          >
                            <Edit size={12} />
                          </button>
                          <button
                            onClick={() => handleDeletePress(pr.id)}
                            className="p-1.5 hover:bg-red-50 text-stone-500 hover:text-red-600 border border-stone-100 hover:border-red-100 transition-all cursor-pointer"
                            title="Excluir"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ====================================================== */}
      {/* MODAL: POST EDIT (REDES SOCIAIS)                      */}
      {/* ====================================================== */}
      {isPostModalOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white border border-stone-200 max-w-lg w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <h3 className="font-serif text-lg text-stone-900 font-bold">
                {editingPost ? 'Editar Planejamento de Mídia' : 'Cadastrar Nova Postagem'}
              </h3>
              <button onClick={() => setIsPostModalOpen(false)} className="text-stone-400 hover:text-stone-600">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSavePost} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="block text-[9px] font-mono uppercase tracking-wider text-stone-500 font-bold">Título / Pauta da Postagem</label>
                <input
                  type="text"
                  required
                  value={postForm.title}
                  onChange={(e) => setPostForm({ ...postForm, title: e.target.value })}
                  className="w-full bg-stone-50 border border-stone-200 p-2.5 focus:outline-none focus:border-stone-400 text-stone-800"
                  placeholder="Ex: Visita Técnica Concretagem Joá"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="block text-[9px] font-mono uppercase tracking-wider text-stone-500 font-bold">Plataforma</label>
                  <select
                    value={postForm.platform}
                    onChange={(e) => setPostForm({ ...postForm, platform: e.target.value })}
                    className="w-full bg-stone-50 border border-stone-200 p-2.5 focus:outline-none focus:border-stone-400 text-stone-800 cursor-pointer"
                  >
                    <option value="Instagram">Instagram</option>
                    <option value="Pinterest">Pinterest</option>
                    <option value="LinkedIn">LinkedIn</option>
                    <option value="YouTube">YouTube</option>
                    <option value="Site">Site CBC</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="block text-[9px] font-mono uppercase tracking-wider text-stone-500 font-bold">Status do Fluxo</label>
                  <select
                    value={postForm.status}
                    onChange={(e) => setPostForm({ ...postForm, status: e.target.value as any })}
                    className="w-full bg-stone-50 border border-stone-200 p-2.5 focus:outline-none focus:border-stone-400 text-stone-800 cursor-pointer"
                  >
                    <option value="a_fazer">A Fazer</option>
                    <option value="em_producao">Em Produção</option>
                    <option value="revisao">Revisão</option>
                    <option value="agendado">Agendado</option>
                    <option value="publicado">Publicado</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="block text-[9px] font-mono uppercase tracking-wider text-stone-500 font-bold">Data de Lançamento / Publicação</label>
                <input
                  type="date"
                  required
                  value={postForm.publishDate}
                  onChange={(e) => setPostForm({ ...postForm, publishDate: e.target.value })}
                  className="w-full bg-stone-50 border border-stone-200 p-2.5 focus:outline-none focus:border-stone-400 text-stone-800"
                />
              </div>

              {/* Required Copywriting field */}
              <div className="space-y-1">
                <label className="block text-[9px] font-mono uppercase tracking-wider text-[#FF5A35] font-bold flex items-center gap-1">
                  <Sliders size={11} /> Redação de Copywriting (Obrigatório)
                </label>
                <textarea
                  required
                  value={postForm.caption}
                  onChange={(e) => setPostForm({ ...postForm, caption: e.target.value })}
                  className="w-full bg-stone-50 border border-stone-200 p-2.5 focus:outline-none focus:border-stone-400 text-stone-800 min-h-[100px]"
                  placeholder="Redija aqui as copys, hashtags, e legendas para a equipe de mídias..."
                />
              </div>

              {/* Image Bank Upload System */}
              <div className="space-y-2">
                <label className="block text-[9px] font-mono uppercase tracking-wider text-[#FF5A35] font-bold flex items-center gap-1">
                  <ImageIcon size={11} /> Banco de Imagens & Artes do Post
                </label>
                
                <div className="flex items-center gap-2">
                  <label className="px-3 py-1.5 bg-stone-100 hover:bg-stone-200 border border-stone-300 text-stone-700 font-mono text-[9px] uppercase font-bold cursor-pointer transition-colors flex items-center gap-1">
                    <Upload size={12} /> Anexar Imagem
                    <input 
                      type="file" 
                      accept="image/*" 
                      multiple
                      onChange={handlePostImageUpload}
                      className="hidden" 
                    />
                  </label>
                  <span className="text-[9px] text-stone-400">Suporta uploads múltiplos (PNG/JPG)</span>
                </div>

                {/* Uploaded Gallery */}
                {postForm.images && postForm.images.length > 0 && (
                  <div className="grid grid-cols-5 gap-2 border border-stone-200 p-2 bg-stone-50">
                    {postForm.images.map((img, idx) => (
                      <div key={idx} className="aspect-square bg-white border border-stone-200 overflow-hidden relative group">
                        <img 
                          src={img} 
                          alt="Enviada" 
                          className="w-full h-full object-cover" 
                          referrerPolicy="no-referrer"
                        />
                        <button
                          type="button"
                          onClick={() => handleRemovePostImage(idx)}
                          className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white"
                          title="Remover Imagem"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-3 pt-3 font-mono text-[10px] uppercase font-bold border-t border-stone-100">
                <button
                  type="button"
                  onClick={() => setIsPostModalOpen(false)}
                  className="bg-stone-100 hover:bg-stone-200 text-stone-700 px-4 py-2 border border-stone-300 cursor-pointer transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="bg-stone-900 hover:bg-stone-800 text-white px-4 py-2 border border-stone-900 cursor-pointer transition-all"
                >
                  Salvar Postagem
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ====================================================== */}
      {/* MODAL: PRESS RELEASE (ASSESSORIA)                      */}
      {/* ====================================================== */}
      {isPressModalOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white border border-stone-200 max-w-lg w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <h3 className="font-serif text-lg text-stone-900 font-bold">
                {editingPress ? 'Editar Relacionamento de Imprensa' : 'Novo Envio / Release Jornalístico'}
              </h3>
              <button onClick={() => setIsPressModalOpen(false)} className="text-stone-400 hover:text-stone-600">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSavePress} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="block text-[9px] font-mono uppercase tracking-wider text-stone-500 font-bold">Título da Pauta / Release</label>
                <input
                  type="text"
                  required
                  value={pressForm.title}
                  onChange={(e) => setPressForm({ ...pressForm, title: e.target.value })}
                  className="w-full bg-stone-50 border border-stone-200 p-2.5 focus:outline-none focus:border-stone-400 text-stone-800"
                  placeholder="Ex: Arquitetura Biofílica na Construtora CBC"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="block text-[9px] font-mono uppercase tracking-wider text-stone-500 font-bold">Veículo de Comunicação</label>
                  <input
                    type="text"
                    required
                    value={pressForm.vehicle}
                    onChange={(e) => setPressForm({ ...pressForm, vehicle: e.target.value })}
                    className="w-full bg-stone-50 border border-stone-200 p-2.5 focus:outline-none focus:border-stone-400 text-stone-800"
                    placeholder="Ex: Casa Vogue, O Globo, ArchDaily"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-[9px] font-mono uppercase tracking-wider text-stone-500 font-bold">Status do Release</label>
                  <select
                    value={pressForm.status}
                    onChange={(e) => setPressForm({ ...pressForm, status: e.target.value as any })}
                    className="w-full bg-stone-50 border border-stone-200 p-2.5 focus:outline-none focus:border-stone-400 text-stone-800 cursor-pointer"
                  >
                    <option value="rascunho">Rascunho</option>
                    <option value="enviado">Enviado para Redação</option>
                    <option value="revisao">Em Revisão / Pauta</option>
                    <option value="publicado">Publicado / Clipping</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="block text-[9px] font-mono uppercase tracking-wider text-stone-500 font-bold">Data de Envio / Disparo</label>
                  <input
                    type="date"
                    required
                    value={pressForm.date}
                    onChange={(e) => setPressForm({ ...pressForm, date: e.target.value })}
                    className="w-full bg-stone-50 border border-stone-200 p-2.5 focus:outline-none focus:border-stone-400 text-stone-800"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-[9px] font-mono uppercase tracking-wider text-stone-500 font-bold">Link do Clipping / Pasta (Opcional)</label>
                  <input
                    type="url"
                    value={pressForm.url || ''}
                    onChange={(e) => setPressForm({ ...pressForm, url: e.target.value })}
                    className="w-full bg-stone-50 border border-stone-200 p-2.5 focus:outline-none focus:border-stone-400 text-stone-800"
                    placeholder="https://..."
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="block text-[9px] font-mono uppercase tracking-wider text-stone-500 font-bold">Notas de Relacionamento / Próximos Passos</label>
                <textarea
                  value={pressForm.notes}
                  onChange={(e) => setPressForm({ ...pressForm, notes: e.target.value })}
                  className="w-full bg-stone-50 border border-stone-200 p-2.5 focus:outline-none focus:border-stone-400 text-stone-800 min-h-[90px]"
                  placeholder="Ex: Retornar contato com jornalista Mariana na quarta-feira."
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 font-mono text-[10px] uppercase font-bold border-t border-stone-100">
                <button
                  type="button"
                  onClick={() => setIsPressModalOpen(false)}
                  className="bg-stone-100 hover:bg-stone-200 text-stone-700 px-4 py-2 border border-stone-300 cursor-pointer transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="bg-stone-900 hover:bg-stone-800 text-white px-4 py-2 border border-stone-900 cursor-pointer transition-all"
                >
                  Salvar Registro
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
