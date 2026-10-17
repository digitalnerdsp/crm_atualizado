import { type SQL, sql } from "drizzle-orm";
import db from "../../../database";
import { type ReportFilters, toNumber } from "../shared";

/** Marcos de retenção, em meses após a entrada do cliente. */
const MILESTONES = [1, 3, 6, 12] as const;

/**
 * Retenção por safra: clientes agrupados pelo mês em que viraram clientes, e
 * quantos ainda tinham contrato ativo 1, 3, 6 e 12 meses depois.
 *
 * "Ainda era cliente" é lido dos contratos — havia contrato começado antes da
 * data e não encerrado até ela. Cliente sem contrato nenhum (só projeto
 * pontual) entra na safra e não conta como retido, porque retenção aqui é
 * sobre receita que se repete.
 *
 * Um marco no futuro fica `null` em vez de zero: uma safra de dois meses atrás
 * não "perdeu" os clientes de 12 meses, ela ainda não chegou lá.
 */
async function cohortsReport(filters: ReportFilters) {
  const ownerScope: SQL =
    filters.visibility === "all" && !filters.ownerUserId
      ? sql`true`
      : sql`c.owner_user_id = ${filters.ownerUserId ?? filters.userId}`;

  const milestoneColumns = MILESTONES.map(
    (month) => sql`
      count(*) filter (
        where exists (
          select 1 from "crm_contract" k
          where k.company_id = c.id
            and k.starts_at <= c.client_since + interval '${sql.raw(String(month))} months'
            and (k.ended_at is null or k.ended_at > c.client_since + interval '${sql.raw(String(month))} months')
        )
      )::text as retained_${sql.raw(String(month))}
    `,
  );

  const result = await db.execute<Record<string, string>>(sql`
    select
      to_char(date_trunc('month', c.client_since), 'YYYY-MM') as cohort,
      count(*)::text as companies,
      ${sql.join(milestoneColumns, sql`, `)}
    from "crm_company" c
    where c.workspace_id = ${filters.workspaceId}
      and c.client_since is not null
      and ${ownerScope}
    group by 1
    order by 1
  `);

  const now = new Date();

  return result.rows.map((row) => {
    const [year, month] = (row.cohort ?? "").split("-").map(Number);
    const cohortStart = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, 1));
    const companies = toNumber(row.companies);

    return {
      cohort: row.cohort,
      companies,
      milestones: MILESTONES.map((milestone) => {
        const due = new Date(cohortStart);
        due.setUTCMonth(due.getUTCMonth() + milestone);
        if (due > now) {
          return { month: milestone, retained: null, rate: null };
        }
        const retained = toNumber(row[`retained_${milestone}`]);
        return {
          month: milestone,
          retained,
          rate:
            companies > 0
              ? Math.round((retained / companies) * 1000) / 10
              : null,
        };
      }),
    };
  });
}

export default cohortsReport;
