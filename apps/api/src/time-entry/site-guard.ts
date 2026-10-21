import { and, eq, ne, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { schema as s } from "../database";
import type { Tx } from "../finance/performance/snapshot";
export function validTimes(start: Date, end?: Date) {
  if (
    !Number.isFinite(start.getTime()) ||
    (end && (!Number.isFinite(end.getTime()) || end <= start))
  )
    throw new HTTPException(400, {
      message: "Horário inicial/final inválido.",
    });
}
export async function guardSiteTime(
  tx: Tx,
  taskId: string,
  userId: string | null,
  start: Date,
  end?: Date,
  ignoreId?: string,
) {
  validTimes(start, end);
  const [link] = await tx
    .select()
    .from(s.financeSiteTaskTable)
    .where(eq(s.financeSiteTaskTable.taskId, taskId));
  if (!link) return null;
  if (!userId)
    throw new HTTPException(400, {
      message: "Apontamento de site exige colaborador.",
    });
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtext(${`site-time:${userId}`}))`,
  );
  if (
    start.getTime() > Date.now() + 60000 ||
    (end && end.getTime() > Date.now() + 60000) ||
    (end && end.getTime() - start.getTime() > 86400000)
  )
    throw new HTTPException(400, {
      message: "Sites aceitam apontamentos de até 24h, sem horários futuros.",
    });
  const rows = await tx
    .select({ time: s.timeEntryTable })
    .from(s.timeEntryTable)
    .innerJoin(
      s.financeSiteTaskTable,
      eq(s.financeSiteTaskTable.taskId, s.timeEntryTable.taskId),
    )
    .where(
      and(
        eq(s.timeEntryTable.userId, userId),
        ignoreId ? ne(s.timeEntryTable.id, ignoreId) : undefined,
      ),
    );
  const endMs = end?.getTime() ?? Date.now();
  if (
    rows.some(
      ({ time: t }) =>
        (!end && !t.endTime) ||
        (start.getTime() < (t.endTime?.getTime() ?? Date.now()) &&
          t.startTime.getTime() < endMs),
    )
  )
    throw new HTTPException(409, {
      message:
        "Existe outro apontamento de site desse colaborador no mesmo horário.",
    });
  const [site] = await tx
    .select({ workspaceId: s.financeSiteTable.workspaceId })
    .from(s.financeSiteTable)
    .where(eq(s.financeSiteTable.id, link.siteId));
  return site?.workspaceId ?? null;
}
