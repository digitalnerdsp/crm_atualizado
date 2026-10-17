import { asc, count, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../../database";
import { crmPipelineTable, crmStageTable } from "../../../database/schema";
import { publishEvent } from "../../../events";
import { slugify, uniqueSlug } from "../../shared/slug";

/**
 * Nomes em português, como as origens semeadas: é o idioma de quem usa, e
 * ainda não há tela para renomear etapa — um funil "Qualification / Discovery"
 * ficaria em inglês para sempre. Os slugs seguem em inglês porque são
 * identificador, não rótulo.
 *
 * A probabilidade sobe ao longo do funil e alimenta o forecast ponderado; o
 * par de fechamento é o que marca ganho ou perda e não pode ser excluído.
 */
export const DEFAULT_PIPELINE_STAGES = [
  {
    name: "Qualificação",
    slug: "qualification",
    probability: 10,
    outcome: "open",
    color: "#64748B",
    rottingDays: 14,
  },
  {
    name: "Descoberta",
    slug: "discovery",
    probability: 25,
    outcome: "open",
    color: "#3B82F6",
    rottingDays: 14,
  },
  {
    name: "Proposta",
    slug: "proposal",
    probability: 50,
    outcome: "open",
    color: "#8B5CF6",
    rottingDays: 10,
  },
  {
    name: "Negociação",
    slug: "negotiation",
    probability: 75,
    outcome: "open",
    color: "#EAB308",
    rottingDays: 7,
  },
  {
    name: "Ganho",
    slug: "won",
    probability: 100,
    outcome: "won",
    color: "#22C55E",
  },
  {
    name: "Perdido",
    slug: "lost",
    probability: 0,
    outcome: "lost",
    color: "#EF4444",
  },
] as const;

async function createPipeline({
  workspaceId,
  name,
  description,
  isDefault,
}: {
  workspaceId: string;
  name: string;
  description?: string;
  isDefault?: boolean;
}) {
  const existing = await db
    .select({
      id: crmPipelineTable.id,
      slug: crmPipelineTable.slug,
      position: crmPipelineTable.position,
    })
    .from(crmPipelineTable)
    .where(eq(crmPipelineTable.workspaceId, workspaceId))
    .orderBy(asc(crmPipelineTable.position));

  // The first pipeline in a workspace is the default whether or not the caller
  // asked for it — otherwise the board has nothing to open.
  const shouldBeDefault = isDefault === true || existing.length === 0;

  const pipeline = await db.transaction(async (tx) => {
    if (shouldBeDefault && existing.length > 0) {
      await tx
        .update(crmPipelineTable)
        .set({ isDefault: false })
        .where(eq(crmPipelineTable.workspaceId, workspaceId));
    }

    const [created] = await tx
      .insert(crmPipelineTable)
      .values({
        workspaceId,
        name,
        slug: uniqueSlug(
          slugify(name),
          existing.map((row) => row.slug),
        ),
        description: description ?? null,
        isDefault: shouldBeDefault,
        position: existing.length,
      })
      .returning();

    if (!created) {
      throw new HTTPException(500, { message: "Failed to create pipeline" });
    }

    await tx.insert(crmStageTable).values(
      DEFAULT_PIPELINE_STAGES.map((stage, position) => ({
        pipelineId: created.id,
        name: stage.name,
        slug: stage.slug,
        position,
        probability: stage.probability,
        outcome: stage.outcome,
        color: stage.color,
        rottingDays: "rottingDays" in stage ? stage.rottingDays : null,
      })),
    );

    return created;
  });

  await publishEvent("crm.pipeline.created", {
    pipelineId: pipeline.id,
    workspaceId,
  });

  return pipeline;
}

export default createPipeline;

/** O `db` ou uma transação aberta. */
type Executor = Pick<typeof db, "select" | "insert">;

/** Nome do funil semeado. É o que o board abre em todo workspace novo. */
export const DEFAULT_PIPELINE_NAME = "Funil de vendas";

/**
 * Cria o funil padrão quando o workspace não tem nenhum. Sem ele o board abre
 * em "Nenhum funil configurado" e não há tela para sair disso — que é como
 * todo workspace novo nascia até esta versão.
 */
export async function seedDefaultPipeline(
  workspaceId: string,
  executor: Executor = db,
) {
  const [existing] = await executor
    .select({ total: count() })
    .from(crmPipelineTable)
    .where(eq(crmPipelineTable.workspaceId, workspaceId));

  if ((existing?.total ?? 0) > 0) return null;

  const [pipeline] = await executor
    .insert(crmPipelineTable)
    .values({
      workspaceId,
      name: DEFAULT_PIPELINE_NAME,
      slug: slugify(DEFAULT_PIPELINE_NAME),
      isDefault: true,
      position: 0,
    })
    .returning();

  if (!pipeline) return null;

  await executor.insert(crmStageTable).values(
    DEFAULT_PIPELINE_STAGES.map((stage, position) => ({
      pipelineId: pipeline.id,
      name: stage.name,
      slug: stage.slug,
      position,
      probability: stage.probability,
      outcome: stage.outcome,
      color: stage.color,
      rottingDays: "rottingDays" in stage ? stage.rottingDays : null,
    })),
  );

  return pipeline;
}
