import { asc, count, desc, eq, isNull } from "drizzle-orm";
import db from "../../../database";
import {
  crmCompanyTable,
  crmHostingTable,
  crmSegmentTable,
  crmSourceTable,
  userTable,
} from "../../../database/schema";
import {
  allOf,
  clampLimit,
  ownerScope,
  searchAcross,
} from "../../shared/list-filters";
import type { CrmVisibility } from "../../shared/resolve-visibility";

async function getCompanies({
  workspaceId,
  userId,
  visibility,
  search,
  ownerUserId,
  includeArchived,
  limit,
  offset,
}: {
  workspaceId: string;
  userId: string;
  visibility: CrmVisibility;
  search?: string;
  ownerUserId?: string;
  includeArchived?: boolean;
  limit?: number;
  offset?: number;
}) {
  const where = allOf(
    eq(crmCompanyTable.workspaceId, workspaceId),
    includeArchived ? undefined : isNull(crmCompanyTable.archivedAt),
    ownerScope(crmCompanyTable.ownerUserId, visibility, userId),
    ownerUserId ? eq(crmCompanyTable.ownerUserId, ownerUserId) : undefined,
    searchAcross(
      [
        crmCompanyTable.name,
        crmCompanyTable.legalName,
        crmCompanyTable.taxId,
        crmCompanyTable.domain,
        crmCompanyTable.city,
      ],
      search,
    ),
  );

  const pageSize = clampLimit(limit);

  const [total] = await db
    .select({ value: count() })
    .from(crmCompanyTable)
    .where(where);

  const rows = await db
    .select({
      company: crmCompanyTable,
      hostingMode: crmHostingTable.mode,
      owner: {
        id: userTable.id,
        name: userTable.name,
        email: userTable.email,
        image: userTable.image,
      },
      segment: { id: crmSegmentTable.id, name: crmSegmentTable.name },
      source: { id: crmSourceTable.id, name: crmSourceTable.name },
    })
    .from(crmCompanyTable)
    .leftJoin(
      crmHostingTable,
      eq(crmHostingTable.companyId, crmCompanyTable.id),
    )
    .leftJoin(userTable, eq(crmCompanyTable.ownerUserId, userTable.id))
    .leftJoin(
      crmSegmentTable,
      eq(crmCompanyTable.segmentId, crmSegmentTable.id),
    )
    .leftJoin(crmSourceTable, eq(crmCompanyTable.sourceId, crmSourceTable.id))
    .where(where)
    .orderBy(asc(crmCompanyTable.name), desc(crmCompanyTable.createdAt))
    .limit(pageSize)
    .offset(offset ?? 0);

  return {
    total: total?.value ?? 0,
    limit: pageSize,
    offset: offset ?? 0,
    items: rows.map((row) => ({
      ...row.company,
      hostingMode: row.hostingMode ?? "unknown",
      owner: row.owner,
      segment: row.segment,
      source: row.source,
    })),
  };
}

export default getCompanies;
