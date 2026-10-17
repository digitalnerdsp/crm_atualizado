import { and, asc, eq, isNotNull, lte, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import rrule, { type Weekday } from "rrule";
import db from "../database";
import {
  columnTable,
  labelTable,
  projectTable,
  taskChecklistItemTable,
  taskCustomFieldTable,
  taskRecurrenceTable,
  taskTable,
} from "../database/schema";
import { getRuntimeSetting } from "../settings/runtime-settings";
import { listTaskAssignees } from "./assignees";
import createTask from "./controllers/create-task";

const { RRule } = rrule;

export const RECURRENCE_FREQUENCIES = ["daily", "weekly", "monthly"] as const;

export type RecurrenceFrequency = (typeof RECURRENCE_FREQUENCIES)[number];

export type RecurrenceInput = {
  frequency: RecurrenceFrequency;
  interval?: number;
  weekdays?: number[];
  endsAt?: Date;
  maxOccurrences?: number;
};

type StoredRecurrence = typeof taskRecurrenceTable.$inferSelect;

const WEEKDAYS: Weekday[] = [
  RRule.SU,
  RRule.MO,
  RRule.TU,
  RRule.WE,
  RRule.TH,
  RRule.FR,
  RRule.SA,
];
const MAX_GENERATION_BATCH = 100;
const DEFAULT_LOOKAHEAD_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

function assertValidTimezone(timezone: string): string {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format();
    return timezone;
  } catch {
    return "UTC";
  }
}

function normalizeInput(
  input: RecurrenceInput,
  startsAt: Date,
): Required<Pick<RecurrenceInput, "frequency" | "interval" | "weekdays">> &
  Pick<RecurrenceInput, "endsAt" | "maxOccurrences"> {
  if (!RECURRENCE_FREQUENCIES.includes(input.frequency)) {
    throw new HTTPException(400, {
      message: "Unsupported recurrence frequency",
    });
  }

  const interval = input.interval ?? 1;
  if (!Number.isInteger(interval) || interval < 1 || interval > 30) {
    throw new HTTPException(400, {
      message: "Recurrence interval must be between 1 and 30",
    });
  }

  const weekdays = [
    ...new Set(
      (input.weekdays ?? []).filter(
        (day) => Number.isInteger(day) && day >= 0 && day <= 6,
      ),
    ),
  ].sort();

  if (input.frequency === "weekly" && weekdays.length === 0) {
    weekdays.push(startsAt.getUTCDay());
  }

  if (
    input.maxOccurrences !== undefined &&
    (!Number.isInteger(input.maxOccurrences) ||
      input.maxOccurrences < 2 ||
      input.maxOccurrences > 1000)
  ) {
    throw new HTTPException(400, {
      message: "Occurrence count must be between 2 and 1000",
    });
  }

  if (input.endsAt && input.endsAt < startsAt) {
    throw new HTTPException(400, {
      message: "Recurrence end date cannot be before the first due date",
    });
  }

  if (input.endsAt && input.maxOccurrences) {
    throw new HTTPException(400, {
      message: "Choose either an end date or an occurrence count",
    });
  }

  return {
    frequency: input.frequency,
    interval,
    weekdays,
    endsAt: input.endsAt,
    maxOccurrences: input.maxOccurrences,
  };
}

function buildRule(rule: {
  frequency: string;
  interval: number;
  weekdays: number[];
  startsAt: Date;
  endsAt: Date | null;
  maxOccurrences: number | null;
}) {
  const frequencyMap: Record<RecurrenceFrequency, number> = {
    daily: RRule.DAILY,
    weekly: RRule.WEEKLY,
    monthly: RRule.MONTHLY,
  };
  const frequency = rule.frequency as RecurrenceFrequency;

  return new RRule({
    freq: frequencyMap[frequency],
    interval: rule.interval,
    dtstart: rule.startsAt,
    until: rule.endsAt ?? undefined,
    count: rule.maxOccurrences ?? undefined,
    byweekday:
      frequency === "weekly"
        ? rule.weekdays
            .map((day) => WEEKDAYS[day])
            .filter((weekday): weekday is Weekday => weekday !== undefined)
        : undefined,
    bymonthday:
      frequency === "monthly" ? rule.startsAt.getUTCDate() : undefined,
  });
}

function nextOccurrence(rule: StoredRecurrence, after: Date): Date | null {
  return buildRule(rule).after(after, false);
}

export function serializeRecurrence(rule: StoredRecurrence) {
  return {
    id: rule.id,
    sourceTaskId: rule.sourceTaskId,
    frequency: rule.frequency as RecurrenceFrequency,
    interval: rule.interval,
    weekdays: rule.weekdays,
    startsAt: rule.startsAt,
    endsAt: rule.endsAt,
    maxOccurrences: rule.maxOccurrences,
    generatedOccurrences: rule.generatedOccurrences,
    nextOccurrenceAt: rule.nextOccurrenceAt,
    timezone: rule.timezone,
    isActive: rule.isActive,
  };
}

export async function createTaskRecurrence(input: {
  taskId: string;
  projectId: string;
  dueDate: Date;
  startDate?: Date;
  status: string;
  currentUserId: string;
  recurrence: RecurrenceInput;
}) {
  const normalized = normalizeInput(input.recurrence, input.dueDate);
  const timezone = assertValidTimezone(
    await getRuntimeSetting("instance.timezone"),
  );
  const draftRule = {
    frequency: normalized.frequency,
    interval: normalized.interval,
    weekdays: normalized.weekdays,
    startsAt: input.dueDate,
    endsAt: normalized.endsAt ?? null,
    maxOccurrences: normalized.maxOccurrences ?? null,
  };
  const next = buildRule(draftRule).after(input.dueDate, false);

  const rule = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(taskRecurrenceTable)
      .values({
        projectId: input.projectId,
        sourceTaskId: input.taskId,
        createdByUserId: input.currentUserId,
        ...draftRule,
        generatedOccurrences: 1,
        nextOccurrenceAt: next,
        timezone,
        initialStatus: input.status,
        startOffsetMinutes: input.startDate
          ? Math.max(
              0,
              Math.round(
                (input.dueDate.getTime() - input.startDate.getTime()) / 60000,
              ),
            )
          : null,
        isActive: next !== null,
      })
      .returning();

    if (!created) {
      throw new HTTPException(500, {
        message: "Failed to create task recurrence",
      });
    }

    await tx
      .update(taskTable)
      .set({ recurrenceId: created.id })
      .where(eq(taskTable.id, input.taskId));

    return created;
  });

  return serializeRecurrence(rule);
}

export async function getTaskRecurrence(taskId: string) {
  const [rule] = await db
    .select({ recurrence: taskRecurrenceTable })
    .from(taskTable)
    .innerJoin(
      taskRecurrenceTable,
      eq(taskTable.recurrenceId, taskRecurrenceTable.id),
    )
    .where(eq(taskTable.id, taskId))
    .limit(1);

  return rule ? serializeRecurrence(rule.recurrence) : null;
}

export async function updateTaskRecurrence(
  taskId: string,
  input: RecurrenceInput & { isActive?: boolean },
) {
  const [current] = await db
    .select({ recurrence: taskRecurrenceTable })
    .from(taskTable)
    .innerJoin(
      taskRecurrenceTable,
      eq(taskTable.recurrenceId, taskRecurrenceTable.id),
    )
    .where(eq(taskTable.id, taskId))
    .limit(1);

  if (!current) {
    throw new HTTPException(404, { message: "Task recurrence not found" });
  }

  const normalized = normalizeInput(input, current.recurrence.startsAt);
  const nextRule = {
    ...current.recurrence,
    frequency: normalized.frequency,
    interval: normalized.interval,
    weekdays: normalized.weekdays,
    endsAt: normalized.endsAt ?? null,
    maxOccurrences: normalized.maxOccurrences ?? null,
  };
  const requestedActive = input.isActive ?? current.recurrence.isActive;
  const next = requestedActive
    ? nextOccurrence(nextRule, new Date())
    : current.recurrence.nextOccurrenceAt;

  const [updated] = await db
    .update(taskRecurrenceTable)
    .set({
      frequency: normalized.frequency,
      interval: normalized.interval,
      weekdays: normalized.weekdays,
      endsAt: normalized.endsAt ?? null,
      maxOccurrences: normalized.maxOccurrences ?? null,
      nextOccurrenceAt: requestedActive ? next : null,
      isActive: requestedActive && next !== null,
    })
    .where(eq(taskRecurrenceTable.id, current.recurrence.id))
    .returning();

  if (!updated) {
    throw new HTTPException(500, {
      message: "Failed to update task recurrence",
    });
  }

  return serializeRecurrence(updated);
}

export async function setTaskRecurrenceActive(
  taskId: string,
  isActive: boolean,
) {
  const recurrence = await getTaskRecurrence(taskId);
  if (!recurrence) {
    throw new HTTPException(404, { message: "Task recurrence not found" });
  }

  return updateTaskRecurrence(taskId, {
    frequency: recurrence.frequency,
    interval: recurrence.interval,
    weekdays: recurrence.weekdays,
    endsAt: recurrence.endsAt ?? undefined,
    maxOccurrences: recurrence.maxOccurrences ?? undefined,
    isActive,
  });
}

async function resolveOccurrenceStatus(rule: StoredRecurrence) {
  const [configured] = await db
    .select({ slug: columnTable.slug })
    .from(columnTable)
    .where(
      and(
        eq(columnTable.projectId, rule.projectId),
        eq(columnTable.slug, rule.initialStatus),
      ),
    )
    .limit(1);
  if (configured) return configured.slug;

  const [fallback] = await db
    .select({ slug: columnTable.slug })
    .from(columnTable)
    .where(eq(columnTable.projectId, rule.projectId))
    .orderBy(asc(columnTable.position))
    .limit(1);
  return fallback?.slug ?? "to-do";
}

async function generateOccurrence(rule: StoredRecurrence, scheduledFor: Date) {
  const [source] = await db
    .select({
      task: taskTable,
      workspaceId: projectTable.workspaceId,
      projectArchivedAt: projectTable.archivedAt,
    })
    .from(taskTable)
    .innerJoin(projectTable, eq(taskTable.projectId, projectTable.id))
    .where(eq(taskTable.id, rule.sourceTaskId ?? ""))
    .limit(1);

  if (!source || source.projectArchivedAt) {
    await db
      .update(taskRecurrenceTable)
      .set({ isActive: false, nextOccurrenceAt: null })
      .where(eq(taskRecurrenceTable.id, rule.id));
    return false;
  }

  const assignees = await listTaskAssignees([source.task.id]);
  const status = await resolveOccurrenceStatus(rule);
  const startDate =
    rule.startOffsetMinutes === null
      ? undefined
      : new Date(scheduledFor.getTime() - rule.startOffsetMinutes * 60 * 1000);

  const created = await createTask({
    projectId: rule.projectId,
    currentUserId: rule.createdByUserId ?? "",
    assigneeIds: (assignees.get(source.task.id) ?? []).map(
      (assignee) => assignee.id,
    ),
    title: source.task.title,
    status,
    startDate,
    dueDate: scheduledFor,
    description: source.task.description ?? "",
    priority: source.task.priority ?? "no-priority",
    recurrenceId: rule.id,
  });

  const sourceLabels = await db
    .select({
      name: labelTable.name,
      color: labelTable.color,
    })
    .from(labelTable)
    .where(eq(labelTable.taskId, source.task.id));

  if (sourceLabels.length > 0) {
    await db
      .insert(labelTable)
      .values(
        sourceLabels.map((label) => ({
          ...label,
          taskId: created.id,
          workspaceId: source.workspaceId,
        })),
      )
      .onConflictDoNothing({
        target: [labelTable.taskId, labelTable.name],
      });
  }

  const [customFields, checklistItems] = await Promise.all([
    db
      .select()
      .from(taskCustomFieldTable)
      .where(eq(taskCustomFieldTable.taskId, source.task.id)),
    db
      .select()
      .from(taskChecklistItemTable)
      .where(eq(taskChecklistItemTable.taskId, source.task.id)),
  ]);

  if (customFields.length > 0) {
    await db.insert(taskCustomFieldTable).values(
      customFields.map(
        ({ id: _id, createdAt: _created, updatedAt: _updated, ...field }) => ({
          ...field,
          taskId: created.id,
        }),
      ),
    );
  }
  if (checklistItems.length > 0) {
    await db.insert(taskChecklistItemTable).values(
      checklistItems.map(
        ({
          id: _id,
          createdAt: _created,
          updatedAt: _updated,
          completedAt: _completedAt,
          completedByUserId: _completedBy,
          ...item
        }) => ({
          ...item,
          taskId: created.id,
          isCompleted: false,
        }),
      ),
    );
  }

  return true;
}

export async function generateRecurringTasks(
  now = new Date(),
  recurrenceId?: string,
) {
  const lookaheadDays = Math.max(
    1,
    Math.min(
      90,
      Number(process.env.TASK_RECURRENCE_LOOKAHEAD_DAYS) ||
        DEFAULT_LOOKAHEAD_DAYS,
    ),
  );
  const horizon = new Date(now.getTime() + lookaheadDays * DAY_MS);

  return db.transaction(async (tx) => {
    const lockResult = await tx.execute<{ acquired: boolean }>(
      sql`SELECT pg_try_advisory_xact_lock(20410827) AS acquired`,
    );
    if (!lockResult.rows[0]?.acquired) return 0;

    const rules = await tx
      .select()
      .from(taskRecurrenceTable)
      .where(
        and(
          eq(taskRecurrenceTable.isActive, true),
          isNotNull(taskRecurrenceTable.nextOccurrenceAt),
          lte(taskRecurrenceTable.nextOccurrenceAt, horizon),
          recurrenceId ? eq(taskRecurrenceTable.id, recurrenceId) : undefined,
        ),
      )
      .orderBy(asc(taskRecurrenceTable.nextOccurrenceAt));

    let generated = 0;

    for (const storedRule of rules) {
      let rule = storedRule;
      let scheduledFor = rule.nextOccurrenceAt;
      let attempts = 0;

      while (
        scheduledFor &&
        scheduledFor <= horizon &&
        attempts < MAX_GENERATION_BATCH
      ) {
        attempts += 1;
        let wasCreated = false;

        try {
          wasCreated = await generateOccurrence(rule, scheduledFor);
        } catch (error) {
          const code =
            error && typeof error === "object" && "code" in error
              ? String(error.code)
              : "";
          if (code !== "23505") throw error;
        }

        const [countResult] = await db
          .select({ count: sql<number>`count(*)` })
          .from(taskTable)
          .where(eq(taskTable.recurrenceId, rule.id));
        const generatedOccurrences = Number(countResult?.count ?? 0);
        const next = nextOccurrence(rule, scheduledFor);

        const [updated] = await tx
          .update(taskRecurrenceTable)
          .set({
            generatedOccurrences,
            nextOccurrenceAt: next,
            isActive: next !== null,
          })
          .where(eq(taskRecurrenceTable.id, rule.id))
          .returning();

        if (!updated) break;
        rule = updated;
        scheduledFor = next;
        if (wasCreated) generated += 1;
      }
    }

    return generated;
  });
}
