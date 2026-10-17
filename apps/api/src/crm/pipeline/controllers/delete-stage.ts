import { and, count, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../../database";
import {
  crmDealTable,
  crmPipelineTable,
  crmStageTable,
} from "../../../database/schema";

async function deleteStage({
  workspaceId,
  stageId,
}: {
  workspaceId: string;
  stageId: string;
}) {
  const [row] = await db
    .select({
      id: crmStageTable.id,
      outcome: crmStageTable.outcome,
      pipelineId: crmStageTable.pipelineId,
    })
    .from(crmStageTable)
    .innerJoin(
      crmPipelineTable,
      eq(crmStageTable.pipelineId, crmPipelineTable.id),
    )
    .where(
      and(
        eq(crmStageTable.id, stageId),
        eq(crmPipelineTable.workspaceId, workspaceId),
      ),
    )
    .limit(1);

  if (!row) {
    throw new HTTPException(404, { message: "Stage not found" });
  }

  if (row.outcome !== "open") {
    throw new HTTPException(400, {
      message: "The won and lost stages cannot be deleted",
    });
  }

  const [deals] = await db
    .select({ total: count() })
    .from(crmDealTable)
    .where(eq(crmDealTable.stageId, stageId));

  // `crm_deal.stage_id` is ON DELETE RESTRICT, so the database would reject
  // this anyway. Failing here says why.
  if ((deals?.total ?? 0) > 0) {
    throw new HTTPException(400, {
      message: "Move the deals out of this stage before deleting it",
    });
  }

  await db.delete(crmStageTable).where(eq(crmStageTable.id, stageId));

  return row;
}

export default deleteStage;
