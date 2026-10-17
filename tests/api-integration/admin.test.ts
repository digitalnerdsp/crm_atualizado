import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { count, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import { mockAnonymousSession, mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import {
  createProjectFixture,
  createWorkspaceMember,
} from "./helpers/fixtures";

async function createUserWithRole(role: string | null) {
  const [user] = await db
    .insert(schema.userTable)
    .values({
      id: `user-${randomUUID()}`,
      name: "Admin Test User",
      email: `admin-${randomUUID()}@example.com`,
      emailVerified: true,
      role,
    })
    .returning();

  return user;
}

function jsonRequest(method: string, json?: unknown) {
  return {
    method,
    headers: { "Content-Type": "application/json" },
    body: json === undefined ? undefined : JSON.stringify(json),
  };
}

async function waitForTaskActivityCount(taskId: string, minimum: number) {
  let value = 0;

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const [row] = await db
      .select({ value: count() })
      .from(schema.activityTable)
      .where(eq(schema.activityTable.taskId, taskId));
    value = row?.value ?? 0;
    if (value >= minimum) return value;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }

  return value;
}

describe("API integration: admin authorization", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  it("requires authentication for admin endpoints", async () => {
    mockAnonymousSession();
    const { app } = createApp();

    const response = await app.request("/api/admin/me");

    expect(response.status).toBe(401);
  });

  it("rejects regular users from admin endpoints", async () => {
    const user = await createUserWithRole("user");
    mockAuthenticatedSession(user);
    const { app } = createApp();

    const response = await app.request("/api/admin/me");

    expect(response.status).toBe(403);
  });

  it("returns scoped permissions for admin users", async () => {
    const user = await createUserWithRole("admin");
    mockAuthenticatedSession(user);
    const { app } = createApp();

    const response = await app.request("/api/admin/me");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      role: "admin",
      permissions: expect.arrayContaining([
        "admin.access",
        "admin.overview.view",
        "admin.users.view",
      ]),
    });
  });

  it("returns overview metrics for superadmins", async () => {
    const user = await createUserWithRole("superadmin");
    mockAuthenticatedSession(user);
    const { app } = createApp();

    const response = await app.request("/api/admin/overview");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      users: 1,
      activeUsers: 1,
      blockedUsers: 0,
      admins: 1,
      workspaces: 0,
      projects: 0,
      tasks: 0,
      roles: expect.arrayContaining([
        expect.objectContaining({ role: "superadmin" }),
        expect.objectContaining({ role: "admin" }),
        expect.objectContaining({ role: "user" }),
      ]),
    });
  });

  it("lists users with administrative metrics", async () => {
    const adminUser = await createUserWithRole("superadmin");
    const regularUser = await createUserWithRole("user");
    const now = new Date();
    const workspaceId = `workspace-${randomUUID()}`;
    const projectId = `project-${randomUUID()}`;

    await db.insert(schema.workspaceTable).values({
      id: workspaceId,
      name: "Admin Workspace",
      slug: `admin-workspace-${randomUUID()}`,
      createdAt: now,
    });
    await db.insert(schema.workspaceUserTable).values({
      id: `workspace-member-${randomUUID()}`,
      workspaceId,
      userId: regularUser.id,
      role: "member",
      joinedAt: now,
    });
    await db.insert(schema.projectTable).values({
      id: projectId,
      workspaceId,
      slug: `project-${randomUUID()}`,
      name: "Admin Project",
      createdAt: now,
    });
    const taskId = `task-${randomUUID()}`;
    await db.insert(schema.taskTable).values({
      id: taskId,
      projectId,
      userId: regularUser.id,
      title: "Open task",
      status: "to-do",
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(schema.taskAssigneeTable).values({
      id: `task-assignee-${randomUUID()}`,
      taskId,
      userId: regularUser.id,
      assignedAt: now,
    });
    await db.insert(schema.sessionTable).values({
      id: `session-${randomUUID()}`,
      token: `token-${randomUUID()}`,
      userId: regularUser.id,
      expiresAt: new Date(Date.now() + 60_000),
      createdAt: now,
      updatedAt: now,
    });

    mockAuthenticatedSession(adminUser);
    const { app } = createApp();

    const response = await app.request(
      `/api/admin/users?q=${regularUser.email}&status=all`,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      users: [
        expect.objectContaining({
          id: regularUser.id,
          role: "user",
          workspaceCount: 1,
          projectCount: 1,
          taskCount: 1,
          openTaskCount: 1,
          activeSessionCount: 1,
        }),
      ],
    });
  });

  it("allows superadmins to create and update users", async () => {
    const adminUser = await createUserWithRole("superadmin");
    mockAuthenticatedSession(adminUser);
    const { app } = createApp();

    const createResponse = await app.request(
      "/api/admin/users",
      jsonRequest("POST", {
        name: "Created User",
        email: "created@example.com",
        password: "password123",
        role: "user",
        emailVerified: true,
      }),
    );

    expect(createResponse.status).toBe(200);
    const createdBody = await createResponse.json();
    expect(createdBody.user).toMatchObject({
      name: "Created User",
      email: "created@example.com",
      role: "user",
      emailVerified: true,
    });

    const updateResponse = await app.request(
      `/api/admin/users/${createdBody.user.id}`,
      jsonRequest("PATCH", {
        name: "Updated User",
        emailVerified: false,
        role: "admin",
        banned: true,
      }),
    );

    expect(updateResponse.status).toBe(200);
    await expect(updateResponse.json()).resolves.toMatchObject({
      user: {
        id: createdBody.user.id,
        name: "Updated User",
        role: "admin",
        emailVerified: false,
        banned: true,
        status: "blocked",
      },
    });
  });

  it("rejects admin user creation without create permission", async () => {
    const user = await createUserWithRole("admin");
    mockAuthenticatedSession(user);
    const { app } = createApp();

    const response = await app.request(
      "/api/admin/users",
      jsonRequest("POST", {
        name: "Denied User",
        email: "denied@example.com",
        password: "password123",
      }),
    );

    expect(response.status).toBe(403);
  });

  it("prevents lockout of the last superadmin", async () => {
    const adminUser = await createUserWithRole("superadmin");
    mockAuthenticatedSession(adminUser);
    const { app } = createApp();

    const demoteResponse = await app.request(
      `/api/admin/users/${adminUser.id}`,
      jsonRequest("PATCH", { role: "user" }),
    );
    expect(demoteResponse.status).toBe(409);

    const blockResponse = await app.request(
      `/api/admin/users/${adminUser.id}`,
      jsonRequest("PATCH", { banned: true }),
    );
    expect(blockResponse.status).toBe(409);
  });

  it("resets passwords and revokes sessions", async () => {
    const adminUser = await createUserWithRole("superadmin");
    const targetUser = await createUserWithRole("user");
    const now = new Date();

    await db.insert(schema.sessionTable).values({
      id: `session-${randomUUID()}`,
      token: `token-${randomUUID()}`,
      userId: targetUser.id,
      expiresAt: new Date(Date.now() + 60_000),
      createdAt: now,
      updatedAt: now,
    });

    mockAuthenticatedSession(adminUser);
    const { app } = createApp();

    const resetResponse = await app.request(
      `/api/admin/users/${targetUser.id}/reset-password`,
      jsonRequest("POST", { password: "newPassword123" }),
    );
    expect(resetResponse.status).toBe(200);

    const [account] = await db
      .select({ password: schema.accountTable.password })
      .from(schema.accountTable)
      .where(eq(schema.accountTable.userId, targetUser.id))
      .limit(1);
    expect(account?.password).toBeTruthy();
    await expect(
      bcrypt.compare("newPassword123", account?.password ?? ""),
    ).resolves.toBe(true);

    await db.insert(schema.sessionTable).values({
      id: `session-${randomUUID()}`,
      token: `token-${randomUUID()}`,
      userId: targetUser.id,
      expiresAt: new Date(Date.now() + 60_000),
      createdAt: now,
      updatedAt: now,
    });

    const revokeResponse = await app.request(
      `/api/admin/users/${targetUser.id}/revoke-sessions`,
      jsonRequest("POST"),
    );
    expect(revokeResponse.status).toBe(200);

    const [sessionCount] = await db
      .select({ value: count() })
      .from(schema.sessionTable)
      .where(eq(schema.sessionTable.userId, targetUser.id));
    expect(sessionCount?.value).toBe(0);
  });

  it("deletes users only after confirmation and without operational records", async () => {
    const adminUser = await createUserWithRole("superadmin");
    const targetUser = await createUserWithRole("user");
    mockAuthenticatedSession(adminUser);
    const { app } = createApp();

    const mismatchResponse = await app.request(
      `/api/admin/users/${targetUser.id}`,
      jsonRequest("DELETE", { confirmEmail: "wrong@example.com" }),
    );
    expect(mismatchResponse.status).toBe(400);

    const deleteResponse = await app.request(
      `/api/admin/users/${targetUser.id}`,
      jsonRequest("DELETE", { confirmEmail: targetUser.email }),
    );
    expect(deleteResponse.status).toBe(200);

    const [remaining] = await db
      .select({ value: count() })
      .from(schema.userTable)
      .where(eq(schema.userTable.id, targetUser.id));
    expect(remaining?.value).toBe(0);
  });

  it("blocks deletion when a user has operational records", async () => {
    const adminUser = await createUserWithRole("superadmin");
    const targetUser = await createUserWithRole("user");
    const now = new Date();
    const workspaceId = `workspace-${randomUUID()}`;

    await db.insert(schema.workspaceTable).values({
      id: workspaceId,
      name: "Linked Workspace",
      slug: `linked-workspace-${randomUUID()}`,
      createdAt: now,
    });
    await db.insert(schema.workspaceUserTable).values({
      id: `workspace-member-${randomUUID()}`,
      workspaceId,
      userId: targetUser.id,
      role: "member",
      joinedAt: now,
    });

    mockAuthenticatedSession(adminUser);
    const { app } = createApp();

    const response = await app.request(
      `/api/admin/users/${targetUser.id}`,
      jsonRequest("DELETE", { confirmEmail: targetUser.email }),
    );

    expect(response.status).toBe(409);
  });

  it("manages workspaces globally with archive, restore, and deletion confirmation", async () => {
    const adminUser = await createUserWithRole("superadmin");
    mockAuthenticatedSession(adminUser);
    const { app } = createApp();

    const createResponse = await app.request(
      "/api/admin/workspaces",
      jsonRequest("POST", {
        name: "Operations Workspace",
        description: "Global operations",
      }),
    );

    expect(createResponse.status).toBe(200);
    const createdBody = await createResponse.json();
    expect(createdBody.workspace).toMatchObject({
      name: "Operations Workspace",
      slug: "operations-workspace",
      owner: expect.objectContaining({ id: adminUser.id }),
      memberCount: 1,
    });

    const roles = await db
      .select({ role: schema.workspaceRoleTable.role })
      .from(schema.workspaceRoleTable)
      .where(
        eq(schema.workspaceRoleTable.workspaceId, createdBody.workspace.id),
      );
    expect(roles.map((row) => row.role)).toEqual(
      expect.arrayContaining(["admin", "member", "viewer"]),
    );

    const archiveResponse = await app.request(
      `/api/admin/workspaces/${createdBody.workspace.id}/archive`,
      jsonRequest("POST"),
    );
    expect(archiveResponse.status).toBe(200);
    await expect(archiveResponse.json()).resolves.toMatchObject({
      workspace: { archivedAt: expect.any(String) },
    });

    const restoreResponse = await app.request(
      `/api/admin/workspaces/${createdBody.workspace.id}/restore`,
      jsonRequest("POST"),
    );
    expect(restoreResponse.status).toBe(200);
    await expect(restoreResponse.json()).resolves.toMatchObject({
      workspace: { archivedAt: null },
    });

    const mismatchDelete = await app.request(
      `/api/admin/workspaces/${createdBody.workspace.id}`,
      jsonRequest("DELETE", { confirmSlug: "wrong-slug" }),
    );
    expect(mismatchDelete.status).toBe(400);

    const deleteResponse = await app.request(
      `/api/admin/workspaces/${createdBody.workspace.id}`,
      jsonRequest("DELETE", { confirmSlug: createdBody.workspace.slug }),
    );
    expect(deleteResponse.status).toBe(200);
  });

  it("manages workspace members and protects the last owner", async () => {
    const adminUser = await createUserWithRole("superadmin");
    const memberUser = await createUserWithRole("user");
    mockAuthenticatedSession(adminUser);
    const { app } = createApp();

    const createResponse = await app.request(
      "/api/admin/workspaces",
      jsonRequest("POST", { name: "Members Workspace" }),
    );
    const { workspace } = await createResponse.json();

    const removeOwnerResponse = await app.request(
      `/api/admin/workspaces/${workspace.id}/members/${adminUser.id}`,
      jsonRequest("DELETE"),
    );
    expect(removeOwnerResponse.status).toBe(409);

    const addResponse = await app.request(
      `/api/admin/workspaces/${workspace.id}/members`,
      jsonRequest("POST", { userId: memberUser.id, role: "owner" }),
    );
    expect(addResponse.status).toBe(200);
    await expect(addResponse.json()).resolves.toMatchObject({
      workspace: { owner: expect.objectContaining({ id: memberUser.id }) },
    });

    const membersResponse = await app.request(
      `/api/admin/workspaces/${workspace.id}/members`,
    );
    expect(membersResponse.status).toBe(200);
    await expect(membersResponse.json()).resolves.toMatchObject({
      members: expect.arrayContaining([
        expect.objectContaining({ userId: memberUser.id, role: "owner" }),
        expect.objectContaining({ userId: adminUser.id, role: "admin" }),
      ]),
    });

    const updateResponse = await app.request(
      `/api/admin/workspaces/${workspace.id}/members/${memberUser.id}`,
      jsonRequest("PATCH", { userId: memberUser.id, role: "admin" }),
    );
    expect(updateResponse.status).toBe(409);
  });

  it("assigns the commercial roles, and refuses one the workspace does not have", async () => {
    const adminUser = await createUserWithRole("superadmin");
    const seller = await createUserWithRole("user");
    mockAuthenticatedSession(adminUser);
    const { app } = createApp();

    const { workspace } = await (
      await app.request(
        "/api/admin/workspaces",
        jsonRequest("POST", { name: "Comercial" }),
      )
    ).json();

    // `sales` e `sales_manager` são semeados junto do workspace; antes disto o
    // painel só oferecia owner/admin/member/viewer e eles eram inatribuíveis.
    const added = await app.request(
      `/api/admin/workspaces/${workspace.id}/members`,
      jsonRequest("POST", { userId: seller.id, role: "sales" }),
    );
    expect(added.status).toBe(200);

    const promoted = await app.request(
      `/api/admin/workspaces/${workspace.id}/members/${seller.id}`,
      jsonRequest("PATCH", { userId: seller.id, role: "sales_manager" }),
    );
    expect(promoted.status).toBe(200);

    const members = await (
      await app.request(`/api/admin/workspaces/${workspace.id}/members`)
    ).json();
    expect(members.members).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ userId: seller.id, role: "sales_manager" }),
      ]),
    );

    const unknown = await app.request(
      `/api/admin/workspaces/${workspace.id}/members/${seller.id}`,
      jsonRequest("PATCH", { userId: seller.id, role: "diretor" }),
    );
    expect(unknown.status).toBe(400);
  });

  it("manages projects globally with move, archive, duplicate, and task cleanup", async () => {
    const adminUser = await createUserWithRole("superadmin");
    mockAuthenticatedSession(adminUser);
    const { app } = createApp();

    const firstWorkspaceResponse = await app.request(
      "/api/admin/workspaces",
      jsonRequest("POST", { name: "Source Workspace" }),
    );
    const secondWorkspaceResponse = await app.request(
      "/api/admin/workspaces",
      jsonRequest("POST", { name: "Target Workspace" }),
    );
    const firstWorkspace = (await firstWorkspaceResponse.json()).workspace;
    const secondWorkspace = (await secondWorkspaceResponse.json()).workspace;

    const createResponse = await app.request(
      "/api/admin/projects",
      jsonRequest("POST", {
        workspaceId: firstWorkspace.id,
        name: "Admin Project",
        ownerUserId: adminUser.id,
      }),
    );
    expect(createResponse.status).toBe(200);
    const project = (await createResponse.json()).project;
    expect(project).toMatchObject({
      workspaceId: firstWorkspace.id,
      owner: expect.objectContaining({ id: adminUser.id }),
      taskCount: 0,
    });

    await db.insert(schema.taskTable).values({
      id: `task-${randomUUID()}`,
      projectId: project.id,
      title: "Late task",
      status: "to-do",
      dueDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const listResponse = await app.request("/api/admin/projects?overdue=true");
    expect(listResponse.status).toBe(200);
    await expect(listResponse.json()).resolves.toMatchObject({
      projects: [
        expect.objectContaining({
          id: project.id,
          overdueTaskCount: 1,
        }),
      ],
    });

    const moveResponse = await app.request(
      `/api/admin/projects/${project.id}`,
      jsonRequest("PATCH", {
        workspaceId: secondWorkspace.id,
        name: "Moved Project",
      }),
    );
    expect(moveResponse.status).toBe(200);
    await expect(moveResponse.json()).resolves.toMatchObject({
      project: {
        id: project.id,
        workspaceId: secondWorkspace.id,
        name: "Moved Project",
        owner: expect.objectContaining({ id: adminUser.id }),
      },
    });

    const archiveResponse = await app.request(
      `/api/admin/projects/${project.id}/archive`,
      jsonRequest("POST"),
    );
    expect(archiveResponse.status).toBe(200);
    await expect(archiveResponse.json()).resolves.toMatchObject({
      project: { archivedAt: expect.any(String) },
    });

    const duplicateResponse = await app.request(
      `/api/admin/projects/${project.id}/duplicate`,
      jsonRequest("POST"),
    );
    expect(duplicateResponse.status).toBe(200);
    await expect(duplicateResponse.json()).resolves.toMatchObject({
      project: {
        workspaceId: secondWorkspace.id,
        name: "Moved Project Copy",
      },
    });

    const cleanupResponse = await app.request(
      `/api/admin/projects/${project.id}/tasks/delete-all`,
      jsonRequest("POST", { confirmName: "Moved Project" }),
    );
    expect(cleanupResponse.status).toBe(200);
    await expect(cleanupResponse.json()).resolves.toMatchObject({
      project: { taskCount: 0 },
    });

    const mismatchDelete = await app.request(
      `/api/admin/projects/${project.id}`,
      jsonRequest("DELETE", { confirmName: "Wrong" }),
    );
    expect(mismatchDelete.status).toBe(400);

    const deleteResponse = await app.request(
      `/api/admin/projects/${project.id}`,
      jsonRequest("DELETE", { confirmName: "Moved Project" }),
    );
    expect(deleteResponse.status).toBe(200);
  });

  it("lists and filters tasks globally with assignees and audit context", async () => {
    const adminUser = await createUserWithRole("superadmin");
    const member = await createWorkspaceMember({
      workspaceName: "Task Ops Workspace",
    });
    const secondAssignee = await createUserWithRole("user");
    const now = new Date();

    await db.insert(schema.workspaceUserTable).values({
      workspaceId: member.workspace.id,
      userId: secondAssignee.id,
      role: "member",
      joinedAt: now,
    });

    const { project, columns } = await createProjectFixture({
      workspaceId: member.workspace.id,
      name: "Admin Task Project",
    });
    const [task] = await db
      .insert(schema.taskTable)
      .values({
        id: `task-${randomUUID()}`,
        projectId: project.id,
        columnId: columns.todo.id,
        number: 10,
        userId: member.user.id,
        title: "Escalated production task",
        description: "Contains searchable operations note",
        status: columns.todo.slug,
        priority: "high",
        dueDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    await db.insert(schema.taskAssigneeTable).values([
      {
        taskId: task.id,
        userId: member.user.id,
        assignedByUserId: adminUser.id,
        assignedAt: now,
      },
      {
        taskId: task.id,
        userId: secondAssignee.id,
        assignedByUserId: adminUser.id,
        assignedAt: now,
      },
    ]);
    await db.insert(schema.activityTable).values({
      taskId: task.id,
      userId: adminUser.id,
      type: "status_changed",
      eventData: { oldStatus: "planned", newStatus: columns.todo.slug },
      createdAt: now,
      updatedAt: now,
    });

    mockAuthenticatedSession(adminUser);
    const { app } = createApp();

    const response = await app.request(
      `/api/admin/tasks?q=production&workspaceId=${member.workspace.id}&assigneeId=${secondAssignee.id}&overdue=true`,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      tasks: [
        expect.objectContaining({
          id: task.id,
          title: "Escalated production task",
          projectId: project.id,
          projectName: "Admin Task Project",
          workspaceId: member.workspace.id,
          workspaceName: "Task Ops Workspace",
          auditEventCount: 1,
          lastAuditAt: expect.any(String),
          assignees: expect.arrayContaining([
            expect.objectContaining({ id: member.user.id }),
            expect.objectContaining({ id: secondAssignee.id }),
          ]),
        }),
      ],
    });
  });

  it("updates tasks globally including assignees and audit events", async () => {
    const adminUser = await createUserWithRole("superadmin");
    const member = await createWorkspaceMember();
    const secondAssignee = await createUserWithRole("user");
    const now = new Date();

    await db.insert(schema.workspaceUserTable).values({
      workspaceId: member.workspace.id,
      userId: secondAssignee.id,
      role: "member",
      joinedAt: now,
    });

    const { project, columns } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });
    const [task] = await db
      .insert(schema.taskTable)
      .values({
        id: `task-${randomUUID()}`,
        projectId: project.id,
        columnId: columns.todo.id,
        number: 20,
        userId: member.user.id,
        title: "Original admin task",
        status: columns.todo.slug,
        priority: "low",
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    mockAuthenticatedSession(adminUser);
    const { app } = createApp();

    const response = await app.request(
      `/api/admin/tasks/${task.id}`,
      jsonRequest("PATCH", {
        title: "Updated admin task",
        status: columns.inProgress.slug,
        priority: "urgent",
        dueDate: "2026-08-15T09:00:00.000Z",
        assigneeIds: [secondAssignee.id],
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      task: expect.objectContaining({
        id: task.id,
        title: "Updated admin task",
        status: columns.inProgress.slug,
        priority: "urgent",
        dueDate: "2026-08-15T09:00:00.000Z",
        assignees: [expect.objectContaining({ id: secondAssignee.id })],
      }),
    });

    const [persistedTask] = await db
      .select({
        title: schema.taskTable.title,
        status: schema.taskTable.status,
        priority: schema.taskTable.priority,
        columnId: schema.taskTable.columnId,
        userId: schema.taskTable.userId,
      })
      .from(schema.taskTable)
      .where(eq(schema.taskTable.id, task.id))
      .limit(1);
    expect(persistedTask).toMatchObject({
      title: "Updated admin task",
      status: columns.inProgress.slug,
      priority: "urgent",
      columnId: columns.inProgress.id,
      userId: secondAssignee.id,
    });

    await expect(
      waitForTaskActivityCount(task.id, 3),
    ).resolves.toBeGreaterThanOrEqual(3);
  });

  it("runs bulk task operations and deletes selected tasks", async () => {
    const adminUser = await createUserWithRole("superadmin");
    const member = await createWorkspaceMember();
    const { project, columns } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });
    const now = new Date();
    const tasks = await db
      .insert(schema.taskTable)
      .values([
        {
          id: `task-${randomUUID()}`,
          projectId: project.id,
          columnId: columns.todo.id,
          number: 30,
          title: "First bulk task",
          status: columns.todo.slug,
          priority: "low",
          createdAt: now,
          updatedAt: now,
        },
        {
          id: `task-${randomUUID()}`,
          projectId: project.id,
          columnId: columns.todo.id,
          number: 31,
          title: "Second bulk task",
          status: columns.todo.slug,
          priority: "low",
          createdAt: now,
          updatedAt: now,
        },
      ])
      .returning();

    mockAuthenticatedSession(adminUser);
    const { app } = createApp();
    const taskIds = tasks.map((task) => task.id);

    const updateResponse = await app.request(
      "/api/admin/tasks/bulk",
      jsonRequest("PATCH", {
        taskIds,
        operation: "updateStatus",
        value: columns.inReview.slug,
      }),
    );
    expect(updateResponse.status).toBe(200);
    await expect(updateResponse.json()).resolves.toMatchObject({
      ok: true,
      updatedCount: 2,
    });

    const updatedTasks = await db
      .select({ status: schema.taskTable.status })
      .from(schema.taskTable)
      .where(eq(schema.taskTable.projectId, project.id));
    expect(
      updatedTasks.every((task) => task.status === columns.inReview.slug),
    ).toBe(true);

    const deleteResponse = await app.request(
      "/api/admin/tasks/bulk",
      jsonRequest("PATCH", { taskIds, operation: "delete" }),
    );
    expect(deleteResponse.status).toBe(200);

    const [remaining] = await db
      .select({ value: count() })
      .from(schema.taskTable)
      .where(eq(schema.taskTable.projectId, project.id));
    expect(remaining?.value).toBe(0);
  });

  it("allows default admins to view tasks but blocks task mutations", async () => {
    const user = await createUserWithRole("admin");
    mockAuthenticatedSession(user);
    const { app } = createApp();

    const listResponse = await app.request("/api/admin/tasks");
    expect(listResponse.status).toBe(200);

    const updateResponse = await app.request(
      `/api/admin/tasks/task-${randomUUID()}`,
      jsonRequest("PATCH", { title: "Denied task update" }),
    );
    expect(updateResponse.status).toBe(403);
  });

  it("rejects workspace and project mutations without administrative permissions", async () => {
    const user = await createUserWithRole("admin");
    mockAuthenticatedSession(user);
    const { app } = createApp();

    const listResponse = await app.request("/api/admin/workspaces");
    expect(listResponse.status).toBe(200);

    const createWorkspaceResponse = await app.request(
      "/api/admin/workspaces",
      jsonRequest("POST", { name: "Denied Workspace" }),
    );
    expect(createWorkspaceResponse.status).toBe(403);

    const createProjectResponse = await app.request(
      "/api/admin/projects",
      jsonRequest("POST", {
        workspaceId: `workspace-${randomUUID()}`,
        name: "Denied Project",
      }),
    );
    expect(createProjectResponse.status).toBe(403);
  });

  it("lists runtime settings with defaults for superadmins", async () => {
    const adminUser = await createUserWithRole("superadmin");
    mockAuthenticatedSession(adminUser);
    const { app } = createApp();

    const response = await app.request("/api/admin/settings");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      categories: expect.arrayContaining([
        expect.objectContaining({ key: "general" }),
        expect.objectContaining({ key: "users" }),
      ]),
      settings: expect.arrayContaining([
        expect.objectContaining({
          key: "branding.appName",
          value: "Nortys",
          isDefault: true,
        }),
        expect.objectContaining({
          key: "auth.publicRegistration",
          value: true,
          valueType: "boolean",
        }),
      ]),
    });
  });

  it("updates runtime settings and reflects them in public config", async () => {
    const adminUser = await createUserWithRole("superadmin");
    mockAuthenticatedSession(adminUser);
    const { app } = createApp();

    const updateResponse = await app.request(
      "/api/admin/settings",
      jsonRequest("PATCH", {
        settings: [
          { key: "branding.appName", value: "Nortys Admin" },
          { key: "auth.publicRegistration", value: false },
        ],
      }),
    );

    expect(updateResponse.status).toBe(200);
    await expect(updateResponse.json()).resolves.toMatchObject({
      settings: expect.arrayContaining([
        expect.objectContaining({
          key: "branding.appName",
          value: "Nortys Admin",
          isDefault: false,
        }),
        expect.objectContaining({
          key: "auth.publicRegistration",
          value: false,
        }),
      ]),
    });

    const configResponse = await app.request("/api/config");
    expect(configResponse.status).toBe(200);
    await expect(configResponse.json()).resolves.toMatchObject({
      appName: "Nortys Admin",
      disableRegistration: true,
    });

    const [setting] = await db
      .select({ updatedByUserId: schema.systemSettingTable.updatedByUserId })
      .from(schema.systemSettingTable)
      .where(eq(schema.systemSettingTable.key, "branding.appName"))
      .limit(1);
    expect(setting?.updatedByUserId).toBe(adminUser.id);
  });

  it("rejects runtime setting updates without permission", async () => {
    const user = await createUserWithRole("admin");
    mockAuthenticatedSession(user);
    const { app } = createApp();

    const getResponse = await app.request("/api/admin/settings");
    expect(getResponse.status).toBe(403);

    const patchResponse = await app.request(
      "/api/admin/settings",
      jsonRequest("PATCH", {
        settings: [{ key: "branding.appName", value: "Denied" }],
      }),
    );
    expect(patchResponse.status).toBe(403);
  });

  it("validates runtime setting keys and values on the backend", async () => {
    const adminUser = await createUserWithRole("superadmin");
    mockAuthenticatedSession(adminUser);
    const { app } = createApp();

    const unknownResponse = await app.request(
      "/api/admin/settings",
      jsonRequest("PATCH", {
        settings: [{ key: "unknown.setting", value: "x" }],
      }),
    );
    expect(unknownResponse.status).toBe(400);

    const invalidValueResponse = await app.request(
      "/api/admin/settings",
      jsonRequest("PATCH", {
        settings: [{ key: "workspace.creationPolicy", value: "everyone" }],
      }),
    );
    expect(invalidValueResponse.status).toBe(400);
  });
});
