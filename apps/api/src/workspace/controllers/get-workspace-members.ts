import { eq, max } from "drizzle-orm";
import db from "../../database";
import {
  sessionTable,
  userTable,
  workspaceUserTable,
} from "../../database/schema";

async function getWorkspaceMembers(workspaceId: string) {
  const members = await db
    .select({
      id: userTable.id,
      name: userTable.name,
      email: userTable.email,
      image: userTable.image,
      avatarColor: userTable.avatarColor,
      role: workspaceUserTable.role,
      lastAccessAt: max(sessionTable.updatedAt),
    })
    .from(workspaceUserTable)
    .innerJoin(userTable, eq(workspaceUserTable.userId, userTable.id))
    .leftJoin(sessionTable, eq(sessionTable.userId, userTable.id))
    .where(eq(workspaceUserTable.workspaceId, workspaceId))
    .groupBy(
      userTable.id,
      userTable.name,
      userTable.email,
      userTable.image,
      userTable.avatarColor,
      workspaceUserTable.role,
    );

  return members.map((member) => ({
    ...member,
    lastAccessAt: member.lastAccessAt?.toISOString() ?? null,
  }));
}

export default getWorkspaceMembers;
