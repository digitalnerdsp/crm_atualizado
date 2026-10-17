import { and, eq, gte, isNull, lte, type SQL } from "drizzle-orm";
import type { Context } from "hono";
import { crmDealTable } from "../../database/schema";
import {
  type CrmVisibility,
  resolveVisibility,
} from "../shared/resolve-visibility";

export type ReportFilters = {
  workspaceId: string;
  userId: string;
  visibility: CrmVisibility;
  pipelineId?: string;
  ownerUserId?: string;
  from?: Date;
  to?: Date;
};

/**
 * Reports read the same permission split as the listings: without
 * `crmReport:read_all` a rep sees their own numbers, not the team's.
 */
export async function resolveReportFilters(
  c: Context,
  query: {
    pipelineId?: string;
    ownerUserId?: string;
    from?: string;
    to?: string;
  },
): Promise<ReportFilters> {
  return {
    workspaceId: c.get("workspaceId"),
    userId: c.get("userId"),
    visibility: await resolveVisibility(c, "crmReport"),
    pipelineId: query.pipelineId,
    ownerUserId: query.ownerUserId,
    from: query.from ? new Date(query.from) : undefined,
    to: query.to ? new Date(query.to) : undefined,
  };
}

function compact(conditions: Array<SQL | undefined>): SQL | undefined {
  const present = conditions.filter((item): item is SQL => Boolean(item));
  if (present.length === 0) return undefined;
  if (present.length === 1) return present[0];
  return and(...present);
}

/** Workspace, pipeline and owner scope shared by every report. */
export function dealScope(filters: ReportFilters): SQL | undefined {
  return compact([
    eq(crmDealTable.workspaceId, filters.workspaceId),
    isNull(crmDealTable.archivedAt),
    filters.pipelineId
      ? eq(crmDealTable.pipelineId, filters.pipelineId)
      : undefined,
    filters.ownerUserId
      ? eq(crmDealTable.ownerUserId, filters.ownerUserId)
      : undefined,
    filters.visibility === "all"
      ? undefined
      : eq(crmDealTable.ownerUserId, filters.userId),
  ]);
}

/** Adds a date window on an arbitrary timestamp column. */
export function withWindow(
  scope: SQL | undefined,
  column: Parameters<typeof gte>[0],
  filters: ReportFilters,
): SQL | undefined {
  return compact([
    scope,
    filters.from ? gte(column, filters.from) : undefined,
    filters.to ? lte(column, filters.to) : undefined,
  ]);
}

export function toNumber(value: string | number | null | undefined) {
  // pg returns sum()/avg() over bigint and numeric as strings.
  return value === null || value === undefined ? 0 : Number(value);
}
