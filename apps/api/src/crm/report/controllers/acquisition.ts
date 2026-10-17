import { type SQL, sql } from "drizzle-orm";
import db from "../../../database";
import { type ReportFilters, toNumber } from "../shared";

/**
 * De onde vêm os clientes e a receita — não os negócios.
 *
 * O relatório de origem do plano 007 conta oportunidades; este conta clientes
 * adquiridos, receita fechada e MRR contratado. Um canal que gera muita
 * oportunidade e pouco fechamento aparece aqui e não lá, que é a diferença
 * entre decidir orçamento de mídia com dado e decidir com sensação.
 */
async function acquisitionReport(filters: ReportFilters) {
  const dealOwnerScope: SQL =
    filters.visibility === "all" && !filters.ownerUserId
      ? sql`true`
      : sql`d.owner_user_id = ${filters.ownerUserId ?? filters.userId}`;

  const companyOwnerScope: SQL =
    filters.visibility === "all" && !filters.ownerUserId
      ? sql`true`
      : sql`c.owner_user_id = ${filters.ownerUserId ?? filters.userId}`;

  const dealWindow: SQL = sql`
    ${filters.from ? sql`and d.created_at >= ${filters.from}` : sql``}
    ${filters.to ? sql`and d.created_at <= ${filters.to}` : sql``}
  `;

  // O cliente entra na janela pela data em que virou cliente; sem ela, pela
  // data de cadastro.
  const companyWindow: SQL = sql`
    ${filters.from ? sql`and coalesce(c.client_since, c.created_at) >= ${filters.from}` : sql``}
    ${filters.to ? sql`and coalesce(c.client_since, c.created_at) <= ${filters.to}` : sql``}
  `;

  const result = await db.execute<{
    source_id: string | null;
    source: string | null;
    channel: string | null;
    companies: string;
    deals: string;
    won_deals: string;
    won_value_cents: string;
    mrr_cents: string;
  }>(sql`
    with source_list as (
      select id, name, channel from "crm_source"
      where workspace_id = ${filters.workspaceId}
      union all
      select null, null, null
    ),
    company_stat as (
      select c.source_id, count(*) as companies
      from "crm_company" c
      where c.workspace_id = ${filters.workspaceId}
        and c.archived_at is null
        and ${companyOwnerScope}
        ${companyWindow}
      group by c.source_id
    ),
    deal_stat as (
      select
        d.source_id,
        count(*) as deals,
        count(*) filter (where d.status = 'won') as won_deals,
        coalesce(sum(d.value_cents) filter (where d.status = 'won'), 0) as won_value_cents
      from "crm_deal" d
      where d.workspace_id = ${filters.workspaceId}
        and d.archived_at is null
        and ${dealOwnerScope}
        ${dealWindow}
      group by d.source_id
    ),
    mrr_stat as (
      -- MRR ativo hoje dos clientes daquela origem: recorrência não tem
      -- janela, ela é o estado atual da carteira.
      select c.source_id, coalesce(sum(k.monthly_value_cents), 0) as mrr_cents
      from "crm_contract" k
      inner join "crm_company" c on c.id = k.company_id
      where k.workspace_id = ${filters.workspaceId}
        and k.status = 'active'
        and ${companyOwnerScope}
      group by c.source_id
    )
    select
      s.id as source_id,
      s.name as source,
      s.channel,
      coalesce(cs.companies, 0)::text as companies,
      coalesce(ds.deals, 0)::text as deals,
      coalesce(ds.won_deals, 0)::text as won_deals,
      coalesce(ds.won_value_cents, 0)::text as won_value_cents,
      coalesce(ms.mrr_cents, 0)::text as mrr_cents
    from source_list s
    left join company_stat cs on cs.source_id is not distinct from s.id
    left join deal_stat ds on ds.source_id is not distinct from s.id
    left join mrr_stat ms on ms.source_id is not distinct from s.id
    where coalesce(cs.companies, 0) > 0
       or coalesce(ds.deals, 0) > 0
       or coalesce(ms.mrr_cents, 0) > 0
    order by coalesce(ds.won_value_cents, 0) desc, coalesce(ms.mrr_cents, 0) desc
  `);

  const rows = result.rows.map((row) => {
    const deals = toNumber(row.deals);
    const wonDeals = toNumber(row.won_deals);
    return {
      sourceId: row.source_id,
      source: row.source,
      channel: row.channel,
      companies: toNumber(row.companies),
      deals,
      wonDeals,
      conversionRate:
        deals > 0 ? Math.round((wonDeals / deals) * 1000) / 10 : null,
      wonValueCents: toNumber(row.won_value_cents),
      mrrCents: toNumber(row.mrr_cents),
    };
  });

  // O canal agrupa origens: "Meta Ads" e "Google Ads" são a mesma pergunta de
  // orçamento.
  const byChannel = new Map<
    string,
    (typeof rows)[number] & { channel: string }
  >();
  for (const row of rows) {
    const key = row.channel ?? "other";
    const bucket = byChannel.get(key) ?? {
      ...row,
      channel: key,
      sourceId: null,
      source: null,
      companies: 0,
      deals: 0,
      wonDeals: 0,
      conversionRate: null,
      wonValueCents: 0,
      mrrCents: 0,
    };
    bucket.companies += row.companies;
    bucket.deals += row.deals;
    bucket.wonDeals += row.wonDeals;
    bucket.wonValueCents += row.wonValueCents;
    bucket.mrrCents += row.mrrCents;
    bucket.conversionRate =
      bucket.deals > 0
        ? Math.round((bucket.wonDeals / bucket.deals) * 1000) / 10
        : null;
    byChannel.set(key, bucket);
  }

  return {
    bySource: rows,
    byChannel: [...byChannel.values()].sort(
      (a, b) => b.wonValueCents - a.wonValueCents,
    ),
  };
}

export default acquisitionReport;
