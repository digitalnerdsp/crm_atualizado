import { and, asc, countDistinct, eq, gt, gte, lte, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import db from "../../../database";
import {
  crmDealTable,
  crmPipelineTable,
  crmStageHistoryTable,
  crmStageTable,
} from "../../../database/schema";
import { dealScope, type ReportFilters } from "../shared";

/**
 * How many deals ever entered each stage, and how many of those went on to a
 * later one.
 *
 * This is the only report that cannot be derived from the deals themselves: a
 * deal that passed through Proposal and was lost shows Lost today, and only
 * `crm_stage_history` remembers it was ever in Proposal.
 *
 * The rate is *progression out of this stage*, not "this stage over the one
 * before it". Deals are routinely created straight into the middle of the
 * funnel, so comparing consecutive stages produces rates above 100% — a number
 * that means nothing to whoever reads it. Progression is bounded by
 * construction and answers the question people actually ask: of everything that
 * reached Proposal, how much moved on?
 */
async function funnelReport(filters: ReportFilters) {
  const [pipeline] = await db
    .select({ id: crmPipelineTable.id, name: crmPipelineTable.name })
    .from(crmPipelineTable)
    .where(
      filters.pipelineId
        ? and(
            eq(crmPipelineTable.workspaceId, filters.workspaceId),
            eq(crmPipelineTable.id, filters.pipelineId),
          )
        : and(
            eq(crmPipelineTable.workspaceId, filters.workspaceId),
            eq(crmPipelineTable.isDefault, true),
          ),
    )
    .limit(1);

  if (!pipeline) return { pipeline: null, stages: [] };

  const stages = await db
    .select({
      id: crmStageTable.id,
      name: crmStageTable.name,
      position: crmStageTable.position,
      outcome: crmStageTable.outcome,
      color: crmStageTable.color,
    })
    .from(crmStageTable)
    .where(eq(crmStageTable.pipelineId, pipeline.id))
    .orderBy(asc(crmStageTable.position));

  const scope = dealScope({ ...filters, pipelineId: pipeline.id });
  const window = and(
    scope,
    filters.from
      ? gte(crmStageHistoryTable.enteredAt, filters.from)
      : undefined,
    filters.to ? lte(crmStageHistoryTable.enteredAt, filters.to) : undefined,
  );

  const entered = await db
    .select({
      stageId: crmStageHistoryTable.toStageId,
      deals: countDistinct(crmStageHistoryTable.dealId),
    })
    .from(crmStageHistoryTable)
    .innerJoin(crmDealTable, eq(crmStageHistoryTable.dealId, crmDealTable.id))
    .where(window)
    .groupBy(crmStageHistoryTable.toStageId);

  // A deal "advanced" out of a stage when it later entered a stage further
  // along the same pipeline. Won and Lost sit at the end, so reaching Won
  // counts as advancing and reaching Lost does not.
  const laterEntry = alias(crmStageHistoryTable, "later_entry");
  const laterStage = alias(crmStageTable, "later_stage");

  const advanced = await db
    .select({
      stageId: crmStageHistoryTable.toStageId,
      deals: countDistinct(crmStageHistoryTable.dealId),
    })
    .from(crmStageHistoryTable)
    .innerJoin(crmDealTable, eq(crmStageHistoryTable.dealId, crmDealTable.id))
    .innerJoin(
      crmStageTable,
      eq(crmStageHistoryTable.toStageId, crmStageTable.id),
    )
    .innerJoin(laterEntry, eq(laterEntry.dealId, crmStageHistoryTable.dealId))
    .innerJoin(laterStage, eq(laterEntry.toStageId, laterStage.id))
    .where(
      and(
        window,
        eq(laterStage.pipelineId, pipeline.id),
        gt(laterStage.position, crmStageTable.position),
        sql`${laterStage.outcome} <> 'lost'`,
      ),
    )
    .groupBy(crmStageHistoryTable.toStageId);

  const enteredByStage = new Map(
    entered.map((row) => [row.stageId, row.deals]),
  );
  const advancedByStage = new Map(
    advanced.map((row) => [row.stageId, row.deals]),
  );

  return {
    pipeline,
    stages: stages.map((stage) => {
      const enteredCount = enteredByStage.get(stage.id) ?? 0;
      const advancedCount = advancedByStage.get(stage.id) ?? 0;
      return {
        ...stage,
        entered: enteredCount,
        advanced: advancedCount,
        // Closing stages have nowhere to advance to, so a rate there would be
        // a permanent 0% that reads like a failure.
        progressionRate:
          stage.outcome === "open" && enteredCount > 0
            ? Math.round((advancedCount / enteredCount) * 100)
            : null,
      };
    }),
  };
}

export default funnelReport;
