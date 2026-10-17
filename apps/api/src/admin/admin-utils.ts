import { createId } from "@paralleldrive/cuid2";
import { count, eq, type SQL } from "drizzle-orm";
import type { AnyPgColumn, AnyPgTable } from "drizzle-orm/pg-core";
import { HTTPException } from "hono/http-exception";
import db from "../database";

export async function tableCountWhere(table: AnyPgTable, where: SQL) {
  const [row] = await db.select({ value: count() }).from(table).where(where);
  return row?.value ?? 0;
}

export function toIsoString(value?: Date | null) {
  return value ? value.toISOString() : null;
}

export function slugify(value: string, fallback: string) {
  const slug = value
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || fallback;
}

export async function createUniqueSlug(
  table: AnyPgTable,
  idColumn: AnyPgColumn,
  slugColumn: AnyPgColumn,
  baseValue: string,
  fallback: string,
) {
  const base = slugify(baseValue, fallback);

  for (let index = 0; index < 25; index += 1) {
    const slug = index === 0 ? base : `${base}-${index + 1}`;
    const [existing] = await db
      .select({ id: idColumn })
      .from(table)
      .where(eq(slugColumn, slug))
      .limit(1);

    if (!existing) {
      return slug;
    }
  }

  return `${base}-${createId().slice(0, 8)}`;
}

export function requireRow<T>(row: T | undefined, message: string): T {
  if (!row) {
    throw new HTTPException(404, { message });
  }

  return row;
}
