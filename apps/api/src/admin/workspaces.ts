import { DEFAULT_ROLE_NAMES, defaultRolePayloads } from "@kaneo/permissions";
import { createId } from "@paralleldrive/cuid2";
import { and, count, desc, eq, inArray, ne, type SQL, sql } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { describeRoute, resolver, validator } from "hono-openapi";
import * as v from "valibot";
import { seedCrmDefaults } from "../crm/shared/seed-workspace";
import db, { schema } from "../database";
import {
  createUniqueSlug,
  requireRow,
  slugify,
  toIsoString,
} from "./admin-utils";
import { recordAuditLog } from "./audit-log";
import { requireAdminPermission } from "./require-admin-permission";

/**
 * Papel de membro é texto livre validado contra o workspace, não uma lista
 * fixa: além de `owner`, valem os papéis semeados (`viewer`, `member`,
 * `admin`, `sales`, `sales_manager`) e qualquer papel criado pela equipe, que
 * moram como linhas em `workspace_role`. A lista fixa de quatro nomes que
 * existia aqui tornava Vendedor e Gestor comercial inatribuíveis pelo painel.
 */
const workspaceRoleSchema = v.pipe(
  v.string(),
  v.trim(),
  v.minLength(1),
  v.maxLength(64),
);

async function assertRoleExists(workspaceId: string, role: string) {
  // `owner` é estático do lado do better-auth e não tem linha própria.
  if (role === "owner") return;

  const [existing] = await db
    .select({ id: schema.workspaceRoleTable.id })
    .from(schema.workspaceRoleTable)
    .where(
      and(
        eq(schema.workspaceRoleTable.workspaceId, workspaceId),
        eq(schema.workspaceRoleTable.role, role),
      ),
    )
    .limit(1);

  if (!existing) {
    throw new HTTPException(400, {
      message: `Este workspace não tem o papel "${role}".`,
    });
  }
}

const adminWorkspaceSchema = v.object({
  id: v.string(),
  name: v.string(),
  slug: v.string(),
  description: v.nullish(v.string()),
  createdAt: v.string(),
  archivedAt: v.nullish(v.string()),
  owner: v.nullish(
    v.object({
      id: v.string(),
      name: v.string(),
      email: v.string(),
    }),
  ),
  memberCount: v.number(),
  projectCount: v.number(),
  archivedProjectCount: v.number(),
  taskCount: v.number(),
});

const listWorkspacesQuerySchema = v.object({
  q: v.optional(v.pipe(v.string(), v.trim())),
  status: v.optional(v.picklist(["active", "archived", "all"])),
  limit: v.optional(v.pipe(v.string(), v.regex(/^\d+$/))),
});

const createWorkspaceSchema = v.object({
  name: v.pipe(v.string(), v.trim(), v.minLength(1)),
  slug: v.optional(v.pipe(v.string(), v.trim())),
  description: v.optional(v.pipe(v.string(), v.trim())),
  ownerUserId: v.optional(v.string()),
});

const updateWorkspaceSchema = v.object({
  name: v.optional(v.pipe(v.string(), v.trim(), v.minLength(1))),
  slug: v.optional(v.pipe(v.string(), v.trim())),
  description: v.optional(v.pipe(v.string(), v.trim())),
});

const deleteWorkspaceSchema = v.object({
  confirmSlug: v.pipe(v.string(), v.trim()),
});

const memberInputSchema = v.object({
  userId: v.string(),
  role: workspaceRoleSchema,
});

function workspaceRoleRows(workspaceId: string, now: Date) {
  return DEFAULT_ROLE_NAMES.map((role) => ({
    workspaceId,
    role,
    permission: JSON.stringify(defaultRolePayloads[role]),
    createdAt: now,
    updatedAt: now,
  }));
}

async function getWorkspaceOrThrow(workspaceId: string) {
  const [workspace] = await db
    .select()
    .from(schema.workspaceTable)
    .where(eq(schema.workspaceTable.id, workspaceId))
    .limit(1);

  return requireRow(workspace, "Workspace not found.");
}

async function assertUserExists(userId: string) {
  const [user] = await db
    .select({ id: schema.userTable.id })
    .from(schema.userTable)
    .where(eq(schema.userTable.id, userId))
    .limit(1);

  if (!user) {
    throw new HTTPException(404, { message: "User not found." });
  }
}

async function assertWorkspaceSlugAvailable(
  slug: string,
  workspaceId?: string,
) {
  const [existing] = await db
    .select({ id: schema.workspaceTable.id })
    .from(schema.workspaceTable)
    .where(eq(schema.workspaceTable.slug, slug))
    .limit(1);

  if (existing && existing.id !== workspaceId) {
    throw new HTTPException(409, {
      message: "Workspace slug is already used.",
    });
  }
}

async function assertCanRemoveOwner(workspaceId: string, userId: string) {
  const [member] = await db
    .select({ role: schema.workspaceUserTable.role })
    .from(schema.workspaceUserTable)
    .where(
      and(
        eq(schema.workspaceUserTable.workspaceId, workspaceId),
        eq(schema.workspaceUserTable.userId, userId),
      ),
    )
    .limit(1);

  if (member?.role !== "owner") return;

  const [owners] = await db
    .select({ value: count() })
    .from(schema.workspaceUserTable)
    .where(
      and(
        eq(schema.workspaceUserTable.workspaceId, workspaceId),
        eq(schema.workspaceUserTable.role, "owner"),
        ne(schema.workspaceUserTable.userId, userId),
      ),
    );

  if ((owners?.value ?? 0) === 0) {
    throw new HTTPException(409, {
      message: "Workspace must keep at least one owner.",
    });
  }
}

async function setWorkspaceOwner(
  tx: Pick<typeof db, "update">,
  workspaceId: string,
  userId: string,
) {
  await tx
    .update(schema.workspaceUserTable)
    .set({ role: "admin" })
    .where(
      and(
        eq(schema.workspaceUserTable.workspaceId, workspaceId),
        eq(schema.workspaceUserTable.role, "owner"),
        ne(schema.workspaceUserTable.userId, userId),
      ),
    );
}

async function buildWorkspacesQuery(input: {
  q?: string;
  status?: "active" | "archived" | "all";
  limit?: string;
  workspaceIds?: string[];
}) {
  const filters: SQL[] = [];

  if (input.workspaceIds?.length) {
    filters.push(inArray(schema.workspaceTable.id, input.workspaceIds));
  }

  if (input.q) {
    const pattern = `%${input.q}%`;
    filters.push(
      sql`(${schema.workspaceTable.name} ilike ${pattern} or ${schema.workspaceTable.slug} ilike ${pattern})`,
    );
  }

  if (input.status === "active" || !input.status) {
    filters.push(sql`${schema.workspaceTable.archivedAt} is null`);
  }

  if (input.status === "archived") {
    filters.push(sql`${schema.workspaceTable.archivedAt} is not null`);
  }

  const limit = Math.min(Number(input.limit ?? 50), 100);
  const rows = await db
    .select()
    .from(schema.workspaceTable)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(schema.workspaceTable.createdAt))
    .limit(limit);

  if (!rows.length) return [];

  const workspaceIds = rows.map((workspace) => workspace.id);
  const [members, projects, archivedProjects, tasks, owners] =
    await Promise.all([
      db
        .select({
          workspaceId: schema.workspaceUserTable.workspaceId,
          value: count(),
        })
        .from(schema.workspaceUserTable)
        .where(inArray(schema.workspaceUserTable.workspaceId, workspaceIds))
        .groupBy(schema.workspaceUserTable.workspaceId),
      db
        .select({
          workspaceId: schema.projectTable.workspaceId,
          value: count(),
        })
        .from(schema.projectTable)
        .where(inArray(schema.projectTable.workspaceId, workspaceIds))
        .groupBy(schema.projectTable.workspaceId),
      db
        .select({
          workspaceId: schema.projectTable.workspaceId,
          value: count(),
        })
        .from(schema.projectTable)
        .where(
          and(
            inArray(schema.projectTable.workspaceId, workspaceIds),
            sql`${schema.projectTable.archivedAt} is not null`,
          ),
        )
        .groupBy(schema.projectTable.workspaceId),
      db
        .select({
          workspaceId: schema.projectTable.workspaceId,
          value: count(),
        })
        .from(schema.taskTable)
        .innerJoin(
          schema.projectTable,
          eq(schema.taskTable.projectId, schema.projectTable.id),
        )
        .where(inArray(schema.projectTable.workspaceId, workspaceIds))
        .groupBy(schema.projectTable.workspaceId),
      db
        .select({
          workspaceId: schema.workspaceUserTable.workspaceId,
          id: schema.userTable.id,
          name: schema.userTable.name,
          email: schema.userTable.email,
        })
        .from(schema.workspaceUserTable)
        .innerJoin(
          schema.userTable,
          eq(schema.workspaceUserTable.userId, schema.userTable.id),
        )
        .where(
          and(
            inArray(schema.workspaceUserTable.workspaceId, workspaceIds),
            eq(schema.workspaceUserTable.role, "owner"),
          ),
        ),
    ]);

  const memberMap = new Map(
    members.map((row) => [row.workspaceId, Number(row.value)]),
  );
  const projectMap = new Map(
    projects.map((row) => [row.workspaceId, Number(row.value)]),
  );
  const archivedProjectMap = new Map(
    archivedProjects.map((row) => [row.workspaceId, Number(row.value)]),
  );
  const taskMap = new Map(
    tasks.map((row) => [row.workspaceId, Number(row.value)]),
  );
  const ownerMap = new Map(owners.map((row) => [row.workspaceId, row]));

  return rows.map((workspace) => {
    const owner = ownerMap.get(workspace.id);
    return {
      id: workspace.id,
      name: workspace.name,
      slug: workspace.slug,
      description: workspace.description,
      createdAt: workspace.createdAt.toISOString(),
      archivedAt: toIsoString(workspace.archivedAt),
      owner: owner
        ? { id: owner.id, name: owner.name, email: owner.email }
        : null,
      memberCount: memberMap.get(workspace.id) ?? 0,
      projectCount: projectMap.get(workspace.id) ?? 0,
      archivedProjectCount: archivedProjectMap.get(workspace.id) ?? 0,
      taskCount: taskMap.get(workspace.id) ?? 0,
    };
  });
}

async function workspaceSummary(workspaceId: string) {
  const [workspace] = await buildWorkspacesQuery({
    workspaceIds: [workspaceId],
    status: "all",
  });

  return requireRow(workspace, "Workspace not found.");
}

const workspaces = new Hono<{
  Variables: {
    userId: string;
    adminRole?: string;
    adminPermissions?: string[];
  };
}>()
  .get(
    "/",
    describeRoute({
      operationId: "listAdminWorkspaces",
      tags: ["Admin"],
      description: "List all workspaces with administrative metrics.",
      responses: {
        200: {
          description: "Administrative workspace list",
          content: {
            "application/json": {
              schema: resolver(
                v.object({ workspaces: v.array(adminWorkspaceSchema) }),
              ),
            },
          },
        },
      },
    }),
    validator("query", listWorkspacesQuerySchema),
    requireAdminPermission("admin.workspaces.view"),
    async (c) =>
      c.json({ workspaces: await buildWorkspacesQuery(c.req.valid("query")) }),
  )
  .post(
    "/",
    describeRoute({
      operationId: "createAdminWorkspace",
      tags: ["Admin"],
      description:
        "Create a workspace globally and seed default workspace roles.",
      responses: {
        200: {
          description: "Created workspace",
          content: {
            "application/json": {
              schema: resolver(v.object({ workspace: adminWorkspaceSchema })),
            },
          },
        },
      },
    }),
    validator("json", createWorkspaceSchema),
    requireAdminPermission("admin.workspaces.create"),
    async (c) => {
      const input = c.req.valid("json");
      const ownerUserId = input.ownerUserId ?? c.get("userId");
      await assertUserExists(ownerUserId);

      const slug = input.slug
        ? slugify(input.slug, "workspace")
        : await createUniqueSlug(
            schema.workspaceTable,
            schema.workspaceTable.id,
            schema.workspaceTable.slug,
            input.name,
            "workspace",
          );
      await assertWorkspaceSlugAvailable(slug);

      const now = new Date();
      const workspaceId = createId();

      await db.transaction(async (tx) => {
        await tx.insert(schema.workspaceTable).values({
          id: workspaceId,
          name: input.name,
          slug,
          description: input.description || null,
          createdAt: now,
        });

        await tx.insert(schema.workspaceUserTable).values({
          id: createId(),
          workspaceId,
          userId: ownerUserId,
          role: "owner",
          joinedAt: now,
        });

        await tx
          .insert(schema.workspaceRoleTable)
          .values(workspaceRoleRows(workspaceId, now));

        await seedCrmDefaults(workspaceId, tx);
      });

      const workspace = await workspaceSummary(workspaceId);
      await recordAuditLog(c, {
        action: "workspace.created",
        entityType: "workspace",
        entityId: workspace.id,
        entityName: workspace.name,
        workspaceId: workspace.id,
        summary: `Criou o workspace ${workspace.name}.`,
        after: workspace,
      });

      return c.json({ workspace });
    },
  )
  .patch(
    "/:workspaceId",
    describeRoute({
      operationId: "updateAdminWorkspace",
      tags: ["Admin"],
      description: "Update workspace identity and description globally.",
      responses: {
        200: {
          description: "Updated workspace",
          content: {
            "application/json": {
              schema: resolver(v.object({ workspace: adminWorkspaceSchema })),
            },
          },
        },
      },
    }),
    validator("json", updateWorkspaceSchema),
    requireAdminPermission("admin.workspaces.update"),
    async (c) => {
      const workspaceId = c.req.param("workspaceId");
      const currentWorkspace = await getWorkspaceOrThrow(workspaceId);
      const input = c.req.valid("json");
      const slug =
        input.slug !== undefined ? slugify(input.slug, "workspace") : undefined;

      if (slug !== undefined) {
        await assertWorkspaceSlugAvailable(slug, workspaceId);
      }

      await db
        .update(schema.workspaceTable)
        .set({
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(slug !== undefined ? { slug } : {}),
          ...(input.description !== undefined
            ? { description: input.description || null }
            : {}),
        })
        .where(eq(schema.workspaceTable.id, workspaceId));

      const workspace = await workspaceSummary(workspaceId);
      await recordAuditLog(c, {
        action: "workspace.updated",
        entityType: "workspace",
        entityId: workspace.id,
        entityName: workspace.name,
        workspaceId: workspace.id,
        summary: `Alterou o workspace ${workspace.name}.`,
        before: {
          id: currentWorkspace.id,
          name: currentWorkspace.name,
          slug: currentWorkspace.slug,
          description: currentWorkspace.description,
        },
        after: workspace,
      });

      return c.json({ workspace });
    },
  )
  .post(
    "/:workspaceId/archive",
    requireAdminPermission("admin.workspaces.update"),
    async (c) => {
      const workspaceId = c.req.param("workspaceId");
      const currentWorkspace = await getWorkspaceOrThrow(workspaceId);
      await db
        .update(schema.workspaceTable)
        .set({ archivedAt: new Date() })
        .where(eq(schema.workspaceTable.id, workspaceId));

      const workspace = await workspaceSummary(workspaceId);
      await recordAuditLog(c, {
        action: "workspace.archived",
        entityType: "workspace",
        entityId: workspace.id,
        entityName: workspace.name,
        workspaceId: workspace.id,
        summary: `Arquivou o workspace ${workspace.name}.`,
        before: currentWorkspace,
        after: workspace,
      });

      return c.json({ workspace });
    },
  )
  .post(
    "/:workspaceId/restore",
    requireAdminPermission("admin.workspaces.update"),
    async (c) => {
      const workspaceId = c.req.param("workspaceId");
      const currentWorkspace = await getWorkspaceOrThrow(workspaceId);
      await db
        .update(schema.workspaceTable)
        .set({ archivedAt: null })
        .where(eq(schema.workspaceTable.id, workspaceId));

      const workspace = await workspaceSummary(workspaceId);
      await recordAuditLog(c, {
        action: "workspace.restored",
        entityType: "workspace",
        entityId: workspace.id,
        entityName: workspace.name,
        workspaceId: workspace.id,
        summary: `Restaurou o workspace ${workspace.name}.`,
        before: currentWorkspace,
        after: workspace,
      });

      return c.json({ workspace });
    },
  )
  .delete(
    "/:workspaceId",
    validator("json", deleteWorkspaceSchema),
    requireAdminPermission("admin.workspaces.delete"),
    async (c) => {
      const workspace = await getWorkspaceOrThrow(c.req.param("workspaceId"));
      const input = c.req.valid("json");

      if (input.confirmSlug !== workspace.slug) {
        throw new HTTPException(400, {
          message: "Confirmation slug does not match the workspace.",
        });
      }

      await db
        .delete(schema.workspaceTable)
        .where(eq(schema.workspaceTable.id, workspace.id));

      await recordAuditLog(c, {
        action: "workspace.deleted",
        entityType: "workspace",
        entityId: workspace.id,
        entityName: workspace.name,
        summary: `Apagou o workspace ${workspace.name}.`,
        before: workspace,
        metadata: { deletedWorkspaceId: workspace.id },
      });

      return c.json({ ok: true });
    },
  )
  .get(
    "/:workspaceId/members",
    requireAdminPermission("admin.workspaces.view"),
    async (c) => {
      const workspaceId = c.req.param("workspaceId");
      await getWorkspaceOrThrow(workspaceId);

      const members = await db
        .select({
          id: schema.workspaceUserTable.id,
          userId: schema.userTable.id,
          name: schema.userTable.name,
          email: schema.userTable.email,
          role: schema.workspaceUserTable.role,
          joinedAt: schema.workspaceUserTable.joinedAt,
        })
        .from(schema.workspaceUserTable)
        .innerJoin(
          schema.userTable,
          eq(schema.workspaceUserTable.userId, schema.userTable.id),
        )
        .where(eq(schema.workspaceUserTable.workspaceId, workspaceId))
        .orderBy(desc(schema.workspaceUserTable.joinedAt));

      return c.json({
        members: members.map((member) => ({
          ...member,
          role: member.role,
          joinedAt: member.joinedAt.toISOString(),
        })),
      });
    },
  )
  .post(
    "/:workspaceId/members",
    validator("json", memberInputSchema),
    requireAdminPermission("admin.workspaces.update"),
    async (c) => {
      const workspaceId = c.req.param("workspaceId");
      await getWorkspaceOrThrow(workspaceId);
      const input = c.req.valid("json");
      await assertUserExists(input.userId);
      await assertRoleExists(workspaceId, input.role);

      const [existing] = await db
        .select({ id: schema.workspaceUserTable.id })
        .from(schema.workspaceUserTable)
        .where(
          and(
            eq(schema.workspaceUserTable.workspaceId, workspaceId),
            eq(schema.workspaceUserTable.userId, input.userId),
          ),
        )
        .limit(1);

      if (existing) {
        throw new HTTPException(409, {
          message: "User already belongs to this workspace.",
        });
      }

      await db.transaction(async (tx) => {
        if (input.role === "owner") {
          await setWorkspaceOwner(tx, workspaceId, input.userId);
        }

        await tx.insert(schema.workspaceUserTable).values({
          id: createId(),
          workspaceId,
          userId: input.userId,
          role: input.role,
          joinedAt: new Date(),
        });
      });

      return c.json({ workspace: await workspaceSummary(workspaceId) });
    },
  )
  .patch(
    "/:workspaceId/members/:userId",
    validator("json", memberInputSchema),
    requireAdminPermission("admin.workspaces.update"),
    async (c) => {
      const workspaceId = c.req.param("workspaceId");
      const userId = c.req.param("userId");
      await getWorkspaceOrThrow(workspaceId);
      const input = c.req.valid("json");

      if (input.userId !== userId) {
        throw new HTTPException(400, {
          message: "Body userId must match the member path.",
        });
      }

      await assertRoleExists(workspaceId, input.role);

      await assertCanRemoveOwner(workspaceId, userId);

      const updated = await db.transaction(async (tx) => {
        if (input.role === "owner") {
          await setWorkspaceOwner(tx, workspaceId, userId);
        }

        return tx
          .update(schema.workspaceUserTable)
          .set({ role: input.role })
          .where(
            and(
              eq(schema.workspaceUserTable.workspaceId, workspaceId),
              eq(schema.workspaceUserTable.userId, userId),
            ),
          )
          .returning({ id: schema.workspaceUserTable.id });
      });

      if (!updated.length) {
        throw new HTTPException(404, {
          message: "Workspace member not found.",
        });
      }

      return c.json({ workspace: await workspaceSummary(workspaceId) });
    },
  )
  .delete(
    "/:workspaceId/members/:userId",
    requireAdminPermission("admin.workspaces.update"),
    async (c) => {
      const workspaceId = c.req.param("workspaceId");
      const userId = c.req.param("userId");
      await getWorkspaceOrThrow(workspaceId);
      await assertCanRemoveOwner(workspaceId, userId);

      const deleted = await db
        .delete(schema.workspaceUserTable)
        .where(
          and(
            eq(schema.workspaceUserTable.workspaceId, workspaceId),
            eq(schema.workspaceUserTable.userId, userId),
          ),
        )
        .returning({ id: schema.workspaceUserTable.id });

      if (!deleted.length) {
        throw new HTTPException(404, {
          message: "Workspace member not found.",
        });
      }

      return c.json({ workspace: await workspaceSummary(workspaceId) });
    },
  );

export default workspaces;
