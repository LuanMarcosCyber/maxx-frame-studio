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
