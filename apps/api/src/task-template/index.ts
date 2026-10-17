import { and, asc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { validator } from "hono-openapi";
import * as v from "valibot";
import db from "../database";
import {
  columnTable,
  projectTable,
  taskChecklistItemTable,
  taskCustomFieldTable,
  taskRelationTable,
  taskTable,
  taskTemplateTable,
} from "../database/schema";
import createTask from "../task/controllers/create-task";
import { CUSTOM_FIELD_TYPES, listTaskQuality } from "../task/quality";
import { requireWorkspacePermission } from "../utils/require-workspace-permission";
import { workspaceAccess } from "../utils/workspace-access-middleware";

const customFieldSchema = v.object({
  name: v.pipe(v.string(), v.minLength(1), v.maxLength(80)),
  type: v.picklist(CUSTOM_FIELD_TYPES),
  value: v.optional(v.pipe(v.string(), v.maxLength(2000)), ""),
  showOnCard: v.optional(v.boolean(), false),
});

const checklistItemSchema = v.object({
  title: v.pipe(v.string(), v.minLength(1), v.maxLength(240)),
  isRequired: v.optional(v.boolean(), true),
  requiredBeforeColumnSlug: v.optional(v.string()),
});

const subtaskSchema = v.object({
  title: v.pipe(v.string(), v.minLength(1), v.maxLength(240)),
  description: v.optional(v.pipe(v.string(), v.maxLength(20_000)), ""),
  priority: v.optional(v.string(), "no-priority"),
});

const templateFieldsSchema = {
  name: v.pipe(v.string(), v.minLength(1), v.maxLength(120)),
  title: v.pipe(v.string(), v.minLength(1), v.maxLength(240)),
  description: v.optional(v.pipe(v.string(), v.maxLength(20_000)), ""),
  priority: v.optional(v.string(), "no-priority"),
  initialStatus: v.optional(v.string(), "to-do"),
  customFields: v.optional(v.array(customFieldSchema), []),
  checklistItems: v.optional(v.array(checklistItemSchema), []),
  subtasks: v.optional(v.array(subtaskSchema), []),
};

async function instantiateTemplate(input: {
  templateId: string;
  projectId: string;
  currentUserId: string;
}) {
  const [template, project, columns] = await Promise.all([
    db.query.taskTemplateTable.findFirst({
      where: eq(taskTemplateTable.id, input.templateId),
    }),
    db.query.projectTable.findFirst({
      where: eq(projectTable.id, input.projectId),
    }),
    db
      .select()
      .from(columnTable)
      .where(eq(columnTable.projectId, input.projectId))
      .orderBy(asc(columnTable.position)),
  ]);
  if (!template || !project) {
    throw new HTTPException(404, { message: "Template or project not found" });
  }
  if (template.workspaceId !== project.workspaceId) {
    throw new HTTPException(400, {
      message: "Template and project must belong to the same workspace",
    });
  }
  const initialColumn =
    columns.find((column) => column.slug === template.initialStatus) ??
    columns[0];
  if (!initialColumn) {
    throw new HTTPException(400, { message: "Project has no workflow" });
  }

  const task = await createTask({
    projectId: project.id,
    currentUserId: input.currentUserId,
    title: template.title,
    description: template.description,
    priority: template.priority,
    status: initialColumn.slug,
  });

  if (template.customFields.length > 0) {
    await db.insert(taskCustomFieldTable).values(
      template.customFields.map((field, position) => ({
        ...field,
        taskId: task.id,
        position,
      })),
    );
  }
  if (template.checklistItems.length > 0) {
    await db.insert(taskChecklistItemTable).values(
      template.checklistItems.map((item, position) => ({
        taskId: task.id,
        title: item.title,
        isRequired: item.isRequired,
        requiredBeforeColumnId:
          columns.find(
            (column) => column.slug === item.requiredBeforeColumnSlug,
          )?.id ?? null,
        position,
      })),
    );
  }
  for (const subtaskTemplate of template.subtasks) {
    const subtask = await createTask({
      projectId: project.id,
      currentUserId: input.currentUserId,
      title: subtaskTemplate.title,
      description: subtaskTemplate.description,
      priority: subtaskTemplate.priority,
      status: initialColumn.slug,
    });
    await db.insert(taskRelationTable).values({
      sourceTaskId: task.id,
      targetTaskId: subtask.id,
      relationType: "subtask",
    });
  }

  return task;
}

const taskTemplate = new Hono<{
  Variables: { userId: string; workspaceId: string };
}>()
  .get(
    "/",
    validator("query", v.object({ workspaceId: v.string() })),
    workspaceAccess.fromQuery(),
    requireWorkspacePermission({ template: ["read"] }),
    async (c) =>
      c.json(
        await db
          .select()
          .from(taskTemplateTable)
          .where(eq(taskTemplateTable.workspaceId, c.get("workspaceId")))
          .orderBy(asc(taskTemplateTable.name)),
      ),
  )
  .post(
    "/",
    validator(
      "json",
      v.object({ workspaceId: v.string(), ...templateFieldsSchema }),
    ),
    workspaceAccess.fromBody(),
    requireWorkspacePermission({ template: ["manage"] }),
    async (c) => {
      const { workspaceId, ...input } = c.req.valid("json");
      const [created] = await db
        .insert(taskTemplateTable)
        .values({
          ...input,
          workspaceId,
          createdByUserId: c.get("userId"),
        })
        .returning();
      return c.json(created);
    },
  )
  .post(
    "/from-task/:id",
    validator("param", v.object({ id: v.string() })),
    validator(
      "json",
      v.object({
        name: v.pipe(v.string(), v.minLength(1), v.maxLength(120)),
      }),
    ),
    workspaceAccess.fromTask(),
    requireWorkspacePermission({ template: ["manage"] }),
    async (c) => {
      const taskId = c.req.valid("param").id;
      const [task] = await db
        .select({
          task: taskTable,
          workspaceId: projectTable.workspaceId,
        })
        .from(taskTable)
        .innerJoin(projectTable, eq(taskTable.projectId, projectTable.id))
        .where(eq(taskTable.id, taskId))
        .limit(1);
      if (!task) throw new HTTPException(404, { message: "Task not found" });

      const [quality, subtasks] = await Promise.all([
        listTaskQuality([taskId]),
        db
          .select({
            title: taskTable.title,
            description: taskTable.description,
            priority: taskTable.priority,
          })
          .from(taskRelationTable)
          .innerJoin(
            taskTable,
            eq(taskRelationTable.targetTaskId, taskTable.id),
          )
          .where(
            and(
              eq(taskRelationTable.sourceTaskId, taskId),
              eq(taskRelationTable.relationType, "subtask"),
            ),
          ),
      ]);
      const [created] = await db
        .insert(taskTemplateTable)
        .values({
          workspaceId: task.workspaceId,
          name: c.req.valid("json").name,
          title: task.task.title,
          description: task.task.description ?? "",
          priority: task.task.priority ?? "no-priority",
          initialStatus: task.task.status,
          customFields: (quality.customFieldsByTask.get(taskId) ?? []).map(
            ({ name, type, value, showOnCard }) => ({
              name,
              type,
              value,
              showOnCard,
            }),
          ),
          checklistItems: (quality.checklistItemsByTask.get(taskId) ?? []).map(
            ({ title, isRequired, requiredBeforeColumnSlug }) => ({
              title,
              isRequired,
              requiredBeforeColumnSlug: requiredBeforeColumnSlug ?? undefined,
            }),
          ),
          subtasks: subtasks.map((subtask) => ({
            title: subtask.title,
            description: subtask.description ?? "",
            priority: subtask.priority ?? "no-priority",
          })),
          createdByUserId: c.get("userId"),
        })
        .returning();
      return c.json(created);
    },
  )
  .put(
    "/:id",
    validator("param", v.object({ id: v.string() })),
    validator(
      "json",
      v.object({ workspaceId: v.string(), ...templateFieldsSchema }),
    ),
    workspaceAccess.fromBody(),
    requireWorkspacePermission({ template: ["manage"] }),
    async (c) => {
      const { workspaceId, ...input } = c.req.valid("json");
      const [updated] = await db
        .update(taskTemplateTable)
        .set(input)
        .where(
          and(
            eq(taskTemplateTable.id, c.req.valid("param").id),
            eq(taskTemplateTable.workspaceId, workspaceId),
          ),
        )
        .returning();
      if (!updated) {
        throw new HTTPException(404, { message: "Template not found" });
      }
      return c.json(updated);
    },
  )
  .delete(
    "/:id",
    validator("param", v.object({ id: v.string() })),
    validator("query", v.object({ workspaceId: v.string() })),
    workspaceAccess.fromQuery(),
    requireWorkspacePermission({ template: ["manage"] }),
    async (c) => {
      const [deleted] = await db
        .delete(taskTemplateTable)
        .where(
          and(
            eq(taskTemplateTable.id, c.req.valid("param").id),
            eq(taskTemplateTable.workspaceId, c.get("workspaceId")),
          ),
        )
        .returning();
      if (!deleted) {
        throw new HTTPException(404, { message: "Template not found" });
      }
      return c.json(deleted);
    },
  )
  .post(
    "/:id/instantiate/:projectId",
    validator("param", v.object({ id: v.string(), projectId: v.string() })),
    workspaceAccess.fromProject("projectId"),
    requireWorkspacePermission({ template: ["use"], task: ["create"] }),
    async (c) =>
      c.json(
        await instantiateTemplate({
          templateId: c.req.valid("param").id,
          projectId: c.req.valid("param").projectId,
          currentUserId: c.get("userId"),
        }),
      ),
  );

export { instantiateTemplate };
export default taskTemplate;
