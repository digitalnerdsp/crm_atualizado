import { asc, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import { generateRecurringTasks } from "../../apps/api/src/task/recurrence";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import {
  createProjectFixture,
  createWorkspaceMember,
} from "./helpers/fixtures";

describe("API integration: task recurrence", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  it("generates a weekly series once without duplicate occurrences", async () => {
    const member = await createWorkspaceMember({ role: "member" });
    const { project } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });
    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const response = await app.request(`/api/task/${project.id}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Review campaigns",
        description: "Check pacing and conversion quality",
        priority: "high",
        status: "to-do",
        dueDate: "2026-08-03T12:00:00.000Z",
        recurrence: {
          frequency: "weekly",
          interval: 1,
          weekdays: [1, 4],
          maxOccurrences: 4,
        },
      }),
    });

    expect(response.status).toBe(200);
    const created = await response.json();
    expect(created.recurrenceId).toBeTruthy();

    await generateRecurringTasks(
      new Date("2026-08-01T12:00:00.000Z"),
      created.recurrenceId,
    );
    await generateRecurringTasks(
      new Date("2026-08-01T12:00:00.000Z"),
      created.recurrenceId,
    );

    const occurrences = await db
      .select({
        title: schema.taskTable.title,
        dueDate: schema.taskTable.dueDate,
      })
      .from(schema.taskTable)
      .where(eq(schema.taskTable.recurrenceId, created.recurrenceId))
      .orderBy(asc(schema.taskTable.dueDate));

    expect(occurrences).toHaveLength(4);
    expect(occurrences.map((task) => task.dueDate?.toISOString())).toEqual([
      "2026-08-03T12:00:00.000Z",
      "2026-08-06T12:00:00.000Z",
      "2026-08-10T12:00:00.000Z",
      "2026-08-13T12:00:00.000Z",
    ]);
    expect(occurrences.every((task) => task.title === "Review campaigns")).toBe(
      true,
    );
  });

  it("uses task update permission to protect recurrence configuration", async () => {
    const viewer = await createWorkspaceMember({ role: "viewer" });
    const { project, columns } = await createProjectFixture({
      workspaceId: viewer.workspace.id,
    });
    const [task] = await db
      .insert(schema.taskTable)
      .values({
        projectId: project.id,
        title: "Existing task",
        status: "to-do",
        columnId: columns.todo.id,
        dueDate: new Date("2026-08-03T12:00:00.000Z"),
      })
      .returning();
    mockAuthenticatedSession(viewer.user);
    const { app } = createApp();

    const response = await app.request(`/api/task/recurrence/${task?.id}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        frequency: "weekly",
        weekdays: [1],
      }),
    });

    expect(response.status).toBe(403);
  });
});
