import { and, asc, eq, inArray, max } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../database";
import {
  columnTable,
  type TaskCustomFieldType,
  taskChecklistItemTable,
  taskCustomFieldTable,
  taskTable,
} from "../database/schema";

export const CUSTOM_FIELD_TYPES = [
  "text",
  "number",
  "date",
  "url",
  "checkbox",
] as const satisfies readonly TaskCustomFieldType[];

export async function listTaskQuality(taskIds: string[]) {
  const [customFields, checklistItems] = await Promise.all([
    db
      .select()
      .from(taskCustomFieldTable)
      .where(inArray(taskCustomFieldTable.taskId, taskIds))
      .orderBy(asc(taskCustomFieldTable.position)),
    db
      .select({
        id: taskChecklistItemTable.id,
        taskId: taskChecklistItemTable.taskId,
        title: taskChecklistItemTable.title,
        isCompleted: taskChecklistItemTable.isCompleted,
        isRequired: taskChecklistItemTable.isRequired,
        requiredBeforeColumnId: taskChecklistItemTable.requiredBeforeColumnId,
        requiredBeforeColumnName: columnTable.name,
        requiredBeforeColumnSlug: columnTable.slug,
        position: taskChecklistItemTable.position,
        completedByUserId: taskChecklistItemTable.completedByUserId,
        completedAt: taskChecklistItemTable.completedAt,
        createdAt: taskChecklistItemTable.createdAt,
        updatedAt: taskChecklistItemTable.updatedAt,
      })
      .from(taskChecklistItemTable)
      .leftJoin(
        columnTable,
        eq(taskChecklistItemTable.requiredBeforeColumnId, columnTable.id),
      )
      .where(inArray(taskChecklistItemTable.taskId, taskIds))
      .orderBy(asc(taskChecklistItemTable.position)),
  ]);

  const customFieldsByTask = new Map<string, (typeof customFields)[number][]>();
  const checklistItemsByTask = new Map<
    string,
    (typeof checklistItems)[number][]
  >();

  for (const field of customFields) {
    const current = customFieldsByTask.get(field.taskId) ?? [];
    current.push(field);
    customFieldsByTask.set(field.taskId, current);
  }
  for (const item of checklistItems) {
    const current = checklistItemsByTask.get(item.taskId) ?? [];
    current.push(item);
    checklistItemsByTask.set(item.taskId, current);
  }

  return { customFieldsByTask, checklistItemsByTask };
}

async function getTaskProjectId(taskId: string) {
  const task = await db.query.taskTable.findFirst({
    columns: { projectId: true },
    where: eq(taskTable.id, taskId),
  });
  if (!task) throw new HTTPException(404, { message: "Task not found" });
  return task.projectId;
}

async function assertColumnBelongsToTask(
  taskId: string,
  columnId: string | null | undefined,
) {
  if (!columnId) return;
  const projectId = await getTaskProjectId(taskId);
  const column = await db.query.columnTable.findFirst({
    columns: { id: true },
    where: and(
      eq(columnTable.id, columnId),
      eq(columnTable.projectId, projectId),
    ),
  });
  if (!column) {
    throw new HTTPException(400, {
      message: "Checklist target column does not belong to this project",
    });
  }
}

export async function createTaskCustomField(input: {
  taskId: string;
  name: string;
  type: TaskCustomFieldType;
  value: string;
  showOnCard: boolean;
}) {
  const [position] = await db
    .select({ value: max(taskCustomFieldTable.position) })
    .from(taskCustomFieldTable)
    .where(eq(taskCustomFieldTable.taskId, input.taskId));
  const [created] = await db
    .insert(taskCustomFieldTable)
    .values({
      ...input,
      name: input.name.trim(),
      position: (position?.value ?? -1) + 1,
    })
    .returning();
  if (!created) {
    throw new HTTPException(500, {
      message: "Failed to create custom field",
    });
  }
  return created;
}

export async function updateTaskCustomField(
  taskId: string,
  fieldId: string,
  input: Partial<{
    name: string;
    type: TaskCustomFieldType;
    value: string;
    showOnCard: boolean;
    position: number;
  }>,
) {
  const [updated] = await db
    .update(taskCustomFieldTable)
    .set({
      ...input,
      name: input.name?.trim(),
    })
    .where(
      and(
        eq(taskCustomFieldTable.id, fieldId),
        eq(taskCustomFieldTable.taskId, taskId),
      ),
    )
    .returning();
  if (!updated) {
    throw new HTTPException(404, { message: "Custom field not found" });
  }
  return updated;
}

export async function deleteTaskCustomField(taskId: string, fieldId: string) {
  const [deleted] = await db
    .delete(taskCustomFieldTable)
    .where(
      and(
        eq(taskCustomFieldTable.id, fieldId),
        eq(taskCustomFieldTable.taskId, taskId),
      ),
    )
    .returning();
  if (!deleted) {
    throw new HTTPException(404, { message: "Custom field not found" });
  }
  return deleted;
}

export async function createTaskChecklistItem(input: {
  taskId: string;
  title: string;
  isRequired: boolean;
  requiredBeforeColumnId?: string | null;
}) {
  await assertColumnBelongsToTask(input.taskId, input.requiredBeforeColumnId);
  const [position] = await db
    .select({ value: max(taskChecklistItemTable.position) })
    .from(taskChecklistItemTable)
    .where(eq(taskChecklistItemTable.taskId, input.taskId));
  const [created] = await db
    .insert(taskChecklistItemTable)
    .values({
      ...input,
      title: input.title.trim(),
      requiredBeforeColumnId: input.requiredBeforeColumnId ?? null,
      position: (position?.value ?? -1) + 1,
    })
    .returning();
  if (!created) {
    throw new HTTPException(500, {
      message: "Failed to create checklist item",
    });
  }
  return created;
}

export async function updateTaskChecklistItem(
  taskId: string,
  itemId: string,
  currentUserId: string,
  input: Partial<{
    title: string;
    isCompleted: boolean;
    isRequired: boolean;
    requiredBeforeColumnId: string | null;
    position: number;
  }>,
) {
  if (input.requiredBeforeColumnId !== undefined) {
    await assertColumnBelongsToTask(taskId, input.requiredBeforeColumnId);
  }
  const completedPatch =
    input.isCompleted === undefined
      ? {}
      : {
          completedAt: input.isCompleted ? new Date() : null,
          completedByUserId: input.isCompleted ? currentUserId : null,
        };
  const [updated] = await db
    .update(taskChecklistItemTable)
    .set({
      ...input,
      ...completedPatch,
      title: input.title?.trim(),
    })
    .where(
      and(
        eq(taskChecklistItemTable.id, itemId),
        eq(taskChecklistItemTable.taskId, taskId),
      ),
    )
    .returning();
  if (!updated) {
    throw new HTTPException(404, { message: "Checklist item not found" });
  }
  return updated;
}

export async function deleteTaskChecklistItem(taskId: string, itemId: string) {
  const [deleted] = await db
    .delete(taskChecklistItemTable)
    .where(
      and(
        eq(taskChecklistItemTable.id, itemId),
        eq(taskChecklistItemTable.taskId, taskId),
      ),
    )
    .returning();
  if (!deleted) {
    throw new HTTPException(404, { message: "Checklist item not found" });
  }
  return deleted;
}

export async function assertTaskChecklistAllowsStatus(
  taskId: string,
  projectId: string,
  status: string,
) {
  const destination = await db.query.columnTable.findFirst({
    columns: { id: true, name: true },
    where: and(
      eq(columnTable.projectId, projectId),
      eq(columnTable.slug, status),
    ),
  });
  if (!destination) return;

  const pending = await db
    .select({ title: taskChecklistItemTable.title })
    .from(taskChecklistItemTable)
    .where(
      and(
        eq(taskChecklistItemTable.taskId, taskId),
        eq(taskChecklistItemTable.isRequired, true),
        eq(taskChecklistItemTable.isCompleted, false),
        eq(taskChecklistItemTable.requiredBeforeColumnId, destination.id),
      ),
    );

  if (pending.length > 0) {
    throw new HTTPException(409, {
      message: JSON.stringify({
        code: "CHECKLIST_REQUIRED",
        column: destination.name,
        pending: pending.map((item) => item.title),
      }),
    });
  }
}
