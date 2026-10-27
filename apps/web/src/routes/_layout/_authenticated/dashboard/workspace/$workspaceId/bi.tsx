import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Activity,
  ArrowDownToLine,
  ArrowUpRight,
  ChartNoAxesCombined,
  RefreshCw,
} from "lucide-react";
import { useState } from "react";
import WorkspaceLayout from "@/components/common/workspace-layout";
import { CommercialOverview } from "@/components/crm/commercial-overview";
import { BiChart, Breakdown } from "@/components/finance/bi/charts";
import { BiDetail } from "@/components/finance/bi/detail";
import { formatMetric, labels, margins } from "@/components/finance/bi/shared";
import {
  dateLabel,
  Field,
  money,
  selectClass,
  today,
} from "@/components/finance/shared";
import PageTitle from "@/components/page-title";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getMetadata } from "@/fetchers/finance";
import {
  type BiFilters,
  type BiMetric,
  downloadBi,
  getBiReport,
} from "@/fetchers/finance/bi";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import { toast } from "@/lib/toast";

const defaults = (): BiFilters => ({
  from: `${today().slice(0, 7)}-01`,
  to: today(),
  comparison: "previous",
  grouping: "month",
});
export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/workspace/$workspaceId/bi",
)({
  validateSearch: (search: Record<string, unknown>): BiFilters => {
    const result: Record<string, string> = { ...defaults() };
    for (const key of [
      "from",
      "to",
      "comparison",
      "grouping",
      "ranking",
      "companyId",
      "sellerId",
      "serviceId",
      "categoryId",
      "subcategoryId",
      "partyId",
      "laborType",
      "resultClass",
      "contractId",
      "contractStatus",
    ])
      if (typeof search[key] === "string" && search[key])
        result[key] = String(search[key]);
    return result as BiFilters;
  },
  component: BiPage,
});
function BiPage() {
  const { workspaceId } = Route.useParams();
  return <BiWorkspace key={workspaceId} workspaceId={workspaceId} />;
}
function BiWorkspace({ workspaceId }: { workspaceId: string }) {
  const filters = Route.useSearch();
  const navigate = Route.useNavigate();
  const permissions = useWorkspacePermission();
  const enabled =
    !permissions.isCheckingPermissions && permissions.canViewFinance();
  const [tab, setTab] = useState("overview");
  const [metric, setMetric] = useState<BiMetric | null>(null);
  const [exporting, setExporting] = useState(false);
  const [detailDays, setDetailDays] = useState(90);
  const report = useQuery({
    queryKey: ["finance", workspaceId, "bi", filters],
    queryFn: () => getBiReport(workspaceId, filters),
    enabled,
  });
  const meta = useQuery({
    queryKey: ["finance", workspaceId, "metadata"],
    queryFn: () => getMetadata(workspaceId),
    enabled,
  });
  const apply = (next: BiFilters) => {
    setMetric(null);
    navigate({ search: next });
  };
  const download = async (format: "xlsx" | "pdf") => {
    setExporting(true);
    try {
      await downloadBi(workspaceId, filters, format);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setExporting(false);
    }
  };
  const preset = (key: string) => {
    const now = today();
    const year = now.slice(0, 4);
    const month = Number(now.slice(5, 7));
    let from = `${now.slice(0, 7)}-01`;
    let to = now;
    if (key === "last") {
      const end = new Date(Date.parse(from) - 86400000)
        .toISOString()
        .slice(0, 10);
      from = `${end.slice(0, 7)}-01`;
      to = end;
    }
    if (key === "quarter")
      from = `${year}-${String(Math.floor((month - 1) / 3) * 3 + 1).padStart(2, "0")}-01`;
    if (key === "year") from = `${year}-01-01`;
    apply({ ...filters, from, to, grouping: "month" });
  };
  const card = (key: BiMetric) => {
    const d = report.data;
    if (!d) return null;
    const v = d.current[key];
    const p = d.previous[key];
    const delta =
      v !== null && p !== null && p !== 0
        ? ((v - p) / Math.abs(p)) * 100
        : null;
    return (
      <button
        type="button"
        key={key}
        onClick={() => {
          setDetailDays(90);
          setMetric(key);
        }}
        className="min-w-0 rounded-xl border bg-card p-4 text-left transition hover:border-primary/50 hover:bg-muted/30 focus-visible:outline-2 focus-visible:outline-ring"
      >
        <span className="flex items-start justify-between gap-2 text-sm text-muted-foreground">
          {labels[key]}
          <ArrowUpRight className="size-4 shrink-0" />
        </span>
        <span
          className={`mt-3 block break-words text-2xl font-semibold tracking-tight tabular-nums ${v !== null && v < 0 ? "text-destructive" : ""}`}
        >
          {formatMetric(key, v)}
        </span>
        <span className="mt-2 block text-xs text-muted-foreground">
          {margins.has(key) && v !== null && p !== null
            ? `${(v - p).toFixed(2)} p.p.`
            : delta === null
              ? "Variação não aplicável"
              : `${delta > 0 ? "+" : ""}${delta.toFixed(1)}%`}{" "}
          · anterior {formatMetric(key, p)}
        </span>
      </button>
    );
  };
  const cards = (keys: BiMetric[]) => (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {keys.map(card)}
    </div>
  );
  const d = report.data;
  const chartRows =
    d?.months.map((m) => ({
      key: m.key,
      label: m.label,
      values: {
        revenue: m.revenue,
        expenses: m.expenses,
        net: m.net,
        received: m.received,
        paid: m.paid,
        expectedIncome: m.expectedIncome,
        expectedExpense: m.expectedExpense,
        mrr: m.mrr,
      },
    })) ?? [];
  const period = (key: string) => {
    if (filters.grouping === "day") apply({ ...filters, from: key, to: key });
    else {
      const first = `${key.slice(0, 7)}-01`;
      const end = new Date(
        Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)), 0),
      )
        .toISOString()
        .slice(0, 10);
      apply({ ...filters, from: first, to: end });
    }
  };
  const line = (
    title: string,
    series: { key: string; label: string; color: string }[],
  ) => (
    <BiChart title={title} rows={chartRows} series={series} onPeriod={period} />
  );
  return (
    <WorkspaceLayout title="BI financeiro">
      <PageTitle title="BI financeiro" />
      <div className="mx-auto w-full max-w-[1600px] space-y-5 p-4 md:p-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-primary">
              <ChartNoAxesCombined className="size-4" />
              Inteligência financeira
            </div>
            <h1 className="text-2xl font-semibold md:text-3xl">
              Dashboard geral
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Uma visão da operação, dos resultados e dos compromissos futuros.
              Clique nos indicadores para entender sua composição.
            </p>
          </div>
          {enabled && (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                disabled={report.isFetching}
                onClick={() => report.refetch()}
                aria-label="Atualizar BI"
              >
                <RefreshCw className="size-4" />
              </Button>
              {permissions.canExportFinance() && (
                <>
                  <Button
                    variant="outline"
                    disabled={exporting || !d}
                    onClick={() => download("xlsx")}
                  >
                    <ArrowDownToLine className="size-4" />
                    Excel
                  </Button>
                  <Button
                    variant="outline"
                    disabled={exporting || !d}
                    onClick={() => download("pdf")}
                  >
                    PDF executivo
                  </Button>
                </>
              )}
            </div>
          )}
        </header>
        {permissions.isCheckingPermissions ? (
          <p>Verificando acesso…</p>
        ) : !enabled ? (
          <p role="alert">
            Você não tem permissão para consultar o financeiro.
          </p>
        ) : (
          <>
            <form
              key={JSON.stringify(filters)}
              className="space-y-4 rounded-xl border bg-card p-4"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                const next: Record<string, string> = {};
                for (const [key, value] of f.entries())
                  if (value) next[key] = String(value);
                apply(next as BiFilters);
              }}
            >
              <input
                type="hidden"
                name="ranking"
                value={filters.ranking ?? "revenue"}
              />
              <div className="flex flex-wrap gap-2">
                {[
                  ["current", "Mês atual"],
                  ["last", "Mês anterior"],
                  ["quarter", "Trimestre"],
                  ["year", "Ano atual"],
                ].map(([key, label]) => (
                  <Button
                    key={key}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => preset(key)}
                  >
                    {label}
                  </Button>
                ))}
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
                <Field label="De">
                  <Input
                    type="date"
                    required
                    name="from"
                    defaultValue={filters.from}
                  />
                </Field>
                <Field label="Até">
                  <Input
                    type="date"
                    required
                    name="to"
                    defaultValue={filters.to}
                  />
                </Field>
                <Field label="Comparar com">
                  <select
                    name="comparison"
                    className={selectClass}
                    defaultValue={filters.comparison}
                  >
                    <option value="previous">Período anterior</option>
                    <option value="year">Mesmo período / ano anterior</option>
                  </select>
                </Field>
                <Field label="Agrupamento">
                  <select
                    name="grouping"
                    className={selectClass}
                    defaultValue={filters.grouping}
                  >
                    <option value="month">Mensal</option>
                    <option value="day">Diário (até 93 dias)</option>
                  </select>
                </Field>
                {(
                  [
                    ["companyId", "Cliente", meta.data?.companies],
                    ["sellerId", "Vendedor", meta.data?.sellers],
                    ["serviceId", "Serviço", meta.data?.services],
                  ] as const
                ).map(([key, label, rows]) => (
                  <Field label={label} key={key}>
                    <select
                      name={key}
                      className={selectClass}
                      defaultValue={filters[key] ?? ""}
                    >
                      <option value="">Todos</option>
                      {rows?.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                ))}
              </div>
              <details>
                <summary className="cursor-pointer text-sm text-muted-foreground">
                  Filtros específicos de despesas e contratos
                </summary>
                <p className="my-3 text-xs text-muted-foreground">
                  Os filtros abaixo não alteram os totais gerais. Despesas:
                  somente o bloco “Recorte de despesas”. Contratos: somente
                  recorrência e ciclos não emitidos da projeção.
                </p>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {(
                    [
                      [
                        "categoryId",
                        "Categoria",
                        meta.data?.categories.filter((c) => !c.parentId),
                      ],
                      [
                        "subcategoryId",
                        "Subcategoria",
                        meta.data?.categories.filter((c) => c.parentId),
                      ],
                      [
                        "partyId",
                        "Colaborador / favorecido",
                        meta.data?.parties,
                      ],
                      ["contractId", "Contrato", meta.data?.contracts],
                    ] as const
                  ).map(([key, label, rows]) => (
                    <Field key={key} label={label}>
                      <select
                        name={key}
                        className={selectClass}
                        defaultValue={filters[key] ?? ""}
                      >
                        <option value="">Todos</option>
                        {rows?.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name}
                          </option>
                        ))}
                      </select>
                    </Field>
                  ))}
                  <Field label="Vínculo">
                    <select
                      name="laborType"
                      className={selectClass}
                      defaultValue={filters.laborType ?? ""}
                    >
                      <option value="">Todos</option>
                      <option value="pj">PJ</option>
                      <option value="freelance">Freelance</option>
                      <option value="clt">CLT</option>
                    </select>
                  </Field>
                  <Field label="Classificação">
                    <select
                      name="resultClass"
                      className={selectClass}
                      defaultValue={filters.resultClass ?? ""}
                    >
                      <option value="">Todas</option>
                      {[
                        ["direct", "Custo direto"],
                        ["operating", "Operacional"],
                        ["tax", "Imposto"],
                        ["financial", "Despesa financeira"],
                        ["commission", "Comissão manual"],
                        ["unclassified", "Não classificado"],
                      ].map(([key, label]) => (
                        <option key={key} value={key}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Situação contratual">
                    <select
                      name="contractStatus"
                      className={selectClass}
                      defaultValue={filters.contractStatus ?? ""}
                    >
                      <option value="">Todas</option>
                      {[
                        ["active", "Ativo"],
                        ["paused", "Suspenso"],
                        ["cancelled", "Cancelado"],
                        ["finished", "Encerrado"],
                        ["not_started", "Não iniciado"],
                      ].map(([key, label]) => (
                        <option key={key} value={key}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
              </details>
              <div className="flex flex-wrap gap-2">
                <Button type="submit">Aplicar filtros</Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => apply(defaults())}
                >
                  Limpar filtros
                </Button>
              </div>
            </form>
            {meta.isError && (
              <p role="alert">
                Não foi possível carregar os filtros: {meta.error.message}
              </p>
            )}
            {report.isFetching && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Activity className="size-4 animate-pulse" />
                Atualizando indicadores…
              </p>
            )}
            {report.isError && (
              <p
                role="alert"
                className="rounded-xl border border-destructive p-4"
              >
                {report.error.message}
              </p>
            )}
            {d && !report.isError && (
              <>
                <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
                  <span>
                    Comparativo: {dateLabel(d.previousPeriod.from)} a{" "}
                    {dateLabel(d.previousPeriod.to)} · Posição em{" "}
                    {dateLabel(d.referenceDate)}
                  </span>
                  <span>
                    Atualizado em{" "}
                    {new Date(d.generatedAt).toLocaleString("pt-BR", {
                      timeZone: "America/Sao_Paulo",
                    })}
                  </span>
                </div>
                {cards(["revenue", "received", "net", "movement"])}
                <nav
                  aria-label="Blocos do BI"
                  className="flex flex-wrap gap-1 rounded-xl border bg-muted/30 p-1"
                >
                  {[
                    ["overview", "Visão geral"],
                    ["cash", "Caixa e contas"],
                    ["results", "Resultados"],
                    ["recurrence", "Recorrência"],
                    ["commissions", "Comissões"],
                    ["taxes", "Tributos e simulações"],
                    ...(permissions.canViewCrmReports()
                      ? [["commercial", "Comercial"]]
                      : []),
                  ].map(([key, label]) => (
                    <button
                      type="button"
                      key={key}
                      aria-pressed={tab === key}
                      onClick={() => setTab(key)}
                      className={`rounded-lg px-3 py-2 text-sm ${tab === key ? "bg-background font-medium shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                    >
                      {label}
                    </button>
                  ))}
                </nav>
                {tab === "commercial" && permissions.canViewCrmReports() && (
                  <CommercialOverview workspaceId={workspaceId} />
                )}
                {tab === "overview" && (
                  <>
                    <div className="grid gap-4 xl:grid-cols-2">
                      {line("Receita × despesas dos títulos × lucro", [
                        { key: "revenue", label: "Receita", color: "#3b82f6" },
                        {
                          key: "expenses",
                          label: "Despesas",
                          color: "#e65c6f",
                        },
                        {
                          key: "net",
                          label: "Lucro líquido",
                          color: "#10b981",
                        },
                      ])}
                      {line("Recebimentos × pagamentos", [
                        {
                          key: "received",
                          label: "Recebido",
                          color: "#10b981",
                        },
                        { key: "paid", label: "Pago", color: "#e65c6f" },
                      ])}
                    </div>
                    <section className="rounded-xl border bg-card p-5">
                      <h2 className="mb-4 font-semibold">Pontos de atenção</h2>
                      <div className="grid gap-2 md:grid-cols-2">
                        {d.alerts.map((a) => (
                          <button
                            type="button"
                            key={a.metric}
                            onClick={() => {
                              setDetailDays(90);
                              setMetric(a.metric);
                            }}
                            className="flex items-center justify-between gap-3 rounded-lg border bg-muted/20 p-3 text-left text-sm hover:bg-muted"
                          >
                            <span>
                              {a.label}
                              <small className="mt-1 block text-muted-foreground">
                                {a.count} registros
                              </small>
                            </span>
                            <strong className="shrink-0">
                              {formatMetric(a.metric, a.value)}
                            </strong>
                          </button>
                        ))}
                        {!d.alerts.length && (
                          <p className="text-sm text-muted-foreground">
                            Nenhum alerta para este recorte.
                          </p>
                        )}
                      </div>
                    </section>
                  </>
                )}
                {tab === "cash" && (
                  <>
                    {cards([
                      "paid",
                      "receivable",
                      "payable",
                      "overdueReceivable",
                      "overduePayable",
                    ])}
                    <div className="grid gap-4 xl:grid-cols-2">
                      {line("Entradas previstas × recebidas", [
                        {
                          key: "expectedIncome",
                          label: "Títulos por vencimento",
                          color: "#94a3b8",
                        },
                        {
                          key: "received",
                          label: "Baixas recebidas",
                          color: "#10b981",
                        },
                      ])}
                      {line("Saídas previstas × pagas", [
                        {
                          key: "expectedExpense",
                          label: "Títulos por vencimento",
                          color: "#94a3b8",
                        },
                        {
                          key: "paid",
                          label: "Baixas pagas",
                          color: "#e65c6f",
                        },
                      ])}
                      <Breakdown
                        title="Recebíveis por atraso — saldo na referência"
                        rows={d.aging}
                      />
                      <section className="rounded-xl border bg-card p-5">
                        <h2 className="font-semibold">
                          Projeção de movimento líquido
                        </h2>
                        <p className="my-3 text-xs text-muted-foreground">
                          Títulos em aberto + ciclos habilitados ainda não
                          emitidos. Principal, sem encargos futuros. Vencidos
                          ficam fora desta projeção. Não é saldo bancário.
                        </p>
                        <div className="space-y-3">
                          {d.projection.map((p) => (
                            <button
                              type="button"
                              key={p.days}
                              onClick={() => {
                                setDetailDays(p.days);
                                setMetric("projection");
                              }}
                              className="block w-full rounded-lg border p-3 text-left"
                            >
                              <span className="flex justify-between gap-2 font-medium">
                                <span>{p.days} dias</span>
                                <span
                                  className={
                                    p.net < 0 ? "text-destructive" : ""
                                  }
                                >
                                  {money(p.net)}
                                </span>
                              </span>
                              <span className="mt-1 block text-xs text-muted-foreground">
                                Entradas {money(p.income)} · saídas{" "}
                                {money(p.expense)}
                              </span>
                            </button>
                          ))}
                        </div>
                      </section>
                    </div>
                  </>
                )}
                {tab === "results" && (
                  <>
                    {cards([
                      "expenses",
                      "gross",
                      "grossMargin",
                      "netMargin",
                      "presumed",
                      "unclassified",
                    ])}
                    <div className="grid gap-4 xl:grid-cols-2">
                      <Breakdown
                        title="Composição gerencial das despesas"
                        rows={d.composition}
                      />
                      <Breakdown
                        title="Formação do resultado — valores assinados"
                        rows={d.waterfall}
                      />
                    </div>
                    <section className="rounded-xl border bg-card p-5">
                      <h2 className="mb-3 font-semibold">
                        Recorte de despesas
                      </h2>
                      <p className="mb-4 text-xs text-muted-foreground">
                        Somente este bloco aplica categoria, colaborador,
                        vínculo e classificação. Inclui títulos de comissão
                        emitidos; não é o demonstrativo de lucro.
                      </p>
                      {cards(["expenseSlice"])}
                      <div className="mt-4 grid gap-4 xl:grid-cols-2">
                        <Breakdown
                          title="Categorias do recorte"
                          rows={d.expenseCategories}
                          onSelect={(categoryId) =>
                            apply({
                              ...filters,
                              categoryId,
                              subcategoryId: undefined,
                            })
                          }
                        />
                        <Breakdown
                          title="PJ / Freelance / CLT"
                          rows={d.labor}
                        />
                      </div>
                    </section>
                  </>
                )}
                {tab === "recurrence" && (
                  <>
                    {cards(["mrr", "contracts", "expiry", "disabledBilling"])}
                    {line(
                      "Evolução do MRR — receita contratada equivalente mensal",
                      [{ key: "mrr", label: "MRR", color: "#8b5cf6" }],
                    )}
                    <div className="rounded-xl border bg-card p-5">
                      <p className="text-sm text-muted-foreground">
                        MRR não representa caixa. Histórico sem versões
                        suficientes é sinalizado. As faixas abaixo são contagens
                        acumuladas.
                      </p>
                      <div className="mt-4 flex flex-wrap gap-3">
                        {[30, 60, 90].map((days) => (
                          <button
                            type="button"
                            key={days}
                            className="rounded-lg border px-4 py-3"
                            onClick={() => {
                              setDetailDays(days);
                              setMetric("expiry");
                            }}
                          >
                            Até {days} dias:{" "}
                            {d.expiryCounts?.[
                              String(days) as "30" | "60" | "90"
                            ] ?? 0}
                          </button>
                        ))}
                      </div>
                      <Link
                        className="mt-4 inline-block text-sm text-primary hover:underline"
                        to="/dashboard/workspace/$workspaceId/recurrence"
                      >
                        Abrir contratos e recorrência →
                      </Link>
                    </div>
                  </>
                )}
                {tab === "commissions" && (
                  <>
                    {cards([
                      "commission",
                      "availableCommission",
                      "commissionOpen",
                      "commissionPaid",
                      "commissionExcess",
                    ])}
                    <p className="text-sm text-muted-foreground">
                      Apuração do período; disponibilidade e emissão a maior
                      acumuladas até o fim do período. Pagamento por baixa.
                      Valores disponíveis podem exigir conferência antes de
                      emitir.
                    </p>
                    <Link
                      className="text-sm text-primary hover:underline"
                      to="/dashboard/workspace/$workspaceId/performance"
                    >
                      Abrir comissões e resultados →
                    </Link>
                  </>
                )}
                {tab === "taxes" && (
                  <>
                    {cards([
                      "tax",
                      "fee",
                      "taxPaid",
                      "feePaid",
                      "taxOpen",
                      "feeOpen",
                    ])}
                    <section className="rounded-xl border border-dashed bg-card p-5">
                      <h2 className="font-semibold">
                        Simulações — cenários independentes
                      </h2>
                      <p className="my-3 text-sm text-muted-foreground">
                        Não compõem faturamento, lucro ou caixa. Cliente e
                        filtros de despesas/contratos não se aplicam aqui.
                      </p>
                      {cards(["simulation"])}
                      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        {[
                          [
                            "Bruto simulado",
                            d.simulationSummary.simulatedGrossCents,
                          ],
                          [
                            "Líquido simulado",
                            d.simulationSummary.simulatedNetCents,
                          ],
                          [
                            "Impostos simulados",
                            d.simulationSummary.simulatedTaxCents,
                          ],
                          [
                            "Taxas simuladas",
                            d.simulationSummary.simulatedFeeCents,
                          ],
                        ].map(([label, value]) => (
                          <div key={String(label)}>
                            <p className="text-xs text-muted-foreground">
                              {label}
                            </p>
                            <strong className="mt-1 block tabular-nums">
                              {money(Number(value))}
                            </strong>
                          </div>
                        ))}
                      </div>
                      <Link
                        className="mt-4 inline-block text-sm text-primary hover:underline"
                        to="/dashboard/workspace/$workspaceId/taxes"
                      >
                        Abrir calculadora e histórico →
                      </Link>
                    </section>
                  </>
                )}
                {["overview", "results", "commissions"].includes(tab) && (
                  <section className="rounded-xl border bg-card p-5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <h2 className="font-semibold">Rankings financeiros</h2>
                      <label className="flex items-center gap-2 text-sm">
                        Ordenar por
                        <select
                          aria-label="Ordenação dos rankings"
                          className={selectClass}
                          value={filters.ranking ?? "revenue"}
                          onChange={(event) =>
                            apply({
                              ...filters,
                              ranking: event.target
                                .value as BiFilters["ranking"],
                            })
                          }
                        >
                          <option value="revenue">Receita</option>
                          <option value="result">Resultado vinculado</option>
                          <option value="overdue">Saldo vencido</option>
                          <option value="commission">Comissões</option>
                        </select>
                      </label>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      10 maiores de cada dimensão. Todos os grupos estão no
                      Excel. Resultado vinculado sem rateio de custos gerais;
                      “Sem vínculo” concentra registros não associados.
                    </p>
                    <div className="mt-5 grid min-w-0 gap-6 xl:grid-cols-3">
                      {(
                        [
                          ["services", "Serviços", "serviceId"],
                          ["companies", "Clientes", "companyId"],
                          ["sellers", "Vendedores", "sellerId"],
                        ] as const
                      ).map(([key, title, filterKey]) => (
                        <div key={key} className="min-w-0">
                          <h3 className="mb-3 text-sm font-semibold">
                            {title}
                          </h3>
                          <div className="space-y-2">
                            {d.rankings[key].map((r, i) => (
                              <div
                                className="rounded-lg border p-3 text-sm"
                                key={r.id || "none"}
                              >
                                <button
                                  type="button"
                                  disabled={!r.id}
                                  className="flex w-full items-start justify-between gap-2 text-left hover:text-primary disabled:hover:text-foreground"
                                  onClick={() =>
                                    apply({ ...filters, [filterKey]: r.id })
                                  }
                                >
                                  <span className="min-w-0 break-words">
                                    <small className="mr-2 text-muted-foreground">
                                      {i + 1}
                                    </small>
                                    {r.name}
                                  </span>
                                  <strong className="shrink-0 tabular-nums">
                                    {money(r.revenue)}
                                  </strong>
                                </button>
                                <p className="mt-1 text-xs text-muted-foreground">
                                  Resultado {money(r.result)} · vencido{" "}
                                  {money(r.overdue)}
                                </p>
                                {key === "sellers" && (
                                  <p className="text-xs text-muted-foreground">
                                    Comissões {money(r.commission)}
                                  </p>
                                )}
                              </div>
                            ))}
                            {!d.rankings[key].length && (
                              <p className="text-sm text-muted-foreground">
                                Sem dados.
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                )}
                <details className="rounded-xl border p-4 text-sm">
                  <summary className="cursor-pointer font-medium">
                    Como interpretar os números
                  </summary>
                  <ul className="mt-3 list-disc space-y-2 pl-5 text-xs text-muted-foreground">
                    {d.warnings.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                </details>
              </>
            )}
          </>
        )}
        {metric && enabled && (
          <BiDetail
            key={`${metric}-${detailDays}-${JSON.stringify(filters)}`}
            workspaceId={workspaceId}
            filters={filters}
            metric={metric}
            days={detailDays}
            onClose={() => setMetric(null)}
            canSettle={permissions.canSettleFinance()}
            canUpdate={permissions.canUpdateFinance()}
          />
        )}
      </div>
    </WorkspaceLayout>
  );
}
