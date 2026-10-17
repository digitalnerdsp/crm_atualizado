import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import { mockAnonymousSession, mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import {
  createProjectFixture,
  createWorkspaceMember,
} from "./helpers/fixtures";

async function createUserInWorkspace(workspaceId: string, name: string) {
  const userId = `user-${randomUUID()}`;

  const [user] = await db
    .insert(schema.userTable)
    .values({
      id: userId,
      email: `${userId}@example.com`,
      emailVerified: true,
      name,
    })
    .returning();

  await db.insert(schema.workspaceUserTable).values({
    workspaceId,
    userId: user.id,
    role: "member",
    joinedAt: new Date(),
  });

  return user;
}

describe("API integration: task creation", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  it("rejects unauthenticated task creation requests", async () => {
    const member = await createWorkspaceMember();
    const { project } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });

    mockAnonymousSession();
    const { app } = createApp();

    const response = await app.request(`/api/task/${project.id}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        title: "Unauthorized task",
        description: "Should not be created",
        priority: "low",
        status: "to-do",
      }),
    });

    expect(response.status).toBe(401);
    await expect(response.text()).resolves.toBe("Unauthorized");
  });

  it("creates a task with the matching column, assignee, and next number", async () => {
    const member = await createWorkspaceMember();
    const { project, columns } = await createProjectFixture({
      workspaceId: member.workspace.id,
      name: "Delivery",
      slug: "delivery",
    });

    await db.insert(schema.taskTable).values({
      projectId: project.id,
      userId: member.user.id,
      title: "Existing task",
      description: "Already there",
      status: "to-do",
      columnId: columns.todo.id,
      priority: "medium",
      number: 1,
      position: 1,
    });

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const response = await app.request(`/api/task/${project.id}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        title: "Ship integration flow",
        description: "Cover the first create-task path",
        priority: "high",
        status: "to-do",
        userId: member.user.id,
      }),
    });

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      id: string;
      projectId: string;
      title: string;
      description: string;
      priority: string;
      status: string;
      userId: string | null;
      number: number | null;
      position: number | null;
      assigneeName?: string;
    };

    expect(payload).toMatchObject({
      projectId: project.id,
      title: "Ship integration flow",
      description: "Cover the first create-task path",
      priority: "high",
      status: "to-do",
      userId: member.user.id,
      number: 2,
      position: 2,
      assigneeName: member.user.name,
    });

    const persistedTask = await db.query.taskTable.findFirst({
      where: eq(schema.taskTable.id, payload.id),
    });

    expect(persistedTask).toMatchObject({
      id: payload.id,
      projectId: project.id,
      columnId: columns.todo.id,
      userId: member.user.id,
      title: "Ship integration flow",
      priority: "high",
      status: "to-do",
      number: 2,
      position: 2,
    });
  });

  it("creates a task with multiple assignees while keeping the primary assignee in sync", async () => {
    const member = await createWorkspaceMember();
    const secondAssignee = await createUserInWorkspace(
      member.workspace.id,
      "Second Assignee",
    );
    const { project, columns } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const response = await app.request(`/api/task/${project.id}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        title: "Pair on rollout",
        description: "Two people own this delivery",
        priority: "high",
        status: "to-do",
        assigneeIds: [member.user.id, secondAssignee.id, member.user.id],
      }),
    });

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      id: string;
      userId: string | null;
      assignees: Array<{ id: string; name: string }>;
    };

    expect(payload.userId).toBe(member.user.id);
    expect(payload.assignees.map((assignee) => assignee.id)).toEqual([
      member.user.id,
      secondAssignee.id,
    ]);

    const persistedTask = await db.query.taskTable.findFirst({
      where: eq(schema.taskTable.id, payload.id),
    });
    const assigneeRows = await db
      .select({
        taskId: schema.taskAssigneeTable.taskId,
        userId: schema.taskAssigneeTable.userId,
        assignedByUserId: schema.taskAssigneeTable.assignedByUserId,
      })
      .from(schema.taskAssigneeTable)
      .where(eq(schema.taskAssigneeTable.taskId, payload.id))
      .orderBy(schema.taskAssigneeTable.assignedAt);

    expect(persistedTask).toMatchObject({
      id: payload.id,
      columnId: columns.todo.id,
      userId: member.user.id,
    });
    expect(assigneeRows).toEqual([
      {
        taskId: payload.id,
        userId: member.user.id,
        assignedByUserId: member.user.id,
      },
      {
        taskId: payload.id,
        userId: secondAssignee.id,
        assignedByUserId: member.user.id,
      },
    ]);
  });

  it("filters listed tasks by any assignee linked to the task", async () => {
    const member = await createWorkspaceMember();
    const secondAssignee = await createUserInWorkspace(
      member.workspace.id,
      "Filter Assignee",
    );
    const { project } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const createResponse = await app.request(`/api/task/${project.id}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        title: "Visible through second owner",
        description: "The filter must use task_assignee",
        priority: "medium",
        status: "to-do",
        assigneeIds: [member.user.id, secondAssignee.id],
      }),
    });
    expect(createResponse.status).toBe(200);
    const created = (await createResponse.json()) as { id: string };

    const response = await app.request(
      `/api/task/tasks/${project.id}?assigneeId=${secondAssignee.id}`,
    );

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      data: {
        columns: Array<{
          tasks: Array<{
            id: string;
            assignees: Array<{ id: string }>;
          }>;
        }>;
      };
    };
    const tasks = payload.data.columns.flatMap((column) => column.tasks);

    expect(tasks.map((task) => task.id)).toContain(created.id);
    expect(tasks[0]?.assignees.map((assignee) => assignee.id)).toEqual([
      member.user.id,
      secondAssignee.id,
    ]);
  });

  it("replaces task assignees through the assignee endpoint", async () => {
    const member = await createWorkspaceMember({ role: "admin" });
    const secondAssignee = await createUserInWorkspace(
      member.workspace.id,
      "Replacement Assignee",
    );
    const thirdAssignee = await createUserInWorkspace(
      member.workspace.id,
      "Third Assignee",
    );
    const { project } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const createResponse = await app.request(`/api/task/${project.id}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        title: "Reassign as a group",
        description: "Initial owner will be replaced",
        priority: "medium",
        status: "to-do",
        assigneeIds: [member.user.id],
      }),
    });
    expect(createResponse.status).toBe(200);
    const created = (await createResponse.json()) as { id: string };

    const response = await app.request(`/api/task/assignee/${created.id}`, {
      method: "PUT",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        assigneeIds: [secondAssignee.id, thirdAssignee.id],
      }),
    });

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      userId: string | null;
      assignees: Array<{ id: string }>;
    };
    expect(payload.userId).toBe(secondAssignee.id);
    expect(payload.assignees.map((assignee) => assignee.id)).toEqual([
      secondAssignee.id,
      thirdAssignee.id,
    ]);

    const assigneeRows = await db
      .select({ userId: schema.taskAssigneeTable.userId })
      .from(schema.taskAssigneeTable)
      .where(eq(schema.taskAssigneeTable.taskId, created.id))
      .orderBy(schema.taskAssigneeTable.assignedAt);

    expect(assigneeRows.map((row) => row.userId)).toEqual([
      secondAssignee.id,
      thirdAssignee.id,
    ]);
  });

  it("rejects assignees that are outside the task workspace", async () => {
    const member = await createWorkspaceMember();
    const outsider = await createWorkspaceMember({
      userName: "Outside Workspace",
    });
    const { project } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const response = await app.request(`/api/task/${project.id}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        title: "Invalid owner",
        description: "Must be rejected",
        priority: "low",
        status: "to-do",
        assigneeIds: [outsider.user.id],
      }),
    });

    expect(response.status).toBe(400);
    await expect(response.text()).resolves.toBe(
      "All task assignees must belong to the task workspace.",
    );
  });

  it("rejects task creation for users outside the project workspace", async () => {
    const member = await createWorkspaceMember();
    const outsiderId = `user-${randomUUID()}`;
    const { project } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });

    const [outsider] = await db
      .insert(schema.userTable)
      .values({
        id: outsiderId,
        email: `${outsiderId}@example.com`,
        emailVerified: true,
        name: "Task Outsider",
      })
      .returning();

    mockAuthenticatedSession(outsider);
    const { app } = createApp();

    const response = await app.request(`/api/task/${project.id}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        title: "Forbidden task",
        description: "Should not be created",
        priority: "low",
        status: "to-do",
      }),
    });

    expect(response.status).toBe(403);
    await expect(response.text()).resolves.toBe(
      "You don't have access to this workspace",
    );

    const persistedTask = await db.query.taskTable.findFirst({
      where: and(
        eq(schema.taskTable.projectId, project.id),
        eq(schema.taskTable.title, "Forbidden task"),
      ),
    });

    expect(persistedTask).toBeUndefined();
  });

  it("creates an unassigned task with parsed dates when optional fields are provided", async () => {
    const member = await createWorkspaceMember();
    const { project, columns } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const response = await app.request(`/api/task/${project.id}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        title: "Plan release cut",
        description: "Track optional fields too",
        priority: "medium",
        status: "in-progress",
        startDate: "2026-04-01T09:00:00.000Z",
        dueDate: "2026-04-05T17:00:00.000Z",
      }),
    });

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      id: string;
      userId: string | null;
      columnId: string | null;
      startDate: string | null;
      dueDate: string | null;
      assigneeName?: string;
    };

    expect(payload).toMatchObject({
      userId: null,
      columnId: columns.inProgress.id,
      startDate: "2026-04-01T09:00:00.000Z",
      dueDate: "2026-04-05T17:00:00.000Z",
    });
    expect(payload.assigneeName).toBeUndefined();

    const persistedTask = await db.query.taskTable.findFirst({
      where: eq(schema.taskTable.id, payload.id),
    });

    expect(persistedTask).toMatchObject({
      id: payload.id,
      userId: null,
      columnId: columns.inProgress.id,
      status: "in-progress",
    });
    expect(persistedTask?.startDate?.toISOString()).toBe(
      "2026-04-01T09:00:00.000Z",
    );
    expect(persistedTask?.dueDate?.toISOString()).toBe(
      "2026-04-05T17:00:00.000Z",
    );
  });

  it("creates tasks without a column when the status has no matching project column", async () => {
    const member = await createWorkspaceMember();
    const { project } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const response = await app.request(`/api/task/${project.id}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        title: "Future status task",
        description: "Status does not map to a seeded column",
        priority: "low",
        status: "planned",
      }),
    });

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      id: string;
      status: string;
      columnId: string | null;
      position: number | null;
    };

    expect(payload).toMatchObject({
      status: "planned",
      columnId: null,
      position: 1,
    });

    const persistedTask = await db.query.taskTable.findFirst({
      where: eq(schema.taskTable.id, payload.id),
    });

    expect(persistedTask).toMatchObject({
      id: payload.id,
      status: "planned",
      columnId: null,
      position: 1,
    });
  });
});
