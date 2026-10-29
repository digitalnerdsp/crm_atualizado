import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import WorkspaceLayout from "@/components/common/workspace-layout";
import { Commissions } from "@/components/finance/performance/commissions";
import { PerformanceExpenses } from "@/components/finance/performance/expenses";
import { PerformanceRules } from "@/components/finance/performance/rules";
import { Field, today } from "@/components/finance/shared";
import PageTitle from "@/components/page-title";
import { Button } from "@/components/ui/button";
import { FilterPanel } from "@/components/ui/filter-panel";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { PageHeader } from "@/components/ui/page-header";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@/components/ui/tabs";
import { getMetadata } from "@/fetchers/finance";
import {
  downloadPerformance,
  getPerformance,
  getPerformanceConfig,
  type PerformanceFilters,
} from "@/fetchers/finance/performance";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import { toast } from "@/lib/toast";
export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/workspace/$workspaceId/performance",
)({ component: PerformancePage });
function PerformancePage() {
  const { workspaceId } = Route.useParams();
  return <PerformanceWorkspace key={workspaceId} workspaceId={workspaceId} />;
}
function PerformanceWorkspace({ workspaceId }: { workspaceId: string }) {
  const permissions = useWorkspacePermission();
  const enabled =
    !permissions.isCheckingPermissions && permissions.canViewFinance();
  const now = today();
  const [filters, setFilters] = useState<PerformanceFilters>({
    from: `${now.slice(0, 7)}-01`,
    to: now,
  });
  const [tab, setTab] = useState("commissions");
  const [exporting, setExporting] = useState(false);
  const q = useQuery({
    queryKey: ["finance", workspaceId, "performance", filters],
    queryFn: () => getPerformance(workspaceId, filters),
    enabled,
  });
  const meta = useQuery({
    queryKey: ["finance", workspaceId, "metadata"],
    queryFn: () => getMetadata(workspaceId),
    enabled,
  });
  const config = useQuery({
    queryKey: ["finance", workspaceId, "performance-config"],
    queryFn: () => getPerformanceConfig(workspaceId),
    enabled,
  });
  const canManage = permissions.canManageFinance();
  const error = q.error ?? meta.error ?? config.error;
  const download = async (format: "xlsx" | "pdf") => {
    setExporting(true);
    try {
      await downloadPerformance(workspaceId, filters, format);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setExporting(false);
    }
  };
  return (
    <WorkspaceLayout title="Comissões e resultados">
      <PageTitle title="Comissões e resultados" />
      <div className="mx-auto w-full max-w-7xl space-y-5 p-4 md:p-6">
        <PageHeader
          title="Comissões e resultados"
          description="Comissões e rentabilidade por serviço e vendedor."
        />
        {permissions.isCheckingPermissions ? (
          <p>Verificando acesso…</p>
        ) : !permissions.canViewFinance() ? (
          <p role="alert">
            Você não tem permissão para consultar o financeiro.
          </p>
        ) : (
          <>
            <FilterPanel values={filters as Record<string, unknown>}>
              <form
                key={JSON.stringify(filters)}
                className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  const f = new FormData(event.currentTarget);
                  setFilters({
                    from: String(f.get("from")),
                    to: String(f.get("to")),
                    sellerId: String(f.get("seller") ?? "") || undefined,
                  });
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
                <Field label="Vendedor">
                  <NativeSelect
                    name="seller"
                    defaultValue={filters.sellerId ?? ""}
                  >
                    <option value="">Todos</option>
                    {meta.data?.sellers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
                <div className="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-4">
                  <Button type="submit">Aplicar filtros</Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      setFilters({ from: `${now.slice(0, 7)}-01`, to: now })
                    }
                  >
                    Limpar filtros
                  </Button>
                  {permissions.canExportFinance() && (
                    <>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={exporting || !q.data}
                        onClick={() => download("xlsx")}
                      >
                        Exportar Excel
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={exporting || !q.data}
                        onClick={() => download("pdf")}
                      >
                        Exportar PDF
                      </Button>
                    </>
                  )}
                </div>
              </form>
            </FilterPanel>
            {error && (
              <div
                role="alert"
                className="rounded-lg border border-destructive p-4 text-sm"
              >
                {error.message}
                <Button
                  variant="ghost"
                  onClick={() => {
                    q.refetch();
                    meta.refetch();
                    config.refetch();
                  }}
                >
                  Tentar novamente
                </Button>
              </div>
            )}
            <Tabs value={tab} onValueChange={(v) => setTab(String(v))}>
              <div className="overflow-x-auto">
                <TabsList>
                  <TabsTab value="commissions">Comissões</TabsTab>
                  <TabsTab value="expenses">Custos e despesas</TabsTab>
                  <TabsTab value="rules">Regras</TabsTab>
                </TabsList>
              </div>
              <TabsPanel value="commissions">
                {q.data && (
                  <Commissions
                    key={JSON.stringify(filters)}
                    workspaceId={workspaceId}
                    data={q.data}
                    canIssue={canManage && permissions.canCreateFinance()}
                    canApply={canManage && permissions.canUpdateFinance()}
                    canSettle={permissions.canSettleFinance()}
                    canUpdate={permissions.canUpdateFinance()}
                  />
                )}
              </TabsPanel>
              <TabsPanel value="expenses">
                {q.data && (
                  <PerformanceExpenses
                    key={JSON.stringify(filters)}
                    workspaceId={workspaceId}
                    data={q.data}
                    canUpdate={permissions.canUpdateFinance()}
                  />
                )}
              </TabsPanel>
              <TabsPanel value="rules">
                {config.data && meta.data && (
                  <PerformanceRules
                    workspaceId={workspaceId}
                    data={config.data}
                    metadata={meta.data}
                    canManage={canManage}
                  />
                )}
              </TabsPanel>
            </Tabs>
          </>
        )}
      </div>
    </WorkspaceLayout>
  );
}
