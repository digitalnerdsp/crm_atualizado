import { and, eq, gte, isNull, sql } from "drizzle-orm";
import db from "../../database";
import { crmDealTable } from "../../database/schema";
import { loadEntries } from "../../finance/controllers/finance";
import { addMonths, DAY, today } from "../../finance/model";
import { earned, percentage } from "../../finance/performance/model";

const dayBefore = (date: string) =>
  new Date(Date.parse(date) - DAY).toISOString().slice(0, 10);

/** Últimos `count` meses (AAAA-MM), do mais antigo ao atual. */
export function lastMonths(reference: string, count: number) {
  const first = `${reference.slice(0, 7)}-01`;
  return Array.from({ length: count }, (_, i) =>
    addMonths(first, i - (count - 1)).slice(0, 7),
  );
}

/**
 * Comissão do mês = o que foi recebido no mês (base "recebido") vezes o
 * percentual gravado em cada cobrança. Previsão do mês seguinte = cobranças
 * que vencem nele vezes o mesmo percentual.
 */
export function commissionFigures(
  entries: Parameters<typeof earned>[0][] &
    {
      dueDate: string;
      amountCents: number;
    }[],
  reference: string,
) {
  const monthStart = `${reference.slice(0, 7)}-01`;
  const nextStart = addMonths(monthStart, 1);
  const monthEnd = dayBefore(nextStart);
  const nextEnd = dayBefore(addMonths(monthStart, 2));
  let monthCents = 0;
  let forecastCents = 0;
  for (const e of entries) {
    monthCents += earned(e, monthEnd) - earned(e, dayBefore(monthStart));
    if (
      !e.cancelledAt &&
      e.direction === "receivable" &&
      e.kind === "operating" &&
      e.sellerId &&
      e.serviceId &&
      e.dueDate >= nextStart &&
      e.dueDate <= nextEnd
    )
      forecastCents += percentage(e.amountCents, e.commissionRateBps ?? 0);
  }
  return { monthCents, forecastCents };
}

async function sellerPanel({
  workspaceId,
  userId,
}: {
  workspaceId: string;
  userId: string;
}) {
  const reference = today();
  const months = lastMonths(reference, 6);
  const since = new Date(`${months[0]}-01T00:00:00-03:00`);
  const month = sql<string>`to_char(timezone('America/Sao_Paulo', ${crmDealTable.wonAt}), 'YYYY-MM')`;
  const rows = await db
    .select({
      month,
      sales: sql<number>`count(*)::int`,
      valueCents: sql<number>`coalesce(sum(${crmDealTable.valueCents}), 0)::bigint`,
    })
    .from(crmDealTable)
    .where(
      and(
        eq(crmDealTable.workspaceId, workspaceId),
        eq(crmDealTable.ownerUserId, userId),
        eq(crmDealTable.status, "won"),
        isNull(crmDealTable.archivedAt),
        gte(crmDealTable.wonAt, since),
      ),
    )
    .groupBy(month);
  const byMonth = new Map(rows.map((r) => [r.month, r]));
  const entries = await loadEntries(workspaceId, userId);
  const { monthCents, forecastCents } = commissionFigures(entries, reference);
  return {
    month: reference.slice(0, 7),
    nextMonth: addMonths(`${reference.slice(0, 7)}-01`, 1).slice(0, 7),
    sales: months.map((m) => ({
      month: m,
      count: Number(byMonth.get(m)?.sales ?? 0),
      valueCents: Number(byMonth.get(m)?.valueCents ?? 0),
    })),
    commission: { monthCents, forecastCents },
  };
}
export default sellerPanel;
