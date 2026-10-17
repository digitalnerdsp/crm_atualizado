import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import WorkspaceLayout from "@/components/common/workspace-layout";
import CreateCompanyModal from "@/components/crm/forms/create-company-modal";
import { CompanyHostingPanel } from "@/components/crm/hosting/company-panel";
import { HostingDashboard } from "@/components/crm/hosting/dashboard";
import { HostingDigestSettings } from "@/components/crm/hosting/digest-settings";
import { hostingModes } from "@/components/crm/hosting/shared";
import {
  dateLabel,
  Field,
  Modal,
  selectClass,
  today,
} from "@/components/finance/shared";
import PageTitle from "@/components/page-title";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@/components/ui/tabs";
import {
  getHostingMetadata,
  getHostingReport,
  type HostingFilters,
} from "@/fetchers/crm/hosting";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/workspace/$workspaceId/crm/hosting",
)({ component: HostingPage });
function HostingPage() {
  const { workspaceId } = Route.useParams();
  return <HostingWorkspace key={workspaceId} workspaceId={workspaceId} />;
}
function HostingWorkspace({ workspaceId }: { workspaceId: string }) {
  const permissions = useWorkspacePermission();
  const enabled =
    !permissions.isCheckingPermissions && permissions.canViewCompanies();
  const now = today();
  const [filters, setFilters] = useState<HostingFilters>({
    from: `${now.slice(0, 7)}-01`,
    to: now,
  });
  const [tab, setTab] = useState("dashboard");
  const [page, setPage] = useState(1);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const report = useQuery({
    queryKey: ["crm", "hosting-report", workspaceId, filters],
    queryFn: () => getHostingReport(workspaceId, filters),
    enabled,
  });
  const meta = useQuery({
    queryKey: ["crm", "hosting-metadata", workspaceId],
    queryFn: () => getHostingMetadata(workspaceId),
    enabled,
  });
  const error = report.error ?? meta.error;
  const show = (attention?: "due") => {
    setFilters((f) => ({
      ...f,
      mode: "third_party",
      status: "active",
      attention,
    }));
    setPage(1);
    setTab("companies");
  };
  return (
    <WorkspaceLayout title="Carteira e hospedagem">
      <PageTitle title="Carteira e hospedagem" />
      <div className="mx-auto w-full max-w-7xl space-y-5 p-4 md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Carteira e hospedagem</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Empresas, serviços vinculados e acompanhamento de hospedagens de
              terceiros.
            </p>
          </div>
          {enabled && permissions.canCreateCompanies() && (
            <Button onClick={() => setCreating(true)}>Cadastrar empresa</Button>
          )}
        </div>
        {permissions.isCheckingPermissions ? (
          <p>Verificando acesso…</p>
        ) : !permissions.canViewCompanies() ? (
          <p role="alert">Você não tem permissão para consultar empresas.</p>
        ) : (
          <>
            <form
              key={JSON.stringify(filters)}
              className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                setFilters({
                  from: String(f.get("from")),
                  to: String(f.get("to")),
                  mode:
                    (String(f.get("mode") || "") as HostingFilters["mode"]) ||
                    undefined,
                  status:
                    (String(
                      f.get("status") || "",
                    ) as HostingFilters["status"]) || undefined,
                  ownerId: String(f.get("owner") || "") || undefined,
                  serviceId: String(f.get("service") || "") || undefined,
                  attention:
                    (String(
                      f.get("attention") || "",
                    ) as HostingFilters["attention"]) || undefined,
                  search: String(f.get("search") || "") || undefined,
                  provider: String(f.get("provider") || "") || undefined,
                  window:
                    (String(
                      f.get("window") || "",
                    ) as HostingFilters["window"]) || undefined,
                });
                setPage(1);
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
              <Field label="Hospedagem">
                <select
                  className={selectClass}
                  name="mode"
                  defaultValue={filters.mode ?? ""}
                >
                  <option value="">Todas</option>
                  {Object.entries(hostingModes).map(([v, label]) => (
                    <option value={v} key={v}>
                      {label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Situação da empresa">
                <select
                  name="status"
                  className={selectClass}
                  defaultValue={filters.status ?? ""}
                >
                  <option value="">Todas</option>
                  <option value="active">Cliente ativo</option>
                  <option value="prospect">Prospect</option>
                  <option value="inactive">Inativo</option>
                  <option value="churned">Encerrado</option>
                </select>
              </Field>
              <Field label="Serviço">
                <select
                  name="service"
                  className={selectClass}
                  defaultValue={filters.serviceId ?? ""}
                >
                  <option value="">Todos</option>
                  {meta.data?.services.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Responsável">
                <select
                  name="owner"
                  className={selectClass}
                  defaultValue={filters.ownerId ?? ""}
                >
                  <option value="">Todos do meu acesso</option>
                  {meta.data?.owners.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Acompanhamento">
                <select
                  name="attention"
                  className={selectClass}
                  defaultValue={filters.attention ?? ""}
                >
                  <option value="">Todos</option>
                  <option value="due">
                    Dentro do prazo de aviso / vencido
                  </option>
                  <option value="no_date">
                    Terceiros sem renovação informada
                  </option>
                </select>
              </Field>
              <Field label="Provedor">
                <select
                  name="provider"
                  className={selectClass}
                  defaultValue={filters.provider ?? ""}
                >
                  <option value="">Todos</option>
                  {meta.data?.providers.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Prazo da renovação">
                <select
                  name="window"
                  className={selectClass}
                  defaultValue={filters.window ?? ""}
                >
                  <option value="">Todos</option>
                  <option value="overdue">Vencidas</option>
                  <option value="15">Até 15 dias</option>
                  <option value="30">Até 30 dias</option>
                  <option value="60">Até 60 dias</option>
                  <option value="90">Até 90 dias</option>
                </select>
              </Field>
              <Field label="Empresa, domínio ou provedor">
                <Input
                  name="search"
                  defaultValue={filters.search ?? ""}
                  maxLength={200}
                />
              </Field>
              <div className="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-4">
                <Button type="submit">Aplicar filtros</Button>
                <Button type="button" variant="outline" onClick={() => show()}>
                  Clientes de terceiros
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => show("due")}
                >
                  Renovações em atenção
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setFilters({ from: `${now.slice(0, 7)}-01`, to: now });
                    setPage(1);
                  }}
                >
                  Limpar filtros
                </Button>
              </div>
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
                    meta.refetch();
                  }}
                >
                  Tentar novamente
                </Button>
              </div>
            )}
            <Tabs value={tab} onValueChange={(v) => setTab(String(v))}>
              <TabsList>
                <TabsTab value="dashboard">Resumo</TabsTab>
                <TabsTab value="companies">Empresas e hospedagens</TabsTab>
                {permissions.canNotifyCompanies() && (
                  <TabsTab value="digest">Aviso interno</TabsTab>
                )}
              </TabsList>
              <TabsPanel value="dashboard">
                {report.isLoading ? (
                  <p>Carregando indicadores…</p>
                ) : (
                  report.data && (
                    <HostingDashboard
                      data={report.data}
                      onThirdParty={() => show()}
                      onDue={() => show("due")}
                    />
                  )
                )}
              </TabsPanel>
              {permissions.canNotifyCompanies() && (
                <TabsPanel value="digest">
                  <HostingDigestSettings workspaceId={workspaceId} />
                </TabsPanel>
              )}
              <TabsPanel value="companies">
                <section className="space-y-4 rounded-xl border bg-card p-4">
                  <h2 className="font-semibold">
                    {report.data?.total ?? 0} empresas encontradas
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    A lista sinaliza as renovações próximas. Os avisos de 30 e
                    15 dias vão somente para a equipe interna (aba Aviso
                    interno); nenhuma mensagem é enviada ao cliente.
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr>
                          {[
                            "Empresa",
                            "Hospedagem",
                            "Serviços",
                            "Renovação / atenção",
                            "Aviso interno",
                            "Ações",
                          ].map((h) => (
                            <th key={h} className="p-3">
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {report.data?.rows
                          .slice((page - 1) * 25, page * 25)
                          .map((c) => (
                            <tr key={c.id} className="border-t align-top">
                              <td className="min-w-48 p-3">
                                <Link
                                  className="font-medium underline"
                                  to="/dashboard/workspace/$workspaceId/crm/companies/$companyId"
                                  params={{ workspaceId, companyId: c.id }}
                                >
                                  {c.name}
                                </Link>
                                <p className="mt-1 text-xs text-muted-foreground">
                                  {c.ownerName ?? "Sem responsável"} ·{" "}
                                  {c.status}
                                </p>
                              </td>
                              <td className="min-w-44 p-3">
                                <span className="rounded-full bg-muted px-2 py-1 text-xs">
                                  {hostingModes[c.hosting.mode]}
                                </span>
                                <p className="mt-2 text-xs text-muted-foreground">
                                  {c.hosting.provider ||
                                    "Provedor não informado"}
                                </p>
                                <p className="text-xs">{c.hosting.domain}</p>
                              </td>
                              <td className="min-w-40 p-3 text-xs">
                                {c.hosting.services.map((s) => (
                                  <p
                                    className="mb-1 rounded border px-2 py-1"
                                    key={s.id}
                                  >
                                    {s.name}
                                  </p>
                                ))}
                              </td>
                              <td className="min-w-44 p-3 text-xs">
                                {c.hosting.renewsOn
                                  ? dateLabel(c.hosting.renewsOn)
                                  : "Sem data informada"}
                                {c.daysRemaining !== null && (
                                  <p className="mt-1 text-muted-foreground">
                                    {c.daysRemaining < 0
                                      ? `${Math.abs(c.daysRemaining)} dias após a data`
                                      : `${c.daysRemaining} dias restantes`}
                                  </p>
                                )}
                                {c.attention === "due" && (
                                  <p className="mt-2 text-amber-600">
                                    Conferir renovação
                                  </p>
                                )}
                              </td>
                              <td className="min-w-44 p-3 text-xs">
                                {c.nextNotice ? (
                                  <p>
                                    Próximo: {dateLabel(c.nextNotice.date)} (
                                    {c.nextNotice.markDays} dias)
                                  </p>
                                ) : (
                                  <p className="text-muted-foreground">
                                    Sem próximo aviso
                                  </p>
                                )}
                                {c.lastNotice ? (
                                  <p className="mt-1 text-muted-foreground">
                                    Último:{" "}
                                    {new Date(
                                      c.lastNotice.sentAt,
                                    ).toLocaleDateString("pt-BR")}{" "}
                                    ({c.lastNotice.markDays} dias
                                    {c.lastNotice.status === "sent"
                                      ? ""
                                      : c.lastNotice.status === "failed"
                                        ? ", falhou"
                                        : ", pendente"}
                                    )
                                  </p>
                                ) : (
                                  <p className="mt-1 text-muted-foreground">
                                    Nenhum enviado
                                  </p>
                                )}
                              </td>
                              <td className="p-3">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setCompanyId(c.id)}
                                >
                                  Gerenciar
                                </Button>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                  {!report.data?.rows.length && (
                    <p className="py-6 text-sm text-muted-foreground">
                      Nenhuma empresa para estes filtros.
                    </p>
                  )}
                  <div className="flex items-center justify-end gap-2 text-sm">
                    <Button
                      variant="outline"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => p - 1)}
                    >
                      Anterior
                    </Button>
                    {page} /{" "}
                    {Math.max(1, Math.ceil((report.data?.total ?? 0) / 25))}
                    <Button
                      variant="outline"
                      disabled={page * 25 >= (report.data?.total ?? 0)}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      Próxima
                    </Button>
                  </div>
                </section>
              </TabsPanel>
            </Tabs>
          </>
        )}
        {creating && (
          <CreateCompanyModal
            workspaceId={workspaceId}
            onClose={() => setCreating(false)}
            onCreated={(id) => setCompanyId(id)}
          />
        )}{" "}
        {companyId && (
          <Modal
            title="Cadastro e acompanhamento da empresa"
            onClose={() => setCompanyId(null)}
          >
            <CompanyHostingPanel
              key={companyId}
              workspaceId={workspaceId}
              companyId={companyId}
            />
          </Modal>
        )}
      </div>
    </WorkspaceLayout>
  );
}
