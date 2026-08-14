/**
 * Versionamento central do TOTALMAXX.
 * ----------------------------------
 * Altere APENAS esta constante ao publicar uma nova versão
 * (1.0 -> 1.1 -> 1.2 -> 2.0). Todo o sistema (sidebar, verificação
 * automática e endpoint /api/public/version) usa este valor.
 */
export const APP_VERSION = "1.1";

/** Rótulo amigável usado na interface. */
export const APP_VERSION_LABEL = `Versão ${APP_VERSION}`;

/**
 * Compara duas versões no formato "1.0", "1.10.2".
 * Retorna > 0 se `a` for maior, < 0 se menor, 0 se iguais.
 */
export function compareVersions(a: string, b: string): number {
  const pa = String(a).split(".").map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split(".").map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da !== db) return da - db;
  }
  return 0;
}
