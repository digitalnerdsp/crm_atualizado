import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import WorkspaceLayout from "@/components/common/workspace-layout";
import { BillingDialog } from "@/components/finance/billing-dialog";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getMetadata } from "@/fetchers/finance";
import {
  downloadRecurrence,
  getRecurrenceReport,
  type RecurrenceFilters,
} from "@/fetchers/finance/recurrence";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import { toast } from "@/lib/toast";
export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/workspace/$workspaceId/recurrence",
)({
  validateSearch: (raw: Record<string, unknown>) => ({
    contractId: typeof raw.contractId === "string" ? raw.contractId : undefined,
  }),
  component: RecurrencePage,
});
const states: Record<string, string> = {
  active: "Ativo",
  paused: "Pausado",
  cancelled: "Cancelado",
  finished: "Encerrado",
  not_started: "Não iniciado",
};
const frequencies: Record<string, string> = {
  monthly: "Mensal",
  quarterly: "Trimestral",
  yearly: "Anual",
};
function RecurrencePage() {
  const { workspaceId } = Route.useParams();
  const { contractId } = Route.useSearch();
  return (
    <RecurrenceWorkspace
      key={`${workspaceId}:${contractId ?? ""}`}
      workspaceId={workspaceId}
      selectedContract={contractId}
    />
  );
}
function RecurrenceWorkspace({
  workspaceId,
  selectedContract,
}: {
  workspaceId: string;
  selectedContract?: string;
}) {
  const permissions = useWorkspacePermission();
  const enabled =
    !permissions.isCheckingPermissions && permissions.canViewFinance();
  const now = today();
  const [filters, setFilters] = useState<RecurrenceFilters>({
    from: `${now.slice(0, 7)}-01`,
    to: now,
    contractId: selectedContract,
  });
  const [page, setPage] = useState(1);
  const [dialog, setDialog] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const metadata = useQuery({
    queryKey: ["finance", workspaceId, "metadata"],
    queryFn: () => getMetadata(workspaceId),
    enabled,
  });
  const query = useQuery({
    queryKey: ["finance", workspaceId, "recurrence", filters],
    queryFn: () => getRecurrenceReport(workspaceId, filters),
    enabled,
  });
  const canManage =
    permissions.canManageFinance() &&
    permissions.canCreateFinance() &&
    permissions.canUpdateFinance();
  const set = (key: keyof RecurrenceFilters, value: string) => {
    setPage(1);
    setFilters((f) => ({ ...f, [key]: value || undefined }));
  };
  const exportFile = async (format: "xlsx" | "pdf") => {
    setExporting(true);
    try {
      await downloadRecurrence(workspaceId, filters, format);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setExporting(false);
    }
  };
  const data = query.data;
  const meta = metadata.data;
  const items = data?.rows.slice((page - 1) * 25, page * 25) ?? [];
  return (
    <WorkspaceLayout title="Contratos e recorrência">
      <PageTitle title="Contratos e recorrência" />
      <div className="mx-auto w-full max-w-7xl space-y-5 p-4 md:p-6">
        <div>
          <h1 className="text-2xl font-semibold">Contratos e recorrência</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Vigências, receita recorrente e cobranças integradas ao financeiro.
          </p>
        </div>
        {permissions.isCheckingPermissions ? (
          <p>Verificando acesso…</p>
        ) : !enabled ? (
          <p role="alert">Você não tem acesso financeiro a este workspace.</p>
        ) : (
          <>
            <form
              key={`${filters.from}-${filters.to}`}
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
                  toast.error("Selecione um período válido de até 731 dias.");
                  return;
                }
                setPage(1);
                setFilters((prev) => ({ ...prev, from, to }));
              }}
            >
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
              <Field label="Situação">
                <select
                  className={selectClass}
                  value={filters.status ?? ""}
                  onChange={(e) => set("status", e.target.value)}
                >
                  <option value="">Todas</option>
                  {Object.entries(states).map(([v, l]) => (
                    <option value={v} key={v}>
                      {l}
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
                  {meta?.companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-4">
                <Button type="submit">Aplicar período</Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setFilters({ from: `${now.slice(0, 7)}-01`, to: now });
                    setPage(1);
                  }}
                >
                  Limpar filtros
                </Button>
                {permissions.canExportFinance() && (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={exporting || !data}
                      onClick={() => exportFile("xlsx")}
                    >
                      Exportar Excel
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={exporting || !data}
                      onClick={() => exportFile("pdf")}
                    >
                      Exportar PDF
                    </Button>
                  </>
                )}
              </div>
            </form>
            {(query.error || metadata.error) && (
              <div
                role="alert"
                className="rounded-lg border border-destructive p-4 text-sm"
              >
                {query.error?.message ?? metadata.error?.message}
                <Button
                  variant="ghost"
                  onClick={() => {
                    query.refetch();
                    metadata.refetch();
                  }}
                >
                  Tentar novamente
                </Button>
              </div>
            )}
            <div>
              <section className="space-y-4 rounded-xl border bg-card p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="font-semibold">
                    {data?.total ?? 0} contratos
                  </h2>
                </div>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {[
                          "Contrato e cliente",
                          "Serviços e ciclos",
                          "Vigência",
                          "Equivalente mensal",
                          "Cobrado / recebido",
                          "Próxima cobrança",
                          "Geração",
                        ].map((h) => (
                          <TableHead key={h}>{h}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {!items.length ? (
                        <TableRow>
                          <TableCell
                            colSpan={7}
                            className="py-10 text-center text-muted-foreground"
                          >
                            {query.isLoading
                              ? "Carregando contratos…"
                              : "Nenhum contrato encontrado para estes filtros."}
                          </TableCell>
                        </TableRow>
                      ) : (
                        items.map((c) => (
                          <TableRow key={c.id}>
                            <TableCell className="min-w-52">
                              <button
                                type="button"
                                className="text-left font-medium hover:underline"
                                onClick={() => setDialog(c.id)}
                              >
                                #{c.number} · {c.title}
                              </button>
                              <p className="text-xs text-muted-foreground">
                                {c.companyName} ·{" "}
                                {c.sellerName ?? "Sem responsável"}
                              </p>
                              <span className="mt-1 inline-block rounded-full bg-muted px-2 py-1 text-xs">
                                {states[c.status] ?? c.status}
                              </span>
                            </TableCell>
                            <TableCell className="min-w-48">
                              {c.services.map((item) => (
                                <p className="py-1 text-xs" key={item.key}>
                                  {item.name}
                                  <span className="block text-muted-foreground">
                                    {frequencies[item.billingType]} ·{" "}
                                    {money(item.amountCents)} por ciclo
                                  </span>
                                </p>
                              ))}
                            </TableCell>
                            <TableCell className="min-w-40 text-xs">
                              {dateLabel(c.startsOn)} a{" "}
                              {c.endsOn ? dateLabel(c.endsOn) : "indeterminado"}
                              <p className="mt-1 text-muted-foreground">
                                {c.daysRemaining === null
                                  ? "Sem data de término"
                                  : `${c.daysRemaining} dias restantes`}
                              </p>
                            </TableCell>
                            <TableCell className="whitespace-nowrap tabular-nums">
                              {money(c.monthlyValueCents)}
                            </TableCell>
                            <TableCell className="min-w-40 text-xs">
                              Cobrado {money(c.billedCents)}
                              <p>Recebido {money(c.receivedCents)}</p>
                              <p className="text-muted-foreground">
                                Saldo {money(c.outstandingCents)}
                              </p>
                            </TableCell>
                            <TableCell className="whitespace-nowrap text-xs">
                              {c.nextCharge ? (
                                <>
                                  {dateLabel(c.nextCharge.date)}
                                  <p>{money(c.nextCharge.amountCents)}</p>
                                </>
                              ) : (
                                "Sem ciclo programado"
                              )}
                            </TableCell>
                            <TableCell>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setDialog(c.id)}
                              >
                                {canManage ? "Configurar" : "Consultar"}
                              </Button>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {c.billingEnabled
                                  ? "Automática ativada"
                                  : "Desativada"}
                              </p>
                              {c.lastWarning && (
                                <p className="mt-1 max-w-52 text-xs text-amber-600">
                                  {c.lastWarning}
                                </p>
                              )}
                              <Link
                                className="mt-2 block text-xs underline"
                                to="/dashboard/workspace/$workspaceId/finance"
                                params={{ workspaceId }}
                                search={{ contractId: c.id }}
                              >
                                Ver cobranças
                              </Link>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
                <div className="flex items-center justify-end gap-2 text-sm">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page === 1}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    Anterior
                  </Button>
                  <span>
                    {page} de {Math.max(1, Math.ceil((data?.total ?? 0) / 25))}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page * 25 >= (data?.total ?? 0)}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Próxima
                  </Button>
                </div>
              </section>
            </div>
            {dialog && meta && (
              <BillingDialog
                workspaceId={workspaceId}
                contractId={dialog}
                metadata={meta}
                canManage={canManage}
                canRenew={
                  canManage &&
                  permissions.canUpdateDeals() &&
                  permissions.canChangeDealStage()
                }
                onClose={() => setDialog(null)}
              />
            )}
          </>
        )}
      </div>
    </WorkspaceLayout>
  );
}
