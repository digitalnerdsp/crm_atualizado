import { and, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import {
  crmCompanyTable,
  crmDealTable,
  financeSiteTable,
  financeSiteTaskTable,
  projectTable,
  taskTable,
} from "../../database/schema";
import { publishEvent } from "../../events";

/**
 * Sets which client a task belongs to, and optionally which deal it came from.
 *
 * Projects in this workspace are organised by discipline, so the task is the
 * unit of work that belongs to a client — see plans/crm/006.
 */
async function updateTaskClient({
  id,
  crmCompanyId,
  crmDealId,
  currentUserId,
}: {
  id: string;
  crmCompanyId: string | null;
  crmDealId?: string | null;
  currentUserId: string;
}) {
  const [task] = await db
    .select({
      id: taskTable.id,
      title: taskTable.title,
      projectId: taskTable.projectId,
      workspaceId: projectTable.workspaceId,
      crmCompanyId: taskTable.crmCompanyId,
      crmDealId: taskTable.crmDealId,
    })
    .from(taskTable)
    .innerJoin(projectTable, eq(taskTable.projectId, projectTable.id))
    .where(eq(taskTable.id, id))
    .limit(1);

  if (!task) {
    throw new HTTPException(404, { message: "Task not found" });
  }

  let resolvedCompanyId = crmCompanyId;
  let resolvedDealId = crmDealId ?? null;

  if (resolvedDealId) {
    const [deal] = await db
      .select({
        id: crmDealTable.id,
        companyId: crmDealTable.companyId,
      })
      .from(crmDealTable)
      .where(
        and(
          eq(crmDealTable.id, resolvedDealId),
          eq(crmDealTable.workspaceId, task.workspaceId),
        ),
      )
      .limit(1);

    if (!deal) {
      throw new HTTPException(400, {
        message: "Deal does not belong to this workspace",
      });
    }

    // Picking a deal fills in the client, never the other way round: recurring
    // work exists without an open deal.
    if (!resolvedCompanyId) {
      resolvedCompanyId = deal.companyId;
    }
  }

  if (resolvedCompanyId) {
    const [company] = await db
      .select({ id: crmCompanyTable.id })
      .from(crmCompanyTable)
      .where(
        and(
          eq(crmCompanyTable.id, resolvedCompanyId),
          eq(crmCompanyTable.workspaceId, task.workspaceId),
        ),
      )
      .limit(1);

    if (!company) {
      throw new HTTPException(400, {
        message: "Company does not belong to this workspace",
      });
    }
  } else {
    // A deal without a client on the task would be incoherent.
    resolvedDealId = null;
  }

  const updated = await db.transaction(async (tx) => {
    await tx
      .select({ id: taskTable.id })
      .from(taskTable)
      .where(eq(taskTable.id, id))
      .for("update");
    const [linkedSite] = await tx
      .select({ companyId: financeSiteTable.companyId })
      .from(financeSiteTaskTable)
      .innerJoin(
        financeSiteTable,
        eq(financeSiteTable.id, financeSiteTaskTable.siteId),
      )
      .where(eq(financeSiteTaskTable.taskId, id));
    if (linkedSite && linkedSite.companyId !== resolvedCompanyId)
      throw new HTTPException(409, {
        message:
          "Tarefa vinculada a projeto de site: preserve o cliente e o histórico de horas. Crie outra tarefa para outro cliente.",
      });
    const [updated] = await tx
      .update(taskTable)
      .set({ crmCompanyId: resolvedCompanyId, crmDealId: resolvedDealId })
      .where(eq(taskTable.id, id))
      .returning();

    return updated;
  });

  if (!updated) {
    throw new HTTPException(500, { message: "Failed to update task client" });
  }

  await publishEvent("task.client_changed", {
    taskId: updated.id,
    projectId: updated.projectId,
    userId: currentUserId,
    oldCompanyId: task.crmCompanyId,
    newCompanyId: resolvedCompanyId,
    oldDealId: task.crmDealId,
    newDealId: resolvedDealId,
    title: updated.title,
    type: "client_changed",
  });

  return updated;
}

export default updateTaskClient;
