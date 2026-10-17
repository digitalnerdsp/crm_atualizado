import { and, asc, avg, count, eq, isNotNull, sql } from "drizzle-orm";
import db from "../../../database";
import {
  crmDealTable,
  crmStageHistoryTable,
  crmStageTable,
} from "../../../database/schema";
import { dealScope, type ReportFilters, toNumber, withWindow } from "../shared";

/**
 * How long deals sit in each stage, and how long a whole win takes.
 *
 * Only closed intervals count: a deal still sitting in a stage has no duration
 * yet, and counting the time so far would drag every average down.
 */
async function velocityReport(filters: ReportFilters) {
  const perStage = await db
    .select({
      stageId: crmStageHistoryTable.toStageId,
      stageName: crmStageTable.name,
      position: crmStageTable.position,
      samples: count(),
      averageSeconds: avg(crmStageHistoryTable.durationSeconds),
    })
    .from(crmStageHistoryTable)
    .innerJoin(crmDealTable, eq(crmStageHistoryTable.dealId, crmDealTable.id))
    .innerJoin(
      crmStageTable,
      eq(crmStageHistoryTable.toStageId, crmStageTable.id),
    )
    .where(
      and(dealScope(filters), isNotNull(crmStageHistoryTable.durationSeconds)),
    )
    .groupBy(
      crmStageHistoryTable.toStageId,
      crmStageTable.name,
      crmStageTable.position,
    )
    .orderBy(asc(crmStageTable.position));

  const [cycle] = await db
    .select({
      deals: count(),
      averageSeconds: avg(
        sql`extract(epoch from (${crmDealTable.wonAt} - ${crmDealTable.createdAt}))`,
      ),
    })
    .from(crmDealTable)
    .where(
      and(
        withWindow(dealScope(filters), crmDealTable.wonAt, filters),
        eq(crmDealTable.status, "won"),
      ),
    );

  return {
    stages: perStage.map((row) => ({
      stageId: row.stageId,
      stageName: row.stageName,
      samples: row.samples,
      averageSeconds: Math.round(toNumber(row.averageSeconds)),
    })),
    wonCycle: {
      deals: cycle?.deals ?? 0,
      averageSeconds: Math.round(toNumber(cycle?.averageSeconds)),
    },
  };
}

export default velocityReport;
