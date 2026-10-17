/**
 * Total de uma linha de negócio, em centavos.
 *
 * Fica num lugar só porque é somado em todo relatório de receita: se a regra
 * de arredondamento morasse em cada controller que grava item, dois deles
 * discordariam por um centavo e ninguém saberia qual está certo.
 */
export function computeLineTotalCents({
  quantity,
  unitPriceCents,
  discountPercent,
}: {
  quantity: number;
  unitPriceCents: number;
  discountPercent: number;
}) {
  const gross = quantity * unitPriceCents;
  // Arredonda no centavo mais próximo: 3 × R$ 33,33 com 10% de desconto dá
  // R$ 89,99, não R$ 89,991 truncado para baixo em cada linha.
  return Math.round((gross * (100 - discountPercent)) / 100);
}

/** Soma que vira o valor do negócio quando ele não está travado à mão. */
export function sumLineTotals(lines: ReadonlyArray<{ totalCents: number }>) {
  return lines.reduce((total, line) => total + line.totalCents, 0);
}
