import { and, eq, ne } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../../database";
import { crmPipelineTable } from "../../../database/schema";

async function updatePipeline({
  workspaceId,
  pipelineId,
  name,
  description,
  isDefault,
  archived,
}: {
  workspaceId: string;
  pipelineId: string;
  name?: string;
  description?: string | null;
  isDefault?: boolean;
  archived?: boolean;
}) {
  const [existing] = await db
    .select()
    .from(crmPipelineTable)
    .where(
      and(
        eq(crmPipelineTable.id, pipelineId),
        eq(crmPipelineTable.workspaceId, workspaceId),
      ),
    )
    .limit(1);

  if (!existing) {
    throw new HTTPException(404, { message: "Pipeline not found" });
  }

  if (archived === true && existing.isDefault) {
    throw new HTTPException(400, {
      message: "Set another pipeline as default before archiving this one",
    });
  }

  return db.transaction(async (tx) => {
    if (isDefault === true) {
      await tx
        .update(crmPipelineTable)
        .set({ isDefault: false })
        .where(
          and(
            eq(crmPipelineTable.workspaceId, workspaceId),
            ne(crmPipelineTable.id, pipelineId),
          ),
        );
    }

    const [updated] = await tx
      .update(crmPipelineTable)
      .set({
        ...(name === undefined ? {} : { name }),
        ...(description === undefined ? {} : { description }),
        // The default flag is never turned off directly: a workspace always has
        // one default pipeline, so it moves by promoting another.
        ...(isDefault === true ? { isDefault: true } : {}),
        ...(archived === undefined
          ? {}
          : { archivedAt: archived ? new Date() : null }),
      })
      .where(eq(crmPipelineTable.id, pipelineId))
      .returning();

    if (!updated) {
      throw new HTTPException(500, { message: "Failed to update pipeline" });
    }

    return updated;
  });
}

export default updatePipeline;
