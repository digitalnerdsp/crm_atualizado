import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import WorkspaceLayout from "@/components/common/workspace-layout";
import { EntryDetail } from "@/components/finance/entry-detail";
import { CaseDialog } from "@/components/finance/portfolio/case-dialog";
import { DraftEditor } from "@/components/finance/portfolio/draft-dialog";
import {
  draftStatuses,
  hours,
  modes,
  origins,
  statuses,
} from "@/components/finance/portfolio/shared";
import {
  CostEditor,
  RateEditor,
  SiteEditor,
} from "@/components/finance/portfolio/site-dialogs";
import {
  dateLabel,
  Field,
  Modal,
  money,
  today,
} from "@/components/finance/shared";
import PageTitle from "@/components/page-title";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTab } from "@/components/ui/tabs";
import { getMetadata } from "@/fetchers/finance";
import { getPerformanceEntry } from "@/fetchers/finance/performance";
import {
  downloadPortfolio,
  getPortfolio,
  getPortfolioMeta,
  type Portfolio,
  type PortfolioFilters,
  type QueueRow,
  type Site,
} from "@/fetchers/finance/portfolio";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import { toast } from "@/lib/toast";

const defaults = (): PortfolioFilters => ({
  from: `${today().slice(0, 7)}-01`,
  to: today(),
  horizon: "90",
});
export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/workspace/$workspaceId/portfolio",
)({
  validateSearch: (s: Record<string, unknown>): PortfolioFilters => {
    const f: Record<string, string> = { ...defaults() };
    for (const key of [
      "from",
      "to",
      "companyId",
      "ownerId",
      "kind",
      "status",
      "horizon",
    ])
      if (typeof s[key] === "string" && s[key]) f[key] = String(s[key]);
    return f as PortfolioFilters;
  },
  component: Page,
});
function Page() {
  const { workspaceId } = Route.useParams();
  return <PortfolioPage key={workspaceId} workspaceId={workspaceId} />;
}
function PortfolioPage({ workspaceId }: { workspaceId: string }) {
  const f = Route.useSearch();
  const navigate = Route.useNavigate();
  const p = useWorkspacePermission();
  const enabled = !p.isCheckingPermissions && p.canViewFinance();
  const qc = useQueryClient();
  const [tab, setTab] = useState("queue");
  const [page, setPage] = useState(1);
  const [row, setRow] = useState<QueueRow | null>(null);
  const [editSite, setEditSite] = useState<Site | null | "new">(null);
  const [cost, setCost] = useState<{
    site: Site;
    mode: "entry" | "worker";
  } | null>(null);
  const [rate, setRate] = useState(false);
  const [draft, setDraft] = useState<
    Portfolio["drafts"][number] | null | "new"
  >(null);
  const [approve, setApprove] = useState(false);
  const [entry, setEntry] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const report = useQuery({
    queryKey: ["finance", workspaceId, "portfolio", f, page],
    queryFn: () => getPortfolio(workspaceId, f, page),
    enabled,
  });
  const base = useQuery({
    queryKey: ["finance", workspaceId, "metadata"],
    queryFn: () => getMetadata(workspaceId),
    enabled,
  });
  const meta = useQuery({
    queryKey: ["finance", workspaceId, "portfolio-meta"],
    queryFn: () => getPortfolioMeta(workspaceId),
    enabled: enabled && p.canManageSiteCosts(),
  });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["finance", workspaceId] });
  };
  const apply = (next: PortfolioFilters) => {
    setPage(1);
    navigate({ search: next });
  };
  const d = report.data;
  const exportFile = async (format: "xlsx" | "pdf") => {
    setBusy(true);
    try {
      await downloadPortfolio(workspaceId, f, format);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const metric = (label: string, value: string, detail: string) => (
    <StatCard label={label} value={value} detail={detail} />
  );
  return (
    <WorkspaceLayout title="Gestão da carteira">
      <PageTitle title="Gestão da carteira" />
      <div className="mx-auto w-full max-w-[1500px] space-y-5 p-4 md:p-6">
        <PageHeader
          eyebrow="Cobranças · renovações · rentabilidade"
          title="Gestão da carteira"
          description="Acompanhe compromissos e decisões por cliente. Horas de produção são contabilizadas somente nos projetos de sites vinculados."
          actions={
            enabled && p.canExportFinance() ? (
              <>
                <Button
                  variant="outline"
                  disabled={busy || !d}
                  onClick={() => exportFile("xlsx")}
                >
                  Excel
                </Button>
                <Button
                  variant="outline"
                  disabled={busy || !d}
                  onClick={() => exportFile("pdf")}
                >
                  PDF
                </Button>
              </>
            ) : null
          }
        />
        {p.isCheckingPermissions ? (
          <p>Verificando acesso…</p>
        ) : !enabled ? (
          <p role="alert">Você não tem permissão financeira.</p>
        ) : (
          <>
            <form
              key={JSON.stringify(f)}
              className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4"
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                const next: Record<string, string> = {};
                for (const [key, value] of fd.entries())
                  if (value) next[key] = String(value);
                apply(next as PortfolioFilters);
              }}
            >
              <Field label="Resultado — de">
                <Input required type="date" name="from" defaultValue={f.from} />
              </Field>
              <Field label="Resultado — até">
                <Input required type="date" name="to" defaultValue={f.to} />
              </Field>
              <Field label="Cliente">
                <NativeSelect name="companyId" defaultValue={f.companyId ?? ""}>
                  <option value="">Todos</option>
                  {base.data?.companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="Antecedência da fila">
                <NativeSelect name="horizon" defaultValue={f.horizon ?? "90"}>
                  {[30, 60, 90].map((n) => (
                    <option key={n} value={n}>
                      Até {n} dias + vencidos
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="Origem da fila">
                <NativeSelect name="kind" defaultValue={f.kind ?? ""}>
                  <option value="">Todas</option>
                  {Object.entries(origins).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="Situação do acompanhamento">
                <NativeSelect name="status" defaultValue={f.status ?? ""}>
                  <option value="">Todas</option>
                  {Object.entries(statuses).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="Responsável pela fila">
                <NativeSelect name="ownerId" defaultValue={f.ownerId ?? ""}>
                  <option value="">Todos</option>
                  {base.data?.sellers.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <div className="flex items-end gap-2">
                <Button type="submit">Aplicar filtros</Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => apply(defaults())}
                >
                  Limpar
                </Button>
              </div>
            </form>
            <p className="text-xs text-muted-foreground">
              A fila usa a situação atual em{" "}
              {dateLabel(d?.referenceDate ?? today())}. O período filtra os
              resultados por competência e horas pela data de início do
              apontamento. Responsável, origem, situação e antecedência filtram
              somente a fila.
            </p>
            {(report.isPending || report.isFetching) && (
              <p className="text-sm text-muted-foreground">
                Atualizando carteira…
              </p>
            )}
            {report.isError && <p role="alert">{report.error.message}</p>}
            {meta.isError && <p role="alert">{meta.error.message}</p>}
            {d && (
              <>
                <div className="overflow-x-auto">
                  <Tabs
                    value={tab}
                    onValueChange={(value) => {
                      setPage(1);
                      setTab(String(value));
                    }}
                  >
                    <TabsList>
                      {[
                        ["queue", "Cobranças e renovações"],
                        ["history", "Histórico da carteira"],
                        ["clients", "Rentabilidade por cliente"],
                        ["sites", "Sites e colaboradores"],
                        ["drafts", "Minutas e aprovações"],
                        ["costs", "Custos por hora"],
                      ]
                        .filter(
                          ([key]) => key !== "costs" || p.canManageSiteCosts(),
                        )
                        .map(([key, label]) => (
                          <TabsTab key={key} value={key}>
                            {label}
                          </TabsTab>
                        ))}
                    </TabsList>
                  </Tabs>
                </div>
                {tab === "queue" && (
                  <section className="min-w-0 rounded-xl border bg-card p-4">
                    <h2 className="mb-4 font-semibold">
                      Fila de acompanhamento
                    </h2>
                    <div className="overflow-x-auto">
                      <Table className="w-full text-sm">
                        <TableHeader>
                          <TableRow className="border-b text-left">
                            {[
                              "Cliente / origem",
                              "Data",
                              "Valor",
                              "Acompanhamento",
                              "Próxima ação",
                              "",
                            ].map((h) => (
                              <TableHead key={h} className="p-2">
                                {h}
                              </TableHead>
                            ))}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {d.queue.map((r) => (
                            <TableRow
                              key={`${r.sourceKind}-${r.sourceId}-${r.sourceDate}`}
                              className="border-b"
                            >
                              <TableCell className="min-w-44 p-2">
                                <strong>{r.companyName}</strong>
                                <p className="text-xs text-muted-foreground">
                                  {origins[r.sourceKind]} · {r.title}
                                </p>
                              </TableCell>
                              <TableCell className="whitespace-nowrap p-2">
                                {dateLabel(r.sourceDate)}
                                {r.late && (
                                  <p className="text-xs text-destructive">
                                    Vencido
                                  </p>
                                )}
                              </TableCell>
                              <TableCell className="whitespace-nowrap p-2 tabular-nums">
                                {money(r.amountCents)}
                              </TableCell>
                              <TableCell className="p-2">
                                {statuses[r.status]}
                                {r.brokenPromise && (
                                  <p className="text-xs text-destructive">
                                    Promessa vencida
                                  </p>
                                )}
                              </TableCell>
                              <TableCell className="min-w-36 p-2">
                                {r.follow?.nextAction || "Sem ação definida"}
                                <p
                                  className={`text-xs ${r.actionLate ? "text-destructive" : "text-muted-foreground"}`}
                                >
                                  {r.follow?.nextOn
                                    ? dateLabel(r.follow.nextOn)
                                    : ""}
                                </p>
                              </TableCell>
                              <TableCell className="p-2">
                                <Button
                                  variant="outline"
                                  onClick={() => setRow(r)}
                                >
                                  Acompanhar
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                    {!d.queue.length && (
                      <p className="py-6 text-sm text-muted-foreground">
                        Nenhuma obrigação neste recorte.
                      </p>
                    )}
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
                      <span>
                        {d.queueTotal} itens · página {page}
                      </span>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          disabled={page === 1}
                          onClick={() => setPage(page - 1)}
                        >
                          Anterior
                        </Button>
                        <Button
                          variant="outline"
                          disabled={page * 25 >= d.queueTotal}
                          onClick={() => setPage(page + 1)}
                        >
                          Próxima
                        </Button>
                      </div>
                    </div>
                    <p className="mt-3 text-xs text-muted-foreground">
                      Concluir o acompanhamento não quita a conta nem renova a
                      origem. Uma nova data de renovação inicia outro
                      acompanhamento.
                    </p>
                  </section>
                )}
                {tab === "history" && (
                  <section className="rounded-xl border bg-card p-5">
                    <h2 className="font-semibold">Histórico da carteira</h2>
                    <p className="my-3 text-xs text-muted-foreground">
                      Inclui acompanhamentos cuja obrigação foi quitada,
                      renovada ou mudou de data. Histórico completo por
                      acompanhamento ao abrir.
                    </p>
                    <div className="space-y-2">
                      {d.caseHistory.map((r) => (
                        <button
                          key={r.id}
                          type="button"
                          className="flex w-full flex-wrap justify-between gap-3 rounded-lg border p-3 text-left text-sm"
                          onClick={() => setRow(r)}
                        >
                          <span>
                            {r.companyName} · {origins[r.sourceKind]} ·{" "}
                            {dateLabel(r.sourceDate)}
                          </span>
                          <span>
                            {statuses[r.status]} ·{" "}
                            {r.resolved
                              ? "Fora da fila atual"
                              : "Obrigação pendente"}
                          </span>
                        </button>
                      ))}
                    </div>
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
                      <span>
                        {d.historyTotal} acompanhamentos · página {page}
                      </span>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          disabled={page === 1}
                          onClick={() => setPage(page - 1)}
                        >
                          Anterior
                        </Button>
                        <Button
                          variant="outline"
                          disabled={page * 25 >= d.historyTotal}
                          onClick={() => setPage(page + 1)}
                        >
                          Próxima
                        </Button>
                      </div>
                    </div>
                  </section>
                )}
                {tab === "clients" && (
                  <section className="min-w-0 rounded-xl border bg-card p-5">
                    <h2 className="font-semibold">
                      Rentabilidade financeira por cliente
                    </h2>
                    <p className="my-3 text-xs text-muted-foreground">
                      Receita menos custos, despesas e comissões vinculadas.
                      Custos de horas ficam separados; tráfego pago e social
                      media não dependem de apontamentos. Clique em Analisar
                      para filtrar toda a carteira pelo cliente.
                    </p>
                    <div className="overflow-x-auto">
                      <Table className="w-full text-sm">
                        <TableHeader>
                          <TableRow className="border-b text-left">
                            {[
                              "Cliente",
                              "Receita",
                              "Resultado",
                              "Margem",
                              "Vencido",
                              "Estimativa sites",
                              "Horas sites",
                              "",
                            ].map((h) => (
                              <TableHead key={h} className="p-2">
                                {h}
                              </TableHead>
                            ))}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {d.companies.map((c) => (
                            <TableRow key={c.id} className="border-b">
                              <TableCell className="min-w-40 p-2 font-medium">
                                {c.name}
                              </TableCell>
                              <TableCell className="whitespace-nowrap p-2">
                                {money(c.revenueCents)}
                              </TableCell>
                              <TableCell
                                className={`whitespace-nowrap p-2 ${c.resultCents < 0 ? "text-destructive" : ""}`}
                              >
                                {money(c.resultCents)}
                                <p className="text-xs text-muted-foreground">
                                  Anterior {money(c.previousResultCents)}
                                </p>
                              </TableCell>
                              <TableCell className="p-2">
                                {c.margin === null
                                  ? "N/A"
                                  : `${c.margin.toFixed(1)}%`}
                              </TableCell>
                              <TableCell className="whitespace-nowrap p-2">
                                {money(c.overdueCents)}
                              </TableCell>
                              <TableCell className="whitespace-nowrap p-2">
                                {money(c.estimatedLaborCents)}
                                {c.missingSeconds > 0 && (
                                  <p className="text-xs text-destructive">
                                    {hours(c.missingSeconds)} sem custo
                                  </p>
                                )}
                              </TableCell>
                              <TableCell className="p-2">
                                {hours(c.seconds)}
                              </TableCell>
                              <TableCell className="p-2">
                                <Button
                                  variant="outline"
                                  onClick={() => {
                                    apply({ ...f, companyId: c.id });
                                    setTab("dashboard");
                                  }}
                                >
                                  Analisar
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                    {!d.companies.length && (
                      <p className="py-5 text-sm text-muted-foreground">
                        Nenhum resultado vinculado no período.
                      </p>
                    )}
                    <p className="mt-4 text-xs text-muted-foreground">
                      Despesas sem cliente no período:{" "}
                      {money(d.unassignedExpenseCents)}. Não são rateadas.
                      Valores estimados não são contas a pagar.
                    </p>
                  </section>
                )}
                {tab === "sites" && (
                  <div className="space-y-4">
                    <div className="flex flex-wrap justify-between gap-3">
                      <h2 className="font-semibold">Projetos de sites</h2>
                      {p.canManageSiteCosts() && meta.data && (
                        <Button onClick={() => setEditSite("new")}>
                          Novo projeto de site
                        </Button>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Vincule os cards pelo painel de detalhes da tarefa, após
                      indicar o cliente. Os quadros de produção permanecem
                      independentes. O financeiro consulta os consolidados, sem
                      acessar os cards.
                    </p>
                    {d.sites.map((site) => (
                      <section
                        key={site.id}
                        className="min-w-0 space-y-4 rounded-xl border bg-card p-5"
                      >
                        <div className="flex flex-wrap justify-between gap-3">
                          <div>
                            <h3 className="font-semibold">{site.name}</h3>
                            <p className="text-xs text-muted-foreground">
                              {site.companyName} ·{" "}
                              {site.status === "active"
                                ? "Em produção"
                                : "Concluído"}{" "}
                              · {site.taskCount} cards vinculados
                            </p>
                          </div>
                          {p.canManageSiteCosts() && meta.data && (
                            <div className="flex flex-wrap gap-2">
                              <Button
                                variant="outline"
                                onClick={() => setEditSite(site)}
                              >
                                Configurar site
                              </Button>
                              <Button
                                variant="outline"
                                onClick={() =>
                                  setCost({ site, mode: "worker" })
                                }
                              >
                                Custo do colaborador
                              </Button>
                              <Button
                                variant="outline"
                                onClick={() => setCost({ site, mode: "entry" })}
                              >
                                Vincular lançamento
                              </Button>
                            </div>
                          )}
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                          {metric(
                            "Resultado financeiro — período",
                            money(site.finance.netProfitCents),
                            "Somente títulos vinculados ao site",
                          )}
                          {metric(
                            "Resultado financeiro — total",
                            money(site.totalFinancial.netProfitCents),
                            "Todos os títulos do projeto já registrados",
                          )}
                          {metric(
                            "Execução estimada — período",
                            money(site.estimatedLaborCents),
                            `Total estimado ${money(site.totalEstimatedLaborCents)}`,
                          )}
                          {metric(
                            "Planejado × realizado",
                            `${hours(site.estimateMinutes * 60)} / ${hours(site.seconds)}`,
                            `${site.running} apontamentos em andamento; não custeados`,
                          )}
                        </div>
                        <p className="text-sm">
                          Cenário com estimativas não conciliadas:{" "}
                          <strong>
                            {site.scenarioCents === null
                              ? "Não disponível / desativado"
                              : money(site.scenarioCents)}
                          </strong>{" "}
                          · total do projeto:{" "}
                          <strong>
                            {site.totalScenarioCents === null
                              ? "Não disponível / desativado"
                              : money(site.totalScenarioCents)}
                          </strong>
                        </p>
                        {(site.missingSeconds > 0 || site.invalidLinks > 0) && (
                          <p role="alert" className="text-sm text-destructive">
                            Conferir {hours(site.missingSeconds)} sem base de
                            custo e {site.invalidLinks} vínculos financeiros
                            inconsistentes.
                          </p>
                        )}
                        <div className="overflow-x-auto">
                          <Table className="w-full text-sm">
                            <TableHeader>
                              <TableRow className="border-b text-left">
                                {[
                                  "Colaborador",
                                  "Modelo",
                                  "Horas período",
                                  "Horas totais",
                                  "Custo estimado período",
                                  "Custo já lançado",
                                  "Conferência",
                                ].map((h) => (
                                  <TableHead key={h} className="p-2">
                                    {h}
                                  </TableHead>
                                ))}
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {site.workers.map((w) => (
                                <TableRow
                                  className="border-b"
                                  key={w.userId ?? "unknown"}
                                >
                                  <TableCell className="p-2">
                                    {w.name}
                                  </TableCell>
                                  <TableCell className="p-2">
                                    {w.mode === "unconfigured"
                                      ? "Não configurado"
                                      : modes[w.mode]}
                                  </TableCell>
                                  <TableCell className="p-2">
                                    {hours(w.seconds)}
                                    <p className="text-xs text-muted-foreground">
                                      Planejado: {hours(w.estimateMinutes * 60)}
                                    </p>
                                  </TableCell>
                                  <TableCell className="p-2">
                                    {hours(w.totalSeconds)}
                                  </TableCell>
                                  <TableCell className="whitespace-nowrap p-2">
                                    {money(w.estimatedCents)}
                                  </TableCell>
                                  <TableCell className="whitespace-nowrap p-2">
                                    {w.sourceEntryId ? (
                                      <button
                                        type="button"
                                        className="text-primary hover:underline"
                                        onClick={() =>
                                          setEntry(w.sourceEntryId)
                                        }
                                      >
                                        {money(w.bookedCents)}
                                      </button>
                                    ) : (
                                      "Sem origem"
                                    )}
                                  </TableCell>
                                  <TableCell className="p-2 text-xs">
                                    {w.missingSeconds
                                      ? `${hours(w.missingSeconds)} sem taxa/acordo`
                                      : w.needsReconciliation
                                        ? "Origem cancelada ou alterada"
                                        : w.booked
                                          ? "Conta já representa o custo; sem nova dedução"
                                          : "Estimativa separada"}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                        {site.tasks.length > 0 && (
                          <details>
                            <summary className="cursor-pointer text-sm">
                              Cards e colaboradores da produção
                            </summary>
                            <div className="mt-3 space-y-2">
                              {site.tasks.map((t) => (
                                <div
                                  key={t.taskId}
                                  className="rounded-lg border p-3 text-sm"
                                >
                                  <Link
                                    className="text-primary hover:underline"
                                    to="/dashboard/workspace/$workspaceId/project/$projectId/task/$taskId"
                                    params={{
                                      workspaceId,
                                      projectId: t.projectId,
                                      taskId: t.taskId,
                                    }}
                                  >
                                    {t.title}
                                  </Link>
                                  <p>
                                    Estimado {hours(t.estimateMinutes * 60)} ·
                                    realizado {hours(t.seconds)} · diferença{" "}
                                    {hours(t.seconds - t.estimateMinutes * 60)}
                                  </p>
                                  {t.contributors.map((u) => (
                                    <p
                                      key={u.userId ?? "unknown"}
                                      className="text-xs text-muted-foreground"
                                    >
                                      {u.name}: {hours(u.seconds)}
                                    </p>
                                  ))}
                                </div>
                              ))}
                            </div>
                          </details>
                        )}
                        <details>
                          <summary className="cursor-pointer text-sm">
                            Lançamentos do site
                          </summary>
                          <div className="mt-2 space-y-1">
                            {site.linkedEntries.map((e) => (
                              <button
                                key={e.id}
                                type="button"
                                className="block text-left text-sm text-primary hover:underline"
                                onClick={() => setEntry(e.id)}
                              >
                                {e.description} · {money(e.amountCents)}{" "}
                                {e.cancelled ? "· cancelado" : ""}
                              </button>
                            ))}
                          </div>
                        </details>
                      </section>
                    ))}
                    {!d.sites.length && (
                      <p className="rounded-xl border p-6 text-sm text-muted-foreground">
                        Cadastre um projeto de site e vincule as tarefas pelo
                        cliente. Nenhum quadro é convertido automaticamente.
                      </p>
                    )}
                  </div>
                )}
                {tab === "costs" && meta.data && (
                  <section className="rounded-xl border bg-card p-5">
                    <div className="flex flex-wrap justify-between gap-3">
                      <h2 className="font-semibold">
                        Vigências de custo por colaborador
                      </h2>
                      <Button onClick={() => setRate(true)}>
                        Nova vigência
                      </Button>
                    </div>
                    <p className="my-3 text-xs text-muted-foreground">
                      A primeira vigência pode informar a base histórica
                      inicial. Depois, alterações são futuras e preservam as
                      taxas anteriores. Registros sem custo não são tratados
                      como custo zero.
                    </p>
                    <div className="space-y-2">
                      {meta.data.rates.map((r) => (
                        <p
                          key={r.id}
                          className="flex flex-wrap justify-between gap-2 rounded-lg border p-3 text-sm"
                        >
                          <span>
                            {meta.data?.members.find((m) => m.id === r.userId)
                              ?.name ?? r.userId}{" "}
                            · desde {dateLabel(r.effectiveOn)}
                          </span>
                          <strong>{money(r.hourlyCents)}/h</strong>
                        </p>
                      ))}
                    </div>
                  </section>
                )}
                {tab === "drafts" && (
                  <section className="rounded-xl border bg-card p-5">
                    <div className="flex flex-wrap justify-between gap-3">
                      <h2 className="font-semibold">
                        Minutas comerciais e jurídicas
                      </h2>
                      {p.canDraftContracts() && (
                        <Button
                          onClick={() => {
                            setApprove(false);
                            setDraft("new");
                          }}
                        >
                          Nova minuta
                        </Button>
                      )}
                    </div>
                    <p className="my-3 text-xs text-muted-foreground">
                      A aprovação é interna, separada da elaboração. Não
                      equivale à assinatura nem ativa ou altera contratos e
                      cobranças automaticamente.
                    </p>
                    <div className="space-y-3">
                      {d.drafts.map((r) => (
                        <div
                          key={r.id}
                          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
                        >
                          <div>
                            <h3 className="text-sm font-medium">{r.title}</h3>
                            <p className="text-xs text-muted-foreground">
                              {base.data?.companies.find(
                                (c) => c.id === r.companyId,
                              )?.name ?? "Cliente"}{" "}
                              · {draftStatuses[r.status]} ·{" "}
                              {money(r.proposedCents)}
                            </p>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              onClick={() => {
                                setApprove(false);
                                setDraft(r);
                              }}
                            >
                              Abrir minuta
                            </Button>
                            {p.canApproveDrafts() &&
                              r.status === "submitted" && (
                                <Button
                                  onClick={() => {
                                    setApprove(true);
                                    setDraft(r);
                                  }}
                                >
                                  Decidir aprovação
                                </Button>
                              )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                )}
                <details className="rounded-xl border p-4">
                  <summary className="cursor-pointer text-sm font-medium">
                    Regras de interpretação e acesso
                  </summary>
                  <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                    Custos e margens são restritos ao financeiro. Cards da
                    produção exibem somente horas e responsáveis. Horas são
                    atribuídas a quem apontou, mesmo após troca do responsável
                    pelo card; registros em andamento não geram custo. Registros
                    fechados usam duração real e taxa vigente na data de início.
                    Preço fechado conta uma vez na data cadastrada. Custos sem
                    cliente não são rateados. O cenário depende de conferência
                    explícita para não repetir despesas já lançadas. O
                    Financeiro/Jurídico não recebe acesso a projetos, tarefas,
                    configurações, estornos, cancelamentos ou aprovação final
                    por padrão.
                  </p>
                </details>
              </>
            )}
          </>
        )}
        {row && (
          <CaseDialog
            workspaceId={workspaceId}
            row={row}
            members={base.data?.sellers ?? []}
            profit={d?.companies.find((c) => c.id === row.companyId)}
            onClose={() => setRow(null)}
          />
        )}
        {editSite && meta.data && (
          <SiteEditor
            workspaceId={workspaceId}
            meta={meta.data}
            site={editSite === "new" ? undefined : editSite}
            onSaved={refresh}
            onClose={() => setEditSite(null)}
          />
        )}
        {rate && meta.data && (
          <RateEditor
            workspaceId={workspaceId}
            meta={meta.data}
            onSaved={refresh}
            onClose={() => setRate(false)}
          />
        )}
        {cost && meta.data && (
          <CostEditor
            workspaceId={workspaceId}
            site={cost.site}
            mode={cost.mode}
            meta={meta.data}
            filters={f}
            onSaved={refresh}
            onClose={() => setCost(null)}
          />
        )}
        {draft && base.data && (
          <DraftEditor
            readOnly={!p.canDraftContracts()}
            workspaceId={workspaceId}
            meta={base.data}
            draft={draft === "new" ? undefined : draft}
            approve={approve}
            onSaved={refresh}
            onClose={() => setDraft(null)}
          />
        )}
        {entry && (
          <LedgerDetail
            workspaceId={workspaceId}
            id={entry}
            onClose={() => setEntry(null)}
          />
        )}
      </div>
    </WorkspaceLayout>
  );
}
function LedgerDetail({
  workspaceId,
  id,
  onClose,
}: {
  workspaceId: string;
  id: string;
  onClose: () => void;
}) {
  const p = useWorkspacePermission();
  const q = useQuery({
    queryKey: ["finance", workspaceId, "entry", id],
    queryFn: () => getPerformanceEntry(workspaceId, id),
  });
  return q.data ? (
    <EntryDetail
      workspaceId={workspaceId}
      entry={q.data}
      canSettle={p.canSettleFinance()}
      canUpdate={p.canUpdateFinance()}
      onClose={onClose}
    />
  ) : (
    <Modal title="Lançamento financeiro" onClose={onClose}>
      <p role={q.isError ? "alert" : undefined}>
        {q.error?.message ?? "Carregando…"}
      </p>
    </Modal>
  );
}
