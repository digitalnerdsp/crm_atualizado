import { and, count, eq, isNotNull, sum } from "drizzle-orm";
import db from "../../../database";
import {
  crmCompanyTable,
  crmDealTable,
  taskTable,
  timeEntryTable,
} from "../../../database/schema";
import { dealScope, type ReportFilters, toNumber, withWindow } from "../shared";

/**
 * Closed revenue against the hours actually spent delivering it.
 *
 * This is the report a standalone CRM cannot produce: it needs the deal value
 * and the time logged on the tasks that came from that deal, which only exist
 * in the same database because the CRM lives inside the project tool.
 *
 * Hours come from `time_entry.duration`, which the app stores in seconds.
 */
export async function revenueVsDeliveryByDeal(filters: ReportFilters) {
  const rows = await db
    .select({
      dealId: crmDealTable.id,
      dealNumber: crmDealTable.number,
      dealTitle: crmDealTable.title,
      companyName: crmCompanyTable.name,
      valueCents: crmDealTable.valueCents,
      currency: crmDealTable.currency,
      wonAt: crmDealTable.wonAt,
      taskCount: count(taskTable.id),
      trackedSeconds: sum(timeEntryTable.duration),
    })
    .from(crmDealTable)
    .leftJoin(crmCompanyTable, eq(crmDealTable.companyId, crmCompanyTable.id))
    .leftJoin(taskTable, eq(taskTable.crmDealId, crmDealTable.id))
    .leftJoin(timeEntryTable, eq(timeEntryTable.taskId, taskTable.id))
    .where(
      and(
        withWindow(dealScope(filters), crmDealTable.wonAt, filters),
        eq(crmDealTable.status, "won"),
      ),
    )
    .groupBy(
      crmDealTable.id,
      crmDealTable.number,
      crmDealTable.title,
      crmCompanyTable.name,
      crmDealTable.valueCents,
      crmDealTable.currency,
      crmDealTable.wonAt,
    );

  return rows
    .map((row) => {
      const trackedSeconds = toNumber(row.trackedSeconds);
      const hours = trackedSeconds / 3600;
      return {
        dealId: row.dealId,
        dealNumber: row.dealNumber,
        dealTitle: row.dealTitle,
        companyName: row.companyName,
        valueCents: row.valueCents,
        currency: row.currency,
        wonAt: row.wonAt,
        taskCount: row.taskCount,
        trackedSeconds,
        // Left null rather than zero when nothing was tracked: "no data" and
        // "infinite revenue per hour" are very different answers.
        revenuePerHourCents:
          hours > 0 ? Math.round(row.valueCents / hours) : null,
      };
    })
    .sort((a, b) => b.valueCents - a.valueCents);
}

/** The same read, rolled up per client instead of per contract. */
export async function revenueVsDeliveryByCompany(filters: ReportFilters) {
  const wonRows = await db
    .select({
      companyId: crmDealTable.companyId,
      companyName: crmCompanyTable.name,
      deals: count(),
      valueCents: sum(crmDealTable.valueCents),
    })
    .from(crmDealTable)
    .leftJoin(crmCompanyTable, eq(crmDealTable.companyId, crmCompanyTable.id))
    .where(
      and(
        withWindow(dealScope(filters), crmDealTable.wonAt, filters),
        eq(crmDealTable.status, "won"),
        isNotNull(crmDealTable.companyId),
      ),
    )
    .groupBy(crmDealTable.companyId, crmCompanyTable.name);

  // Hours are counted from every task of the client, not only the ones that
  // came from a deal: support and rework are delivery cost too.
  const trackedRows = await db
    .select({
      companyId: taskTable.crmCompanyId,
      trackedSeconds: sum(timeEntryTable.duration),
      taskCount: count(taskTable.id),
    })
    .from(taskTable)
    .leftJoin(timeEntryTable, eq(timeEntryTable.taskId, taskTable.id))
    .where(isNotNull(taskTable.crmCompanyId))
    .groupBy(taskTable.crmCompanyId);

  const trackedByCompany = new Map(
    trackedRows.map((row) => [row.companyId, row]),
  );

  return wonRows
    .map((row) => {
      const tracked = trackedByCompany.get(row.companyId);
      const trackedSeconds = toNumber(tracked?.trackedSeconds);
      const hours = trackedSeconds / 3600;
      const valueCents = toNumber(row.valueCents);
      return {
        companyId: row.companyId,
        companyName: row.companyName,
        wonDeals: row.deals,
        valueCents,
        taskCount: tracked?.taskCount ?? 0,
        trackedSeconds,
        revenuePerHourCents: hours > 0 ? Math.round(valueCents / hours) : null,
      };
    })
    .sort((a, b) => b.valueCents - a.valueCents);
}
