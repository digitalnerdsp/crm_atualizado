import { createId } from "@paralleldrive/cuid2";
import { and, eq, inArray } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db, { schema } from "../database";
import { publishEvent } from "../events";

type AssigneeUser = {
  id: string;
  name: string;
  email: string;
  image: string | null;
  avatarColor: string | null;
};

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export function normalizeAssigneeIds(ids?: Array<string | null | undefined>) {
  return [...new Set((ids ?? []).filter((id): id is string => Boolean(id)))];
}

export async function getTaskWorkspaceId(taskId: string) {
  const [row] = await db
    .select({ workspaceId: schema.projectTable.workspaceId })
    .from(schema.taskTable)
    .innerJoin(
      schema.projectTable,
      eq(schema.taskTable.projectId, schema.projectTable.id),
    )
    .where(eq(schema.taskTable.id, taskId))
    .limit(1);

  if (!row) {
    throw new HTTPException(404, { message: "Task not found" });
  }

  return row.workspaceId;
}

export async function validateWorkspaceAssignees(
  workspaceId: string,
  assigneeIds: string[],
) {
  if (!assigneeIds.length) return new Map<string, AssigneeUser>();

  const rows = await db
    .select({
      id: schema.userTable.id,
      name: schema.userTable.name,
      email: schema.userTable.email,
      image: schema.userTable.image,
      avatarColor: schema.userTable.avatarColor,
    })
    .from(schema.workspaceUserTable)
    .innerJoin(
      schema.userTable,
      eq(schema.workspaceUserTable.userId, schema.userTable.id),
    )
    .where(
      and(
        eq(schema.workspaceUserTable.workspaceId, workspaceId),
        inArray(schema.workspaceUserTable.userId, assigneeIds),
      ),
    );

  const usersById = new Map(rows.map((user) => [user.id, user]));
  const missingIds = assigneeIds.filter((id) => !usersById.has(id));

  if (missingIds.length > 0) {
    throw new HTTPException(400, {
      message: "All task assignees must belong to the task workspace.",
    });
  }

  return usersById;
}

export async function listTaskAssignees(taskIds: string[]) {
  if (!taskIds.length) return new Map<string, AssigneeUser[]>();

  const rows = await db
    .select({
      taskId: schema.taskAssigneeTable.taskId,
      id: schema.userTable.id,
      name: schema.userTable.name,
      email: schema.userTable.email,
      image: schema.userTable.image,
      avatarColor: schema.userTable.avatarColor,
      assignedAt: schema.taskAssigneeTable.assignedAt,
    })
    .from(schema.taskAssigneeTable)
    .innerJoin(
      schema.userTable,
      eq(schema.taskAssigneeTable.userId, schema.userTable.id),
    )
    .where(inArray(schema.taskAssigneeTable.taskId, taskIds))
    .orderBy(schema.taskAssigneeTable.assignedAt);

  const assigneesByTask = new Map<string, AssigneeUser[]>();
  for (const row of rows) {
    assigneesByTask.set(row.taskId, [
      ...(assigneesByTask.get(row.taskId) ?? []),
      {
        id: row.id,
        name: row.name,
        email: row.email,
        image: row.image,
        avatarColor: row.avatarColor,
      },
    ]);
  }

  return assigneesByTask;
}

async function syncTaskAssigneesInTx(input: {
  tx: Tx;
  task: {
    id: string;
    title: string;
    projectId: string;
    userId: string | null;
  };
  assigneeIds: string[];
  currentUserId: string;
  usersById: Map<string, AssigneeUser>;
  publishEvents?: boolean;
}) {
  const existingRows = await input.tx
    .select({ userId: schema.taskAssigneeTable.userId })
    .from(schema.taskAssigneeTable)
    .where(eq(schema.taskAssigneeTable.taskId, input.task.id));

  const existingIds = new Set(existingRows.map((row) => row.userId));
  const nextIds = new Set(input.assigneeIds);
  const addedIds = input.assigneeIds.filter((id) => !existingIds.has(id));
  const removedIds = [...existingIds].filter((id) => !nextIds.has(id));

  if (removedIds.length > 0) {
    await input.tx
      .delete(schema.taskAssigneeTable)
      .where(
        and(
          eq(schema.taskAssigneeTable.taskId, input.task.id),
          inArray(schema.taskAssigneeTable.userId, removedIds),
        ),
      );
  }

  if (addedIds.length > 0) {
    await input.tx
      .insert(schema.taskAssigneeTable)
      .values(
        addedIds.map((userId) => ({
          id: createId(),
          taskId: input.task.id,
          userId,
          assignedByUserId: input.currentUserId || null,
          assignedAt: new Date(),
        })),
      )
      .onConflictDoNothing({
        target: [
          schema.taskAssigneeTable.taskId,
          schema.taskAssigneeTable.userId,
        ],
      });
  }

  const primaryAssigneeId = input.assigneeIds[0] ?? null;
  if (input.task.userId !== primaryAssigneeId) {
    await input.tx
      .update(schema.taskTable)
      .set({ userId: primaryAssigneeId })
      .where(eq(schema.taskTable.id, input.task.id));
  }

  if (input.publishEvents) {
    for (const removedId of removedIds) {
      await publishEvent("task.unassigned", {
        taskId: input.task.id,
        projectId: input.task.projectId,
        userId: input.currentUserId,
        oldAssignee: removedId,
        title: input.task.title,
        type: "unassigned",
      });
    }

    for (const addedId of addedIds) {
      const assignee = input.usersById.get(addedId);
      await publishEvent("task.assignee_changed", {
        taskId: input.task.id,
        projectId: input.task.projectId,
        userId: input.currentUserId,
        oldAssignee: null,
        newAssignee: assignee?.name ?? addedId,
        newAssigneeId: addedId,
        title: input.task.title,
        type: "assignee_changed",
      });
    }
  }

  return { addedIds, removedIds, primaryAssigneeId };
}

export async function setTaskAssignees(input: {
  taskId: string;
  assigneeIds: string[];
  currentUserId: string;
  publishEvents?: boolean;
}) {
  const [task] = await db
    .select({
      id: schema.taskTable.id,
      title: schema.taskTable.title,
      projectId: schema.taskTable.projectId,
      userId: schema.taskTable.userId,
      workspaceId: schema.projectTable.workspaceId,
    })
    .from(schema.taskTable)
    .innerJoin(
      schema.projectTable,
      eq(schema.taskTable.projectId, schema.projectTable.id),
    )
    .where(eq(schema.taskTable.id, input.taskId))
    .limit(1);

  if (!task) {
    throw new HTTPException(404, { message: "Task not found" });
  }

  const assigneeIds = normalizeAssigneeIds(input.assigneeIds);
  const usersById = await validateWorkspaceAssignees(
    task.workspaceId,
    assigneeIds,
  );

  await db.transaction(async (tx) => {
    await syncTaskAssigneesInTx({
      tx,
      task,
      assigneeIds,
      currentUserId: input.currentUserId,
      usersById,
      publishEvents: input.publishEvents ?? true,
    });
  });

  return assigneeIds;
}

export async function setTaskAssigneesInTx(input: {
  tx: Tx;
  task: {
    id: string;
    title: string;
    projectId: string;
    userId: string | null;
  };
  workspaceId: string;
  assigneeIds: string[];
  currentUserId: string;
  publishEvents?: boolean;
}) {
  const assigneeIds = normalizeAssigneeIds(input.assigneeIds);
  const usersById = await validateWorkspaceAssignees(
    input.workspaceId,
    assigneeIds,
  );

  return syncTaskAssigneesInTx({
    tx: input.tx,
    task: input.task,
    assigneeIds,
    currentUserId: input.currentUserId,
    usersById,
    publishEvents: input.publishEvents ?? true,
  });
}
