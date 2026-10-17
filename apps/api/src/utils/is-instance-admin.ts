import { eq } from "drizzle-orm";
import type { Context } from "hono";
import db from "../database";
import { userTable } from "../database/schema";

export function isInstanceAdminRole(role?: string | null): boolean {
  return role === "superadmin" || role === "admin";
}

export async function isInstanceAdmin(c: Context): Promise<boolean> {
  const user = c.get("user") as { role?: string | null } | null | undefined;
  if (user?.role) {
    return isInstanceAdminRole(user.role);
  }

  const userId = c.get("userId");
  if (!userId) return false;

  const [row] = await db
    .select({ role: userTable.role })
    .from(userTable)
    .where(eq(userTable.id, userId))
    .limit(1);

  return isInstanceAdminRole(row?.role);
}
