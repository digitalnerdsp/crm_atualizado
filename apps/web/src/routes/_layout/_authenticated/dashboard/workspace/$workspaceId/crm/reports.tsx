import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import WorkspaceLayout from "@/components/common/workspace-layout";
import BarList from "@/components/crm/charts/bar-list";
import GroupedBars from "@/components/crm/charts/grouped-bars";
import ReportCard from "@/components/crm/charts/report-card";
import CompanyReports from "@/components/crm/reports/company-reports";
import PageTitle from "@/components/page-title";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@/components/ui/tabs";
import { getLaneColor } from "@/constants/lane-colors";
import { useCrmPipelines } from "@/hooks/queries/crm/use-crm-pipelines";
import {
  useCrmForecastReport,
  useCrmFunnelReport,
  useCrmLossReasonsReport,
  useCrmRevenueVsDelivery,
  useCrmSourceReport,
  useCrmTeamReport,
  useCrmVelocityReport,
} from "@/hooks/queries/crm/use-crm-reports";
import { useWorkspaceMembers } from "@/hooks/queries/workspace/use-workspace-members";
import { formatDurationShort } from "@/lib/format";
import { getInitials } from "@/lib/get-initials";
import { formatMoney, formatMoneyCompact } from "@/lib/money";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/workspace/$workspaceId/crm/reports",
)({
  component: RouteComponent,
});

type Period = "last30" | "last90" | "thisYear" | "allTime";

function windowFor(period: Period) {
  const now = new Date();
  if (period === "allTime") return {};
  if (period === "thisYear") {
    return { from: new Date(now.getFullYear(), 0, 1).toISOString() };
  }
  const days = period === "last30" ? 30 : 90;
  return {
    from: new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString(),
  };
}

function RouteComponent() {
  const { t } = useTranslation();
  const { workspaceId } = Route.useParams();
  const [period, setPeriod] = useState<Period>("last90");
  const [revenueGroup, setRevenueGroup] = useState<"deal" | "company">("deal");
  const [pipelineId, setPipelineId] = useState("");
  const [ownerUserId, setOwnerUserId] = useState("");

  // Funil e responsável: a API aceita os dois desde o plano 007 e a tela
  // nunca os expôs, então ninguém conseguia olhar o número de um vendedor só.
  const { data: pipelines = [] } = useCrmPipelines(workspaceId);
  const { data: members = [] } = useWorkspaceMembers(workspaceId);

  const query = useMemo(
    () => ({
      workspaceId,
      ...windowFor(period),
      ...(pipelineId ? { pipelineId } : {}),
      ...(ownerUserId ? { ownerUserId } : {}),
    }),
    [workspaceId, period, pipelineId, ownerUserId],
  );

  const funnel = useCrmFunnelReport(query);
  const forecast = useCrmForecastReport(query);
  const velocity = useCrmVelocityReport(query);
  const team = useCrmTeamReport(query);
  const lossReasons = useCrmLossReasonsReport(query);
  const sources = useCrmSourceReport(query);
  const revenue = useCrmRevenueVsDelivery({ ...query, groupBy: revenueGroup });

  const periodLabels: Record<Period, string> = {
    last30: t("crm:reports.last30"),
    last90: t("crm:reports.last90"),
    thisYear: t("crm:reports.thisYear"),
    allTime: t("crm:reports.allTime"),
  };

  const ALL = "__all__";
  const selectedPipeline = pipelines.find(
    (pipeline) => pipeline.id === pipelineId,
  );
  const selectedMember = members.find((member) => member.id === ownerUserId);

  const headerActions = (
    <>
      {pipelines.length > 1 ? (
        <Select
          value={pipelineId || ALL}
          onValueChange={(value) => {
            if (typeof value === "string") {
              setPipelineId(value === ALL ? "" : value);
            }
          }}
        >
          <SelectTrigger size="sm" className="h-8 w-40">
            <SelectValue>
              {selectedPipeline?.name ?? t("crm:reports.allPipelines")}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t("crm:reports.allPipelines")}</SelectItem>
            {pipelines.map((pipeline) => (
              <SelectItem key={pipeline.id} value={pipeline.id}>
                {pipeline.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}

      <Select
        value={ownerUserId || ALL}
        onValueChange={(value) => {
          if (typeof value === "string") {
            setOwnerUserId(value === ALL ? "" : value);
          }
        }}
      >
        <SelectTrigger size="sm" className="h-8 w-44">
          <SelectValue>
            {selectedMember?.name ?? t("crm:reports.allOwners")}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{t("crm:reports.allOwners")}</SelectItem>
          {members.map((member) => (
            <SelectItem key={member.id} value={member.id}>
              {member.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={period}
        onValueChange={(value) => {
          if (typeof value === "string") setPeriod(value as Period);
        }}
      >
        <SelectTrigger size="sm" className="h-8 w-44">
          <SelectValue>{periodLabels[period]}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {(["last30", "last90", "thisYear", "allTime"] as const).map(
            (value) => (
              <SelectItem key={value} value={value}>
                {periodLabels[value]}
              </SelectItem>
            ),
          )}
        </SelectContent>
      </Select>
    </>
  );

  return (
    <WorkspaceLayout
      title={t("crm:reports.title")}
      headerActions={headerActions}
    >
      <PageTitle title={t("crm:reports.title")} />

      {/* Duas abas em vez de doze cards numa rolagem só: funil é a pergunta
          da semana, empresa é a do trimestre. */}
      <Tabs
        defaultValue="commercial"
        className="mx-auto w-full max-w-7xl p-4 md:p-6"
      >
        <TabsList className="mb-4">
          <TabsTab value="commercial">{t("crm:reports.tabCommercial")}</TabsTab>
          <TabsTab value="company">{t("crm:reports.tabCompany")}</TabsTab>
        </TabsList>

        <TabsPanel value="company">
          <CompanyReports query={query} />
        </TabsPanel>

        <TabsPanel value="commercial" className="space-y-4">
          <ReportCard
            title={t("crm:reports.funnel")}
            hint={t("crm:reports.funnelHint")}
            isLoading={funnel.isLoading}
          >
            <BarList
              emptyLabel={t("crm:reports.empty")}
              items={(funnel.data?.stages ?? []).map((stage) => ({
                key: stage.id,
                label: stage.name,
                value: stage.entered,
                color: getLaneColor(stage.color, stage.name.toLowerCase()),
                display: (
                  <>
                    {stage.entered} {t("crm:reports.entered")}
                    {stage.progressionRate === null ? null : (
                      <span
                        className="ml-2 text-foreground"
                        title={t("crm:reports.progressionHint", {
                          advanced: stage.advanced,
                          entered: stage.entered,
                        })}
                      >
                        {stage.progressionRate}%
                      </span>
                    )}
                  </>
                ),
              }))}
            />
          </ReportCard>

          <ReportCard
            title={t("crm:reports.forecast")}
            hint={t("crm:reports.forecastHint")}
            isLoading={forecast.isLoading}
          >
            <GroupedBars
              emptyLabel={t("crm:reports.empty")}
              formatValue={(value) => formatMoney(value)}
              series={[
                {
                  key: "weighted",
                  label: t("crm:reports.weighted"),
                  color: "var(--primary)",
                },
                {
                  key: "won",
                  label: t("crm:reports.won"),
                  color: "var(--success)",
                },
              ]}
              rows={(forecast.data?.months ?? []).map((month) => ({
                key: month.month,
                label: month.month,
                values: {
                  weighted: month.weightedValueCents,
                  won: month.wonValueCents,
                },
              }))}
            />

            {forecast.data && forecast.data.withoutCloseDate.deals > 0 ? (
              <p className="mt-4 text-xs text-muted-foreground">
                {t("crm:reports.noCloseDate", {
                  count: forecast.data.withoutCloseDate.deals,
                  value: formatMoneyCompact(
                    forecast.data.withoutCloseDate.valueCents,
                  ),
                })}
              </p>
            ) : null}
          </ReportCard>

          <ReportCard
            title={t("crm:reports.velocity")}
            hint={t("crm:reports.velocityHint")}
            isLoading={velocity.isLoading}
          >
            <BarList
              emptyLabel={t("crm:reports.empty")}
              items={(velocity.data?.stages ?? []).map((stage) => ({
                key: stage.stageId ?? stage.stageName,
                label: stage.stageName,
                value: stage.averageSeconds,
                display: (
                  <>
                    {formatDurationShort(stage.averageSeconds)}
                    <span className="ml-2 text-[11px]">
                      ({stage.samples} {t("crm:reports.samples")})
                    </span>
                  </>
                ),
              }))}
            />

            {velocity.data && velocity.data.wonCycle.deals > 0 ? (
              <p className="mt-4 border-t border-border pt-3 text-sm">
                <span className="text-muted-foreground">
                  {t("crm:reports.cycleTime")}:{" "}
                </span>
                <span className="font-medium">
                  {formatDurationShort(velocity.data.wonCycle.averageSeconds)}
                </span>
              </p>
            ) : null}
          </ReportCard>

          <ReportCard title={t("crm:reports.team")} isLoading={team.isLoading}>
            {(team.data ?? []).length === 0 ? (
              <p className="py-6 text-sm text-muted-foreground">
                {t("crm:reports.empty")}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("crm:reports.rep")}</TableHead>
                      <TableHead className="text-right">
                        {t("crm:reports.openDeals")}
                      </TableHead>
                      <TableHead className="text-right">
                        {t("crm:reports.wonDeals")}
                      </TableHead>
                      <TableHead className="text-right">
                        {t("crm:reports.lostDeals")}
                      </TableHead>
                      <TableHead className="text-right">
                        {t("crm:reports.winRate")}
                      </TableHead>
                      <TableHead className="text-right">
                        {t("crm:reports.avgTicket")}
                      </TableHead>
                      <TableHead className="text-right">
                        {t("crm:reports.activities")}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(team.data ?? []).map((row) => (
                      <TableRow key={row.ownerUserId ?? "unassigned"}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {row.ownerName ? (
                              <>
                                <Avatar className="size-5">
                                  <AvatarImage
                                    src={row.ownerImage ?? undefined}
                                  />
                                  <AvatarFallback className="text-[9px]">
                                    {getInitials(row.ownerName)}
                                  </AvatarFallback>
                                </Avatar>
                                {row.ownerName}
                              </>
                            ) : (
                              <span className="text-muted-foreground">
                                {t("crm:reports.unassigned")}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {row.open.deals}
                          <span className="ml-1.5 text-xs text-muted-foreground">
                            {formatMoneyCompact(row.open.valueCents)}
                          </span>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {row.won.deals}
                          <span className="ml-1.5 text-xs text-muted-foreground">
                            {formatMoneyCompact(row.won.valueCents)}
                          </span>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {row.lost.deals}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {row.winRate === null ? "—" : `${row.winRate}%`}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatMoneyCompact(row.averageTicketCents)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {row.completedActivities}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </ReportCard>

          <div className="grid gap-4 md:grid-cols-2">
            <ReportCard
              title={t("crm:reports.lossReasons")}
              hint={t("crm:reports.lossReasonsHint")}
              isLoading={lossReasons.isLoading}
            >
              <BarList
                emptyLabel={t("crm:reports.empty")}
                items={(lossReasons.data?.reasons ?? []).map((reason) => ({
                  key: reason.reasonId ?? "none",
                  label: reason.reasonName ?? t("crm:reports.noReason"),
                  value: reason.deals,
                  color: "var(--destructive)",
                  display: (
                    <>
                      {reason.deals}
                      <span className="ml-2 text-[11px]">
                        {formatMoneyCompact(reason.valueCents)}
                      </span>
                    </>
                  ),
                }))}
              />
            </ReportCard>

            <ReportCard
              title={t("crm:reports.sources")}
              hint={t("crm:reports.sourcesHint")}
              isLoading={sources.isLoading}
            >
              <BarList
                emptyLabel={t("crm:reports.empty")}
                items={(sources.data ?? []).map((row) => ({
                  key: row.source ?? "none",
                  label: row.source ?? t("crm:reports.noSource"),
                  value: row.total,
                  display: (
                    <>
                      {row.total}
                      <span className="ml-2 text-[11px]">
                        {formatMoneyCompact(row.wonValueCents)}{" "}
                        {t("crm:reports.won").toLowerCase()}
                      </span>
                    </>
                  ),
                }))}
              />
            </ReportCard>
          </div>

          <ReportCard
            title={t("crm:reports.revenue")}
            hint={t("crm:reports.revenueHint")}
            isLoading={revenue.isLoading}
            action={
              <div className="flex gap-1">
                {(["deal", "company"] as const).map((value) => (
                  <Button
                    key={value}
                    size="sm"
                    variant={revenueGroup === value ? "secondary" : "ghost"}
                    className="h-7 px-2 text-xs"
                    onClick={() => setRevenueGroup(value)}
                  >
                    {value === "deal"
                      ? t("crm:reports.byDeal")
                      : t("crm:reports.byCompany")}
                  </Button>
                ))}
              </div>
            }
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
                      <TableHead>
                        {revenueGroup === "deal"
                          ? t("crm:reports.byDeal")
                          : t("crm:reports.byCompany")}
                      </TableHead>
                      <TableHead className="text-right">
                        {t("crm:reports.won")}
                      </TableHead>
                      <TableHead className="text-right">
                        {t("crm:reports.tasks")}
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
                    {(revenue.data ?? []).map((row) => {
                      const isDeal = "dealId" in row;
                      return (
                        <TableRow key={isDeal ? row.dealId : row.companyId}>
                          <TableCell>
                            {isDeal ? (
                              <>
                                <span className="font-mono text-[10px] text-muted-foreground">
                                  #{row.dealNumber}
                                </span>{" "}
                                {row.dealTitle}
                                {row.companyName ? (
                                  <span className="ml-2 text-xs text-muted-foreground">
                                    {row.companyName}
                                  </span>
                                ) : null}
                              </>
                            ) : (
                              row.companyName
                            )}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatMoney(row.valueCents)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {row.taskCount}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {(row.trackedSeconds / 3600).toFixed(1)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {row.revenuePerHourCents === null ? (
                              <span className="text-xs text-muted-foreground">
                                {t("crm:reports.noTime")}
                              </span>
                            ) : (
                              formatMoney(row.revenuePerHourCents)
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </ReportCard>
        </TabsPanel>
      </Tabs>
    </WorkspaceLayout>
  );
}
