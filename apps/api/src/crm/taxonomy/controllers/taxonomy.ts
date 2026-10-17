import { and, asc, eq, max } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../../database";
import {
  type CrmSourceChannel,
  crmSegmentTable,
  crmSourceTable,
} from "../../../database/schema";
import { DEFAULT_CRM_SOURCES } from "../../shared/client-profile";
import { isUniqueViolation } from "../../shared/unique-violation";

/* Origem e segmento têm o mesmo ciclo de vida das razões de perda: listas do
 * workspace que se desativam em vez de sumir, porque cada linha é referenciada
 * pelos clientes classificados com ela. */

export async function getSources(workspaceId: string, includeInactive = false) {
  const rows = await db
    .select()
    .from(crmSourceTable)
    .where(eq(crmSourceTable.workspaceId, workspaceId))
    .orderBy(asc(crmSourceTable.position), asc(crmSourceTable.name));

  return includeInactive ? rows : rows.filter((row) => row.isActive);
}

export async function getSegments(
  workspaceId: string,
  includeInactive = false,
) {
  const rows = await db
    .select()
    .from(crmSegmentTable)
    .where(eq(crmSegmentTable.workspaceId, workspaceId))
    .orderBy(asc(crmSegmentTable.position), asc(crmSegmentTable.name));

  return includeInactive ? rows : rows.filter((row) => row.isActive);
}

export async function createSource({
  workspaceId,
  name,
  channel,
}: {
  workspaceId: string;
  name: string;
  channel: CrmSourceChannel;
}) {
  const [current] = await db
    .select({ maxPosition: max(crmSourceTable.position) })
    .from(crmSourceTable)
    .where(eq(crmSourceTable.workspaceId, workspaceId));

  try {
    const [created] = await db
      .insert(crmSourceTable)
      .values({
        workspaceId,
        name,
        channel,
        position: (current?.maxPosition ?? -1) + 1,
      })
      .returning();

    if (!created) {
      throw new HTTPException(500, { message: "Failed to create source" });
    }

    return created;
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new HTTPException(409, {
        message: "A source with this name already exists",
      });
    }
    throw error;
  }
}

export async function createSegment({
  workspaceId,
  name,
}: {
  workspaceId: string;
  name: string;
}) {
  const [current] = await db
    .select({ maxPosition: max(crmSegmentTable.position) })
    .from(crmSegmentTable)
    .where(eq(crmSegmentTable.workspaceId, workspaceId));

  try {
    const [created] = await db
      .insert(crmSegmentTable)
      .values({
        workspaceId,
        name,
        position: (current?.maxPosition ?? -1) + 1,
      })
      .returning();

    if (!created) {
      throw new HTTPException(500, { message: "Failed to create segment" });
    }

    return created;
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new HTTPException(409, {
        message: "A segment with this name already exists",
      });
    }
    throw error;
  }
}

export async function updateSource({
  workspaceId,
  sourceId,
  name,
  channel,
  position,
  isActive,
}: {
  workspaceId: string;
  sourceId: string;
  name?: string;
  channel?: CrmSourceChannel;
  position?: number;
  isActive?: boolean;
}) {
  try {
    const [updated] = await db
      .update(crmSourceTable)
      .set({
        ...(name === undefined ? {} : { name }),
        ...(channel === undefined ? {} : { channel }),
        ...(position === undefined ? {} : { position }),
        ...(isActive === undefined ? {} : { isActive }),
      })
      .where(
        and(
          eq(crmSourceTable.id, sourceId),
          eq(crmSourceTable.workspaceId, workspaceId),
        ),
      )
      .returning();

    if (!updated) {
      throw new HTTPException(404, { message: "Source not found" });
    }

    return updated;
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new HTTPException(409, {
        message: "A source with this name already exists",
      });
    }
    throw error;
  }
}

export async function updateSegment({
  workspaceId,
  segmentId,
  name,
  position,
  isActive,
}: {
  workspaceId: string;
  segmentId: string;
  name?: string;
  position?: number;
  isActive?: boolean;
}) {
  try {
    const [updated] = await db
      .update(crmSegmentTable)
      .set({
        ...(name === undefined ? {} : { name }),
        ...(position === undefined ? {} : { position }),
        ...(isActive === undefined ? {} : { isActive }),
      })
      .where(
        and(
          eq(crmSegmentTable.id, segmentId),
          eq(crmSegmentTable.workspaceId, workspaceId),
        ),
      )
      .returning();

    if (!updated) {
      throw new HTTPException(404, { message: "Segment not found" });
    }

    return updated;
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new HTTPException(409, {
        message: "A segment with this name already exists",
      });
    }
    throw error;
  }
}

/** O `db` ou uma transação aberta: quem cria o workspace numa transação
 * semeia as origens dentro dela, junto dos papéis. */
type Executor = Pick<typeof db, "select" | "insert">;

/**
 * Semeia as origens padrão do workspace. Idempotente por nome, para poder
 * rodar de novo quando a criação do workspace é repetida.

 * Chamada por `seedCrmDefaults`, que roda nos três caminhos que criam
 * workspace.
 */
export async function seedDefaultSources(
  workspaceId: string,
  executor: Executor = db,
) {
  const existing = await executor
    .select({ name: crmSourceTable.name })
    .from(crmSourceTable)
    .where(eq(crmSourceTable.workspaceId, workspaceId));

  const taken = new Set(existing.map((row) => row.name));
  const rows = DEFAULT_CRM_SOURCES.filter(
    (source) => !taken.has(source.name),
  ).map((source, index) => ({
    workspaceId,
    name: source.name,
    channel: source.channel,
    position: index,
  }));

  if (rows.length === 0) return [];

  return executor.insert(crmSourceTable).values(rows).returning();
}
