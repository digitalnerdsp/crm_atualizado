import {
  CheckCheck,
  Download,
  FileSpreadsheet,
  Plus,
  RefreshCw,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import WorkspaceLayout from "@/components/common/workspace-layout";
import { EntryDetail } from "@/components/finance/entry-detail";
import { EntryForm } from "@/components/finance/entry-form";
import {
  BulkSettleDialog,
  canSettleEntry,
  exportEntriesCsv,
} from "@/components/finance/ledger-bulk";
import { FinanceSettings } from "@/components/finance/settings";
import {
  dateLabel,
  entryStatus,
  Field,
  money,
  remaining,
  today,
} from "@/components/finance/shared";
import PageTitle from "@/components/page-title";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FilterPanel } from "@/components/ui/filter-panel";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { PageHeader } from "@/components/ui/page-header";
import { entryTone, StatusBadge } from "@/components/ui/status-badge";
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

const REMEMBERED = ["from", "to", "status", "sort", "search"] as const;
const filtersKey = (workspaceId: string, side: string) =>
  `nortys:ledger-filters:${workspaceId}:${side}`;

function readRemembered(workspaceId: string, side: string) {
  try {
    const raw = localStorage.getItem(filtersKey(workspaceId, side));
    return raw ? (JSON.parse(raw) as Partial<FinanceFilters>) : {};
  } catch {
    return {};
  }
}

function initialFilters(): FinanceFilters {
  const now = today();
  return { from: `${now.slice(0, 7)}-01`, to: now, dateBasis: "due" };
}
export function LedgerPage({
  workspaceId,
  side,
  selectedContract,
}: {
  workspaceId: string;
  side: "receivable" | "payable";
  selectedContract?: string;
}) {
  const permissions = useWorkspacePermission();
  const enabled =
    !permissions.isCheckingPermissions && permissions.canViewFinance();
  const [filters, setFilters] = useState<FinanceFilters>(() => ({
    ...initialFilters(),
    ...(selectedContract ? {} : readRemembered(workspaceId, side)),
    contractId: selectedContract,
    direction: side,
  }));
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [tab, setTab] = useState("list");
  const [form, setForm] = useState<FinanceEntry | "new" | null>(null);
  const [detail, setDetail] = useState<FinanceEntry | null>(null);
  const [exporting, setExporting] = useState(false);
  useEffect(() => {
    if (selectedContract) return;
    const remembered: Record<string, unknown> = {};
    for (const key of REMEMBERED) remembered[key] = filters[key];
    try {
      localStorage.setItem(
        filtersKey(workspaceId, side),
        JSON.stringify(remembered),
      );
    } catch {
      // sem armazenamento: o filtro só não é lembrado
    }
  }, [filters, selectedContract, side, workspaceId]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: a seleção vale só para a página e o recorte atuais
  useEffect(() => setSelected(new Set()), [page, filters]);
  const defaults = initialFilters();
  const partyLabel = side === "receivable" ? "Cliente" : "Favorecido";
  const queries = useFinance(workspaceId, filters, page, enabled);
  const meta = queries.metadata.data;
  const list = queries.entries.data;
  const error = queries.metadata.error ?? queries.entries.error;
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
  const items = list?.items ?? [];
  const selectedItems = useMemo(
    () => items.filter((e) => selected.has(e.id)),
    [items, selected],
  );
  const settleable = selectedItems.filter(canSettleEntry);
  const allSelected = items.length > 0 && selectedItems.length === items.length;
  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(items.map((e) => e.id)));
  const toggleOne = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  const ledger = (
    <section className="space-y-4 rounded-xl border bg-card p-4">
      {filters.view && (
        <p className="text-sm text-muted-foreground">
          {filters.view === "overdue" ? "Vencidos" : "Saldos em aberto"} até{" "}
          {dateLabel(filters.to)}.{" "}
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
      {filters.contractId && (
        <p className="text-sm text-muted-foreground">
          Cobranças deste contrato.{" "}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setFilters((f) => ({
                ...f,
                contractId: undefined,
              }));
              setPage(1);
            }}
          >
            Ver todas as contas
          </Button>
        </p>
      )}
      <div className="flex flex-wrap justify-between gap-2">
        <h2 className="font-semibold">{list?.total ?? 0} lançamentos</h2>
        <p className="text-sm text-muted-foreground">
          Total {money(list?.totals.amountCents ?? 0)} · Em aberto{" "}
          {money(list?.totals.remainingCents ?? 0)} ·{" "}
          {side === "receivable"
            ? `Recebido ${money(list?.totals.receivedCents ?? 0)}`
            : `Pago ${money(list?.totals.paidCents ?? 0)}`}
        </p>
      </div>
      {selectedItems.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/50 px-3 py-2 text-sm">
          <span className="font-medium">
            {selectedItems.length} selecionada
            {selectedItems.length > 1 ? "s" : ""}
          </span>
          <span className="text-muted-foreground">
            Em aberto{" "}
            {money(selectedItems.reduce((sum, e) => sum + remaining(e), 0))}
          </span>
          <div className="ml-auto flex flex-wrap gap-2">
            {permissions.canSettleFinance() && settleable.length > 0 && (
              <Button
                size="sm"
                variant="success"
                onClick={() => setBulkOpen(true)}
              >
                <CheckCheck className="size-4" />
                Dar baixa nas selecionadas ({settleable.length})
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                exportEntriesCsv(
                  selectedItems,
                  partyLabel,
                  `${side === "receivable" ? "contas-a-receber" : "contas-a-pagar"}-selecionadas.csv`,
                )
              }
            >
              <FileSpreadsheet className="size-4" />
              Exportar selecionadas (CSV)
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setSelected(new Set())}
            >
              <X className="size-4" />
              Limpar
            </Button>
          </div>
        </div>
      )}
      <div>
        <Table containerClassName="max-h-[65vh] overflow-auto">
          <TableHeader>
            <TableRow>
              <TableHead className="sticky top-0 z-10 w-10 bg-card">
                <Checkbox
                  aria-label="Selecionar todas as linhas"
                  checked={allSelected}
                  indeterminate={selectedItems.length > 0 && !allSelected}
                  onCheckedChange={toggleAll}
                />
              </TableHead>
              {[
                "Descrição",
                "Competência",
                partyLabel,
                "Vencimento",
                "Valor",
                "Saldo",
                "Situação",
                "Ações",
              ].map((t) => (
                <TableHead key={t} className="sticky top-0 z-10 bg-card">
                  {t}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {queries.entries.isLoading ? (
              <TableRow>
                <TableCell colSpan={9}>Carregando lançamentos…</TableCell>
              </TableRow>
            ) : !list?.items.length ? (
              <TableRow>
                <TableCell
                  colSpan={9}
                  className="py-10 text-center text-muted-foreground"
                >
                  Nenhum lançamento encontrado. Ajuste os filtros ou cadastre o
                  primeiro.
                </TableCell>
              </TableRow>
            ) : (
              list.items.map((entry) => (
                <TableRow
                  key={entry.id}
                  data-state={selected.has(entry.id) ? "selected" : undefined}
                >
                  <TableCell>
                    <Checkbox
                      aria-label={`Selecionar ${entry.description}`}
                      checked={selected.has(entry.id)}
                      onCheckedChange={() => toggleOne(entry.id)}
                    />
                  </TableCell>
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
                      {entry.serviceName ? ` · ${entry.serviceName}` : ""}
                      {entry.installmentCount > 1
                        ? ` · ${entry.installment}/${entry.installmentCount}`
                        : ""}
                    </p>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {entry.competenceDate
                      .slice(0, 7)
                      .split("-")
                      .reverse()
                      .join("/")}
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
                    <StatusBadge tone={entryTone(entryStatus(entry))}>
                      {entryStatus(entry)}
                    </StatusBadge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button
                        variant={
                          remaining(entry) > 0 && !entry.cancelledAt
                            ? "success"
                            : "outline"
                        }
                        size="sm"
                        onClick={() => setDetail(entry)}
                      >
                        {remaining(entry) > 0 && !entry.cancelledAt
                          ? "Dar baixa"
                          : "Detalhes"}
                      </Button>
                      {permissions.canUpdateFinance() &&
                        !entry.contractId &&
                        !entry.cancelledAt &&
                        remaining(entry) === entry.amountCents && (
                          <Button
                            variant="soft"
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
          Página {page} de {Math.max(1, Math.ceil((list?.total ?? 0) / 50))}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={
            page * 50 >= (list?.total ?? 0) || queries.entries.isFetching
          }
          onClick={() => setPage((p) => p + 1)}
        >
          Próxima
        </Button>
      </div>
    </section>
  );
  return (
    <WorkspaceLayout
      title={side === "receivable" ? "Contas a receber" : "Contas a pagar"}
      headerActions={
        enabled && permissions.canCreateFinance() ? (
          <Button size="sm" onClick={() => setForm("new")} disabled={!meta}>
            <Plus className="size-4" />
            Novo lançamento
          </Button>
        ) : null
      }
    >
      <PageTitle
        title={side === "receivable" ? "Contas a receber" : "Contas a pagar"}
      />
      <div className="mx-auto w-full max-w-7xl space-y-5 p-4 md:p-6">
        <PageHeader
          title={side === "receivable" ? "Contas a receber" : "Contas a pagar"}
          description={
            side === "receivable"
              ? "Cobranças, recebimentos e baixas dos clientes."
              : "Despesas, pagamentos e cadastros de fornecedores."
          }
        />
        {permissions.isCheckingPermissions ? (
          <p>Verificando acesso…</p>
        ) : !enabled ? (
          <p role="alert">
            Você não tem permissão para acessar o financeiro deste workspace.
          </p>
        ) : (
          <>
            <FilterPanel
              values={filters as Record<string, unknown>}
              extraActive={
                filters.from !== defaults.from || filters.to !== defaults.to
                  ? 1
                  : 0
              }
            >
              <form
                key={`${filters.from}-${filters.to}-${filters.status}-${filters.sort}-${filters.search}`}
                className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-5"
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
                    status:
                      (String(f.get("status")) as FinanceFilters["status"]) ||
                      undefined,
                    sort:
                      (String(f.get("sort")) as FinanceFilters["sort"]) ||
                      undefined,
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
                <Field label="Situação">
                  <NativeSelect
                    name="status"
                    defaultValue={filters.status ?? ""}
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
                  </NativeSelect>
                </Field>
                <Field label="Ordenar por">
                  <NativeSelect name="sort" defaultValue={filters.sort ?? ""}>
                    <option value="">Vencimento (mais recente)</option>
                    <option value="due_asc">Vencimento (mais antigo)</option>
                    <option value="amount_desc">Maior valor</option>
                    <option value="amount_asc">Menor valor</option>
                    <option value="name">Descrição (A-Z)</option>
                  </NativeSelect>
                </Field>
                <Field label="Pesquisar">
                  <Input
                    name="search"
                    placeholder="Descrição ou cliente"
                    defaultValue={filters.search}
                    maxLength={240}
                  />
                </Field>
                <div className="flex flex-wrap items-end gap-2 sm:col-span-2 lg:col-span-5">
                  <Button type="submit">Aplicar</Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setPage(1);
                      setFilters({
                        ...initialFilters(),
                        direction: side,
                      });
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
            </FilterPanel>
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
                    queries.metadata.refetch();
                  }}
                >
                  <RefreshCw className="size-4" />
                  Tentar novamente
                </Button>
              </div>
            )}
            {side === "payable" ? (
              <Tabs
                value={tab}
                onValueChange={(value) => setTab(String(value))}
              >
                <TabsList>
                  <TabsTab value="list">Contas a pagar</TabsTab>
                  {permissions.canManageFinance() && (
                    <TabsTab value="settings">Cadastros</TabsTab>
                  )}
                </TabsList>
                <TabsPanel value="list">{ledger}</TabsPanel>
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
            ) : (
              ledger
            )}
            {form && meta && (
              <EntryForm
                workspaceId={workspaceId}
                metadata={meta}
                entry={form === "new" ? undefined : form}
                defaultDirection={side}
                onClose={() => setForm(null)}
              />
            )}
            {bulkOpen && (
              <BulkSettleDialog
                workspaceId={workspaceId}
                entries={settleable}
                onClose={() => setBulkOpen(false)}
                onDone={() => {
                  setBulkOpen(false);
                  setSelected(new Set());
                }}
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
