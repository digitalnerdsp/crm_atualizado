import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import {
  createProjectFixture,
  createWorkspaceMember,
} from "./helpers/fixtures";

describe("API integration: task quality and templates", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  it("blocks a configured status and clones quality data from a template", async () => {
    const admin = await createWorkspaceMember({ role: "admin" });
    const source = await createProjectFixture({
      workspaceId: admin.workspace.id,
      name: "Source",
    });
    const destination = await createProjectFixture({
      workspaceId: admin.workspace.id,
      name: "Destination",
    });
    mockAuthenticatedSession(admin.user);
    const { app } = createApp();

    const createResponse = await app.request(`/api/task/${source.project.id}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Launch campaign",
        description: "Quality controlled launch",
        priority: "high",
        status: source.columns.todo.slug,
      }),
    });
    expect(createResponse.status).toBe(200);
    const task = await createResponse.json();

    const fieldResponse = await app.request(
      `/api/task/custom-fields/${task.id}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "Daily budget",
          type: "number",
          value: "250",
          showOnCard: true,
        }),
      },
    );
    expect(fieldResponse.status).toBe(200);

    const checklistResponse = await app.request(
      `/api/task/checklist/${task.id}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: "Pixel installed and tested",
          isRequired: true,
          requiredBeforeColumnId: source.columns.inProgress.id,
        }),
      },
    );
    expect(checklistResponse.status).toBe(200);
    const checklistItem = await checklistResponse.json();

    const dragBlocked = await app.request(`/api/task/${task.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: task.title,
        description: task.description ?? "",
        priority: task.priority,
        status: source.columns.inProgress.slug,
        projectId: task.projectId,
        position: task.position ?? 0,
      }),
    });
    expect(dragBlocked.status).toBe(409);
    await expect(dragBlocked.text()).resolves.toContain("CHECKLIST_REQUIRED");

    const blocked = await app.request(`/api/task/status/${task.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: source.columns.inProgress.slug }),
    });
    expect(blocked.status).toBe(409);
    await expect(blocked.text()).resolves.toContain("CHECKLIST_REQUIRED");

    const complete = await app.request(
      `/api/task/checklist/${task.id}/${checklistItem.id}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ isCompleted: true }),
      },
    );
    expect(complete.status).toBe(200);

    const allowed = await app.request(`/api/task/status/${task.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: source.columns.inProgress.slug }),
    });
    expect(allowed.status).toBe(200);

    const [subtask] = await db
      .insert(schema.taskTable)
      .values({
        projectId: source.project.id,
        title: "Validate landing page",
        description: "Run the final form test",
        priority: "medium",
        status: source.columns.todo.slug,
        columnId: source.columns.todo.id,
        number: 2,
      })
      .returning();
    await db.insert(schema.taskRelationTable).values({
      sourceTaskId: task.id,
      targetTaskId: subtask?.id ?? "",
      relationType: "subtask",
    });

    const templateResponse = await app.request(
      `/api/task-template/from-task/${task.id}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Campaign launch" }),
      },
    );
    expect(templateResponse.status).toBe(200);
    const template = await templateResponse.json();

    const instantiateResponse = await app.request(
      `/api/task-template/${template.id}/instantiate/${destination.project.id}`,
      { method: "POST" },
    );
    expect(instantiateResponse.status).toBe(200);
    const instantiated = await instantiateResponse.json();

    const [clonedField] = await db
      .select()
      .from(schema.taskCustomFieldTable)
      .where(
        and(
          eq(schema.taskCustomFieldTable.taskId, instantiated.id),
          eq(schema.taskCustomFieldTable.name, "Daily budget"),
        ),
      );
    const [clonedItem] = await db
      .select()
      .from(schema.taskChecklistItemTable)
      .where(
        and(
          eq(schema.taskChecklistItemTable.taskId, instantiated.id),
          eq(schema.taskChecklistItemTable.title, "Pixel installed and tested"),
        ),
      );
    const [clonedSubtask] = await db
      .select({ title: schema.taskTable.title })
      .from(schema.taskRelationTable)
      .innerJoin(
        schema.taskTable,
        eq(schema.taskRelationTable.targetTaskId, schema.taskTable.id),
      )
      .where(
        and(
          eq(schema.taskRelationTable.sourceTaskId, instantiated.id),
          eq(schema.taskRelationTable.relationType, "subtask"),
        ),
      );

    expect(clonedField).toMatchObject({
      value: "250",
      showOnCard: true,
    });
    expect(clonedItem).toMatchObject({
      isCompleted: false,
      requiredBeforeColumnId: destination.columns.inProgress.id,
    });
    expect(clonedSubtask?.title).toBe("Validate landing page");

    const projectFromTemplateResponse = await app.request("/api/project", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        workspaceId: admin.workspace.id,
        name: "Template project",
        slug: "TPL",
        icon: "Clipboard",
        templateIds: [template.id],
      }),
    });
    expect(projectFromTemplateResponse.status).toBe(200);
    const projectFromTemplate = await projectFromTemplateResponse.json();
    const initialCard = await db.query.taskTable.findFirst({
      where: and(
        eq(schema.taskTable.projectId, projectFromTemplate.id),
        eq(schema.taskTable.title, "Launch campaign"),
      ),
    });
    expect(initialCard).toBeDefined();
  });

  it("does not let a viewer change quality metadata", async () => {
    const viewer = await createWorkspaceMember({ role: "viewer" });
    const project = await createProjectFixture({
      workspaceId: viewer.workspace.id,
    });
    const [task] = await db
      .insert(schema.taskTable)
      .values({
        projectId: project.project.id,
        title: "Read only",
        status: project.columns.todo.slug,
        columnId: project.columns.todo.id,
      })
      .returning();
    mockAuthenticatedSession(viewer.user);
    const { app } = createApp();

    const response = await app.request(`/api/task/custom-fields/${task?.id}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Budget",
        type: "number",
        value: "100",
      }),
    });

    expect(response.status).toBe(403);
  });

  it("restricts templates by default and allows a custom role to use them", async () => {
    const member = await createWorkspaceMember({ role: "member" });
    const project = await createProjectFixture({
      workspaceId: member.workspace.id,
    });
    const [template] = await db
      .insert(schema.taskTemplateTable)
      .values({
        workspaceId: member.workspace.id,
        name: "Approved template",
        title: "Task from template",
        createdByUserId: member.user.id,
      })
      .returning();

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const deniedList = await app.request(
      `/api/task-template?workspaceId=${member.workspace.id}`,
    );
    expect(deniedList.status).toBe(403);

    const deniedUse = await app.request(
      `/api/task-template/${template?.id}/instantiate/${project.project.id}`,
      { method: "POST" },
    );
    expect(deniedUse.status).toBe(403);

    await db.insert(schema.workspaceRoleTable).values({
      workspaceId: member.workspace.id,
      role: "template-operator",
      permission: JSON.stringify({
        workspace: ["read"],
        project: ["read"],
        task: ["create", "read"],
        template: ["read", "use"],
      }),
    });
    await db
      .update(schema.workspaceUserTable)
      .set({ role: "template-operator" })
      .where(
        and(
          eq(schema.workspaceUserTable.workspaceId, member.workspace.id),
          eq(schema.workspaceUserTable.userId, member.user.id),
        ),
      );

    const allowedList = await app.request(
      `/api/task-template?workspaceId=${member.workspace.id}`,
    );
    expect(allowedList.status).toBe(200);

    const allowedUse = await app.request(
      `/api/task-template/${template?.id}/instantiate/${project.project.id}`,
      { method: "POST" },
    );
    expect(allowedUse.status).toBe(200);

    const created = await allowedUse.json();
    expect(created.title).toBe("Task from template");
  });
});
