import { useQuery } from "@tanstack/react-query";
import {
  getAcquisitionReport,
  getCohortsReport,
  getForecastReport,
  getFunnelReport,
  getLossReasonsReport,
  getMrrReport,
  getPortfolioReport,
  getRevenueByServiceReport,
  getRevenueVsDeliveryReport,
  getSourceReport,
  getTeamReport,
  getVelocityReport,
  type ReportQuery,
} from "@/fetchers/crm/report";

/**
 * Reports are aggregate reads that do not change between clicks on the same
 * filters, so a short stale window keeps the page from refetching seven
 * endpoints every time it regains focus.
 */
const REPORT_STALE_TIME = 60 * 1000;

function reportQuery<T>(
  name: string,
  query: ReportQuery | undefined,
  fetcher: (query: ReportQuery) => Promise<T>,
) {
  return {
    queryKey: ["crm", "report", name, query] as const,
    queryFn: () => fetcher(query as ReportQuery),
    enabled: Boolean(query?.workspaceId),
    staleTime: REPORT_STALE_TIME,
  };
}

export function useCrmFunnelReport(query: ReportQuery | undefined) {
  return useQuery(reportQuery("funnel", query, getFunnelReport));
}

export function useCrmForecastReport(query: ReportQuery | undefined) {
  return useQuery(reportQuery("forecast", query, getForecastReport));
}

export function useCrmVelocityReport(query: ReportQuery | undefined) {
  return useQuery(reportQuery("velocity", query, getVelocityReport));
}

export function useCrmTeamReport(query: ReportQuery | undefined) {
  return useQuery(reportQuery("team", query, getTeamReport));
}

export function useCrmLossReasonsReport(query: ReportQuery | undefined) {
  return useQuery(reportQuery("loss-reasons", query, getLossReasonsReport));
}

export function useCrmSourceReport(query: ReportQuery | undefined) {
  return useQuery(reportQuery("sources", query, getSourceReport));
}

export function useCrmRevenueVsDelivery(
  query: (ReportQuery & { groupBy?: "deal" | "company" }) | undefined,
) {
  return useQuery({
    queryKey: ["crm", "report", "revenue-vs-delivery", query] as const,
    queryFn: () =>
      getRevenueVsDeliveryReport(
        query as ReportQuery & { groupBy?: "deal" | "company" },
      ),
    enabled: Boolean(query?.workspaceId),
    staleTime: REPORT_STALE_TIME,
  });
}

export function useCrmRevenueByServiceReport(query: ReportQuery | undefined) {
  return useQuery(
    reportQuery("revenue-by-service", query, getRevenueByServiceReport),
  );
}

export function useCrmMrrReport(query: ReportQuery | undefined) {
  return useQuery(reportQuery("mrr", query, getMrrReport));
}

export function useCrmAcquisitionReport(query: ReportQuery | undefined) {
  return useQuery(reportQuery("acquisition", query, getAcquisitionReport));
}

export function useCrmPortfolioReport(query: ReportQuery | undefined) {
  return useQuery(reportQuery("portfolio", query, getPortfolioReport));
}

export function useCrmCohortsReport(query: ReportQuery | undefined) {
  return useQuery(reportQuery("cohorts", query, getCohortsReport));
}
