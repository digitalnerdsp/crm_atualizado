import {
  addMonths,
  cash,
  type Entry,
  inPeriod,
  previousPeriod,
} from "../model";
import { percentage } from "../performance/model";
export type TaxItem = {
  name: string;
  kind: "tax" | "fee";
  rateBps: number;
  fixedCents: number;
};
export type SaleInput = {
  mode: "gross" | "net";
  amountCents: number;
  costCents: number;
  commissionRateBps: number;
};
export const MAX_PRICE = 1_000_000_000_000;
export function calculateSale(items: TaxItem[], input: SaleInput) {
  const rates =
    items.reduce((sum, i) => sum + i.rateBps, 0) + input.commissionRateBps;
  if (rates >= 10000)
    throw new RangeError(
      "A soma dos percentuais, incluindo a comissão, deve ser menor que 100%.",
    );
  const fixed =
    items.reduce((sum, i) => sum + i.fixedCents, 0) + input.costCents;
  const evaluate = (grossCents: number) => {
    const breakdown = items.map((i) => ({
      ...i,
      amountCents: percentage(grossCents, i.rateBps) + i.fixedCents,
    }));
    const taxCents = breakdown
      .filter((i) => i.kind === "tax")
      .reduce((sum, i) => sum + i.amountCents, 0);
    const feeCents = breakdown
      .filter((i) => i.kind === "fee")
      .reduce((sum, i) => sum + i.amountCents, 0);
    const commissionCents = percentage(grossCents, input.commissionRateBps);
    return {
      grossCents,
      taxCents,
      feeCents,
      commissionCents,
      costCents: input.costCents,
      netCents:
        grossCents - taxCents - feeCents - commissionCents - input.costCents,
      breakdown,
      totalRateBps: rates,
    };
  };
  if (input.mode === "gross")
    return {
      ...evaluate(input.amountCents),
      targetNetCents: null,
      roundingSurplusCents: 0,
    };
  // Each rounded percentage differs from its exact value by at most half a cent.
  // Start below every feasible price, then jump only by the missing net amount.
  // Fees never decrease as price rises, so such jumps cannot skip a solution.
  // Binary search is deliberately avoided: independent rounding makes net locally non-monotone.
  const parts =
    items.filter((i) => i.rateBps > 0).length +
    (input.commissionRateBps > 0 ? 1 : 0);
  const numerator =
    BigInt(input.amountCents + fixed) * 10000n - BigInt(parts) * 5000n;
  const retained = BigInt(10000 - rates);
  let price = Number(
    numerator > 0n ? (numerator + retained - 1n) / retained : 1n,
  );
  price = Math.max(1, price);
  while (price <= MAX_PRICE) {
    const result = evaluate(price);
    if (result.netCents >= input.amountCents)
      return {
        ...result,
        targetNetCents: input.amountCents,
        roundingSurplusCents: result.netCents - input.amountCents,
      };
    price += Math.max(1, input.amountCents - result.netCents);
  }
  throw new RangeError(
    "O preço necessário excede o limite de R$ 10 bilhões por venda. Revise os valores e percentuais.",
  );
}
export type SaleResult = ReturnType<typeof calculateSale>;
export type TaxFilters = {
  from: string;
  to: string;
  profileId?: string;
  serviceId?: string;
  sellerId?: string;
};
export type Simulation = {
  notes: string;
  id: string;
  title: string;
  date: string;
  profileId: string;
  profileName: string;
  profileVersion: number;
  serviceId: string | null;
  serviceName: string | null;
  sellerId: string | null;
  sellerName: string | null;
  input: SaleInput;
  result: SaleResult;
  commissionSource: string;
  createdAt: Date | string;
};
export function taxReport(
  entries: Entry[],
  simulations: Simulation[],
  f: TaxFilters,
) {
  const matches = (s: Simulation) =>
    (!f.profileId || s.profileId === f.profileId) &&
    (!f.serviceId || s.serviceId === f.serviceId) &&
    (!f.sellerId || s.sellerId === f.sellerId);
  const ledger = entries.filter(
    (e) =>
      !e.cancelledAt &&
      e.direction === "payable" &&
      e.kind === "operating" &&
      (e.resultClass === "tax" || e.resultClass === "financial") &&
      (!f.serviceId || e.serviceId === f.serviceId) &&
      (!f.sellerId || e.sellerId === f.sellerId),
  );
  const metrics = (range: TaxFilters) => {
    const rows = simulations.filter(
      (s) => matches(s) && inPeriod(s.date, range),
    );
    const sum = (
      key: keyof Pick<
        SaleResult,
        "grossCents" | "netCents" | "taxCents" | "feeCents" | "commissionCents"
      >,
    ) => rows.reduce((sum, s) => sum + s.result[key], 0);
    const accrued = (classification: string) =>
      ledger
        .filter(
          (e) =>
            e.resultClass === classification &&
            inPeriod(e.competenceDate, range),
        )
        .reduce((sum, e) => sum + e.amountCents, 0);
    const paid = (classification: string) =>
      ledger
        .filter((e) => e.resultClass === classification)
        .reduce(
          (sum, e) =>
            sum +
            e.settlements
              .filter((s) => !s.reversedAt && inPeriod(s.date, range))
              .reduce((sum, s) => sum + cash(s), 0),
          0,
        );
    return {
      simulationCount: rows.length,
      simulatedGrossCents: sum("grossCents"),
      simulatedNetCents: sum("netCents"),
      simulatedTaxCents: sum("taxCents"),
      simulatedFeeCents: sum("feeCents"),
      simulatedCommissionCents: sum("commissionCents"),
      taxAccruedCents: accrued("tax"),
      financialAccruedCents: accrued("financial"),
      taxPaidCents: paid("tax"),
      financialPaidCents: paid("financial"),
    };
  };
  const prior = previousPeriod(f.from, f.to);
  const months = [];
  for (
    let date = `${f.from.slice(0, 7)}-01`;
    date <= f.to;
    date = addMonths(date, 1)
  ) {
    const last = new Date(Date.parse(addMonths(date, 1)) - 86400000)
      .toISOString()
      .slice(0, 10);
    months.push({
      month: date.slice(0, 7),
      ...metrics({
        ...f,
        from: date < f.from ? f.from : date,
        to: last > f.to ? f.to : last,
      }),
    });
  }
  const rows = simulations.filter((s) => matches(s) && inPeriod(s.date, f));
  return {
    current: metrics(f),
    previous: metrics({ ...f, ...prior }),
    previousPeriod: prior,
    months,
    rows,
    total: rows.length,
    ledger: ledger
      .filter((e) => inPeriod(e.competenceDate, f))
      .map((e) => ({
        id: e.id,
        description: e.description,
        classification: e.resultClass,
        competenceDate: e.competenceDate,
        amountCents: e.amountCents,
      })),
    ledgerNote:
      "Impostos e despesas financeiras são lançamentos reais classificados no financeiro. Perfis afetam somente as simulações; o filtro de perfil não restringe os lançamentos reais. Simulações não são vendas nem geram títulos automaticamente.",
  };
}
