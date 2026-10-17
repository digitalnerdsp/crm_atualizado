import {
  asc,
  count,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  lte,
  or,
} from "drizzle-orm";
import db from "../../../database";
import {
  crmActivityTable,
  crmDealTable,
  userTable,
} from "../../../database/schema";
import { allOf, clampLimit } from "../../shared/list-filters";
import type { CrmVisibility } from "../../shared/resolve-visibility";

async function getActivities({
  workspaceId,
  userId,
  visibility,
  dealId,
  contactId,
  companyId,
  ownerUserId,
  pendingOnly,
  dueBefore,
  dueAfter,
  limit,
  offset,
}: {
  workspaceId: string;
  userId: string;
  visibility: CrmVisibility;
  dealId?: string;
  contactId?: string;
  companyId?: string;
  ownerUserId?: string;
  pendingOnly?: boolean;
  dueBefore?: Date;
  dueAfter?: Date;
  limit?: number;
  offset?: number;
}) {
  // Without read_all a seller sees their own activities plus everything logged
  // on the deals they own — including a call a manager logged on their behalf.
  const ownScope =
    visibility === "all"
      ? undefined
      : or(
          eq(crmActivityTable.ownerUserId, userId),
          inArray(
            crmActivityTable.dealId,
            db
              .select({ id: crmDealTable.id })
              .from(crmDealTable)
              .where(
                allOf(
                  eq(crmDealTable.workspaceId, workspaceId),
                  eq(crmDealTable.ownerUserId, userId),
                ),
              ),
          ),
        );

  const where = allOf(
    eq(crmActivityTable.workspaceId, workspaceId),
    ownScope,
    dealId ? eq(crmActivityTable.dealId, dealId) : undefined,
    contactId ? eq(crmActivityTable.contactId, contactId) : undefined,
    companyId ? eq(crmActivityTable.companyId, companyId) : undefined,
    ownerUserId ? eq(crmActivityTable.ownerUserId, ownerUserId) : undefined,
    pendingOnly ? isNull(crmActivityTable.completedAt) : undefined,
    dueBefore ? lte(crmActivityTable.dueAt, dueBefore) : undefined,
    dueAfter ? gte(crmActivityTable.dueAt, dueAfter) : undefined,
  );

  const pageSize = clampLimit(limit);

  const [total] = await db
    .select({ value: count() })
    .from(crmActivityTable)
    .where(where);

  const rows = await db
    .select({
      activity: crmActivityTable,
      owner: {
        id: userTable.id,
        name: userTable.name,
        email: userTable.email,
        image: userTable.image,
      },
    })
    .from(crmActivityTable)
    .leftJoin(userTable, eq(crmActivityTable.ownerUserId, userTable.id))
    .where(where)
    // Pending work is read by due date, history is read newest first. Ordering
    // by due date then creation covers both without a second endpoint.
    .orderBy(
      pendingOnly
        ? asc(crmActivityTable.dueAt)
        : desc(crmActivityTable.createdAt),
    )
    .limit(pageSize)
    .offset(offset ?? 0);

  return {
    total: total?.value ?? 0,
    limit: pageSize,
    offset: offset ?? 0,
    items: rows.map((row) => ({ ...row.activity, owner: row.owner })),
  };
}

export default getActivities;
