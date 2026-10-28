import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import BarList from "@/components/crm/charts/bar-list";
import GroupedBars from "@/components/crm/charts/grouped-bars";
import ReportCard from "@/components/crm/charts/report-card";
import { today } from "@/components/finance/shared";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getHostingReport } from "@/fetchers/crm/hosting";
import { useCrmPipelines } from "@/hooks/queries/crm/use-crm-pipelines";
import {
  useCrmForecastReport,
  useCrmFunnelReport,
  useCrmMrrReport,
  useCrmPortfolioReport,
  useCrmTeamReport,
} from "@/hooks/queries/crm/use-crm-reports";
import { useWorkspaceMembers } from "@/hooks/queries/workspace/use-workspace-members";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import { formatMoney, formatMoneyCompact } from "@/lib/money";

type Period = "30" | "90" | "year";
const all = "__all__";

export function CommercialOverview({ workspaceId }: { workspaceId: string }) {
  const { t } = useTranslation();
  const [period, setPeriod] = useState<Period>("90");
  const [pipelineId, setPipelineId] = useState("");
  const [ownerUserId, setOwnerUserId] = useState("");
  const { canViewAllCrmReports, canViewCompanies, canViewHosting } =
    useWorkspacePermission();
  const showHosting = canViewCompanies() && canViewHosting();
  const allOwners = canViewAllCrmReports();
  const { data: pipelines = [] } = useCrmPipelines(workspaceId);
  const { data: members = [] } = useWorkspaceMembers(workspaceId);

  const query = useMemo(() => {
    const now = new Date();
    const from =
      period === "year"
        ? new Date(now.getFullYear(), 0, 1)
        : new Date(now.getTime() - Number(period) * 24 * 60 * 60 * 1000);
    return {
      workspaceId,
      from: from.toISOString(),
      to: now.toISOString(),
      ...(pipelineId ? { pipelineId } : {}),
      ...(allOwners && ownerUserId ? { ownerUserId } : {}),
    };
  }, [workspaceId, period, pipelineId, ownerUserId, allOwners]);

  const team = useCrmTeamReport(query);
  const forecast = useCrmForecastReport(query);
  const funnel = useCrmFunnelReport(query);
  const mrr = useCrmMrrReport(query);
  const portfolio = useCrmPortfolioReport(query);
  const hostingFrom = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(query.from));
  const hostingTo = today();
  const hosting = useQuery({
    queryKey: [
      "crm",
      "hosting-report",
      workspaceId,
      hostingFrom,
      hostingTo,
      ownerUserId,
    ],
    queryFn: () =>
      getHostingReport(workspaceId, {
        from: hostingFrom,
        to: hostingTo,
        ...(allOwners && ownerUserId ? { ownerId: ownerUserId } : {}),
      }),
    enabled: showHosting,
    staleTime: 60 * 1000,
  });
  const reports = [team, forecast, funnel, mrr, portfolio];
  const failed = reports.some((report) => report.isError) || hosting.isError;
  const loading =
    reports.some((report) => report.isLoading) ||
    (showHosting && hosting.isLoading);

  const open = (team.data ?? []).reduce(
    (total, row) => total + row.open.deals,
    0,
  );
  const openValue = (team.data ?? []).reduce(
    (total, row) => total + row.open.valueCents,
    0,
  );
  const wonInPeriod = (forecast.data?.months ?? []).reduce(
    (total, month) => total + month.wonValueCents,
    0,
  );
  const activeClients =
    portfolio.data?.byStatus.find((row) => row.key === "active")?.companies ??
    0;
  const stats = [
    {
      label: "Negócios em aberto",
      value: String(open),
      hint: formatMoney(openValue),
    },
    {
      label: "Vendas ganhas no período",
      value: formatMoney(wonInPeriod),
      hint: "Pela data de fechamento",
    },
    {
      label: "Clientes ativos",
      value: String(activeClients),
      hint: "Situação atual da carteira",
    },
    {
      label: "Receita recorrente ativa",
      value: formatMoney(portfolio.data?.concentration.totalMrrCents ?? 0),
      hint: "Contratos ativos na carteira",
    },
  ];
  if (showHosting) {
    stats.push({
      label: "Hospedagem de terceiros",
      value: String(hosting.data?.current.thirdParty ?? 0),
      hint: `${hosting.data?.current.due ?? 0} renovações em atenção`,
    });
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 px-5 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Visão geral do Comercial</h1>
          <p className="text-sm text-muted-foreground">
            Vendas e conversão no período; negócios abertos, carteira e
            contratos na situação atual.
          </p>
          {pipelineId && (
            <p className="text-xs text-muted-foreground">
              O filtro de funil afeta negócios e conversão; contratos e clientes
              seguem a carteira inteira.
            </p>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          render={
            <Link
              to="/dashboard/workspace/$workspaceId/crm/reports"
              params={{ workspaceId }}
            />
          }
        >
          Relatórios detalhados
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <Select
          value={period}
          onValueChange={(value) => {
            if (typeof value === "string") setPeriod(value as Period);
          }}
        >
          <SelectTrigger size="sm" className="w-44">
            <SelectValue>
              {period === "year" ? "Este ano" : `Últimos ${period} dias`}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="30">Últimos 30 dias</SelectItem>
            <SelectItem value="90">Últimos 90 dias</SelectItem>
            <SelectItem value="year">Este ano</SelectItem>
          </SelectContent>
        </Select>
        {pipelines.length > 1 && (
          <Select
            value={pipelineId || all}
            onValueChange={(value) => {
              if (typeof value === "string")
                setPipelineId(value === all ? "" : value);
            }}
          >
            <SelectTrigger size="sm" className="w-44">
              <SelectValue>
                {pipelines.find((item) => item.id === pipelineId)?.name ??
                  "Funil padrão"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={all}>Funil padrão</SelectItem>
              {pipelines.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {allOwners && (
          <Select
            value={ownerUserId || all}
            onValueChange={(value) => {
              if (typeof value === "string")
                setOwnerUserId(value === all ? "" : value);
            }}
          >
            <SelectTrigger size="sm" className="w-44">
              <SelectValue>
                {members.find((item) => item.id === ownerUserId)?.name ??
                  "Todos os vendedores"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={all}>Todos os vendedores</SelectItem>
              {members.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {failed && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/40 p-4 text-sm"
        >
          Não foi possível carregar todos os indicadores. Tente atualizar a
          página.
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-lg border border-border bg-card p-4"
          >
            <p className="text-xs text-muted-foreground">{stat.label}</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums">
              {loading ? "…" : stat.value}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{stat.hint}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ReportCard
          title="Previsão × vendas ganhas"
          hint="Previsão ponderada pela probabilidade; vendas pela data de fechamento."
          isLoading={forecast.isLoading}
        >
          <GroupedBars
            rows={(forecast.data?.months ?? []).map((month) => ({
              key: month.month,
              label: month.month,
              values: {
                weighted: month.weightedValueCents,
                won: month.wonValueCents,
              },
            }))}
            series={[
              { key: "weighted", label: "Previsão", color: "var(--primary)" },
              { key: "won", label: "Ganhas", color: "var(--success)" },
            ]}
            formatValue={formatMoney}
            emptyLabel={t("crm:reports.empty")}
          />
        </ReportCard>
        <ReportCard
          title="Evolução do MRR"
          hint="Receita recorrente mensal dos contratos no período."
          isLoading={mrr.isLoading}
        >
          <BarList
            emptyLabel={t("crm:reports.empty")}
            items={(mrr.data?.months ?? []).map((month) => ({
              key: month.month,
              label: month.month,
              value: month.closingCents,
              display: formatMoneyCompact(month.closingCents),
            }))}
          />
        </ReportCard>
        <ReportCard
          title="Conversão por etapa"
          hint="Negócios que avançaram entre os que entraram em cada etapa."
          isLoading={funnel.isLoading}
        >
          <BarList
            emptyLabel={t("crm:reports.empty")}
            items={(funnel.data?.stages ?? [])
              .filter((stage) => stage.outcome === "open")
              .map((stage) => ({
                key: stage.id,
                label: stage.name,
                value: stage.entered,
                display: `${stage.entered} · ${stage.progressionRate === null ? "—" : `${stage.progressionRate}%`}`,
              }))}
          />
        </ReportCard>
        <ReportCard
          title="Carteira por situação"
          hint="Distribuição atual dos clientes, independente do período."
          isLoading={portfolio.isLoading}
        >
          <BarList
            emptyLabel={t("crm:reports.empty")}
            items={(portfolio.data?.byStatus ?? []).map((row) => ({
              key: row.key ?? "unknown",
              label: row.key
                ? t(
                    `crm:reports.status${row.key.charAt(0).toUpperCase()}${row.key.slice(1)}`,
                  )
                : "Não informado",
              value: row.companies,
              display: row.companies,
            }))}
          />
        </ReportCard>
        {showHosting && (
          <ReportCard
            title="Hospedagem própria × terceiros"
            hint="Comparação mensal das empresas cadastradas."
            isLoading={hosting.isLoading}
          >
            <GroupedBars
              rows={(hosting.data?.months ?? [])
                .filter((month) => month.historyAvailable)
                .map((month) => ({
                  key: month.month,
                  label: month.month,
                  values: { own: month.own, third: month.thirdParty },
                }))}
              series={[
                { key: "own", label: "Nossa", color: "var(--info)" },
                { key: "third", label: "Terceiros", color: "var(--warning)" },
              ]}
              formatValue={(value) => `${value} empresas`}
              emptyLabel={t("crm:reports.empty")}
            />
          </ReportCard>
        )}
      </div>
    </div>
  );
}
