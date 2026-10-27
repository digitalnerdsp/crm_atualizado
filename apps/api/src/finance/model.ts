export type Direction = "payable" | "receivable";
export type LaborType = "pj" | "freelance" | "clt";
export type Settlement = {
  id: string;
  date: string;
  principalCents: number;
  discountCents: number;
  interestCents: number;
  fineCents: number;
  reversedAt: Date | string | null;
  createdAt: Date | string;
  notes: string;
  reverseReason: string | null;
};
export type Entry = {
  resultClass?:
    | "unclassified"
    | "direct"
    | "operating"
    | "tax"
    | "financial"
    | "commission";
  commissionRateBps?: number;
  commissionBasis?: "received" | "billed";
  commissionRuleId?: string | null;
  contractId?: string | null;
  contractLineKey?: string | null;
  billingRevisionId?: string | null;
  cycleStart?: string | null;
  cycleEnd?: string | null;
  id: string;
  description: string;
  direction: Direction;
  kind: string;
  amountCents: number;
  competenceDate: string;
  dueDate: string;
  categoryId: string | null;
  parentCategoryId: string | null;
  categoryName: string | null;
  partyId: string | null;
  partyName: string;
  laborType: LaborType | null;
  companyId: string | null;
  companyName: string | null;
  serviceId: string | null;
  serviceName: string | null;
  sellerId: string | null;
  sellerName: string | null;
  paymentMethod: string;
  notes: string;
  installment: number;
  installmentCount: number;
  cancelledAt: Date | string | null;
  version: number;
  settlements: Settlement[];
};
export type Filters = {
  from: string;
  to: string;
  dateBasis: "due" | "competence" | "settlement";
  direction?: Direction;
  categoryId?: string;
  subcategoryId?: string;
  laborType?: LaborType;
  partyId?: string;
  contractId?: string;
  companyId?: string;
  serviceId?: string;
  sellerId?: string;
  status?: "open" | "partial" | "settled" | "overdue" | "cancelled";
  kind?: "operating" | "opening" | "transfer";
  search?: string;
  view?: "outstanding" | "overdue";
  asOf?: string;
  sort?: "due_asc" | "due_desc" | "amount_asc" | "amount_desc" | "name";
};
export const DAY = 86400000;
export function isCivilDate(value: string) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    value >= "1900-01-01" &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value
  );
}
export function today() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
export function addMonths(value: string, months: number) {
  const d = new Date(`${value}T00:00:00Z`);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0),
  ).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d.toISOString().slice(0, 10);
}
export function previousPeriod(from: string, to: string) {
  const days = Math.round((Date.parse(to) - Date.parse(from)) / DAY) + 1;
  const end = Date.parse(from) - DAY;
  return {
    from: new Date(end - (days - 1) * DAY).toISOString().slice(0, 10),
    to: new Date(end).toISOString().slice(0, 10),
  };
}
export function cash(
  s: Pick<
    Settlement,
    "principalCents" | "discountCents" | "interestCents" | "fineCents"
  >,
) {
  return s.principalCents - s.discountCents + s.interestCents + s.fineCents;
}
export function activeSettlements(e: Entry) {
  return e.settlements.filter((s) => !s.reversedAt);
}
export function remaining(e: Entry, reference?: string) {
  return (
    e.amountCents -
    activeSettlements(e)
      .filter((s) => !reference || s.date <= reference)
      .reduce((sum, s) => sum + s.principalCents, 0)
  );
}
export function status(e: Entry, reference?: string) {
  if (e.cancelledAt) return "cancelled";
  const left = remaining(e, reference);
  if (left === 0) return "settled";
  return left < e.amountCents ? "partial" : "open";
}
export function isOverdue(e: Entry, reference = today()) {
  return !e.cancelledAt && remaining(e) > 0 && e.dueDate < reference;
}
export function matchesDimensions(e: Entry, f: Partial<Filters>) {
  return (
    (!f.contractId || e.contractId === f.contractId) &&
    (!f.direction || e.direction === f.direction) &&
    (!f.kind || e.kind === f.kind) &&
    (!f.categoryId ||
      e.categoryId === f.categoryId ||
      e.parentCategoryId === f.categoryId) &&
    (!f.subcategoryId || e.categoryId === f.subcategoryId) &&
    (!f.partyId || e.partyId === f.partyId) &&
    (!f.laborType || e.laborType === f.laborType) &&
    (!f.companyId || e.companyId === f.companyId) &&
    (!f.serviceId || e.serviceId === f.serviceId) &&
    (!f.sellerId || e.sellerId === f.sellerId) &&
    (!f.status ||
      (f.status === "overdue" ? isOverdue(e) : status(e) === f.status)) &&
    (!f.search ||
      `${e.description} ${e.partyName}`
        .toLocaleLowerCase()
        .includes(f.search.toLocaleLowerCase()))
  );
}
export function inPeriod(date: string, f: Pick<Filters, "from" | "to">) {
  return date >= f.from && date <= f.to;
}
export function reportBalance(e: Entry, f: Filters) {
  return remaining(e, f.view ? (f.asOf ?? today()) : undefined);
}
export function filterEntries(entries: Entry[], f: Filters) {
  return entries.filter(
    (e) =>
      matchesDimensions(e, f) &&
      (f.view
        ? !e.cancelledAt &&
          e.dueDate <= f.to &&
          reportBalance(e, f) > 0 &&
          (f.view !== "overdue" || e.dueDate < (f.asOf ?? today()))
        : f.dateBasis === "settlement"
          ? activeSettlements(e).some((s) => inPeriod(s.date, f))
          : inPeriod(f.dateBasis === "due" ? e.dueDate : e.competenceDate, f)),
  );
}
export function dashboard(entries: Entry[], f: Filters) {
  const prior = previousPeriod(f.from, f.to);
  const dimensioned = entries.filter((e) => matchesDimensions(e, f));
  function metrics(range: { from: string; to: string }) {
    let income = 0;
    let expense = 0;
    let cashIncome = 0;
    let cashExpense = 0;
    let pendingReceivable = 0;
    let pendingPayable = 0;
    let overdue = 0;
    let expectedIncome = 0;
    let expectedExpense = 0;
    const reference = range.to < today() ? range.to : today();
    for (const e of dimensioned) {
      // Reversed settlements are excluded consistently from KPIs, charts and exports. Historical figures are restated.
      const settlements = activeSettlements(e).filter(
        (s) => s.date <= reference,
      );
      const cancelled = Boolean(e.cancelledAt);
      for (const s of settlements)
        if (inPeriod(s.date, range)) {
          const value = cash(s);
          if (e.direction === "receivable") {
            cashIncome += value;
            if (e.kind === "operating") income += value;
          } else {
            cashExpense += value;
            if (e.kind === "operating") expense += value;
          }
        }
      if (cancelled) continue;
      const scheduled =
        f.dateBasis === "competence" ? e.competenceDate : e.dueDate;
      if (inPeriod(scheduled, range) && e.kind === "operating") {
        if (e.direction === "receivable") expectedIncome += e.amountCents;
        else expectedExpense += e.amountCents;
      }
      // Stock indicators refer to all installments due by the period end, not just those created within it.
      if (e.dueDate <= range.to) {
        const left =
          e.amountCents -
          settlements.reduce((sum, s) => sum + s.principalCents, 0);
        if (e.direction === "receivable") {
          pendingReceivable += left;
          if (e.dueDate < reference) overdue += left;
        } else pendingPayable += left;
      }
    }
    return {
      income,
      expense,
      cashIncome,
      cashExpense,
      balance: cashIncome - cashExpense,
      pendingReceivable,
      pendingPayable,
      overdue,
      expectedIncome,
      expectedExpense,
    };
  }
  const current = metrics(f);
  const previous = metrics(prior);
  const months = new Map<
    string,
    {
      month: string;
      income: number;
      expense: number;
      expectedIncome: number;
      expectedExpense: number;
    }
  >();
  for (
    let m = f.from.slice(0, 7);
    m <= f.to.slice(0, 7);
    m = addMonths(`${m}-01`, 1).slice(0, 7)
  )
    months.set(m, {
      month: m,
      income: 0,
      expense: 0,
      expectedIncome: 0,
      expectedExpense: 0,
    });
  for (const e of dimensioned) {
    if (e.kind !== "operating") continue;
    for (const s of activeSettlements(e))
      if (inPeriod(s.date, f)) {
        const row = months.get(s.date.slice(0, 7));
        if (row)
          row[e.direction === "receivable" ? "income" : "expense"] += cash(s);
      }
    const scheduled =
      f.dateBasis === "competence" ? e.competenceDate : e.dueDate;
    if (!e.cancelledAt && inPeriod(scheduled, f)) {
      const row = months.get(scheduled.slice(0, 7));
      if (row)
        row[
          e.direction === "receivable" ? "expectedIncome" : "expectedExpense"
        ] += e.amountCents;
    }
  }
  return {
    current,
    previous,
    previousPeriod: prior,
    referenceDate: f.to < today() ? f.to : today(),
    months: [...months.values()],
  };
}
