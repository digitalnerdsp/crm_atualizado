import { eq } from "drizzle-orm";
import db, { schema } from "../database";
import {
  DEFAULT_GLOBAL_ROLES,
  type GlobalRoleDefinition,
  isSystemGlobalRole,
  normalizeGlobalRole,
} from "./permissions";

function normalizePermissions(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

export async function getGlobalRoleDefinition(
  role?: string | null,
): Promise<GlobalRoleDefinition> {
  const normalizedRole = normalizeGlobalRole(role);
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

  if (!row) {
    if (isSystemGlobalRole(normalizedRole)) {
      return DEFAULT_GLOBAL_ROLES[normalizedRole];
    }

    return {
      role: normalizedRole,
      name: normalizedRole,
      description:
        "Custom role without an active permission definition. It grants no administrative access.",
      permissions: [],
      isSystem: false,
    };
  }

  return {
    role: normalizedRole,
    name: row.name,
    description: row.description,
    permissions: normalizePermissions(row.permissions),
    isSystem: row.isSystem,
  };
}

export async function listGlobalRoleDefinitions(): Promise<
  GlobalRoleDefinition[]
> {
  const rows = await db
    .select({
      role: schema.globalRoleTable.role,
      name: schema.globalRoleTable.name,
      description: schema.globalRoleTable.description,
      permissions: schema.globalRoleTable.permissions,
      isSystem: schema.globalRoleTable.isSystem,
    })
    .from(schema.globalRoleTable);

  const byRole = new Map<string, GlobalRoleDefinition>(
    rows.map((row) => [
      normalizeGlobalRole(row.role),
      {
        role: normalizeGlobalRole(row.role),
        name: row.name,
        description: row.description,
        permissions: normalizePermissions(row.permissions),
        isSystem: row.isSystem,
      },
    ]),
  );

  const systemRoles = Object.values(DEFAULT_GLOBAL_ROLES).map(
    (role) => byRole.get(role.role) ?? role,
  );

  const customRoles = rows
    .filter((row) => !isSystemGlobalRole(normalizeGlobalRole(row.role)))
    .map((row) => byRole.get(normalizeGlobalRole(row.role)))
    .filter((role): role is GlobalRoleDefinition => Boolean(role))
    .sort((first, second) => first.name.localeCompare(second.name));

  return [...systemRoles, ...customRoles];
}
