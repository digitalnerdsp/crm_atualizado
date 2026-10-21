import {
  type Entry,
  inPeriod,
  previousPeriod,
  remaining,
  today,
} from "../model";
import { type Payout, performanceReport } from "../performance/model";
import { effectiveDay } from "../recurrence/schedule";
import type { Range } from "./validation";
export type Site = {
  id: string;
  companyId: string;
  name: string;
  status: string;
  includeScenario: boolean;
  version: number;
  contractId: string | null;
};
export type WorkTask = {
  taskId: string;
  siteId: string;
  estimateMinutes: number;
  version: number;
  title: string;
  projectId: string;
  assigneeId: string | null;
};
export type Time = {
  id: string;
  taskId: string;
  userId: string | null;
  startTime: Date | string;
  endTime: Date | string | null;
  duration: number | null;
};
export type Rate = {
  id: string;
  userId: string;
  effectiveOn: string;
  hourlyCents: number;
};
export type Worker = {
  id: string;
  siteId: string;
  userId: string;
  mode: "internal" | "hourly" | "fixed" | "ledger";
  fixedCents: number;
  chargedOn: string;
  sourceEntryId: string | null;
  version: number;
};
export type WorkData = {
  sites: Site[];
  tasks: WorkTask[];
  times: Time[];
  rates: Rate[];
  workers: Worker[];
  links: { siteId: string; entryId: string }[];
  users: { id: string; name: string }[];
  companies: { id: string; name: string }[];
  entries: Entry[];
  payouts: Payout[];
};
export function closedSeconds(t: Time) {
  if (!t.endTime) return 0;
  const diff =
    (new Date(t.endTime).getTime() - new Date(t.startTime).getTime()) / 1000;
  return Number.isFinite(diff) && diff > 0 ? Math.floor(diff) : 0;
}
export function timeSummary(tasks: WorkTask[], times: Time[]) {
  const ids = new Set(tasks.map((t) => t.taskId));
  return {
    estimateMinutes: tasks.reduce((s, t) => s + t.estimateMinutes, 0),
    seconds: times
      .filter((t) => ids.has(t.taskId))
      .reduce((s, t) => s + closedSeconds(t), 0),
    running: times.filter((t) => ids.has(t.taskId) && !t.endTime).length,
  };
}
export function laborCost(
  times: Time[],
  worker: Worker | undefined,
  rates: Rate[],
  f?: { from: string; to: string },
) {
  const eligible = times.filter(
    (t) => !f || inPeriod(effectiveDay(t.startTime), f),
  );
  let seconds = 0;
  let missingSeconds = 0;
  let cost = 0;
  for (const t of eligible) {
    const duration = closedSeconds(t);
    seconds += duration;
    if (!duration) continue;
    if (worker?.mode === "fixed" || worker?.mode === "ledger") continue;
    const rate = rates
      .filter(
        (r) =>
          r.userId === t.userId && r.effectiveOn <= effectiveDay(t.startTime),
      )
      .sort((a, b) => b.effectiveOn.localeCompare(a.effectiveOn))[0];
    if (!worker || !rate) {
      missingSeconds += duration;
      continue;
    }
    cost += Math.round((duration * rate.hourlyCents) / 3600);
  }
  if (worker?.mode === "fixed" && (!f || inPeriod(worker.chargedOn, f)))
    cost = worker.fixedCents;
  return { seconds, missingSeconds, estimatedCents: cost };
}
export function profitability(d: WorkData, f: Range) {
  const entriesById = new Map(d.entries.map((e) => [e.id, e]));
  const users = new Map(d.users.map((u) => [u.id, u.name]));
  const prior = previousPeriod(f.from, f.to);
  const siteRows = d.sites
    .filter((s) => !f.companyId || s.companyId === f.companyId)
    .map((site) => {
      const tasks = d.tasks.filter((t) => t.siteId === site.id);
      const taskIds = new Set(tasks.map((t) => t.taskId));
      const times = d.times.filter((t) => taskIds.has(t.taskId));
      const agreements = d.workers.filter((w) => w.siteId === site.id);
      const workers = [
        ...new Set([
          ...times.map((t) => t.userId),
          ...agreements.map((w) => w.userId),
          ...tasks.filter((t) => t.assigneeId).map((t) => t.assigneeId),
        ]),
      ].map((userId) => {
        const worker = agreements.find((w) => w.userId === userId);
        const own = times.filter((t) => t.userId === userId);
        const period = laborCost(own, worker, d.rates, f);
        const total = laborCost(own, worker, d.rates);
        const source = worker?.sourceEntryId
          ? entriesById.get(worker.sourceEntryId)
          : null;
        const booked = Boolean(
          source &&
            !source.cancelledAt &&
            source.direction === "payable" &&
            source.kind === "operating" &&
            source.companyId === site.companyId,
        );
        return {
          userId,
          name: users.get(userId ?? "") ?? "Colaborador não disponível",
          mode: worker?.mode ?? "unconfigured",
          estimateMinutes: tasks
            .filter((t) => t.assigneeId === userId)
            .reduce((sum, t) => sum + t.estimateMinutes, 0),
          ...period,
          totalSeconds: total.seconds,
          totalEstimatedCents: total.estimatedCents,
          totalMissingSeconds: total.missingSeconds,
          sourceEntryId: worker?.sourceEntryId ?? null,
          booked,
          bookedCents:
            booked && source && inPeriod(source.competenceDate, f)
              ? source.amountCents
              : 0,
          extraEstimateCents: booked ? 0 : period.estimatedCents,
          totalExtraEstimateCents: booked ? 0 : total.estimatedCents,
          needsReconciliation: Boolean(worker?.sourceEntryId && !booked),
          version: worker?.version ?? 0,
          chargedOn: worker?.chargedOn ?? null,
          fixedCents: worker?.fixedCents ?? 0,
        };
      });
      const linkedIds = new Set(
        d.links.filter((l) => l.siteId === site.id).map((l) => l.entryId),
      );
      const finance = d.entries.filter(
        (e) => linkedIds.has(e.id) && e.companyId === site.companyId,
      );
      const invalidLinks = d.links.filter(
        (l) => l.siteId === site.id && !finance.some((e) => e.id === l.entryId),
      ).length;
      const result = performanceReport(finance, d.payouts, f, null);
      // Full project result includes every title already recorded, without generating
      // a chart for a century: reduce the range to recorded competence/settlement dates.
      const dates = finance.flatMap((e) => [
        e.competenceDate,
        ...e.settlements.filter((s) => !s.reversedAt).map((s) => s.date),
      ]);
      const allFrom = dates.length
        ? dates.reduce((a, b) => (a < b ? a : b))
        : f.from;
      const allTo = dates.length
        ? dates.reduce((a, b) => (a > b ? a : b))
        : f.to;
      const totalFinancial = performanceReport(
        finance,
        d.payouts,
        { from: allFrom, to: allTo },
        null,
      ).current;
      const extra = workers.reduce((s, w) => s + w.extraEstimateCents, 0);
      const totalExtra = workers.reduce(
        (s, w) => s + w.totalExtraEstimateCents,
        0,
      );
      const missing = workers.reduce((s, w) => s + w.missingSeconds, 0);
      const totalMissing = workers.reduce(
        (s, w) => s + w.totalMissingSeconds,
        0,
      );
      return {
        ...site,
        companyName:
          d.companies.find((c) => c.id === site.companyId)?.name ?? "Cliente",
        tasks: tasks.map((task) => ({
          ...task,
          ...timeSummary(
            [task],
            times.filter((t) => t.taskId === task.taskId),
          ),
          contributors: [
            ...new Set(
              times
                .filter((t) => t.taskId === task.taskId)
                .map((t) => t.userId),
            ),
          ].map((id) => ({
            userId: id,
            name: users.get(id ?? "") ?? "Colaborador",
            seconds: times
              .filter((t) => t.taskId === task.taskId && t.userId === id)
              .reduce((s, t) => s + closedSeconds(t), 0),
          })),
        })),
        workers,
        finance: result.current,
        totalFinancial,
        estimatedLaborCents: workers.reduce((s, w) => s + w.estimatedCents, 0),
        totalEstimatedLaborCents: workers.reduce(
          (s, w) => s + w.totalEstimatedCents,
          0,
        ),
        missingSeconds: missing,
        totalMissingSeconds: totalMissing,
        scenarioCents:
          site.includeScenario &&
          !missing &&
          !invalidLinks &&
          !workers.some((w) => w.needsReconciliation)
            ? result.current.netProfitCents - extra
            : null,
        totalScenarioCents:
          site.includeScenario &&
          !totalMissing &&
          !invalidLinks &&
          !workers.some((w) => w.needsReconciliation)
            ? totalFinancial.netProfitCents - totalExtra
            : null,
        invalidLinks,
        linkedEntries: finance.map((e) => ({
          id: e.id,
          description: e.description,
          direction: e.direction,
          amountCents: e.amountCents,
          date: e.competenceDate,
          cancelled: Boolean(e.cancelledAt),
        })),
        ...timeSummary(tasks, times),
      };
    });
  const companies = d.companies
    .filter((c) => !f.companyId || c.id === f.companyId)
    .map((company) => {
      const es = d.entries.filter((e) => e.companyId === company.id);
      const p = performanceReport(es, d.payouts, f, null);
      const previous = performanceReport(es, d.payouts, prior, null).current;
      const sites = siteRows.filter((s) => s.companyId === company.id);
      return {
        ...company,
        revenueCents: p.current.revenueCents,
        resultCents: p.current.netProfitCents,
        previousRevenueCents: previous.revenueCents,
        previousResultCents: previous.netProfitCents,
        margin:
          p.current.revenueCents > 0
            ? (p.current.netProfitCents / p.current.revenueCents) * 100
            : null,
        overdueCents: es
          .filter(
            (e) =>
              !e.cancelledAt &&
              e.direction === "receivable" &&
              e.dueDate < today(),
          )
          .reduce((s, e) => s + Math.max(0, remaining(e)), 0),
        estimatedLaborCents: sites.reduce(
          (s, e) => s + e.estimatedLaborCents,
          0,
        ),
        missingSeconds: sites.reduce((s, e) => s + e.missingSeconds, 0),
        seconds: sites.reduce(
          (s, e) => s + e.workers.reduce((t, w) => t + w.seconds, 0),
          0,
        ),
        siteCount: sites.length,
      };
    })
    .filter(
      (c) => c.revenueCents || c.resultCents || c.overdueCents || c.siteCount,
    )
    .sort((a, b) => b.revenueCents - a.revenueCents);
  return {
    companies,
    sites: siteRows,
    unassignedExpenseCents: d.entries
      .filter(
        (e) =>
          !e.cancelledAt &&
          e.kind === "operating" &&
          e.direction === "payable" &&
          !e.companyId &&
          inPeriod(e.competenceDate, f),
      )
      .reduce((s, e) => s + e.amountCents, 0),
    previousPeriod: prior,
  };
}
