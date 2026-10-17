import { and, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { columnTable, projectTable, taskTable } from "../../database/schema";
import { publishEvent } from "../../events";
import {
  listTaskAssignees,
  normalizeAssigneeIds,
  setTaskAssigneesInTx,
} from "../assignees";
import {
  coercePriority,
  coerceStatus,
  getValidTaskStatuses,
} from "../validate-task-fields";
import getNextTaskNumber from "./get-next-task-number";

export type ImportTask = {
  title: string;
  description?: string;
  status: string;
  priority?: string;
  startDate?: string | null;
  dueDate?: string | null;
  userId?: string | null;
  assigneeIds?: string[];
};

async function importTasks(
  projectId: string,
  tasksToImport: ImportTask[],
  currentUserId?: string,
) {
  const project = await db.query.projectTable.findFirst({
    where: eq(projectTable.id, projectId),
  });

  if (!project) {
    throw new HTTPException(404, {
      message: "Project not found",
    });
  }

  let taskNumber = await getNextTaskNumber(projectId);
  const validStatuses = await getValidTaskStatuses(projectId);

  const results = [];

  for (const taskData of tasksToImport) {
    try {
      const { status, warning: statusWarning } = coerceStatus(
        taskData.status,
        validStatuses,
      );
      const { priority, warning: priorityWarning } = coercePriority(
        taskData.priority || "low",
      );
      const warnings = [statusWarning, priorityWarning].filter(Boolean);

      const column = await db.query.columnTable.findFirst({
        where: and(
          eq(columnTable.projectId, projectId),
          eq(columnTable.slug, status),
        ),
      });

      const assigneeIds = normalizeAssigneeIds(
        taskData.assigneeIds ?? (taskData.userId ? [taskData.userId] : []),
      );

      const createdTask = await db.transaction(async (tx) => {
        const [task] = await tx
          .insert(taskTable)
          .values({
            projectId,
            userId: assigneeIds[0] ?? null,
            title: taskData.title,
            status,
            columnId: column?.id ?? null,
            startDate: taskData.startDate ? new Date(taskData.startDate) : null,
            dueDate: taskData.dueDate ? new Date(taskData.dueDate) : null,
            description: taskData.description || "",
            priority,
            number: ++taskNumber,
          })
          .returning();

        if (task && assigneeIds.length > 0) {
          await setTaskAssigneesInTx({
            tx,
            task,
            workspaceId: project.workspaceId,
            assigneeIds,
            currentUserId: currentUserId ?? "",
            publishEvents: false,
          });
        }

        return task;
      });

      if (createdTask) {
        await publishEvent("task.created", {
          ...createdTask,
          taskId: createdTask.id,
          userId: createdTask.userId ?? "",
          assigneeIds,
          currentUserId: currentUserId ?? "",
          type: "create",
          content: "imported the task",
        });

        const assigneesByTask = await listTaskAssignees([createdTask.id]);

        results.push({
          success: true,
          task: {
            ...createdTask,
            assignees: assigneesByTask.get(createdTask.id) ?? [],
          },
          ...(warnings.length > 0 && { warnings }),
        });
      } else {
        results.push({
          success: false,
          error: "Failed to create task",
          task: taskData,
        });
      }
    } catch (error) {
      if (error instanceof HTTPException) {
        throw error;
      }
      results.push({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        task: taskData,
      });
    }
  }

  return {
    importedAt: new Date().toISOString(),
    project: {
      id: project.id,
      name: project.name,
      slug: project.slug,
    },
    results: {
      total: tasksToImport.length,
      successful: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
      tasks: results,
    },
  };
}

export default importTasks;
