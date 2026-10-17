import { createId } from "@paralleldrive/cuid2";
import bcrypt from "bcryptjs";
import {
  and,
  count,
  desc,
  eq,
  ilike,
  inArray,
  max,
  ne,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
import type { AnyPgTable } from "drizzle-orm/pg-core";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { describeRoute, resolver, validator } from "hono-openapi";
import * as v from "valibot";
import db, { schema } from "../database";
import { isSchedulerRunning } from "../scheduler";
import { getRuntimeSetting } from "../settings/runtime-settings";
import audit from "./audit";
import { recordAuditLog } from "./audit-log";
import {
  getGlobalRoleDefinition,
  listGlobalRoleDefinitions,
} from "./global-roles";
import {
  ADMIN_PERMISSION_CATALOG,
  hasAdminPermission,
  isSystemGlobalRole,
  normalizeGlobalRole,
} from "./permissions";
import projects from "./projects";
import { requireAdminPermission } from "./require-admin-permission";
import settings from "./settings";
import tasks from "./tasks";
import workspaces from "./workspaces";

const permissionSchema = v.object({
  key: v.string(),
  description: v.string(),
});

const roleSchema = v.object({
  role: v.string(),
  name: v.string(),
  description: v.string(),
  permissions: v.array(v.string()),
  isSystem: v.boolean(),
  userCount: v.optional(v.number()),
});

const adminMeSchema = v.object({
  role: v.string(),
  permissions: v.array(v.string()),
  permissionCatalog: v.array(permissionSchema),
});

const adminOverviewSchema = v.object({
  users: v.number(),
  activeUsers: v.number(),
  blockedUsers: v.number(),
  admins: v.number(),
  workspaces: v.number(),
  projects: v.number(),
  tasks: v.number(),
  roles: v.array(roleSchema),
  recentAccesses: v.array(
    v.object({
      userId: v.string(),
      name: v.string(),
      email: v.string(),
      lastAccessAt: v.string(),
    }),
  ),
  recentActions: v.array(
    v.object({
      id: v.string(),
      action: v.string(),
      summary: v.string(),
      entityType: v.string(),
      entityName: v.nullish(v.string()),
      ipAddress: v.nullish(v.string()),
      createdAt: v.string(),
      actor: v.nullish(
        v.object({
          id: v.string(),
          name: v.string(),
          email: v.string(),
        }),
      ),
    }),
  ),
  system: v.object({
    database: v.picklist(["ok", "degraded"]),
    scheduler: v.picklist(["running", "stopped"]),
    email: v.picklist(["configured", "missing"]),
    version: v.string(),
    generatedAt: v.string(),
    activeSessions: v.number(),
  }),
});

const roleSlugSchema = v.pipe(
  v.string(),
  v.trim(),
  v.minLength(2),
  v.maxLength(48),
  v.regex(/^[a-z][a-z0-9_-]*$/),
);

const globalRoleSchema = v.pipe(v.string(), v.trim(), v.minLength(1));

const listRolesResponseSchema = v.object({
  roles: v.array(roleSchema),
  permissions: v.array(permissionSchema),
});

const createRoleSchema = v.object({
  role: roleSlugSchema,
  name: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(80)),
  description: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(240)),
  permissions: v.array(v.string()),
});

const updateRoleSchema = v.object({
  name: v.optional(
    v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(80)),
  ),
  description: v.optional(
    v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(240)),
  ),
  permissions: v.optional(v.array(v.string())),
});

const duplicateRoleSchema = v.object({
  role: roleSlugSchema,
  name: v.optional(
    v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(80)),
  ),
  description: v.optional(
    v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(240)),
  ),
});

const deleteRoleSchema = v.object({
  replacementRole: v.optional(roleSlugSchema),
});

const adminUserSchema = v.object({
  id: v.string(),
  name: v.string(),
  email: v.string(),
  role: globalRoleSchema,
  emailVerified: v.boolean(),
  banned: v.boolean(),
  banReason: v.nullish(v.string()),
  banExpires: v.nullish(v.string()),
  status: v.picklist(["active", "blocked"]),
  createdAt: v.string(),
  updatedAt: v.string(),
  lastAccessAt: v.nullish(v.string()),
  workspaceCount: v.number(),
  projectCount: v.number(),
  taskCount: v.number(),
  openTaskCount: v.number(),
  activeSessionCount: v.number(),
  workspaces: v.array(
    v.object({
      id: v.string(),
      name: v.string(),
      role: v.string(),
    }),
  ),
  ownedProjects: v.array(
    v.object({
      id: v.string(),
      name: v.string(),
      workspaceId: v.string(),
      workspaceName: v.string(),
    }),
  ),
});

const adminUsersResponseSchema = v.object({
  users: v.array(adminUserSchema),
});

const adminUserResponseSchema = v.object({
  user: adminUserSchema,
});

const adminActionResponseSchema = v.object({
  ok: v.boolean(),
});

const listUsersQuerySchema = v.object({
  q: v.optional(v.pipe(v.string(), v.trim())),
  role: v.optional(globalRoleSchema),
  status: v.optional(v.picklist(["active", "blocked", "all"])),
  emailVerified: v.optional(v.picklist(["true", "false"])),
  limit: v.optional(v.pipe(v.string(), v.regex(/^\d+$/))),
});

/* O papel é o nome de uma linha de `workspace_role`, validado contra o
 * workspace na hora de gravar: a lista fixa de quatro nomes que existia aqui
 * deixava Vendedor e Gestor comercial inatribuíveis pelo painel. */
const workspaceMembershipSchema = v.object({
  workspaceId: v.string(),
  role: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(64)),
});

/** `owner` é estático do lado do better-auth e não tem linha própria. */
async function assertWorkspaceRoleExists(workspaceId: string, role: string) {
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

const createUserSchema = v.object({
  name: v.pipe(v.string(), v.trim(), v.minLength(1)),
  email: v.pipe(v.string(), v.trim(), v.email()),
  password: v.pipe(v.string(), v.minLength(8)),
  role: v.optional(globalRoleSchema),
  emailVerified: v.optional(v.boolean()),
  banned: v.optional(v.boolean()),
  banReason: v.optional(v.pipe(v.string(), v.trim())),
  workspaceMemberships: v.optional(v.array(workspaceMembershipSchema)),
  ownedProjectIds: v.optional(v.array(v.string())),
});

const updateUserSchema = v.object({
  name: v.optional(v.pipe(v.string(), v.trim(), v.minLength(1))),
  email: v.optional(v.pipe(v.string(), v.trim(), v.email())),
  role: v.optional(globalRoleSchema),
  emailVerified: v.optional(v.boolean()),
  banned: v.optional(v.boolean()),
  banReason: v.optional(v.pipe(v.string(), v.trim())),
  workspaceMemberships: v.optional(v.array(workspaceMembershipSchema)),
  ownedProjectIds: v.optional(v.array(v.string())),
});

const resetPasswordSchema = v.object({
  password: v.pipe(v.string(), v.minLength(8)),
});

const deleteUserSchema = v.object({
  confirmEmail: v.pipe(v.string(), v.trim(), v.email()),
  mode: v.optional(v.picklist(["unlink", "transfer"])),
  transferUserId: v.optional(v.string()),
});

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function tableCount(table: AnyPgTable) {
  const [row] = await db.select({ value: count() }).from(table);
  return row?.value ?? 0;
}

async function tableCountWhere(table: AnyPgTable, where: SQL) {
  const [row] = await db.select({ value: count() }).from(table).where(where);
  return row?.value ?? 0;
}

function permissionCatalog() {
  return Object.entries(ADMIN_PERMISSION_CATALOG).map(([key, description]) => ({
    key,
    description,
  }));
}

function toIsoString(value?: Date | null) {
  return value ? value.toISOString() : null;
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function canManageRoles(permissions?: string[]) {
  return hasAdminPermission(permissions ?? [], "admin.users.manage_roles");
}

function rolePermissionSet() {
  return new Set(Object.keys(ADMIN_PERMISSION_CATALOG));
}

function normalizeRoleSlug(role: string) {
  return normalizeGlobalRole(role);
}

function normalizeRolePermissions(permissions: string[], role: string) {
  const catalog = rolePermissionSet();
  const normalizedPermissions = Array.from(new Set(permissions));

  if (normalizedPermissions.includes("*") && role !== "superadmin") {
    throw new HTTPException(400, {
      message: "Wildcard permission is reserved for the superadmin role.",
    });
  }

  for (const permission of normalizedPermissions) {
    if (permission !== "*" && !catalog.has(permission)) {
      throw new HTTPException(400, {
        message: `Unknown permission: ${permission}`,
      });
    }
  }

  if (
    normalizedPermissions.length > 0 &&
    !normalizedPermissions.includes("*") &&
    !normalizedPermissions.includes("admin.access")
  ) {
    throw new HTTPException(400, {
      message:
        "Administrative roles with permissions must include admin.access.",
    });
  }

  return normalizedPermissions;
}

async function getStoredGlobalRole(role: string) {
  const normalizedRole = normalizeRoleSlug(role);
  const [row] = await db
    .select({
      role: schema.globalRoleTable.role,
      name: schema.globalRoleTable.name,
      description: schema.globalRoleTable.description,
      permissions: schema.globalRoleTable.permissions,
      isSystem: schema.globalRoleTable.isSystem,
    })
    .from(schema.globalRoleTable)
    .where(eq(schema.globalRoleTable.role, normalizedRole))
    .limit(1);

  return row;
}

async function assertRoleExists(role: string) {
  const normalizedRole = normalizeRoleSlug(role);

  if (isSystemGlobalRole(normalizedRole)) {
    return normalizedRole;
  }

  const existing = await getStoredGlobalRole(normalizedRole);
  if (!existing) {
    throw new HTTPException(400, { message: "Role does not exist." });
  }

  return normalizedRole;
}

async function listGlobalRolesWithUserCounts() {
  const [roles, userCounts] = await Promise.all([
    listGlobalRoleDefinitions(),
    db
      .select({
        role: schema.userTable.role,
        value: count(),
      })
      .from(schema.userTable)
      .groupBy(schema.userTable.role),
  ]);

  const countByRole = new Map<string, number>();
  for (const row of userCounts) {
    const role = normalizeRoleSlug(row.role ?? "user");
    countByRole.set(role, (countByRole.get(role) ?? 0) + Number(row.value));
  }

  return roles.map((role) => ({
    ...role,
    userCount: countByRole.get(role.role) ?? 0,
  }));
}

function anyOf(...conditions: [SQL, SQL, ...SQL[]]) {
  const condition = or(...conditions);
  if (!condition) {
    throw new HTTPException(500, { message: "Invalid filter condition." });
  }

  return condition;
}

function assertCanSelectRole(permissions: string[] | undefined, role: string) {
  if (role === "user") return;

  if (!canManageRoles(permissions)) {
    throw new HTTPException(403, {
      message: "Only role managers can assign administrative roles.",
    });
  }
}

function assertCanChangeRole(permissions: string[] | undefined) {
  if (!canManageRoles(permissions)) {
    throw new HTTPException(403, {
      message: "Only role managers can change global roles.",
    });
  }
}

async function countSuperadminsExcept(userId: string) {
  const [row] = await db
    .select({ value: count() })
    .from(schema.userTable)
    .where(
      and(
        eq(schema.userTable.role, "superadmin"),
        ne(schema.userTable.id, userId),
      ),
    );

  return row?.value ?? 0;
}

async function assertNotLastSuperadmin(
  targetUser: { id: string; role: string | null; banned: boolean | null },
  action: "delete" | "demote" | "block",
) {
  if (normalizeGlobalRole(targetUser.role) !== "superadmin") return;

  const remainingSuperadmins = await countSuperadminsExcept(targetUser.id);
  if (remainingSuperadmins > 0) return;

  const messages = {
    delete: "Cannot delete the last superadmin.",
    demote: "Cannot remove the last superadmin role.",
    block: "Cannot block the last superadmin.",
  };

  throw new HTTPException(409, { message: messages[action] });
}

async function assertCanRemoveWorkspaceOwner(
  tx: DbTransaction,
  workspaceId: string,
  userId: string,
) {
  const [member] = await tx
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

  const [owners] = await tx
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

async function getUserById(userId: string) {
  const [user] = await db
    .select()
    .from(schema.userTable)
    .where(eq(schema.userTable.id, userId))
    .limit(1);

  if (!user) {
    throw new HTTPException(404, { message: "User not found." });
  }

  return user;
}

function normalizeWorkspaceMemberships(
  memberships: Array<{ workspaceId: string; role: string }> = [],
) {
  const byWorkspace = new Map<string, string>();

  for (const membership of memberships) {
    byWorkspace.set(membership.workspaceId, membership.role);
  }

  return Array.from(byWorkspace, ([workspaceId, role]) => ({
    workspaceId,
    role,
  }));
}

function normalizeProjectIds(projectIds: string[] = []) {
  return Array.from(new Set(projectIds.filter(Boolean)));
}

async function assertWorkspacesExist(workspaceIds: string[]) {
  if (!workspaceIds.length) return;

  const rows = await db
    .select({ id: schema.workspaceTable.id })
    .from(schema.workspaceTable)
    .where(inArray(schema.workspaceTable.id, workspaceIds));
  const found = new Set(rows.map((row) => row.id));
  const missing = workspaceIds.filter((workspaceId) => !found.has(workspaceId));

  if (missing.length) {
    throw new HTTPException(400, {
      message: "One or more selected workspaces do not exist.",
    });
  }
}

async function assertOwnedProjectsAllowed(
  userId: string,
  projectIds: string[],
  allowedWorkspaceIds?: string[],
) {
  if (!projectIds.length) return;

  const rows = await db
    .select({
      id: schema.projectTable.id,
      workspaceId: schema.projectTable.workspaceId,
      membershipId: schema.workspaceUserTable.id,
    })
    .from(schema.projectTable)
    .leftJoin(
      schema.workspaceUserTable,
      and(
        eq(
          schema.workspaceUserTable.workspaceId,
          schema.projectTable.workspaceId,
        ),
        eq(schema.workspaceUserTable.userId, userId),
      ),
    )
    .where(inArray(schema.projectTable.id, projectIds));
  const found = new Set(rows.map((row) => row.id));
  const missing = projectIds.filter((projectId) => !found.has(projectId));

  if (missing.length) {
    throw new HTTPException(400, {
      message: "One or more selected projects do not exist.",
    });
  }

  if (allowedWorkspaceIds) {
    const allowedWorkspaces = new Set(allowedWorkspaceIds);
    if (rows.some((row) => !allowedWorkspaces.has(row.workspaceId))) {
      throw new HTTPException(400, {
        message:
          "Project owner must belong to the workspace of every selected project.",
      });
    }
    return;
  }

  if (rows.some((row) => !row.membershipId)) {
    throw new HTTPException(400, {
      message:
        "Project owner must belong to the workspace of every selected project.",
    });
  }
}

async function syncUserWorkspaceMemberships(
  tx: DbTransaction,
  userId: string,
  memberships: Array<{ workspaceId: string; role: string }>,
) {
  const normalized = normalizeWorkspaceMemberships(memberships);
  const nextWorkspaceIds = new Set(
    normalized.map((membership) => membership.workspaceId),
  );
  const current = await tx
    .select({
      workspaceId: schema.workspaceUserTable.workspaceId,
      role: schema.workspaceUserTable.role,
    })
    .from(schema.workspaceUserTable)
    .where(eq(schema.workspaceUserTable.userId, userId));

  for (const membership of current) {
    if (!nextWorkspaceIds.has(membership.workspaceId)) {
      await assertCanRemoveWorkspaceOwner(tx, membership.workspaceId, userId);
      await tx
        .delete(schema.workspaceUserTable)
        .where(
          and(
            eq(schema.workspaceUserTable.workspaceId, membership.workspaceId),
            eq(schema.workspaceUserTable.userId, userId),
          ),
        );
    }
  }

  for (const membership of normalized) {
    await assertWorkspaceRoleExists(membership.workspaceId, membership.role);

    const existing = current.find(
      (item) => item.workspaceId === membership.workspaceId,
    );

    if (existing) {
      if (existing.role !== membership.role) {
        if (existing.role === "owner" && membership.role !== "owner") {
          await assertCanRemoveWorkspaceOwner(
            tx,
            membership.workspaceId,
            userId,
          );
        }

        await tx
          .update(schema.workspaceUserTable)
          .set({ role: membership.role })
          .where(
            and(
              eq(schema.workspaceUserTable.workspaceId, membership.workspaceId),
              eq(schema.workspaceUserTable.userId, userId),
            ),
          );
      }
      continue;
    }

    await tx.insert(schema.workspaceUserTable).values({
      id: createId(),
      workspaceId: membership.workspaceId,
      userId,
      role: membership.role,
      joinedAt: new Date(),
    });
  }
}

async function syncUserOwnedProjects(
  tx: DbTransaction,
  userId: string,
  projectIds: string[],
) {
  const normalizedProjectIds = normalizeProjectIds(projectIds);

  await tx
    .update(schema.projectTable)
    .set({ ownerUserId: null })
    .where(eq(schema.projectTable.ownerUserId, userId));

  if (normalizedProjectIds.length) {
    await tx
      .update(schema.projectTable)
      .set({ ownerUserId: userId })
      .where(inArray(schema.projectTable.id, normalizedProjectIds));
  }
}

async function getRelatedUserCounts(userId: string) {
  const [
    workspaces,
    teams,
    assignedTasks,
    taskAssignees,
    comments,
    timeEntries,
    activities,
    createdAssets,
    invitations,
    apiKeys,
  ] = await Promise.all([
    tableCountWhere(
      schema.workspaceUserTable,
      eq(schema.workspaceUserTable.userId, userId),
    ),
    tableCountWhere(
      schema.teamMemberTable,
      eq(schema.teamMemberTable.userId, userId),
    ),
    tableCountWhere(schema.taskTable, eq(schema.taskTable.userId, userId)),
    tableCountWhere(
      schema.taskAssigneeTable,
      eq(schema.taskAssigneeTable.userId, userId),
    ),
    tableCountWhere(
      schema.commentTable,
      eq(schema.commentTable.userId, userId),
    ),
    tableCountWhere(
      schema.timeEntryTable,
      eq(schema.timeEntryTable.userId, userId),
    ),
    tableCountWhere(
      schema.activityTable,
      eq(schema.activityTable.userId, userId),
    ),
    tableCountWhere(schema.assetTable, eq(schema.assetTable.createdBy, userId)),
    tableCountWhere(
      schema.invitationTable,
      eq(schema.invitationTable.inviterId, userId),
    ),
    tableCountWhere(
      schema.apikeyTable,
      anyOf(
        eq(schema.apikeyTable.userId, userId),
        eq(schema.apikeyTable.referenceId, userId),
      ),
    ),
  ]);

  return {
    workspaces,
    teams,
    assignedTasks,
    taskAssignees,
    comments,
    timeEntries,
    activities,
    createdAssets,
    invitations,
    apiKeys,
  };
}

function hasOperationalRelations(
  counts: Awaited<ReturnType<typeof getRelatedUserCounts>>,
) {
  return Object.values(counts).some((value) => value > 0);
}

async function reassignTaskAssignees(
  tx: DbTransaction,
  fromUserId: string,
  toUserId: string,
) {
  const rows = await tx
    .select({ taskId: schema.taskAssigneeTable.taskId })
    .from(schema.taskAssigneeTable)
    .where(eq(schema.taskAssigneeTable.userId, fromUserId));

  if (!rows.length) return;

  const taskIds = rows.map((row) => row.taskId);
  await tx
    .delete(schema.taskAssigneeTable)
    .where(
      and(
        eq(schema.taskAssigneeTable.userId, fromUserId),
        inArray(schema.taskAssigneeTable.taskId, taskIds),
      ),
    );

  const existingTransferRows = await tx
    .select({ taskId: schema.taskAssigneeTable.taskId })
    .from(schema.taskAssigneeTable)
    .where(
      and(
        eq(schema.taskAssigneeTable.userId, toUserId),
        inArray(schema.taskAssigneeTable.taskId, taskIds),
      ),
    );
  const existingTransferTaskIds = new Set(
    existingTransferRows.map((row) => row.taskId),
  );
  const rowsToInsert = taskIds
    .filter((taskId) => !existingTransferTaskIds.has(taskId))
    .map((taskId) => ({
      id: createId(),
      taskId,
      userId: toUserId,
      assignedByUserId: null,
      assignedAt: new Date(),
    }));

  if (rowsToInsert.length) {
    await tx.insert(schema.taskAssigneeTable).values(rowsToInsert);
  }
}

async function prepareUserDeletion(input: {
  tx: DbTransaction;
  userId: string;
  mode: "unlink" | "transfer";
  transferUserId?: string;
  relatedCounts: Awaited<ReturnType<typeof getRelatedUserCounts>>;
}) {
  const { tx, userId, mode, transferUserId, relatedCounts } = input;
  const targetUserId = mode === "transfer" ? transferUserId : undefined;

  if (mode === "transfer") {
    if (!targetUserId || targetUserId === userId) {
      throw new HTTPException(400, {
        message: "Select a different user to receive transferred records.",
      });
    }
    await getUserById(targetUserId);
  }

  if (
    mode === "unlink" &&
    (relatedCounts.comments || relatedCounts.invitations)
  ) {
    throw new HTTPException(409, {
      message:
        "This user has comments or invitations. Transfer records before deleting.",
    });
  }

  const memberships = await tx
    .select({
      workspaceId: schema.workspaceUserTable.workspaceId,
      role: schema.workspaceUserTable.role,
    })
    .from(schema.workspaceUserTable)
    .where(eq(schema.workspaceUserTable.userId, userId));

  for (const membership of memberships) {
    if (membership.role !== "owner") continue;

    if (!targetUserId) {
      await assertCanRemoveWorkspaceOwner(tx, membership.workspaceId, userId);
      continue;
    }

    const [targetMembership] = await tx
      .select({ id: schema.workspaceUserTable.id })
      .from(schema.workspaceUserTable)
      .where(
        and(
          eq(schema.workspaceUserTable.workspaceId, membership.workspaceId),
          eq(schema.workspaceUserTable.userId, targetUserId),
        ),
      )
      .limit(1);

    if (targetMembership) {
      await tx
        .update(schema.workspaceUserTable)
        .set({ role: "owner" })
        .where(eq(schema.workspaceUserTable.id, targetMembership.id));
    } else {
      await tx.insert(schema.workspaceUserTable).values({
        id: createId(),
        workspaceId: membership.workspaceId,
        userId: targetUserId,
        role: "owner",
        joinedAt: new Date(),
      });
    }
  }

  if (targetUserId) {
    const ownedProjectWorkspaces = await tx
      .select({ workspaceId: schema.projectTable.workspaceId })
      .from(schema.projectTable)
      .where(eq(schema.projectTable.ownerUserId, userId));
    const workspaceIds = Array.from(
      new Set(ownedProjectWorkspaces.map((project) => project.workspaceId)),
    );

    if (workspaceIds.length) {
      const existingTargetMemberships = await tx
        .select({ workspaceId: schema.workspaceUserTable.workspaceId })
        .from(schema.workspaceUserTable)
        .where(
          and(
            eq(schema.workspaceUserTable.userId, targetUserId),
            inArray(schema.workspaceUserTable.workspaceId, workspaceIds),
          ),
        );
      const existingWorkspaceIds = new Set(
        existingTargetMemberships.map((membership) => membership.workspaceId),
      );
      const missingMemberships = workspaceIds
        .filter((workspaceId) => !existingWorkspaceIds.has(workspaceId))
        .map((workspaceId) => ({
          id: createId(),
          workspaceId,
          userId: targetUserId,
          role: "member",
          joinedAt: new Date(),
        }));

      if (missingMemberships.length) {
        await tx.insert(schema.workspaceUserTable).values(missingMemberships);
      }
    }
  }

  const nullableUserId = targetUserId ?? null;
  await tx
    .delete(schema.workspaceUserTable)
    .where(eq(schema.workspaceUserTable.userId, userId));
  await tx
    .delete(schema.teamMemberTable)
    .where(eq(schema.teamMemberTable.userId, userId));
  await tx
    .delete(schema.apikeyTable)
    .where(eq(schema.apikeyTable.userId, userId));
  await tx
    .delete(schema.apikeyTable)
    .where(eq(schema.apikeyTable.referenceId, userId));
  await tx
    .update(schema.projectTable)
    .set({ ownerUserId: nullableUserId })
    .where(eq(schema.projectTable.ownerUserId, userId));
  await tx
    .update(schema.taskTable)
    .set({ userId: nullableUserId })
    .where(eq(schema.taskTable.userId, userId));
  await tx
    .update(schema.taskAssigneeTable)
    .set({ assignedByUserId: nullableUserId })
    .where(eq(schema.taskAssigneeTable.assignedByUserId, userId));

  if (targetUserId) {
    await reassignTaskAssignees(tx, userId, targetUserId);
    await tx
      .update(schema.commentTable)
      .set({ userId: targetUserId })
      .where(eq(schema.commentTable.userId, userId));
    await tx
      .update(schema.invitationTable)
      .set({ inviterId: targetUserId })
      .where(eq(schema.invitationTable.inviterId, userId));
  } else {
    await tx
      .delete(schema.taskAssigneeTable)
      .where(eq(schema.taskAssigneeTable.userId, userId));
  }

  await tx
    .update(schema.timeEntryTable)
    .set({ userId: nullableUserId })
    .where(eq(schema.timeEntryTable.userId, userId));
  await tx
    .update(schema.activityTable)
    .set({ userId: nullableUserId })
    .where(eq(schema.activityTable.userId, userId));
  await tx
    .update(schema.assetTable)
    .set({ createdBy: nullableUserId })
    .where(eq(schema.assetTable.createdBy, userId));
}

async function userSummary(userId: string) {
  const [user] = await buildUsersQuery({ userIds: [userId] });

  if (!user) {
    throw new HTTPException(404, { message: "User not found." });
  }

  return user;
}

async function buildUsersQuery(input: {
  q?: string;
  role?: string;
  status?: "active" | "blocked" | "all";
  emailVerified?: "true" | "false";
  limit?: string;
  userIds?: string[];
}) {
  const filters: SQL[] = [];

  if (input.userIds?.length) {
    filters.push(inArray(schema.userTable.id, input.userIds));
  }

  if (input.q) {
    const pattern = `%${input.q}%`;
    filters.push(
      anyOf(
        ilike(schema.userTable.name, pattern),
        ilike(schema.userTable.email, pattern),
      ),
    );
  }

  if (input.role) {
    filters.push(eq(schema.userTable.role, input.role));
  }

  if (input.status === "active") {
    filters.push(
      anyOf(
        eq(schema.userTable.banned, false),
        sql`${schema.userTable.banned} is null`,
      ),
    );
  }

  if (input.status === "blocked") {
    filters.push(eq(schema.userTable.banned, true));
  }

  if (input.emailVerified === "true") {
    filters.push(eq(schema.userTable.emailVerified, true));
  }

  if (input.emailVerified === "false") {
    filters.push(eq(schema.userTable.emailVerified, false));
  }

  const limit = Math.min(Number(input.limit ?? 50), 100);
  const rows = await db
    .select({
      id: schema.userTable.id,
      name: schema.userTable.name,
      email: schema.userTable.email,
      role: schema.userTable.role,
      emailVerified: schema.userTable.emailVerified,
      banned: schema.userTable.banned,
      banReason: schema.userTable.banReason,
      banExpires: schema.userTable.banExpires,
      createdAt: schema.userTable.createdAt,
      updatedAt: schema.userTable.updatedAt,
    })
    .from(schema.userTable)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(schema.userTable.createdAt))
    .limit(limit);

  if (!rows.length) return [];

  const userIds = rows.map((user) => user.id);
  const now = new Date();

  const [
    workspaceCounts,
    projectCounts,
    taskCounts,
    openTaskCounts,
    sessionStats,
    workspaceMemberships,
    ownedProjects,
  ] = await Promise.all([
    db
      .select({
        userId: schema.workspaceUserTable.userId,
        value: count(),
      })
      .from(schema.workspaceUserTable)
      .where(inArray(schema.workspaceUserTable.userId, userIds))
      .groupBy(schema.workspaceUserTable.userId),
    db
      .select({
        userId: schema.workspaceUserTable.userId,
        value: sql<number>`count(distinct ${schema.projectTable.id})`,
      })
      .from(schema.workspaceUserTable)
      .innerJoin(
        schema.projectTable,
        eq(
          schema.workspaceUserTable.workspaceId,
          schema.projectTable.workspaceId,
        ),
      )
      .where(inArray(schema.workspaceUserTable.userId, userIds))
      .groupBy(schema.workspaceUserTable.userId),
    db
      .select({
        userId: schema.taskAssigneeTable.userId,
        value: sql<number>`count(distinct ${schema.taskAssigneeTable.taskId})`,
      })
      .from(schema.taskAssigneeTable)
      .where(inArray(schema.taskAssigneeTable.userId, userIds))
      .groupBy(schema.taskAssigneeTable.userId),
    db
      .select({
        userId: schema.taskAssigneeTable.userId,
        value: sql<number>`count(distinct ${schema.taskAssigneeTable.taskId})`,
      })
      .from(schema.taskAssigneeTable)
      .innerJoin(
        schema.taskTable,
        eq(schema.taskAssigneeTable.taskId, schema.taskTable.id),
      )
      .where(
        and(
          inArray(schema.taskAssigneeTable.userId, userIds),
          ne(schema.taskTable.status, "done"),
        ),
      )
      .groupBy(schema.taskAssigneeTable.userId),
    db
      .select({
        userId: schema.sessionTable.userId,
        activeSessions: count(),
        lastAccessAt: max(schema.sessionTable.updatedAt),
      })
      .from(schema.sessionTable)
      .where(
        and(
          inArray(schema.sessionTable.userId, userIds),
          sql`${schema.sessionTable.expiresAt} > ${now}`,
        ),
      )
      .groupBy(schema.sessionTable.userId),
    db
      .select({
        userId: schema.workspaceUserTable.userId,
        id: schema.workspaceTable.id,
        name: schema.workspaceTable.name,
        role: schema.workspaceUserTable.role,
      })
      .from(schema.workspaceUserTable)
      .innerJoin(
        schema.workspaceTable,
        eq(schema.workspaceUserTable.workspaceId, schema.workspaceTable.id),
      )
      .where(inArray(schema.workspaceUserTable.userId, userIds)),
    db
      .select({
        userId: schema.projectTable.ownerUserId,
        id: schema.projectTable.id,
        name: schema.projectTable.name,
        workspaceId: schema.workspaceTable.id,
        workspaceName: schema.workspaceTable.name,
      })
      .from(schema.projectTable)
      .innerJoin(
        schema.workspaceTable,
        eq(schema.projectTable.workspaceId, schema.workspaceTable.id),
      )
      .where(inArray(schema.projectTable.ownerUserId, userIds)),
  ]);

  const workspaceCountMap = new Map(
    workspaceCounts.map((row) => [row.userId, Number(row.value)]),
  );
  const projectCountMap = new Map(
    projectCounts.map((row) => [row.userId, Number(row.value)]),
  );
  const taskCountMap = new Map(
    taskCounts
      .filter((row) => row.userId)
      .map((row) => [row.userId as string, Number(row.value)]),
  );
  const openTaskCountMap = new Map(
    openTaskCounts
      .filter((row) => row.userId)
      .map((row) => [row.userId as string, Number(row.value)]),
  );
  const sessionStatsMap = new Map(
    sessionStats.map((row) => [
      row.userId,
      {
        activeSessionCount: Number(row.activeSessions),
        lastAccessAt: row.lastAccessAt,
      },
    ]),
  );
  const workspaceMembershipMap = new Map<
    string,
    Array<{ id: string; name: string; role: string }>
  >();
  for (const membership of workspaceMemberships) {
    workspaceMembershipMap.set(membership.userId, [
      ...(workspaceMembershipMap.get(membership.userId) ?? []),
      {
        id: membership.id,
        name: membership.name,
        role: membership.role,
      },
    ]);
  }
  const ownedProjectMap = new Map<
    string,
    Array<{
      id: string;
      name: string;
      workspaceId: string;
      workspaceName: string;
    }>
  >();
  for (const project of ownedProjects) {
    if (!project.userId) continue;
    ownedProjectMap.set(project.userId, [
      ...(ownedProjectMap.get(project.userId) ?? []),
      {
        id: project.id,
        name: project.name,
        workspaceId: project.workspaceId,
        workspaceName: project.workspaceName,
      },
    ]);
  }

  return rows.map((user) => {
    const session = sessionStatsMap.get(user.id);

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: normalizeGlobalRole(user.role),
      emailVerified: user.emailVerified,
      banned: Boolean(user.banned),
      banReason: user.banReason,
      banExpires: toIsoString(user.banExpires),
      status: user.banned ? "blocked" : "active",
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
      lastAccessAt: toIsoString(session?.lastAccessAt),
      workspaceCount: workspaceCountMap.get(user.id) ?? 0,
      projectCount: projectCountMap.get(user.id) ?? 0,
      taskCount: taskCountMap.get(user.id) ?? 0,
      openTaskCount: openTaskCountMap.get(user.id) ?? 0,
      activeSessionCount: session?.activeSessionCount ?? 0,
      workspaces: workspaceMembershipMap.get(user.id) ?? [],
      ownedProjects: ownedProjectMap.get(user.id) ?? [],
    };
  });
}

const admin = new Hono<{
  Variables: {
    userId: string;
    adminRole?: string;
    adminPermissions?: string[];
  };
}>()
  .get(
    "/me",
    describeRoute({
      operationId: "getAdminMe",
      tags: ["Admin"],
      description:
        "Return the current user's global administrative role and permissions.",
      responses: {
        200: {
          description: "Current administrative authorization details",
          content: {
            "application/json": { schema: resolver(adminMeSchema) },
          },
        },
      },
    }),
    requireAdminPermission("admin.access"),
    async (c) => {
      const role = normalizeGlobalRole(c.get("adminRole"));
      const roleDefinition = await getGlobalRoleDefinition(role);

      return c.json({
        role,
        permissions: roleDefinition.permissions,
        permissionCatalog: permissionCatalog(),
      });
    },
  )
  .get(
    "/roles",
    describeRoute({
      operationId: "listGlobalRoles",
      tags: ["Admin"],
      description:
        "List global administrative roles, permissions, and associated user counts.",
      responses: {
        200: {
          description: "Global roles",
          content: {
            "application/json": { schema: resolver(listRolesResponseSchema) },
          },
        },
      },
    }),
    requireAdminPermission("admin.access"),
    async (c) => {
      return c.json({
        roles: await listGlobalRolesWithUserCounts(),
        permissions: permissionCatalog(),
      });
    },
  )
  .post(
    "/roles",
    describeRoute({
      operationId: "createGlobalRole",
      tags: ["Admin"],
      description: "Create a custom global administrative role.",
      responses: {
        200: {
          description: "Created role",
          content: {
            "application/json": { schema: resolver(roleSchema) },
          },
        },
      },
    }),
    validator("json", createRoleSchema),
    requireAdminPermission("admin.users.manage_roles"),
    async (c) => {
      const input = c.req.valid("json");
      const role = normalizeRoleSlug(input.role);

      if (isSystemGlobalRole(role)) {
        throw new HTTPException(409, {
          message: "System roles already exist and cannot be recreated.",
        });
      }

      const existing = await getStoredGlobalRole(role);
      if (existing) {
        throw new HTTPException(409, { message: "Role already exists." });
      }

      const permissions = normalizeRolePermissions(input.permissions, role);
      await db.insert(schema.globalRoleTable).values({
        id: createId(),
        role,
        name: input.name,
        description: input.description,
        permissions,
        isSystem: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const roleDefinition = await getGlobalRoleDefinition(role);
      await recordAuditLog(c, {
        action: "role.created",
        entityType: "role",
        entityId: role,
        entityName: input.name,
        summary: `Criou o papel global ${input.name}.`,
        after: roleDefinition,
      });

      return c.json({ ...roleDefinition, userCount: 0 });
    },
  )
  .post(
    "/roles/:role/duplicate",
    describeRoute({
      operationId: "duplicateGlobalRole",
      tags: ["Admin"],
      description: "Duplicate a global role into a new custom role.",
      responses: {
        200: {
          description: "Duplicated role",
          content: {
            "application/json": { schema: resolver(roleSchema) },
          },
        },
      },
    }),
    validator("json", duplicateRoleSchema),
    requireAdminPermission("admin.users.manage_roles"),
    async (c) => {
      const sourceRole = await getGlobalRoleDefinition(c.req.param("role"));
      const input = c.req.valid("json");
      const role = normalizeRoleSlug(input.role);

      if (isSystemGlobalRole(role)) {
        throw new HTTPException(409, {
          message: "System roles cannot be overwritten.",
        });
      }

      const existing = await getStoredGlobalRole(role);
      if (existing) {
        throw new HTTPException(409, { message: "Role already exists." });
      }

      const sourcePermissions = sourceRole.permissions.includes("*")
        ? Object.keys(ADMIN_PERMISSION_CATALOG)
        : sourceRole.permissions;
      const permissions = normalizeRolePermissions(sourcePermissions, role);
      await db.insert(schema.globalRoleTable).values({
        id: createId(),
        role,
        name: input.name ?? `${sourceRole.name} copy`,
        description: input.description ?? sourceRole.description,
        permissions,
        isSystem: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const roleDefinition = await getGlobalRoleDefinition(role);
      await recordAuditLog(c, {
        action: "role.duplicated",
        entityType: "role",
        entityId: role,
        entityName: input.name ?? `${sourceRole.name} copy`,
        summary: `Duplicou ${sourceRole.name} para ${input.name ?? `${sourceRole.name} copy`}.`,
        before: sourceRole,
        after: roleDefinition,
        metadata: { sourceRole: sourceRole.role },
      });

      return c.json({ ...roleDefinition, userCount: 0 });
    },
  )
  .patch(
    "/roles/:role",
    describeRoute({
      operationId: "updateGlobalRole",
      tags: ["Admin"],
      description: "Update a global role metadata or permission set.",
      responses: {
        200: {
          description: "Updated role",
          content: {
            "application/json": { schema: resolver(roleSchema) },
          },
        },
      },
    }),
    validator("json", updateRoleSchema),
    requireAdminPermission("admin.users.manage_roles"),
    async (c) => {
      const role = normalizeRoleSlug(c.req.param("role"));
      const input = c.req.valid("json");
      const currentRole = await getGlobalRoleDefinition(role);

      if (role === "superadmin") {
        throw new HTTPException(409, {
          message: "The superadmin role is protected.",
        });
      }

      if (!isSystemGlobalRole(role) && !(await getStoredGlobalRole(role))) {
        throw new HTTPException(404, { message: "Role not found." });
      }

      const permissions =
        input.permissions === undefined
          ? currentRole.permissions
          : normalizeRolePermissions(input.permissions, role);

      const values = {
        role,
        name: input.name ?? currentRole.name,
        description: input.description ?? currentRole.description,
        permissions,
        isSystem: currentRole.isSystem,
        updatedAt: new Date(),
      };

      const storedRole = await getStoredGlobalRole(role);
      if (storedRole) {
        await db
          .update(schema.globalRoleTable)
          .set(values)
          .where(eq(schema.globalRoleTable.role, role));
      } else {
        await db.insert(schema.globalRoleTable).values({
          id: createId(),
          ...values,
          createdAt: new Date(),
        });
      }

      const [updatedRole] = (await listGlobalRolesWithUserCounts()).filter(
        (roleDefinition) => roleDefinition.role === role,
      );
      if (!updatedRole) {
        throw new HTTPException(500, { message: "Updated role not found." });
      }

      await recordAuditLog(c, {
        action: "role.updated",
        entityType: "role",
        entityId: role,
        entityName: updatedRole.name,
        summary: `Atualizou o papel global ${updatedRole.name}.`,
        before: currentRole,
        after: updatedRole,
      });

      return c.json(updatedRole);
    },
  )
  .delete(
    "/roles/:role",
    describeRoute({
      operationId: "deleteGlobalRole",
      tags: ["Admin"],
      description:
        "Delete a custom global role, optionally replacing it for associated users.",
      responses: {
        200: {
          description: "Deletion result",
          content: {
            "application/json": { schema: resolver(adminActionResponseSchema) },
          },
        },
      },
    }),
    validator("json", deleteRoleSchema),
    requireAdminPermission("admin.users.manage_roles"),
    async (c) => {
      const role = normalizeRoleSlug(c.req.param("role"));
      const input = c.req.valid("json");

      if (isSystemGlobalRole(role)) {
        throw new HTTPException(409, {
          message: "System roles cannot be deleted.",
        });
      }

      const storedRole = await getStoredGlobalRole(role);
      if (!storedRole) {
        throw new HTTPException(404, { message: "Role not found." });
      }
      const roleDefinition = await getGlobalRoleDefinition(role);

      const associatedUsers = await tableCountWhere(
        schema.userTable,
        eq(schema.userTable.role, role),
      );

      if (associatedUsers > 0) {
        if (!input.replacementRole) {
          throw new HTTPException(409, {
            message:
              "Role is in use. Select a replacement role before deleting.",
          });
        }

        const replacementRole = await assertRoleExists(input.replacementRole);
        if (replacementRole === role) {
          throw new HTTPException(400, {
            message:
              "Replacement role must be different from the deleted role.",
          });
        }

        await db
          .update(schema.userTable)
          .set({ role: replacementRole, updatedAt: new Date() })
          .where(eq(schema.userTable.role, role));
      }

      await db
        .delete(schema.globalRoleTable)
        .where(eq(schema.globalRoleTable.role, role));

      await recordAuditLog(c, {
        action: "role.deleted",
        entityType: "role",
        entityId: role,
        entityName: storedRole.name,
        summary: `Excluiu o papel global ${storedRole.name}.`,
        before: roleDefinition,
        metadata: {
          replacementRole: input.replacementRole ?? null,
          associatedUsers,
        },
      });

      return c.json({ ok: true });
    },
  )
  .get(
    "/users",
    describeRoute({
      operationId: "listAdminUsers",
      tags: ["Admin"],
      description:
        "List users with global role, account status, activity, and relationship metrics.",
      responses: {
        200: {
          description: "Administrative users list",
          content: {
            "application/json": { schema: resolver(adminUsersResponseSchema) },
          },
        },
      },
    }),
    validator("query", listUsersQuerySchema),
    requireAdminPermission("admin.users.view"),
    async (c) => {
      const query = c.req.valid("query");
      const users = await buildUsersQuery(query);

      return c.json({ users });
    },
  )
  .post(
    "/users",
    describeRoute({
      operationId: "createAdminUser",
      tags: ["Admin"],
      description: "Create a user directly from the administration area.",
      responses: {
        200: {
          description: "Created user",
          content: {
            "application/json": { schema: resolver(adminUserResponseSchema) },
          },
        },
      },
    }),
    validator("json", createUserSchema),
    requireAdminPermission("admin.users.create"),
    async (c) => {
      const input = c.req.valid("json");
      const role = await assertRoleExists(input.role ?? "user");
      assertCanSelectRole(c.get("adminPermissions"), role);
      const workspaceMemberships = normalizeWorkspaceMemberships(
        input.workspaceMemberships,
      );
      const ownedProjectIds = normalizeProjectIds(input.ownedProjectIds);
      await assertWorkspacesExist(
        workspaceMemberships.map((membership) => membership.workspaceId),
      );

      const email = normalizeEmail(input.email);
      const [existing] = await db
        .select({ id: schema.userTable.id })
        .from(schema.userTable)
        .where(eq(schema.userTable.email, email))
        .limit(1);

      if (existing) {
        throw new HTTPException(409, { message: "Email is already in use." });
      }

      const now = new Date();
      const userId = createId();
      const passwordHash = await bcrypt.hash(input.password, 10);

      await db.transaction(async (tx) => {
        await tx.insert(schema.userTable).values({
          id: userId,
          name: input.name,
          email,
          emailVerified: input.emailVerified ?? true,
          role,
          banned: input.banned ?? false,
          banReason: input.banned
            ? input.banReason || "Blocked by admin"
            : null,
          createdAt: now,
          updatedAt: now,
        });

        if (workspaceMemberships.length) {
          await syncUserWorkspaceMemberships(tx, userId, workspaceMemberships);
        }

        await tx.insert(schema.accountTable).values({
          id: createId(),
          accountId: email,
          providerId: "credential",
          userId,
          password: passwordHash,
          createdAt: now,
          updatedAt: now,
        });
      });

      await assertOwnedProjectsAllowed(
        userId,
        ownedProjectIds,
        workspaceMemberships.map((membership) => membership.workspaceId),
      );
      if (ownedProjectIds.length) {
        await db.transaction((tx) =>
          syncUserOwnedProjects(tx, userId, ownedProjectIds),
        );
      }

      const createdUser = await userSummary(userId);
      await recordAuditLog(c, {
        action: "user.created",
        entityType: "user",
        entityId: createdUser.id,
        entityName: createdUser.email,
        summary: `Criou o usuário ${createdUser.email}.`,
        after: createdUser,
      });

      return c.json({ user: createdUser });
    },
  )
  .patch(
    "/users/:userId",
    describeRoute({
      operationId: "updateAdminUser",
      tags: ["Admin"],
      description:
        "Update identity, verification, status, or global role for a user.",
      responses: {
        200: {
          description: "Updated user",
          content: {
            "application/json": { schema: resolver(adminUserResponseSchema) },
          },
        },
      },
    }),
    validator("json", updateUserSchema),
    requireAdminPermission("admin.users.update"),
    async (c) => {
      const userId = c.req.param("userId");
      const input = c.req.valid("json");
      const targetUser = await getUserById(userId);
      let nextRole = input.role;
      const workspaceMemberships =
        input.workspaceMemberships === undefined
          ? undefined
          : normalizeWorkspaceMemberships(input.workspaceMemberships);
      const ownedProjectIds =
        input.ownedProjectIds === undefined
          ? undefined
          : normalizeProjectIds(input.ownedProjectIds);

      if (input.email) {
        const email = normalizeEmail(input.email);
        const [existing] = await db
          .select({ id: schema.userTable.id })
          .from(schema.userTable)
          .where(
            and(
              eq(schema.userTable.email, email),
              ne(schema.userTable.id, userId),
            ),
          )
          .limit(1);

        if (existing) {
          throw new HTTPException(409, { message: "Email is already in use." });
        }
      }

      if (input.role && input.role !== normalizeGlobalRole(targetUser.role)) {
        nextRole = await assertRoleExists(input.role);
        assertCanChangeRole(c.get("adminPermissions"));

        if (normalizeGlobalRole(targetUser.role) === "superadmin") {
          await assertNotLastSuperadmin(targetUser, "demote");
        }
      }

      if (input.banned === true && !targetUser.banned) {
        await assertNotLastSuperadmin(targetUser, "block");
      }

      if (workspaceMemberships !== undefined) {
        await assertWorkspacesExist(
          workspaceMemberships.map((membership) => membership.workspaceId),
        );
      }
      if (ownedProjectIds !== undefined) {
        await assertOwnedProjectsAllowed(
          userId,
          ownedProjectIds,
          workspaceMemberships?.map((membership) => membership.workspaceId),
        );
      }

      await db.transaction(async (tx) => {
        await tx
          .update(schema.userTable)
          .set({
            ...(input.name !== undefined ? { name: input.name } : {}),
            ...(input.email !== undefined
              ? { email: normalizeEmail(input.email) }
              : {}),
            ...(nextRole !== undefined ? { role: nextRole } : {}),
            ...(input.emailVerified !== undefined
              ? { emailVerified: input.emailVerified }
              : {}),
            ...(input.banned !== undefined
              ? {
                  banned: input.banned,
                  banReason: input.banned
                    ? input.banReason ||
                      targetUser.banReason ||
                      "Blocked by admin"
                    : null,
                  banExpires: null,
                }
              : input.banReason !== undefined
                ? { banReason: input.banReason }
                : {}),
            updatedAt: new Date(),
          })
          .where(eq(schema.userTable.id, userId));

        if (workspaceMemberships !== undefined) {
          await syncUserWorkspaceMemberships(tx, userId, workspaceMemberships);
        }

        if (ownedProjectIds !== undefined) {
          await syncUserOwnedProjects(tx, userId, ownedProjectIds);
        }
      });

      const updatedUser = await userSummary(userId);
      await recordAuditLog(c, {
        action: "user.updated",
        entityType: "user",
        entityId: updatedUser.id,
        entityName: updatedUser.email,
        summary: `Atualizou o usuário ${updatedUser.email}.`,
        before: {
          id: targetUser.id,
          name: targetUser.name,
          email: targetUser.email,
          role: normalizeGlobalRole(targetUser.role),
          emailVerified: targetUser.emailVerified,
          banned: Boolean(targetUser.banned),
        },
        after: updatedUser,
      });

      return c.json({ user: updatedUser });
    },
  )
  .post(
    "/users/:userId/reset-password",
    describeRoute({
      operationId: "resetAdminUserPassword",
      tags: ["Admin"],
      description: "Set a new credential password for a user.",
      responses: {
        200: {
          description: "Password reset result",
          content: {
            "application/json": { schema: resolver(adminActionResponseSchema) },
          },
        },
      },
    }),
    validator("json", resetPasswordSchema),
    requireAdminPermission("admin.users.update"),
    async (c) => {
      const userId = c.req.param("userId");
      const input = c.req.valid("json");
      const user = await getUserById(userId);
      const now = new Date();
      const passwordHash = await bcrypt.hash(input.password, 10);

      const updatedAccounts = await db
        .update(schema.accountTable)
        .set({ password: passwordHash, updatedAt: now })
        .where(
          and(
            eq(schema.accountTable.userId, userId),
            eq(schema.accountTable.providerId, "credential"),
          ),
        )
        .returning({ id: schema.accountTable.id });

      if (!updatedAccounts.length) {
        await db.insert(schema.accountTable).values({
          id: createId(),
          accountId: user.email,
          providerId: "credential",
          userId,
          password: passwordHash,
          createdAt: now,
          updatedAt: now,
        });
      }

      await db
        .delete(schema.sessionTable)
        .where(eq(schema.sessionTable.userId, userId));

      await recordAuditLog(c, {
        action: "user.password_reset",
        entityType: "user",
        entityId: user.id,
        entityName: user.email,
        summary: `Redefiniu a senha de ${user.email}.`,
        metadata: { sessionsRevoked: true },
      });

      return c.json({ ok: true });
    },
  )
  .post(
    "/users/:userId/revoke-sessions",
    describeRoute({
      operationId: "revokeAdminUserSessions",
      tags: ["Admin"],
      description: "Revoke all active sessions for a user.",
      responses: {
        200: {
          description: "Session revocation result",
          content: {
            "application/json": { schema: resolver(adminActionResponseSchema) },
          },
        },
      },
    }),
    requireAdminPermission("admin.users.update"),
    async (c) => {
      await getUserById(c.req.param("userId"));
      await db
        .delete(schema.sessionTable)
        .where(eq(schema.sessionTable.userId, c.req.param("userId")));

      const user = await getUserById(c.req.param("userId"));
      await recordAuditLog(c, {
        action: "user.sessions_revoked",
        entityType: "user",
        entityId: user.id,
        entityName: user.email,
        summary: `Revogou as sessões de ${user.email}.`,
      });

      return c.json({ ok: true });
    },
  )
  .delete(
    "/users/:userId",
    describeRoute({
      operationId: "deleteAdminUser",
      tags: ["Admin"],
      description:
        "Delete a user when no operational records are linked to the account.",
      responses: {
        200: {
          description: "Deletion result",
          content: {
            "application/json": { schema: resolver(adminActionResponseSchema) },
          },
        },
      },
    }),
    validator("json", deleteUserSchema),
    requireAdminPermission("admin.users.delete"),
    async (c) => {
      const userId = c.req.param("userId");
      const input = c.req.valid("json");
      const targetUser = await getUserById(userId);

      if (c.get("userId") === userId) {
        throw new HTTPException(409, {
          message: "Cannot delete your own user from the current session.",
        });
      }

      if (
        normalizeEmail(input.confirmEmail) !== normalizeEmail(targetUser.email)
      ) {
        throw new HTTPException(400, {
          message: "Confirmation email does not match the user.",
        });
      }

      await assertNotLastSuperadmin(targetUser, "delete");

      const relatedCounts = await getRelatedUserCounts(userId);
      const mode = input.mode ?? "unlink";
      if (hasOperationalRelations(relatedCounts) && !input.mode) {
        throw new HTTPException(409, {
          message:
            "User has operational records. Choose unlink or transfer before deleting.",
        });
      }

      await db.transaction(async (tx) => {
        await prepareUserDeletion({
          tx,
          userId,
          mode,
          transferUserId: input.transferUserId,
          relatedCounts,
        });

        await tx
          .delete(schema.userTable)
          .where(eq(schema.userTable.id, userId));
      });

      await recordAuditLog(c, {
        action: "user.deleted",
        entityType: "user",
        entityId: targetUser.id,
        entityName: targetUser.email,
        summary: `Excluiu o usuário ${targetUser.email}.`,
        before: {
          id: targetUser.id,
          name: targetUser.name,
          email: targetUser.email,
          role: normalizeGlobalRole(targetUser.role),
          banned: Boolean(targetUser.banned),
        },
        metadata: relatedCounts,
      });

      return c.json({ ok: true });
    },
  )
  .get(
    "/overview",
    describeRoute({
      operationId: "getAdminOverview",
      tags: ["Admin"],
      description: "Return high-level administrative overview metrics.",
      responses: {
        200: {
          description: "Administrative overview",
          content: {
            "application/json": { schema: resolver(adminOverviewSchema) },
          },
        },
      },
    }),
    requireAdminPermission("admin.overview.view"),
    async (c) => {
      let databaseStatus: "ok" | "degraded" = "ok";
      try {
        await db.execute(sql`select 1`);
      } catch {
        databaseStatus = "degraded";
      }

      const [
        users,
        activeUsers,
        blockedUsers,
        workspaces,
        projects,
        tasks,
        roles,
        activeSessions,
        smtpHost,
        smtpFromEmail,
        recentAccessRows,
        recentActionRows,
      ] = await Promise.all([
        tableCount(schema.userTable),
        tableCountWhere(
          schema.userTable,
          anyOf(
            eq(schema.userTable.banned, false),
            sql`${schema.userTable.banned} is null`,
          ),
        ),
        tableCountWhere(schema.userTable, eq(schema.userTable.banned, true)),
        tableCount(schema.workspaceTable),
        tableCount(schema.projectTable),
        tableCount(schema.taskTable),
        listGlobalRoleDefinitions(),
        tableCountWhere(
          schema.sessionTable,
          sql`${schema.sessionTable.expiresAt} > ${new Date()}`,
        ),
        getRuntimeSetting("email.smtpHost"),
        getRuntimeSetting("email.smtpFromEmail"),
        db
          .select({
            userId: schema.userTable.id,
            name: schema.userTable.name,
            email: schema.userTable.email,
            lastAccessAt: max(schema.sessionTable.updatedAt),
          })
          .from(schema.sessionTable)
          .innerJoin(
            schema.userTable,
            eq(schema.sessionTable.userId, schema.userTable.id),
          )
          .groupBy(
            schema.userTable.id,
            schema.userTable.name,
            schema.userTable.email,
          )
          .orderBy(desc(max(schema.sessionTable.updatedAt)))
          .limit(5),
        db
          .select({
            id: schema.auditLogTable.id,
            action: schema.auditLogTable.action,
            summary: schema.auditLogTable.summary,
            entityType: schema.auditLogTable.entityType,
            entityName: schema.auditLogTable.entityName,
            ipAddress: schema.auditLogTable.ipAddress,
            createdAt: schema.auditLogTable.createdAt,
            actorId: schema.userTable.id,
            actorName: schema.userTable.name,
            actorEmail: schema.userTable.email,
          })
          .from(schema.auditLogTable)
          .leftJoin(
            schema.userTable,
            eq(schema.userTable.id, schema.auditLogTable.actorUserId),
          )
          .orderBy(desc(schema.auditLogTable.createdAt))
          .limit(5),
      ]);
      const adminRoleNames = roles
        .filter((role) => hasAdminPermission(role.permissions, "admin.access"))
        .map((role) => role.role);
      const admins = adminRoleNames.length
        ? await tableCountWhere(
            schema.userTable,
            inArray(schema.userTable.role, adminRoleNames),
          )
        : 0;

      return c.json({
        users,
        activeUsers,
        blockedUsers,
        admins,
        workspaces,
        projects,
        tasks,
        roles,
        recentAccesses: recentAccessRows
          .filter((row) => row.lastAccessAt)
          .map((row) => ({
            userId: row.userId,
            name: row.name,
            email: row.email,
            lastAccessAt: row.lastAccessAt?.toISOString() ?? "",
          })),
        recentActions: recentActionRows.map((row) => ({
          id: row.id,
          action: row.action,
          summary: row.summary,
          entityType: row.entityType,
          entityName: row.entityName,
          ipAddress: row.ipAddress,
          createdAt: row.createdAt.toISOString(),
          actor: row.actorId
            ? {
                id: row.actorId,
                name: row.actorName ?? "",
                email: row.actorEmail ?? "",
              }
            : null,
        })),
        system: {
          database: databaseStatus,
          scheduler: isSchedulerRunning() ? "running" : "stopped",
          email: smtpHost && smtpFromEmail ? "configured" : "missing",
          version: process.env.npm_package_version || "1.0.0",
          generatedAt: new Date().toISOString(),
          activeSessions,
        },
      });
    },
  )
  .route("/audit", audit)
  .route("/workspaces", workspaces)
  .route("/projects", projects)
  .route("/tasks", tasks)
  .route("/settings", settings);

export default admin;
