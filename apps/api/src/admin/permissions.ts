export const GLOBAL_ROLE_NAMES = ["superadmin", "admin", "user"] as const;

export type GlobalRoleName = (typeof GLOBAL_ROLE_NAMES)[number];
export type GlobalRoleId = string;

export const ADMIN_PERMISSION_CATALOG = {
  "admin.access": "Access the administration area.",
  "admin.overview.view": "View administrative overview metrics.",
  "admin.users.view": "View users in the administration area.",
  "admin.users.create": "Create users from the administration area.",
  "admin.users.update": "Update users from the administration area.",
  "admin.users.delete": "Delete users from the administration area.",
  "admin.users.manage_roles":
    "Promote, demote, or otherwise manage global roles.",
  "admin.workspaces.view": "View all workspaces.",
  "admin.workspaces.create": "Create workspaces globally.",
  "admin.workspaces.update": "Update workspaces globally.",
  "admin.workspaces.delete": "Delete workspaces globally.",
  "admin.projects.view": "View all projects.",
  "admin.projects.update": "Update projects globally.",
  "admin.projects.delete": "Delete projects globally.",
  "admin.tasks.view": "View all tasks.",
  "admin.tasks.update": "Update tasks globally.",
  "admin.tasks.delete": "Delete tasks globally.",
  "calendar.view": "View calendar administration.",
  "calendar.create": "Create calendar entries.",
  "calendar.update": "Manage calendar entries.",
  "calendar.delete": "Delete calendar entries.",
  "system.settings.view": "View system settings.",
  "system.settings.update": "Update system settings.",
  "system.security.update": "Update critical security settings.",
  "system.smtp.update": "Update SMTP and email delivery settings.",
  "system.audit.view": "View audit logs.",
} as const;

export type AdminPermission = keyof typeof ADMIN_PERMISSION_CATALOG;

export type GlobalRoleDefinition = {
  role: GlobalRoleId;
  name: string;
  description: string;
  permissions: string[];
  isSystem: boolean;
};

export const DEFAULT_GLOBAL_ROLES: Record<
  GlobalRoleName,
  GlobalRoleDefinition
> = {
  superadmin: {
    role: "superadmin",
    name: "Superadmin",
    description:
      "Full platform administration, including critical system settings and administrator management.",
    permissions: ["*"],
    isSystem: true,
  },
  admin: {
    role: "admin",
    name: "Admin",
    description:
      "Administrative access to users, workspaces, projects, tasks, and calendar operations.",
    permissions: [
      "admin.access",
      "admin.overview.view",
      "admin.users.view",
      "admin.workspaces.view",
      "admin.projects.view",
      "admin.tasks.view",
      "calendar.view",
    ],
    isSystem: true,
  },
  user: {
    role: "user",
    name: "User",
    description:
      "Regular platform user. Access is determined by workspace membership and workspace roles.",
    permissions: [],
    isSystem: true,
  },
};

export function isSystemGlobalRole(
  role?: string | null,
): role is GlobalRoleName {
  return GLOBAL_ROLE_NAMES.includes(role as GlobalRoleName);
}

export function normalizeGlobalRole(role?: string | null): GlobalRoleId {
  const normalizedRole = role?.trim().toLowerCase();
  if (normalizedRole) return normalizedRole;

  return "user";
}

export function hasAdminPermission(
  permissions: readonly string[],
  required: AdminPermission,
): boolean {
  return permissions.includes("*") || permissions.includes(required);
}
