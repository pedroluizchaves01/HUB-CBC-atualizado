// ============================================================
// Catálogo de etapas do escopo Chaves Brites Correa (Road Map)
// Organiza as etapas por serviço contratado (arquitetônico / interiores)
// e marca as etapas condicionais (aprovações, cadernos) que o arquiteto
// liga ou desliga por projeto.
// ============================================================

export type ServicoId = 'arquitetonico' | 'interiores';

export interface PhaseTemplate {
  key: string;              // identificador estável da etapa
  name: string;             // nome exibido
  servico: ServicoId;       // a qual serviço pertence
  opcional?: boolean;       // se true, o arquiteto liga/desliga (vem desligada por padrão)
  semanas: number;          // duração padrão em semanas
  paralela?: boolean;       // roda em paralelo à etapa anterior (não empurra o cronograma)
  entregaveis: string[];    // "Você recebe" — itens do PDF
  pagamento?: string;       // texto de pagamento vinculado (informativo)
}

// Etapa base que sempre existe (contagem começa aqui).
export const ETAPA_LEVANTAMENTO: PhaseTemplate = {
  key: 'levantamento',
  name: 'Levantamento e Briefing',
  servico: 'arquitetonico',
  semanas: 1,
  entregaveis: [
    'Visita técnica ao terreno',
    'Levantamento das condicionantes e do programa de necessidades',
    'Consolidação do briefing de premissas preenchido pelo cliente',
  ],
};

// Catálogo completo, na ordem do fluxo.
export const CATALOGO_ETAPAS: PhaseTemplate[] = [
  ETAPA_LEVANTAMENTO,
  {
    key: 'estudo_preliminar',
    name: 'Estudo Preliminar',
    servico: 'arquitetonico',
    semanas: 4,
    entregaveis: [
      'Estudo dos fluxos entre os ambientes com a setorização e fluxograma',
      'Planta baixa humanizada com posicionamento dos mobiliários e proposta arquitetônica dos ambientes',
      'Estudo de fachada com volumetria branca e renderização foto realista com aplicações de materiais',
    ],
    pagamento: 'R$ 3.600,00 na aprovação da entrega dos arquivos',
  },
  {
    key: 'anteprojeto',
    name: 'Anteprojeto',
    servico: 'arquitetonico',
    semanas: 4,
    entregaveis: [
      'Plantas de todos os pavimentos, cortes e fachadas cotados',
      'Planta de cobertura e implantação definitiva',
      'Plantas executivas com cotas, níveis e eixos',
      'Quadro de esquadrias e planilha de vãos',
      'Planta de forro',
      'Planta de pontos elétricos e de iluminação',
    ],
    pagamento: 'R$ 2.400,00 na aprovação do anteprojeto',
  },
  {
    key: 'aprovacao_prefeitura',
    name: 'Projeto Legal — Aprovação na Prefeitura',
    servico: 'arquitetonico',
    opcional: true,
    semanas: 4,
    entregaveis: [
      'Projeto legal conforme o código de obras do município',
      'Peças gráficas para protocolo na prefeitura',
      'Acompanhamento do processo de aprovação',
    ],
    pagamento: 'Conforme proposta específica',
  },
  {
    key: 'aprovacao_condominio',
    name: 'Projeto Legal — Aprovação no Condomínio',
    servico: 'arquitetonico',
    opcional: true,
    semanas: 2,
    entregaveis: [
      'Adequação do projeto às normas do condomínio',
      'Peças gráficas para submissão à análise do condomínio',
      'Acompanhamento da aprovação junto ao condomínio',
    ],
    pagamento: 'Conforme proposta específica',
  },
  {
    key: 'concepcao_interiores',
    name: 'Concepção de Interiores',
    servico: 'interiores',
    semanas: 4,
    entregaveis: [
      'Maquete 3D de cada ambiente',
      'Vistas dos detalhes artísticos de cada ambiente',
    ],
    pagamento: 'R$ 2.196,00 na aprovação da concepção de interiores',
  },
  {
    key: 'detalhamento',
    name: 'Detalhamento e Especificações',
    servico: 'arquitetonico',
    semanas: 8,
    entregaveis: [
      'Detalhes ampliados de escadas, banheiros, cozinha e áreas molhadas',
      'Paginação de pisos e revestimentos',
      'Caderno de especificações com marca, modelo e referência de cada item',
      'Memorial descritivo para orçamento',
    ],
    pagamento: 'R$ 1.464,00 na entrega do caderno de especificações',
  },
  {
    key: 'caderno_interiores',
    name: 'Caderno de Fotos / Interiores',
    servico: 'interiores',
    opcional: true,
    semanas: 2,
    entregaveis: [
      'Caderno de imagens finais dos ambientes',
      'Referências de acabamentos, mobiliário e decoração',
    ],
    pagamento: 'Conforme proposta específica',
  },
  {
    key: 'compatibilizacao',
    name: 'Compatibilização de Projetos Complementares',
    servico: 'arquitetonico',
    semanas: 4,
    paralela: true,
    entregaveis: [
      'Projeto estrutural com fundações, formas e armaduras',
      'Projeto elétrico com quadros de carga e pontos',
      'Projeto hidrossanitário com água fria, quente, esgoto e pluvial',
      'Relatório de compatibilização e ART/RRT dos responsáveis técnicos',
    ],
    pagamento: 'Sem custos adicionais',
  },
];

// Monta a lista de etapas de um projeto a partir dos serviços contratados
// e das etapas opcionais ativadas. Mantém a ordem do catálogo.
export function montarEtapas(opts: {
  servicos: ServicoId[];
  opcionaisAtivas: string[]; // keys das etapas opcionais ligadas
}): PhaseTemplate[] {
  const { servicos, opcionaisAtivas } = opts;
  return CATALOGO_ETAPAS.filter(t => {
    if (!servicos.includes(t.servico)) return false;
    if (t.opcional && !opcionaisAtivas.includes(t.key)) return false;
    return true;
  });
}
