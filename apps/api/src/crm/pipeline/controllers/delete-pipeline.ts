import { and, count, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../../database";
import { crmDealTable, crmPipelineTable } from "../../../database/schema";

async function deletePipeline({
  workspaceId,
  pipelineId,
}: {
  workspaceId: string;
  pipelineId: string;
}) {
  const [pipeline] = await db
    .select()
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

  const [deals] = await db
    .select({ total: count() })
    .from(crmDealTable)
    .where(eq(crmDealTable.pipelineId, pipelineId));

  // Deleting cascades to stages and deals, taking their history with them.
  // Archiving is the reversible option, so refuse and point at it.
  if ((deals?.total ?? 0) > 0) {
    throw new HTTPException(400, {
      message:
        "This pipeline still has deals. Move them to another pipeline or archive this one instead.",
    });
  }

  if (pipeline.isDefault) {
    throw new HTTPException(400, {
      message: "Set another pipeline as default before deleting this one",
    });
  }

  await db.delete(crmPipelineTable).where(eq(crmPipelineTable.id, pipelineId));

  return pipeline;
}

export default deletePipeline;
