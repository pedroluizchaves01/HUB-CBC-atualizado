// Utilitários de valores monetários e números por extenso (pt-BR) para contratos.
// Os valores monetários são manipulados em CENTAVOS (inteiros) para evitar erros de ponto flutuante.

const UNIDADES = [
  'zero', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez',
  'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove',
];
const DEZENAS = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
const CENTENAS = [
  '', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos',
];

/** Converte "9.660,00", "9660,5", "9660.50" ou number em centavos inteiros. Retorna null se inválido. */
export function parseBRLToCents(value: string | number | undefined | null): number | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? Math.round(value * 100) : null;
  let s = String(value).replace(/[R$\s]/g, '');
  if (!s) return null;
  if (s.includes(',')) {
    // formato brasileiro: ponto = milhar, vírgula = decimal
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    // "9.660" → milhar sem decimais
    s = s.replace(/\./g, '');
  }
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [int, dec = ''] = s.split('.');
  return parseInt(int, 10) * 100 + parseInt((dec + '00').slice(0, 2), 10);
}

/** Centavos → "9.660,00" */
export function formatCents(cents: number): string {
  const neg = cents < 0;
  const abs = Math.abs(Math.round(cents));
  const int = Math.floor(abs / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const dec = (abs % 100).toString().padStart(2, '0');
  return `${neg ? '-' : ''}${int},${dec}`;
}

// 0..999
function centenaPorExtenso(n: number): string {
  if (n === 0) return '';
  if (n === 100) return 'cem';
  const c = Math.floor(n / 100);
  const resto = n % 100;
  const partes: string[] = [];
  if (c > 0) partes.push(CENTENAS[c]);
  if (resto > 0) {
    if (resto < 20) partes.push(UNIDADES[resto]);
    else {
      const d = Math.floor(resto / 10);
      const u = resto % 10;
      partes.push(u ? `${DEZENAS[d]} e ${UNIDADES[u]}` : DEZENAS[d]);
    }
  }
  return partes.join(' e ');
}

/**
 * Número inteiro por extenso (0 ≤ n < 10^12). Segue a grafia do modelo CBC:
 * 1.464 → "um mil, quatrocentos e sessenta e quatro"; 3.600 → "três mil e seiscentos".
 */
export function numeroPorExtenso(n: number): string {
  if (!Number.isInteger(n) || n < 0) return '';
  if (n === 0) return 'zero';
  const grupos: { valor: number; singular: string; plural: string }[] = [
    { valor: Math.floor(n / 1_000_000_000) % 1000, singular: 'bilhão', plural: 'bilhões' },
    { valor: Math.floor(n / 1_000_000) % 1000, singular: 'milhão', plural: 'milhões' },
    { valor: Math.floor(n / 1000) % 1000, singular: 'mil', plural: 'mil' },
    { valor: n % 1000, singular: '', plural: '' },
  ];
  const textos: string[] = [];
  grupos.forEach((g, idx) => {
    if (g.valor === 0) return;
    let t = centenaPorExtenso(g.valor);
    if (g.singular) {
      // "um mil" (grafia do modelo), "um milhão", "dois milhões"
      t = `${t} ${g.valor === 1 ? g.singular : g.plural}`;
    }
    textos.push(t);
    void idx;
  });
  if (textos.length === 1) return textos[0];
  // Une os grupos: "e" antes do último grupo quando ele é < 100 ou centena exata; senão vírgula.
  let out = textos[0];
  for (let i = 1; i < textos.length; i++) {
    const ultimo = i === textos.length - 1;
    const resto = n % 1000;
    const usaE = ultimo && (resto < 100 || resto % 100 === 0);
    out += (usaE ? ' e ' : ', ') + textos[i];
  }
  return out;
}

/** Centavos → "dezenove mil, trezentos e vinte reais" (com centavos quando houver). */
export function valorPorExtenso(cents: number): string {
  if (!Number.isFinite(cents) || cents < 0) return '';
  const reais = Math.floor(cents / 100);
  const centavos = Math.round(cents % 100);
  const partes: string[] = [];
  if (reais > 0 || centavos === 0) {
    const grande = reais >= 1_000_000 && reais % 1_000_000 === 0;
    partes.push(`${numeroPorExtenso(reais)}${grande ? ' de' : ''} ${reais === 1 ? 'real' : 'reais'}`);
  }
  if (centavos > 0) {
    partes.push(`${numeroPorExtenso(centavos)} ${centavos === 1 ? 'centavo' : 'centavos'}`);
  }
  return partes.join(' e ');
}

/** Dias → "150 (cento e cinquenta) dias ininterruptos" */
export function prazoDiasPorExtenso(dias: number): string {
  if (!Number.isInteger(dias) || dias <= 0) return '';
  return `${dias} (${numeroPorExtenso(dias)}) ${dias === 1 ? 'dia ininterrupto' : 'dias ininterruptos'}`;
}

/** Divide `totalCents` conforme pesos, sem perder centavos (o resto vai à última parcela). */
export function distribuirProporcional(totalCents: number, pesos: number[]): number[] {
  const soma = pesos.reduce((a, b) => a + b, 0);
  if (!pesos.length || soma <= 0) return pesos.map(() => 0);
  const partes = pesos.map((p) => Math.floor((totalCents * p) / soma));
  const diff = totalCents - partes.reduce((a, b) => a + b, 0);
  partes[partes.length - 1] += diff;
  return partes;
}
