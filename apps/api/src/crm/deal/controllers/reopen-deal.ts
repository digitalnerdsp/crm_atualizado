import { and, asc, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../../database";
import { crmDealTable, crmStageTable } from "../../../database/schema";
import moveDealStage from "./move-deal-stage";

/**
 * Reopening is a move back to the first open stage. Going through
 * moveDealStage is what keeps the history and the closing fields consistent.
 */
async function reopenDeal({
  workspaceId,
  dealId,
  stageId,
  changedByUserId,
}: {
  workspaceId: string;
  dealId: string;
  stageId?: string;
  changedByUserId: string;
}) {
  const [deal] = await db
    .select({
      id: crmDealTable.id,
      pipelineId: crmDealTable.pipelineId,
      status: crmDealTable.status,
    })
    .from(crmDealTable)
    .where(
      and(
        eq(crmDealTable.id, dealId),
        eq(crmDealTable.workspaceId, workspaceId),
      ),
    )
    .limit(1);

  if (!deal) {
    throw new HTTPException(404, { message: "Deal not found" });
  }

  if (deal.status === "open") {
    throw new HTTPException(400, { message: "This deal is already open" });
  }

  const stages = await db
    .select({ id: crmStageTable.id, outcome: crmStageTable.outcome })
    .from(crmStageTable)
    .where(eq(crmStageTable.pipelineId, deal.pipelineId))
    .orderBy(asc(crmStageTable.position));

  const target = stageId
    ? stages.find((stage) => stage.id === stageId && stage.outcome === "open")
    : stages.find((stage) => stage.outcome === "open");

  if (!target) {
    throw new HTTPException(400, {
      message: "This pipeline has no open stage to reopen the deal into",
    });
  }

  return moveDealStage({
    workspaceId,
    dealId,
    stageId: target.id,
    changedByUserId,
  });
}

export default reopenDeal;
