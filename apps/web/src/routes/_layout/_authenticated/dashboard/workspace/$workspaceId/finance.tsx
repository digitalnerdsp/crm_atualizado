import { createFileRoute } from "@tanstack/react-router";
import { Download, Plus, RefreshCw } from "lucide-react";
import { useState } from "react";
import WorkspaceLayout from "@/components/common/workspace-layout";
import { FinanceDashboardView } from "@/components/finance/dashboard";
import { EntryDetail } from "@/components/finance/entry-detail";
import { EntryForm } from "@/components/finance/entry-form";
import { FinanceSettings } from "@/components/finance/settings";
import {
  dateLabel,
  entryStatus,
  Field,
  money,
  remaining,
  selectClass,
  today,
} from "@/components/finance/shared";
import PageTitle from "@/components/page-title";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@/components/ui/tabs";
import {
  downloadReport,
  type FinanceEntry,
  type FinanceFilters,
} from "@/fetchers/finance";
import { useFinance } from "@/hooks/queries/finance/use-finance";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import { toast } from "@/lib/toast";
export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/workspace/$workspaceId/finance",
)({
  validateSearch: (raw: Record<string, unknown>) => ({
    contractId: typeof raw.contractId === "string" ? raw.contractId : undefined,
  }),
  component: FinancePage,
});
function initialFilters(): FinanceFilters {
  const now = today();
  return { from: `${now.slice(0, 7)}-01`, to: now, dateBasis: "due" };
}
function FinancePage() {
  const { workspaceId } = Route.useParams();
  const { contractId } = Route.useSearch();
  return (
    <FinanceWorkspace
      key={`${workspaceId}:${contractId ?? ""}`}
      workspaceId={workspaceId}
      selectedContract={contractId}
    />
  );
}
function FinanceWorkspace({
  workspaceId,
  selectedContract,
}: {
  workspaceId: string;
  selectedContract?: string;
}) {
  const permissions = useWorkspacePermission();
  const enabled =
    !permissions.isCheckingPermissions && permissions.canViewFinance();
  const [filters, setFilters] = useState<FinanceFilters>(() => ({
    ...initialFilters(),
    contractId: selectedContract,
  }));
  const [page, setPage] = useState(1);
  const [tab, setTab] = useState("dashboard");
  const [form, setForm] = useState<FinanceEntry | "new" | null>(null);
  const [detail, setDetail] = useState<FinanceEntry | null>(null);
  const [exporting, setExporting] = useState(false);
  const queries = useFinance(workspaceId, filters, page, enabled);
  const meta = queries.metadata.data;
  const list = queries.entries.data;
  const set = (key: keyof FinanceFilters, value: string) => {
    setPage(1);
    setFilters((f) => ({
      ...f,
      view: undefined,
      asOf: undefined,
      [key]: value || undefined,
    }));
  };
  const error =
    queries.metadata.error ?? queries.entries.error ?? queries.dashboard.error;
  const exportFile = async (format: "xlsx" | "pdf") => {
    setExporting(true);
    try {
      await downloadReport(workspaceId, filters, format);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setExporting(false);
    }
  };
  return (
    <WorkspaceLayout
      title="Financeiro"
      headerActions={
        enabled && permissions.canCreateFinance() ? (
          <Button size="sm" onClick={() => setForm("new")} disabled={!meta}>
            <Plus className="size-4" />
            Novo lançamento
          </Button>
        ) : null
      }
    >
      <PageTitle title="Financeiro" />
      <div className="mx-auto w-full max-w-7xl space-y-5 p-4 md:p-6">
        <div>
          <h1 className="text-2xl font-semibold">Financeiro</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Acompanhe entradas, saídas e compromissos da empresa.
          </p>
        </div>
        {permissions.isCheckingPermissions ? (
          <p>Verificando acesso…</p>
        ) : !enabled ? (
          <p role="alert">
            Você não tem permissão para acessar o financeiro deste workspace.
          </p>
        ) : (
          <>
            <form
              key={`${filters.from}-${filters.to}-${filters.dateBasis}`}
              className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                const from = String(f.get("from"));
                const to = String(f.get("to"));
                if (
                  from > to ||
                  Date.parse(to) - Date.parse(from) > 730 * 86400000
                ) {
                  toast.error("Selecione um período de até 731 dias.");
                  return;
                }
                setPage(1);
                setFilters((prev) => ({
                  ...prev,
                  from,
                  to,
                  search: String(f.get("search")) || undefined,
                }));
              }}
            >
              <Field label="De">
                <Input
                  type="date"
                  name="from"
                  required
                  defaultValue={filters.from}
                />
              </Field>
              <Field label="Até">
                <Input
                  type="date"
                  name="to"
                  required
                  defaultValue={filters.to}
                />
              </Field>
              <Field label="Base de datas">
                <select
                  className={selectClass}
                  value={filters.dateBasis}
                  onChange={(e) => set("dateBasis", e.target.value)}
                >
                  <option value="due">Vencimento</option>
                  <option value="competence">Competência</option>
                  <option value="settlement">Data da baixa</option>
                </select>
              </Field>
              <Field label="Tipo">
                <select
                  className={selectClass}
                  value={filters.direction ?? ""}
                  onChange={(e) => set("direction", e.target.value)}
                >
                  <option value="">Pagar e receber</option>
                  <option value="payable">A pagar</option>
                  <option value="receivable">A receber</option>
                </select>
              </Field>
              <details className="sm:col-span-2 lg:col-span-4">
                <summary className="cursor-pointer text-sm font-medium">
                  Filtros avançados e pesquisa
                </summary>
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <Field label="Situação">
                    <select
                      className={selectClass}
                      value={filters.status ?? ""}
                      onChange={(e) => set("status", e.target.value)}
                    >
                      {Object.entries({
                        "": "Todas",
                        open: "Em aberto",
                        partial: "Parcial",
                        settled: "Liquidado",
                        overdue: "Vencido",
                        cancelled: "Cancelado",
                      }).map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Categoria">
                    <select
                      className={selectClass}
                      value={filters.categoryId ?? ""}
                      onChange={(e) => {
                        set("categoryId", e.target.value);
                        set("subcategoryId", "");
                      }}
                    >
                      <option value="">Todas</option>
                      {meta?.categories
                        .filter((c) => !c.parentId)
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                    </select>
                  </Field>
                  <Field label="Subcategoria">
                    <select
                      className={selectClass}
                      value={filters.subcategoryId ?? ""}
                      onChange={(e) => set("subcategoryId", e.target.value)}
                    >
                      <option value="">Todas</option>
                      {meta?.categories
                        .filter(
                          (c) =>
                            c.parentId &&
                            (!filters.categoryId ||
                              c.parentId === filters.categoryId),
                        )
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                    </select>
                  </Field>
                  <Field label="Vínculo do colaborador">
                    <select
                      className={selectClass}
                      value={filters.laborType ?? ""}
                      onChange={(e) => set("laborType", e.target.value)}
                    >
                      <option value="">Todos</option>
                      <option value="pj">PJ</option>
                      <option value="freelance">Freelance</option>
                      <option value="clt">CLT</option>
                    </select>
                  </Field>
                  <Field label="Favorecido ou colaborador">
                    <select
                      className={selectClass}
                      value={filters.partyId ?? ""}
                      onChange={(e) => set("partyId", e.target.value)}
                    >
                      <option value="">Todos</option>
                      {meta?.parties.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Cliente">
                    <select
                      className={selectClass}
                      value={filters.companyId ?? ""}
                      onChange={(e) => set("companyId", e.target.value)}
                    >
                      <option value="">Todos</option>
                      {meta?.companies.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Serviço">
                    <select
                      className={selectClass}
                      value={filters.serviceId ?? ""}
                      onChange={(e) => set("serviceId", e.target.value)}
                    >
                      <option value="">Todos</option>
                      {meta?.services.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Vendedor">
                    <select
                      className={selectClass}
                      value={filters.sellerId ?? ""}
                      onChange={(e) => set("sellerId", e.target.value)}
                    >
                      <option value="">Todos</option>
                      {meta?.sellers.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Natureza">
                    <select
                      className={selectClass}
                      value={filters.kind ?? ""}
                      onChange={(e) => set("kind", e.target.value)}
                    >
                      <option value="">Todas</option>
                      <option value="operating">Operacional</option>
                      <option value="opening">Saldo inicial</option>
                    </select>
                  </Field>
                  <Field label="Contrato">
                    <select
                      className={selectClass}
                      value={filters.contractId ?? ""}
                      onChange={(e) => set("contractId", e.target.value)}
                    >
                      <option value="">Todos</option>
                      {meta?.contracts.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Pesquisar">
                    <Input
                      name="search"
                      placeholder="Descrição ou favorecido"
                      defaultValue={filters.search}
                      maxLength={240}
                    />
                  </Field>
                </div>
              </details>
              <div className="flex flex-wrap items-end gap-2 sm:col-span-2 lg:col-span-4">
                <Button type="submit">Aplicar período e busca</Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setPage(1);
                    setFilters(initialFilters());
                  }}
                >
                  Limpar filtros
                </Button>
                {permissions.canExportFinance() && (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={exporting || !list}
                      onClick={() => exportFile("xlsx")}
                    >
                      <Download className="size-4" />
                      Excel
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={exporting || !list}
                      onClick={() => exportFile("pdf")}
                    >
                      <Download className="size-4" />
                      PDF
                    </Button>
                  </>
                )}
              </div>
            </form>
            {error && (
              <div
                role="alert"
                className="flex flex-wrap items-center gap-3 rounded-lg border border-destructive p-4 text-sm"
              >
                <span>{error.message}</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    queries.entries.refetch();
                    queries.dashboard.refetch();
                    queries.metadata.refetch();
                  }}
                >
                  <RefreshCw className="size-4" />
                  Tentar novamente
                </Button>
              </div>
            )}
            <Tabs value={tab} onValueChange={(value) => setTab(String(value))}>
              <TabsList>
                <TabsTab value="dashboard">Resumo</TabsTab>
                <TabsTab value="entries">Lançamentos</TabsTab>
                {permissions.canManageFinance() && (
                  <TabsTab value="settings">Cadastros</TabsTab>
                )}
              </TabsList>
              <TabsPanel value="dashboard">
                {queries.dashboard.isLoading ? (
                  <p className="py-10 text-sm">Carregando indicadores…</p>
                ) : (
                  queries.dashboard.data && (
                    <FinanceDashboardView
                      data={queries.dashboard.data}
                      onInspect={(extra) => {
                        setFilters((f) => ({ ...f, ...extra }));
                        setPage(1);
                        setTab("entries");
                      }}
                    />
                  )
                )}
              </TabsPanel>
              <TabsPanel value="entries">
                <section className="space-y-4 rounded-xl border bg-card p-4">
                  {filters.view && (
                    <p className="text-sm text-muted-foreground">
                      Detalhamento de{" "}
                      {filters.view === "overdue"
                        ? "vencidos"
                        : "saldos em aberto"}{" "}
                      até {dateLabel(filters.to)}, considerando baixas até{" "}
                      {dateLabel(filters.asOf ?? today())}. O início do período
                      não limita esta posição.{" "}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setFilters((f) => ({
                            ...f,
                            view: undefined,
                            asOf: undefined,
                          }));
                          setPage(1);
                        }}
                      >
                        Voltar à consulta por período
                      </Button>
                    </p>
                  )}
                  <div className="flex flex-wrap justify-between gap-2">
                    <h2 className="font-semibold">
                      {list?.total ?? 0} lançamentos
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      Total sem cancelados{" "}
                      {money(list?.totals.amountCents ?? 0)} · Em aberto{" "}
                      {money(list?.totals.remainingCents ?? 0)}
                    </p>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Recebido no período {money(list?.totals.receivedCents ?? 0)}{" "}
                    · Pago no período {money(list?.totals.paidCents ?? 0)} ·
                    Movimento líquido{" "}
                    {money(
                      (list?.totals.receivedCents ?? 0) -
                        (list?.totals.paidCents ?? 0),
                    )}
                  </p>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          {[
                            "Descrição",
                            "Tipo",
                            "Favorecido",
                            "Vencimento",
                            "Valor",
                            "Saldo",
                            "Situação",
                            "Ações",
                          ].map((t) => (
                            <TableHead key={t}>{t}</TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {queries.entries.isLoading ? (
                          <TableRow>
                            <TableCell colSpan={8}>
                              Carregando lançamentos…
                            </TableCell>
                          </TableRow>
                        ) : !list?.items.length ? (
                          <TableRow>
                            <TableCell
                              colSpan={8}
                              className="py-10 text-center text-muted-foreground"
                            >
                              Nenhum lançamento encontrado. Ajuste os filtros ou
                              cadastre o primeiro.
                            </TableCell>
                          </TableRow>
                        ) : (
                          list.items.map((entry) => (
                            <TableRow key={entry.id}>
                              <TableCell className="min-w-48">
                                <button
                                  type="button"
                                  className="text-left font-medium hover:underline"
                                  onClick={() => setDetail(entry)}
                                >
                                  {entry.description}
                                </button>
                                <p className="text-xs text-muted-foreground">
                                  {entry.categoryName ?? "Sem categoria"}
                                  {entry.serviceName
                                    ? ` · ${entry.serviceName}`
                                    : ""}
                                  {entry.installmentCount > 1
                                    ? ` · ${entry.installment}/${entry.installmentCount}`
                                    : ""}
                                </p>
                              </TableCell>
                              <TableCell>
                                {entry.direction === "payable"
                                  ? "A pagar"
                                  : "A receber"}
                              </TableCell>
                              <TableCell>
                                {entry.partyName}
                                <p className="text-xs text-muted-foreground">
                                  {entry.laborType?.toUpperCase()}
                                </p>
                              </TableCell>
                              <TableCell className="whitespace-nowrap">
                                {dateLabel(entry.dueDate)}
                              </TableCell>
                              <TableCell className="whitespace-nowrap tabular-nums">
                                {money(entry.amountCents)}
                              </TableCell>
                              <TableCell className="whitespace-nowrap tabular-nums">
                                {money(entry.reportBalanceCents)}
                              </TableCell>
                              <TableCell>
                                <span className="whitespace-nowrap rounded-full bg-muted px-2 py-1 text-xs">
                                  {entryStatus(entry)}
                                </span>
                              </TableCell>
                              <TableCell>
                                <div className="flex gap-1">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setDetail(entry)}
                                  >
                                    Detalhes / baixa
                                  </Button>
                                  {permissions.canUpdateFinance() &&
                                    !entry.contractId &&
                                    !entry.cancelledAt &&
                                    remaining(entry) === entry.amountCents && (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setForm(entry)}
                                      >
                                        Editar
                                      </Button>
                                    )}
                                </div>
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                  <div className="flex items-center justify-end gap-3 text-sm">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page <= 1 || queries.entries.isFetching}
                      onClick={() => setPage((p) => p - 1)}
                    >
                      Anterior
                    </Button>
                    <span>
                      Página {page} de{" "}
                      {Math.max(1, Math.ceil((list?.total ?? 0) / 50))}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={
                        page * 50 >= (list?.total ?? 0) ||
                        queries.entries.isFetching
                      }
                      onClick={() => setPage((p) => p + 1)}
                    >
                      Próxima
                    </Button>
                  </div>
                </section>
              </TabsPanel>
              {permissions.canManageFinance() && (
                <TabsPanel value="settings">
                  {meta && (
                    <FinanceSettings
                      workspaceId={workspaceId}
                      metadata={meta}
                    />
                  )}
                </TabsPanel>
              )}
            </Tabs>
            {form && meta && (
              <EntryForm
                workspaceId={workspaceId}
                metadata={meta}
                entry={form === "new" ? undefined : form}
                onClose={() => setForm(null)}
              />
            )}
            {detail && (
              <EntryDetail
                workspaceId={workspaceId}
                entry={detail}
                canSettle={permissions.canSettleFinance()}
                canUpdate={permissions.canUpdateFinance()}
                onClose={() => setDetail(null)}
              />
            )}
          </>
        )}
      </div>
    </WorkspaceLayout>
  );
}
