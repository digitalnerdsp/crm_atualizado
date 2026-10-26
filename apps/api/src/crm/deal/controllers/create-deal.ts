import { and, asc, eq, max } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../../database";
import {
  crmDealTable,
  crmPipelineTable,
  crmStageHistoryTable,
  crmStageTable,
} from "../../../database/schema";
import { publishEvent } from "../../../events";
import { markCompanyActive } from "../../shared/company-lifecycle";
import { withNextDealNumber } from "../../shared/deal-number";

async function resolvePipelineAndStage({
  workspaceId,
  pipelineId,
  stageId,
}: {
  workspaceId: string;
  pipelineId?: string;
  stageId?: string;
}) {
  const pipelines = await db
    .select({
      id: crmPipelineTable.id,
      isDefault: crmPipelineTable.isDefault,
    })
    .from(crmPipelineTable)
    .where(eq(crmPipelineTable.workspaceId, workspaceId))
    .orderBy(asc(crmPipelineTable.position));

  const pipeline = pipelineId
    ? pipelines.find((row) => row.id === pipelineId)
    : (pipelines.find((row) => row.isDefault) ?? pipelines[0]);

  if (!pipeline) {
    throw new HTTPException(400, {
      message: "This workspace has no pipeline yet",
    });
  }

  const stages = await db
    .select({
      id: crmStageTable.id,
      outcome: crmStageTable.outcome,
      position: crmStageTable.position,
    })
    .from(crmStageTable)
    .where(eq(crmStageTable.pipelineId, pipeline.id))
    .orderBy(asc(crmStageTable.position));

  const stage = stageId
    ? stages.find((row) => row.id === stageId)
    : stages.find((row) => row.outcome === "open");

  if (!stage) {
    throw new HTTPException(400, {
      message: "Stage does not belong to this pipeline",
    });
  }

  return { pipelineId: pipeline.id, stage };
}

async function createDeal({
  workspaceId,
  createdByUserId,
  title,
  pipelineId,
  stageId,
  companyId,
  primaryContactId,
  ownerUserId,
  valueCents,
  currency,
  probability,
  expectedCloseDate,
  sourceId,
}: {
  workspaceId: string;
  createdByUserId: string;
  title: string;
  pipelineId?: string;
  stageId?: string;
  companyId?: string | null;
  primaryContactId?: string | null;
  ownerUserId?: string | null;
  valueCents?: number;
  currency?: string;
  probability?: number | null;
  expectedCloseDate?: Date | null;
  sourceId?: string | null;
}) {
  const resolved = await resolvePipelineAndStage({
    workspaceId,
    pipelineId,
    stageId,
  });

  const [lastPosition] = await db
    .select({ maxPosition: max(crmDealTable.position) })
    .from(crmDealTable)
    .where(
      and(
        eq(crmDealTable.workspaceId, workspaceId),
        eq(crmDealTable.stageId, resolved.stage.id),
      ),
    );

  if (resolved.stage.outcome === "won" && !companyId) {
    throw new HTTPException(400, {
      message: "Vincule uma empresa antes de registrar a venda.",
    });
  }

  const now = new Date();
  // A deal created straight into the won or lost stage is closed on arrival.
  const status =
    resolved.stage.outcome === "open" ? "open" : resolved.stage.outcome;

  const deal = await withNextDealNumber(workspaceId, (dealNumber) =>
    db.transaction(async (tx) => {
      const [created] = await tx
        .insert(crmDealTable)
        .values({
          workspaceId,
          number: dealNumber,
          pipelineId: resolved.pipelineId,
          stageId: resolved.stage.id,
          title,
          companyId: companyId ?? null,
          primaryContactId: primaryContactId ?? null,
          // Unassigned deals go stale unnoticed, so the creator owns it by
          // default and can hand it over afterwards.
          ownerUserId: ownerUserId ?? createdByUserId,
          createdByUserId,
          valueCents: valueCents ?? 0,
          currency: currency ?? "BRL",
          probability: probability ?? null,
          expectedCloseDate: expectedCloseDate ?? null,
          status,
          wonAt: status === "won" ? now : null,
          lostAt: status === "lost" ? now : null,
          sourceId: sourceId ?? null,
          position: (lastPosition?.maxPosition ?? -1) + 1,
          stageEnteredAt: now,
        })
        .returning();

      if (!created) {
        throw new HTTPException(500, { message: "Failed to create deal" });
      }

      // Opens the first history row. Without it the deal's first stage would
      // be missing from every funnel report.
      await tx.insert(crmStageHistoryTable).values({
        dealId: created.id,
        fromStageId: null,
        toStageId: created.stageId,
        changedByUserId: createdByUserId,
        enteredAt: now,
      });

      // Negócio criado já na etapa de ganho também faz do cliente ativo.
      if (status === "won" && created.companyId) {
        await markCompanyActive(tx, created.companyId, now);
      }

      return created;
    }),
  );

  await publishEvent("crm.deal.created", {
    dealId: deal.id,
    workspaceId,
    pipelineId: deal.pipelineId,
    stageId: deal.stageId,
    ownerUserId: deal.ownerUserId,
    title: deal.title,
    valueCents: deal.valueCents,
    currency: deal.currency,
  });

  return deal;
}

export default createDeal;
