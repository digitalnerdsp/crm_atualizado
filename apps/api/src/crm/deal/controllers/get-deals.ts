import { asc, count, desc, eq, gte, isNull, lte } from "drizzle-orm";
import db from "../../../database";
import {
  crmCompanyTable,
  crmDealTable,
  crmStageTable,
  userTable,
} from "../../../database/schema";
import {
  allOf,
  clampLimit,
  ownerScope,
  searchAcross,
} from "../../shared/list-filters";
import type { CrmVisibility } from "../../shared/resolve-visibility";

const SORTABLE = {
  createdAt: crmDealTable.createdAt,
  updatedAt: crmDealTable.updatedAt,
  valueCents: crmDealTable.valueCents,
  expectedCloseDate: crmDealTable.expectedCloseDate,
  title: crmDealTable.title,
} as const;

export type DealSortField = keyof typeof SORTABLE;

async function getDeals({
  workspaceId,
  userId,
  visibility,
  pipelineId,
  stageId,
  status,
  ownerUserId,
  companyId,
  search,
  closingFrom,
  closingTo,
  includeArchived,
  sortBy,
  sortDirection,
  limit,
  offset,
}: {
  workspaceId: string;
  userId: string;
  visibility: CrmVisibility;
  pipelineId?: string;
  stageId?: string;
  status?: "open" | "won" | "lost";
  ownerUserId?: string;
  companyId?: string;
  search?: string;
  closingFrom?: Date;
  closingTo?: Date;
  includeArchived?: boolean;
  sortBy?: DealSortField;
  sortDirection?: "asc" | "desc";
  limit?: number;
  offset?: number;
}) {
  const where = allOf(
    eq(crmDealTable.workspaceId, workspaceId),
    includeArchived ? undefined : isNull(crmDealTable.archivedAt),
    ownerScope(crmDealTable.ownerUserId, visibility, userId),
    pipelineId ? eq(crmDealTable.pipelineId, pipelineId) : undefined,
    stageId ? eq(crmDealTable.stageId, stageId) : undefined,
    status ? eq(crmDealTable.status, status) : undefined,
    ownerUserId ? eq(crmDealTable.ownerUserId, ownerUserId) : undefined,
    companyId ? eq(crmDealTable.companyId, companyId) : undefined,
    closingFrom ? gte(crmDealTable.expectedCloseDate, closingFrom) : undefined,
    closingTo ? lte(crmDealTable.expectedCloseDate, closingTo) : undefined,
    searchAcross([crmDealTable.title], search),
  );

  const pageSize = clampLimit(limit);
  const column = SORTABLE[sortBy ?? "updatedAt"];
  const order = sortDirection === "asc" ? asc(column) : desc(column);

  const [total] = await db
    .select({ value: count() })
    .from(crmDealTable)
    .where(where);

  const rows = await db
    .select({
      deal: crmDealTable,
      stage: {
        id: crmStageTable.id,
        name: crmStageTable.name,
        outcome: crmStageTable.outcome,
        probability: crmStageTable.probability,
        color: crmStageTable.color,
      },
      company: { id: crmCompanyTable.id, name: crmCompanyTable.name },
      owner: {
        id: userTable.id,
        name: userTable.name,
        email: userTable.email,
        image: userTable.image,
      },
    })
    .from(crmDealTable)
    .innerJoin(crmStageTable, eq(crmDealTable.stageId, crmStageTable.id))
    .leftJoin(crmCompanyTable, eq(crmDealTable.companyId, crmCompanyTable.id))
    .leftJoin(userTable, eq(crmDealTable.ownerUserId, userTable.id))
    .where(where)
    .orderBy(order)
    .limit(pageSize)
    .offset(offset ?? 0);

  return {
    total: total?.value ?? 0,
    limit: pageSize,
    offset: offset ?? 0,
    items: rows.map((row) => ({
      ...row.deal,
      stage: row.stage,
      company: row.company,
      owner: row.owner,
    })),
  };
}

export default getDeals;
