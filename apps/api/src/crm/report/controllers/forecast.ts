import { and, count, eq, isNotNull, sql, sum } from "drizzle-orm";
import db from "../../../database";
import { crmDealTable, crmStageTable } from "../../../database/schema";
import { dealScope, type ReportFilters, toNumber, withWindow } from "../shared";

/**
 * What the open pipeline is worth per month, weighted by probability, next to
 * what actually closed in the same month.
 *
 * The weighting uses the deal's own probability when it overrides the stage's —
 * an override the rep set by hand is a better estimate than the stage default.
 */
async function forecastReport(filters: ReportFilters) {
  const monthOfExpected = sql<string>`to_char(date_trunc('month', ${crmDealTable.expectedCloseDate}), 'YYYY-MM')`;
  const monthOfWon = sql<string>`to_char(date_trunc('month', ${crmDealTable.wonAt}), 'YYYY-MM')`;

  const open = await db
    .select({
      month: monthOfExpected,
      deals: count(),
      valueCents: sum(crmDealTable.valueCents),
      weightedCents: sum(
        sql`${crmDealTable.valueCents} * COALESCE(${crmDealTable.probability}, ${crmStageTable.probability}) / 100.0`,
      ),
    })
    .from(crmDealTable)
    .innerJoin(crmStageTable, eq(crmDealTable.stageId, crmStageTable.id))
    .where(
      and(
        withWindow(dealScope(filters), crmDealTable.expectedCloseDate, filters),
        eq(crmDealTable.status, "open"),
        // A deal with no expected close date cannot be forecast into a month;
        // it is reported separately rather than silently dropped.
        isNotNull(crmDealTable.expectedCloseDate),
      ),
    )
    .groupBy(monthOfExpected)
    .orderBy(monthOfExpected);

  const won = await db
    .select({
      month: monthOfWon,
      deals: count(),
      valueCents: sum(crmDealTable.valueCents),
    })
    .from(crmDealTable)
    .where(
      and(
        withWindow(dealScope(filters), crmDealTable.wonAt, filters),
        eq(crmDealTable.status, "won"),
      ),
    )
    .groupBy(monthOfWon)
    .orderBy(monthOfWon);

  const [undated] = await db
    .select({
      deals: count(),
      valueCents: sum(crmDealTable.valueCents),
    })
    .from(crmDealTable)
    .where(
      and(
        dealScope(filters),
        eq(crmDealTable.status, "open"),
        sql`${crmDealTable.expectedCloseDate} is null`,
      ),
    );

  const months = [
    ...new Set([...open.map((r) => r.month), ...won.map((r) => r.month)]),
  ].sort();

  const openByMonth = new Map(open.map((row) => [row.month, row]));
  const wonByMonth = new Map(won.map((row) => [row.month, row]));

  return {
    months: months.map((month) => ({
      month,
      openDeals: openByMonth.get(month)?.deals ?? 0,
      openValueCents: toNumber(openByMonth.get(month)?.valueCents),
      weightedValueCents: Math.round(
        toNumber(openByMonth.get(month)?.weightedCents),
      ),
      wonDeals: wonByMonth.get(month)?.deals ?? 0,
      wonValueCents: toNumber(wonByMonth.get(month)?.valueCents),
    })),
    withoutCloseDate: {
      deals: undated?.deals ?? 0,
      valueCents: toNumber(undated?.valueCents),
    },
  };
}

export default forecastReport;
