import { eq } from "drizzle-orm";
import type { MiddlewareHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import db, { schema } from "../database";
import { getGlobalRoleDefinition } from "./global-roles";
import {
  type AdminPermission,
  hasAdminPermission,
  normalizeGlobalRole,
} from "./permissions";

type AdminVariables = {
  Variables: {
    userId: string;
    adminRole?: string;
    adminPermissions?: string[];
  };
};

export const requireAdminPermission = (
  permission: AdminPermission,
): MiddlewareHandler<AdminVariables> => {
  return async (c, next) => {
    const userId = c.get("userId");
    if (!userId) {
      throw new HTTPException(401, { message: "Unauthorized" });
    }

    const [user] = await db
      .select({ role: schema.userTable.role })
      .from(schema.userTable)
      .where(eq(schema.userTable.id, userId))
      .limit(1);

    if (!user) {
      throw new HTTPException(401, { message: "Unauthorized" });
    }

    const role = normalizeGlobalRole(user.role);
    const roleDefinition = await getGlobalRoleDefinition(role);

    if (!hasAdminPermission(roleDefinition.permissions, permission)) {
      throw new HTTPException(403, { message: "Forbidden" });
    }

    c.set("adminRole", role);
    c.set("adminPermissions", roleDefinition.permissions);

    return next();
  };
};
