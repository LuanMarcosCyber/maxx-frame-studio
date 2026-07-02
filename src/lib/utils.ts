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

/** Remove todos os caracteres não numéricos. */
export function onlyDigits(s: string | null | undefined): string {
  return (s ?? "").replace(/\D+/g, "");
}

/** Formata CPF (000.000.000-00). Se não tiver 11 dígitos, retorna original. */
export function fmtCPF(value: string | null | undefined): string {
  const d = onlyDigits(value);
  if (d.length !== 11) return value ?? "";
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

/** Formata CNPJ (00.000.000/0000-00). Se não tiver 14 dígitos, retorna original. */
export function fmtCNPJ(value: string | null | undefined): string {
  const d = onlyDigits(value);
  if (d.length !== 14) return value ?? "";
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

/**
 * Formata CPF/CNPJ automaticamente pelo tamanho, ou pelo tipo informado.
 * type "cpf"/"cnpj"/"pessoa_fisica"/"pessoa_juridica" força o formato.
 */
export function fmtDocument(
  value: string | null | undefined,
  type?: string | null,
): string {
  const d = onlyDigits(value);
  if (!d) return value ?? "";
  const t = (type ?? "").toLowerCase();
  if (t === "cpf" || t === "pessoa_fisica") return fmtCPF(d);
  if (t === "cnpj" || t === "pessoa_juridica") return fmtCNPJ(d);
  if (d.length === 11) return fmtCPF(d);
  if (d.length === 14) return fmtCNPJ(d);
  return value ?? "";
}

/** Formata CEP (00000-000). */
export function fmtCEP(value: string | null | undefined): string {
  const d = onlyDigits(value);
  if (d.length !== 8) return value ?? "";
  return `${d.slice(0, 5)}-${d.slice(5)}`;
}


