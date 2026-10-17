import { and, eq, gte, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../../database";
import { crmPipelineTable, crmStageTable } from "../../../database/schema";
import { slugify, uniqueSlug } from "../../shared/slug";

async function createStage({
  workspaceId,
  pipelineId,
  name,
  probability,
  color,
  rottingDays,
  position,
}: {
  workspaceId: string;
  pipelineId: string;
  name: string;
  probability?: number;
  color?: string;
  rottingDays?: number | null;
  position?: number;
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

  const siblings = await db
    .select({
      slug: crmStageTable.slug,
      position: crmStageTable.position,
      outcome: crmStageTable.outcome,
    })
    .from(crmStageTable)
    .where(eq(crmStageTable.pipelineId, pipelineId));

  // New stages are always open. Won and lost are created with the pipeline and
  // an outcome is never assigned by hand — the board relies on there being
  // exactly one of each.
  const closingPositions = siblings
    .filter((stage) => stage.outcome !== "open")
    .map((stage) => stage.position);

  // Slot it just before Won/Lost, so a new stage lands at the end of the open
  // funnel rather than after the closing pair.
  const defaultPosition =
    closingPositions.length > 0
      ? Math.min(...closingPositions)
      : siblings.reduce(
          (highest, stage) => Math.max(highest, stage.position),
          -1,
        ) + 1;

  const targetPosition = position ?? defaultPosition;

  return db.transaction(async (tx) => {
    await tx
      .update(crmStageTable)
      .set({ position: sql`${crmStageTable.position} + 1` })
      .where(
        and(
          eq(crmStageTable.pipelineId, pipelineId),
          gte(crmStageTable.position, targetPosition),
        ),
      );

    const [created] = await tx
      .insert(crmStageTable)
      .values({
        pipelineId,
        name,
        slug: uniqueSlug(
          slugify(name),
          siblings.map((stage) => stage.slug),
        ),
        position: targetPosition,
        probability: probability ?? 0,
        outcome: "open",
        color: color ?? null,
        rottingDays: rottingDays ?? null,
      })
      .returning();

    if (!created) {
      throw new HTTPException(500, { message: "Failed to create stage" });
    }

    return created;
  });
}

export default createStage;
