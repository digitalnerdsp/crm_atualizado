import { eq } from "drizzle-orm";
import db, { schema } from "../../database";
import { loadEntries } from "../controllers/finance";
import { loadPortfolio } from "../recurrence/report";
import { plusDays } from "../recurrence/schedule";
import { loadSimulations } from "../taxes/controllers/taxes";
import { type BiData, buildBi, type Metric } from "./model";
import type { BiFilters } from "./validation";
export async function loadBi(workspaceId: string): Promise<BiData> {
  const [entries, payouts, settings, simulations] = await Promise.all([
    loadEntries(workspaceId),
    db
      .select()
      .from(schema.financeCommissionPayoutTable)
      .where(eq(schema.financeCommissionPayoutTable.workspaceId, workspaceId)),
    db
      .select()
      .from(schema.financeResultSettingsTable)
      .where(eq(schema.financeResultSettingsTable.workspaceId, workspaceId)),
    loadSimulations(workspaceId),
  ]);
  const portfolio = await loadPortfolio(workspaceId, entries);
  return {
    entries,
    payouts,
    portfolio,
    simulations,
    presumptionBps: settings[0]?.presumptionBps ?? null,
  };
}
export async function fullReport(workspaceId: string, f: BiFilters) {
  return buildBi(await loadBi(workspaceId), f);
}
export async function report(workspaceId: string, f: BiFilters) {
  const { details, rankings, ...summary } = await fullReport(workspaceId, f);
  return {
    ...summary,
    rankings: Object.fromEntries(
      Object.entries(rankings).map(([key, rows]) => [key, rows.slice(0, 10)]),
    ) as typeof rankings,
    rankingTotals: Object.fromEntries(
      Object.entries(rankings).map(([key, rows]) => [key, rows.length]),
    ),
    detailCounts: Object.fromEntries(
      Object.entries(details).map(([key, rows]) => [key, rows.length]),
    ),
  };
}
export async function detail(
  workspaceId: string,
  f: BiFilters,
  key: Metric,
  page: number,
  days = 90,
) {
  const r = await fullReport(workspaceId, f);
  const rows =
    key === "projection" || key === "expiry"
      ? r.details[key].filter(
          (row) => row.date <= plusDays(r.referenceDate, days),
        )
      : r.details[key];
  return {
    metric: key,
    days,
    value:
      key === "projection"
        ? rows.reduce((s, row) => s + row.value, 0)
        : key === "expiry"
          ? rows.length
          : r.current[key],
    referenceDate: r.referenceDate,
    total: rows.length,
    page,
    pageSize: 25,
    rows: rows.slice((page - 1) * 25, page * 25),
    note:
      key === "netMargin" || key === "grossMargin"
        ? `Margem = resultado / receita faturada × 100. Receita-base: ${(r.current.revenue ?? 0) / 100} BRL.`
        : key === "presumed"
          ? `Linhas mostram a receita-base; percentual de presunção: ${r.presumptionBps === null ? "não configurado" : `${r.presumptionBps / 100}%`}. O percentual é aplicado ao total; não é apuração fiscal.`
          : "Valores assinados explicam o indicador; caixa, competência e posição de saldo seguem suas respectivas datas.",
  };
}
