import { and, asc, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../../database";
import { crmPipelineTable, crmStageTable } from "../../../database/schema";

async function reorderStages({
  workspaceId,
  pipelineId,
  order,
}: {
  workspaceId: string;
  pipelineId: string;
  order: Array<{ id: string; position: number }>;
}) {
  const [pipeline] = await db
    .select({ id: crmPipelineTable.id })
    .from(crmPipelineTable)
    .where(
      and(
        eq(crmPipelineTable.id, pipelineId),
        eq(crmPipelineTable.workspaceId, workspaceId),
      ),
    )
    .limit(1);

  if (!pipeline) {
    throw new HTTPException(404, { message: "Pipeline not found" });
  }

  const stages = await db
    .select({ id: crmStageTable.id, outcome: crmStageTable.outcome })
    .from(crmStageTable)
    .where(eq(crmStageTable.pipelineId, pipelineId));

  const known = new Map(stages.map((stage) => [stage.id, stage]));
  for (const entry of order) {
    if (!known.has(entry.id)) {
      throw new HTTPException(400, {
        message: "Stage does not belong to this pipeline",
      });
    }
  }

  await db.transaction(async (tx) => {
    for (const entry of order) {
      await tx
        .update(crmStageTable)
        .set({ position: entry.position })
        .where(eq(crmStageTable.id, entry.id));
    }
  });

  return db
    .select()
    .from(crmStageTable)
    .where(eq(crmStageTable.pipelineId, pipelineId))
    .orderBy(asc(crmStageTable.position));
}

export default reorderStages;
