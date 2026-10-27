import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import WorkspaceLayout from "@/components/common/workspace-layout";
import { EntryDetail } from "@/components/finance/entry-detail";
import {
  dateLabel,
  Field,
  Modal,
  money,
  selectClass,
  today,
} from "@/components/finance/shared";
import { TaxCalculator } from "@/components/finance/taxes/calculator";
import { TaxHistory } from "@/components/finance/taxes/history";
import { TaxProfiles } from "@/components/finance/taxes/profiles";
import PageTitle from "@/components/page-title";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@/components/ui/tabs";
import { getMetadata } from "@/fetchers/finance";
import { getPerformanceEntry } from "@/fetchers/finance/performance";
import {
  downloadTaxes,
  getTaxConfig,
  getTaxReport,
  type TaxFilters,
} from "@/fetchers/finance/taxes";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import { toast } from "@/lib/toast";
export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/workspace/$workspaceId/taxes",
)({ component: TaxPage });
function TaxPage() {
  const { workspaceId } = Route.useParams();
  return <TaxWorkspace key={workspaceId} workspaceId={workspaceId} />;
}
function LedgerDetail({
  workspaceId,
  id,
  canSettle,
  canUpdate,
  onClose,
}: {
  workspaceId: string;
  id: string;
  canSettle: boolean;
  canUpdate: boolean;
  onClose: () => void;
}) {
  const q = useQuery({
    queryKey: ["finance", workspaceId, "entry", id],
    queryFn: () => getPerformanceEntry(workspaceId, id),
  });
  return q.data ? (
    <EntryDetail
      workspaceId={workspaceId}
      entry={q.data}
      canSettle={canSettle}
      canUpdate={canUpdate}
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
function TaxWorkspace({ workspaceId }: { workspaceId: string }) {
  const permissions = useWorkspacePermission();
  const enabled =
    !permissions.isCheckingPermissions && permissions.canViewFinance();
  const now = today();
  const [filters, setFilters] = useState<TaxFilters>({
    from: `${now.slice(0, 7)}-01`,
    to: now,
  });
  const [tab, setTab] = useState("calculator");
  const [exporting, setExporting] = useState(false);
  const [detail, setDetail] = useState<string | null>(null);
  const [ledgerPage, setLedgerPage] = useState(1);
  const report = useQuery({
    queryKey: ["finance", workspaceId, "tax-report", filters],
    queryFn: () => getTaxReport(workspaceId, filters),
    enabled,
  });
  const config = useQuery({
    queryKey: ["finance", workspaceId, "tax-config"],
    queryFn: () => getTaxConfig(workspaceId),
    enabled,
  });
  const meta = useQuery({
    queryKey: ["finance", workspaceId, "metadata"],
    queryFn: () => getMetadata(workspaceId),
    enabled,
  });
  const error = report.error ?? config.error ?? meta.error;
  const download = async (format: "xlsx" | "pdf") => {
    setExporting(true);
    try {
      await downloadTaxes(workspaceId, filters, format);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setExporting(false);
    }
  };
  return (
    <WorkspaceLayout title="Taxas e impostos">
      <PageTitle title="Taxas e impostos" />
      <div className="mx-auto w-full max-w-7xl space-y-5 p-4 md:p-6">
        <div>
          <h1 className="text-2xl font-semibold">Taxas e impostos</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Planeje o preço de venda, confira o líquido e acompanhe os encargos
            registrados no financeiro.
          </p>
        </div>
        {permissions.isCheckingPermissions ? (
          <p>Verificando acesso…</p>
        ) : !permissions.canViewFinance() ? (
          <p role="alert">
            Você não tem permissão para consultar o financeiro.
          </p>
        ) : (
          <>
            <form
              key={JSON.stringify(filters)}
              className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-3"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                setFilters({
                  from: String(f.get("from")),
                  to: String(f.get("to")),
                  profileId: String(f.get("profile") || "") || undefined,
                });
                setLedgerPage(1);
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
              <Field label="Perfil da simulação">
                <select
                  className={selectClass}
                  name="profile"
                  defaultValue={filters.profileId ?? ""}
                >
                  <option value="">Todos</option>
                  {config.data?.profiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-3">
                <Button type="submit">Aplicar filtros</Button>
                <Button
                  variant="outline"
                  type="button"
                  onClick={() => {
                    setFilters({ from: `${now.slice(0, 7)}-01`, to: now });
                    setLedgerPage(1);
                  }}
                >
                  Limpar filtros
                </Button>
                {permissions.canExportFinance() && (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={exporting || !report.data}
                      onClick={() => download("xlsx")}
                    >
                      Exportar Excel
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={exporting || !report.data}
                      onClick={() => download("pdf")}
                    >
                      Exportar PDF
                    </Button>
                  </>
                )}
              </div>
              <p className="text-xs text-muted-foreground sm:col-span-2 lg:col-span-5">
                Filtros aplicam-se ao resumo, histórico e exportação. O perfil
                filtra simulações; lançamentos reais usam serviço e vendedor. A
                calculadora tem seus próprios parâmetros.
              </p>
            </form>
            {error && (
              <div
                role="alert"
                className="rounded-lg border border-destructive p-4 text-sm"
              >
                {error.message}
                <Button
                  variant="ghost"
                  onClick={() => {
                    report.refetch();
                    config.refetch();
                    meta.refetch();
                  }}
                >
                  Tentar novamente
                </Button>
              </div>
            )}
            <Tabs value={tab} onValueChange={(v) => setTab(String(v))}>
              <div className="overflow-x-auto">
                <TabsList>
                  <TabsTab value="calculator">Calculadora</TabsTab>
                  <TabsTab value="profiles">Perfis</TabsTab>
                  <TabsTab value="history">Histórico</TabsTab>
                  <TabsTab value="ledger">Lançamentos reais</TabsTab>
                </TabsList>
              </div>
              <TabsPanel value="calculator">
                {config.data && meta.data && (
                  <TaxCalculator
                    key={config.data.profiles
                      .map((p) => `${p.id}:${p.version}`)
                      .join("|")}
                    workspaceId={workspaceId}
                    config={config.data}
                    metadata={meta.data}
                    canSave={permissions.canCreateFinance()}
                  />
                )}
              </TabsPanel>
              <TabsPanel value="profiles">
                {config.isLoading ? (
                  <p>Carregando perfis…</p>
                ) : (
                  config.data && (
                    <TaxProfiles
                      workspaceId={workspaceId}
                      data={config.data}
                      canManage={permissions.canManageFinance()}
                    />
                  )
                )}
              </TabsPanel>
              <TabsPanel value="history">
                {report.data && (
                  <TaxHistory
                    key={JSON.stringify(filters)}
                    data={report.data}
                  />
                )}
              </TabsPanel>
              <TabsPanel value="ledger">
                <section className="space-y-4 rounded-xl border bg-card p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h2 className="font-semibold">
                      Impostos e despesas financeiras lançados
                    </h2>
                    <Link
                      className="text-sm underline"
                      to="/dashboard/workspace/$workspaceId/performance"
                      params={{ workspaceId }}
                    >
                      Classificar custos e despesas
                    </Link>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Lançamentos operacionais classificados como imposto ou
                    despesa financeira, pela competência. Não são criados pelos
                    perfis ou simulações.
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr>
                          <th className="p-3">Descrição</th>
                          <th className="p-3">Classificação</th>
                          <th className="p-3">Competência</th>
                          <th className="p-3">Valor</th>
                          <th className="p-3">Ação</th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.data?.ledger
                          .slice((ledgerPage - 1) * 25, ledgerPage * 25)
                          .map((e) => (
                            <tr className="border-t" key={e.id}>
                              <td className="min-w-48 p-3">{e.description}</td>
                              <td className="p-3">
                                {e.classification === "tax"
                                  ? "Imposto"
                                  : "Despesa financeira"}
                              </td>
                              <td className="whitespace-nowrap p-3">
                                {dateLabel(e.competenceDate)}
                              </td>
                              <td className="whitespace-nowrap p-3">
                                {money(e.amountCents)}
                              </td>
                              <td className="p-3">
                                <Button
                                  variant="outline"
                                  onClick={() => setDetail(e.id)}
                                >
                                  Consultar e baixar
                                </Button>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                  {!report.data?.ledger.length && (
                    <p className="py-6 text-sm text-muted-foreground">
                      Sem lançamentos classificados para estes filtros.
                    </p>
                  )}
                  <div className="flex items-center justify-end gap-2 text-sm">
                    <Button
                      variant="outline"
                      disabled={ledgerPage <= 1}
                      onClick={() => setLedgerPage((p) => p - 1)}
                    >
                      Anterior
                    </Button>
                    {ledgerPage}
                    <Button
                      variant="outline"
                      disabled={
                        ledgerPage * 25 >= (report.data?.ledger.length ?? 0)
                      }
                      onClick={() => setLedgerPage((p) => p + 1)}
                    >
                      Próxima
                    </Button>
                  </div>
                </section>
              </TabsPanel>
            </Tabs>
            {detail && (
              <LedgerDetail
                workspaceId={workspaceId}
                id={detail}
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
