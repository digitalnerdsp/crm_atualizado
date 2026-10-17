import { randomUUID } from "node:crypto";
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

function jsonRequest(method: string, json?: unknown) {
  return {
    method,
    headers: { "Content-Type": "application/json" },
    body: json === undefined ? undefined : JSON.stringify(json),
  };
}

async function createUserInWorkspace(workspaceId: string, name: string) {
  const [user] = await db
    .insert(schema.userTable)
    .values({
      id: `user-${randomUUID()}`,
      name,
      email: `${randomUUID()}@example.com`,
      emailVerified: true,
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

describe("API integration: calendar", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  it("requires authentication for calendar listing", async () => {
    mockAnonymousSession();
    const { app } = createApp();

    const response = await app.request(
      "/api/calendar?from=2026-08-01T00:00:00.000Z&to=2026-08-31T23:59:59.999Z",
    );

    expect(response.status).toBe(401);
  });

  it("creates events with attendees and reminders, then lists them with dated tasks", async () => {
    const member = await createWorkspaceMember({
      workspaceName: "Calendar Workspace",
    });
    const attendee = await createUserInWorkspace(
      member.workspace.id,
      "Calendar Attendee",
    );
    const { project, columns } = await createProjectFixture({
      workspaceId: member.workspace.id,
      name: "Calendar Project",
    });
    const [task] = await db
      .insert(schema.taskTable)
      .values({
        id: `task-${randomUUID()}`,
        projectId: project.id,
        columnId: columns.todo.id,
        userId: member.user.id,
        title: "Calendar task",
        status: columns.todo.slug,
        priority: "high",
        startDate: new Date("2026-08-10T00:00:00.000Z"),
        dueDate: new Date("2026-08-12T00:00:00.000Z"),
      })
      .returning();

    await db.insert(schema.taskAssigneeTable).values({
      taskId: task.id,
      userId: member.user.id,
      assignedByUserId: member.user.id,
      assignedAt: new Date(),
    });

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const createResponse = await app.request(
      "/api/calendar/events",
      jsonRequest("POST", {
        workspaceId: member.workspace.id,
        projectId: project.id,
        title: "Planning meeting",
        startAt: "2026-08-11T13:00:00.000Z",
        endAt: "2026-08-11T14:00:00.000Z",
        meetingType: "in_person",
        location: "Rua da Agenda, 123",
        recurrenceFrequency: "weekly",
        recurrenceUntil: "2026-08-25T13:00:00.000Z",
        attendeeIds: [attendee.id],
        reminders: [{ channel: "in_app", minutesBefore: 30 }],
      }),
    );

    expect(createResponse.status).toBe(200);
    const created = await createResponse.json();
    expect(created.item).toMatchObject({
      type: "event",
      title: "Planning meeting",
      meetingType: "in_person",
      location: "Rua da Agenda, 123",
      recurrenceFrequency: "weekly",
      recurrenceUntil: "2026-08-25T13:00:00.000Z",
      attendees: [expect.objectContaining({ id: attendee.id })],
      reminders: [
        expect.objectContaining({
          channel: "in_app",
          minutesBefore: 30,
        }),
      ],
    });

    const listResponse = await app.request(
      `/api/calendar?from=2026-08-01T00:00:00.000Z&to=2026-08-31T23:59:59.999Z&workspaceId=${member.workspace.id}`,
    );

    expect(listResponse.status).toBe(200);
    await expect(listResponse.json()).resolves.toMatchObject({
      items: expect.arrayContaining([
        expect.objectContaining({
          id: task.id,
          type: "task",
          title: "Calendar task",
          taskStartDate: "2026-08-10T00:00:00.000Z",
          taskDueDate: "2026-08-12T00:00:00.000Z",
          assignees: [expect.objectContaining({ id: member.user.id })],
        }),
        expect.objectContaining({
          id: created.item.id,
          eventId: created.item.id,
          type: "event",
          title: "Planning meeting",
          projectName: "Calendar Project",
          meetingType: "in_person",
        }),
        expect.objectContaining({
          id: `${created.item.id}:2026-08-18T13:00:00.000Z`,
          eventId: created.item.id,
          type: "event",
          title: "Planning meeting",
          recurrenceFrequency: "weekly",
        }),
      ]),
    });

    const updateResponse = await app.request(
      `/api/calendar/events/${created.item.id}`,
      jsonRequest("PATCH", {
        title: "Updated planning meeting",
        startAt: "2026-08-12T15:00:00.000Z",
        endAt: "2026-08-12T16:00:00.000Z",
        recurrenceFrequency: "none",
      }),
    );
    expect(updateResponse.status).toBe(200);
    await expect(updateResponse.json()).resolves.toMatchObject({
      item: expect.objectContaining({
        title: "Updated planning meeting",
        start: "2026-08-12T15:00:00.000Z",
      }),
    });

    const [reminder] = await db
      .select({ remindAt: schema.calendarEventReminderTable.remindAt })
      .from(schema.calendarEventReminderTable)
      .where(eq(schema.calendarEventReminderTable.eventId, created.item.id))
      .limit(1);
    expect(reminder?.remindAt.toISOString()).toBe("2026-08-12T14:30:00.000Z");

    const deleteResponse = await app.request(
      `/api/calendar/events/${created.item.id}`,
      jsonRequest("DELETE"),
    );
    expect(deleteResponse.status).toBe(200);
  });

  it("allows viewers to read the calendar but blocks mutations", async () => {
    const viewer = await createWorkspaceMember({ role: "viewer" });
    mockAuthenticatedSession(viewer.user);
    const { app } = createApp();

    const listResponse = await app.request(
      `/api/calendar?from=2026-08-01T00:00:00.000Z&to=2026-08-31T23:59:59.999Z&workspaceId=${viewer.workspace.id}`,
    );
    expect(listResponse.status).toBe(200);

    const createResponse = await app.request(
      "/api/calendar/events",
      jsonRequest("POST", {
        workspaceId: viewer.workspace.id,
        title: "Denied event",
        startAt: "2026-08-11T13:00:00.000Z",
        endAt: "2026-08-11T14:00:00.000Z",
      }),
    );
    expect(createResponse.status).toBe(403);
  });

  it("updates task dates through the calendar and records activity", async () => {
    const member = await createWorkspaceMember();
    const { project, columns } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });
    const [task] = await db
      .insert(schema.taskTable)
      .values({
        id: `task-${randomUUID()}`,
        projectId: project.id,
        columnId: columns.todo.id,
        title: "Draggable calendar task",
        status: columns.todo.slug,
        priority: "medium",
        dueDate: new Date("2026-08-10T00:00:00.000Z"),
      })
      .returning();

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const response = await app.request(
      `/api/calendar/tasks/${task.id}/dates`,
      jsonRequest("PATCH", {
        startDate: "2026-08-12T00:00:00.000Z",
        dueDate: "2026-08-14T00:00:00.000Z",
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      item: expect.objectContaining({
        id: task.id,
        type: "task",
        start: "2026-08-12T00:00:00.000Z",
        end: "2026-08-14T00:00:00.000Z",
      }),
    });

    const persisted = await db.query.taskTable.findFirst({
      where: eq(schema.taskTable.id, task.id),
    });
    expect(persisted?.startDate?.toISOString()).toBe(
      "2026-08-12T00:00:00.000Z",
    );
    expect(persisted?.dueDate?.toISOString()).toBe("2026-08-14T00:00:00.000Z");
    await expect(
      waitForTaskActivityCount(task.id, 1),
    ).resolves.toBeGreaterThanOrEqual(1);
  });
});
