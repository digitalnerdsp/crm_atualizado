import {
  DEFAULT_ROLE_NAMES,
  type DefaultRoleName,
  defaultRolePayloads,
} from "@kaneo/permissions";
import { eq, inArray } from "drizzle-orm";
import db, { schema } from ".";

/**
 * Default roles are seeded per workspace only at creation time (see the
 * `afterCreateOrganization` hook in `auth.ts`), and the seeder skips names that
 * already exist. So a release that adds a role name or a permission resource
 * never reaches workspaces that already exist — their `admin` would silently
 * have no CRM access at all.
 *
 * This backfill closes that gap once per introduced item, and only once: what
 * it has already applied is recorded in a system setting, so an admin who later
 * removes one of these resources from a role does not get it re-added on the
 * next boot.
 */
export const BACKFILL_SETTING_KEY = "workspace_roles.applied_backfills";

/**
 * Items this backfill is responsible for. Append when a release introduces a
 * new default role or permission resource; never remove an entry, or it would
 * be re-applied on top of later admin edits.
 */
export const BACKFILL_ROLE_NAMES = [
  "sales",
  "sales_manager",
  "finance_legal",
] as const;

export const BACKFILL_RESOURCES = [
  "finance",
  "portfolio",
  "crmDeal",
  "crmContact",
  "crmCompany",
  "crmPipeline",
  "crmField",
  "crmReport",
] as const;

export type WorkspaceRoleRow = {
  id: string;
  workspaceId: string;
  role: string;
  permission: string;
};

export type RoleBackfillPlan = {
  inserts: Array<{ workspaceId: string; role: string; permission: string }>;
  updates: Array<{ id: string; permission: string }>;
  tokens: string[];
};

function roleToken(role: string) {
  return `role:${role}`;
}

function resourceToken(resource: string) {
  return `resource:${resource}`;
}

export function allBackfillTokens(): string[] {
  return [
    ...BACKFILL_ROLE_NAMES.map(roleToken),
    ...BACKFILL_RESOURCES.map(resourceToken),
  ];
}

export function parseAppliedTokens(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const value = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is string => typeof item === "string");
  } catch {
    return [];
  }
}

function parsePermission(raw: string): Record<string, string[]> | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const out: Record<string, string[]> = {};
  for (const [resource, actions] of Object.entries(
    value as Record<string, unknown>,
  )) {
    if (!Array.isArray(actions)) continue;
    out[resource] = actions.filter(
      (action): action is string => typeof action === "string",
    );
  }
  return out;
}

function isDefaultRoleName(role: string): role is DefaultRoleName {
  return (DEFAULT_ROLE_NAMES as readonly string[]).includes(role);
}

/**
 * Pure decision step: given every workspace, the default-role rows that already
 * exist and what has already been backfilled, work out the rows to write.
 */
export function planWorkspaceRoleBackfill({
  workspaceIds,
  existingRows,
  appliedTokens,
}: {
  workspaceIds: string[];
  existingRows: WorkspaceRoleRow[];
  appliedTokens: string[];
}): RoleBackfillPlan {
  const applied = new Set(appliedTokens);
  const pendingRoles = BACKFILL_ROLE_NAMES.filter(
    (role) => !applied.has(roleToken(role)),
  );
  const pendingResources = BACKFILL_RESOURCES.filter(
    (resource) => !applied.has(resourceToken(resource)),
  );

  const plan: RoleBackfillPlan = {
    inserts: [],
    updates: [],
    tokens: [
      ...pendingRoles.map(roleToken),
      ...pendingResources.map(resourceToken),
    ],
  };

  if (pendingRoles.length === 0 && pendingResources.length === 0) {
    return plan;
  }

  const rowsByWorkspace = new Map<string, WorkspaceRoleRow[]>();
  for (const row of existingRows) {
    const bucket = rowsByWorkspace.get(row.workspaceId);
    if (bucket) bucket.push(row);
    else rowsByWorkspace.set(row.workspaceId, [row]);
  }

  // 1. Missing rows for newly introduced default roles.
  for (const workspaceId of workspaceIds) {
    const taken = new Set(
      (rowsByWorkspace.get(workspaceId) ?? []).map((row) => row.role),
    );
    for (const role of pendingRoles) {
      if (taken.has(role)) continue;
      plan.inserts.push({
        workspaceId,
        role,
        permission: JSON.stringify(defaultRolePayloads[role]),
      });
    }
  }

  // 2. Resources absent from rows that already exist. Only whole missing keys
  //    are added — actions an admin removed from a resource stay removed.
  if (pendingResources.length > 0) {
    for (const row of existingRows) {
      if (!isDefaultRoleName(row.role)) continue;

      const stored = parsePermission(row.permission);
      // Unparseable payloads are left alone rather than overwritten: losing an
      // admin's configuration is worse than the role missing a new resource.
      if (!stored) continue;

      const defaults = defaultRolePayloads[row.role];
      let changed = false;
      for (const resource of pendingResources) {
        if (resource in stored) continue;
        const actions = defaults[resource];
        // A role the defaults do not grant this resource at all (viewer has no
        // CRM access) must not gain it here.
        if (!actions) continue;
        stored[resource] = [...actions];
        changed = true;
      }

      if (changed) {
        plan.updates.push({ id: row.id, permission: JSON.stringify(stored) });
      }
    }
  }

  return plan;
}

export async function backfillWorkspaceRoles({
  logInfo = console.log,
  logError = console.error,
}: {
  logInfo?: (message: string, ...args: unknown[]) => void;
  logError?: (message: string, ...args: unknown[]) => void;
} = {}): Promise<void> {
  try {
    const [setting] = await db
      .select({ value: schema.systemSettingTable.value })
      .from(schema.systemSettingTable)
      .where(eq(schema.systemSettingTable.key, BACKFILL_SETTING_KEY))
      .limit(1);

    const appliedTokens = parseAppliedTokens(setting?.value);
    const outstanding = allBackfillTokens().filter(
      (token) => !appliedTokens.includes(token),
    );

    // Fast path on every boot after the first: one indexed read, no scan.
    if (outstanding.length === 0) return;

    const workspaces = await db
      .select({ id: schema.workspaceTable.id })
      .from(schema.workspaceTable);

    const existingRows = await db
      .select({
        id: schema.workspaceRoleTable.id,
        workspaceId: schema.workspaceRoleTable.workspaceId,
        role: schema.workspaceRoleTable.role,
        permission: schema.workspaceRoleTable.permission,
      })
      .from(schema.workspaceRoleTable)
      .where(
        inArray(schema.workspaceRoleTable.role, [
          ...(DEFAULT_ROLE_NAMES as readonly string[]),
        ]),
      );

    const plan = planWorkspaceRoleBackfill({
      workspaceIds: workspaces.map((workspace) => workspace.id),
      existingRows,
      appliedTokens,
    });

    const now = new Date();

    await db.transaction(async (tx) => {
      if (plan.inserts.length > 0) {
        await tx.insert(schema.workspaceRoleTable).values(
          plan.inserts.map((row) => ({
            ...row,
            createdAt: now,
            updatedAt: now,
          })),
        );
      }

      for (const update of plan.updates) {
        await tx
          .update(schema.workspaceRoleTable)
          .set({ permission: update.permission, updatedAt: now })
          .where(eq(schema.workspaceRoleTable.id, update.id));
      }

      const nextTokens = [...new Set([...appliedTokens, ...plan.tokens])];
      await tx
        .insert(schema.systemSettingTable)
        .values({
          key: BACKFILL_SETTING_KEY,
          value: JSON.stringify(nextTokens),
          valueType: "json",
          category: "instance",
          isSecret: false,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: schema.systemSettingTable.key,
          set: { value: JSON.stringify(nextTokens), updatedAt: now },
        });
    });

    if (plan.inserts.length > 0 || plan.updates.length > 0) {
      logInfo(
        `✅ Workspace roles backfilled (${plan.inserts.length} rows added, ${plan.updates.length} updated)`,
      );
    }
  } catch (error) {
    // A failed backfill must not stop the API from booting: the worst case is
    // that admins re-grant the permissions by hand in the Roles screen.
    logError("⚠️  Failed to backfill workspace roles", error);
  }
}
