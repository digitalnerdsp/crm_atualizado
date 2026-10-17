import { asc, count, eq, isNull } from "drizzle-orm";
import db from "../../../database";
import {
  crmCompanyTable,
  crmContactTable,
  userTable,
} from "../../../database/schema";
import {
  allOf,
  clampLimit,
  ownerScope,
  searchAcross,
} from "../../shared/list-filters";
import type { CrmVisibility } from "../../shared/resolve-visibility";

async function getContacts({
  workspaceId,
  userId,
  visibility,
  search,
  companyId,
  ownerUserId,
  includeArchived,
  limit,
  offset,
}: {
  workspaceId: string;
  userId: string;
  visibility: CrmVisibility;
  search?: string;
  companyId?: string;
  ownerUserId?: string;
  includeArchived?: boolean;
  limit?: number;
  offset?: number;
}) {
  const where = allOf(
    eq(crmContactTable.workspaceId, workspaceId),
    includeArchived ? undefined : isNull(crmContactTable.archivedAt),
    ownerScope(crmContactTable.ownerUserId, visibility, userId),
    companyId ? eq(crmContactTable.companyId, companyId) : undefined,
    ownerUserId ? eq(crmContactTable.ownerUserId, ownerUserId) : undefined,
    searchAcross(
      [
        crmContactTable.firstName,
        crmContactTable.lastName,
        crmContactTable.email,
        crmContactTable.phone,
        crmContactTable.mobile,
        crmContactTable.jobTitle,
      ],
      search,
    ),
  );

  const pageSize = clampLimit(limit);

  const [total] = await db
    .select({ value: count() })
    .from(crmContactTable)
    .where(where);

  const rows = await db
    .select({
      contact: crmContactTable,
      company: {
        id: crmCompanyTable.id,
        name: crmCompanyTable.name,
      },
      owner: {
        id: userTable.id,
        name: userTable.name,
        email: userTable.email,
        image: userTable.image,
      },
    })
    .from(crmContactTable)
    .leftJoin(
      crmCompanyTable,
      eq(crmContactTable.companyId, crmCompanyTable.id),
    )
    .leftJoin(userTable, eq(crmContactTable.ownerUserId, userTable.id))
    .where(where)
    .orderBy(asc(crmContactTable.firstName), asc(crmContactTable.lastName))
    .limit(pageSize)
    .offset(offset ?? 0);

  return {
    total: total?.value ?? 0,
    limit: pageSize,
    offset: offset ?? 0,
    items: rows.map((row) => ({
      ...row.contact,
      company: row.company,
      owner: row.owner,
    })),
  };
}

export default getContacts;
