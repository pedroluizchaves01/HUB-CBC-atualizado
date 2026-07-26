// src/lib/formatDate.ts
//
// Formatação de datas à prova do bug de fuso horário.
//
// O problema: `new Date("2026-07-29")` é interpretado pelo JavaScript como
// meia-noite em UTC. Ao exibir no horário do Brasil (UTC-3), recua 3 horas e
// vira 28/07 às 21h — o dia "anda para trás". Por isso uma data lançada como
// 29/07 aparecia como 28/07.
//
// A correção: para datas puras (YYYY-MM-DD, sem hora), forçamos a interpretação
// como horário LOCAL acrescentando "T00:00:00". Assim o dia nunca recua.

/**
 * Formata uma data do banco (string YYYY-MM-DD ou ISO completa) em DD/MM/AAAA,
 * sem o deslocamento de fuso que faz o dia recuar.
 */
export function formatDateBR(value?: string | null): string {
  if (!value) return '—';
  // Datas puras (só YYYY-MM-DD) são tratadas como horário local.
  const iso = value.length <= 10 ? value + 'T00:00:00' : value;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString('pt-BR');
}

/**
 * Converte uma data para os milissegundos do início do dia em horário local,
 * útil para comparações/ordenção sem risco de fuso.
 */
export function dateToLocalTime(value?: string | null): number {
  if (!value) return -Infinity;
  const iso = value.length <= 10 ? value + 'T00:00:00' : value;
  const t = new Date(iso).getTime();
  return isNaN(t) ? -Infinity : t;
}
