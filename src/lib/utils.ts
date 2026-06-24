import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Arredonda uma medida para no máximo 2 casas decimais,
 * eliminando ruído de ponto flutuante (ex.: 51.599999999999994 → 51.6).
 * Mantém o valor como Number para cálculos posteriores.
 */
export function roundMeasure(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

/**
 * Formata uma medida em cm para exibição no padrão brasileiro,
 * com até 2 casas decimais e sem zeros desnecessários.
 * Ex.: 81.60000000000001 → "81,6"; 40 → "40"; 40.5 → "40,5".
 */
export function fmtMeasure(value: number): string {
  const rounded = roundMeasure(Number(value) || 0);
  return rounded.toLocaleString("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

/**
 * Formata um número como moeda BRL (R$ 1.234,56).
 * Aceita null/undefined/string e cai para 0 quando inválido.
 */
export function fmtMoney(value: number | string | null | undefined): string {
  const n = Number(value);
  return (Number.isFinite(n) ? n : 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

/**
 * Formata uma porcentagem no padrão BR (12,5%). Recebe o número já em %.
 */
export function fmtPct(value: number | string | null | undefined): string {
  const n = Number(value);
  return `${(Number.isFinite(n) ? n : 0).toLocaleString("pt-BR", {
    maximumFractionDigits: 2,
  })}%`;
}

/**
 * Formata uma data ISO timestamp (created_at, etc.) em dd/mm/aaaa.
 * Para strings vazias/nulas retorna "—".
 */
export function fmtDateTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR");
}

/**
 * Formata uma data tipo DATE (YYYY-MM-DD, sem hora) em dd/mm/aaaa
 * SEM aplicar fuso horário — evita o bug clássico de mostrar "23/06"
 * em vez de "24/06" porque new Date("2025-06-24") é interpretado em UTC.
 * Se vier um ISO completo com hora, delega para fmtDateTime.
 */
export function fmtDateBR(value: string | null | undefined): string {
  if (!value) return "—";
  // YYYY-MM-DD puro
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (m) {
    const [, y, mo, d] = m;
    return `${d}/${mo}/${y}`;
  }
  return fmtDateTime(value);
}

