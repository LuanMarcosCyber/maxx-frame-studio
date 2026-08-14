/**
 * Consumo de perfil (moldura) em metros lineares.
 *
 * Regra correta:
 *   metros = ( perímetro_cm + 8 × largura_perfil_cm ) / 100
 *
 * Cada lado da moldura tem cortes em 45° nas duas pontas, adicionando
 * 2 × largura por lado (4 lados = 8 × largura).
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
  const extraCm = 8 * fw;
  return (perimetroCm + extraCm) / 100;
}

