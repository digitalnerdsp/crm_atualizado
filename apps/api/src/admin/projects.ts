import { createId } from "@paralleldrive/cuid2";
import { and, count, desc, eq, inArray, type SQL, sql } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { describeRoute, resolver, validator } from "hono-openapi";
import * as v from "valibot";
import db, { schema } from "../database";
import { DEFAULT_PROJECT_COLUMNS } from "../project/controllers/create-project";
import {
  createUniqueSlug,
  requireRow,
  slugify,
  toIsoString,
} from "./admin-utils";
import { recordAuditLog } from "./audit-log";
import { requireAdminPermission } from "./require-admin-permission";

const adminProjectSchema = v.object({
  id: v.string(),
  workspaceId: v.string(),
  workspaceName: v.string(),
  workspaceSlug: v.string(),
  slug: v.string(),
  icon: v.nullish(v.string()),
  name: v.string(),
  description: v.nullish(v.string()),
  owner: v.nullish(
    v.object({
      id: v.string(),
      name: v.string(),
      email: v.string(),
    }),
  ),
  createdAt: v.string(),
  isPublic: v.boolean(),
  archivedAt: v.nullish(v.string()),
  taskCount: v.number(),
  openTaskCount: v.number(),
  overdueTaskCount: v.number(),
});

const listProjectsQuerySchema = v.object({
  q: v.optional(v.pipe(v.string(), v.trim())),
  workspaceId: v.optional(v.string()),
  status: v.optional(v.picklist(["active", "archived", "all"])),
  ownerUserId: v.optional(v.string()),
  overdue: v.optional(v.picklist(["true", "false"])),
  limit: v.optional(v.pipe(v.string(), v.regex(/^\d+$/))),
});

const createProjectSchema = v.object({
  workspaceId: v.string(),
  name: v.pipe(v.string(), v.trim(), v.minLength(1)),
  slug: v.optional(v.pipe(v.string(), v.trim())),
  icon: v.optional(v.pipe(v.string(), v.trim())),
  description: v.optional(v.pipe(v.string(), v.trim())),
  isPublic: v.optional(v.boolean()),
  ownerUserId: v.optional(v.nullable(v.string())),
});

const updateProjectSchema = v.object({
  workspaceId: v.optional(v.string()),
  name: v.optional(v.pipe(v.string(), v.trim(), v.minLength(1))),
  slug: v.optional(v.pipe(v.string(), v.trim())),
  icon: v.optional(v.pipe(v.string(), v.trim())),
  description: v.optional(v.pipe(v.string(), v.trim())),
  isPublic: v.optional(v.boolean()),
  ownerUserId: v.optional(v.nullable(v.string())),
});

const deleteProjectSchema = v.object({
  confirmName: v.pipe(v.string(), v.trim()),
});

async function getWorkspaceOrThrow(workspaceId: string) {
  const [workspace] = await db
    .select({
      id: schema.workspaceTable.id,
      name: schema.workspaceTable.name,
      slug: schema.workspaceTable.slug,
    })
    .from(schema.workspaceTable)
    .where(eq(schema.workspaceTable.id, workspaceId))
    .limit(1);

  return requireRow(workspace, "Workspace not found.");
}

async function getProjectOrThrow(projectId: string) {
  const [project] = await db
    .select()
    .from(schema.projectTable)
    .where(eq(schema.projectTable.id, projectId))
    .limit(1);

  return requireRow(project, "Project not found.");
}

async function assertProjectSlugAvailable(
  workspaceId: string,
  slug: string,
  projectId?: string,
) {
  const [existing] = await db
    .select({ id: schema.projectTable.id })
    .from(schema.projectTable)
    .where(
      and(
        eq(schema.projectTable.workspaceId, workspaceId),
        eq(schema.projectTable.slug, slug),
      ),
    )
    .limit(1);

  if (existing && existing.id !== projectId) {
    throw new HTTPException(409, {
      message: "Project slug is already used in this workspace.",
    });
  }
}

async function assertWorkspaceMember(workspaceId: string, userId: string) {
  const [member] = await db
    .select({ id: schema.workspaceUserTable.id })
    .from(schema.workspaceUserTable)
    .where(
      and(
        eq(schema.workspaceUserTable.workspaceId, workspaceId),
        eq(schema.workspaceUserTable.userId, userId),
      ),
    )
    .limit(1);

  if (!member) {
    throw new HTTPException(400, {
      message: "Project owner must belong to the target workspace.",
    });
  }
}

async function buildProjectsQuery(input: {
  q?: string;
  workspaceId?: string;
  status?: "active" | "archived" | "all";
  ownerUserId?: string;
  overdue?: "true" | "false";
  limit?: string;
  projectIds?: string[];
}) {
  const filters: SQL[] = [];

  if (input.projectIds?.length) {
    filters.push(inArray(schema.projectTable.id, input.projectIds));
  }

  if (input.workspaceId) {
    filters.push(eq(schema.projectTable.workspaceId, input.workspaceId));
  }

  if (input.ownerUserId) {
    filters.push(eq(schema.projectTable.ownerUserId, input.ownerUserId));
  }

  if (input.q) {
    const pattern = `%${input.q}%`;
    filters.push(
      sql`(${schema.projectTable.name} ilike ${pattern} or ${schema.projectTable.slug} ilike ${pattern})`,
    );
  }

  if (input.status === "active" || !input.status) {
    filters.push(sql`${schema.projectTable.archivedAt} is null`);
  }

  if (input.status === "archived") {
    filters.push(sql`${schema.projectTable.archivedAt} is not null`);
  }

  if (input.overdue === "true") {
    filters.push(sql`exists (
      select 1
      from ${schema.taskTable}
      where ${schema.taskTable.projectId} = ${schema.projectTable.id}
        and ${schema.taskTable.dueDate} < now()
        and ${schema.taskTable.status} <> 'done'
    )`);
  }

  if (input.overdue === "false") {
    filters.push(sql`not exists (
      select 1
      from ${schema.taskTable}
      where ${schema.taskTable.projectId} = ${schema.projectTable.id}
        and ${schema.taskTable.dueDate} < now()
        and ${schema.taskTable.status} <> 'done'
    )`);
  }

  const limit = Math.min(Number(input.limit ?? 50), 100);
  const rows = await db
    .select({
      id: schema.projectTable.id,
      workspaceId: schema.projectTable.workspaceId,
      workspaceName: schema.workspaceTable.name,
      workspaceSlug: schema.workspaceTable.slug,
      slug: schema.projectTable.slug,
      icon: schema.projectTable.icon,
      name: schema.projectTable.name,
      description: schema.projectTable.description,
      ownerUserId: schema.projectTable.ownerUserId,
      ownerName: schema.userTable.name,
      ownerEmail: schema.userTable.email,
      createdAt: schema.projectTable.createdAt,
      isPublic: schema.projectTable.isPublic,
      archivedAt: schema.projectTable.archivedAt,
    })
    .from(schema.projectTable)
    .innerJoin(
      schema.workspaceTable,
      eq(schema.projectTable.workspaceId, schema.workspaceTable.id),
    )
    .leftJoin(
      schema.userTable,
      eq(schema.projectTable.ownerUserId, schema.userTable.id),
    )
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(schema.projectTable.createdAt))
    .limit(limit);

  if (!rows.length) return [];

  const projectIds = rows.map((project) => project.id);
  const [tasks, openTasks, overdueTasks] = await Promise.all([
    db
      .select({ projectId: schema.taskTable.projectId, value: count() })
      .from(schema.taskTable)
      .where(inArray(schema.taskTable.projectId, projectIds))
      .groupBy(schema.taskTable.projectId),
    db
      .select({ projectId: schema.taskTable.projectId, value: count() })
      .from(schema.taskTable)
      .where(
        and(
          inArray(schema.taskTable.projectId, projectIds),
          sql`${schema.taskTable.status} <> 'done'`,
        ),
      )
      .groupBy(schema.taskTable.projectId),
    db
      .select({ projectId: schema.taskTable.projectId, value: count() })
      .from(schema.taskTable)
      .where(
        and(
          inArray(schema.taskTable.projectId, projectIds),
          sql`${schema.taskTable.dueDate} < now()`,
          sql`${schema.taskTable.status} <> 'done'`,
        ),
      )
      .groupBy(schema.taskTable.projectId),
  ]);

  const taskMap = new Map(
    tasks.map((row) => [row.projectId, Number(row.value)]),
  );
  const openTaskMap = new Map(
    openTasks.map((row) => [row.projectId, Number(row.value)]),
  );
  const overdueTaskMap = new Map(
    overdueTasks.map((row) => [row.projectId, Number(row.value)]),
  );

  return rows.map((project) => ({
    id: project.id,
    workspaceId: project.workspaceId,
    workspaceName: project.workspaceName,
    workspaceSlug: project.workspaceSlug,
    slug: project.slug,
    icon: project.icon,
    name: project.name,
    description: project.description,
    owner: project.ownerUserId
      ? {
          id: project.ownerUserId,
          name: project.ownerName ?? "",
          email: project.ownerEmail ?? "",
        }
      : null,
    createdAt: project.createdAt.toISOString(),
    isPublic: Boolean(project.isPublic),
    archivedAt: toIsoString(project.archivedAt),
    taskCount: taskMap.get(project.id) ?? 0,
    openTaskCount: openTaskMap.get(project.id) ?? 0,
    overdueTaskCount: overdueTaskMap.get(project.id) ?? 0,
  }));
}

async function projectSummary(projectId: string) {
  const [project] = await buildProjectsQuery({
    projectIds: [projectId],
    status: "all",
  });

  return requireRow(project, "Project not found.");
}

async function createProjectColumns(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  projectId: string,
) {
  for (const column of DEFAULT_PROJECT_COLUMNS) {
    await tx.insert(schema.columnTable).values({
      projectId,
      name: column.name,
      slug: column.slug,
      position: column.position,
      isFinal: column.isFinal,
    });
  }
}

const projects = new Hono<{
  Variables: {
    userId: string;
    adminRole?: string;
    adminPermissions?: string[];
  };
}>()
  .get(
    "/",
    describeRoute({
      operationId: "listAdminProjects",
      tags: ["Admin"],
      description: "List all projects with workspace and task metrics.",
      responses: {
        200: {
          description: "Administrative project list",
          content: {
            "application/json": {
              schema: resolver(
                v.object({ projects: v.array(adminProjectSchema) }),
              ),
            },
          },
        },
      },
    }),
    validator("query", listProjectsQuerySchema),
    requireAdminPermission("admin.projects.view"),
    async (c) =>
      c.json({ projects: await buildProjectsQuery(c.req.valid("query")) }),
  )
  .post(
    "/",
    validator("json", createProjectSchema),
    requireAdminPermission("admin.projects.update"),
    async (c) => {
      const input = c.req.valid("json");
      await getWorkspaceOrThrow(input.workspaceId);

      if (input.ownerUserId) {
        await assertWorkspaceMember(input.workspaceId, input.ownerUserId);
      }

      const slug = input.slug
        ? slugify(input.slug, "project")
        : await createUniqueSlug(
            schema.projectTable,
            schema.projectTable.id,
            schema.projectTable.slug,
            input.name,
            "project",
          );
      await assertProjectSlugAvailable(input.workspaceId, slug);

      const projectId = createId();
      await db.transaction(async (tx) => {
        await tx.insert(schema.projectTable).values({
          id: projectId,
          workspaceId: input.workspaceId,
          name: input.name,
          slug,
          icon: input.icon || "Layout",
          description: input.description || null,
          isPublic: input.isPublic ?? false,
          ownerUserId: input.ownerUserId || null,
        });
        await createProjectColumns(tx, projectId);
      });

      const project = await projectSummary(projectId);
      await recordAuditLog(c, {
        action: "project.created",
        entityType: "project",
        entityId: project.id,
        entityName: project.name,
        workspaceId: project.workspaceId,
        projectId: project.id,
        summary: `Criou o projeto ${project.name}.`,
        after: project,
      });

      return c.json({ project });
    },
  )
  .patch(
    "/:projectId",
    validator("json", updateProjectSchema),
    requireAdminPermission("admin.projects.update"),
    async (c) => {
      const projectId = c.req.param("projectId");
      const currentProject = await getProjectOrThrow(projectId);
      const input = c.req.valid("json");
      const targetWorkspaceId = input.workspaceId ?? currentProject.workspaceId;

      if (targetWorkspaceId !== currentProject.workspaceId) {
        await getWorkspaceOrThrow(targetWorkspaceId);
      }

      const slug =
        input.slug !== undefined ? slugify(input.slug, "project") : undefined;
      if (slug !== undefined) {
        await assertProjectSlugAvailable(targetWorkspaceId, slug, projectId);
      }

      let ownerUserId = currentProject.ownerUserId;
      if (input.ownerUserId !== undefined) {
        ownerUserId = input.ownerUserId;
      } else if (
        targetWorkspaceId !== currentProject.workspaceId &&
        ownerUserId
      ) {
        const [member] = await db
          .select({ id: schema.workspaceUserTable.id })
          .from(schema.workspaceUserTable)
          .where(
            and(
              eq(schema.workspaceUserTable.workspaceId, targetWorkspaceId),
              eq(schema.workspaceUserTable.userId, ownerUserId),
            ),
          )
          .limit(1);
        ownerUserId = member ? ownerUserId : null;
      }

      if (ownerUserId) {
        await assertWorkspaceMember(targetWorkspaceId, ownerUserId);
      }

      await db
        .update(schema.projectTable)
        .set({
          workspaceId: targetWorkspaceId,
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(slug !== undefined ? { slug } : {}),
          ...(input.icon !== undefined ? { icon: input.icon || "Layout" } : {}),
          ...(input.description !== undefined
            ? { description: input.description || null }
            : {}),
          ...(input.isPublic !== undefined ? { isPublic: input.isPublic } : {}),
          ownerUserId,
        })
        .where(eq(schema.projectTable.id, projectId));

      const project = await projectSummary(projectId);
      await recordAuditLog(c, {
        action: "project.updated",
        entityType: "project",
        entityId: project.id,
        entityName: project.name,
        workspaceId: project.workspaceId,
        projectId: project.id,
        summary: `Alterou o projeto ${project.name}.`,
        before: currentProject,
        after: project,
      });

      return c.json({ project });
    },
  )
  .post(
    "/:projectId/archive",
    requireAdminPermission("admin.projects.update"),
    async (c) => {
      const projectId = c.req.param("projectId");
      const currentProject = await getProjectOrThrow(projectId);
      await db
        .update(schema.projectTable)
        .set({ archivedAt: new Date() })
        .where(eq(schema.projectTable.id, projectId));

      const project = await projectSummary(projectId);
      await recordAuditLog(c, {
        action: "project.archived",
        entityType: "project",
        entityId: project.id,
        entityName: project.name,
        workspaceId: project.workspaceId,
        projectId: project.id,
        summary: `Arquivou o projeto ${project.name}.`,
        before: currentProject,
        after: project,
      });

      return c.json({ project });
    },
  )
  .post(
    "/:projectId/restore",
    requireAdminPermission("admin.projects.update"),
    async (c) => {
      const projectId = c.req.param("projectId");
      const currentProject = await getProjectOrThrow(projectId);
      await db
        .update(schema.projectTable)
        .set({ archivedAt: null })
        .where(eq(schema.projectTable.id, projectId));

      const project = await projectSummary(projectId);
      await recordAuditLog(c, {
        action: "project.restored",
        entityType: "project",
        entityId: project.id,
        entityName: project.name,
        workspaceId: project.workspaceId,
        projectId: project.id,
        summary: `Restaurou o projeto ${project.name}.`,
        before: currentProject,
        after: project,
      });

      return c.json({ project });
    },
  )
  .post(
    "/:projectId/duplicate",
    requireAdminPermission("admin.projects.update"),
    async (c) => {
      const source = await getProjectOrThrow(c.req.param("projectId"));
      const newProjectId = createId();
      const slug = await createUniqueSlug(
        schema.projectTable,
        schema.projectTable.id,
        schema.projectTable.slug,
        `${source.slug}-copy`,
        "project",
      );
      const sourceColumns = await db
        .select()
        .from(schema.columnTable)
        .where(eq(schema.columnTable.projectId, source.id))
        .orderBy(schema.columnTable.position);

      await db.transaction(async (tx) => {
        await tx.insert(schema.projectTable).values({
          id: newProjectId,
          workspaceId: source.workspaceId,
          name: `${source.name} Copy`,
          slug,
          icon: source.icon,
          description: source.description,
          isPublic: source.isPublic,
          ownerUserId: source.ownerUserId,
        });

        const columns = sourceColumns.length
          ? sourceColumns
          : DEFAULT_PROJECT_COLUMNS;
        for (const column of columns) {
          await tx.insert(schema.columnTable).values({
            projectId: newProjectId,
            name: column.name,
            slug: column.slug,
            position: column.position,
            icon: "icon" in column ? column.icon : null,
            color: "color" in column ? column.color : null,
            isFinal: column.isFinal,
          });
        }
      });

      const project = await projectSummary(newProjectId);
      await recordAuditLog(c, {
        action: "project.duplicated",
        entityType: "project",
        entityId: project.id,
        entityName: project.name,
        workspaceId: project.workspaceId,
        projectId: project.id,
        summary: `Duplicou ${source.name} para ${project.name}.`,
        before: source,
        after: project,
        metadata: { sourceProjectId: source.id },
      });

      return c.json({ project });
    },
  )
  .post(
    "/:projectId/tasks/delete-all",
    validator("json", deleteProjectSchema),
    requireAdminPermission("admin.projects.delete"),
    async (c) => {
      const project = await getProjectOrThrow(c.req.param("projectId"));
      const input = c.req.valid("json");
      if (input.confirmName !== project.name) {
        throw new HTTPException(400, {
          message: "Confirmation name does not match the project.",
        });
      }

      await db
        .delete(schema.taskTable)
        .where(eq(schema.taskTable.projectId, project.id));

      return c.json({ project: await projectSummary(project.id) });
    },
  )
  .delete(
    "/:projectId",
    validator("json", deleteProjectSchema),
    requireAdminPermission("admin.projects.delete"),
    async (c) => {
      const project = await getProjectOrThrow(c.req.param("projectId"));
      const input = c.req.valid("json");
      if (input.confirmName !== project.name) {
        throw new HTTPException(400, {
          message: "Confirmation name does not match the project.",
        });
      }

      await db
        .delete(schema.projectTable)
        .where(eq(schema.projectTable.id, project.id));

      await recordAuditLog(c, {
        action: "project.deleted",
        entityType: "project",
        entityId: project.id,
        entityName: project.name,
        summary: `Apagou o projeto ${project.name}.`,
        before: project,
        metadata: {
          deletedWorkspaceId: project.workspaceId,
          deletedProjectId: project.id,
        },
      });

      return c.json({ ok: true });
    },
  );

export default projects;
