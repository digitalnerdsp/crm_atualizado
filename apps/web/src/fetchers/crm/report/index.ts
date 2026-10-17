import { client } from "@kaneo/libs";

export type ReportQuery = {
  workspaceId: string;
  pipelineId?: string;
  ownerUserId?: string;
  from?: string;
  to?: string;
};

async function unwrap<T>(response: {
  ok: boolean;
  text: () => Promise<string>;
  json: () => Promise<T>;
}) {
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

export async function getFunnelReport(query: ReportQuery) {
  return unwrap(await client.crm.report.funnel.$get({ query }));
}

export async function getForecastReport(query: ReportQuery) {
  return unwrap(await client.crm.report.forecast.$get({ query }));
}

export async function getVelocityReport(query: ReportQuery) {
  return unwrap(await client.crm.report.velocity.$get({ query }));
}

export async function getTeamReport(query: ReportQuery) {
  return unwrap(await client.crm.report.team.$get({ query }));
}

export async function getLossReasonsReport(query: ReportQuery) {
  return unwrap(await client.crm.report["loss-reasons"].$get({ query }));
}

export async function getSourceReport(query: ReportQuery) {
  return unwrap(await client.crm.report.sources.$get({ query }));
}

export async function getRevenueVsDeliveryReport(
  query: ReportQuery & { groupBy?: "deal" | "company" },
) {
  return unwrap(await client.crm.report["revenue-vs-delivery"].$get({ query }));
}

export async function getRevenueByServiceReport(query: ReportQuery) {
  return unwrap(await client.crm.report["revenue-by-service"].$get({ query }));
}

export async function getMrrReport(query: ReportQuery) {
  return unwrap(await client.crm.report.mrr.$get({ query }));
}

export async function getAcquisitionReport(query: ReportQuery) {
  return unwrap(await client.crm.report.acquisition.$get({ query }));
}

export async function getPortfolioReport(query: ReportQuery) {
  return unwrap(await client.crm.report.portfolio.$get({ query }));
}

export async function getCohortsReport(query: ReportQuery) {
  return unwrap(await client.crm.report.cohorts.$get({ query }));
}

export type ExportableReport =
  | "revenue-by-service"
  | "mrr"
  | "acquisition"
  | "portfolio"
  | "cohorts";

/**
 * O CSV vem pelo mesmo cliente das outras chamadas, e não por um link direto:
 * a sessão viaja em cookie de outro domínio, que um `<a href>` não manda.
 */
export async function downloadCrmReportCsv(
  report: ExportableReport,
  query: ReportQuery,
) {
  const response = await client.crm.report.export.$get({
    query: { ...query, report },
  });
  if (!response.ok) throw new Error(await response.text());

  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = `${report}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
