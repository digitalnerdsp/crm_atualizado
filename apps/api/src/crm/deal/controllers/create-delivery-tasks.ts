import { and, asc, eq, inArray } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../../database";
import {
  columnTable,
  crmDealTable,
  projectTable,
} from "../../../database/schema";
import createTask from "../../../task/controllers/create-task";

export type DeliveryTaskInput = {
  projectId: string;
  title: string;
  status?: string;
  priority?: string;
  assigneeId?: string | null;
  dueDate?: Date | null;
};

/**
 * Turns a won deal into work, one task per line, each in the discipline project
 * the caller picked. Every task carries the client and the deal, so the client
 * view and the per-contract effort report both see it.
 *
 * Everything is validated before the first write: after that the only way a
 * partial batch happens is a database failure, and the response says exactly
 * which tasks were created.
 */
async function createDeliveryTasks({
  workspaceId,
  dealId,
  items,
  currentUserId,
}: {
  workspaceId: string;
  dealId: string;
  items: DeliveryTaskInput[];
  currentUserId: string;
}) {
  if (items.length === 0) {
    throw new HTTPException(400, { message: "No tasks to create" });
  }

  const [deal] = await db
    .select({
      id: crmDealTable.id,
      companyId: crmDealTable.companyId,
    })
    .from(crmDealTable)
    .where(
      and(
        eq(crmDealTable.id, dealId),
        eq(crmDealTable.workspaceId, workspaceId),
      ),
    )
    .limit(1);

  if (!deal) {
    throw new HTTPException(404, { message: "Deal not found" });
  }

  const projectIds = [...new Set(items.map((item) => item.projectId))];
  const projects = await db
    .select({ id: projectTable.id })
    .from(projectTable)
    .where(
      and(
        eq(projectTable.workspaceId, workspaceId),
        inArray(projectTable.id, projectIds),
      ),
    );

  if (projects.length !== projectIds.length) {
    throw new HTTPException(400, {
      message: "One of the projects does not belong to this workspace",
    });
  }

  // The task lands in each project's first column rather than a hardcoded
  // "to-do": discipline projects often rename their columns, and a fixed slug
  // would be rejected by the status validation.
  const firstColumns = await db
    .select({
      projectId: columnTable.projectId,
      slug: columnTable.slug,
      position: columnTable.position,
    })
    .from(columnTable)
    .where(inArray(columnTable.projectId, projectIds))
    .orderBy(asc(columnTable.position));

  const entryColumnByProject = new Map<string, string>();
  for (const column of firstColumns) {
    if (!entryColumnByProject.has(column.projectId)) {
      entryColumnByProject.set(column.projectId, column.slug);
    }
  }

  const created = [];
  for (const item of items) {
    created.push(
      await createTask({
        projectId: item.projectId,
        currentUserId,
        title: item.title,
        status:
          item.status ?? entryColumnByProject.get(item.projectId) ?? "to-do",
        priority: item.priority,
        ...(item.assigneeId ? { assigneeIds: [item.assigneeId] } : {}),
        ...(item.dueDate ? { dueDate: item.dueDate } : {}),
        crmCompanyId: deal.companyId,
        crmDealId: deal.id,
      }),
    );
  }

  return { deal: { id: deal.id, companyId: deal.companyId }, tasks: created };
}

export default createDeliveryTasks;
