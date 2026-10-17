import { count, inArray } from "drizzle-orm";
import db, { schema } from "../../database";

export type InstanceStatus = {
  hasUsers: boolean;
  hasAdmin: boolean;
};

async function getInstanceStatus(): Promise<InstanceStatus> {
  const [totalRow] = await db.select({ value: count() }).from(schema.userTable);
  const [adminRow] = await db
    .select({ value: count() })
    .from(schema.userTable)
    .where(inArray(schema.userTable.role, ["admin", "superadmin"]));

  return {
    hasUsers: (totalRow?.value ?? 0) > 0,
    hasAdmin: (adminRow?.value ?? 0) > 0,
  };
}

export default getInstanceStatus;
