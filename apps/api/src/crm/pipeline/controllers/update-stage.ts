import { and, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../../database";
import { crmPipelineTable, crmStageTable } from "../../../database/schema";

async function updateStage({
  workspaceId,
  stageId,
  name,
  probability,
  color,
  rottingDays,
}: {
  workspaceId: string;
  stageId: string;
  name?: string;
  probability?: number;
  color?: string | null;
  rottingDays?: number | null;
}) {
  const [stage] = await db
    .select({ id: crmStageTable.id })
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

  if (!stage) {
    throw new HTTPException(404, { message: "Stage not found" });
  }

  // `outcome` is deliberately not updatable: flipping a stage to won or lost
  // would leave the deals already sitting in it with a contradictory status.
  const [updated] = await db
    .update(crmStageTable)
    .set({
      ...(name === undefined ? {} : { name }),
      ...(probability === undefined ? {} : { probability }),
      ...(color === undefined ? {} : { color }),
      ...(rottingDays === undefined ? {} : { rottingDays }),
    })
    .where(eq(crmStageTable.id, stageId))
    .returning();

  if (!updated) {
    throw new HTTPException(500, { message: "Failed to update stage" });
  }

  return updated;
}

export default updateStage;
