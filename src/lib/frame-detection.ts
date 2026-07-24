// Shared detection: is a budget item's "quadro" essentially empty?
// Used to skip empty-frame rendering when a budget contains only Produtos Diversos.

export type FrameData = Record<string, unknown>;

const num = (d: FrameData, k: string) => {
  const v = d[k];
  return typeof v === "number" ? v : Number(v) || 0;
};
const str = (d: FrameData, k: string) => {
  const v = d[k];
  return typeof v === "string" ? v.trim() : "";
};

export function isEmptyFrame(d: FrameData | null | undefined): boolean {
  if (!d) return true;

  const hasSize =
    num(d, "larguraFinal") > 0 ||
    num(d, "alturaFinal") > 0 ||
    num(d, "larguraOriginal") > 0 ||
    num(d, "alturaOriginal") > 0;

  const hasPerfil = !!(str(d, "perfilCode") || str(d, "perfilDescription") || str(d, "perfilId"));
  const hasPerfilAd = !!(
    str(d, "perfilAdicionalCode") || str(d, "perfilAdicionalDescription")
  );
  const hasPaspatur = str(d, "paspaturAtivo") === "sim";
  const hasVidro =
    str(d, "vidroTipo") === "sim" || !!(str(d, "vidroCode") || str(d, "vidroDescription"));
  const hasFoam = !!(str(d, "foamCode") || str(d, "foamDescription"));
  const hasColagem = str(d, "colagemAtivo") === "sim";
  const hasImpressao = str(d, "impressaoAtivo") === "sim";

  return !(
    hasSize ||
    hasPerfil ||
    hasPerfilAd ||
    hasPaspatur ||
    hasVidro ||
    hasFoam ||
    hasColagem ||
    hasImpressao
  );
}

export function hasDiversos(d: FrameData | null | undefined): boolean {
  if (!d) return false;
  const raw = (d as { produtosDiversos?: unknown }).produtosDiversos;
  return Array.isArray(raw) && raw.length > 0;
}

/** True when every frame item is empty AND at least one has produtos diversos. */
export function isDiversosOnly(items: Array<{ data: FrameData }>): boolean {
  if (!items.length) return false;
  const allEmpty = items.every((it) => isEmptyFrame(it.data));
  const anyDiv = items.some((it) => hasDiversos(it.data));
  return allEmpty && anyDiv;
}
