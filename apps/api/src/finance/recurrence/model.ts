import {
  addMonths,
  cash,
  type Entry,
  inPeriod,
  previousPeriod,
  remaining,
  today,
} from "../model";
import type { PortfolioContract, RecurrenceFilters } from "./report";
import {
  day,
  effectiveDay,
  monthsPerCycle,
  planCycles,
  plusDays,
  revisionAt,
  snapshotItems,
} from "./schedule";
export function stateAt(c: PortfolioContract, reference: string) {
  if (day(c.startsAt) > reference)
    return { status: "not_started", mrrCents: 0 };
  let status = "active";
  let mrrCents = 0;
  for (const e of c.events) {
    if (
      (e.type === "created" ? day(e.occurredAt) : effectiveDay(e.occurredAt)) >
      reference
    )
      continue;
    mrrCents = e.toMonthlyValueCents;
    if (e.type === "paused") status = "paused";
    else if (e.type === "cancelled") status = "cancelled";
    else if (e.type === "finished") status = "finished";
    else if (e.type === "resumed" || e.type === "created") status = "active";
  }
  const rev = revisionAt(c.revisions, reference);
  const end = rev ? rev.endsOn : c.endsAt ? day(c.endsAt) : null;
  if (end && end < reference) return { status: "finished", mrrCents: 0 };
  return { status, mrrCents: status === "active" ? mrrCents : 0 };
}
export function itemsAt(c: PortfolioContract, date: string) {
  return (
    revisionAt(c.revisions, date)?.items ??
    snapshotItems(
      c.lines,
      c.monthlyValueCents,
      c.config?.startsOn ?? day(c.startsAt),
    )
  );
}
function itemMatches(
  item: { serviceId: string | null; billingType: string },
  f: RecurrenceFilters,
) {
  return (
    (!f.serviceId || item.serviceId === f.serviceId) &&
    (!f.billingType || item.billingType === f.billingType)
  );
}
function entryMatches(e: Entry, f: RecurrenceFilters) {
  return (
    (!f.serviceId || e.serviceId === f.serviceId) &&
    (!f.sellerId || e.sellerId === f.sellerId) &&
    (!f.billingType || (e.contractLineKey && e.billingRevisionId))
  );
}
export function recurrenceReport(
  portfolio: PortfolioContract[],
  f: RecurrenceFilters,
  includeRows = true,
) {
  const reference = f.to < today() ? f.to : today();
  const previous = previousPeriod(f.from, f.to);
  let excludedCurrencies = 0;
  const candidates = portfolio.filter((c) => {
    if (c.currency !== "BRL") {
      excludedCurrencies++;
      return false;
    }
    const state = stateAt(c, reference);
    const items = itemsAt(c, reference);
    const end = c.endsAt ? day(c.endsAt) : null;
    return (
      (!f.contractId || c.id === f.contractId) &&
      (!f.companyId || c.companyId === f.companyId) &&
      (!f.sellerId ||
        c.ownerUserId === f.sellerId ||
        c.entries.some((e) => e.sellerId === f.sellerId)) &&
      (!f.status || state.status === f.status) &&
      items.some((i) => itemMatches(i, f)) &&
      (!f.term || (f.term === "fixed" ? Boolean(end) : !end)) &&
      (!f.dateField ||
        inPeriod(f.dateField === "start" ? day(c.startsAt) : (end ?? ""), f)) &&
      (!f.expiresWithin ||
        Boolean(
          end &&
            end >= reference &&
            end <= plusDays(reference, Number(f.expiresWithin)),
        ))
    );
  });
  function rangeMetrics(range: { from: string; to: string }) {
    const ref = range.to < today() ? range.to : today();
    let mrrCents = 0;
    let activeContracts = 0;
    let expiringContracts = 0;
    let projectedCents = 0;
    let billedCents = 0;
    let receivedCents = 0;
    let outstandingCents = 0;
    let historyUnavailable = 0;
    for (const c of candidates) {
      const state = stateAt(c, ref);
      const rev = revisionAt(c.revisions, ref);
      const selected = itemsAt(c, ref).filter((i) => itemMatches(i, f));
      const owner = rev?.sellerId ?? c.ownerUserId;
      if (state.status === "active" && (!f.sellerId || owner === f.sellerId)) {
        activeContracts++;
        if (f.serviceId || f.billingType) {
          if (!rev && ref < today()) historyUnavailable++;
          else
            mrrCents += selected.reduce(
              (sum, i) =>
                sum + Math.round(i.amountCents / monthsPerCycle[i.billingType]),
              0,
            );
        } else mrrCents += state.mrrCents;
      }
      const ends = rev ? rev.endsOn : c.endsAt ? day(c.endsAt) : null;
      if (
        state.status === "active" &&
        ends &&
        ends >= ref &&
        ends <= plusDays(ref, Number(f.expiresWithin ?? 30))
      )
        expiringContracts++;
      const planned = c.revisions.length
        ? planCycles(c.revisions, range.to, c.config?.prorateFinal ?? false)
        : [];
      for (const cycle of planned)
        if (
          inPeriod(cycle.start, range) &&
          itemMatches(cycle.item, f) &&
          (!f.sellerId || cycle.revision.sellerId === f.sellerId)
        )
          projectedCents += cycle.amountCents;
      for (const e of c.entries) {
        if (!entryMatches(e, f)) continue;
        if (f.billingType) {
          const revision = c.revisions.find(
            (r) => r.id === e.billingRevisionId,
          );
          if (
            revision?.items.find((i) => i.key === e.contractLineKey)
              ?.billingType !== f.billingType
          )
            continue;
        }
        if (!e.cancelledAt && inPeriod(e.competenceDate, range))
          billedCents += e.amountCents;
        if (!e.cancelledAt && e.dueDate <= range.to)
          outstandingCents += remaining(e, ref);
        for (const s of e.settlements)
          if (!s.reversedAt && inPeriod(s.date, range))
            receivedCents += cash(s);
      }
    }
    return {
      mrrCents,
      activeContracts,
      expiringContracts,
      projectedCents,
      billedCents,
      receivedCents,
      outstandingCents,
      historyUnavailable,
    };
  }
  const current = rangeMetrics(f);
  const prior = rangeMetrics(previous);
  const months = [];
  for (
    let m = f.from.slice(0, 7);
    m <= f.to.slice(0, 7);
    m = addMonths(`${m}-01`, 1).slice(0, 7)
  ) {
    const end = plusDays(addMonths(`${m}-01`, 1), -1);
    const metrics = rangeMetrics({
      from: `${m}-01` < f.from ? f.from : `${m}-01`,
      to: end > f.to ? f.to : end,
    });
    months.push({ month: m, ...metrics });
  }
  const rows = includeRows
    ? candidates.map((c) => {
        const state = stateAt(c, reference);
        const items = itemsAt(c, reference).filter((i) => itemMatches(i, f));
        const end = c.endsAt ? day(c.endsAt) : null;
        const selected = c.entries.filter(
          (e) =>
            entryMatches(e, f) &&
            !e.cancelledAt &&
            (!f.billingType ||
              c.revisions
                .find((r) => r.id === e.billingRevisionId)
                ?.items.find((i) => i.key === e.contractLineKey)
                ?.billingType === f.billingType),
        );
        const future = c.revisions.length
          ? planCycles(
              c.revisions,
              addMonths(reference, 24),
              c.config?.prorateFinal ?? false,
            ).filter((p) => p.dueDate >= reference && itemMatches(p.item, f))
          : [];
        const openFuture = future.filter((cycle) => {
          const entry = c.entries.find(
            (e) =>
              e.contractLineKey === cycle.key && e.cycleStart === cycle.start,
          );
          return !entry || (!entry.cancelledAt && remaining(entry) > 0);
        });
        openFuture.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
        const next = openFuture[0];
        const daysRemaining = end
          ? Math.max(
              0,
              Math.round((Date.parse(end) - Date.parse(reference)) / 86400000),
            )
          : null;
        return {
          id: c.id,
          number: c.number,
          title: c.title,
          companyId: c.companyId,
          companyName: c.companyName,
          sellerName: c.sellerName,
          sellerId: c.ownerUserId,
          startsOn: day(c.startsAt),
          endsOn: end,
          status: state.status,
          daysRemaining,
          monthlyValueCents:
            state.status === "active"
              ? f.serviceId || f.billingType
                ? items.reduce(
                    (sum, i) =>
                      sum +
                      Math.round(i.amountCents / monthsPerCycle[i.billingType]),
                    0,
                  )
                : state.mrrCents
              : 0,
          services: items,
          billingEnabled: c.config?.enabled ?? false,
          lastWarning: c.config?.lastWarning ?? null,
          nextCharge: next
            ? {
                date: next.dueDate,
                cycleStart: next.start,
                amountCents: openFuture
                  .filter((p) => p.dueDate === next.dueDate)
                  .reduce((sum, p) => {
                    const entry = c.entries.find(
                      (e) =>
                        e.contractLineKey === p.key && e.cycleStart === p.start,
                    );
                    return sum + (entry ? remaining(entry) : p.amountCents);
                  }, 0),
              }
            : null,
          billedCents: selected
            .filter((e) => inPeriod(e.competenceDate, f))
            .reduce((sum, e) => sum + e.amountCents, 0),
          receivedCents: selected.reduce(
            (sum, e) =>
              sum +
              e.settlements
                .filter((s) => !s.reversedAt && inPeriod(s.date, f))
                .reduce((s, p) => s + cash(p), 0),
            0,
          ),
          outstandingCents: selected
            .filter((e) => e.dueDate <= f.to)
            .reduce((sum, e) => sum + remaining(e, reference), 0),
        };
      })
    : [];
  const expiry: [
    { label: string; count: number },
    { label: string; count: number },
    { label: string; count: number },
  ] = [
    { label: "Até 30 dias", count: 0 },
    { label: "31 a 60 dias", count: 0 },
    { label: "61 a 90 dias", count: 0 },
  ];
  for (const row of rows)
    if (row.status === "active" && row.daysRemaining !== null) {
      if (row.daysRemaining <= 30) expiry[0].count++;
      else if (row.daysRemaining <= 60) expiry[1].count++;
      else if (row.daysRemaining <= 90) expiry[2].count++;
    }
  return {
    referenceDate: reference,
    previousPeriod: previous,
    current,
    previous: prior,
    months,
    expiry,
    rows,
    total: rows.length,
    excludedCurrencies,
    historyNote:
      "Comparações de MRR usam os eventos históricos do CRM. Detalhamento histórico por serviço exige versões financeiras; valores sem essa base não são estimados. Projeções de cobrança começam na ativação financeira de cada contrato.",
  };
}
