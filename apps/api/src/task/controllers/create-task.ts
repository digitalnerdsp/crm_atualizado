import { and, eq, max } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import {
  columnTable,
  projectTable,
  taskTable,
  userTable,
} from "../../database/schema";
import { publishEvent } from "../../events";
import {
  listTaskAssignees,
  normalizeAssigneeIds,
  setTaskAssigneesInTx,
} from "../assignees";
import { assertValidTaskStatus } from "../validate-task-fields";
import getNextTaskNumber from "./get-next-task-number";

async function createTask({
  projectId,
  currentUserId,
  userId,
  assigneeIds,
  title,
  status,
  startDate,
  dueDate,
  description,
  priority,
  recurrenceId,
  crmCompanyId,
  crmDealId,
}: {
  projectId: string;
  currentUserId: string;
  userId?: string;
  assigneeIds?: string[];
  title: string;
  status: string;
  startDate?: Date;
  dueDate?: Date;
  description?: string;
  priority?: string;
  recurrenceId?: string;
  crmCompanyId?: string | null;
  crmDealId?: string | null;
}) {
  const resolvedStatus = status || "to-do";
  const resolvedPriority = priority || "no-priority";
  const normalizedAssigneeIds = normalizeAssigneeIds(
    assigneeIds ?? (userId ? [userId] : []),
  );
  const primaryAssigneeId = normalizedAssigneeIds[0] ?? null;

  await assertValidTaskStatus(resolvedStatus, projectId);

  const [assignee] = await db
    .select({ name: userTable.name })
    .from(userTable)
    .where(eq(userTable.id, primaryAssigneeId ?? ""));

  const nextTaskNumber = await getNextTaskNumber(projectId);

  const column = await db.query.columnTable.findFirst({
    where: and(
      eq(columnTable.projectId, projectId),
      eq(columnTable.slug, resolvedStatus),
    ),
  });

  const [maxPositionResult] = await db
    .select({ maxPosition: max(taskTable.position) })
    .from(taskTable)
    .where(
      and(
        eq(taskTable.projectId, projectId),
        column?.id
          ? eq(taskTable.columnId, column.id)
          : eq(taskTable.status, resolvedStatus),
      ),
    );

  const nextPosition = (maxPositionResult?.maxPosition ?? 0) + 1;

  const createdTask = await db.transaction(async (tx) => {
    const [task] = await tx
      .insert(taskTable)
      .values({
        projectId,
        userId: primaryAssigneeId,
        title: title || "",
        status: resolvedStatus,
        columnId: column?.id ?? null,
        startDate: startDate || null,
        dueDate: dueDate || null,
        description: description || "",
        priority: resolvedPriority,
        recurrenceId: recurrenceId ?? null,
        crmCompanyId: crmCompanyId ?? null,
        crmDealId: crmDealId ?? null,
        number: nextTaskNumber + 1,
        position: nextPosition,
      })
      .returning();

    if (!task) {
      throw new HTTPException(500, {
        message: "Failed to create task",
      });
    }

    if (normalizedAssigneeIds.length > 0) {
      const [project] = await tx
        .select({ workspaceId: projectTable.workspaceId })
        .from(projectTable)
        .where(eq(projectTable.id, projectId))
        .limit(1);

      if (project) {
        await setTaskAssigneesInTx({
          tx,
          task,
          workspaceId: project.workspaceId,
          assigneeIds: normalizedAssigneeIds,
          currentUserId,
          publishEvents: false,
        });
      }
    }

    return task;
  });

  if (!createdTask) {
    throw new HTTPException(500, {
      message: "Failed to create task",
    });
  }

  await publishEvent("task.created", {
    ...createdTask,
    taskId: createdTask.id,
    userId: createdTask.userId ?? "",
    assigneeIds: normalizedAssigneeIds,
    currentUserId: currentUserId,
    type: "created",
    content: null,
  });

  const assigneesByTask = await listTaskAssignees([createdTask.id]);

  return {
    ...createdTask,
    assigneeName: assignee?.name,
    assignees: assigneesByTask.get(createdTask.id) ?? [],
  };
}

export default createTask;
