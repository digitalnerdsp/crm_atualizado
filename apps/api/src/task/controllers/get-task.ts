import { eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import {
  crmCompanyTable,
  taskRecurrenceTable,
  taskTable,
  userTable,
} from "../../database/schema";
import { listTaskAssignees } from "../assignees";
import { listTaskQuality } from "../quality";
import { serializeRecurrence } from "../recurrence";

async function getTask(taskId: string) {
  const task = await db
    .select({
      id: taskTable.id,
      title: taskTable.title,
      number: taskTable.number,
      description: taskTable.description,
      status: taskTable.status,
      priority: taskTable.priority,
      startDate: taskTable.startDate,
      dueDate: taskTable.dueDate,
      position: taskTable.position,
      createdAt: taskTable.createdAt,
      userId: taskTable.userId,
      assigneeName: userTable.name,
      assigneeId: userTable.id,
      projectId: taskTable.projectId,
      recurrenceId: taskTable.recurrenceId,
      recurrence: taskRecurrenceTable,
      crmCompanyId: taskTable.crmCompanyId,
      crmDealId: taskTable.crmDealId,
      // Joined so the client chip has a name to show without a second request.
      crmCompanyName: crmCompanyTable.name,
    })
    .from(taskTable)
    .leftJoin(userTable, eq(taskTable.userId, userTable.id))
    .leftJoin(
      taskRecurrenceTable,
      eq(taskTable.recurrenceId, taskRecurrenceTable.id),
    )
    .leftJoin(crmCompanyTable, eq(taskTable.crmCompanyId, crmCompanyTable.id))
    .where(eq(taskTable.id, taskId))
    .limit(1);

  if (!task.length || !task[0]) {
    throw new HTTPException(404, {
      message: "Task not found",
    });
  }

  const [assigneesByTask, quality] = await Promise.all([
    listTaskAssignees([taskId]),
    listTaskQuality([taskId]),
  ]);

  return {
    ...task[0],
    recurrence: task[0].recurrence
      ? serializeRecurrence(task[0].recurrence)
      : null,
    assignees: assigneesByTask.get(taskId) ?? [],
    customFields: quality.customFieldsByTask.get(taskId) ?? [],
    checklistItems: quality.checklistItemsByTask.get(taskId) ?? [],
  };
}

export default getTask;
