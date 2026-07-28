/**
 * Consumo de perfil (moldura) em metros lineares.
 *
 * Regra correta:
 *   metros = ( perímetro_cm + 4 × largura_perfil_cm ) / 100
 *
 * Os 4 × largura correspondem à sobra dos cortes em 45° em cada canto
 * (2 sobras por corte, 4 cantos), somada ao perímetro externo do quadro.
 *
 * Aceita valores inválidos retornando 0.
 */
export function perfilLinearMeters(
  alturaCm: number,
  larguraCm: number,
  frameWidthCm: number | null | undefined,
): number {
  const a = Number(alturaCm) || 0;
  const l = Number(larguraCm) || 0;
  const fw = Number(frameWidthCm) || 0;
  if (a <= 0 || l <= 0) return 0;
  const perimetroCm = 2 * (a + l);
  const extraCm = 4 * fw;
  return (perimetroCm + extraCm) / 100;
}
