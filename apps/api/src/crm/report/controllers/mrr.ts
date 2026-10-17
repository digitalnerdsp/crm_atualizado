import { type SQL, sql } from "drizzle-orm";
import db from "../../../database";
import { type ReportFilters, toNumber } from "../shared";

/**
 * Receita recorrente: quanto é hoje, e de onde veio o movimento de cada mês.
 *
 * Tudo sai de `crm_contract_event`, onde cada linha guarda o MRR efetivo antes
 * e depois da mudança. Somar contratos ativos daria só o "hoje"; o histórico é
 * o que permite dizer qual era o MRR em março e decompor o crescimento.
 *
 * O mapa de tipos para componentes:
 *
 * - **novo**: contrato criado
 * - **expansão**: reajuste para cima e retomada de contrato pausado
 * - **contração**: reajuste para baixo e pausa
 * - **churn**: cancelamento e fim de contrato
 *
 * Pausa entra como contração e não como churn de propósito: o cliente não foi
 * embora, e tratar as duas como a mesma coisa inflaria o churn de quem
 * trabalha com sazonalidade.
 */
async function mrrReport(filters: ReportFilters) {
  const ownerScope: SQL =
    filters.visibility === "all" && !filters.ownerUserId
      ? sql`true`
      : sql`k.owner_user_id = ${filters.ownerUserId ?? filters.userId}`;

  const toScope: SQL = filters.to
    ? sql`e.occurred_at <= ${filters.to}`
    : sql`true`;

  const [movement, byCompany, byService] = await Promise.all([
    db.execute<{
      month: string;
      new_cents: string;
      expansion_cents: string;
      contraction_cents: string;
      churn_cents: string;
      net_cents: string;
      closing_cents: string;
      churned_contracts: string;
    }>(sql`
      with scoped_event as (
        select e.*, k.id as contract_id
        from "crm_contract_event" e
        inner join "crm_contract" k on k.id = e.contract_id
        where k.workspace_id = ${filters.workspaceId}
          and ${ownerScope}
          and ${toScope}
      ),
      monthly as (
        select
          date_trunc('month', occurred_at) as month,
          sum(case when type = 'created' then to_monthly_value_cents - from_monthly_value_cents else 0 end) as new_cents,
          sum(case when type in ('upgraded', 'resumed') then to_monthly_value_cents - from_monthly_value_cents else 0 end) as expansion_cents,
          sum(case when type in ('downgraded', 'paused') then to_monthly_value_cents - from_monthly_value_cents else 0 end) as contraction_cents,
          sum(case when type in ('cancelled', 'finished') then to_monthly_value_cents - from_monthly_value_cents else 0 end) as churn_cents,
          sum(to_monthly_value_cents - from_monthly_value_cents) as net_cents,
          count(*) filter (where type in ('cancelled', 'finished')) as churned_contracts
        from scoped_event
        group by 1
      )
      select
        to_char(month, 'YYYY-MM') as month,
        new_cents::text,
        expansion_cents::text,
        contraction_cents::text,
        churn_cents::text,
        net_cents::text,
        -- o MRR de fechamento é a soma de tudo que aconteceu até o mês
        sum(net_cents) over (order by month)::text as closing_cents,
        churned_contracts::text
      from monthly
      where ${filters.from ? sql`month >= date_trunc('month', ${filters.from}::timestamp)` : sql`true`}
      order by month
    `),
    db.execute<{
      company_id: string;
      company: string;
      contracts: string;
      monthly_value_cents: string;
    }>(sql`
      select
        c.id as company_id,
        c.name as company,
        count(*)::text as contracts,
        sum(k.monthly_value_cents)::text as monthly_value_cents
      from "crm_contract" k
      inner join "crm_company" c on c.id = k.company_id
      where k.workspace_id = ${filters.workspaceId}
        and k.status = 'active'
        and ${ownerScope}
      group by c.id, c.name
      order by sum(k.monthly_value_cents) desc
      limit 100
    `),
    db.execute<{
      name: string;
      contracts: string;
      monthly_value_cents: string;
    }>(sql`
      select
        ks.name,
        count(distinct ks.contract_id)::text as contracts,
        sum(
          case ks.billing_type
            when 'monthly' then ks.total_cents
            when 'quarterly' then round(ks.total_cents / 3.0)
            when 'yearly' then round(ks.total_cents / 12.0)
            else 0
          end
        )::text as monthly_value_cents
      from "crm_contract_service" ks
      inner join "crm_contract" k on k.id = ks.contract_id
      where k.workspace_id = ${filters.workspaceId}
        and k.status = 'active'
        and ${ownerScope}
      group by ks.name
      order by 3 desc
      limit 100
    `),
  ]);

  const months = movement.rows.map((row) => {
    const churnCents = toNumber(row.churn_cents);
    const closingCents = toNumber(row.closing_cents);
    const netCents = toNumber(row.net_cents);
    const openingCents = closingCents - netCents;

    return {
      month: row.month,
      newCents: toNumber(row.new_cents),
      expansionCents: toNumber(row.expansion_cents),
      contractionCents: toNumber(row.contraction_cents),
      churnCents,
      netCents,
      openingCents,
      closingCents,
      churnedContracts: toNumber(row.churned_contracts),
      // Churn sobre o que havia no início do mês: sobre o fechamento, um mês
      // de queda forte pareceria melhor do que foi.
      churnRate:
        openingCents > 0
          ? Math.min(100, Math.round((-churnCents / openingCents) * 1000) / 10)
          : null,
    };
  });

  return {
    currentMrrCents: byCompany.rows.reduce(
      (total, row) => total + toNumber(row.monthly_value_cents),
      0,
    ),
    months,
    byCompany: byCompany.rows.map((row) => ({
      companyId: row.company_id,
      company: row.company,
      contracts: toNumber(row.contracts),
      monthlyValueCents: toNumber(row.monthly_value_cents),
    })),
    byService: byService.rows.map((row) => ({
      name: row.name,
      contracts: toNumber(row.contracts),
      monthlyValueCents: toNumber(row.monthly_value_cents),
    })),
  };
}

export default mrrReport;
