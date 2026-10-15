// src/lib/demo/texts.ts
// Frases de serviço por etapa (início / meio / fim) usadas no diário e nos relatórios semanais.
import type { PhaseKey } from './catalog';

export const ACTIVITIES: Record<PhaseKey, { ini: string[]; meio: string[]; fim: string[] }> = {
  adm: {
    ini: ['Reunião de alinhamento com o mestre de obras e encarregados', 'Organização do almoxarifado e controle de entrada de materiais'],
    meio: ['Conferência das medições dos empreiteiros e dos materiais entregues', 'Atualização do cronograma e checagem de compatibilização em campo'],
    fim: ['Fechamento das medições do mês e conferência de notas fiscais', 'Reunião de alinhamento com o cliente sobre prazos e acabamentos'],
  },
  prel: {
    ini: ['Limpeza do terreno, instalação do tapume e da placa de obra', 'Montagem do canteiro, almoxarifado e container de apoio'],
    meio: ['Execução da sondagem SPT e análise do relatório geotécnico', 'Protocolo e acompanhamento da aprovação do projeto na prefeitura'],
    fim: ['Liberação do alvará de construção e vistoria do canteiro', 'Conferência final do canteiro e treinamento de segurança da equipe'],
  },
  terra: {
    ini: ['Corte e nivelamento do terreno com retroescavadeira', 'Retirada da camada vegetal e carga de entulho em caminhões'],
    meio: ['Regularização de taludes e compactação do platô', 'Locação topográfica dos eixos e montagem do gabarito'],
    fim: ['Conferência do gabarito pelo topógrafo e liberação para as fundações'],
  },
  fund: {
    ini: ['Marcação das estacas e início da perfuração tipo broca', 'Escavação manual dos blocos de coroamento'],
    meio: ['Armação e concretagem dos blocos de fundação', 'Fôrmas e armação das vigas baldrame', 'Concretagem das estacas e arrasamento das cabeças', 'Conferência de prumo e locação dos blocos pelo topógrafo'],
    fim: ['Concretagem das vigas baldrame e impermeabilização com tinta betuminosa', 'Reaterro compactado e lastro de concreto magro'],
  },
  estr: {
    ini: ['Montagem de fôrmas e armação dos pilares do térreo', 'Concretagem dos pilares do térreo com concreto usinado', 'Conferência de armaduras e cobrimentos antes da concretagem'],
    meio: ['Escoramento e fôrmas da laje do piso superior', 'Concretagem da laje do pavimento superior com bomba', 'Armação da laje do piso superior e embutimento das tubulações', 'Cura úmida e retirada parcial do escoramento da laje do térreo', 'Concretagem de vigas e pilares do pavimento superior'],
    fim: ['Execução dos pilares, vigas e laje de cobertura', 'Desforma e cura úmida das vigas e da laje de cobertura'],
  },
  alv: {
    ini: ['Marcação da primeira fiada e elevação da alvenaria externa do térreo', 'Conferência de esquadro e nível das primeiras fiadas'],
    meio: ['Alvenaria interna do térreo com vergas e contravergas', 'Elevação da alvenaria do pavimento superior', 'Alvenaria de vedação das áreas molhadas e shafts', 'Colocação de vergas sobre vãos de portas e janelas'],
    fim: ['Encunhamento das últimas fiadas e fechamento de vãos técnicos', 'Conferência de prumo e nível da alvenaria'],
  },
  cob: {
    ini: ['Içamento e montagem das tesouras da estrutura metálica', 'Fixação de terças e contraventamentos'],
    meio: ['Instalação das telhas termoacústicas e da cumeeira', 'Execução de calhas e rufos', 'Fixação das telhas e acabamento de cumeeira', 'Execução de pingadeiras e rufos de encontro com a platibanda'],
    fim: ['Teste de estanqueidade da cobertura com mangueira', 'Conclusão de rufos, calhas e pingadeiras'],
  },
  ele: {
    ini: ['Marcação de pontos elétricos e rasgos nas paredes', 'Passagem de eletrodutos nas lajes e no piso'],
    meio: ['Passagem da fiação e instalação dos quadros de distribuição', 'Infraestrutura de dados, CFTV e antena', 'Montagem do quadro geral e dos quadros de distribuição', 'Lançamento de cabos de energia e dados nos eletrodutos'],
    fim: ['Testes de continuidade e isolamento dos circuitos', 'Instalação de tomadas, interruptores e espelhos'],
  },
  hid: {
    ini: ['Marcação dos pontos hidráulicos e rasgos nas paredes', 'Execução das prumadas de água fria e de esgoto'],
    meio: ['Tubulação de água quente e interligação do aquecedor solar', 'Instalação da caixa d’água e do sistema de recalque', 'Teste preliminar de pressão nas prumadas de água fria', 'Instalação de ralos, caixas sifonadas e tubulações de esgoto'],
    fim: ['Teste de estanqueidade (pressão) em todas as redes', 'Execução de caixas de gordura, de inspeção e fossa/filtro/sumidouro'],
  },
  imp: {
    ini: ['Preparo do substrato e aplicação de primer nas áreas molhadas'],
    meio: ['Aplicação de manta asfáltica no terraço e laje descoberta'],
    fim: ['Teste de lâmina d’água de 72 h nas áreas molhadas', 'Proteção mecânica das mantas'],
  },
  reb: {
    ini: ['Chapisco interno e externo', 'Taliscamento e execução das mestras do reboco'],
    meio: ['Reboco interno do térreo', 'Contrapiso regularizado com nivelamento a laser', 'Reboco interno do pavimento superior', 'Mestras e régua para contrapiso do pavimento superior'],
    fim: ['Reboco externo e acabamento das platibandas', 'Conferência de planicidade e liberação para forros e revestimentos'],
  },
  esq: {
    ini: ['Conferência de medidas in loco e liberação para fabricação das esquadrias', 'Instalação dos contramarcos de alumínio'],
    meio: ['Montagem das esquadrias de alumínio e das portas de correr', 'Instalação dos vidros laminados e temperados', 'Fixação de batentes e marcos de alumínio nas áreas externas', 'Instalação dos fechamentos de vidro da varanda'],
    fim: ['Instalação dos guarda-corpos de vidro e vedação com silicone', 'Ajustes de roldanas, fechos e travas'],
  },
  ges: {
    ini: ['Marcação do pé-direito e instalação dos perfis do forro'],
    meio: ['Fechamento do forro de gesso acartonado e das sancas', 'Colocação de cortineiros e negativos', 'Instalação de sancas com fita LED embutida', 'Fechamento do forro dos dormitórios'],
    fim: ['Tratamento de juntas e primeira demão de massa'],
  },
  pis: {
    ini: ['Conferência de caimentos e início do assentamento do porcelanato da sala', 'Assentamento de revestimentos nos banheiros'],
    meio: ['Assentamento do porcelanato dos quartos e circulação', 'Assentamento do revestimento da cozinha e áreas molhadas', 'Assentamento do porcelanato da cozinha e do gourmet', 'Assentamento de rodapés e conferência de nivelamento', 'Assentamento de revestimentos nas paredes dos lavabos'],
    fim: ['Rejuntamento e limpeza dos pisos', 'Instalação de bancadas, soleiras e peitoris'],
  },
  pin: {
    ini: ['Lixamento e aplicação de selador nas paredes'],
    meio: ['Aplicação de massa corrida e lixamento', 'Pintura de tetos e primeira demão nas paredes', 'Pintura de tetos e emassamento das paredes do pavimento superior', 'Pintura da fachada com textura e proteção contra umidade'],
    fim: ['Segunda demão e retoques, pintura da fachada', 'Remoção de proteções e conferência de retoques'],
  },
  mar: {
    ini: ['Medição final e liberação do detalhamento de marcenaria', 'Montagem dos armários da cozinha e lavanderia'],
    meio: ['Instalação dos closets e dos painéis ripados', 'Instalação de louças, cubas e metais', 'Montagem de armários dos dormitórios e do escritório', 'Instalação de bancadas e cubas após liberação da marcenaria'],
    fim: ['Ajustes de portas e gavetas e instalação de ferragens', 'Instalação de espelhos, persianas e acabamentos finais'],
  },
  esp: {
    ini: ['Instalação das condensadoras e passagem de dreno', 'Infraestrutura de automação e som ambiente'],
    meio: ['Instalação das evaporadoras e das luminárias', 'Programação do sistema de automação', 'Instalação de drivers e fitas LED nas sancas', 'Ajuste do aquecedor solar e dos termostatos'],
    fim: ['Testes e comissionamento do ar-condicionado e da automação', 'Treinamento do cliente nos sistemas'],
  },
  ext: {
    ini: ['Escavação e assentamento da piscina de fibra', 'Execução de calçadas e muro frontal', 'Locação e escavação da piscina de fibra'],
    meio: ['Assentamento do deck e das pedras do jardim', 'Instalação do portão automático e do gradil', 'Execução de calçadas e rampas de acesso', 'Instalação da casa de máquinas e do filtro da piscina', 'Preparo do solo e instalação da irrigação do jardim'],
    fim: ['Plantio, forrações e instalação da irrigação', 'Teste hidráulico e enchimento da piscina'],
  },
  ent: {
    ini: ['Vistoria interna com checklist de pendências'],
    meio: ['Correção de pendências e limpeza fina'],
    fim: ['Vistoria de entrega com o cliente e entrega das chaves', 'Entrega do manual do proprietário e das pastas as-built'],
  },
};

/** Observações de gerenciamento que entram esporadicamente nos relatórios semanais. */
export const MANAGEMENT_NOTES: string[] = [
  'Reunião quinzenal com o cliente: decisões sobre acabamentos registradas em ata.',
  'Visita técnica da arquitetura para conferência de detalhes executivos em campo.',
  'Reforçada a limpeza e organização do canteiro; inspeção de segurança sem não conformidades.',
  'Treinamento rápido (DDS) de segurança com a equipe sobre trabalho em altura.',
  'Conferência das notas fiscais e fechamento das medições dos empreiteiros.',
  'Atualização do cronograma físico-financeiro; desvio dentro da tolerância acordada.',
  'Inspeção de qualidade com checklist por serviço: itens liberados para a próxima etapa.',
  'Cliente visitou a obra e aprovou o andamento; solicitou pequenas alterações registradas em ata.',
];

export const WEATHER_BY_MONTH_RAIN: Record<number, number> = {
  1: 0.3, 2: 0.28, 3: 0.22, 4: 0.12, 5: 0.08, 6: 0.04,
  7: 0.03, 8: 0.03, 9: 0.1, 10: 0.2, 11: 0.27, 12: 0.32,
};

export const ENCARREGADOS = ['Eng. Chaves', 'Arq. Brites', 'Eng. Correa', 'Mestre Raimundo'];
