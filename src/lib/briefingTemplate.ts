// src/lib/briefingTemplate.ts
//
// Briefing de projeto arquitetônico: questionário padrão que o cliente responde
// como primeira etapa do projeto. O arquiteto pode editar, adicionar ou remover
// perguntas por projeto — este é apenas o ponto de partida.

export interface BriefingQuestion {
  id: string;
  group: string;   // tema (agrupa as perguntas)
  text: string;    // enunciado
}

export interface BriefingAnswer {
  questionId: string;
  answer: string;
}

// Gera um id estável para perguntas do template (para casar respostas depois).
const q = (id: string, group: string, text: string): BriefingQuestion => ({ id, group, text });

export const DEFAULT_BRIEFING: BriefingQuestion[] = [
  // Terreno e implantação
  q('terreno_possui', 'Terreno e implantação', 'Você já possui o terreno? Qual o endereço ou localização?'),
  q('terreno_dimensoes', 'Terreno e implantação', 'Quais as dimensões e a topografia do terreno (plano, aclive, declive)?'),
  q('terreno_existente', 'Terreno e implantação', 'Há construção existente? Será demolida, reformada ou ampliada?'),
  q('terreno_orientacao', 'Terreno e implantação', 'Como é a incidência de sol no terreno (onde bate sol de manhã e de tarde)?'),

  // Programa de necessidades
  q('prog_moradores', 'Programa de necessidades', 'Quantas pessoas vão morar na casa? Faixa etária e pets?'),
  q('prog_quartos', 'Programa de necessidades', 'Quantos quartos e quantas suítes você deseja?'),
  q('prog_sociais', 'Programa de necessidades', 'Quais ambientes sociais deseja (estar, jantar, home theater, espaço gourmet)?'),
  q('prog_servico', 'Programa de necessidades', 'Quais ambientes de serviço (lavanderia, despensa, dependência de empregada)?'),
  q('prog_extras', 'Programa de necessidades', 'Deseja home office, academia, piscina, churrasqueira ou outro espaço externo?'),
  q('prog_garagem', 'Programa de necessidades', 'Quantas vagas de garagem? Cobertas?'),

  // Estilo e referências
  q('estilo_gosto', 'Estilo e referências', 'Qual estilo arquitetônico você prefere (contemporâneo, clássico, rústico, minimalista)?'),
  q('estilo_referencias', 'Estilo e referências', 'Tem referências visuais? (links do Pinterest, Instagram, fotos de projetos que gostou)'),
  q('estilo_materiais', 'Estilo e referências', 'Materiais e acabamentos de preferência (madeira, concreto, pedra, etc.)?'),
  q('estilo_cores', 'Estilo e referências', 'Cores que você gosta e cores que não gosta?'),

  // Uso e rotina
  q('rotina_familia', 'Uso e rotina', 'Como é a rotina da família? Recebem visitas com frequência?'),
  q('rotina_prioridades', 'Uso e rotina', 'Quais ambientes vocês mais usam? Prioridades de conforto?'),
  q('rotina_especiais', 'Uso e rotina', 'Há necessidades especiais (acessibilidade, idosos, crianças pequenas)?'),

  // Orçamento e prazo
  q('orc_investimento', 'Orçamento e prazo', 'Qual a faixa de investimento prevista para a obra?'),
  q('orc_prazo', 'Orçamento e prazo', 'Há um prazo desejado para início e conclusão?'),
  q('orc_etapas', 'Orçamento e prazo', 'Pretende construir tudo de uma vez ou em etapas?'),

  // Sustentabilidade e tecnologia
  q('sust_energia', 'Sustentabilidade e tecnologia', 'Interesse em energia solar, reuso de água ou ventilação natural?'),
  q('sust_automacao', 'Sustentabilidade e tecnologia', 'Deseja automação residencial (casa inteligente)?'),

  // Observações livres
  q('obs_sonhos', 'Observações livres', 'Sonhos e desejos: o que você faz questão de ter no projeto?'),
  q('obs_evitar', 'Observações livres', 'Há algo que você faça questão de evitar?'),
];

// Ordem dos grupos (para renderizar na sequência correta).
export const BRIEFING_GROUPS = [
  'Terreno e implantação',
  'Programa de necessidades',
  'Estilo e referências',
  'Uso e rotina',
  'Orçamento e prazo',
  'Sustentabilidade e tecnologia',
  'Observações livres',
];
