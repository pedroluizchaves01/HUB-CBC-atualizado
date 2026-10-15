// src/lib/demo/util.ts
// Utilitários determinísticos do gerador da OBRA DEMONSTRATIVA (datas, números pseudo-aleatórios).
// Tudo aqui é puro: o mesmo código gera sempre exatamente os mesmos dados.

/** Gerador pseudo-aleatório determinístico (mulberry32). */
export function makeRng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    /** inteiro em [min, max] */
    int: (min: number, max: number) => Math.floor(next() * (max - min + 1)) + min,
    /** escolhe um item da lista */
    pick: <T,>(list: readonly T[]): T => list[Math.floor(next() * list.length)],
    /** sorteio com probabilidade p */
    chance: (p: number) => next() < p,
  };
}

const MS_DAY = 86400000;

export function parseISO(d: string): Date {
  const [y, m, day] = d.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, day));
}
export function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}
export function addDays(d: string, n: number): string {
  return toISO(new Date(parseISO(d).getTime() + n * MS_DAY));
}
export function diffDays(a: string, b: string): number {
  return Math.round((parseISO(b).getTime() - parseISO(a).getTime()) / MS_DAY);
}
/** 0 = domingo ... 6 = sábado */
export function weekday(d: string): number {
  return parseISO(d).getUTCDay();
}
export function monthKey(d: string): string {
  return d.slice(0, 7);
}
export function lastDayOfMonth(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return toISO(new Date(Date.UTC(y, m, 0)));
}
export function minISO(a: string, b: string) { return a < b ? a : b; }
export function maxISO(a: string, b: string) { return a > b ? a : b; }

/** dd/mm/aaaa */
export function brDate(d: string): string {
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
}

export const round2 = (n: number) => Math.round(n * 100) / 100;
export const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
export const smoothstep = (t: number) => {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
};

export const MESES_PT = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
export function mesAno(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return `${MESES_PT[m - 1]}/${y}`;
}

/** Real brasileiro (para textos). */
export function brl(n: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
}
