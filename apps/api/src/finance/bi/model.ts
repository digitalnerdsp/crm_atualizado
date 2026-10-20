import {
  addMonths,
  cash,
  DAY,
  type Entry,
  inPeriod,
  matchesDimensions,
  previousPeriod,
  remaining,
  today,
} from "../model";
import {
  classifications,
  earned,
  type Payout,
  performanceReport,
} from "../performance/model";
import { recurrenceReport } from "../recurrence/model";
import type { PortfolioContract } from "../recurrence/report";
import { planCycles, plusDays } from "../recurrence/schedule";
import { type Simulation, taxReport } from "../taxes/model";
import type { BiFilters, metrics } from "./validation";
export type Metric = (typeof metrics)[number];
export type DetailRow = {
  id: string;
  kind: "entry" | "contract" | "simulation";
  label: string;
  date: string;
  value: number;
  note: string;
};
export type BiData = {
  entries: Entry[];
  payouts: Payout[];
  portfolio: PortfolioContract[];
  simulations: Simulation[];
  presumptionBps: number | null;
};
export const labels: Record<Metric, string> = {
  revenue: "Receita faturada",
  expenses: "Despesas por competência",
  received: "Recebido operacional",
  paid: "Pago operacional",
  movement: "Movimento líquido operacional",
  gross: "Lucro bruto",
  net: "Lucro líquido gerencial",
  grossMargin: "Margem bruta",
  netMargin: "Margem líquida",
  presumed: "Lucro presumido estimado",
  receivable: "Saldo a receber",
  payable: "Saldo a pagar",
  overdueReceivable: "Recebíveis vencidos",
  overduePayable: "Pagamentos vencidos",
  commission: "Comissões apuradas",
  availableCommission: "Comissões disponíveis para emissão",
  commissionOpen: "Títulos de comissão em aberto",
  commissionPaid: "Comissões pagas",
  commissionExcess: "Comissões emitidas a maior",
  tax: "Impostos lançados",
  fee: "Despesas financeiras lançadas",
  taxPaid: "Impostos pagos",
  feePaid: "Despesas financeiras pagas",
  taxOpen: "Impostos em aberto",
  feeOpen: "Despesas financeiras em aberto",
  unclassified: "Despesas não classificadas",
  expenseSlice: "Despesas do recorte específico",
  mrr: "MRR",
  contracts: "Contratos ativos",
  expiry: "Contratos terminando em até 90 dias",
  disabledBilling: "Contratos ativos sem geração financeira",
  simulation: "Cenários salvos (simulações)",
  projection: "Movimento líquido projetado em 90 dias",
};
const before = (d: string) => plusDays(d, -1);
function yearBefore(d: string) {
  const year = Number(d.slice(0, 4)) - 1;
  const m = Number(d.slice(5, 7));
  const last = new Date(Date.UTC(year, m, 0)).getUTCDate();
  return `${year}-${d.slice(5, 7)}-${String(Math.min(Number(d.slice(8)), last)).padStart(2, "0")}`;
}
export function comparisonPeriod(f: BiFilters) {
  return f.comparison === "year"
    ? { from: yearBefore(f.from), to: yearBefore(f.to) }
    : previousPeriod(f.from, f.to);
}
const baseMatch = (e: Entry, f: BiFilters) =>
  matchesDimensions(e, {
    companyId: f.companyId,
    sellerId: f.sellerId,
    serviceId: f.serviceId,
  });
const scopedExpense = (e: Entry, f: BiFilters) =>
  matchesDimensions(e, {
    categoryId: f.categoryId,
    subcategoryId: f.subcategoryId,
    partyId: f.partyId,
    laborType: f.laborType,
  }) &&
  (!f.resultClass || (e.resultClass ?? "unclassified") === f.resultClass);
const detailEntry = (
  e: Entry,
  value: number,
  date = e.competenceDate,
  note = "",
): DetailRow => ({
  id: e.id,
  kind: "entry",
  label: e.description,
  date,
  value,
  note,
});
export function buildBi(data: BiData, f: BiFilters) {
  const reference = f.to < today() ? f.to : today();
  const scopedEntries = data.entries.filter(
    (e) => e.kind === "operating" && baseMatch(e, f),
  );
  const entries = scopedEntries.filter((e) => !e.cancelledAt);
  const entryById = new Map(scopedEntries.map((e) => [e.id, e]));
  const generated = new Set(data.payouts.map((p) => p.payableEntryId));
  const prior = comparisonPeriod(f);
  const pct = (n: number, d: number) => (d > 0 ? (n / d) * 100 : null);
  function compute(range: { from: string; to: string }) {
    const ref = range.to < today() ? range.to : today();
    const perf = performanceReport(
      scopedEntries,
      data.payouts,
      range,
      data.presumptionBps,
    );
    const p = perf.current;
    const details = Object.fromEntries(
      Object.keys(labels).map((k) => [k, [] as DetailRow[]]),
    ) as Record<Metric, DetailRow[]>;
    for (const e of entries) {
      const rev = e.direction === "receivable";
      if (inPeriod(e.competenceDate, range)) {
        details[rev ? "revenue" : "expenses"].push(
          detailEntry(e, e.amountCents),
        );
        if (rev) {
          details.gross.push(detailEntry(e, e.amountCents));
          details.net.push(detailEntry(e, e.amountCents));
          if (data.presumptionBps !== null)
            details.presumed.push(
              detailEntry(
                e,
                e.amountCents,
                e.competenceDate,
                "Base de receita para o percentual de presunção",
              ),
            );
        } else {
          if (!generated.has(e.id)) {
            if (e.resultClass === "direct")
              details.gross.push(detailEntry(e, -e.amountCents));
            details.net.push(detailEntry(e, -e.amountCents));
          }
          if (scopedExpense(e, f))
            details.expenseSlice.push(detailEntry(e, e.amountCents));
          if (!e.resultClass || e.resultClass === "unclassified") {
            if (!generated.has(e.id))
              details.unclassified.push(detailEntry(e, e.amountCents));
          }
          if (e.resultClass === "tax")
            details.tax.push(detailEntry(e, e.amountCents));
          if (e.resultClass === "financial")
            details.fee.push(detailEntry(e, e.amountCents));
        }
      }
      for (const s of e.settlements.filter(
        (s) => !s.reversedAt && inPeriod(s.date, range),
      )) {
        const amount = cash(s);
        details[rev ? "received" : "paid"].push(
          detailEntry(e, amount, s.date, `Baixa ${s.id}`),
        );
        details.movement.push(
          detailEntry(e, rev ? amount : -amount, s.date, `Baixa ${s.id}`),
        );
        if (!rev && generated.has(e.id))
          details.commissionPaid.push(detailEntry(e, amount, s.date));
        if (!rev && e.resultClass === "tax")
          details.taxPaid.push(detailEntry(e, amount, s.date));
        if (!rev && e.resultClass === "financial")
          details.feePaid.push(detailEntry(e, amount, s.date));
        const adjustment = rev
          ? s.interestCents + s.fineCents - s.discountCents
          : s.discountCents - s.interestCents - s.fineCents;
        if (adjustment)
          details.net.push(
            detailEntry(e, adjustment, s.date, "Ajuste da baixa"),
          );
      }
      const left = Math.max(0, remaining(e, ref));
      if (left > 0 && e.dueDate <= range.to) {
        details[rev ? "receivable" : "payable"].push(
          detailEntry(e, left, e.dueDate, "Saldo principal na referência"),
        );
        if (e.dueDate < ref)
          details[rev ? "overdueReceivable" : "overduePayable"].push(
            detailEntry(e, left, e.dueDate),
          );
        if (!rev && generated.has(e.id))
          details.commissionOpen.push(detailEntry(e, left, e.dueDate));
        if (!rev && e.resultClass === "tax")
          details.taxOpen.push(detailEntry(e, left, e.dueDate));
        if (!rev && e.resultClass === "financial")
          details.feeOpen.push(detailEntry(e, left, e.dueDate));
      }
      if (rev) {
        const c = earned(e, range.to) - earned(e, before(range.from));
        if (c) {
          details.commission.push(detailEntry(e, c));
          details.net.push(
            detailEntry(
              e,
              -c,
              e.competenceDate,
              "Comissão apurada; títulos gerados não são deduzidos novamente",
            ),
          );
        }
      }
    }
    for (const row of perf.rows) {
      const e = entryById.get(row.id);
      if (!e) continue;
      const available =
        ref === today() ? row.availableTodayCents : row.availableCents;
      if (available)
        details.availableCommission.push(detailEntry(e, available, ref));
      if (row.overallocatedCents)
        details.commissionExcess.push(
          detailEntry(e, row.overallocatedCents, range.to),
        );
    }
    details.grossMargin = details.gross;
    details.netMargin = details.net;
    const values = Object.fromEntries(
      Object.entries(details).map(([k, rows]) => [
        k,
        rows.reduce((s, r) => s + r.value, 0),
      ]),
    ) as Record<Metric, number | null>;
    values.gross = p.grossProfitCents;
    values.net = p.netProfitCents;
    values.grossMargin = pct(p.grossProfitCents, p.revenueCents);
    values.netMargin = pct(p.netProfitCents, p.revenueCents);
    values.presumed = p.presumedProfitCents;
    return { values, details, performance: p };
  }
  const current = compute(f);
  const previous = compute(prior);
  const recurFilters = {
    from: f.from,
    to: f.to,
    companyId: f.companyId,
    sellerId: f.sellerId,
    serviceId: f.serviceId,
    contractId: f.contractId,
    status: f.contractStatus,
  };
  const recurrence = recurrenceReport(data.portfolio, recurFilters);
  const previousRecurrence = recurrenceReport(data.portfolio, {
    ...recurFilters,
    ...prior,
  });

  function fillContracts(
    target: ReturnType<typeof compute>,
    range: { from: string; to: string },
    rows: typeof recurrence.rows,
  ) {
    const ref = range.to < today() ? range.to : today();
    for (const row of rows) {
      const d: DetailRow = {
        id: row.id,
        kind: "contract",
        label: `${row.number} · ${row.title}`,
        date: row.endsOn ?? ref,
        value: row.monthlyValueCents,
        note: row.companyName,
      };
      if (row.status === "active") {
        target.details.mrr.push(d);
        target.details.contracts.push({ ...d, value: 1 });
        if (row.endsOn && row.endsOn >= ref && row.endsOn <= plusDays(ref, 90))
          target.details.expiry.push({ ...d, value: 1 });
        if (!row.billingEnabled)
          target.details.disabledBilling.push({ ...d, value: 1 });
      }
    }
    for (const k of ["mrr", "contracts", "expiry", "disabledBilling"] as const)
      target.values[k] = target.details[k].reduce((s, r) => s + r.value, 0);
  }
  fillContracts(current, f, recurrence.rows);
  fillContracts(previous, prior, previousRecurrence.rows);
  if (recurrence.current.historyUnavailable) current.values.mrr = null;
  if (previousRecurrence.current.historyUnavailable) previous.values.mrr = null;
  const matchingSim = data.simulations.filter(
    (s) =>
      (!f.serviceId || s.serviceId === f.serviceId) &&
      (!f.sellerId || s.sellerId === f.sellerId),
  );
  for (const [target, range] of [
    [current, f],
    [previous, prior],
  ] as const) {
    target.details.simulation = matchingSim
      .filter((s) => inPeriod(s.date, range))
      .map((s) => ({
        id: s.id,
        kind: "simulation",
        label: s.title,
        date: s.date,
        value: 1,
        note: `${s.profileName}; bruto ${(s.result.grossCents / 100).toFixed(2)}`,
      }));
    target.values.simulation = target.details.simulation.length;
  }
  const tax = taxReport(entries, matchingSim, f);
  // Project open principal and only genuinely unissued contract cycles. No database writes.
  const projectionRows: DetailRow[] = [];
  const end = plusDays(reference, 90);
  for (const e of entries)
    if (e.dueDate >= reference && e.dueDate <= end) {
      const left = Math.max(0, remaining(e, reference));
      if (left)
        projectionRows.push(
          detailEntry(
            e,
            e.direction === "receivable" ? left : -left,
            e.dueDate,
            "Título em aberto",
          ),
        );
    }
  const emittedCycles = new Map(
    data.portfolio.map((c) => [
      c.id,
      new Set(c.entries.map((e) => `${e.contractLineKey}:${e.cycleStart}`)),
    ]),
  );
  const candidateIds = new Set(recurrence.rows.map((c) => c.id));
  for (const c of data.portfolio) {
    if (!candidateIds.has(c.id) || !c.config?.enabled || c.currency !== "BRL")
      continue;
    for (const cycle of planCycles(c.revisions, end, c.config.prorateFinal)) {
      if (
        cycle.dueDate < reference ||
        cycle.dueDate > end ||
        (f.serviceId && cycle.item.serviceId !== f.serviceId) ||
        (f.sellerId && cycle.revision.sellerId !== f.sellerId)
      )
        continue;
      // Cancelled cycles are not automatically resurrected. A billed cycle is already represented by its title.
      if (emittedCycles.get(c.id)?.has(`${cycle.key}:${cycle.start}`)) continue;
      projectionRows.push({
        id: c.id,
        kind: "contract",
        label: `${c.number} · ${cycle.item.name}`,
        date: cycle.dueDate,
        value: cycle.amountCents,
        note: `Ciclo não emitido: ${cycle.start}; previsão contratual`,
      });
    }
  }
  const projection = [30, 60, 90].map((days) => {
    const rows = projectionRows.filter(
      (r) => r.date <= plusDays(reference, days),
    );
    return {
      days,
      from: reference,
      to: plusDays(reference, days),
      income: rows.filter((r) => r.value > 0).reduce((s, r) => s + r.value, 0),
      expense: -rows
        .filter((r) => r.value < 0)
        .reduce((s, r) => s + r.value, 0),
      net: rows.reduce((s, r) => s + r.value, 0),
    };
  });
  current.details.projection = projectionRows;
  current.values.projection = projection[2]?.net ?? 0;
  previous.values.projection = null;
  const buckets = [
    { label: "A vencer", min: Number.NEGATIVE_INFINITY, max: 0 },
    { label: "1–30 dias", min: 1, max: 30 },
    { label: "31–60 dias", min: 31, max: 60 },
    { label: "61–90 dias", min: 61, max: 90 },
    { label: "Acima de 90 dias", min: 91, max: Number.POSITIVE_INFINITY },
  ].map((b) => {
    const es = entries.filter(
      (e) =>
        e.direction === "receivable" &&
        e.dueDate <= f.to &&
        remaining(e, reference) > 0 &&
        (Date.parse(reference) - Date.parse(e.dueDate)) / DAY >= b.min &&
        (Date.parse(reference) - Date.parse(e.dueDate)) / DAY <= b.max,
    );
    return {
      label: b.label,
      value: es.reduce((s, e) => s + remaining(e, reference), 0),
      count: es.length,
      ids: es.map((e) => e.id),
    };
  });
  function ranking(dimension: "service" | "company" | "seller") {
    const idKey = `${dimension}Id` as "serviceId" | "companyId" | "sellerId";
    const nameKey = `${dimension}Name` as
      | "serviceName"
      | "companyName"
      | "sellerName";
    const groups = new Map<string, Entry[]>();
    for (const e of entries) {
      const key = e[idKey] ?? "";
      const g = groups.get(key) ?? [];
      g.push(e);
      groups.set(key, g);
    }
    const payoutByEntry = new Map<string, Payout[]>();
    for (const payout of data.payouts) {
      for (const id of [payout.sourceEntryId, payout.payableEntryId]) {
        const list = payoutByEntry.get(id) ?? [];
        list.push(payout);
        payoutByEntry.set(id, list);
      }
    }
    return [...groups]
      .map(([id, rows]) => {
        const payouts = [
          ...new Set(rows.flatMap((row) => payoutByEntry.get(row.id) ?? [])),
        ];
        const p = performanceReport(rows, payouts, f, null).current;
        return {
          id,
          name: rows[0]?.[nameKey] ?? "Sem vínculo",
          revenue: p.revenueCents,
          result: p.netProfitCents,
          commission: p.commissionCents,
          overdue: rows
            .filter(
              (e) =>
                e.direction === "receivable" &&
                e.dueDate < reference &&
                e.dueDate <= f.to,
            )
            .reduce((s, e) => s + Math.max(0, remaining(e, reference)), 0),
        };
      })
      .sort(
        (a, b) =>
          b[f.ranking ?? "revenue"] - a[f.ranking ?? "revenue"] ||
          a.name.localeCompare(b.name),
      );
  }
  const scopedExpenses = entries.filter(
    (e) =>
      e.direction === "payable" &&
      inPeriod(e.competenceDate, f) &&
      scopedExpense(e, f),
  );
  function expenseGroups(key: (e: Entry) => string) {
    const groups = new Map<string, number>();
    for (const e of scopedExpenses) {
      const k = key(e);
      groups.set(k, (groups.get(k) ?? 0) + e.amountCents);
    }
    return [...groups]
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value);
  }
  const categories = new Map<
    string,
    { id: string; label: string; value: number }
  >();
  for (const e of scopedExpenses) {
    const id = e.categoryId ?? "";
    const group = categories.get(id) ?? {
      id,
      label: e.categoryName ?? "Sem categoria",
      value: 0,
    };
    group.value += e.amountCents;
    categories.set(id, group);
  }
  const composition: { label: string; value: number }[] = Object.entries(
    classifications,
  ).map(([key, label]) => ({
    label,
    value:
      current.performance[
        (
          {
            direct: "directCents",
            operating: "expenseCents",
            tax: "taxCents",
            financial: "financialCents",
            commission: "manualCommissionCents",
            unclassified: "unclassifiedCents",
          } as const
        )[key as keyof typeof classifications]
      ],
  }));
  composition.push({
    label: "Comissões apuradas",
    value: current.performance.commissionCents,
  });
  composition.push({
    label: "Ajustes de recebimentos",
    value: current.performance.discountCents,
  });
  const waterfall = [
    { label: "Receita", value: current.performance.revenueCents },
    { label: "Custos diretos", value: -current.performance.directCents },
    ...composition
      .filter((c) => c.label !== classifications.direct)
      .map((c) => ({ label: c.label, value: -c.value })),
    { label: "Lucro líquido", value: current.performance.netProfitCents },
  ];
  const months = [];
  for (
    let start = f.grouping === "day" ? f.from : `${f.from.slice(0, 7)}-01`;
    start <= f.to;
    start = f.grouping === "day" ? plusDays(start, 1) : addMonths(start, 1)
  ) {
    const from = start < f.from ? f.from : start;
    const last = f.grouping === "day" ? start : before(addMonths(start, 1));
    const to = last > f.to ? f.to : last;
    const m = compute({ from, to }).values;
    const rec = recurrenceReport(
      data.portfolio,
      { ...recurFilters, from, to },
      false,
    );
    const expected = (direction: "receivable" | "payable") =>
      entries
        .filter(
          (e) => e.direction === direction && inPeriod(e.dueDate, { from, to }),
        )
        .reduce((s, e) => s + e.amountCents, 0);
    months.push({
      key: start,
      label: f.grouping === "day" ? start : start.slice(0, 7),
      revenue: m.revenue ?? 0,
      expenses: m.expenses ?? 0,
      net: m.net ?? 0,
      received: m.received ?? 0,
      paid: m.paid ?? 0,
      expectedIncome: expected("receivable"),
      expectedExpense: expected("payable"),
      mrr: from <= today() ? rec.current.mrrCents : null,
    });
  }
  const alerts: {
    metric: Metric;
    label: string;
    value: number;
    count: number;
  }[] = [];
  for (const k of [
    "overdueReceivable",
    "overduePayable",
    "expiry",
    "disabledBilling",
    "availableCommission",
    "commissionExcess",
    "unclassified",
  ] as const)
    if (current.details[k].length)
      alerts.push({
        metric: k,
        label: labels[k],
        value: current.values[k] ?? 0,
        count: current.details[k].length,
      });
  if ((current.values.net ?? 0) < 0)
    alerts.push({
      metric: "net",
      label: "Resultado gerencial negativo",
      value: current.values.net ?? 0,
      count: current.details.net.length,
    });
  if ((projection[2]?.net ?? 0) < 0)
    alerts.push({
      metric: "projection",
      label: "Saídas previstas superiores às entradas em 90 dias",
      value: projection[2]?.net ?? 0,
      count: projectionRows.length,
    });
  const warnings = [
    "BRL. Caixa por baixa; resultado por competência; saldos até o fim do período, com baixas até a referência. Estornos reapresentam o histórico.",
    "Categoria, subcategoria, colaborador, vínculo e classificação afetam somente o recorte de despesas. Contrato e situação afetam somente recorrência e ciclos contratuais projetados.",
    "Simulações não representam vendas. O filtro cliente não se aplica às simulações, que não possuem esse vínculo.",
    "Projeção em principal, sem juros futuros: títulos em aberto e ciclos habilitados não emitidos com vencimento na referência ou depois. Não representa saldo bancário.",
    "Rentabilidade por vínculo não rateia despesas gerais. Sem vínculo aparece separadamente. Despesas por competência incluem títulos de comissão; o lucro usa comissões apuradas sem duplicação.",
  ];
  if (
    recurrence.current.historyUnavailable ||
    previousRecurrence.current.historyUnavailable
  )
    warnings.push(
      "Histórico de recorrência por serviço insuficiente em parte dos contratos.",
    );
  if (recurrence.excludedCurrencies)
    warnings.push(
      `${recurrence.excludedCurrencies} contratos em outras moedas excluídos.`,
    );
  if (f.from > today())
    warnings.push(
      "Período futuro: valores faturados representam títulos lançados; baixas futuras não são presumidas. A referência de saldos permanece hoje.",
    );
  return {
    generatedAt: new Date().toISOString(),
    presumptionBps: data.presumptionBps,
    referenceDate: reference,
    filters: f,
    previousPeriod: prior,
    current: current.values,
    previous: previous.values,
    months,
    composition,
    waterfall,
    aging: buckets,
    rankings: {
      services: ranking("service"),
      companies: ranking("company"),
      sellers: ranking("seller"),
    },
    expenseCategories: [...categories.values()].sort(
      (a, b) => b.value - a.value,
    ),
    labor: expenseGroups(
      (e) => e.laborType?.toUpperCase() ?? "Sem vínculo trabalhista",
    ),
    projection,
    alerts,
    warnings,
    expiryCounts: Object.fromEntries(
      [30, 60, 90].map((days) => [
        String(days),
        recurrence.rows.filter(
          (r) =>
            r.status === "active" &&
            r.endsOn &&
            r.endsOn >= reference &&
            r.endsOn <= plusDays(reference, days),
        ).length,
      ]),
    ) as Record<"30" | "60" | "90", number>,
    simulationSummary: tax.current,
    recurrenceSummary: {
      current: recurrence.current,
      previous: previousRecurrence.current,
    },
    details: current.details,
  };
}
export type BiReport = ReturnType<typeof buildBi>;
