import { and, count, eq, isNotNull, sum } from "drizzle-orm";
import db from "../../../database";
import {
  crmActivityTable,
  crmDealTable,
  userTable,
} from "../../../database/schema";
import { dealScope, type ReportFilters, toNumber } from "../shared";

/** Per rep: what they hold, what they closed, and how often they close it. */
async function teamReport(filters: ReportFilters) {
  const rows = await db
    .select({
      ownerUserId: crmDealTable.ownerUserId,
      ownerName: userTable.name,
      ownerImage: userTable.image,
      status: crmDealTable.status,
      deals: count(),
      valueCents: sum(crmDealTable.valueCents),
    })
    .from(crmDealTable)
    .leftJoin(userTable, eq(crmDealTable.ownerUserId, userTable.id))
    .where(dealScope(filters))
    .groupBy(
      crmDealTable.ownerUserId,
      userTable.name,
      userTable.image,
      crmDealTable.status,
    );

  const activityRows = await db
    .select({
      ownerUserId: crmActivityTable.ownerUserId,
      activities: count(),
    })
    .from(crmActivityTable)
    .where(
      and(
        eq(crmActivityTable.workspaceId, filters.workspaceId),
        isNotNull(crmActivityTable.completedAt),
      ),
    )
    .groupBy(crmActivityTable.ownerUserId);

  const activityByOwner = new Map(
    activityRows.map((row) => [row.ownerUserId, row.activities]),
  );

  type Bucket = {
    ownerUserId: string | null;
    ownerName: string | null;
    ownerImage: string | null;
    open: { deals: number; valueCents: number };
    won: { deals: number; valueCents: number };
    lost: { deals: number; valueCents: number };
  };

  const byOwner = new Map<string, Bucket>();

  for (const row of rows) {
    const key = row.ownerUserId ?? "__unassigned__";
    const bucket = byOwner.get(key) ?? {
      ownerUserId: row.ownerUserId,
      ownerName: row.ownerName,
      ownerImage: row.ownerImage,
      open: { deals: 0, valueCents: 0 },
      won: { deals: 0, valueCents: 0 },
      lost: { deals: 0, valueCents: 0 },
    };
    const target = bucket[row.status as "open" | "won" | "lost"];
    if (target) {
      target.deals += row.deals;
      target.valueCents += toNumber(row.valueCents);
    }
    byOwner.set(key, bucket);
  }

  return [...byOwner.values()]
    .map((bucket) => {
      const closed = bucket.won.deals + bucket.lost.deals;
      return {
        ...bucket,
        completedActivities: activityByOwner.get(bucket.ownerUserId ?? "") ?? 0,
        // Win rate only over closed deals: counting open ones would make the
        // rate drop every time a rep adds a deal.
        winRate:
          closed > 0 ? Math.round((bucket.won.deals / closed) * 100) : null,
        averageTicketCents:
          bucket.won.deals > 0
            ? Math.round(bucket.won.valueCents / bucket.won.deals)
            : 0,
      };
    })
    .sort((a, b) => b.won.valueCents - a.won.valueCents);
}

export default teamReport;
