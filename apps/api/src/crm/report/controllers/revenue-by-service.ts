import { type SQL, sql } from "drizzle-orm";
import db from "../../../database";
import { type ReportFilters, toNumber } from "../shared";

/**
 * Quanto cada serviço vendeu, e o que custou entregá-lo.
 *
 * Lê `crm_deal_service` dos negócios ganhos: são as cópias gravadas no dia da
 * venda, então o relatório não muda quando alguém edita o catálogo.
 *
 * Pontual e recorrente ficam em colunas separadas porque misturar um projeto
 * de R$ 50.000 com uma mensalidade de R$ 3.000 na mesma barra esconde as duas
 * informações. O recorrente aparece também como equivalente mensal, que é o
 * que se compara com o MRR.
 *
 * As horas vêm do `time_entry` das tarefas do negócio (plano 006) e são
 * **rateadas entre os itens pelo valor de cada um**: um negócio com site e
 * tráfego tem horas de ambos num apontamento só, e atribuir tudo a um dos dois
 * mentiria mais do que ratear.
 */
async function revenueByServiceReport(filters: ReportFilters) {
  const ownerScope: SQL =
    filters.visibility === "all" && !filters.ownerUserId
      ? sql`true`
      : sql`d.owner_user_id = ${filters.ownerUserId ?? filters.userId}`;

  const pipelineScope: SQL = filters.pipelineId
    ? sql`d.pipeline_id = ${filters.pipelineId}`
    : sql`true`;

  const fromScope: SQL = filters.from
    ? sql`d.won_at >= ${filters.from}`
    : sql`true`;
  const toScope: SQL = filters.to ? sql`d.won_at <= ${filters.to}` : sql`true`;

  const result = await db.execute<{
    service_id: string | null;
    name: string;
    category: string | null;
    billing_type: string;
    deals: string;
    quantity: string;
    one_time_cents: string;
    recurring_cents: string;
    recurring_monthly_cents: string;
    tracked_seconds: string;
  }>(sql`
    with won_deal as (
      select d.id, d.won_at
      from "crm_deal" d
      where d.workspace_id = ${filters.workspaceId}
        and d.status = 'won'
        and d.archived_at is null
        and ${pipelineScope}
        and ${ownerScope}
        and ${fromScope}
        and ${toScope}
    ),
    deal_hours as (
      -- Horas apontadas nas tarefas de cada negócio ganho.
      select t.crm_deal_id as deal_id, sum(te.duration) as seconds
      from "time_entry" te
      inner join "task" t on t.id = te.task_id
      inner join won_deal w on w.id = t.crm_deal_id
      group by t.crm_deal_id
    ),
    line as (
      select
        ds.deal_id,
        ds.service_id,
        ds.name,
        ds.billing_type,
        ds.quantity,
        ds.total_cents,
        -- peso do item no negócio, para ratear as horas
        ds.total_cents::numeric / nullif(
          sum(ds.total_cents) over (partition by ds.deal_id), 0
        ) as weight
      from "crm_deal_service" ds
      inner join won_deal w on w.id = ds.deal_id
    )
    select
      l.service_id,
      l.name,
      c.name as category,
      l.billing_type,
      count(distinct l.deal_id)::text as deals,
      sum(l.quantity)::text as quantity,
      sum(case when l.billing_type = 'one_time' then l.total_cents else 0 end)::text as one_time_cents,
      sum(case when l.billing_type <> 'one_time' then l.total_cents else 0 end)::text as recurring_cents,
      sum(
        case l.billing_type
          when 'monthly' then l.total_cents
          when 'quarterly' then round(l.total_cents / 3.0)
          when 'yearly' then round(l.total_cents / 12.0)
          else 0
        end
      )::text as recurring_monthly_cents,
      coalesce(round(sum(coalesce(h.seconds, 0) * coalesce(l.weight, 0))), 0)::text as tracked_seconds
    from line l
    left join deal_hours h on h.deal_id = l.deal_id
    left join "crm_service" s on s.id = l.service_id
    left join "crm_service_category" c on c.id = s.category_id
    group by l.service_id, l.name, c.name, l.billing_type
    order by
      sum(l.total_cents) desc
  `);

  return result.rows.map((row) => {
    const oneTimeCents = toNumber(row.one_time_cents);
    const recurringCents = toNumber(row.recurring_cents);
    const trackedSeconds = toNumber(row.tracked_seconds);
    const deals = toNumber(row.deals);
    const soldCents = oneTimeCents + recurringCents;

    return {
      serviceId: row.service_id,
      name: row.name,
      category: row.category,
      billingType: row.billing_type,
      deals,
      quantity: toNumber(row.quantity),
      oneTimeCents,
      recurringCents,
      recurringMonthlyCents: toNumber(row.recurring_monthly_cents),
      soldCents,
      averageTicketCents: deals > 0 ? Math.round(soldCents / deals) : 0,
      trackedSeconds,
      // Só com hora apontada: sem ela, "receita por hora" seria a receita
      // inteira dividida por zero e apareceria como infinita.
      revenuePerHourCents:
        trackedSeconds > 0
          ? Math.round(soldCents / (trackedSeconds / 3600))
          : null,
    };
  });
}

export default revenueByServiceReport;
