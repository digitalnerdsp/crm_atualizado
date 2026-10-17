import { Hono } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";
import * as v from "valibot";
import { requireWorkspacePermission } from "../../utils/require-workspace-permission";
import { workspaceAccess } from "../../utils/workspace-access-middleware";
import acquisitionReportCtrl from "./controllers/acquisition";
import cohortsReportCtrl from "./controllers/cohorts";
import forecastReportCtrl from "./controllers/forecast";
import funnelReportCtrl from "./controllers/funnel";
import { lossReasonsReport, sourceReport } from "./controllers/loss-and-source";
import mrrReportCtrl from "./controllers/mrr";
import portfolioReportCtrl from "./controllers/portfolio";
import revenueByServiceReportCtrl from "./controllers/revenue-by-service";
import {
  revenueVsDeliveryByCompany,
  revenueVsDeliveryByDeal,
} from "./controllers/revenue-vs-delivery";
import teamReportCtrl from "./controllers/team";
import velocityReportCtrl from "./controllers/velocity";
import { csvMoney, toCsv } from "./csv";
import { type ReportFilters, resolveReportFilters } from "./shared";

const isoDate = v.pipe(v.string(), v.isoTimestamp());

/** Every report takes the same window and scope. */
const reportQuery = v.object({
  workspaceId: v.string(),
  pipelineId: v.optional(v.string()),
  ownerUserId: v.optional(v.string()),
  from: v.optional(isoDate),
  to: v.optional(isoDate),
});

function describe(operationId: string, description: string) {
  return describeRoute({
    operationId,
    tags: ["CRM"],
    description,
    responses: {
      200: {
        description: "Report data",
        content: { "application/json": { schema: resolver(v.any()) } },
      },
    },
  });
}

const report = new Hono<{
  Variables: {
    userId: string;
    workspaceId: string;
  };
}>()
  .get(
    "/funnel",
    describe(
      "getCrmFunnelReport",
      "Deals that entered each stage and the conversion from the stage before it",
    ),
    validator("query", reportQuery),
    workspaceAccess.fromQuery(),
    requireWorkspacePermission({ crmReport: ["read"] }),
    async (c) =>
      c.json(
        await funnelReportCtrl(
          await resolveReportFilters(c, c.req.valid("query")),
        ),
      ),
  )
  .get(
    "/forecast",
    describe(
      "getCrmForecastReport",
      "Weighted open pipeline per month against what actually closed in it",
    ),
    validator("query", reportQuery),
    workspaceAccess.fromQuery(),
    requireWorkspacePermission({ crmReport: ["read"] }),
    async (c) =>
      c.json(
        await forecastReportCtrl(
          await resolveReportFilters(c, c.req.valid("query")),
        ),
      ),
  )
  .get(
    "/velocity",
    describe(
      "getCrmVelocityReport",
      "Average time deals spend in each stage, and the cycle length of a win",
    ),
    validator("query", reportQuery),
    workspaceAccess.fromQuery(),
    requireWorkspacePermission({ crmReport: ["read"] }),
    async (c) =>
      c.json(
        await velocityReportCtrl(
          await resolveReportFilters(c, c.req.valid("query")),
        ),
      ),
  )
  .get(
    "/team",
    describe(
      "getCrmTeamReport",
      "Per rep: open, won and lost deals, win rate, average ticket and completed activities",
    ),
    validator("query", reportQuery),
    workspaceAccess.fromQuery(),
    requireWorkspacePermission({ crmReport: ["read"] }),
    async (c) =>
      c.json(
        await teamReportCtrl(
          await resolveReportFilters(c, c.req.valid("query")),
        ),
      ),
  )
  .get(
    "/loss-reasons",
    describe(
      "getCrmLossReasonsReport",
      "Why deals were lost, and at which stage they were lost",
    ),
    validator("query", reportQuery),
    workspaceAccess.fromQuery(),
    requireWorkspacePermission({ crmReport: ["read"] }),
    async (c) =>
      c.json(
        await lossReasonsReport(
          await resolveReportFilters(c, c.req.valid("query")),
        ),
      ),
  )
  .get(
    "/sources",
    describe(
      "getCrmSourceReport",
      "Deals and revenue grouped by where they came from",
    ),
    validator("query", reportQuery),
    workspaceAccess.fromQuery(),
    requireWorkspacePermission({ crmReport: ["read"] }),
    async (c) =>
      c.json(
        await sourceReport(await resolveReportFilters(c, c.req.valid("query"))),
      ),
  )
  .get(
    "/revenue-vs-delivery",
    describe(
      "getCrmRevenueVsDeliveryReport",
      "Closed revenue against the hours logged on the tasks that delivered it, per deal and per client",
    ),
    validator(
      "query",
      v.object({
        ...reportQuery.entries,
        groupBy: v.optional(v.picklist(["deal", "company"])),
      }),
    ),
    workspaceAccess.fromQuery(),
    requireWorkspacePermission({ crmReport: ["read"] }),
    async (c) => {
      const { groupBy } = c.req.valid("query");
      const filters = await resolveReportFilters(c, c.req.valid("query"));

      return c.json(
        groupBy === "company"
          ? await revenueVsDeliveryByCompany(filters)
          : await revenueVsDeliveryByDeal(filters),
      );
    },
  )
  .get(
    "/revenue-by-service",
    describe(
      "getCrmRevenueByServiceReport",
      "What each service sold in won deals, one-time and recurring apart, with the hours spent delivering it",
    ),
    validator("query", reportQuery),
    workspaceAccess.fromQuery(),
    requireWorkspacePermission({ crmReport: ["read"] }),
    async (c) =>
      c.json(
        await revenueByServiceReportCtrl(
          await resolveReportFilters(c, c.req.valid("query")),
        ),
      ),
  )
  .get(
    "/mrr",
    describe(
      "getCrmMrrReport",
      "Recurring revenue today and the monthly movement split into new, expansion, contraction and churn",
    ),
    validator("query", reportQuery),
    workspaceAccess.fromQuery(),
    requireWorkspacePermission({ crmReport: ["read"] }),
    async (c) =>
      c.json(
        await mrrReportCtrl(
          await resolveReportFilters(c, c.req.valid("query")),
        ),
      ),
  )
  .get(
    "/acquisition",
    describe(
      "getCrmAcquisitionReport",
      "Clients, deals and revenue by source and channel — what the media budget buys",
    ),
    validator("query", reportQuery),
    workspaceAccess.fromQuery(),
    requireWorkspacePermission({ crmReport: ["read"] }),
    async (c) =>
      c.json(
        await acquisitionReportCtrl(
          await resolveReportFilters(c, c.req.valid("query")),
        ),
      ),
  )
  .get(
    "/portfolio",
    describe(
      "getCrmPortfolioReport",
      "How the client base is composed, and how much of the recurring revenue sits in the five largest clients",
    ),
    validator("query", reportQuery),
    workspaceAccess.fromQuery(),
    requireWorkspacePermission({ crmReport: ["read"] }),
    async (c) =>
      c.json(
        await portfolioReportCtrl(
          await resolveReportFilters(c, c.req.valid("query")),
        ),
      ),
  )
  .get(
    "/cohorts",
    describe(
      "getCrmCohortsReport",
      "Clients grouped by the month they became clients, and how many still had a contract 1, 3, 6 and 12 months later",
    ),
    validator("query", reportQuery),
    workspaceAccess.fromQuery(),
    requireWorkspacePermission({ crmReport: ["read"] }),
    async (c) =>
      c.json(
        await cohortsReportCtrl(
          await resolveReportFilters(c, c.req.valid("query")),
        ),
      ),
  )
  .get(
    "/export",
    describeRoute({
      operationId: "exportCrmReport",
      tags: ["CRM"],
      description:
        "The same report as a CSV, for the meeting. Semicolon separated, with a BOM, so Excel opens it in columns.",
      responses: {
        200: {
          description: "CSV file",
          content: { "text/csv": { schema: resolver(v.string()) } },
        },
      },
    }),
    validator(
      "query",
      v.object({
        ...reportQuery.entries,
        report: v.picklist([
          "revenue-by-service",
          "mrr",
          "acquisition",
          "portfolio",
          "cohorts",
        ]),
      }),
    ),
    workspaceAccess.fromQuery(),
    requireWorkspacePermission({ crmReport: ["read"] }),
    async (c) => {
      const { report: name } = c.req.valid("query");
      const filters = await resolveReportFilters(c, c.req.valid("query"));
      const csv = toCsv(await exportRows(name, filters));

      return new Response(csv, {
        headers: {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition": `attachment; filename="${name}.csv"`,
        },
      });
    },
  );

export default report;

/**
 * Cada relatório vira uma tabela só no CSV — a que o gestor levaria impressa.
 * Os recortes secundários (por cliente, por canal) ficam na tela: um arquivo
 * com cinco tabelas empilhadas não abre direito em lugar nenhum.
 */
async function exportRows(
  name: "revenue-by-service" | "mrr" | "acquisition" | "portfolio" | "cohorts",
  filters: ReportFilters,
): Promise<Array<Record<string, unknown>>> {
  if (name === "revenue-by-service") {
    const rows = await revenueByServiceReportCtrl(filters);
    return rows.map((row) => ({
      servico: row.name,
      categoria: row.category ?? "",
      cobranca: row.billingType,
      negocios: row.deals,
      quantidade: row.quantity,
      receita_pontual: csvMoney(row.oneTimeCents),
      receita_recorrente: csvMoney(row.recurringCents),
      recorrente_mensal: csvMoney(row.recurringMonthlyCents),
      ticket_medio: csvMoney(row.averageTicketCents),
      horas: (row.trackedSeconds / 3600).toFixed(1).replace(".", ","),
      receita_por_hora:
        row.revenuePerHourCents === null
          ? ""
          : csvMoney(row.revenuePerHourCents),
    }));
  }

  if (name === "mrr") {
    const data = await mrrReportCtrl(filters);
    return data.months.map((month) => ({
      mes: month.month,
      abertura: csvMoney(month.openingCents),
      novo: csvMoney(month.newCents),
      expansao: csvMoney(month.expansionCents),
      contracao: csvMoney(month.contractionCents),
      churn: csvMoney(month.churnCents),
      liquido: csvMoney(month.netCents),
      fechamento: csvMoney(month.closingCents),
      contratos_encerrados: month.churnedContracts,
      churn_rate: month.churnRate === null ? "" : String(month.churnRate),
    }));
  }

  if (name === "acquisition") {
    const data = await acquisitionReportCtrl(filters);
    return data.bySource.map((row) => ({
      origem: row.source ?? "Sem origem",
      canal: row.channel ?? "",
      clientes: row.companies,
      negocios: row.deals,
      ganhos: row.wonDeals,
      conversao: row.conversionRate === null ? "" : String(row.conversionRate),
      receita_ganha: csvMoney(row.wonValueCents),
      mrr: csvMoney(row.mrrCents),
    }));
  }

  if (name === "portfolio") {
    const data = await portfolioReportCtrl(filters);
    return [
      ...data.byStatus.map((row) => ({ recorte: "situacao", ...row })),
      ...data.bySegment.map((row) => ({ recorte: "segmento", ...row })),
      ...data.bySize.map((row) => ({ recorte: "porte", ...row })),
      ...data.byState.map((row) => ({ recorte: "uf", ...row })),
    ].map((row) => ({
      recorte: row.recorte,
      valor: row.label ?? row.key ?? "Não informado",
      clientes: row.companies,
      mrr: csvMoney(row.mrrCents),
    }));
  }

  const cohorts = await cohortsReportCtrl(filters);
  return cohorts.map((cohort) => ({
    safra: cohort.cohort,
    clientes: cohort.companies,
    ...Object.fromEntries(
      cohort.milestones.map((milestone) => [
        `retidos_${milestone.month}m`,
        milestone.retained === null ? "" : milestone.retained,
      ]),
    ),
  }));
}
