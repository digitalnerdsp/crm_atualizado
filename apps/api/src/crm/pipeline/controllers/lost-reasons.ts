import { and, asc, count, eq, max } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../../database";
import { crmLostReasonTable } from "../../../database/schema";
import { isUniqueViolation } from "../../shared/unique-violation";

export async function getLostReasons(
  workspaceId: string,
  includeInactive = false,
) {
  const rows = await db
    .select()
    .from(crmLostReasonTable)
    .where(eq(crmLostReasonTable.workspaceId, workspaceId))
    .orderBy(asc(crmLostReasonTable.position));

  return includeInactive ? rows : rows.filter((row) => row.isActive);
}

export async function createLostReason({
  workspaceId,
  name,
}: {
  workspaceId: string;
  name: string;
}) {
  const [current] = await db
    .select({ maxPosition: max(crmLostReasonTable.position) })
    .from(crmLostReasonTable)
    .where(eq(crmLostReasonTable.workspaceId, workspaceId));

  try {
    const [created] = await db
      .insert(crmLostReasonTable)
      .values({
        workspaceId,
        name,
        position: (current?.maxPosition ?? -1) + 1,
      })
      .returning();

    if (!created) {
      throw new HTTPException(500, {
        message: "Failed to create lost reason",
      });
    }

    return created;
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new HTTPException(409, {
        message: "A lost reason with this name already exists",
      });
    }
    throw error;
  }
}

export async function updateLostReason({
  workspaceId,
  lostReasonId,
  name,
  position,
  isActive,
}: {
  workspaceId: string;
  lostReasonId: string;
  name?: string;
  position?: number;
  isActive?: boolean;
}) {
  const [updated] = await db
    .update(crmLostReasonTable)
    .set({
      ...(name === undefined ? {} : { name }),
      ...(position === undefined ? {} : { position }),
      ...(isActive === undefined ? {} : { isActive }),
    })
    .where(
      and(
        eq(crmLostReasonTable.id, lostReasonId),
        eq(crmLostReasonTable.workspaceId, workspaceId),
      ),
    )
    .returning();

  if (!updated) {
    throw new HTTPException(404, { message: "Lost reason not found" });
  }

  return updated;
}

/**
 * Deactivates instead of deleting: the reason is referenced by every deal lost
 * for it, and the loss-reason report exists precisely to read that history.
 */
export async function deactivateLostReason({
  workspaceId,
  lostReasonId,
}: {
  workspaceId: string;
  lostReasonId: string;
}) {
  return updateLostReason({ workspaceId, lostReasonId, isActive: false });
}

/** O `db` ou uma transação aberta. */
type Executor = Pick<typeof db, "select" | "insert">;

/**
 * Marcar um negócio como perdido exige uma razão, então um workspace sem
 * nenhuma não consegue perder negócio — e perda sem motivo registrado é o dado
 * que o relatório de perdas existe para ler.
 */
export const DEFAULT_LOST_REASONS = [
  "Preço",
  "Escolheu um concorrente",
  "Sem orçamento",
  "Adiou a decisão",
  "Parou de responder",
  "Fora do perfil",
  "Outro",
] as const;

export async function seedDefaultLostReasons(
  workspaceId: string,
  executor: Executor = db,
) {
  const [existing] = await executor
    .select({ total: count() })
    .from(crmLostReasonTable)
    .where(eq(crmLostReasonTable.workspaceId, workspaceId));

  if ((existing?.total ?? 0) > 0) return [];

  return executor
    .insert(crmLostReasonTable)
    .values(
      DEFAULT_LOST_REASONS.map((name, position) => ({
        workspaceId,
        name,
        position,
      })),
    )
    .returning();
}
