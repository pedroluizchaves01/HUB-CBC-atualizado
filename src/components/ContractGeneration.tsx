import React, { useMemo, useState } from 'react';
import {
  FileSignature, Plus, Download, Trash2, X, User, Building, Search,
  ClipboardList, Calendar, DollarSign, CheckCircle2, Edit3
} from 'lucide-react';
import { Client, Contract, ContractFormData, ContractPersonData, ContractStatus, ContractType, Project } from '../types';
import { CONTRACT_TYPE_LABELS, emptyContractFormData } from '../lib/contractTemplates';
import { downloadContractPdf } from '../lib/contractPdf';

interface ContractGenerationProps {
  clients: Client[];
  projects: Project[];
  contracts: Contract[];
  onAddContract: (contract: Contract) => void | Promise<void>;
  onEditContract: (contract: Contract) => void | Promise<void>;
  onDeleteContract: (id: string) => void | Promise<void>;
}

const STATUS_LABELS: Record<ContractStatus, { label: string; color: string }> = {
  rascunho: { label: 'Rascunho', color: 'bg-stone-200 text-stone-700' },
  gerado: { label: 'PDF Gerado', color: 'bg-blue-100 text-blue-700' },
  assinado: { label: 'Assinado', color: 'bg-emerald-100 text-emerald-700' },
  cancelado: { label: 'Cancelado', color: 'bg-red-100 text-red-700' },
};

const inputClass =
  'w-full bg-stone-50 border border-stone-200 text-xs py-2.5 px-3 focus:outline-hidden focus:border-[#FF5A35] focus:bg-white transition-all font-mono';
const labelClass = 'block text-[10px] font-bold uppercase tracking-wider text-stone-500 mb-1';

function personToLabel(p?: ContractPersonData): string {
  if (!p || !p.name) return '';
  return p.cpfCnpj ? `${p.name} — ${p.cpfCnpj}` : p.name;
}

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
  const [type, setType] = useState<ContractType>('gerenciamento_obra');
  const [projectId, setProjectId] = useState('');
  const [useExistingClient, setUseExistingClient] = useState(true);
  const [selectedClientId, setSelectedClientId] = useState('');
  const [form, setForm] = useState<ContractFormData>(emptyContractFormData('gerenciamento_obra'));
  const [filterProject, setFilterProject] = useState('');

  const projectById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);
  const clientById = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);

  const nextNumber = useMemo(() => (contracts.length ? Math.max(...contracts.map((c) => c.number)) + 1 : 1), [contracts]);

  const filteredContracts = useMemo(() => {
    return contracts
      .filter((c) => !filterProject || c.projectId === filterProject)
      .sort((a, b) => b.number - a.number);
  }, [contracts, filterProject]);

  const resetForm = (t: ContractType = 'gerenciamento_obra') => {
    setType(t);
    setForm(emptyContractFormData(t));
    setProjectId('');
    setUseExistingClient(true);
    setSelectedClientId('');
    setEditingId(null);
  };

  const openNew = () => {
    resetForm('gerenciamento_obra');
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
      setForm((f) => ({
        ...f,
        localObjeto: f.localObjeto || proj.location || '',
        areaM2: f.areaM2 || (proj.area ? String(proj.area) : ''),
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
      contratante: { ...f.contratante, name: client.name },
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
        descricaoImovel: prev.descricaoImovel,
        localAssinatura: prev.localAssinatura,
        dataAssinatura: prev.dataAssinatura,
      };
    });
  };

  const canSubmit = projectId && form.contratante.name.trim().length > 0;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    const contract: Contract = {
      id: editingId || `contract-${Date.now()}`,
      projectId,
      type,
      number: editingId ? (contracts.find((c) => c.id === editingId)?.number ?? nextNumber) : nextNumber,
      status: 'gerado',
      createdAt: editingId ? (contracts.find((c) => c.id === editingId)?.createdAt ?? new Date().toISOString()) : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      data: form,
    };
    if (editingId) {
      await onEditContract(contract);
    } else {
      await onAddContract(contract);
    }
    downloadContractPdf(contract, projectById.get(projectId));
    setFormOpen(false);
    resetForm();
  };

  const handleDownloadExisting = (contract: Contract) => {
    downloadContractPdf(contract, projectById.get(contract.projectId));
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
        <button
          onClick={openNew}
          className="flex items-center gap-2 bg-[#FF5A35] text-white px-4 py-2.5 text-xs font-bold uppercase tracking-wider hover:bg-[#e64d29] transition-colors cursor-pointer"
        >
          <Plus size={14} /> Novo Contrato
        </button>
      </div>

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
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  onClick={() => openEdit(c)}
                  className="p-2 text-stone-400 hover:text-[#FF5A35] hover:bg-stone-100 transition-colors cursor-pointer"
                  title="Editar"
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
                  onClick={() => onDeleteContract(c.id)}
                  className="p-2 text-stone-400 hover:text-red-500 hover:bg-red-50 transition-colors cursor-pointer"
                  title="Excluir"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          );
        })}
      </div>

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
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
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
                  <label className={labelClass}>Área (m²)</label>
                  <input className={inputClass} value={form.areaM2} onChange={(e) => setForm({ ...form, areaM2: e.target.value })} />
                </div>
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
              </div>

              {/* Prazo e escopo */}
              <div>
                <label className={labelClass + ' flex items-center gap-1.5'}><Calendar size={12} /> Prazo de execução</label>
                <input className={inputClass} value={form.prazoExecucao} onChange={(e) => setForm({ ...form, prazoExecucao: e.target.value })} placeholder="10 (dez) meses" />
              </div>
              <div>
                <label className={labelClass + ' flex items-center gap-1.5'}><ClipboardList size={12} /> Escopo dos serviços / objeto (editável)</label>
                <textarea rows={4} className={inputClass} value={form.escopoServicos} onChange={(e) => setForm({ ...form, escopoServicos: e.target.value })} />
              </div>

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
            </div>

            <div className="p-4 border-t border-stone-200 bg-stone-50 flex items-center justify-end gap-2.5">
              <button onClick={() => setFormOpen(false)} className="px-4 py-2.5 text-xs font-bold uppercase text-stone-500 hover:text-stone-800 cursor-pointer">
                Cancelar
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
