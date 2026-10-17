import { and, count, desc, eq, inArray, max, type SQL, sql } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { describeRoute, resolver, validator } from "hono-openapi";
import * as v from "valibot";
import db, { schema } from "../database";
import { publishEvent } from "../events";
import {
  listTaskAssignees,
  normalizeAssigneeIds,
  setTaskAssignees,
} from "../task/assignees";
import {
  assertValidPriority,
  assertValidTaskStatus,
} from "../task/validate-task-fields";
import { requireRow, toIsoString } from "./admin-utils";
import { requireAdminPermission } from "./require-admin-permission";

const adminTaskSchema = v.object({
  id: v.string(),
  title: v.string(),
  description: v.nullish(v.string()),
  number: v.nullish(v.number()),
  status: v.string(),
  priority: v.nullish(v.string()),
  startDate: v.nullish(v.string()),
  dueDate: v.nullish(v.string()),
  createdAt: v.string(),
  updatedAt: v.string(),
  projectId: v.string(),
  projectName: v.string(),
  workspaceId: v.string(),
  workspaceName: v.string(),
  assignees: v.array(
    v.object({
      id: v.string(),
      name: v.string(),
      email: v.string(),
      image: v.nullish(v.string()),
    }),
  ),
  auditEventCount: v.number(),
  lastAuditAt: v.nullish(v.string()),
});

const listTasksQuerySchema = v.object({
  q: v.optional(v.pipe(v.string(), v.trim())),
  workspaceId: v.optional(v.string()),
  projectId: v.optional(v.string()),
  status: v.optional(v.string()),
  priority: v.optional(v.string()),
  assigneeId: v.optional(v.string()),
  overdue: v.optional(v.picklist(["true", "false"])),
  limit: v.optional(v.pipe(v.string(), v.regex(/^\d+$/))),
});

const updateTaskSchema = v.object({
  title: v.optional(v.pipe(v.string(), v.trim(), v.minLength(1))),
  description: v.optional(v.nullable(v.pipe(v.string(), v.trim()))),
  status: v.optional(v.pipe(v.string(), v.trim(), v.minLength(1))),
  priority: v.optional(v.pipe(v.string(), v.trim(), v.minLength(1))),
  startDate: v.optional(v.nullable(v.string())),
  dueDate: v.optional(v.nullable(v.string())),
  assigneeIds: v.optional(v.array(v.string())),
});

const bulkTaskSchema = v.object({
  taskIds: v.pipe(v.array(v.string()), v.minLength(1)),
  operation: v.picklist([
    "updateStatus",
    "updatePriority",
    "updateDueDate",
    "updateAssignee",
    "addAssignees",
    "removeAssignees",
    "delete",
  ]),
  value: v.optional(v.nullable(v.string())),
  assigneeIds: v.optional(v.array(v.string())),
});

function parseDateInput(value?: string | null) {
  if (value === undefined) return undefined;
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new HTTPException(400, { message: "Invalid date value." });
  }

  return date;
}

function taskSearchCondition(pattern: string) {
  return sql`(
    ${schema.taskTable.title} ilike ${pattern}
    or ${schema.taskTable.description} ilike ${pattern}
    or ${schema.projectTable.name} ilike ${pattern}
    or ${schema.workspaceTable.name} ilike ${pattern}
  )`;
}

async function getTaskOrThrow(taskId: string) {
  const [task] = await db
    .select({
      id: schema.taskTable.id,
      title: schema.taskTable.title,
      description: schema.taskTable.description,
      status: schema.taskTable.status,
      priority: schema.taskTable.priority,
      startDate: schema.taskTable.startDate,
      dueDate: schema.taskTable.dueDate,
      projectId: schema.taskTable.projectId,
      userId: schema.taskTable.userId,
      workspaceId: schema.projectTable.workspaceId,
    })
    .from(schema.taskTable)
    .innerJoin(
      schema.projectTable,
      eq(schema.taskTable.projectId, schema.projectTable.id),
    )
    .where(eq(schema.taskTable.id, taskId))
    .limit(1);

  return requireRow(task, "Task not found.");
}

async function buildTasksQuery(input: {
  q?: string;
  workspaceId?: string;
  projectId?: string;
  status?: string;
  priority?: string;
  assigneeId?: string;
  overdue?: "true" | "false";
  limit?: string;
  taskIds?: string[];
}) {
  const filters: SQL[] = [];

  if (input.taskIds?.length) {
    filters.push(inArray(schema.taskTable.id, input.taskIds));
  }

  if (input.workspaceId) {
    filters.push(eq(schema.projectTable.workspaceId, input.workspaceId));
  }

  if (input.projectId) {
    filters.push(eq(schema.taskTable.projectId, input.projectId));
  }

  if (input.status) {
    filters.push(eq(schema.taskTable.status, input.status));
  }

  if (input.priority) {
    filters.push(eq(schema.taskTable.priority, input.priority));
  }

  if (input.q) {
    filters.push(taskSearchCondition(`%${input.q}%`));
  }

  if (input.assigneeId) {
    filters.push(sql`exists (
      select 1
      from ${schema.taskAssigneeTable}
      where ${schema.taskAssigneeTable.taskId} = ${schema.taskTable.id}
        and ${schema.taskAssigneeTable.userId} = ${input.assigneeId}
    )`);
  }

  if (input.overdue === "true") {
    filters.push(sql`
      ${schema.taskTable.dueDate} < now()
      and ${schema.taskTable.status} not in ('done', 'archived')
    `);
  }

  if (input.overdue === "false") {
    filters.push(sql`(
      ${schema.taskTable.dueDate} is null
      or ${schema.taskTable.dueDate} >= now()
      or ${schema.taskTable.status} in ('done', 'archived')
    )`);
  }

  const limit = Math.min(Number(input.limit ?? 100), 200);
  const rows = await db
    .select({
      id: schema.taskTable.id,
      title: schema.taskTable.title,
      description: schema.taskTable.description,
      number: schema.taskTable.number,
      status: schema.taskTable.status,
      priority: schema.taskTable.priority,
      startDate: schema.taskTable.startDate,
      dueDate: schema.taskTable.dueDate,
      createdAt: schema.taskTable.createdAt,
      updatedAt: schema.taskTable.updatedAt,
      projectId: schema.taskTable.projectId,
      projectName: schema.projectTable.name,
      workspaceId: schema.projectTable.workspaceId,
      workspaceName: schema.workspaceTable.name,
    })
    .from(schema.taskTable)
    .innerJoin(
      schema.projectTable,
      eq(schema.taskTable.projectId, schema.projectTable.id),
    )
    .innerJoin(
      schema.workspaceTable,
      eq(schema.projectTable.workspaceId, schema.workspaceTable.id),
    )
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(schema.taskTable.updatedAt))
    .limit(limit);

  if (!rows.length) return [];

  const taskIds = rows.map((task) => task.id);
  const [assigneesByTask, activityRows] = await Promise.all([
    listTaskAssignees(taskIds),
    db
      .select({
        taskId: schema.activityTable.taskId,
        value: count(),
        lastAuditAt: max(schema.activityTable.createdAt),
      })
      .from(schema.activityTable)
      .where(inArray(schema.activityTable.taskId, taskIds))
      .groupBy(schema.activityTable.taskId),
  ]);

  const activityMap = new Map(
    activityRows.map((row) => [
      row.taskId,
      {
        value: Number(row.value),
        lastAuditAt: row.lastAuditAt,
      },
    ]),
  );

  return rows.map((task) => ({
    id: task.id,
    title: task.title,
    description: task.description,
    number: task.number,
    status: task.status,
    priority: task.priority,
    startDate: toIsoString(task.startDate),
    dueDate: toIsoString(task.dueDate),
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
    projectId: task.projectId,
    projectName: task.projectName,
    workspaceId: task.workspaceId,
    workspaceName: task.workspaceName,
    assignees: assigneesByTask.get(task.id) ?? [],
    auditEventCount: activityMap.get(task.id)?.value ?? 0,
    lastAuditAt: toIsoString(activityMap.get(task.id)?.lastAuditAt),
  }));
}

async function taskSummary(taskId: string) {
  const [task] = await buildTasksQuery({ taskIds: [taskId] });
  return requireRow(task, "Task not found.");
}

async function resolveColumn(projectId: string, status: string) {
  await assertValidTaskStatus(status, projectId);
  return db.query.columnTable.findFirst({
    where: and(
      eq(schema.columnTable.projectId, projectId),
      eq(schema.columnTable.slug, status),
    ),
  });
}

async function emitAdminTaskUpdateEvents(input: {
  taskId: string;
  projectId: string;
  currentUserId: string;
  title: string;
  previous: {
    title: string;
    status: string;
    priority: string | null;
    dueDate: Date | null;
  };
  next: {
    title: string;
    status: string;
    priority: string | null;
    dueDate: Date | null;
  };
}) {
  if (input.previous.title !== input.next.title) {
    await publishEvent("task.title_changed", {
      taskId: input.taskId,
      projectId: input.projectId,
      userId: input.currentUserId,
      oldTitle: input.previous.title,
      newTitle: input.next.title,
      title: input.next.title,
      type: "title_changed",
    });
  }

  if (input.previous.status !== input.next.status) {
    await publishEvent("task.status_changed", {
      taskId: input.taskId,
      projectId: input.projectId,
      userId: input.currentUserId,
      oldStatus: input.previous.status,
      newStatus: input.next.status,
      title: input.title,
      type: "status_changed",
    });
  }

  if (input.previous.priority !== input.next.priority) {
    await publishEvent("task.priority_changed", {
      taskId: input.taskId,
      projectId: input.projectId,
      userId: input.currentUserId,
      oldPriority: input.previous.priority ?? "no-priority",
      newPriority: input.next.priority ?? "no-priority",
      title: input.title,
      type: "priority_changed",
    });
  }

  if (input.previous.dueDate?.getTime() !== input.next.dueDate?.getTime()) {
    await publishEvent("task.due_date_changed", {
      taskId: input.taskId,
      projectId: input.projectId,
      userId: input.currentUserId,
      oldDueDate: input.previous.dueDate,
      newDueDate: input.next.dueDate,
      title: input.title,
      type: "due_date_changed",
    });
  }
}

async function updateTaskByAdmin(input: {
  taskId: string;
  currentUserId: string;
  title?: string;
  description?: string | null;
  status?: string;
  priority?: string;
  startDate?: Date | null;
  dueDate?: Date | null;
  assigneeIds?: string[];
}) {
  const existing = await getTaskOrThrow(input.taskId);
  const nextStatus = input.status ?? existing.status;
  const nextPriority = input.priority ?? existing.priority ?? "no-priority";

  assertValidPriority(nextPriority);
  const column = await resolveColumn(existing.projectId, nextStatus);

  const [updatedTask] = await db
    .update(schema.taskTable)
    .set({
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.description !== undefined
        ? { description: input.description || null }
        : {}),
      ...(input.status !== undefined
        ? { status: nextStatus, columnId: column?.id ?? null }
        : {}),
      ...(input.priority !== undefined ? { priority: nextPriority } : {}),
      ...(input.startDate !== undefined ? { startDate: input.startDate } : {}),
      ...(input.dueDate !== undefined ? { dueDate: input.dueDate } : {}),
    })
    .where(eq(schema.taskTable.id, input.taskId))
    .returning();

  if (!updatedTask) {
    throw new HTTPException(500, { message: "Failed to update task." });
  }

  if (input.assigneeIds !== undefined) {
    await setTaskAssignees({
      taskId: updatedTask.id,
      assigneeIds: input.assigneeIds,
      currentUserId: input.currentUserId,
    });
  }

  await emitAdminTaskUpdateEvents({
    taskId: updatedTask.id,
    projectId: updatedTask.projectId,
    currentUserId: input.currentUserId,
    title: updatedTask.title,
    previous: {
      title: existing.title,
      status: existing.status,
      priority: existing.priority,
      dueDate: existing.dueDate,
    },
    next: {
      title: updatedTask.title,
      status: updatedTask.status,
      priority: updatedTask.priority,
      dueDate: updatedTask.dueDate,
    },
  });

  return taskSummary(updatedTask.id);
}

async function bulkUpdateTasksByAdmin(input: {
  taskIds: string[];
  operation:
    | "updateStatus"
    | "updatePriority"
    | "updateDueDate"
    | "updateAssignee"
    | "addAssignees"
    | "removeAssignees"
    | "delete";
  value?: string | null;
  assigneeIds?: string[];
  currentUserId: string;
}) {
  const tasks = await db
    .select({
      id: schema.taskTable.id,
      title: schema.taskTable.title,
      status: schema.taskTable.status,
      priority: schema.taskTable.priority,
      dueDate: schema.taskTable.dueDate,
      projectId: schema.taskTable.projectId,
    })
    .from(schema.taskTable)
    .where(inArray(schema.taskTable.id, input.taskIds));

  if (!tasks.length) {
    throw new HTTPException(404, { message: "No tasks found." });
  }

  if (input.operation === "delete") {
    await db.delete(schema.taskTable).where(
      inArray(
        schema.taskTable.id,
        tasks.map((task) => task.id),
      ),
    );

    return { updatedCount: tasks.length };
  }

  for (const task of tasks) {
    if (input.operation === "updateStatus") {
      if (!input.value) {
        throw new HTTPException(400, { message: "Status value is required." });
      }
      await updateTaskByAdmin({
        taskId: task.id,
        currentUserId: input.currentUserId,
        status: input.value,
      });
    }

    if (input.operation === "updatePriority") {
      if (!input.value) {
        throw new HTTPException(400, {
          message: "Priority value is required.",
        });
      }
      await updateTaskByAdmin({
        taskId: task.id,
        currentUserId: input.currentUserId,
        priority: input.value,
      });
    }

    if (input.operation === "updateDueDate") {
      await updateTaskByAdmin({
        taskId: task.id,
        currentUserId: input.currentUserId,
        dueDate: parseDateInput(input.value ?? null),
      });
    }

    if (input.operation === "updateAssignee") {
      await setTaskAssignees({
        taskId: task.id,
        assigneeIds: normalizeAssigneeIds(input.assigneeIds ?? []),
        currentUserId: input.currentUserId,
      });
    }

    if (input.operation === "addAssignees") {
      const assigneesByTask = await listTaskAssignees([task.id]);
      await setTaskAssignees({
        taskId: task.id,
        assigneeIds: normalizeAssigneeIds([
          ...(assigneesByTask.get(task.id)?.map((assignee) => assignee.id) ??
            []),
          ...(input.assigneeIds ?? []),
        ]),
        currentUserId: input.currentUserId,
      });
    }

    if (input.operation === "removeAssignees") {
      const idsToRemove = new Set(
        normalizeAssigneeIds(input.assigneeIds ?? []),
      );
      const assigneesByTask = await listTaskAssignees([task.id]);
      await setTaskAssignees({
        taskId: task.id,
        assigneeIds:
          assigneesByTask
            .get(task.id)
            ?.map((assignee) => assignee.id)
            .filter((id) => !idsToRemove.has(id)) ?? [],
        currentUserId: input.currentUserId,
      });
    }
  }

  return { updatedCount: tasks.length };
}

const tasks = new Hono<{
  Variables: {
    userId: string;
    adminRole?: string;
    adminPermissions?: string[];
  };
}>()
  .get(
    "/",
    describeRoute({
      operationId: "listAdminTasks",
      tags: ["Admin"],
      description:
        "List all tasks with workspace, project, assignee and audit context.",
      responses: {
        200: {
          description: "Administrative task list",
          content: {
            "application/json": {
              schema: resolver(v.object({ tasks: v.array(adminTaskSchema) })),
            },
          },
        },
      },
    }),
    validator("query", listTasksQuerySchema),
    requireAdminPermission("admin.tasks.view"),
    async (c) => c.json({ tasks: await buildTasksQuery(c.req.valid("query")) }),
  )
  .patch(
    "/bulk",
    validator("json", bulkTaskSchema),
    requireAdminPermission("admin.tasks.update"),
    async (c) => {
      const input = c.req.valid("json");
      const currentUserId = c.get("userId");

      const result = await bulkUpdateTasksByAdmin({
        taskIds: input.taskIds,
        operation: input.operation,
        value: input.value,
        assigneeIds: input.assigneeIds,
        currentUserId,
      });

      return c.json({ ok: true, ...result });
    },
  )
  .patch(
    "/:taskId",
    validator("json", updateTaskSchema),
    requireAdminPermission("admin.tasks.update"),
    async (c) => {
      const input = c.req.valid("json");
      const taskId = c.req.param("taskId");

      const task = await updateTaskByAdmin({
        taskId,
        currentUserId: c.get("userId"),
        title: input.title,
        description: input.description,
        status: input.status,
        priority: input.priority,
        startDate: parseDateInput(input.startDate),
        dueDate: parseDateInput(input.dueDate),
        assigneeIds: input.assigneeIds,
      });

      return c.json({ task });
    },
  )
  .delete(
    "/:taskId",
    requireAdminPermission("admin.tasks.delete"),
    async (c) => {
      const task = await getTaskOrThrow(c.req.param("taskId"));

      await db.delete(schema.taskTable).where(eq(schema.taskTable.id, task.id));

      return c.json({ ok: true });
    },
  );

export default tasks;
