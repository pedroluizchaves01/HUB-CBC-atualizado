// src/lib/thermalAnalysis.ts
//
// Estudo automatizado de conforto térmico (premissas de projeto).
// Lógica portada do relatório HTML do usuário: a partir da localização
// (cidade conhecida OU latitude), deriva clima, temperatura, umidade, ventos,
// exposição solar por fachada e recomendações arquitetônicas/construtivas.
//
// Função pura e determinística — não depende de API externa.

export interface Solucoes {
  arquitetonicas: string[];
  construtivas: string[];
  detalhes: string[];
}

export interface ClimaData {
  latitude: number;
  longitude: number;
  tempMedia: number;
  tempMax: number;
  tempMin: number;
  umidadeMedia: number;
  precipitacao: number;
  clima: string;
  classificacao: string;
  ventosPredominantes: string;
  velocidadeVento: number;
  periodoVentoQuente: string;
  periodoVentoFrio: string;
  solucoes: Solucoes;
}

export const CIDADES: Record<string, ClimaData> = {
            'Campo Grande, MS': {
                latitude: -20.44,
                longitude: -54.62,
                tempMedia: 23,
                tempMax: 31,
                tempMin: 17,
                umidadeMedia: 68,
                precipitacao: 1400,
                clima: 'Tropical de Altitude',
                classificacao: 'Quente Seco/Tropical',
                ventosPredominantes: 'N/NE',
                velocidadeVento: 2.8,
                periodoVentoQuente: 'N/NE (Dez-Mar)',
                periodoVentoFrio: 'S/SO (Jun-Ago)',
                solucoes: {
                    arquitetonicas: [
                        '🌬️ Aproveitar ventos N/NE para ventilação cruzada em períodos quentes',
                        '🪟 Aberturas maiores nas fachadas N e NE para captar brisas',
                        '🌳 Barreira verde ao Sul para bloquear ventos frios do inverno',
                        '🏗️ Pátios internos para captar ventos em profundidade',
                        '📐 Recuos nas fachadas L/O para criar sombreamento natural'
                    ],
                    construtivas: [
                        '🧱 Alvenaria estrutural de peso médio (bloco cerâmico 14cm)',
                        '🏠 Reboco com cal e areia natural para permeabilidade térmica',
                        '🪴 Cobertura com telhas cerâmicas de barro com câmara de ar',
                        '🌿 Forro de madeira ou placas cimentícias para inércia térmica',
                        '🪟 Vidros simples 3mm + persiana interna para controle solar',
                        '💨 Canaletas de drenagem em cobertura com sótão ventilado'
                    ],
                    detalhes: [
                        'Pé-direito mínimo 3.20m para circulação de ar',
                        'Proporção de aberturas: 25-30% da área de piso',
                        'Beirais mínimo 1.00m nas fachadas L/O',
                        'Brises horizontais nas janelas altas (orientação O)',
                        'Escada externa sombreada para reduzir ganhos'
                    ]
                }
            },
            'São Paulo, SP': {
                latitude: -23.55,
                longitude: -46.63,
                tempMedia: 20.5,
                tempMax: 27,
                tempMin: 16,
                umidadeMedia: 72,
                precipitacao: 1500,
                clima: 'Subtropical',
                classificacao: 'Temperado',
                ventosPredominantes: 'N/NE e S',
                velocidadeVento: 2.2,
                periodoVentoQuente: 'N/NE (Dez-Fev)',
                periodoVentoFrio: 'S/SO (Jun-Ago)',
                solucoes: {
                    arquitetonicas: [
                        '☀️ Fachada Norte como fachada principal para ganho solar invernal',
                        '🌬️ Ventilação cruzada N-S para períodos quentes',
                        '🪵 Varandas profundas (mín. 2.00m) em fachadas L/O',
                        '🌳 Árvores decíduas na frente Norte para sombra no verão',
                        '📍 Implantação com eixo longitudinal N-S'
                    ],
                    construtivas: [
                        '🧱 Alvenaria dupla com câmara de ar (bloco + isolante)',
                        '🪨 Reboco com pintura clara para refletir calor',
                        '🪴 Cobertura com telhas + placas de poliestireno',
                        '🏠 Forro suspenso com lã de vidro 50mm',
                        '🪟 Vidros duplos laminados (6+12+6mm)',
                        '🚪 Portas com vedação acústica'
                    ],
                    detalhes: [
                        'Pé-direito 3.00m para ambientes de permanência',
                        'Proporção de aberturas: 20-25% da área de piso',
                        'Beirais 1.50m nas fachadas L/O',
                        'Vidros com películas especiais na orientação Oeste',
                        'Circulação vertical centralizada para reduzir ponte térmica'
                    ]
                }
            },
            'Brasília, DF': {
                latitude: -15.79,
                longitude: -47.88,
                tempMedia: 21,
                tempMax: 28,
                tempMin: 15,
                umidadeMedia: 60,
                precipitacao: 1600,
                clima: 'Tropical de Altitude',
                classificacao: 'Quente Seco',
                ventosPredominantes: 'E/NE',
                velocidadeVento: 3.1,
                periodoVentoQuente: 'E/NE (Out-Abr)',
                periodoVentoFrio: 'O/SO (Mai-Set)',
                solucoes: {
                    arquitetonicas: [
                        '🌬️ Aberturas na fachada Oeste para captar brisas vespertinas',
                        '🪴 Saguão com duplo pé-direito conectando pavimentos',
                        '🌳 Pátio central com árvores para resfriamento evaporativo',
                        '📐 Blocos ou agrupamentos com espaçamento para fluxo de ar',
                        '🏗️ Cobertura em shed orientado para captar ventos'
                    ],
                    construtivas: [
                        '🧱 Alvenaria convencional de espessura 14cm com reboco',
                        '🪨 Pintura externa em cores claras (branco/bege)',
                        '🪴 Cobertura com telhas cerâmicas + câmara de ar mínimo 20cm',
                        '🌿 Forro de madeira nativa (freijó ou cumaru)',
                        '🪟 Vidros simples 3mm com cortinas térmicas internas',
                        '💨 Venezianas de madeira nas aberturas'
                    ],
                    detalhes: [
                        'Pé-direito 3.50m para otimizar ventilação',
                        'Proporção de aberturas: 30-35% da área de piso',
                        'Beirais 2.00m para sombreamento máximo',
                        'Pergolado em fachada Oeste com vegetação',
                        'Espaço entre edificações mínimo 6.00m'
                    ]
                }
            },
            'Fortaleza, CE': {
                latitude: -3.73,
                longitude: -38.53,
                tempMedia: 26,
                tempMax: 30,
                tempMin: 23,
                umidadeMedia: 78,
                precipitacao: 800,
                clima: 'Tropical Semiárido',
                classificacao: 'Quente Úmido',
                ventosPredominantes: 'E/SE',
                velocidadeVento: 4.2,
                periodoVentoQuente: 'E (todo ano)',
                periodoVentoFrio: 'O/NO (jul-ago)',
                solucoes: {
                    arquitetonicas: [
                        '🌬️ Ventilação máxima: aberturas em parede dupla',
                        '🏠 Ambientes com pé-direito duplo (4.00m mínimo)',
                        '🌳 Varandas profundas 3.00m em todas as fachadas',
                        '💨 Sheds ou lanternins para efeito chaminé permanente',
                        '🌊 Espaço sombreado com vegetação e espelhos d\'água'
                    ],
                    construtivas: [
                        '🧱 Alvenaria estrutural de bloco estrutural 14cm',
                        '🪨 Reboco com cal + areia e pintura com pigmentos claros',
                        '🪴 Telhas cerâmicas com espaçamento máximo entre ripas',
                        '🌀 Forro vazado ou removível para passagem de ar',
                        '🪟 Basculantes e maxim-ar em lugar de vidros fixos',
                        '🌿 Treliça de madeira com plantas rasteiras'
                    ],
                    detalhes: [
                        'Pé-direito mínimo 3.50m em todos os ambientes',
                        'Proporção de aberturas: 35-40% da área de piso',
                        'Beirais 2.50m para bloqueio solar máximo',
                        'Posicionamento perpendicular aos ventos E',
                        'Circulação de ar contínua sem barreiras internas'
                    ]
                }
            },
            'Porto Alegre, RS': {
                latitude: -30.03,
                longitude: -51.22,
                tempMedia: 19,
                tempMax: 27,
                tempMin: 12,
                umidadeMedia: 75,
                precipitacao: 1500,
                clima: 'Subtropical',
                classificacao: 'Temperado',
                ventosPredominantes: 'N/NE e S',
                velocidadeVento: 2.5,
                periodoVentoQuente: 'N/NE (Out-Dez)',
                periodoVentoFrio: 'S/SO (Mai-Aug)',
                solucoes: {
                    arquitetonicas: [
                        '☀️ Fachada Norte aberta para ganho solar no inverno',
                        '🪟 Reduzir aberturas na fachada Sul (sombreamento)',
                        '🏗️ Varanda aquecida na orientação Norte',
                        '🌳 Arbustos densos na fachada Sul contra ventos frios',
                        '📐 Volumes compactos para reduzir perdas'
                    ],
                    construtivas: [
                        '🧱 Alvenaria dupla com câmara de ar (14+5+14cm)',
                        '🪨 Isolamento térmico: lã de vidro ou poliestireno',
                        '🪴 Cobertura com telhas + forro isolado 80mm',
                        '🏠 Vidros duplos laminados 6+12+6mm em todas as orientações',
                        '🚪 Portas externas com dupla vedação',
                        '💨 Canaleta de ar quente sob telhado'
                    ],
                    detalhes: [
                        'Pé-direito 2.80m para facilitar aquecimento',
                        'Proporção de aberturas: 15-20% da área de piso',
                        'Beirais 1.00m na fachada Sul',
                        'Vidros com película solar 50% na orientação Oeste',
                        'Acesso único controlado para reduzir infiltrações'
                    ]
                }
            }
        };

// Deriva dados climáticos a partir da latitude quando a cidade não está na base.
function interpolarPorLatitude(lat: number, lon: number): ClimaData {
  const absLat = Math.abs(lat);
  let tempMedia: number, umidade: number, clima: string, classificacao: string;
  let ventosPrincipais: string, velocidadeVento: number;
  let ventoPeriodoQuente: string, ventoPeriodoFrio: string;

  if (absLat < 5) {
    tempMedia = 26; umidade = 80; clima = 'Tropical Equatorial'; classificacao = 'Quente Úmido';
    ventosPrincipais = 'E/NE'; velocidadeVento = 3.5; ventoPeriodoQuente = 'E (todo ano)'; ventoPeriodoFrio = 'O (moderado)';
  } else if (absLat < 15) {
    tempMedia = 24; umidade = 75; clima = 'Tropical'; classificacao = 'Quente Úmido';
    ventosPrincipais = 'NE/E'; velocidadeVento = 3.2; ventoPeriodoQuente = 'NE (Dez-Mar)'; ventoPeriodoFrio = 'O/NO (Jun-Ago)';
  } else if (absLat < 23.5) {
    tempMedia = 22; umidade = 70; clima = 'Tropical de Altitude'; classificacao = 'Quente Seco';
    ventosPrincipais = 'N/NE'; velocidadeVento = 2.8; ventoPeriodoQuente = 'N/NE (Dez-Mar)'; ventoPeriodoFrio = 'S/SO (Jun-Ago)';
  } else {
    tempMedia = 20; umidade = 72; clima = 'Subtropical'; classificacao = 'Temperado';
    ventosPrincipais = 'N/S'; velocidadeVento = 2.5; ventoPeriodoQuente = 'N/NE (Out-Dez)'; ventoPeriodoFrio = 'S/SO (Mai-Ago)';
  }

  return {
    latitude: lat, longitude: lon, tempMedia, tempMax: tempMedia + 8, tempMin: tempMedia - 6,
    umidadeMedia: umidade, precipitacao: 1400, clima, classificacao,
    ventosPredominantes: ventosPrincipais, velocidadeVento,
    periodoVentoQuente: ventoPeriodoQuente, periodoVentoFrio: ventoPeriodoFrio,
    solucoes: solucoesPorClassificacao(classificacao),
  };
}

// Soluções genéricas por classificação climática (quando não há cidade específica).
function solucoesPorClassificacao(classificacao: string): Solucoes {
  if (classificacao === 'Quente Úmido') {
    return {
      arquitetonicas: ['Ventilação máxima em todas as direções', 'Pé-direito elevado (mín. 4,00m)', 'Varandas profundas em todas as fachadas', 'Sheds ou lanternins para efeito chaminé', 'Espaço sombreado com vegetação'],
      construtivas: ['Alvenaria com blocos vazados 14cm', 'Reboco fino que permite transpiração', 'Telhas cerâmicas com espaçamento máximo', 'Forro vazado ou removível', 'Basculantes e maxim-ar nas aberturas'],
      detalhes: ['Pé-direito mínimo 3,50–4,00m', 'Aberturas: 35–40% da área de piso', 'Beirais 2,50m para bloqueio solar', 'Circulação de ar contínua', 'Espaçamento mínimo entre edificações 6,00m'],
    };
  }
  if (classificacao === 'Quente Seco') {
    return {
      arquitetonicas: ['Aproveitar ventos para ventilação cruzada', 'Aberturas N/NE para captar brisas', 'Barreira verde ao Sul contra ventos frios', 'Pátios internos para captar ventos', 'Recuos nas fachadas L/O para sombreamento'],
      construtivas: ['Alvenaria cerâmica de peso médio 14cm', 'Reboco com cal e areia natural', 'Cobertura com telhas cerâmicas com câmara', 'Forro de madeira para inércia térmica', 'Vidros simples 3mm + persiana interna'],
      detalhes: ['Pé-direito mínimo 3,20m', 'Aberturas: 25–30% da área de piso', 'Beirais mínimo 1,00m nas fachadas L/O', 'Brises horizontais nas janelas altas (O)', 'Escada externa sombreada'],
    };
  }
  return {
    arquitetonicas: ['Fachada Norte como principal para ganho solar', 'Ventilação cruzada N–S nos períodos quentes', 'Varandas profundas (2,00m) em L/O', 'Árvores decíduas na frente Norte', 'Implantação com eixo longitudinal N–S'],
    construtivas: ['Alvenaria dupla com câmara de ar', 'Reboco com pintura clara', 'Cobertura com placas isolantes', 'Forro suspenso com lã de vidro 50mm', 'Vidros duplos laminados'],
    detalhes: ['Pé-direito 3,00m nos ambientes de permanência', 'Aberturas: 20–25% da área de piso', 'Beirais 1,50m nas fachadas L/O', 'Películas especiais na orientação O', 'Circulação vertical centralizada'],
  };
}

export type Orientacao = 'N' | 'S' | 'L' | 'O' | 'NE' | 'SE' | 'SO' | 'NO';

export interface ThermalInputs {
  localizacao: string;
  latitude: number;
  longitude: number;
  tipoEdificacao?: string;
  orientacao: Orientacao;
  areaConstruida?: number;
}

export interface ThermalResult {
  dados: ClimaData;
  exposicao: string;
  periodoCritico: string;
  desafio: string;
  potencial: string;
  eficiencia: string;
  insolacao: string;
  recomendacoes: string[];
}

const EXPOSICOES: Record<string, string> = {
  N: 'Baixa (favorável)', S: 'Baixa (favorável)', L: 'Alta (manhã)', O: 'Muito alta (tarde)',
  NE: 'Alta (manhã)', SE: 'Média', SO: 'Muito alta (tarde)', NO: 'Alta (manhã)',
};
const DESAFIOS: Record<string, string> = {
  'Quente Úmido': 'Controle de umidade e calor',
  'Quente Seco': 'Sombreamento e ventilação',
  'Temperado': 'Equilíbrio sazonal',
  'Subtropical': 'Variação sazonal',
};

// Obtém os dados climáticos: cidade exata na base, senão interpola por latitude.
export function obterDadosClimaticos(localizacao: string, lat: number, lon: number): ClimaData {
  if (localizacao && CIDADES[localizacao]) return CIDADES[localizacao];
  return interpolarPorLatitude(lat, lon);
}

// Análise completa de conforto térmico para um projeto.
export function analisarConfortoTermico(input: ThermalInputs): ThermalResult {
  const dados = obterDadosClimaticos(input.localizacao, input.latitude, input.longitude);
  const exposicao = EXPOSICOES[input.orientacao] || 'Média';
  const periodoCritico = input.latitude > -23.5 ? 'Verão (Dez–Fev)' : 'Verão (Out–Abr)';
  const desafio = DESAFIOS[dados.classificacao] || 'Variação sazonal';

  const recomendacoes = [
    dados.umidadeMedia > 70 ? 'Priorizar ventilação natural e controle de umidade' : 'Controlar ganhos solares excessivos',
    (input.orientacao === 'O' || input.orientacao === 'SO') ? 'Instalar proteção solar na fachada Oeste' : 'Otimizar insolação na fachada Norte',
    dados.tempMax > 28 ? 'Implementar estratégias de resfriamento evaporativo' : 'Projetar para ganho solar no inverno',
    'Integrar paisagismo estratégico para sombreamento',
    'Dimensionar aberturas para ventilação cruzada',
  ];

  return {
    dados, exposicao, periodoCritico, desafio,
    potencial: 'Alto — climatização natural',
    eficiencia: '65–80%',
    insolacao: '12h/dia',
    recomendacoes,
  };
}

// Estimativa simples de coordenadas a partir do texto de localização (fallback),
// usando a base de cidades conhecidas por nome aproximado.
export function coordsDeLocalizacao(localizacao: string): { lat: number; lon: number } | null {
  if (!localizacao) return null;
  const exato = CIDADES[localizacao];
  if (exato) return { lat: exato.latitude, lon: exato.longitude };
  // tenta casar pelo início (ex.: "São Paulo")
  const chave = Object.keys(CIDADES).find(k => k.toLowerCase().startsWith(localizacao.trim().toLowerCase().split(',')[0]));
  if (chave) return { lat: CIDADES[chave].latitude, lon: CIDADES[chave].longitude };
  return null;
}
