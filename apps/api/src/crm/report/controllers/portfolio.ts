import { type SQL, sql } from "drizzle-orm";
import db from "../../../database";
import { type ReportFilters, toNumber } from "../shared";

type Breakdown = {
  key: string | null;
  label: string | null;
  companies: number;
  mrrCents: number;
};

/**
 * A foto de com quem a empresa trabalha: quantos clientes e quanto de receita
 * recorrente por situação, segmento, porte e UF.
 *
 * Junto vai a concentração — quanto do MRR está nos cinco maiores clientes.
 * É o número que ninguém quer olhar e todo mundo deveria: uma carteira em que
 * dois clientes são metade da receita não é o mesmo negócio que uma com
 * trinta, mesmo com o mesmo total.
 *
 * Não tem janela de data: carteira é estado de hoje, não período.
 */
async function portfolioReport(filters: ReportFilters) {
  const ownerScope: SQL =
    filters.visibility === "all" && !filters.ownerUserId
      ? sql`true`
      : sql`c.owner_user_id = ${filters.ownerUserId ?? filters.userId}`;

  const groupBy = (dimension: SQL, label: SQL) => sql`
    select
      ${dimension} as key,
      ${label} as label,
      count(*)::text as companies,
      coalesce(sum(k.mrr_cents), 0)::text as mrr_cents
    from "crm_company" c
    left join (
      select company_id, sum(monthly_value_cents) as mrr_cents
      from "crm_contract"
      where workspace_id = ${filters.workspaceId} and status = 'active'
      group by company_id
    ) k on k.company_id = c.id
    left join "crm_segment" g on g.id = c.segment_id
    where c.workspace_id = ${filters.workspaceId}
      and c.archived_at is null
      and ${ownerScope}
    group by 1, 2
    order by 4 desc, 3 desc
  `;

  const [status, segment, size, state, top] = await Promise.all([
    db.execute<Breakdown & { companies: string; mrr_cents: string }>(
      groupBy(sql`c.status`, sql`c.status`),
    ),
    db.execute<Breakdown & { companies: string; mrr_cents: string }>(
      groupBy(sql`c.segment_id`, sql`g.name`),
    ),
    db.execute<Breakdown & { companies: string; mrr_cents: string }>(
      groupBy(sql`c.company_size`, sql`c.company_size`),
    ),
    db.execute<Breakdown & { companies: string; mrr_cents: string }>(
      groupBy(sql`c.state`, sql`c.state`),
    ),
    db.execute<{ company_id: string; company: string; mrr_cents: string }>(sql`
      select c.id as company_id, c.name as company, sum(k.monthly_value_cents)::text as mrr_cents
      from "crm_contract" k
      inner join "crm_company" c on c.id = k.company_id
      where k.workspace_id = ${filters.workspaceId}
        and k.status = 'active'
        and ${ownerScope}
      group by c.id, c.name
      order by sum(k.monthly_value_cents) desc
    `),
  ]);

  const parse = (
    rows: Array<{
      key: unknown;
      label: unknown;
      companies: string;
      mrr_cents: string;
    }>,
  ) =>
    rows.map((row) => ({
      key: row.key === null ? null : String(row.key),
      label: row.label === null ? null : String(row.label),
      companies: toNumber(row.companies),
      mrrCents: toNumber(row.mrr_cents),
    }));

  const clients = top.rows.map((row) => ({
    companyId: row.company_id,
    company: row.company,
    mrrCents: toNumber(row.mrr_cents),
  }));
  const totalMrrCents = clients.reduce(
    (total, client) => total + client.mrrCents,
    0,
  );
  const topFiveCents = clients
    .slice(0, 5)
    .reduce((total, client) => total + client.mrrCents, 0);

  return {
    byStatus: parse(status.rows),
    bySegment: parse(segment.rows),
    bySize: parse(size.rows),
    byState: parse(state.rows),
    concentration: {
      totalMrrCents,
      topFiveCents,
      topFiveShare:
        totalMrrCents > 0
          ? Math.round((topFiveCents / totalMrrCents) * 1000) / 10
          : null,
      topClients: clients.slice(0, 5),
    },
  };
}

export default portfolioReport;
