import {
  addMonths,
  cash,
  type Entry,
  inPeriod,
  previousPeriod,
  today,
} from "../model";
export type PerformanceFilters = {
  from: string;
  to: string;
  sellerId?: string;
  serviceId?: string;
};
export type Payout = { sourceEntryId: string; payableEntryId: string };
export const classifications = {
  unclassified: "Não classificado",
  direct: "Custo direto",
  operating: "Despesa operacional",
  tax: "Impostos",
  financial: "Despesa financeira",
  commission: "Comissão manual",
} as const;
export function percentage(cents: number, bps: number) {
  const value = BigInt(cents) * BigInt(bps);
  return Number(
    value >= 0n ? (value + 5000n) / 10000n : -((-value + 5000n) / 10000n),
  );
}
export function earned(
  e: Pick<
    Entry,
    | "cancelledAt"
    | "direction"
    | "kind"
    | "sellerId"
    | "serviceId"
    | "commissionBasis"
    | "commissionRateBps"
    | "competenceDate"
    | "amountCents"
    | "settlements"
  >,
  through: string,
) {
  if (
    e.cancelledAt ||
    e.direction !== "receivable" ||
    e.kind !== "operating" ||
    !e.sellerId ||
    !e.serviceId
  )
    return 0;
  const base =
    e.commissionBasis === "billed"
      ? e.competenceDate <= through
        ? e.amountCents
        : 0
      : e.settlements
          .filter((s) => !s.reversedAt && s.date <= through)
          .reduce((sum, s) => sum + s.principalCents - s.discountCents, 0);
  return percentage(base, e.commissionRateBps ?? 0);
}
const before = (date: string) =>
  new Date(Date.parse(date) - 86400000).toISOString().slice(0, 10);
const dimensions = (e: Entry, f: PerformanceFilters) =>
  (!f.sellerId || e.sellerId === f.sellerId) &&
  (!f.serviceId || e.serviceId === f.serviceId);
export function performanceReport(
  entries: Entry[],
  payouts: Payout[],
  f: PerformanceFilters,
  presumptionBps: number | null,
) {
  const byId = new Map(entries.map((e) => [e.id, e]));
  const bySource = new Map<string, Entry[]>();
  const generated = new Set(payouts.map((p) => p.payableEntryId));
  for (const p of payouts) {
    const e = byId.get(p.payableEntryId);
    if (e && !e.cancelledAt) {
      const list = bySource.get(p.sourceEntryId) ?? [];
      list.push(e);
      bySource.set(p.sourceEntryId, list);
    }
  }
  const selected = entries.filter(
    (e) => dimensions(e, f) && e.kind === "operating",
  );
  const source = selected.filter((e) => e.direction === "receivable");
  const periodEarned = (e: Entry, range: PerformanceFilters) =>
    earned(e, range.to) - earned(e, before(range.from));
  const amountPaid = (e: Entry, range: PerformanceFilters) =>
    e.settlements
      .filter((s) => !s.reversedAt && inPeriod(s.date, range))
      .reduce((sum, s) => sum + cash(s), 0);
  const metrics = (range: PerformanceFilters) => {
    let revenueCents = 0;
    let directCents = 0;
    let expenseCents = 0;
    let taxCents = 0;
    let financialCents = 0;
    let manualCommissionCents = 0;
    let unclassifiedCents = 0;
    let unclassifiedCount = 0;
    let cashRevenueCents = 0;
    let cashExpenseCents = 0;
    let discountCents = 0;
    for (const e of selected) {
      if (e.cancelledAt) continue;
      if (e.direction === "receivable") {
        cashRevenueCents += amountPaid(e, range);
        discountCents += e.settlements
          .filter((s) => !s.reversedAt && inPeriod(s.date, range))
          .reduce(
            (sum, s) => sum + s.discountCents - s.interestCents - s.fineCents,
            0,
          );
        if (inPeriod(e.competenceDate, range)) revenueCents += e.amountCents;
      } else {
        cashExpenseCents += amountPaid(e, range);
        if (generated.has(e.id) || !inPeriod(e.competenceDate, range)) continue;
        const amount = e.amountCents;
        // Charges/discounts on vendor bills are reflected when settled.
        if (e.resultClass === "direct") directCents += amount;
        else if (e.resultClass === "operating") expenseCents += amount;
        else if (e.resultClass === "tax") taxCents += amount;
        else if (e.resultClass === "financial") financialCents += amount;
        else if (e.resultClass === "commission")
          manualCommissionCents += amount;
        else {
          unclassifiedCents += amount;
          unclassifiedCount++;
        }
      }
    }
    for (const e of selected.filter(
      (e) => !e.cancelledAt && e.direction === "payable",
    ))
      financialCents += e.settlements
        .filter((s) => !s.reversedAt && inPeriod(s.date, range))
        .reduce(
          (sum, s) => sum + s.interestCents + s.fineCents - s.discountCents,
          0,
        );
    const commissionCents = source.reduce(
      (sum, e) => sum + periodEarned(e, range),
      0,
    );
    const projectedCommissionCents = source
      .filter((e) => !e.cancelledAt && inPeriod(e.competenceDate, range))
      .reduce(
        (sum, e) => sum + percentage(e.amountCents, e.commissionRateBps ?? 0),
        0,
      );
    const grossProfitCents = revenueCents - directCents;
    const expenses =
      expenseCents +
      taxCents +
      financialCents +
      manualCommissionCents +
      unclassifiedCents +
      discountCents;
    return {
      revenueCents,
      directCents,
      expenseCents,
      taxCents,
      financialCents,
      manualCommissionCents,
      unclassifiedCents,
      unclassifiedCount,
      discountCents,
      commissionCents,
      grossProfitCents,
      netProfitCents: grossProfitCents - expenses - commissionCents,
      projectedProfitCents:
        grossProfitCents - expenses - projectedCommissionCents,
      presumedProfitCents:
        presumptionBps === null
          ? null
          : percentage(revenueCents, presumptionBps),
      cashRevenueCents,
      cashExpenseCents,
      cashBalanceCents: cashRevenueCents - cashExpenseCents,
    };
  };
  const rows = source
    .filter(
      (e) =>
        earned(e, f.to) !==
          (bySource.get(e.id) ?? [])
            .filter((p) => p.competenceDate <= f.to)
            .reduce((sum, p) => sum + p.amountCents, 0) ||
        inPeriod(e.competenceDate, f) ||
        e.settlements.some((s) => !s.reversedAt && inPeriod(s.date, f)) ||
        (bySource.get(e.id) ?? []).some(
          (p) =>
            inPeriod(p.competenceDate, f) ||
            p.settlements.some((s) => !s.reversedAt && inPeriod(s.date, f)),
        ),
    )
    .map((e) => {
      const payables = bySource.get(e.id) ?? [];
      const issuedCents = payables
        .filter((p) => p.competenceDate <= f.to)
        .reduce((sum, p) => sum + p.amountCents, 0);
      const earnedCents = earned(e, f.to);
      return {
        id: e.id,
        description: e.description,
        competenceDate: e.competenceDate,
        sellerId: e.sellerId,
        sellerName: e.sellerName,
        serviceId: e.serviceId,
        serviceName: e.serviceName,
        amountCents: e.amountCents,
        rateBps: e.commissionRateBps ?? 0,
        basis: e.commissionBasis ?? "received",
        ruleId: e.commissionRuleId ?? null,
        version: e.version,
        cancelled: Boolean(e.cancelledAt),
        earnedPeriodCents: periodEarned(e, f),
        earnedCents,
        issuedCents,
        availableCents: Math.max(0, earnedCents - issuedCents),
        availableTodayCents: Math.max(
          0,
          earned(e, today()) -
            payables.reduce((sum, p) => sum + p.amountCents, 0),
        ),
        overallocatedCents: Math.max(0, issuedCents - earnedCents),
        paidPeriodCents: payables.reduce((sum, p) => sum + amountPaid(p, f), 0),
        payables: payables.map((p) => ({
          id: p.id,
          amountCents: p.amountCents,
          dueDate: p.dueDate,
          paidCents: p.settlements
            .filter((s) => !s.reversedAt && s.date <= f.to)
            .reduce((sum, s) => sum + s.principalCents, 0),
        })),
      };
    });
  const months = [];
  for (let m = `${f.from.slice(0, 7)}-01`; m <= f.to; m = addMonths(m, 1)) {
    const last = before(addMonths(m, 1));
    const range = {
      ...f,
      from: m < f.from ? f.from : m,
      to: last > f.to ? f.to : last,
    };
    months.push({ month: m.slice(0, 7), ...metrics(range) });
  }
  const prior = previousPeriod(f.from, f.to);
  return {
    current: metrics(f),
    previous: metrics({ ...f, ...prior }),
    previousPeriod: prior,
    months,
    rows,
    totals: {
      availableCents: rows.reduce((sum, r) => sum + r.availableCents, 0),
      overallocatedCents: rows.reduce(
        (sum, r) => sum + r.overallocatedCents,
        0,
      ),
      paidPeriodCents: rows.reduce((sum, r) => sum + r.paidPeriodCents, 0),
    },
    expenses: selected
      .filter(
        (e) =>
          e.direction === "payable" &&
          !e.cancelledAt &&
          !generated.has(e.id) &&
          inPeriod(e.competenceDate, f),
      )
      .map((e) => ({
        id: e.id,
        description: e.description,
        amountCents: e.amountCents,
        resultClass: e.resultClass ?? "unclassified",
        version: e.version,
      })),
    presumptionBps,
    unassignedExpenseCount: entries.filter(
      (e) =>
        !e.cancelledAt &&
        e.kind === "operating" &&
        e.direction === "payable" &&
        inPeriod(e.competenceDate, f) &&
        !dimensions(e, f),
    ).length,
  };
}
