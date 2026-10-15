import React, { useMemo, useState } from 'react';
import {
  FileSignature, Plus, Download, Trash2, X, User, Building, Search,
  ClipboardList, Calendar, DollarSign, CheckCircle2, Edit3, Save, ExternalLink, Loader2, Wand2, AlertTriangle,
  Send, RefreshCw, Settings, Ban, FileCheck2, Wallet
} from 'lucide-react';
import {
  Client, Contract, ContractFormData, ContractPayment, ContractPersonData, ContractStatus, ContractType, PaymentTrigger, Project
} from '../types';
import {
  CONTRACT_TYPE_LABELS, emptyContractFormData, escopoPadraoProjeto, getEtapasContrato, somaPagamentosCents,
  sugerirParcelas, sugerirPrazoDias, validateContract,
} from '../lib/contractTemplates';
import { formatCents, parseBRLToCents, prazoDiasPorExtenso } from '../lib/extenso';
import { downloadContractPdf, saveContractPdfToSystem } from '../lib/contractPdf';
import { apiSend } from '../lib/apiClient';
import { SendSignatureModal, SignatureConfigModal, SignatureProgress } from './ContractSignature';
import { BillingConfigModal, ChargesModal, ChargesSummary } from './ContractBilling';

interface ContractGenerationProps {
  clients: Client[];
  projects: Project[];
  contracts: Contract[];
  onAddContract: (contract: Contract) => void | Promise<void>;
  onEditContract: (contract: Contract) => void | Promise<void>;
  onDeleteContract: (id: string) => void | Promise<void>;
}

const STATUS_LABELS: Record<ContractStatus, { label: string; color: string }> = {
  rascunho: { label: 'Rascunho', color: 'bg-stone-200 text-stone-700!' },
  gerado: { label: 'PDF Gerado', color: 'bg-blue-100 text-blue-700!' },
  enviado_assinatura: { label: 'Aguardando assinaturas', color: 'bg-amber-100 text-amber-800!' },
  assinado: { label: 'Assinado', color: 'bg-emerald-100 text-emerald-700!' },
  cancelado: { label: 'Cancelado', color: 'bg-red-100 text-red-700!' },
};

const inputClass =
  'w-full bg-stone-50 border border-stone-200 text-xs py-2.5 px-3 focus:outline-hidden focus:border-[#FF5A35] focus:bg-white transition-all font-mono';
const labelClass = 'block text-[10px] font-bold uppercase tracking-wider text-stone-500 mb-1';

const TRIGGER_LABELS: Record<PaymentTrigger, string> = {
  assinatura: 'Na assinatura',
  etapa_aprovada: 'Aprovação da etapa',
  etapa_entregue: 'Entrega da etapa',
  data: 'Data fixa',
};

// Qualificação civil montada a partir do cadastro do cliente: "brasileiro, casado, arquiteto".
function qualificationFromClient(c: Client): string {
  return [c.nationality, c.maritalStatus, c.profession].map((x) => (x || '').trim()).filter(Boolean).join(', ');
}

const emptyPersonData = (): ContractPersonData => ({ name: '', cpfCnpj: '', address: '' });

export default function ContractGeneration({
  clients,
  projects,
  contracts,
  onAddContract,
  onEditContract,
  onDeleteContract,
}: ContractGenerationProps) {
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [type, setType] = useState<ContractType>('projeto_arquitetura_interiores');
  const [projectId, setProjectId] = useState('');
  const [useExistingClient, setUseExistingClient] = useState(true);
  const [selectedClientId, setSelectedClientId] = useState('');
  const [form, setForm] = useState<ContractFormData>(emptyContractFormData('projeto_arquitetura_interiores'));
  const [filterProject, setFilterProject] = useState('');
  const [savingToSystem, setSavingToSystem] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [signingContract, setSigningContract] = useState<Contract | null>(null);
  const [configOpen, setConfigOpen] = useState(false);
  const [billingConfigOpen, setBillingConfigOpen] = useState(false);
  const [chargesContract, setChargesContract] = useState<Contract | null>(null);
  const [sigBusyId, setSigBusyId] = useState<string | null>(null);
  const [sigNotice, setSigNotice] = useState<{ ok: boolean; text: string } | null>(null);

  const projectById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);
  const clientById = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);

  const nextNumber = useMemo(() => (contracts.length ? Math.max(...contracts.map((c) => c.number)) + 1 : 1), [contracts]);

  const filteredContracts = useMemo(() => {
    return contracts
      .filter((c) => !filterProject || c.projectId === filterProject)
      .sort((a, b) => b.number - a.number);
  }, [contracts, filterProject]);

  const resetForm = (t: ContractType = 'projeto_arquitetura_interiores') => {
    setType(t);
    setForm(emptyContractFormData(t));
    setProjectId('');
    setUseExistingClient(true);
    setSelectedClientId('');
    setEditingId(null);
  };

  const openNew = () => {
    resetForm('projeto_arquitetura_interiores');
    setFormOpen(true);
  };

  const openEdit = (contract: Contract) => {
    setType(contract.type);
    setForm(contract.data);
    setProjectId(contract.projectId);
    setUseExistingClient(!!contract.data.contratanteId);
    setSelectedClientId(contract.data.contratanteId || '');
    setEditingId(contract.id);
    setFormOpen(true);
  };

  const handleProjectChange = (id: string) => {
    setProjectId(id);
    const proj = projectById.get(id);
    if (proj) {
      const client = clientById.get(proj.clientId);
      const temLocal = !!proj.location && proj.location.trim().toLowerCase() !== 'não informada';
      setForm((f) => ({
        ...f,
        localObjeto: temLocal ? proj.location : f.localObjeto,
        cepObjeto: proj.cep || f.cepObjeto || '',
        areaM2: proj.area ? String(proj.area) : f.areaM2,
        areaInterioresM2: proj.areaInteriores ? String(proj.areaInteriores) : f.areaInterioresM2,
      }));
      if (client && useExistingClient) {
        applyClient(client.id);
      }
    }
  };

  const applyClient = (clientId: string) => {
    setSelectedClientId(clientId);
    const client = clientById.get(clientId);
    if (!client) return;
    setForm((f) => ({
      ...f,
      contratanteId: client.id,
      contratante: {
        ...f.contratante,
        name: client.name,
        cpfCnpj: client.cpfCnpj || f.contratante.cpfCnpj,
        address: client.address
          ? `${client.address}${client.cep ? `, CEP ${client.cep}` : ''}`
          : f.contratante.address,
        qualification: qualificationFromClient(client) || f.contratante.qualification,
        email: client.email || f.contratante.email,
        phone: client.phone || f.contratante.phone,
      },
    }));
  };

  const updatePerson = (key: 'contratante' | 'contratanteSolidario' | 'contratado' | 'responsavelTecnico', patch: Partial<ContractPersonData>) => {
    setForm((f) => ({
      ...f,
      [key]: { ...(f[key] as ContractPersonData || { name: '', cpfCnpj: '', address: '' }), ...patch },
    }));
  };

  const handleTypeChange = (t: ContractType) => {
    setType(t);
    setForm((prev) => {
      const fresh = emptyContractFormData(t);
      // Preserva dados já preenchidos que são comuns a todos os tipos.
      return {
        ...fresh,
        contratanteId: prev.contratanteId,
        contratante: prev.contratante,
        localObjeto: prev.localObjeto,
        cepObjeto: prev.cepObjeto,
        areaM2: prev.areaM2,
        areaInterioresM2: prev.areaInterioresM2 ?? fresh.areaInterioresM2,
        valorTotal: prev.valorTotal,
        descricaoImovel: prev.descricaoImovel,
        localAssinatura: prev.localAssinatura,
        dataAssinatura: prev.dataAssinatura,
      };
    });
  };

  // ----- Projeto de Arquitetura e Interiores: serviços, prazo e parcelas -----
  const isNovo = type === 'projeto_arquitetura_interiores';
  const validation = useMemo(() => validateContract(type, form), [type, form]);
  const servicos = form.servicosIncluidos || [];
  const etapasContrato = useMemo(() => getEtapasContrato(servicos), [servicos]);
  const totalCents = parseBRLToCents(form.valorTotal);
  const somaCents = somaPagamentosCents(form.pagamentos);

  const toggleServico = (s: 'arquitetonico' | 'interiores', checked: boolean) => {
    setForm((f) => {
      const atual = f.servicosIncluidos || [];
      const proximo = checked ? Array.from(new Set([...atual, s])) : atual.filter((x) => x !== s);
      // só reescreve o objeto se o usuário ainda não o personalizou
      const eraPadrao = !f.escopoServicos || f.escopoServicos === escopoPadraoProjeto(atual);
      return {
        ...f,
        servicosIncluidos: proximo,
        escopoServicos: eraPadrao ? escopoPadraoProjeto(proximo) : f.escopoServicos,
      };
    });
  };

  const setPrazoDias = (raw: string) => {
    const digits = raw.replace(/\D/g, '');
    const n = parseInt(digits, 10);
    setForm((f) => ({ ...f, prazoDias: digits, prazoExecucao: n > 0 ? prazoDiasPorExtenso(n) : '' }));
  };

  const updatePagamento = (id: string, patch: Partial<ContractPayment>) => {
    setForm((f) => ({ ...f, pagamentos: (f.pagamentos || []).map((p) => (p.id === id ? { ...p, ...patch } : p)) }));
  };
  const addPagamento = () => {
    setForm((f) => ({
      ...f,
      pagamentos: [
        ...(f.pagamentos || []),
        { id: `pg-${Date.now()}-${(f.pagamentos || []).length}`, descricao: `Parcela ${(f.pagamentos || []).length + 1}`, valor: '', gatilho: 'data' as PaymentTrigger },
      ],
    }));
  };
  const removePagamento = (id: string) => {
    setForm((f) => ({ ...f, pagamentos: (f.pagamentos || []).filter((p) => p.id !== id) }));
  };
  const handleSugerirParcelas = () => {
    if (totalCents === null || totalCents <= 0) {
      alert('Informe primeiro o valor total do contrato.');
      return;
    }
    if ((form.pagamentos || []).length > 0 && !confirm('Substituir as parcelas atuais pela sugestão (50% de sinal + etapas)?')) return;
    setForm((f) => ({ ...f, pagamentos: sugerirParcelas(totalCents, f.servicosIncluidos || []) }));
  };

  const updateTestemunha = (index: number, patch: Partial<ContractPersonData>) => {
    setForm((f) => {
      const lista = [...(f.testemunhas || [])];
      while (lista.length < 2) lista.push(emptyPersonData());
      lista[index] = { ...lista[index], ...patch };
      return { ...f, testemunhas: lista };
    });
  };

  const canSubmit = !!projectId && form.contratante.name.trim().length > 0 && validation.errors.length === 0;

  const buildContractFromForm = (): Contract => {
    const existing = editingId ? contracts.find((c) => c.id === editingId) : undefined;
    return {
      id: editingId || `contract-${Date.now()}`,
      projectId,
      type,
      number: editingId ? (existing?.number ?? nextNumber) : nextNumber,
      // Envio/assinatura é controlado pelo servidor; a edição nunca rebaixa esse status.
      status: existing && (existing.status === 'enviado_assinatura' || existing.status === 'assinado') ? existing.status : 'gerado',
      signature: existing?.signature,
      createdAt: editingId ? (existing?.createdAt ?? new Date().toISOString()) : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      data: form,
      pdfUrl: existing?.pdfUrl,
      pdfFileName: existing?.pdfFileName,
      pdfSavedAt: existing?.pdfSavedAt,
    };
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    const contract = buildContractFromForm();
    if (editingId) {
      await onEditContract(contract);
    } else {
      await onAddContract(contract);
    }
    downloadContractPdf(contract, projectById.get(projectId));
    setFormOpen(false);
    resetForm();
  };

  const handleSaveToSystem = async () => {
    if (!canSubmit) return;
    setSavingToSystem(true);
    try {
      const contract = buildContractFromForm();
      const { url, fileName, error } = await saveContractPdfToSystem(contract, projectById.get(projectId));
      if (!url) {
        alert(`Não foi possível salvar o PDF no sistema: ${error}`);
        return;
      }
      const savedContract: Contract = { ...contract, pdfUrl: url, pdfFileName: fileName, pdfSavedAt: new Date().toISOString() };
      if (editingId) {
        await onEditContract(savedContract);
      } else {
        await onAddContract(savedContract);
      }
      if (error) alert(error);
      setFormOpen(false);
      resetForm();
    } finally {
      setSavingToSystem(false);
    }
  };

  const isLocked = (c: Contract) => c.status === 'enviado_assinatura' || c.status === 'assinado';
  const canSendForSignature = (c: Contract) => !isLocked(c) && c.status !== 'cancelado';

  const handleRefreshSignature = async (c: Contract) => {
    setSigBusyId(c.id);
    setSigNotice(null);
    try {
      await apiSend(`/api/contracts/${encodeURIComponent(c.id)}/signature/refresh`, 'POST', {});
      setSigNotice({ ok: true, text: 'Status atualizado com o ClickSign.' });
    } catch (e) {
      setSigNotice({ ok: false, text: e instanceof Error ? e.message : 'Falha ao atualizar o status.' });
    } finally {
      setSigBusyId(null);
    }
  };

  const handleCancelSignature = async (c: Contract) => {
    if (!window.confirm(`Cancelar o envio do contrato nº ${String(c.number).padStart(2, '0')}? Os signatários deixam de poder assinar este envelope.`)) return;
    setSigBusyId(c.id);
    setSigNotice(null);
    try {
      await apiSend(`/api/contracts/${encodeURIComponent(c.id)}/signature/cancel`, 'POST', {});
      setSigNotice({ ok: true, text: 'Envio cancelado. O contrato voltou para "PDF Gerado" e pode ser editado e reenviado.' });
    } catch (e) {
      setSigNotice({ ok: false, text: e instanceof Error ? e.message : 'Falha ao cancelar o envio.' });
    } finally {
      setSigBusyId(null);
    }
  };

  const handleDownloadExisting = (contract: Contract) => {
    downloadContractPdf(contract, projectById.get(contract.projectId));
  };

  const handleSaveExistingToSystem = async (contract: Contract) => {
    setSavingId(contract.id);
    try {
      const { url, fileName, error } = await saveContractPdfToSystem(contract, projectById.get(contract.projectId));
      if (!url) {
        alert(`Não foi possível salvar o PDF no sistema: ${error}`);
        return;
      }
      await onEditContract({ ...contract, pdfUrl: url, pdfFileName: fileName, pdfSavedAt: new Date().toISOString() });
      if (error) alert(error);
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2.5">
          <FileSignature className="text-[#FF5A35]" size={20} />
          <div>
            <h2 className="font-oswald text-lg uppercase tracking-wide text-stone-900">Geração de Contratos</h2>
            <p className="text-[11px] text-stone-500">Gere contratos em PDF a partir dos modelos oficiais da CBC.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setConfigOpen(true)}
            className="flex items-center gap-2 border border-stone-300 text-stone-600 px-3 py-2.5 text-xs font-bold uppercase tracking-wider hover:border-[#FF5A35] hover:text-[#FF5A35] transition-colors cursor-pointer"
            title="Configurar a assinatura eletrônica (ClickSign)"
          >
            <Settings size={14} /> Assinatura eletrônica
          </button>
          <button
            onClick={() => setBillingConfigOpen(true)}
            className="flex items-center gap-2 border border-stone-300 text-stone-600 px-3 py-2.5 text-xs font-bold uppercase tracking-wider hover:border-[#FF5A35] hover:text-[#FF5A35] transition-colors cursor-pointer"
            title="Configurar a cobrança pelo Banco Cora"
          >
            <Wallet size={14} /> Cobrança (Cora)
          </button>
          <button
            onClick={openNew}
            className="flex items-center gap-2 bg-[#FF5A35] text-white px-4 py-2.5 text-xs font-bold uppercase tracking-wider hover:bg-[#e64d29] transition-colors cursor-pointer"
          >
            <Plus size={14} /> Novo Contrato
          </button>
        </div>
      </div>

      {sigNotice && (
        <div className={`text-xs font-bold p-3 border flex items-start justify-between gap-3 ${sigNotice.ok ? 'text-emerald-700 bg-emerald-50 border-emerald-200' : 'text-red-700 bg-red-50 border-red-200'}`}>
          <span>{sigNotice.text}</span>
          <button onClick={() => setSigNotice(null)} className="shrink-0 cursor-pointer"><X size={14} /></button>
        </div>
      )}

      <div className="flex items-center gap-2">
        <Search size={13} className="text-stone-400" />
        <select
          value={filterProject}
          onChange={(e) => setFilterProject(e.target.value)}
          className="bg-stone-50 border border-stone-200 text-xs py-2 px-3 font-mono focus:outline-hidden focus:border-[#FF5A35]"
        >
          <option value="">Todos os projetos</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>

      <div className="border border-stone-200 divide-y divide-stone-100">
        {filteredContracts.length === 0 && (
          <div className="p-8 text-center text-xs text-stone-400">Nenhum contrato gerado ainda.</div>
        )}
        {filteredContracts.map((c) => {
          const proj = projectById.get(c.projectId);
          const status = STATUS_LABELS[c.status];
          return (
            <div key={c.id} className="p-4 flex items-center justify-between gap-3 hover:bg-stone-50 transition-colors">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-[10px] text-stone-400">#{c.number.toString().padStart(2, '0')}</span>
                  <span className="font-bold text-sm text-stone-800 truncate">{CONTRACT_TYPE_LABELS[c.type]}</span>
                  <span className={`text-[9px] font-bold uppercase px-2 py-0.5 ${status.color}`}>{status.label}</span>
                </div>
                <div className="text-[11px] text-stone-500 mt-0.5 truncate">
                  {c.data.contratante.name} • {proj?.name || 'Projeto removido'}
                </div>
                {c.pdfUrl && (
                  <div className="text-[10px] text-emerald-600 font-bold mt-0.5 flex items-center gap-1">
                    <CheckCircle2 size={11} /> PDF salvo no sistema
                  </div>
                )}
                <SignatureProgress contract={c} />
                <ChargesSummary contract={c} />
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {canSendForSignature(c) && (
                  <button
                    onClick={() => { setSigNotice(null); setSigningContract(c); }}
                    className="p-2 text-stone-400 hover:text-[#FF5A35] hover:bg-stone-100 transition-colors cursor-pointer"
                    title="Enviar para assinatura eletrônica"
                  >
                    <Send size={14} />
                  </button>
                )}
                {c.status === 'enviado_assinatura' && (
                  <>
                    <button
                      onClick={() => handleRefreshSignature(c)}
                      disabled={sigBusyId === c.id}
                      className="p-2 text-stone-400 hover:text-[#FF5A35] hover:bg-stone-100 transition-colors cursor-pointer disabled:opacity-50"
                      title="Atualizar status com o ClickSign"
                    >
                      {sigBusyId === c.id ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                    </button>
                    <button
                      onClick={() => handleCancelSignature(c)}
                      disabled={sigBusyId === c.id}
                      className="p-2 text-stone-400 hover:text-red-500 hover:bg-red-50 transition-colors cursor-pointer disabled:opacity-50"
                      title="Cancelar o envio para assinatura"
                    >
                      <Ban size={14} />
                    </button>
                  </>
                )}
                {c.status === 'assinado' && (
                  <button
                    onClick={() => setChargesContract(c)}
                    className="p-2 text-stone-400 hover:text-[#FF5A35] hover:bg-stone-100 transition-colors cursor-pointer"
                    title="Parcelas e cobranças (boleto/Pix)"
                  >
                    <Wallet size={14} />
                  </button>
                )}
                {c.status === 'assinado' && (
                  <a
                    href={c.signature?.signedPdfUrl || `/api/contracts/${encodeURIComponent(c.id)}/signed-pdf`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 text-emerald-600 hover:bg-emerald-50 transition-colors cursor-pointer"
                    title="Abrir o PDF assinado"
                  >
                    <FileCheck2 size={14} />
                  </a>
                )}
                <button
                  onClick={() => openEdit(c)}
                  disabled={isLocked(c)}
                  className="p-2 text-stone-400 hover:text-[#FF5A35] hover:bg-stone-100 transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-stone-400"
                  title={isLocked(c) ? 'Contrato enviado para assinatura não pode ser editado (cancele o envio primeiro)' : 'Editar'}
                >
                  <Edit3 size={14} />
                </button>
                <button
                  onClick={() => handleDownloadExisting(c)}
                  className="p-2 text-stone-400 hover:text-[#FF5A35] hover:bg-stone-100 transition-colors cursor-pointer"
                  title="Baixar PDF"
                >
                  <Download size={14} />
                </button>
                <button
                  onClick={() => handleSaveExistingToSystem(c)}
                  disabled={savingId === c.id}
                  className="p-2 text-stone-400 hover:text-[#FF5A35] hover:bg-stone-100 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  title={c.pdfUrl ? 'Atualizar PDF salvo no sistema' : 'Salvar PDF no sistema'}
                >
                  {savingId === c.id ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                </button>
                {c.pdfUrl && (
                  <a
                    href={c.pdfUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 text-stone-400 hover:text-[#FF5A35] hover:bg-stone-100 transition-colors cursor-pointer"
                    title="Abrir PDF salvo"
                  >
                    <ExternalLink size={14} />
                  </a>
                )}
                <button
                  onClick={() => onDeleteContract(c.id)}
                  disabled={isLocked(c)}
                  className="p-2 text-stone-400 hover:text-red-500 hover:bg-red-50 transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-stone-400"
                  title={isLocked(c) ? 'Contrato enviado para assinatura não pode ser excluído' : 'Excluir'}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {configOpen && <SignatureConfigModal onClose={() => setConfigOpen(false)} />}
      {billingConfigOpen && <BillingConfigModal onClose={() => setBillingConfigOpen(false)} />}
      {chargesContract && <ChargesModal contract={chargesContract} onClose={() => setChargesContract(null)} />}
      {signingContract && (
        <SendSignatureModal
          contract={signingContract}
          project={projectById.get(signingContract.projectId)}
          onClose={() => setSigningContract(null)}
          onSent={() => setSigNotice({ ok: true, text: `Contrato nº ${String(signingContract.number).padStart(2, '0')} enviado: os signatários receberam o e-mail do ClickSign.` })}
        />
      )}

      {formOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-3xl my-6 border-2 border-stone-900">
            <div className="flex items-center justify-between p-4 border-b border-stone-200 bg-stone-50">
              <h3 className="font-oswald uppercase tracking-wide text-stone-900 text-sm">
                {editingId ? 'Editar Contrato' : 'Novo Contrato'}
              </h3>
              <button onClick={() => setFormOpen(false)} className="text-stone-400 hover:text-stone-800 cursor-pointer">
                <X size={18} />
              </button>
            </div>

            <div className="p-5 space-y-6 max-h-[75vh] overflow-y-auto">
              {/* Tipo de contrato */}
              <div>
                <label className={labelClass}>Tipo de Contrato</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                  {(Object.keys(CONTRACT_TYPE_LABELS) as ContractType[]).map((t) => (
                    <button
                      key={t}
                      onClick={() => handleTypeChange(t)}
                      className={`text-left p-3 border text-xs font-bold transition-colors cursor-pointer ${
                        type === t
                          ? 'border-[#FF5A35] bg-[#FF5A35]/5 text-[#FF5A35]'
                          : 'border-stone-200 text-stone-600 hover:border-stone-300'
                      }`}
                    >
                      {CONTRACT_TYPE_LABELS[t]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Projeto */}
              <div>
                <label className={labelClass}>Projeto / Obra vinculado *</label>
                <select value={projectId} onChange={(e) => handleProjectChange(e.target.value)} className={inputClass}>
                  <option value="">Selecione o projeto...</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              {/* Serviços incluídos (somente Projeto de Arquitetura e Interiores) */}
              {isNovo && (
                <div className="border border-stone-200 p-3 space-y-3">
                  <label className={labelClass + ' mb-0'}>Serviços contratados</label>
                  <div className="flex flex-wrap gap-4 text-xs">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={servicos.includes('arquitetonico')} onChange={(e) => toggleServico('arquitetonico', e.target.checked)} />
                      Projeto arquitetônico
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={servicos.includes('interiores')} onChange={(e) => toggleServico('interiores', e.target.checked)} />
                      Projeto de interiores
                    </label>
                  </div>
                  {etapasContrato.length > 0 && (
                    <p className="text-[10px] text-stone-500">
                      Etapas do cronograma: {etapasContrato.map((e) => `${e.numero}. ${e.titulo}`).join(' • ')}
                    </p>
                  )}
                </div>
              )}

              {/* Contratante */}
              <div className="border border-stone-200 p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <label className={labelClass + ' mb-0'}>Contratante</label>
                  <div className="flex text-[10px] font-bold uppercase">
                    <button
                      onClick={() => setUseExistingClient(true)}
                      className={`px-2.5 py-1 flex items-center gap-1 cursor-pointer ${useExistingClient ? 'bg-[#FF5A35] text-white' : 'bg-stone-100 text-stone-500'}`}
                    >
                      <Building size={11} /> Cliente cadastrado
                    </button>
                    <button
                      onClick={() => setUseExistingClient(false)}
                      className={`px-2.5 py-1 flex items-center gap-1 cursor-pointer ${!useExistingClient ? 'bg-[#FF5A35] text-white' : 'bg-stone-100 text-stone-500'}`}
                    >
                      <User size={11} /> Preencher manualmente
                    </button>
                  </div>
                </div>

                {useExistingClient ? (
                  <select value={selectedClientId} onChange={(e) => applyClient(e.target.value)} className={inputClass}>
                    <option value="">Selecione o cliente...</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                ) : null}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelClass}>Nome completo *</label>
                    <input
                      className={inputClass}
                      value={form.contratante.name}
                      onChange={(e) => updatePerson('contratante', { name: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>CPF/CNPJ</label>
                    <input
                      className={inputClass}
                      value={form.contratante.cpfCnpj}
                      onChange={(e) => updatePerson('contratante', { cpfCnpj: e.target.value })}
                    />
                  </div>
                  <div className="col-span-2">
                    <label className={labelClass}>Endereço</label>
                    <input
                      className={inputClass}
                      value={form.contratante.address}
                      onChange={(e) => updatePerson('contratante', { address: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>E-mail</label>
                    <input
                      type="email"
                      className={inputClass}
                      value={form.contratante.email || ''}
                      onChange={(e) => updatePerson('contratante', { email: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Telefone</label>
                    <input
                      className={inputClass}
                      value={form.contratante.phone || ''}
                      onChange={(e) => updatePerson('contratante', { phone: e.target.value })}
                    />
                  </div>
                  <div className="col-span-2">
                    <label className={labelClass}>Qualificação civil (opcional)</label>
                    <input
                      placeholder="ex: brasileiro, casado"
                      className={inputClass}
                      value={form.contratante.qualification || ''}
                      onChange={(e) => updatePerson('contratante', { qualification: e.target.value })}
                    />
                  </div>
                </div>

                {type === 'empreitada_mao_de_obra' && (
                  <div className="pt-2 border-t border-stone-100">
                    <label className={labelClass}>Segundo contratante solidário (opcional — ex: cônjuge)</label>
                    <div className="grid grid-cols-2 gap-3">
                      <input
                        placeholder="Nome"
                        className={inputClass}
                        value={form.contratanteSolidario?.name || ''}
                        onChange={(e) => updatePerson('contratanteSolidario', { name: e.target.value })}
                      />
                      <input
                        placeholder="CPF"
                        className={inputClass}
                        value={form.contratanteSolidario?.cpfCnpj || ''}
                        onChange={(e) => updatePerson('contratanteSolidario', { cpfCnpj: e.target.value })}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Objeto / imóvel */}
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className={labelClass}>Local do objeto (endereço da obra)</label>
                  <input className={inputClass} value={form.localObjeto} onChange={(e) => setForm({ ...form, localObjeto: e.target.value })} />
                </div>
                <div>
                  <label className={labelClass}>CEP</label>
                  <input className={inputClass} value={form.cepObjeto || ''} onChange={(e) => setForm({ ...form, cepObjeto: e.target.value })} />
                </div>
                <div>
                  <label className={labelClass}>{isNovo ? 'Área do projeto arquitetônico (m²)' : 'Área (m²)'}</label>
                  <input className={inputClass} value={form.areaM2} onChange={(e) => setForm({ ...form, areaM2: e.target.value })} />
                </div>
                {isNovo && servicos.includes('interiores') && (
                  <>
                    <div>
                      <label className={labelClass}>Área do projeto de interiores (m²)</label>
                      <input className={inputClass} value={form.areaInterioresM2 || ''} onChange={(e) => setForm({ ...form, areaInterioresM2: e.target.value })} />
                    </div>
                    <div className="col-span-2">
                      <label className={labelClass}>Ambientes do projeto de interiores</label>
                      <input
                        className={inputClass}
                        placeholder="Sala de Estar, Cozinha, Suíte Master, Banheiro da Suíte Master e Escritório"
                        value={form.ambientesInteriores || ''}
                        onChange={(e) => setForm({ ...form, ambientesInteriores: e.target.value })}
                      />
                    </div>
                  </>
                )}
                <div className="col-span-2">
                  <label className={labelClass}>Descrição do imóvel / especificações (opcional)</label>
                  <textarea
                    rows={2}
                    className={inputClass}
                    value={form.descricaoImovel || ''}
                    onChange={(e) => setForm({ ...form, descricaoImovel: e.target.value })}
                  />
                </div>
              </div>

              {/* Financeiro */}
              <div className="border border-stone-200 p-3 space-y-3">
                <label className={labelClass + ' mb-0 flex items-center gap-1.5'}><DollarSign size={12} /> Financeiro</label>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelClass}>Valor total do contrato (R$) *</label>
                    <input className={inputClass} value={form.valorTotal} onChange={(e) => setForm({ ...form, valorTotal: e.target.value })} placeholder="76.000,00" />
                  </div>

                  {type === 'gerenciamento_obra' && (
                    <>
                      <div>
                        <label className={labelClass}>% de honorários</label>
                        <input className={inputClass} value={form.percentualHonorarios || ''} onChange={(e) => setForm({ ...form, percentualHonorarios: e.target.value })} />
                      </div>
                      <div>
                        <label className={labelClass}>Valor de entrada/sinal (R$)</label>
                        <input className={inputClass} value={form.valorEntrada || ''} onChange={(e) => setForm({ ...form, valorEntrada: e.target.value })} />
                      </div>
                      <div>
                        <label className={labelClass}>Nº de parcelas</label>
                        <input className={inputClass} value={form.numeroParcelas || ''} onChange={(e) => setForm({ ...form, numeroParcelas: e.target.value })} />
                      </div>
                      <div>
                        <label className={labelClass}>Valor de cada parcela (R$)</label>
                        <input className={inputClass} value={form.valorParcela || ''} onChange={(e) => setForm({ ...form, valorParcela: e.target.value })} />
                      </div>
                    </>
                  )}

                  {(type === 'projeto_arquitetura' || type === 'empreitada_mao_de_obra') && (
                    <div className="col-span-2">
                      <label className={labelClass}>Forma de pagamento (texto livre)</label>
                      <textarea
                        rows={2}
                        className={inputClass}
                        value={form.formaPagamento || ''}
                        onChange={(e) => setForm({ ...form, formaPagamento: e.target.value })}
                      />
                    </div>
                  )}
                </div>

                {isNovo && (
                  <div className="space-y-2 pt-2 border-t border-stone-100">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <label className={labelClass + ' mb-0'}>Parcelas (viram as cobranças)</label>
                      <div className="flex gap-2">
                        <button type="button" onClick={handleSugerirParcelas} className="flex items-center gap-1 text-[10px] font-bold uppercase px-2.5 py-1.5 border border-stone-300 text-stone-600 hover:border-[#FF5A35] hover:text-[#FF5A35] cursor-pointer">
                          <Wand2 size={11} /> Sugerir parcelas
                        </button>
                        <button type="button" onClick={addPagamento} className="flex items-center gap-1 text-[10px] font-bold uppercase px-2.5 py-1.5 bg-stone-900 text-white hover:bg-[#FF5A35] cursor-pointer">
                          <Plus size={11} /> Parcela
                        </button>
                      </div>
                    </div>

                    {(form.pagamentos || []).length === 0 && (
                      <p className="text-[11px] text-stone-400">Nenhuma parcela. Use "Sugerir parcelas" (50% de sinal + etapas) ou adicione manualmente.</p>
                    )}

                    {(form.pagamentos || []).map((p) => (
                      <div key={p.id} className="grid grid-cols-12 gap-2 items-center">
                        <input className={inputClass + ' col-span-12 sm:col-span-3'} value={p.descricao} onChange={(e) => updatePagamento(p.id, { descricao: e.target.value })} placeholder="Descrição" />
                        <input className={inputClass + ' col-span-5 sm:col-span-2'} value={p.valor} onChange={(e) => updatePagamento(p.id, { valor: e.target.value })} placeholder="0,00" />
                        <select
                          className={inputClass + ' col-span-7 sm:col-span-3'}
                          value={p.gatilho}
                          onChange={(e) => {
                            const gatilho = e.target.value as PaymentTrigger;
                            updatePagamento(p.id, {
                              gatilho,
                              etapaKey: gatilho === 'etapa_aprovada' || gatilho === 'etapa_entregue' ? (p.etapaKey || etapasContrato[0]?.key) : undefined,
                              dataVencimento: gatilho === 'data' ? p.dataVencimento : undefined,
                            });
                          }}
                        >
                          {(Object.keys(TRIGGER_LABELS) as PaymentTrigger[]).map((g) => (
                            <option key={g} value={g}>{TRIGGER_LABELS[g]}</option>
                          ))}
                        </select>
                        <div className="col-span-10 sm:col-span-3">
                          {(p.gatilho === 'etapa_aprovada' || p.gatilho === 'etapa_entregue') && (
                            <select className={inputClass} value={p.etapaKey || ''} onChange={(e) => updatePagamento(p.id, { etapaKey: e.target.value })}>
                              <option value="">Etapa...</option>
                              {etapasContrato.map((e) => (
                                <option key={e.key} value={e.key}>Etapa {e.numero} – {e.titulo}</option>
                              ))}
                            </select>
                          )}
                          {p.gatilho === 'data' && (
                            <input type="date" className={inputClass} value={p.dataVencimento || ''} onChange={(e) => updatePagamento(p.id, { dataVencimento: e.target.value })} />
                          )}
                        </div>
                        <button type="button" onClick={() => removePagamento(p.id)} className="col-span-2 sm:col-span-1 p-2 text-stone-400 hover:text-red-500 cursor-pointer justify-self-end" title="Remover parcela">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ))}

                    {(form.pagamentos || []).length > 0 && (
                      <div className={`text-[11px] font-mono flex justify-between flex-wrap gap-2 pt-1 ${totalCents !== null && somaCents === totalCents ? 'text-emerald-600' : 'text-red-600'}`}>
                        <span>Soma das parcelas: R$ {formatCents(somaCents)}</span>
                        <span>Total do contrato: R$ {totalCents !== null ? formatCents(totalCents) : '—'}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Prazo e escopo */}
              {isNovo ? (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelClass + ' flex items-center gap-1.5'}><Calendar size={12} /> Prazo total (dias ininterruptos)</label>
                    <input className={inputClass} value={form.prazoDias || ''} onChange={(e) => setPrazoDias(e.target.value)} placeholder="150" />
                    <p className="text-[10px] text-stone-400 mt-1">
                      {form.prazoExecucao ? `No contrato: ${form.prazoExecucao}. ` : ''}
                      Pelo cronograma das etapas: ~{sugerirPrazoDias(servicos)} dias.
                    </p>
                  </div>
                  <div>
                    <label className={labelClass}>Prazo de aprovação de cada etapa (dias)</label>
                    <input
                      className={inputClass}
                      value={form.diasAprovacaoTacita || ''}
                      onChange={(e) => setForm({ ...form, diasAprovacaoTacita: e.target.value.replace(/\D/g, '') })}
                      placeholder="7"
                    />
                    <p className="text-[10px] text-stone-400 mt-1">Depois disso a etapa é considerada aprovada (cláusula 2.4).</p>
                  </div>
                  <div className="col-span-2">
                    <label className={labelClass + ' flex items-center gap-1.5'}><ClipboardList size={12} /> Objeto (cláusula 1.1) — editável</label>
                    <textarea rows={2} className={inputClass} value={form.escopoServicos} onChange={(e) => setForm({ ...form, escopoServicos: e.target.value })} />
                    <p className="text-[10px] text-stone-400 mt-1">Os entregáveis detalhados (cláusula 1.2) e o cronograma são gerados pelo modelo conforme os serviços marcados.</p>
                  </div>
                </div>
              ) : (
                <>
                  <div>
                    <label className={labelClass + ' flex items-center gap-1.5'}><Calendar size={12} /> Prazo de execução</label>
                    <input className={inputClass} value={form.prazoExecucao} onChange={(e) => setForm({ ...form, prazoExecucao: e.target.value })} placeholder="10 (dez) meses" />
                  </div>
                  <div>
                    <label className={labelClass + ' flex items-center gap-1.5'}><ClipboardList size={12} /> Escopo dos serviços / objeto (editável)</label>
                    <textarea rows={4} className={inputClass} value={form.escopoServicos} onChange={(e) => setForm({ ...form, escopoServicos: e.target.value })} />
                  </div>
                </>
              )}

              {type === 'empreitada_mao_de_obra' && (
                <>
                  <div className="border border-stone-200 p-3 space-y-3">
                    <label className={labelClass + ' mb-0'}>Contratada (empreiteiro executor)</label>
                    <div className="grid grid-cols-2 gap-3">
                      <input placeholder="Nome / Razão social" className={inputClass} value={form.contratado?.name || ''} onChange={(e) => updatePerson('contratado', { name: e.target.value })} />
                      <input placeholder="CPF/CNPJ" className={inputClass} value={form.contratado?.cpfCnpj || ''} onChange={(e) => updatePerson('contratado', { cpfCnpj: e.target.value })} />
                      <input placeholder="Endereço" className={inputClass + ' col-span-2'} value={form.contratado?.address || ''} onChange={(e) => updatePerson('contratado', { address: e.target.value })} />
                      <input placeholder="Encarregado de execução (se diferente)" className={inputClass + ' col-span-2'} value={form.encarregadoExecucao || ''} onChange={(e) => setForm({ ...form, encarregadoExecucao: e.target.value })} />
                    </div>
                  </div>

                  <div>
                    <label className={labelClass}>Serviços expressamente excluídos do escopo</label>
                    <textarea rows={3} className={inputClass} value={form.itensExcluidos || ''} onChange={(e) => setForm({ ...form, itensExcluidos: e.target.value })} />
                  </div>
                </>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Local de assinatura</label>
                  <input className={inputClass} value={form.localAssinatura} onChange={(e) => setForm({ ...form, localAssinatura: e.target.value })} />
                </div>
                <div>
                  <label className={labelClass}>Data de assinatura</label>
                  <input type="date" className={inputClass} value={form.dataAssinatura} onChange={(e) => setForm({ ...form, dataAssinatura: e.target.value })} />
                </div>
              </div>

              {isNovo && (
                <div className="border border-stone-200 p-3 space-y-3">
                  <label className={labelClass + ' mb-0'}>Testemunhas (opcional — entram no PDF e como assinantes)</label>
                  {[0, 1].map((i) => (
                    <div key={i} className="grid grid-cols-3 gap-2">
                      <input placeholder={`Testemunha ${i + 1} — nome`} className={inputClass} value={form.testemunhas?.[i]?.name || ''} onChange={(e) => updateTestemunha(i, { name: e.target.value })} />
                      <input placeholder="CPF/RG" className={inputClass} value={form.testemunhas?.[i]?.cpfCnpj || ''} onChange={(e) => updateTestemunha(i, { cpfCnpj: e.target.value })} />
                      <input placeholder="E-mail" type="email" className={inputClass} value={form.testemunhas?.[i]?.email || ''} onChange={(e) => updateTestemunha(i, { email: e.target.value })} />
                    </div>
                  ))}
                </div>
              )}

              {(validation.errors.length > 0 || validation.warnings.length > 0) && (
                <div className="space-y-2">
                  {validation.errors.length > 0 && (
                    <div className="border border-red-200 bg-red-50 p-3 text-[11px] text-red-700 space-y-1">
                      <div className="font-bold uppercase flex items-center gap-1.5"><AlertTriangle size={12} /> Corrija para gerar o contrato</div>
                      {validation.errors.map((e, i) => <div key={i}>• {e}</div>)}
                    </div>
                  )}
                  {validation.warnings.length > 0 && (
                    <div className="border border-amber-200 bg-amber-50 p-3 text-[11px] text-amber-800 space-y-1">
                      <div className="font-bold uppercase">Atenção (não impede a geração)</div>
                      {validation.warnings.map((w, i) => <div key={i}>• {w}</div>)}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="p-4 border-t border-stone-200 bg-stone-50 flex items-center justify-end gap-2.5">
              <button onClick={() => setFormOpen(false)} className="px-4 py-2.5 text-xs font-bold uppercase text-stone-500 hover:text-stone-800 cursor-pointer">
                Cancelar
              </button>
              <button
                disabled={!canSubmit || savingToSystem}
                onClick={handleSaveToSystem}
                className="flex items-center gap-2 bg-white border border-[#FF5A35] text-[#FF5A35] disabled:border-stone-300 disabled:text-stone-400 disabled:cursor-not-allowed px-5 py-2.5 text-xs font-bold uppercase tracking-wider hover:bg-[#FF5A35]/5 transition-colors cursor-pointer"
                title="Salva o PDF no sistema para consulta/edição futura, sem baixar"
              >
                {savingToSystem ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Salvar no Sistema
              </button>
              <button
                disabled={!canSubmit}
                onClick={handleSubmit}
                className="flex items-center gap-2 bg-[#FF5A35] disabled:bg-stone-300 disabled:cursor-not-allowed text-white px-5 py-2.5 text-xs font-bold uppercase tracking-wider hover:bg-[#e64d29] transition-colors cursor-pointer"
              >
                <CheckCircle2 size={14} /> Gerar PDF
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
