import { and, eq, isNull } from "drizzle-orm";
import type db from "../../database";
import { crmStageHistoryTable } from "../../database/schema";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Closes the open history row for a deal and opens the next one.
 *
 * This is the only source of stage conversion and cycle time. It cannot be
 * reconstructed later from an audit log, which is why it is written inline with
 * every transition rather than derived on demand.
 *
 * Reordering a deal inside the same stage must NOT call this: it would reset
 * the clock and invent a transition that never happened.
 */
export async function recordStageChange({
  tx,
  dealId,
  toStageId,
  changedByUserId,
  at,
}: {
  tx: Tx;
  dealId: string;
  toStageId: string;
  changedByUserId: string | null;
  at: Date;
}) {
  const [open] = await tx
    .select({
      id: crmStageHistoryTable.id,
      toStageId: crmStageHistoryTable.toStageId,
      enteredAt: crmStageHistoryTable.enteredAt,
    })
    .from(crmStageHistoryTable)
    .where(
      and(
        eq(crmStageHistoryTable.dealId, dealId),
        isNull(crmStageHistoryTable.exitedAt),
      ),
    )
    .limit(1);

  if (open) {
    await tx
      .update(crmStageHistoryTable)
      .set({
        exitedAt: at,
        durationSeconds: Math.max(
          0,
          Math.round((at.getTime() - open.enteredAt.getTime()) / 1000),
        ),
      })
      .where(eq(crmStageHistoryTable.id, open.id));
  }

  await tx.insert(crmStageHistoryTable).values({
    dealId,
    fromStageId: open?.toStageId ?? null,
    toStageId,
    changedByUserId,
    enteredAt: at,
  });
}
