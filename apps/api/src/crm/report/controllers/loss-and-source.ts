import { and, count, desc, eq, sum } from "drizzle-orm";
import db from "../../../database";
import {
  type CrmSourceChannel,
  crmDealTable,
  crmLostReasonTable,
  crmSourceTable,
  crmStageTable,
} from "../../../database/schema";
import { dealScope, type ReportFilters, toNumber, withWindow } from "../shared";

/**
 * Why deals are lost, and at which stage they were lost — the pair is what
 * changes the sales pitch. "Price" losses in Qualification mean the offer is
 * mispositioned; the same losses in Negotiation mean the discount policy is.
 */
export async function lossReasonsReport(filters: ReportFilters) {
  const rows = await db
    .select({
      reasonId: crmDealTable.lostReasonId,
      reasonName: crmLostReasonTable.name,
      deals: count(),
      valueCents: sum(crmDealTable.valueCents),
    })
    .from(crmDealTable)
    .leftJoin(
      crmLostReasonTable,
      eq(crmDealTable.lostReasonId, crmLostReasonTable.id),
    )
    .where(
      and(
        withWindow(dealScope(filters), crmDealTable.lostAt, filters),
        eq(crmDealTable.status, "lost"),
      ),
    )
    .groupBy(crmDealTable.lostReasonId, crmLostReasonTable.name)
    .orderBy(desc(count()));

  const byStage = await db
    .select({
      stageId: crmDealTable.stageId,
      stageName: crmStageTable.name,
      reasonId: crmDealTable.lostReasonId,
      deals: count(),
    })
    .from(crmDealTable)
    .innerJoin(crmStageTable, eq(crmDealTable.stageId, crmStageTable.id))
    .where(
      and(
        withWindow(dealScope(filters), crmDealTable.lostAt, filters),
        eq(crmDealTable.status, "lost"),
      ),
    )
    .groupBy(
      crmDealTable.stageId,
      crmStageTable.name,
      crmDealTable.lostReasonId,
    );

  return {
    reasons: rows.map((row) => ({
      reasonId: row.reasonId,
      reasonName: row.reasonName,
      deals: row.deals,
      valueCents: toNumber(row.valueCents),
    })),
    byStage,
  };
}

/** Where the pipeline comes from, and what each origin is actually worth. */
export async function sourceReport(filters: ReportFilters) {
  const rows = await db
    .select({
      sourceId: crmDealTable.sourceId,
      sourceName: crmSourceTable.name,
      channel: crmSourceTable.channel,
      status: crmDealTable.status,
      deals: count(),
      valueCents: sum(crmDealTable.valueCents),
    })
    .from(crmDealTable)
    .leftJoin(crmSourceTable, eq(crmSourceTable.id, crmDealTable.sourceId))
    .where(dealScope(filters))
    .groupBy(
      crmDealTable.sourceId,
      crmSourceTable.name,
      crmSourceTable.channel,
      crmDealTable.status,
    );

  const bySource = new Map<
    string,
    {
      sourceId: string | null;
      source: string | null;
      channel: CrmSourceChannel | null;
      total: number;
      open: number;
      won: number;
      lost: number;
      wonValueCents: number;
      totalValueCents: number;
    }
  >();

  for (const row of rows) {
    const key = row.sourceId ?? "__none__";
    const bucket = bySource.get(key) ?? {
      sourceId: row.sourceId,
      source: row.sourceName,
      channel: row.channel,
      total: 0,
      open: 0,
      won: 0,
      lost: 0,
      wonValueCents: 0,
      totalValueCents: 0,
    };
    bucket.total += row.deals;
    bucket.totalValueCents += toNumber(row.valueCents);
    if (row.status === "open") bucket.open += row.deals;
    if (row.status === "lost") bucket.lost += row.deals;
    if (row.status === "won") {
      bucket.won += row.deals;
      bucket.wonValueCents += toNumber(row.valueCents);
    }
    bySource.set(key, bucket);
  }

  return [...bySource.values()].sort(
    (a, b) => b.wonValueCents - a.wonValueCents,
  );
}
