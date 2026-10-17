import {
  and,
  asc,
  eq,
  gte,
  inArray,
  isNull,
  lte,
  ne,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { describeRoute, resolver, validator } from "hono-openapi";
import * as v from "valibot";
import createActivity from "../activity/controllers/create-activity";
import db, { schema } from "../database";
import { publishEvent } from "../events";
import { listTaskAssignees } from "../task/assignees";
import { isInstanceAdmin } from "../utils/is-instance-admin";
import { hasWorkspacePermission } from "../utils/require-workspace-permission";
import { validateWorkspaceAccess } from "../utils/validate-workspace-access";
import {
  type CalendarRecurrenceFrequency,
  calendarOccurrenceStarts,
} from "./recurrence";

const eventVisibilityValues = ["workspace", "private"] as const;
const eventStatusValues = ["confirmed", "tentative", "cancelled"] as const;
const reminderChannelValues = ["in_app", "email"] as const;
const meetingTypeValues = ["online", "in_person", "external"] as const;
const recurrenceFrequencyValues = [
  "none",
  "daily",
  "weekly",
  "monthly",
] as const;

const personSchema = v.object({
  id: v.string(),
  name: v.string(),
  email: v.string(),
  image: v.nullish(v.string()),
});

const reminderSchema = v.object({
  id: v.string(),
  channel: v.picklist(reminderChannelValues),
  remindAt: v.string(),
  minutesBefore: v.number(),
  userId: v.nullish(v.string()),
  sentAt: v.nullish(v.string()),
});

const calendarItemSchema = v.object({
  id: v.string(),
  eventId: v.nullish(v.string()),
  type: v.picklist(["task", "event"]),
  title: v.string(),
  description: v.nullish(v.string()),
  start: v.string(),
  end: v.string(),
  seriesStart: v.nullish(v.string()),
  seriesEnd: v.nullish(v.string()),
  allDay: v.boolean(),
  workspaceId: v.string(),
  workspaceName: v.string(),
  projectId: v.nullish(v.string()),
  projectName: v.nullish(v.string()),
  taskId: v.nullish(v.string()),
  taskNumber: v.nullish(v.number()),
  taskStartDate: v.nullish(v.string()),
  taskDueDate: v.nullish(v.string()),
  status: v.string(),
  priority: v.nullish(v.string()),
  location: v.nullish(v.string()),
  meetingType: v.nullish(v.string()),
  visibility: v.nullish(v.string()),
  recurrenceFrequency: v.nullish(v.string()),
  recurrenceUntil: v.nullish(v.string()),
  assignees: v.array(personSchema),
  attendees: v.array(personSchema),
  reminders: v.array(reminderSchema),
  createdByUserId: v.nullish(v.string()),
});

const listCalendarQuerySchema = v.object({
  from: v.string(),
  to: v.string(),
  workspaceId: v.optional(v.string()),
  projectId: v.optional(v.string()),
  assigneeId: v.optional(v.string()),
  attendeeId: v.optional(v.string()),
  status: v.optional(v.string()),
  priority: v.optional(v.string()),
  type: v.optional(v.picklist(["task", "event"])),
  mine: v.optional(v.picklist(["true", "false"])),
});

const reminderInputSchema = v.object({
  channel: v.picklist(reminderChannelValues),
  minutesBefore: v.pipe(v.number(), v.minValue(0)),
  userId: v.optional(v.nullable(v.string())),
});

const eventInputSchema = v.object({
  workspaceId: v.string(),
  projectId: v.optional(v.nullable(v.string())),
  taskId: v.optional(v.nullable(v.string())),
  title: v.pipe(v.string(), v.trim(), v.minLength(1)),
  description: v.optional(v.nullable(v.pipe(v.string(), v.trim()))),
  startAt: v.string(),
  endAt: v.string(),
  allDay: v.optional(v.boolean()),
  location: v.optional(v.nullable(v.pipe(v.string(), v.trim()))),
  meetingType: v.optional(v.picklist(meetingTypeValues)),
  visibility: v.optional(v.picklist(eventVisibilityValues)),
  status: v.optional(v.picklist(eventStatusValues)),
  recurrenceFrequency: v.optional(v.picklist(recurrenceFrequencyValues)),
  recurrenceUntil: v.optional(v.nullable(v.string())),
  attendeeIds: v.optional(v.array(v.string())),
  reminders: v.optional(v.array(reminderInputSchema)),
});

const updateEventInputSchema = v.object({
  projectId: v.optional(v.nullable(v.string())),
  taskId: v.optional(v.nullable(v.string())),
  title: v.optional(v.pipe(v.string(), v.trim(), v.minLength(1))),
  description: v.optional(v.nullable(v.pipe(v.string(), v.trim()))),
  startAt: v.optional(v.string()),
  endAt: v.optional(v.string()),
  allDay: v.optional(v.boolean()),
  location: v.optional(v.nullable(v.pipe(v.string(), v.trim()))),
  meetingType: v.optional(v.picklist(meetingTypeValues)),
  visibility: v.optional(v.picklist(eventVisibilityValues)),
  status: v.optional(v.picklist(eventStatusValues)),
  recurrenceFrequency: v.optional(v.picklist(recurrenceFrequencyValues)),
  recurrenceUntil: v.optional(v.nullable(v.string())),
  attendeeIds: v.optional(v.array(v.string())),
  reminders: v.optional(v.array(reminderInputSchema)),
});

const updateTaskDatesSchema = v.object({
  startDate: v.optional(v.nullable(v.string())),
  dueDate: v.optional(v.nullable(v.string())),
});

function toIsoString(value?: Date | null) {
  return value ? value.toISOString() : null;
}

function parseDate(value: string, label: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new HTTPException(400, { message: `Invalid ${label}.` });
  }
  return date;
}

function parseOptionalDate(value: string | null | undefined, label: string) {
  if (value === undefined) return undefined;
  if (!value) return null;
  return parseDate(value, label);
}

function assertValidRange(startAt: Date, endAt: Date) {
  if (endAt.getTime() < startAt.getTime()) {
    throw new HTTPException(400, {
      message: "Event end must be after event start.",
    });
  }
}

function normalizeIds(ids: string[] | undefined) {
  return [...new Set((ids ?? []).filter(Boolean))];
}

async function canUseWorkspace(
  c: Parameters<typeof hasWorkspacePermission>[0],
  workspaceId: string,
  action: "create" | "read" | "update" | "delete",
) {
  await validateWorkspaceAccess(
    c.get("userId"),
    workspaceId,
    c.get("apiKey")?.id,
  );
  c.set("workspaceId", workspaceId);
  return hasWorkspacePermission(c, { calendar: [action] });
}

async function requireCalendarPermission(
  c: Parameters<typeof hasWorkspacePermission>[0],
  workspaceId: string,
  action: "create" | "read" | "update" | "delete",
) {
  if (!(await canUseWorkspace(c, workspaceId, action))) {
    throw new HTTPException(403, { message: "Insufficient permissions" });
  }
}

async function accessibleWorkspaceIds(
  c: Parameters<typeof hasWorkspacePermission>[0],
  workspaceId?: string,
) {
  if (workspaceId) {
    await requireCalendarPermission(c, workspaceId, "read");
    return [workspaceId];
  }

  if (await isInstanceAdmin(c)) {
    const workspaces = await db
      .select({ id: schema.workspaceTable.id })
      .from(schema.workspaceTable);
    return workspaces.map((workspace) => workspace.id);
  }

  const memberships = await db
    .select({ workspaceId: schema.workspaceUserTable.workspaceId })
    .from(schema.workspaceUserTable)
    .where(eq(schema.workspaceUserTable.userId, c.get("userId")));

  const allowed: string[] = [];
  for (const membership of memberships) {
    if (await canUseWorkspace(c, membership.workspaceId, "read")) {
      allowed.push(membership.workspaceId);
    }
  }
  return allowed;
}

async function assertUsersInWorkspace(workspaceId: string, userIds: string[]) {
  if (!userIds.length) return;

  const rows = await db
    .select({ userId: schema.workspaceUserTable.userId })
    .from(schema.workspaceUserTable)
    .where(
      and(
        eq(schema.workspaceUserTable.workspaceId, workspaceId),
        inArray(schema.workspaceUserTable.userId, userIds),
      ),
    );
  const found = new Set(rows.map((row) => row.userId));
  const missing = userIds.filter((userId) => !found.has(userId));

  if (missing.length > 0) {
    throw new HTTPException(400, {
      message: "All calendar attendees must belong to the workspace.",
    });
  }
}

async function assertProjectInWorkspace(
  projectId: string | null | undefined,
  workspaceId: string,
) {
  if (!projectId) return;

  const [project] = await db
    .select({ id: schema.projectTable.id })
    .from(schema.projectTable)
    .where(
      and(
        eq(schema.projectTable.id, projectId),
        eq(schema.projectTable.workspaceId, workspaceId),
      ),
    )
    .limit(1);

  if (!project) {
    throw new HTTPException(400, {
      message: "Project must belong to the event workspace.",
    });
  }
}

async function assertTaskInWorkspace(
  taskId: string | null | undefined,
  workspaceId: string,
  projectId?: string | null,
) {
  if (!taskId) return;

  const filters: SQL[] = [
    eq(schema.taskTable.id, taskId),
    eq(schema.projectTable.workspaceId, workspaceId),
  ];
  if (projectId) {
    filters.push(eq(schema.taskTable.projectId, projectId));
  }

  const [task] = await db
    .select({ id: schema.taskTable.id })
    .from(schema.taskTable)
    .innerJoin(
      schema.projectTable,
      eq(schema.taskTable.projectId, schema.projectTable.id),
    )
    .where(and(...filters))
    .limit(1);

  if (!task) {
    throw new HTTPException(400, {
      message: "Task must belong to the event workspace and project.",
    });
  }
}

async function setEventAttendees(
  eventId: string,
  workspaceId: string,
  ids: string[],
) {
  const attendeeIds = normalizeIds(ids);
  await assertUsersInWorkspace(workspaceId, attendeeIds);

  await db
    .delete(schema.calendarEventAttendeeTable)
    .where(eq(schema.calendarEventAttendeeTable.eventId, eventId));

  if (!attendeeIds.length) return;

  await db.insert(schema.calendarEventAttendeeTable).values(
    attendeeIds.map((userId) => ({
      eventId,
      userId,
    })),
  );
}

async function setEventReminders(
  eventId: string,
  startAt: Date,
  reminders: v.InferInput<typeof reminderInputSchema>[] | undefined,
) {
  await db
    .delete(schema.calendarEventReminderTable)
    .where(eq(schema.calendarEventReminderTable.eventId, eventId));

  if (!reminders?.length) return;

  const seen = new Set<string>();
  const rows = reminders
    .map((reminder) => {
      const remindAt = new Date(
        startAt.getTime() - reminder.minutesBefore * 60_000,
      );
      const userKey = reminder.userId ?? "event";
      const idempotencyKey = [
        eventId,
        userKey,
        reminder.channel,
        remindAt.toISOString(),
      ].join(":");
      return {
        eventId,
        userId: reminder.userId ?? null,
        channel: reminder.channel,
        minutesBefore: reminder.minutesBefore,
        remindAt,
        idempotencyKey,
      };
    })
    .filter((reminder) => {
      if (seen.has(reminder.idempotencyKey)) return false;
      seen.add(reminder.idempotencyKey);
      return true;
    });

  if (rows.length) {
    await db
      .insert(schema.calendarEventReminderTable)
      .values(rows)
      .onConflictDoNothing();
  }
}

async function getEventReminderInputs(eventId: string) {
  const reminders = await db
    .select({
      channel: schema.calendarEventReminderTable.channel,
      minutesBefore: schema.calendarEventReminderTable.minutesBefore,
      userId: schema.calendarEventReminderTable.userId,
    })
    .from(schema.calendarEventReminderTable)
    .where(eq(schema.calendarEventReminderTable.eventId, eventId));

  return reminders.map((reminder) => ({
    channel: reminder.channel as (typeof reminderChannelValues)[number],
    minutesBefore: reminder.minutesBefore,
    userId: reminder.userId,
  }));
}

async function attendeesByEvent(eventIds: string[]) {
  if (!eventIds.length)
    return new Map<string, v.InferOutput<typeof personSchema>[]>();

  const rows = await db
    .select({
      eventId: schema.calendarEventAttendeeTable.eventId,
      id: schema.userTable.id,
      name: schema.userTable.name,
      email: schema.userTable.email,
      image: schema.userTable.image,
    })
    .from(schema.calendarEventAttendeeTable)
    .innerJoin(
      schema.userTable,
      eq(schema.calendarEventAttendeeTable.userId, schema.userTable.id),
    )
    .where(inArray(schema.calendarEventAttendeeTable.eventId, eventIds))
    .orderBy(asc(schema.userTable.name));

  const map = new Map<string, v.InferOutput<typeof personSchema>[]>();
  for (const row of rows) {
    map.set(row.eventId, [
      ...(map.get(row.eventId) ?? []),
      { id: row.id, name: row.name, email: row.email, image: row.image },
    ]);
  }
  return map;
}

async function remindersByEvent(eventIds: string[]) {
  if (!eventIds.length)
    return new Map<string, v.InferOutput<typeof reminderSchema>[]>();

  const rows = await db
    .select({
      id: schema.calendarEventReminderTable.id,
      eventId: schema.calendarEventReminderTable.eventId,
      userId: schema.calendarEventReminderTable.userId,
      channel: schema.calendarEventReminderTable.channel,
      remindAt: schema.calendarEventReminderTable.remindAt,
      minutesBefore: schema.calendarEventReminderTable.minutesBefore,
      sentAt: schema.calendarEventReminderTable.sentAt,
    })
    .from(schema.calendarEventReminderTable)
    .where(inArray(schema.calendarEventReminderTable.eventId, eventIds))
    .orderBy(asc(schema.calendarEventReminderTable.remindAt));

  const map = new Map<string, v.InferOutput<typeof reminderSchema>[]>();
  for (const row of rows) {
    map.set(row.eventId, [
      ...(map.get(row.eventId) ?? []),
      {
        id: row.id,
        channel: row.channel as (typeof reminderChannelValues)[number],
        remindAt: row.remindAt.toISOString(),
        minutesBefore: row.minutesBefore,
        userId: row.userId,
        sentAt: toIsoString(row.sentAt),
      },
    ]);
  }
  return map;
}

async function listEventItems(input: {
  from: Date;
  to: Date;
  workspaceIds: string[];
  projectId?: string;
  attendeeId?: string;
  status?: string;
  mine?: boolean;
  currentUserId: string;
}) {
  if (!input.workspaceIds.length) return [];

  const eventOverlap = and(
    lte(schema.calendarEventTable.startAt, input.to),
    gte(schema.calendarEventTable.endAt, input.from),
  );
  const recurringOverlap = and(
    ne(schema.calendarEventTable.recurrenceFrequency, "none"),
    lte(schema.calendarEventTable.startAt, input.to),
    or(
      isNull(schema.calendarEventTable.recurrenceUntil),
      gte(schema.calendarEventTable.recurrenceUntil, input.from),
    ),
  );
  const filters: SQL[] = [
    inArray(schema.calendarEventTable.workspaceId, input.workspaceIds),
    or(eventOverlap, recurringOverlap) as SQL,
  ];

  if (input.projectId) {
    filters.push(eq(schema.calendarEventTable.projectId, input.projectId));
  }
  if (input.status) {
    filters.push(eq(schema.calendarEventTable.status, input.status));
  }
  if (input.attendeeId) {
    filters.push(sql`exists (
      select 1 from ${schema.calendarEventAttendeeTable}
      where ${schema.calendarEventAttendeeTable.eventId} = ${schema.calendarEventTable.id}
        and ${schema.calendarEventAttendeeTable.userId} = ${input.attendeeId}
    )`);
  }
  if (input.mine) {
    filters.push(sql`(
      ${schema.calendarEventTable.createdByUserId} = ${input.currentUserId}
      or exists (
        select 1 from ${schema.calendarEventAttendeeTable}
        where ${schema.calendarEventAttendeeTable.eventId} = ${schema.calendarEventTable.id}
          and ${schema.calendarEventAttendeeTable.userId} = ${input.currentUserId}
      )
    )`);
  }

  const rows = await db
    .select({
      id: schema.calendarEventTable.id,
      title: schema.calendarEventTable.title,
      description: schema.calendarEventTable.description,
      startAt: schema.calendarEventTable.startAt,
      endAt: schema.calendarEventTable.endAt,
      allDay: schema.calendarEventTable.allDay,
      location: schema.calendarEventTable.location,
      meetingType: schema.calendarEventTable.meetingType,
      visibility: schema.calendarEventTable.visibility,
      status: schema.calendarEventTable.status,
      recurrenceFrequency: schema.calendarEventTable.recurrenceFrequency,
      recurrenceUntil: schema.calendarEventTable.recurrenceUntil,
      workspaceId: schema.calendarEventTable.workspaceId,
      workspaceName: schema.workspaceTable.name,
      projectId: schema.calendarEventTable.projectId,
      projectName: schema.projectTable.name,
      taskId: schema.calendarEventTable.taskId,
      createdByUserId: schema.calendarEventTable.createdByUserId,
    })
    .from(schema.calendarEventTable)
    .innerJoin(
      schema.workspaceTable,
      eq(schema.calendarEventTable.workspaceId, schema.workspaceTable.id),
    )
    .leftJoin(
      schema.projectTable,
      eq(schema.calendarEventTable.projectId, schema.projectTable.id),
    )
    .where(and(...filters))
    .orderBy(asc(schema.calendarEventTable.startAt));

  const ids = rows.map((event) => event.id);
  const [attendeeMap, reminderMap] = await Promise.all([
    attendeesByEvent(ids),
    remindersByEvent(ids),
  ]);

  return rows.flatMap((event) => {
    const frequency = event.recurrenceFrequency ?? "none";
    const duration = Math.max(
      0,
      event.endAt.getTime() - event.startAt.getTime(),
    );
    const occurrences =
      frequency === "none"
        ? [{ start: event.startAt, end: event.endAt }]
        : calendarOccurrenceStarts({
            frequency: frequency as CalendarRecurrenceFrequency,
            startsAt: event.startAt,
            durationMs: duration,
            recurrenceUntil: event.recurrenceUntil,
            rangeStart: input.from,
            rangeEnd: input.to,
          }).map((start) => ({
            start,
            end: new Date(start.getTime() + duration),
          }));

    return occurrences.map((occurrence) => ({
      id:
        frequency === "none" ||
        occurrence.start.getTime() === event.startAt.getTime()
          ? event.id
          : `${event.id}:${occurrence.start.toISOString()}`,
      eventId: event.id,
      type: "event" as const,
      title: event.title,
      description: event.description,
      start: occurrence.start.toISOString(),
      end: occurrence.end.toISOString(),
      seriesStart: event.startAt.toISOString(),
      seriesEnd: event.endAt.toISOString(),
      allDay: event.allDay,
      workspaceId: event.workspaceId,
      workspaceName: event.workspaceName,
      projectId: event.projectId,
      projectName: event.projectName,
      taskId: event.taskId,
      taskNumber: null,
      taskStartDate: null,
      taskDueDate: null,
      status: event.status,
      priority: null,
      location: event.location,
      meetingType: event.meetingType,
      visibility: event.visibility,
      recurrenceFrequency: frequency,
      recurrenceUntil: toIsoString(event.recurrenceUntil),
      assignees: [],
      attendees: attendeeMap.get(event.id) ?? [],
      reminders: reminderMap.get(event.id) ?? [],
      createdByUserId: event.createdByUserId,
    }));
  });
}

async function listTaskItems(input: {
  from: Date;
  to: Date;
  workspaceIds: string[];
  projectId?: string;
  assigneeId?: string;
  status?: string;
  priority?: string;
  mine?: boolean;
  currentUserId: string;
  taskIds?: string[];
}) {
  if (!input.workspaceIds.length) return [];

  const dateOverlap = and(
    sql`COALESCE(${schema.taskTable.startDate}, ${schema.taskTable.dueDate}) <= ${input.to}`,
    sql`COALESCE(${schema.taskTable.dueDate}, ${schema.taskTable.startDate}) >= ${input.from}`,
  ) as SQL;
  const filters: SQL[] = [
    inArray(schema.projectTable.workspaceId, input.workspaceIds),
    input.taskIds?.length
      ? (or(dateOverlap, inArray(schema.taskTable.id, input.taskIds)) as SQL)
      : dateOverlap,
  ];

  if (input.taskIds?.length) {
    filters.push(inArray(schema.taskTable.id, input.taskIds));
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
  if (input.assigneeId) {
    filters.push(sql`exists (
      select 1 from ${schema.taskAssigneeTable}
      where ${schema.taskAssigneeTable.taskId} = ${schema.taskTable.id}
        and ${schema.taskAssigneeTable.userId} = ${input.assigneeId}
    )`);
  }
  if (input.mine) {
    filters.push(sql`(
      ${schema.taskTable.userId} = ${input.currentUserId}
      or exists (
        select 1 from ${schema.taskAssigneeTable}
        where ${schema.taskAssigneeTable.taskId} = ${schema.taskTable.id}
          and ${schema.taskAssigneeTable.userId} = ${input.currentUserId}
      )
    )`);
  }

  const rows = await db
    .select({
      id: schema.taskTable.id,
      title: schema.taskTable.title,
      description: schema.taskTable.description,
      startDate: schema.taskTable.startDate,
      dueDate: schema.taskTable.dueDate,
      number: schema.taskTable.number,
      status: schema.taskTable.status,
      priority: schema.taskTable.priority,
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
    .where(and(...filters))
    .orderBy(
      asc(
        sql`COALESCE(${schema.taskTable.startDate}, ${schema.taskTable.dueDate})`,
      ),
    );

  const assignees = await listTaskAssignees(rows.map((task) => task.id));

  return rows
    .filter(
      (task) =>
        task.startDate || task.dueDate || input.taskIds?.includes(task.id),
    )
    .map((task) => {
      const start = task.startDate ?? task.dueDate;
      const end = task.dueDate ?? task.startDate;

      return {
        id: task.id,
        eventId: null,
        type: "task" as const,
        title: task.title,
        description: task.description,
        start: start?.toISOString() ?? new Date().toISOString(),
        end:
          end?.toISOString() ??
          start?.toISOString() ??
          new Date().toISOString(),
        seriesStart: null,
        seriesEnd: null,
        allDay: true,
        workspaceId: task.workspaceId,
        workspaceName: task.workspaceName,
        projectId: task.projectId,
        projectName: task.projectName,
        taskId: task.id,
        taskNumber: task.number,
        taskStartDate: toIsoString(task.startDate),
        taskDueDate: toIsoString(task.dueDate),
        status: task.status,
        priority: task.priority,
        location: null,
        meetingType: null,
        visibility: null,
        recurrenceFrequency: null,
        recurrenceUntil: null,
        assignees: assignees.get(task.id) ?? [],
        attendees: [],
        reminders: [],
        createdByUserId: null,
      };
    });
}

async function getEventOrThrow(eventId: string) {
  const [event] = await db
    .select()
    .from(schema.calendarEventTable)
    .where(eq(schema.calendarEventTable.id, eventId))
    .limit(1);

  if (!event) {
    throw new HTTPException(404, { message: "Calendar event not found." });
  }

  return event;
}

async function eventSummary(eventId: string) {
  const event = await getEventOrThrow(eventId);
  const [item] = await listEventItems({
    from: event.startAt,
    to: event.endAt,
    workspaceIds: [event.workspaceId],
    currentUserId: event.createdByUserId ?? "",
  });
  return item;
}

async function createEvent(
  input: v.InferInput<typeof eventInputSchema>,
  currentUserId: string,
) {
  const startAt = parseDate(input.startAt, "startAt");
  const endAt = parseDate(input.endAt, "endAt");
  const recurrenceUntil = parseOptionalDate(
    input.recurrenceUntil,
    "recurrenceUntil",
  );
  assertValidRange(startAt, endAt);

  await assertProjectInWorkspace(input.projectId, input.workspaceId);
  await assertTaskInWorkspace(input.taskId, input.workspaceId, input.projectId);

  const [event] = await db
    .insert(schema.calendarEventTable)
    .values({
      workspaceId: input.workspaceId,
      projectId: input.projectId || null,
      taskId: input.taskId || null,
      title: input.title,
      description: input.description || null,
      startAt,
      endAt,
      allDay: input.allDay ?? false,
      location: input.location || null,
      meetingType: input.meetingType ?? "online",
      visibility: input.visibility ?? "workspace",
      status: input.status ?? "confirmed",
      recurrenceFrequency: input.recurrenceFrequency ?? "none",
      recurrenceUntil:
        input.recurrenceFrequency && input.recurrenceFrequency !== "none"
          ? (recurrenceUntil ?? null)
          : null,
      createdByUserId: currentUserId,
    })
    .returning();

  if (!event) {
    throw new HTTPException(500, { message: "Failed to create event." });
  }

  await setEventAttendees(event.id, event.workspaceId, input.attendeeIds ?? []);
  await setEventReminders(event.id, event.startAt, input.reminders);

  return eventSummary(event.id);
}

async function updateEvent(
  eventId: string,
  input: v.InferInput<typeof updateEventInputSchema>,
) {
  const event = await getEventOrThrow(eventId);
  const startAt =
    input.startAt !== undefined
      ? parseDate(input.startAt, "startAt")
      : event.startAt;
  const endAt =
    input.endAt !== undefined ? parseDate(input.endAt, "endAt") : event.endAt;
  const recurrenceUntil = parseOptionalDate(
    input.recurrenceUntil,
    "recurrenceUntil",
  );
  assertValidRange(startAt, endAt);

  const nextProjectId =
    input.projectId !== undefined ? input.projectId || null : event.projectId;
  const nextTaskId =
    input.taskId !== undefined ? input.taskId || null : event.taskId;

  await assertProjectInWorkspace(nextProjectId, event.workspaceId);
  await assertTaskInWorkspace(nextTaskId, event.workspaceId, nextProjectId);

  const [updated] = await db
    .update(schema.calendarEventTable)
    .set({
      ...(input.projectId !== undefined ? { projectId: nextProjectId } : {}),
      ...(input.taskId !== undefined ? { taskId: nextTaskId } : {}),
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.description !== undefined
        ? { description: input.description || null }
        : {}),
      ...(input.startAt !== undefined ? { startAt } : {}),
      ...(input.endAt !== undefined ? { endAt } : {}),
      ...(input.allDay !== undefined ? { allDay: input.allDay } : {}),
      ...(input.location !== undefined
        ? { location: input.location || null }
        : {}),
      ...(input.meetingType !== undefined
        ? { meetingType: input.meetingType }
        : {}),
      ...(input.visibility !== undefined
        ? { visibility: input.visibility }
        : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.recurrenceFrequency !== undefined
        ? { recurrenceFrequency: input.recurrenceFrequency }
        : {}),
      ...(input.recurrenceUntil !== undefined
        ? { recurrenceUntil }
        : input.recurrenceFrequency === "none"
          ? { recurrenceUntil: null }
          : {}),
    })
    .where(eq(schema.calendarEventTable.id, eventId))
    .returning();

  if (!updated) {
    throw new HTTPException(500, { message: "Failed to update event." });
  }

  if (input.attendeeIds !== undefined) {
    await setEventAttendees(eventId, updated.workspaceId, input.attendeeIds);
  }
  if (input.reminders !== undefined) {
    await setEventReminders(eventId, updated.startAt, input.reminders);
  } else if (input.startAt !== undefined) {
    await setEventReminders(
      eventId,
      updated.startAt,
      await getEventReminderInputs(eventId),
    );
  }

  return eventSummary(eventId);
}

async function updateTaskDates(input: {
  taskId: string;
  startDate?: Date | null;
  dueDate?: Date | null;
  currentUserId: string;
}) {
  const [existing] = await db
    .select({
      id: schema.taskTable.id,
      title: schema.taskTable.title,
      projectId: schema.taskTable.projectId,
      startDate: schema.taskTable.startDate,
      dueDate: schema.taskTable.dueDate,
      workspaceId: schema.projectTable.workspaceId,
    })
    .from(schema.taskTable)
    .innerJoin(
      schema.projectTable,
      eq(schema.taskTable.projectId, schema.projectTable.id),
    )
    .where(eq(schema.taskTable.id, input.taskId))
    .limit(1);

  if (!existing) {
    throw new HTTPException(404, { message: "Task not found." });
  }

  const nextStartDate =
    input.startDate !== undefined ? input.startDate : existing.startDate;
  const nextDueDate =
    input.dueDate !== undefined ? input.dueDate : existing.dueDate;

  if (
    nextStartDate &&
    nextDueDate &&
    nextDueDate.getTime() < nextStartDate.getTime()
  ) {
    throw new HTTPException(400, {
      message: "Task due date must be after the start date.",
    });
  }

  await db
    .delete(schema.taskReminderSentTable)
    .where(eq(schema.taskReminderSentTable.taskId, input.taskId));

  const [updated] = await db
    .update(schema.taskTable)
    .set({
      ...(input.startDate !== undefined ? { startDate: input.startDate } : {}),
      ...(input.dueDate !== undefined ? { dueDate: input.dueDate } : {}),
    })
    .where(eq(schema.taskTable.id, input.taskId))
    .returning();

  if (!updated) {
    throw new HTTPException(500, { message: "Failed to update task dates." });
  }

  const dueChanged = existing.dueDate?.getTime() !== updated.dueDate?.getTime();
  if (dueChanged) {
    await publishEvent("task.due_date_changed", {
      taskId: updated.id,
      projectId: updated.projectId,
      userId: input.currentUserId,
      oldDueDate: existing.dueDate,
      newDueDate: updated.dueDate,
      title: updated.title,
      type: "due_date_changed",
    });
  }

  await createActivity(updated.id, "task", input.currentUserId, null, {
    source: "calendar",
    oldStartDate: toIsoString(existing.startDate),
    newStartDate: toIsoString(updated.startDate),
    oldDueDate: toIsoString(existing.dueDate),
    newDueDate: toIsoString(updated.dueDate),
  });

  await publishEvent("task.updated", {
    taskId: updated.id,
    projectId: updated.projectId,
    title: updated.title,
    status: updated.status,
    userId: input.currentUserId,
  });

  const [item] = await listTaskItems({
    from: updated.startDate ?? updated.dueDate ?? new Date(0),
    to: updated.dueDate ?? updated.startDate ?? new Date(8640000000000000),
    workspaceIds: [existing.workspaceId],
    currentUserId: input.currentUserId,
    taskIds: [updated.id],
  });

  return item;
}

const calendar = new Hono<{
  Variables: {
    userId: string;
    workspaceId: string;
    apiKey?: { id: string; permissions: Record<string, string[]> | null };
    user?: { role?: string | null } | null;
  };
}>()
  .get(
    "/",
    describeRoute({
      operationId: "listCalendarItems",
      tags: ["Calendar"],
      description: "List task and event calendar items for a date range.",
      responses: {
        200: {
          description: "Calendar items",
          content: {
            "application/json": {
              schema: resolver(
                v.object({ items: v.array(calendarItemSchema) }),
              ),
            },
          },
        },
      },
    }),
    validator("query", listCalendarQuerySchema),
    async (c) => {
      const query = c.req.valid("query");
      const from = parseDate(query.from, "from");
      const to = parseDate(query.to, "to");
      const workspaceIds = await accessibleWorkspaceIds(c, query.workspaceId);
      const currentUserId = c.get("userId");

      const [taskItems, eventItems] = await Promise.all([
        query.type === "event" || query.attendeeId
          ? Promise.resolve([])
          : listTaskItems({
              from,
              to,
              workspaceIds,
              projectId: query.projectId,
              assigneeId: query.assigneeId,
              status: query.status,
              priority: query.priority,
              mine: query.mine === "true",
              currentUserId,
            }),
        query.type === "task" || query.priority || query.assigneeId
          ? Promise.resolve([])
          : listEventItems({
              from,
              to,
              workspaceIds,
              projectId: query.projectId,
              attendeeId: query.attendeeId,
              status: query.status,
              mine: query.mine === "true",
              currentUserId,
            }),
      ]);

      const items = [...taskItems, ...eventItems].sort(
        (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime(),
      );

      return c.json({ items });
    },
  )
  .post("/events", validator("json", eventInputSchema), async (c) => {
    const input = c.req.valid("json");
    await requireCalendarPermission(c, input.workspaceId, "create");
    const item = await createEvent(input, c.get("userId"));
    return c.json({ item });
  })
  .patch(
    "/events/:eventId",
    validator("param", v.object({ eventId: v.string() })),
    validator("json", updateEventInputSchema),
    async (c) => {
      const { eventId } = c.req.valid("param");
      const event = await getEventOrThrow(eventId);
      await requireCalendarPermission(c, event.workspaceId, "update");
      const item = await updateEvent(eventId, c.req.valid("json"));
      return c.json({ item });
    },
  )
  .delete(
    "/events/:eventId",
    validator("param", v.object({ eventId: v.string() })),
    async (c) => {
      const { eventId } = c.req.valid("param");
      const event = await getEventOrThrow(eventId);
      await requireCalendarPermission(c, event.workspaceId, "delete");
      await db
        .delete(schema.calendarEventTable)
        .where(eq(schema.calendarEventTable.id, eventId));
      return c.json({ ok: true });
    },
  )
  .patch(
    "/tasks/:taskId/dates",
    validator("param", v.object({ taskId: v.string() })),
    validator("json", updateTaskDatesSchema),
    async (c) => {
      const { taskId } = c.req.valid("param");
      const input = c.req.valid("json");
      const [task] = await db
        .select({ workspaceId: schema.projectTable.workspaceId })
        .from(schema.taskTable)
        .innerJoin(
          schema.projectTable,
          eq(schema.taskTable.projectId, schema.projectTable.id),
        )
        .where(eq(schema.taskTable.id, taskId))
        .limit(1);

      if (!task) {
        throw new HTTPException(404, { message: "Task not found." });
      }

      await requireCalendarPermission(c, task.workspaceId, "update");
      if (!(await hasWorkspacePermission(c, { task: ["update"] }))) {
        throw new HTTPException(403, { message: "Insufficient permissions" });
      }

      const item = await updateTaskDates({
        taskId,
        startDate: parseOptionalDate(input.startDate, "startDate"),
        dueDate: parseOptionalDate(input.dueDate, "dueDate"),
        currentUserId: c.get("userId"),
      });

      return c.json({ item });
    },
  );

export default calendar;
