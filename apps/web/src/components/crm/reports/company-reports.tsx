import { Download } from "lucide-react";
import { useTranslation } from "react-i18next";
import BarList from "@/components/crm/charts/bar-list";
import ReportCard from "@/components/crm/charts/report-card";
import { BILLING_LABEL_KEY } from "@/components/crm/deal-services-editor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  downloadCrmReportCsv,
  type ExportableReport,
  type ReportQuery,
} from "@/fetchers/crm/report";
import {
  useCrmAcquisitionReport,
  useCrmCohortsReport,
  useCrmMrrReport,
  useCrmPortfolioReport,
  useCrmRevenueByServiceReport,
} from "@/hooks/queries/crm/use-crm-reports";
import { cn } from "@/lib/cn";
import { formatDurationShort } from "@/lib/format";
import { formatMoney, formatMoneyCompact } from "@/lib/money";
import { toast } from "@/lib/toast";

const STATUS_LABEL_KEY = {
  prospect: "statusProspect",
  active: "statusActive",
  inactive: "statusInactive",
  churned: "statusChurned",
} as const;

const SIZE_LABEL_KEY = {
  mei: "sizeMei",
  me: "sizeMe",
  epp: "sizeEpp",
  medium: "sizeMedium",
  large: "sizeLarge",
} as const;

function Money({ cents, signed }: { cents: number; signed?: boolean }) {
  return (
    <span
      className={cn(
        "tabular-nums",
        signed && cents > 0 && "text-success-foreground",
        signed && cents < 0 && "text-destructive-foreground",
        signed && cents === 0 && "text-muted-foreground",
      )}
    >
      {formatMoney(cents)}
    </span>
  );
}

function ExportButton({
  report,
  query,
}: {
  report: ExportableReport;
  query: ReportQuery;
}) {
  const { t } = useTranslation();
  return (
    <Button
      size="sm"
      variant="ghost"
      className="h-7 text-xs"
      onClick={async () => {
        try {
          await downloadCrmReportCsv(report, query);
        } catch (error) {
          toast.error(
            error instanceof Error
              ? error.message
              : t("crm:reports.exportError"),
          );
        }
      }}
    >
      <Download className="size-3.5" />
      {t("crm:reports.exportCsv")}
    </Button>
  );
}

/** Um recorte da carteira (situação, segmento, porte, UF) como barras. */
function Breakdown({
  title,
  rows,
  labelFor,
}: {
  title: string;
  rows: Array<{
    key: string | null;
    label: string | null;
    companies: number;
    mrrCents: number;
  }>;
  labelFor?: (row: { key: string | null; label: string | null }) => string;
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-2">
      <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      <BarList
        emptyLabel={t("crm:reports.empty")}
        items={rows.map((row) => ({
          key: `${row.key ?? "none"}`,
          label:
            labelFor?.(row) ??
            row.label ??
            row.key ??
            t("crm:reports.notInformed"),
          value: row.companies,
          display: (
            <>
              {t("crm:reports.clientCount", { count: row.companies })}
              {row.mrrCents > 0 ? (
                <span className="ml-2 text-foreground">
                  {formatMoneyCompact(row.mrrCents)}
                </span>
              ) : null}
            </>
          ),
        }))}
      />
    </div>
  );
}

/**
 * Os cinco relatórios de gestão. Ficam numa aba separada dos de funil porque
 * respondem outra pergunta — "como está a empresa", não "como está a semana" —
 * e doze cards numa rolagem só é uma página que ninguém termina de ler.
 */
export function CompanyReports({ query }: { query: ReportQuery }) {
  const { t } = useTranslation();
  const revenue = useCrmRevenueByServiceReport(query);
  const mrr = useCrmMrrReport(query);
  const acquisition = useCrmAcquisitionReport(query);
  const portfolio = useCrmPortfolioReport(query);
  const cohorts = useCrmCohortsReport(query);

  const months = mrr.data?.months ?? [];

  return (
    <div className="space-y-4">
      <ReportCard
        title={t("crm:reports.revenueByService")}
        hint={t("crm:reports.revenueByServiceHint")}
        isLoading={revenue.isLoading}
        action={<ExportButton report="revenue-by-service" query={query} />}
      >
        {(revenue.data ?? []).length === 0 ? (
          <p className="py-6 text-sm text-muted-foreground">
            {t("crm:reports.empty")}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("crm:reports.service")}</TableHead>
                  <TableHead>{t("crm:reports.billing")}</TableHead>
                  <TableHead className="text-right">
                    {t("crm:reports.deals")}
                  </TableHead>
                  <TableHead className="text-right">
                    {t("crm:reports.oneTime")}
                  </TableHead>
                  <TableHead className="text-right">
                    {t("crm:reports.monthlyEquivalent")}
                  </TableHead>
                  <TableHead className="text-right">
                    {t("crm:reports.hours")}
                  </TableHead>
                  <TableHead className="text-right">
                    {t("crm:reports.perHour")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(revenue.data ?? []).map((row) => (
                  <TableRow
                    key={`${row.serviceId ?? row.name}-${row.billingType}`}
                  >
                    <TableCell>
                      {row.name}
                      {row.category ? (
                        <span className="ml-2 text-xs text-muted-foreground">
                          {row.category}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" size="sm">
                        {t(
                          `crm:services.${BILLING_LABEL_KEY[row.billingType as keyof typeof BILLING_LABEL_KEY]}`,
                        )}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.deals}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.oneTimeCents > 0
                        ? formatMoney(row.oneTimeCents)
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.recurringMonthlyCents > 0
                        ? formatMoney(row.recurringMonthlyCents)
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {row.trackedSeconds > 0
                        ? formatDurationShort(row.trackedSeconds)
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.revenuePerHourCents === null
                        ? t("crm:reports.noTime")
                        : formatMoney(row.revenuePerHourCents)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </ReportCard>

      <ReportCard
        title={t("crm:reports.mrr")}
        hint={t("crm:reports.mrrHint")}
        isLoading={mrr.isLoading}
        action={<ExportButton report="mrr" query={query} />}
      >
        <div className="space-y-4">
          <div>
            <p className="text-xs text-muted-foreground">
              {t("crm:reports.currentMrr")}
            </p>
            <p className="text-2xl font-semibold tabular-nums">
              {formatMoney(mrr.data?.currentMrrCents ?? 0)}
            </p>
          </div>

          {months.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("crm:reports.empty")}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("crm:reports.month")}</TableHead>
                    <TableHead className="text-right">
                      {t("crm:reports.newMrr")}
                    </TableHead>
                    <TableHead className="text-right">
                      {t("crm:reports.expansion")}
                    </TableHead>
                    <TableHead className="text-right">
                      {t("crm:reports.contraction")}
                    </TableHead>
                    <TableHead className="text-right">
                      {t("crm:reports.churn")}
                    </TableHead>
                    <TableHead className="text-right">
                      {t("crm:reports.net")}
                    </TableHead>
                    <TableHead className="text-right">
                      {t("crm:reports.closing")}
                    </TableHead>
                    <TableHead className="text-right">
                      {t("crm:reports.churnRate")}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {months.map((month) => (
                    <TableRow key={month.month}>
                      <TableCell className="tabular-nums">
                        {month.month}
                      </TableCell>
                      <TableCell className="text-right">
                        <Money cents={month.newCents} signed />
                      </TableCell>
                      <TableCell className="text-right">
                        <Money cents={month.expansionCents} signed />
                      </TableCell>
                      <TableCell className="text-right">
                        <Money cents={month.contractionCents} signed />
                      </TableCell>
                      <TableCell className="text-right">
                        <Money cents={month.churnCents} signed />
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        <Money cents={month.netCents} signed />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatMoney(month.closingCents)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {month.churnRate === null ? "—" : `${month.churnRate}%`}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t("crm:reports.mrrByCompany")}
              </h3>
              <BarList
                emptyLabel={t("crm:reports.empty")}
                items={(mrr.data?.byCompany ?? []).slice(0, 8).map((row) => ({
                  key: row.companyId,
                  label: row.company,
                  value: row.monthlyValueCents,
                  display: formatMoney(row.monthlyValueCents),
                }))}
              />
            </div>
            <div className="space-y-2">
              <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t("crm:reports.mrrByService")}
              </h3>
              <BarList
                emptyLabel={t("crm:reports.empty")}
                items={(mrr.data?.byService ?? []).slice(0, 8).map((row) => ({
                  key: row.name,
                  label: row.name,
                  value: row.monthlyValueCents,
                  display: formatMoney(row.monthlyValueCents),
                }))}
              />
            </div>
          </div>
        </div>
      </ReportCard>

      <ReportCard
        title={t("crm:reports.acquisition")}
        hint={t("crm:reports.acquisitionHint")}
        isLoading={acquisition.isLoading}
        action={<ExportButton report="acquisition" query={query} />}
      >
        {(acquisition.data?.bySource ?? []).length === 0 ? (
          <p className="py-6 text-sm text-muted-foreground">
            {t("crm:reports.empty")}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("crm:reports.sources")}</TableHead>
                  <TableHead className="text-right">
                    {t("crm:reports.clients")}
                  </TableHead>
                  <TableHead className="text-right">
                    {t("crm:reports.deals")}
                  </TableHead>
                  <TableHead className="text-right">
                    {t("crm:reports.won")}
                  </TableHead>
                  <TableHead className="text-right">
                    {t("crm:reports.winRate")}
                  </TableHead>
                  <TableHead className="text-right">
                    {t("crm:reports.wonValue")}
                  </TableHead>
                  <TableHead className="text-right">
                    {t("crm:reports.mrrShort")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(acquisition.data?.bySource ?? []).map((row) => (
                  <TableRow key={row.sourceId ?? "none"}>
                    <TableCell>
                      {row.source ?? t("crm:reports.noSource")}
                      {row.channel ? (
                        <span className="ml-2 text-xs text-muted-foreground">
                          {t(`crm:reports.channel_${row.channel}`)}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.companies}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.deals}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.wonDeals}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.conversionRate === null
                        ? "—"
                        : `${row.conversionRate}%`}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMoney(row.wonValueCents)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMoney(row.mrrCents)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </ReportCard>

      <ReportCard
        title={t("crm:reports.portfolio")}
        hint={t("crm:reports.portfolioHint")}
        isLoading={portfolio.isLoading}
        action={<ExportButton report="portfolio" query={query} />}
      >
        <div className="space-y-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <Breakdown
              title={t("crm:reports.byStatus")}
              rows={portfolio.data?.byStatus ?? []}
              labelFor={(row) =>
                row.key
                  ? t(
                      `crm:company.${STATUS_LABEL_KEY[row.key as keyof typeof STATUS_LABEL_KEY]}`,
                    )
                  : t("crm:reports.notInformed")
              }
            />
            <Breakdown
              title={t("crm:reports.bySegment")}
              rows={portfolio.data?.bySegment ?? []}
            />
            <Breakdown
              title={t("crm:reports.bySize")}
              rows={portfolio.data?.bySize ?? []}
              labelFor={(row) =>
                row.key
                  ? t(
                      `crm:company.${SIZE_LABEL_KEY[row.key as keyof typeof SIZE_LABEL_KEY]}`,
                    )
                  : t("crm:reports.notInformed")
              }
            />
            <Breakdown
              title={t("crm:reports.byState")}
              rows={portfolio.data?.byState ?? []}
            />
          </div>

          <div className="rounded-lg border border-border px-3 py-2">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <div>
                <p className="text-sm font-medium">
                  {t("crm:reports.concentration")}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t("crm:reports.concentrationHint")}
                </p>
              </div>
              <p className="text-xl font-semibold tabular-nums">
                {portfolio.data?.concentration.topFiveShare === null ||
                portfolio.data?.concentration.topFiveShare === undefined
                  ? "—"
                  : `${portfolio.data.concentration.topFiveShare}%`}
              </p>
            </div>
            {(portfolio.data?.concentration.topClients ?? []).length > 0 ? (
              <ul className="mt-2 space-y-1">
                {portfolio.data?.concentration.topClients.map((client) => (
                  <li
                    key={client.companyId}
                    className="flex items-baseline justify-between gap-3 text-sm"
                  >
                    <span className="truncate">{client.company}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {formatMoney(client.mrrCents)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
      </ReportCard>

      <ReportCard
        title={t("crm:reports.cohorts")}
        hint={t("crm:reports.cohortsHint")}
        isLoading={cohorts.isLoading}
        action={<ExportButton report="cohorts" query={query} />}
      >
        {(cohorts.data ?? []).length === 0 ? (
          <p className="py-6 text-sm text-muted-foreground">
            {t("crm:reports.empty")}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("crm:reports.cohort")}</TableHead>
                  <TableHead className="text-right">
                    {t("crm:reports.clients")}
                  </TableHead>
                  {(cohorts.data?.[0]?.milestones ?? []).map((milestone) => (
                    <TableHead key={milestone.month} className="text-right">
                      {t("crm:reports.monthsAfter", { count: milestone.month })}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {(cohorts.data ?? []).map((cohort) => (
                  <TableRow key={cohort.cohort}>
                    <TableCell className="tabular-nums">
                      {cohort.cohort}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {cohort.companies}
                    </TableCell>
                    {cohort.milestones.map((milestone) => (
                      <TableCell
                        key={milestone.month}
                        className="text-right tabular-nums"
                      >
                        {milestone.retained === null ? (
                          <span className="text-muted-foreground">
                            {t("crm:reports.notYet")}
                          </span>
                        ) : (
                          <>
                            {milestone.retained}
                            <span className="ml-1 text-xs text-muted-foreground">
                              {milestone.rate}%
                            </span>
                          </>
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </ReportCard>
    </div>
  );
}

export default CompanyReports;
