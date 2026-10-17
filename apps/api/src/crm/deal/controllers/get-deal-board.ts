import { and, asc, count, desc, eq, isNull, sql, sum } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../../database";
import {
  crmCompanyTable,
  crmContactTable,
  crmDealTable,
  crmPipelineTable,
  crmStageTable,
  userTable,
} from "../../../database/schema";
import {
  allOf,
  clampLimit,
  ownerScope,
  searchAcross,
} from "../../shared/list-filters";
import type { CrmVisibility } from "../../shared/resolve-visibility";

export const BOARD_STAGE_PAGE_SIZE = 50;

async function getDealBoard({
  workspaceId,
  pipelineId,
  userId,
  visibility,
  ownerUserId,
  search,
  stageLimit,
}: {
  workspaceId: string;
  pipelineId?: string;
  userId: string;
  visibility: CrmVisibility;
  ownerUserId?: string;
  search?: string;
  stageLimit?: number;
}) {
  const pipelines = await db
    .select()
    .from(crmPipelineTable)
    .where(
      and(
        eq(crmPipelineTable.workspaceId, workspaceId),
        isNull(crmPipelineTable.archivedAt),
      ),
    )
    .orderBy(asc(crmPipelineTable.position));

  const pipeline = pipelineId
    ? pipelines.find((row) => row.id === pipelineId)
    : (pipelines.find((row) => row.isDefault) ?? pipelines[0]);

  if (!pipeline) {
    throw new HTTPException(404, { message: "Pipeline not found" });
  }

  const stages = await db
    .select()
    .from(crmStageTable)
    .where(eq(crmStageTable.pipelineId, pipeline.id))
    .orderBy(asc(crmStageTable.position));

  const baseFilter = allOf(
    eq(crmDealTable.workspaceId, workspaceId),
    eq(crmDealTable.pipelineId, pipeline.id),
    isNull(crmDealTable.archivedAt),
    ownerScope(crmDealTable.ownerUserId, visibility, userId),
    ownerUserId ? eq(crmDealTable.ownerUserId, ownerUserId) : undefined,
    searchAcross([crmDealTable.title], search),
  );

  // Totals come from the database, never from summing the returned page — with
  // 50 deals per stage the column footer would otherwise lie.
  const totals = await db
    .select({
      stageId: crmDealTable.stageId,
      dealCount: count(),
      totalValueCents: sum(crmDealTable.valueCents),
      // Weighted by the deal's own probability when it overrides the stage's,
      // which is the whole point of allowing the override.
      weightedValueCents: sum(
        sql`${crmDealTable.valueCents} * COALESCE(${crmDealTable.probability}, ${crmStageTable.probability}) / 100.0`,
      ),
    })
    .from(crmDealTable)
    .innerJoin(crmStageTable, eq(crmDealTable.stageId, crmStageTable.id))
    .where(baseFilter)
    .groupBy(crmDealTable.stageId);

  const totalsByStage = new Map(
    totals.map((row) => [
      row.stageId,
      {
        dealCount: row.dealCount,
        // pg returns sum() over bigint and numeric as a string.
        totalValueCents: Number(row.totalValueCents ?? 0),
        weightedValueCents: Math.round(Number(row.weightedValueCents ?? 0)),
      },
    ]),
  );

  const pageSize = clampLimit(stageLimit ?? BOARD_STAGE_PAGE_SIZE);

  // One indexed query per stage rather than one window-function query for the
  // whole board: a pipeline has a handful of stages, each read hits
  // `crm_deal_stageId_position_idx`, and the shape stays readable. The joins
  // are what matter — they keep this from being a query per card.
  const stagePages = await Promise.all(
    stages.map(async (stage) => {
      const rows = await db
        .select({
          deal: crmDealTable,
          owner: {
            id: userTable.id,
            name: userTable.name,
            email: userTable.email,
            image: userTable.image,
          },
          company: {
            id: crmCompanyTable.id,
            name: crmCompanyTable.name,
          },
          primaryContact: {
            id: crmContactTable.id,
            firstName: crmContactTable.firstName,
            lastName: crmContactTable.lastName,
          },
        })
        .from(crmDealTable)
        .leftJoin(userTable, eq(crmDealTable.ownerUserId, userTable.id))
        .leftJoin(
          crmCompanyTable,
          eq(crmDealTable.companyId, crmCompanyTable.id),
        )
        .leftJoin(
          crmContactTable,
          eq(crmDealTable.primaryContactId, crmContactTable.id),
        )
        .where(and(baseFilter, eq(crmDealTable.stageId, stage.id)))
        .orderBy(asc(crmDealTable.position), desc(crmDealTable.createdAt))
        .limit(pageSize);

      const stageTotals = totalsByStage.get(stage.id);
      const dealCount = stageTotals?.dealCount ?? 0;

      return {
        ...stage,
        dealCount,
        totalValueCents: stageTotals?.totalValueCents ?? 0,
        weightedValueCents: stageTotals?.weightedValueCents ?? 0,
        hasMore: dealCount > rows.length,
        deals: rows.map((row) => ({
          ...row.deal,
          owner: row.owner,
          company: row.company,
          primaryContact: row.primaryContact,
        })),
      };
    }),
  );

  const openStages = stagePages.filter((stage) => stage.outcome === "open");

  return {
    pipeline: {
      id: pipeline.id,
      name: pipeline.name,
      slug: pipeline.slug,
      isDefault: pipeline.isDefault,
    },
    pipelines: pipelines.map((row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      isDefault: row.isDefault,
    })),
    stages: stagePages,
    summary: {
      // Open pipeline only: counting won and lost in the funnel total would
      // make the number grow forever instead of describing what is in play.
      openCount: openStages.reduce(
        (total, stage) => total + stage.dealCount,
        0,
      ),
      openValueCents: openStages.reduce(
        (total, stage) => total + stage.totalValueCents,
        0,
      ),
      weightedValueCents: openStages.reduce(
        (total, stage) => total + stage.weightedValueCents,
        0,
      ),
    },
  };
}

export default getDealBoard;
