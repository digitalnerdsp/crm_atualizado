import { and, desc, eq, lte } from "drizzle-orm";
import type db from "../../database";
import * as schema from "../../database/schema";
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
/** The invoice keeps the chosen rule. Later rules never rewrite this snapshot. */
export async function commissionSnapshot(
  tx: Tx,
  workspaceId: string,
  input: {
    serviceId: string | null;
    sellerId: string | null;
    direction: string;
    kind: string;
    competenceDate: string;
  },
) {
  if (
    input.direction !== "receivable" ||
    input.kind !== "operating" ||
    !input.serviceId ||
    !input.sellerId
  )
    return {
      commissionRuleId: null,
      commissionRateBps: 0,
      commissionBasis: "received" as const,
    };
  const [rule] = await tx
    .select()
    .from(schema.financeCommissionRuleTable)
    .where(
      and(
        eq(schema.financeCommissionRuleTable.workspaceId, workspaceId),
        eq(schema.financeCommissionRuleTable.serviceId, input.serviceId),
        lte(
          schema.financeCommissionRuleTable.effectiveDate,
          input.competenceDate,
        ),
      ),
    )
    .orderBy(
      desc(schema.financeCommissionRuleTable.effectiveDate),
      desc(schema.financeCommissionRuleTable.sequence),
    )
    .limit(1);
  const [seller] = await tx
    .select({ name: schema.userTable.name })
    .from(schema.userTable)
    .where(eq(schema.userTable.id, input.sellerId));
  const [service] = await tx
    .select({ name: schema.crmServiceTable.name })
    .from(schema.crmServiceTable)
    .where(eq(schema.crmServiceTable.id, input.serviceId));
  return {
    sellerNameSnapshot: seller?.name ?? null,
    serviceNameSnapshot: service?.name ?? null,
    commissionRuleId: rule?.id ?? null,
    commissionRateBps: rule?.rateBps ?? 0,
    commissionBasis: rule?.basis ?? ("received" as const),
  };
}
