import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import db from "../../../database";
import { crmPipelineTable, crmStageTable } from "../../../database/schema";

async function getPipelines(workspaceId: string, includeArchived = false) {
  const pipelines = await db
    .select()
    .from(crmPipelineTable)
    .where(
      includeArchived
        ? eq(crmPipelineTable.workspaceId, workspaceId)
        : and(
            eq(crmPipelineTable.workspaceId, workspaceId),
            isNull(crmPipelineTable.archivedAt),
          ),
    )
    .orderBy(asc(crmPipelineTable.position));

  if (pipelines.length === 0) return [];

  const stages = await db
    .select()
    .from(crmStageTable)
    .where(
      inArray(
        crmStageTable.pipelineId,
        pipelines.map((pipeline) => pipeline.id),
      ),
    )
    .orderBy(asc(crmStageTable.position));

  const stagesByPipeline = new Map<string, typeof stages>();
  for (const stage of stages) {
    const bucket = stagesByPipeline.get(stage.pipelineId);
    if (bucket) bucket.push(stage);
    else stagesByPipeline.set(stage.pipelineId, [stage]);
  }

  return pipelines.map((pipeline) => ({
    ...pipeline,
    stages: stagesByPipeline.get(pipeline.id) ?? [],
  }));
}

export default getPipelines;
