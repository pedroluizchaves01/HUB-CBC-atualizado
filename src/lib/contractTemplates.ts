import { Contract, ContractFormData, ContractPersonData, ContractType } from '../types';

export const CONTRACT_TYPE_LABELS: Record<ContractType, string> = {
  gerenciamento_obra: 'Gerenciamento de Obra',
  projeto_arquitetura: 'Projeto de Arquitetura',
  empreitada_mao_de_obra: 'Empreitada de Mão de Obra',
};

export const CONTRACT_TYPE_DOC_TITLES: Record<ContractType, string> = {
  gerenciamento_obra: 'CONTRATO DE GERENCIAMENTO DE CONSTRUÇÃO',
  projeto_arquitetura: 'CONTRATO DE PRESTAÇÃO DE SERVIÇOS DE PROJETO DE ARQUITETURA',
  empreitada_mao_de_obra: 'CONTRATO DE PRESTAÇÃO DE SERVIÇOS DE CONSTRUÇÃO POR EMPREITADA DE MÃO DE OBRA',
};

// Dados fixos da CONTRATADA (Chaves Brites Correa) — repetidos em todos os modelos.
export const CBC_FIXED_DATA = {
  name: 'Chaves Brites Correa, Arquitetura e Engenharia',
  cnpj: '46.317.044/0001-40',
  phone: '(67) 99301-1525',
  email: 'chavesbritescorrea@gmail.com',
  banco: 'Banco Cora (Código 403)',
  agencia: '0001',
  contaCorrente: '2501429-3',
  chavePix: '46.317.044/0001-40 (CNPJ)',
};

const emptyPerson = (): ContractPersonData => ({ name: '', cpfCnpj: '', address: '', qualification: '' });

export function emptyContractFormData(type: ContractType): ContractFormData {
  const base: ContractFormData = {
    contratante: emptyPerson(),
    localObjeto: '',
    cepObjeto: '',
    areaM2: '',
    descricaoImovel: '',
    valorTotal: '',
    prazoExecucao: '',
    escopoServicos: '',
    localAssinatura: 'Campo Grande - MS',
    dataAssinatura: new Date().toISOString().slice(0, 10),
  };

  if (type === 'gerenciamento_obra') {
    return {
      ...base,
      percentualHonorarios: '15',
      valorEntrada: '',
      numeroParcelas: '10',
      valorParcela: '',
      escopoServicos:
        'O gerenciamento consiste no acompanhamento técnico e desenvoltura geral da obra, evolução de medições, inventário de material consumido, e fiscalização da empreiteira contratada para a execução.',
      prazoExecucao: '10 (dez) meses',
    };
  }

  if (type === 'projeto_arquitetura') {
    return {
      ...base,
      formaPagamento: 'Parcela única (sinal / valor de entrada) devida no ato da assinatura deste contrato.',
      escopoServicos:
        'Prestação de serviços técnicos especializados de atualização de projeto arquitetônico, compreendendo a Compatibilização do Projeto Arquitetônico com os projetos complementares (estrutural, elétrico, hidrossanitário e correlatos), utilizando a metodologia e tecnologia de software BIM (Building Information Modeling).',
      prazoExecucao: '30 (trinta) dias corridos',
    };
  }

  // empreitada_mao_de_obra
  return {
    ...base,
    contratanteSolidario: emptyPerson(),
    contratado: emptyPerson(),
    encarregadoExecucao: '',
    responsavelTecnico: {
      name: 'Chaves Brites Correa, Arquitetura e Engenharia',
      cpfCnpj: CBC_FIXED_DATA.cnpj,
      address: '',
      qualification: 'Rep. Técnico: Eng. Vinícius Echeverria Brites, CREA/MS nº 13275D-MS',
    },
    responsavelTecnicoCargo: 'Eng. Vinícius Echeverria Brites, CREA/MS nº 13275D-MS',
    itensExcluidos:
      'Mármores e granitos, esquadrias de alumínio (montagem/regulagem final), automação residencial, marcenaria, climatização e ar-condicionado (fornecimento e startup), elementos decorativos (cortinas, persianas, papéis de parede), e quaisquer serviços não relacionados diretamente à edificação (caminhos, acessos, área social, infraestrutura do lote).',
    escopoServicos:
      'Prestação de serviços de mão de obra para a construção da residência descrita, em estrita observância aos projetos arquitetônico e complementares, seguindo o cronograma e a Planilha de Evolução de Serviços (PLS), cumprindo as Normas Brasileiras (ABNT/NBR) aplicáveis: NBR 6122, 14931, 6118, 8545, 15575, 10821, 14762, 9574, 9575, 13749, 5410, 5626, 8160, 13753 e 13754. Compreende barracão e ligações provisórias; infraestrutura (fundações e baldrame); supraestrutura (vigas, pilares e cintas); alvenaria; esquadrias (fixação de contramarcos); cobertura; fachada; impermeabilização; revestimento interno e externo; instalações elétricas e hidrossanitárias; pisos e revestimentos (até 90x90cm); louças e metais; pintura; e calçada.',
    prazoExecucao: '10 (dez) meses',
  };
}

// ---------- helpers de formatação ----------

export function formatBRL(value: string | number | undefined): string {
  const n = typeof value === 'string' ? Number(value.replace(/\./g, '').replace(',', '.')) : (value ?? 0);
  if (isNaN(n)) return String(value ?? '');
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function personBlock(label: string, p?: ContractPersonData): string {
  if (!p || !p.name) return '';
  const qual = p.qualification ? `, ${p.qualification}` : '';
  return `${label}: ${p.name}${qual}, inscrito(a) no CPF/CNPJ sob o nº ${p.cpfCnpj || '_______________'}, residente/sediado(a) em ${p.address || '_______________'}.`;
}

export interface ContractSection {
  heading: string;
  paragraphs: string[];
}

export interface ContractDocument {
  title: string;
  minutaLabel: string;
  sections: ContractSection[];
}

// ---------- montagem das cláusulas por tipo ----------

function buildGerenciamentoObra(d: ContractFormData): ContractSection[] {
  const parcelas = Number(d.numeroParcelas || 0);
  const parcelasRestantes = parcelas > 0 ? parcelas - 1 : 0;
  return [
    {
      heading: 'QUALIFICAÇÃO DAS PARTES',
      paragraphs: [
        `De um lado, ${d.contratante.name || '_______________'}, portador do CPF nº ${d.contratante.cpfCnpj || '_______________'}, residente e domiciliado na ${d.contratante.address || '_______________'}, doravante denominado CONTRATANTE, e de outro lado, ${CBC_FIXED_DATA.name}, CNPJ nº ${CBC_FIXED_DATA.cnpj}, com contato através do telefone ${CBC_FIXED_DATA.phone} e e-mail ${CBC_FIXED_DATA.email}, daqui para frente designado como CONTRATADA, sujeitando-se as partes contratantes às normas constantes no Código Civil, bem como às cláusulas abaixo:`,
      ],
    },
    {
      heading: 'CLÁUSULA PRIMEIRA - DO OBJETO',
      paragraphs: [
        `O presente contrato tem por objeto a prestação de serviço de gerenciamento de obra pela CONTRATADA, para a construção do imóvel descrito, com área aproximada de ${d.areaM2 || '____'} m², a qual se encontra localizada em ${d.localObjeto || '_______________'}${d.cepObjeto ? ` - CEP: ${d.cepObjeto}` : ''}.`,
        d.descricaoImovel ? `Especificações do imóvel: ${d.descricaoImovel}` : '',
        d.escopoServicos,
        'PARÁGRAFO ÚNICO – DOS DOCUMENTOS COMPLEMENTARES E ANEXOS. Fazem parte integrante e inseparável do presente contrato, para todos os efeitos legais, os seguintes documentos complementares e técnicos entregues como anexo ou a serem gerados no decorrer da prestação dos serviços: (i) Documentos de gestão e planejamento: cronograma físico-financeiro, programação de pedido de materiais, programação de pagamento de mão de obra; (ii) Documentos de acompanhamento mensal: mapas de cotação, recibos de pagamento dos fornecedores/empreiteiros, planilha de acompanhamento físico-financeiro da obra em tempo real.',
      ].filter(Boolean),
    },
    {
      heading: 'CLÁUSULA SEGUNDA – DO VALOR DO CONTRATO',
      paragraphs: [
        `O valor a ser pago pelo CONTRATANTE à CONTRATADA pelo serviço de fiscalização e gestão da obra será de R$ ${formatBRL(d.valorTotal)}${d.percentualHonorarios ? `, correspondente a ${d.percentualHonorarios}% (por cento) sobre o valor total estimado da construção` : ''}. Os honorários poderão ser reajustados no antepenúltimo mês conforme levantamento financeiro, a fim de atualizar os honorários baseados nos gastos efetivos realizados nos meses de construção.`,
        `PARÁGRAFO PRIMEIRO – O valor acordado entre as partes será pago da seguinte forma: Sinal/Entrada: R$ ${formatBRL(d.valorEntrada)} pagos no ato de assinatura do presente contrato; Parcelas e Vencimentos: ${d.numeroParcelas || '__'} parcelas mensais e sucessivas de R$ ${formatBRL(d.valorParcela)}, sendo o sinal correspondente à primeira parcela, restando ${parcelasRestantes} parcela(s) subsequente(s).`,
        `O pagamento deverá ser feito em conta corrente da CONTRATADA mediante transferência bancária ou PIX: ${CBC_FIXED_DATA.banco} | Favorecido: ${CBC_FIXED_DATA.name} | CNPJ: ${CBC_FIXED_DATA.cnpj} | Agência: ${CBC_FIXED_DATA.agencia} | Conta Corrente: ${CBC_FIXED_DATA.contaCorrente} | Chave Pix: ${CBC_FIXED_DATA.chavePix}.`,
        'PARÁGRAFO SEGUNDO - Os orçamentos que venham a ser realizados posteriormente ao orçamento preliminar em anexo serão motivo para adendo a este contrato, inclusive em relação aos honorários devidos à CONTRATADA, que serão fixados na mesma quantia do caput.',
      ],
    },
    {
      heading: 'CLÁUSULA TERCEIRA – DAS OBRIGAÇÕES DA CONTRATADA',
      paragraphs: [
        'O gerenciamento da obra consiste no acompanhamento técnico e na desenvoltura de uma maneira geral do deslinde do empreendimento, cabendo à CONTRATADA apresentar ao CONTRATANTE a evolução das medições a serem realizadas, o inventário do material de construção consumido, bem como fiscalizar o trabalho da empreiteira que será contratada para a execução da obra, inclusive no que tange à manutenção do local da obra, sua limpeza, e o respeito às normas previstas.',
        'PARÁGRAFO PRIMEIRO – Caberá à CONTRATADA aprovar a medição apresentada pela empreiteira responsável pela construção, para que assim os valores referentes àquela execução sejam devidamente pagos.',
        'PARÁGRAFO SEGUNDO – Caberá à CONTRATADA a realização de cotação e negociação dos orçamentos relativos aos materiais de construção.',
        'PARÁGRAFO TERCEIRO – A CONTRATADA tem a obrigação de fiscalizar a empreiteira na utilização dos materiais de construção, sendo obrigada a reportar ao CONTRATANTE eventual mau uso dos mesmos.',
      ],
    },
    {
      heading: 'CLÁUSULA QUARTA – DAS OBRIGAÇÕES DO CONTRATANTE',
      paragraphs: [
        'A CONTRATADA não tem qualquer responsabilidade na contratação de mão de obra para execução do serviço, cabendo ao CONTRATANTE escolher e contratar a empresa que terá esta atribuição, respondendo diretamente por eventuais obrigações trabalhistas, civis e previdenciárias.',
        'PARÁGRAFO PRIMEIRO – Os pagamentos a serem realizados à empreiteira contratada para a execução da obra deverão ser quitados diretamente a ela pelo CONTRATANTE.',
        'PARÁGRAFO SEGUNDO – A CONTRATADA não será responsável pela compra dos materiais de construção necessários para execução da obra, tal atribuição é de inteira responsabilidade do CONTRATANTE.',
        'PARÁGRAFO TERCEIRO – A realização de cotação e negociação dos orçamentos relativos aos materiais de construção poderá ser realizada pelo CONTRATANTE, desde que apresente os orçamentos dos materiais de construção para análise e aprovação da CONTRATADA.',
      ],
    },
    {
      heading: 'CLÁUSULA QUINTA – DA VIGÊNCIA DO CONTRATO',
      paragraphs: [
        `O prazo de execução do objeto do contrato será de ${d.prazoExecucao || '_______________'}.`,
        'PARÁGRAFO ÚNICO – Caso a execução do objeto do contrato seja finalizada antes do previsto no caput, o CONTRATANTE tem o dever de realizar o pagamento das parcelas vincendas devidas à CONTRATADA, uma vez que o número de parcelas corresponde à quantidade de tempo, em meses, estimada para que a obra fosse executada.',
      ],
    },
    {
      heading: 'CLÁUSULA SEXTA – DAS MODIFICAÇÕES CONTRATUAIS',
      paragraphs: [
        'Eventuais mudanças no cronograma, no projeto, e no orçamento da obra deverão ser feitas via adendo contratual, uma vez que tais disposições já foram outrora aprovadas e mudanças repentinas não serão executadas.',
      ],
    },
    {
      heading: 'CLÁUSULA SÉTIMA – DA RESCISÃO CONTRATUAL',
      paragraphs: [
        'A rescisão contratual ocorrerá pelo não cumprimento das cláusulas especificadas no presente instrumento, e caberá à parte que deu causa à rescisão o pagamento de multa de 20% (vinte por cento) sobre o valor integral acordado.',
        'PARÁGRAFO ÚNICO – As partes também poderão rescindir amigavelmente, desde que o façam por escrito, através de instrumento de rescisão contratual próprio.',
      ],
    },
    {
      heading: 'CLÁUSULA OITAVA – DO FORO',
      paragraphs: [
        `Fica eleito o foro da comarca de ${d.localAssinatura || 'Campo Grande – MS'}, renunciando a outro por mais privilegiado que seja, para dirimir quaisquer dúvidas ou discordâncias do presente contrato.`,
        'E por estarem certos e justos e contratados, o CONTRATANTE e a CONTRATADA firmam o presente contrato.',
      ],
    },
  ];
}

function buildProjetoArquitetura(d: ContractFormData): ContractSection[] {
  return [
    {
      heading: 'QUALIFICAÇÃO DAS PARTES',
      paragraphs: [
        `CONTRATANTE: ${d.contratante.name || '_______________'}, ${d.contratante.qualification || 'brasileiro(a)'}, inscrito(a) no CPF sob o nº ${d.contratante.cpfCnpj || '_______________'}, residente e domiciliado(a) na ${d.contratante.address || '_______________'}, doravante denominado simplesmente CONTRATANTE.`,
        `CONTRATADO: ${CBC_FIXED_DATA.name}, pessoa jurídica de direito privado, inscrita no CNPJ sob o nº ${CBC_FIXED_DATA.cnpj}, com canais de atendimento profissional através do telefone ${CBC_FIXED_DATA.phone} e do e-mail ${CBC_FIXED_DATA.email}, doravante denominado simplesmente CONTRATADO.`,
        'As partes acima qualificadas, de comum acordo, em conformidade com o Código Civil Brasileiro (Lei nº 10.406/2002) e demais legislações correlatas vigentes, têm entre si justo e contratado o presente instrumento, que se regerá pelas cláusulas e condições seguintes:',
      ],
    },
    {
      heading: 'CLÁUSULA PRIMEIRA – DO OBJETO E DO ESCOPO',
      paragraphs: [
        `1.1. ${d.escopoServicos}`,
        `1.2. Os serviços serão executados para o imóvel localizado no seguinte endereço: ${d.localObjeto || '_______________'}${d.cepObjeto ? ` – CEP: ${d.cepObjeto}` : ''}, correspondente a uma área aproximada de ${d.areaM2 || '____'} m².`,
        '1.3. O escopo dos serviços ora contratados limita-se rigorosamente ao descrito na cláusula 1.1, visando à detecção e resolução de interferências físicas e espaciais entre os projetos complementares fornecidos e o projeto arquitetônico, quando aplicável.',
        '1.4. Fazem parte integrante e inseparável do presente instrumento, para todos os efeitos legais, os documentos complementares e técnicos entregues como anexo a este contrato (listas de materiais e demais peças técnicas pertinentes).',
        '1.5. Ficam expressamente excluídos do escopo deste contrato quaisquer serviços que não estejam textualmente descritos nesta cláusula, tais como: aprovações em órgãos públicos, prefeituras, condomínios ou concessionárias; gerenciamento, fiscalização ou acompanhamento de obra; projeto de interiores detalhado; paisagismo; e elaboração de novos projetos complementares desde a sua origem.',
      ],
    },
    {
      heading: 'CLÁUSULA SEGUNDA – DOS PRAZOS E ETAPAS',
      paragraphs: [
        `2.1. O prazo total estimado para a execução e entrega de todas as etapas do projeto é de ${d.prazoExecucao || '_______________'}, contados a partir da data de assinatura deste instrumento e do recebimento, pelo CONTRATADO, de toda a documentação de base necessária.`,
        '2.2. O desenvolvimento do objeto contratado dar-se-á em conformidade com o cronograma e as etapas de entrega definidas de comum acordo entre as partes, contendo, quando aplicável: modelagem/layout preliminar, projeto executivo (peças gráficas, cortes, fachadas e detalhamentos) e extração de quantitativos.',
        '2.3. O CONTRATANTE terá o prazo de até 05 (cinco) dias úteis para analisar e manifestar sua aprovação ou solicitar revisões após a entrega de cada etapa. O silêncio do CONTRATANTE após este prazo ensejará a aceitação tácita da respectiva etapa, autorizando o CONTRATADO a prosseguir para a fase subsequente.',
        '2.4. Os períodos destinados à análise, revisão e aprovação por parte do CONTRATANTE, bem como eventuais atrasos na entrega de documentos de sua responsabilidade, não serão contabilizados no prazo estabelecido para o CONTRATADO.',
      ],
    },
    {
      heading: 'CLÁUSULA TERCEIRA – DO PREÇO E DAS CONDIÇÕES DE PAGAMENTO',
      paragraphs: [
        `3.1. Pela prestação dos serviços técnicos objeto deste contrato, o CONTRATANTE pagará ao CONTRATADO o valor total e fixo de R$ ${formatBRL(d.valorTotal)}.`,
        `3.2. ${d.formaPagamento || 'O pagamento será realizado em parcela única, devida no ato da assinatura deste contrato definitivo.'}`,
        `3.3. O pagamento deverá ser efetuado exclusivamente por meio de transferência bancária ou PIX para a conta corrente do CONTRATADO: ${CBC_FIXED_DATA.banco} | Beneficiário: ${CBC_FIXED_DATA.name} | CNPJ: ${CBC_FIXED_DATA.cnpj} | Agência: ${CBC_FIXED_DATA.agencia} | Conta Corrente: ${CBC_FIXED_DATA.contaCorrente} | Chave Pix: ${CBC_FIXED_DATA.chavePix}.`,
        '3.4. Em caso de atraso no pagamento do valor estabelecido, incidirá sobre o débito multa moratória de 2% (dois por cento), além de juros de mora de 1% (um por cento) ao mês, calculados pro rata die, acrescidos de correção monetária pelo índice IPCA/IBGE (ou outro que venha a substituí-lo), sem prejuízo da suspensão imediata dos trabalhos pelo CONTRATADO até a integral regularização financeira.',
      ],
    },
    {
      heading: 'CLÁUSULA QUARTA – DOS DIREITOS AUTORAIS E PROPRIEDADE INTELECTUAL',
      paragraphs: [
        '4.1. Os direitos autorais morais e patrimoniais sobre o projeto arquitetônico objeto deste contrato pertencem exclusivamente ao CONTRATADO, nos termos da Lei de Direitos Autorais (Lei nº 9.610/1998) e das diretrizes civis vigentes.',
        `4.2. O CONTRATANTE adquire, por força deste contrato, o direito de uso do projeto exclusivamente para a execução da obra no endereço indicado na Cláusula Primeira (${d.localObjeto || '_______________'}).`,
        '4.3. É expressamente vedada a cessão, doação, comercialização, replicação, publicação ou utilização do projeto, de forma parcial ou integral, para a execução de qualquer outra obra ou em local diverso do pactuado, sob pena de responder civil e criminalmente por violação de propriedade intelectual.',
        '4.4. O CONTRATADO reserva-se o direito de utilizar imagens, renderizações e representações gráficas do projeto em seu portfólio profissional, redes sociais, publicações acadêmicas ou comerciais, preservando-se a privacidade do CONTRATANTE e omitindo dados estritamente pessoais.',
      ],
    },
    {
      heading: 'CLÁUSULA QUINTA – DAS OBRIGAÇÕES DO CONTRATANTE',
      paragraphs: [
        '5.1. Constituem obrigações do CONTRATANTE, além das demais previstas em lei e neste instrumento: a) efetuar o pagamento do valor pactuado na Cláusula Terceira; b) fornecer ao CONTRATADO, em formato digital editável e compatível, todos os arquivos necessários para o início dos trabalhos; c) fornecer dados cadastrais, informações técnicas e diretrizes de forma clara, tempestiva e precisa, responsabilizando-se civilmente pela veracidade destes; d) responder prontamente às solicitações de esclarecimento e aprovações formuladas pelo CONTRATADO; e) abster-se de realizar modificações unilaterais nas peças gráficas fornecidas pelo CONTRATADO sem a prévia e expressa anuência deste.',
      ],
    },
    {
      heading: 'CLÁUSULA SEXTA – DAS OBRIGAÇÕES DO CONTRATADO',
      paragraphs: [
        '6.1. Constituem obrigações do CONTRATADO, além das demais previstas em lei e neste instrumento: a) executar os serviços contratados com estrita diligência, perícia, ética e rigor técnico; b) cumprir os prazos estipulados no cronograma de entregas, salvo por motivos de força maior, caso fortuito ou atrasos decorrentes de atos do próprio CONTRATANTE; c) observar as normas técnicas brasileiras aplicáveis (ABNT/NBR) e as legislações edilícias locais vigentes; d) fornecer os arquivos finais das etapas pactuadas em formato digital adequado; e) manter sigilo sobre quaisquer dados pessoais ou informações estratégicas do CONTRATANTE.',
      ],
    },
    {
      heading: 'CLÁUSULA SÉTIMA – DA RESCISÃO E MULTAS',
      paragraphs: [
        '7.1. O presente contrato poderá ser rescindido de pleno direito por qualquer das partes em caso de inadimplemento culposo de qualquer cláusula (não regularizada em até 5 dias úteis após notificação escrita), força maior que impossibilite definitivamente a prestação dos serviços, ou falência/recuperação judicial/insolvência civil de qualquer das partes.',
        '7.2. Qualquer das partes poderá rescindir o presente instrumento de forma imotivada, mediante aviso prévio por escrito com antecedência mínima de 30 (trinta) dias.',
        '7.3. Em caso de rescisão imotivada, ou motivada por inadimplemento do CONTRATANTE, este último responderá pelo pagamento correspondente a todas as etapas já executadas até a data da efetiva rescisão, incidindo ainda multa rescisória compensatória de 10% (dez por cento) sobre o saldo remanescente do contrato.',
        '7.4. Caso ocorra a rescisão por culpa exclusiva do CONTRATADO, este restituirá ao CONTRATANTE os valores eventualmente pagos adiantados correspondentes às etapas ainda não elaboradas ou entregues, deduzindo-se os custos operacionais e as etapas já concluídas.',
      ],
    },
    {
      heading: 'CLÁUSULA OITAVA – DOS ATRASOS E CASOS FORTUITOS / FORÇA MAIOR',
      paragraphs: [
        '8.1. Não serão considerados atrasos imputáveis ao CONTRATADO aqueles decorrentes de demora do CONTRATANTE na entrega de informações/documentos/aprovações; solicitações de alterações substanciais de escopo; demoras burocráticas de órgãos públicos, concessionárias ou condomínios; e eventos de caso fortuito ou força maior (art. 393 do Código Civil).',
        '8.2. Constatada qualquer das hipóteses acima, o cronograma e os prazos de entrega do CONTRATADO serão automaticamente prorrogados por período correspondente ao do impedimento, devendo tal situação ser comunicada por escrito ao CONTRATANTE.',
      ],
    },
    {
      heading: 'CLÁUSULA NONA – DO FORO DE ELEIÇÃO',
      paragraphs: [
        `9.1. Para dirimir quaisquer controvérsias, dúvidas ou litígios decorrentes deste contrato, as partes elegem, com expressa renúncia a qualquer outro, o foro da Comarca de ${d.localAssinatura || 'Campo Grande, Estado de Mato Grosso do Sul'}, local da prestação dos serviços técnicos contratados.`,
      ],
    },
  ];
}

function buildEmpreitada(d: ContractFormData): ContractSection[] {
  const segundoContratante = d.contratanteSolidario?.name
    ? personBlock('Segundo CONTRATANTE (solidário)', d.contratanteSolidario)
    : '';
  return [
    {
      heading: 'QUALIFICAÇÃO DAS PARTES',
      paragraphs: [
        personBlock('CONTRATANTE', d.contratante),
        segundoContratante,
        d.contratado?.name
          ? `CONTRATADA (DETENTORA DO CONTRATO): ${d.contratado.name}, inscrito(a) no CPF/CNPJ sob o nº ${d.contratado.cpfCnpj || '_______________'}, com endereço em ${d.contratado.address || '_______________'}.`
          : '',
        d.encarregadoExecucao
          ? `ENCARREGADO DE EXECUÇÃO: ${d.encarregadoExecucao}, responsável pela condução direta, em canteiro, da equipe de mão de obra e pela execução material dos serviços descritos neste instrumento, sem prejuízo da supervisão técnica exercida pelo Responsável Técnico pela Fiscalização de Execução.`
          : '',
        d.responsavelTecnico?.name
          ? `INTERVENIENTE-FISCALIZADORA / RESPONSÁVEL TÉCNICO PELA FISCALIZAÇÃO DE EXECUÇÃO: ${d.responsavelTecnico.name}, CNPJ nº ${d.responsavelTecnico.cpfCnpj}${d.responsavelTecnicoCargo ? `, neste ato representada tecnicamente por ${d.responsavelTecnicoCargo}` : ''}, figurando na qualidade de interveniente-anuente.`
          : '',
        'As partes acima qualificadas têm entre si, de maneira justa e acordada, o presente Contrato de Construção por Empreitada de Mão de Obra, que se regerá pelas cláusulas e condições de direito a seguir descritas.',
      ].filter(Boolean),
    },
    {
      heading: 'CLÁUSULA 1 – OBJETO DO CONTRATO',
      paragraphs: [
        `1.1. O presente instrumento tem como objeto a prestação de serviços de mão de obra para a construção do imóvel com área total de ${d.areaM2 || '____'} m², a ser executada no terreno situado em ${d.localObjeto || '_______________'}${d.cepObjeto ? ` – CEP: ${d.cepObjeto}` : ''}.`,
        `1.2. Das etapas da obra e normas técnicas: ${d.escopoServicos}`,
        d.descricaoImovel ? `Especificações adicionais do imóvel: ${d.descricaoImovel}` : '',
        '1.3. A obra será executada nos exatos termos da planta arquitetônica e dos projetos estruturais e complementares aprovados junto à Prefeitura Municipal, consoante o respectivo Alvará de Construção vigente.',
        '1.4. O CONTRATADO limitar-se-á a executar o escopo contido nos projetos de engenharia e arquitetura. Qualquer modificação substancial solicitada pelos CONTRATANTES ensejará aditivo contratual e readequação de custos.',
        '1.5. O presente contrato é de empreitada exclusivamente de mão de obra. O fornecimento e a compra de todos os materiais necessários à execução da obra competem única e exclusivamente aos CONTRATANTES. A locação de equipamentos técnicos será realizada e custeada diretamente pelos CONTRATANTES sob orientação logística do CONTRATADO.',
      ].filter(Boolean),
    },
    {
      heading: 'CLÁUSULA 2 – DOS SERVIÇOS EXPRESSAMENTE EXCLUÍDOS DO ESCOPO',
      paragraphs: [
        `2.1. Ficam expressamente excluídos do objeto e do escopo de prestação de serviços deste contrato, não sendo de responsabilidade técnica ou operacional da CONTRATADA: ${d.itensExcluidos || 'a definir'}.`,
        '2.2. A contratação, coordenação e o pagamento dos profissionais terceirizados especializados para a execução dos serviços excluídos nesta cláusula correrão por conta exclusiva dos CONTRATANTES, que deverão respeitar as normas de segurança do canteiro de obras e alinhar seus cronogramas com a CONTRATADA.',
      ],
    },
    {
      heading: 'CLÁUSULA 3 – PRAZO DE EXECUÇÃO E READEQUAÇÃO DO CRONOGRAMA',
      paragraphs: [
        `3.1. O CONTRATADO compromete-se a executar integralmente a obra no prazo de ${d.prazoExecucao || '_______________'}, cujo termo inicial ocorrerá no primeiro dia útil subsequente à assinatura deste instrumento e à efetiva liberação física do canteiro de obras.`,
        '3.2. O prazo contratual será automaticamente suspenso, não computando atraso por parte do CONTRATADO, em caso de: chuvas torrenciais que impossibilitem trabalhos externos; atraso no fornecimento de materiais/insumos de responsabilidade dos CONTRATANTES; atraso na liberação de parcelas financeiras por período superior a 5 (cinco) dias corridos; embargos administrativos/judiciais/condominiais não motivados por culpa do CONTRATADO; e casos fortuitos ou de força maior (art. 393 do Código Civil).',
      ],
    },
    {
      heading: 'CLÁUSULA 4 – REGIME DE EXECUÇÃO, FISCALIZAÇÃO E RESPONSABILIDADES',
      paragraphs: [
        '4.1. A execução direta e em canteiro dos serviços de mão de obra ficará a cargo exclusivo do Encarregado de Execução, sob a supervisão técnica do Responsável Técnico pela Fiscalização de Execução.',
        '4.2. A interveniente-fiscalizadora assume a obrigação expressa de fiscalizar, supervisionar e auditar tecnicamente os serviços executados.',
        '4.3. Toda a equipe de execução manterá vínculo empregatício único e exclusivo com a CONTRATADA e seus parceiros técnicos executores, que responderão integralmente por suas respectivas remunerações e encargos trabalhistas, previdenciários e securitários, inexistindo qualquer vínculo com os CONTRATANTES.',
        '4.4. Fica acordada entre as partes uma margem de tolerância técnica de quebra e perda natural de até 8% (oito por cento) para insumos básicos, cerâmicas e argamassas. Perdas que superem flagrantemente este percentual por manifesto erro de execução ou negligência deverão ser ressarcidas pelo CONTRATADO.',
        '4.5. O CONTRATADO responderá técnica e civilmente por eventuais vícios de construção decorrentes estritamente de falhas de execução dos serviços pelo prazo legal de 5 (cinco) anos, excluídos desgastes naturais por falta de manutenção dos CONTRATANTES ou alterações feitas por terceiros sem anuência do CONTRATADO.',
      ],
    },
    {
      heading: 'CLÁUSULA 5 – PREÇO, CONDIÇÕES DE PAGAMENTO E CLÁUSULAS DE MORA',
      paragraphs: [
        `5.1. A título de contraprestação pelos serviços de mão de obra descritos neste instrumento, os CONTRATANTES pagarão ao CONTRATADO o valor total, fixo e fechado, de R$ ${formatBRL(d.valorTotal)}.`,
        `5.2. Forma de pagamento: ${d.formaPagamento || 'parcelas quinzenais, conforme documento complementar de previsão de desembolso de mão de obra a ser apresentado pela empresa responsável pela fiscalização do contrato'}, realizadas exclusivamente por meio de transferência bancária ou PIX.`,
        '5.3. Caso a execução física da obra seja concluída antes do prazo estimado, e atestada a evolução de 100% do cronograma por laudo técnico oficial, o saldo residual remanescente vencerá antecipadamente, devendo os CONTRATANTES quitá-lo em parcela única em até 15 (quinze) dias úteis da emissão do laudo.',
        '5.4. O recibo de depósito bancário, o comprovante da operação PIX ou a respectiva Nota Fiscal de Serviços constituem prova inequívoca de quitação das parcelas contratuais.',
        '5.5. O não pagamento de qualquer parcela na data de seu vencimento sujeitará os CONTRATANTES à multa moratória de 2% (dois por cento) sobre o valor em atraso, acrescida de juros moratórios de 1% (um por cento) ao mês, calculados pro rata die, além de atualização monetária pelo INCC-FGV.',
        '5.6. Constatado o atraso no pagamento por período superior a 10 (dez) dias corridos, assiste ao CONTRATADO o direito de suspender imediatamente a prestação dos serviços e desmobilizar sua equipe do canteiro, sem penalidade por atraso durante o período de paralisação. A retomada ocorrerá em até 48 (quarenta e oito) horas úteis após a compensação integral dos valores devidos.',
        '5.7. Se por culpa exclusiva dos CONTRATANTES a execução do objeto contratual estender-se além do prazo previsto, as parcelas continuarão vencendo normalmente até o limite originalmente previsto; a partir de então, a permanência da mão de obra será cobrada mediante aditivo contratual proporcional aos meses excedentes.',
      ],
    },
    {
      heading: 'CLÁUSULA 6 – VISTORIAS E HOMOLOGAÇÃO DAS MEDIÇÕES',
      paragraphs: [
        '6.1. Quinzenalmente será realizada a aferição do avanço físico da mão de obra ("Medição Filha"), destinada a balizar a liberação das parcelas de pagamento quinzenais.',
        '6.2. Mensalmente será realizado o levantamento físico-financeiro consolidado ("Medição Mãe Mensal"), com base no qual será emitida a Planilha de Evolução de Serviços (PLS).',
        '6.3. A empresa fiscalizante obriga-se a apresentar formalmente aos CONTRATANTES, semanalmente, o Relatório Semanal de Obra (RSO), detalhando o percentual executado, atividades concluídas, recebimento de materiais e planejamento do período seguinte.',
        '6.4. A execução dos serviços será acompanhada e fiscalizada semanalmente, diretamente pelos CONTRATANTES e/ou pela interveniente-fiscalizadora, garantido livre acesso ao canteiro de obras, observadas as normas de segurança do trabalho (EPIs).',
        '6.5. Após o envio formal do boletim de medição por canais digitais, os CONTRATANTES disporão do prazo preclusivo de 48 (quarenta e oito) horas úteis para apresentar contestação técnica fundamentada por escrito, sob pena de aceite tácito e homologação irrevogável da medição.',
      ],
    },
    {
      heading: 'CLÁUSULA 7 – RESCISÃO CONTRATUAL',
      paragraphs: [
        '7.1. Da rescisão imotivada: o presente instrumento poderá ser rescindido unilateralmente por qualquer parte, mediante aviso prévio formal por escrito com antecedência mínima de 30 (trinta) dias corridos, obrigando a parte distratante ao pagamento da multa compensatória prevista na Cláusula 8, sem prejuízo do acerto de contas dos serviços já executados.',
        '7.2. Da rescisão motivada: o presente instrumento poderá ser rescindido de imediato, por justa causa, mediante simples notificação, em caso de: abandono da obra pelo CONTRATADO por prazo superior a 15 (quinze) dias corridos sem justificativa aceita; descumprimento reiterado e injustificado do cronograma físico; inadimplemento contratual grave por qualquer das partes; ou vício grave de execução que coloque em risco a segurança da edificação ou de terceiros.',
      ],
    },
    {
      heading: 'CLÁUSULA 8 – CLÁUSULA PENAL (MULTA COMPENSATÓRIA)',
      paragraphs: [
        '8.1. O descumprimento total ou parcial de qualquer cláusula, obrigação ou condição deste contrato sujeitará a parte infratora ao pagamento de multa compensatória equivalente a 10% (dez por cento) sobre o valor total atualizado do contrato, revertida em benefício da parte inocente, sem prejuízo de perdas e danos adicionais apurados em via própria.',
        '8.2. A multa compensatória não se confunde nem exclui a aplicação da multa moratória e dos juros moratórios previstos na Cláusula 5.5, sendo as penalidades plenamente cumuláveis sempre que configuradas hipóteses distintas de inadimplemento.',
      ],
    },
    {
      heading: 'CLÁUSULA 9 – DO FORO E DISPOSIÇÕES FINAIS',
      paragraphs: [
        '9.1. O presente instrumento passa a vigorar entre as partes e seus sucessores legais a partir da data de sua assinatura digital ou física.',
        `9.2. Para dirimir quaisquer dúvidas, controvérsias ou litígios oriundos da interpretação ou execução deste contrato, as partes elegem o Foro da Comarca de ${d.localAssinatura || 'Campo Grande/MS'}, local de situação do imóvel objeto da prestação de serviços, com renúncia a qualquer outro, por mais privilegiado que seja.`,
        'E por estarem assim justas, contratadas e perfeitamente alinhadas, as partes assinam o presente Contrato de Empreitada de Mão de Obra, na presença das testemunhas abaixo instrumentárias.',
      ],
    },
  ];
}

export function buildContractDocument(type: ContractType, data: ContractFormData): ContractDocument {
  const sections =
    type === 'gerenciamento_obra'
      ? buildGerenciamentoObra(data)
      : type === 'projeto_arquitetura'
        ? buildProjetoArquitetura(data)
        : buildEmpreitada(data);

  return {
    title: CONTRACT_TYPE_DOC_TITLES[type],
    minutaLabel: CONTRACT_TYPE_LABELS[type].toUpperCase(),
    sections,
  };
}

// Lista de assinantes a exibir no bloco de assinaturas, por tipo.
export function buildSignatureBlocks(type: ContractType, data: ContractFormData): { role: string; name: string; doc: string }[] {
  const blocks: { role: string; name: string; doc: string }[] = [
    { role: 'CONTRATANTE', name: data.contratante.name || '_______________', doc: data.contratante.cpfCnpj || '_______________' },
  ];
  if (type === 'empreitada_mao_de_obra' && data.contratanteSolidario?.name) {
    blocks.push({ role: 'CONTRATANTE', name: data.contratanteSolidario.name, doc: data.contratanteSolidario.cpfCnpj || '_______________' });
  }
  if (type === 'empreitada_mao_de_obra') {
    blocks.push({
      role: 'CONTRATADA',
      name: data.contratado?.name || '_______________',
      doc: data.contratado?.cpfCnpj || '_______________',
    });
    blocks.push({
      role: 'INTERVENIENTE-FISCALIZADORA',
      name: data.responsavelTecnico?.name || CBC_FIXED_DATA.name,
      doc: data.responsavelTecnico?.cpfCnpj || CBC_FIXED_DATA.cnpj,
    });
  } else {
    blocks.push({ role: 'CONTRATADA', name: CBC_FIXED_DATA.name, doc: CBC_FIXED_DATA.cnpj });
  }
  return blocks;
}
