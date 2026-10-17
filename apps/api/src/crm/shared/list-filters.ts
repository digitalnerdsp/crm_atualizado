import { and, eq, ilike, or, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import type { CrmVisibility } from "./resolve-visibility";

export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 200;

export function clampLimit(limit?: number) {
  if (!limit || limit < 1) return DEFAULT_PAGE_SIZE;
  return Math.min(limit, MAX_PAGE_SIZE);
}

/**
 * `own` visibility narrows a listing to the caller's records. Applied here
 * rather than in middleware, which can only reject a whole route.
 */
export function ownerScope(
  ownerColumn: PgColumn,
  visibility: CrmVisibility,
  userId: string,
): SQL | undefined {
  return visibility === "all" ? undefined : eq(ownerColumn, userId);
}

export function searchAcross(
  columns: PgColumn[],
  search?: string,
): SQL | undefined {
  const term = search?.trim();
  if (!term) return undefined;
  const pattern = `%${term}%`;
  return or(...columns.map((column) => ilike(column, pattern)));
}

export function allOf(...conditions: Array<SQL | undefined>): SQL | undefined {
  const present = conditions.filter((condition): condition is SQL =>
    Boolean(condition),
  );
  if (present.length === 0) return undefined;
  if (present.length === 1) return present[0];
  return and(...present);
}
