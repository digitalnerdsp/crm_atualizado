import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import WorkspaceLayout from "@/components/common/workspace-layout";
import { HostingDigestSettings } from "@/components/crm/hosting/digest-settings";
import { HostingEditModal } from "@/components/crm/hosting/hosting-edit-modal";
import { dateLabel, Field, Modal, today } from "@/components/finance/shared";
import PageTitle from "@/components/page-title";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@/components/ui/tabs";
import { getHostingReport } from "@/fetchers/crm/hosting";
import { useCrmCompanies } from "@/hooks/queries/crm/use-crm-companies";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/workspace/$workspaceId/hosting",
)({ component: HostingPage });

const PAGE = 25;

function HostingPage() {
  const { workspaceId } = Route.useParams();
  return <HostingWorkspace key={workspaceId} workspaceId={workspaceId} />;
}

function HostingWorkspace({ workspaceId }: { workspaceId: string }) {
  const permissions = useWorkspacePermission();
  const enabled =
    !permissions.isCheckingPermissions && permissions.canViewHosting();
  const now = today();
  const [search, setSearch] = useState("");
  const [window, setWindow] = useState("");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const report = useQuery({
    queryKey: ["crm", "hosting-report", workspaceId, search, window],
    queryFn: () =>
      getHostingReport(workspaceId, {
        from: `${now.slice(0, 7)}-01`,
        to: now,
        mode: "third_party",
        search: search || undefined,
        attention: window === "no_date" ? "no_date" : undefined,
        window: window === "overdue" ? "overdue" : undefined,
      }),
    enabled,
  });
  const canUpdate = permissions.canUpdateHosting();
  const rows = (report.data?.rows ?? []).filter(
    (r) => window !== "due" || r.attention === "due",
  );
  return (
    <WorkspaceLayout title="Hospedagem">
      <PageTitle title="Hospedagem" />
      <div className="mx-auto w-full max-w-6xl space-y-5 p-4 md:p-6">
        <PageHeader
          title="Hospedagem"
          description="Clientes com hospedagem de terceiros e o vencimento de cada uma, para oferecer a nossa antes da renovação."
          actions={
            enabled && canUpdate ? (
              <Button onClick={() => setAdding(true)}>Adicionar cliente</Button>
            ) : null
          }
        />
        {permissions.isCheckingPermissions ? (
          <p>Verificando acesso…</p>
        ) : !permissions.canViewHosting() ? (
          <p role="alert">Você não tem permissão para acessar a hospedagem.</p>
        ) : (
          <Tabs defaultValue="clients">
            <TabsList>
              <TabsTab value="clients">Clientes</TabsTab>
              {permissions.canNotifyHosting() && (
                <TabsTab value="digest">Aviso interno</TabsTab>
              )}
            </TabsList>
            <TabsPanel value="clients">
              <section className="space-y-4 rounded-xl border bg-card p-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Pesquisar">
                    <Input
                      value={search}
                      maxLength={200}
                      placeholder="Empresa, domínio ou provedor"
                      onChange={(e) => {
                        setSearch(e.target.value);
                        setPage(1);
                      }}
                    />
                  </Field>
                  <Field label="Vencimento">
                    <NativeSelect
                      value={window}
                      onChange={(e) => {
                        setWindow(e.target.value);
                        setPage(1);
                      }}
                    >
                      <option value="">Todos</option>
                      <option value="due">
                        Vencendo (dentro da antecedência)
                      </option>
                      <option value="overdue">Vencidos</option>
                      <option value="no_date">Sem data informada</option>
                    </NativeSelect>
                  </Field>
                </div>
                {report.error && (
                  <p role="alert" className="text-sm text-destructive">
                    {report.error.message}
                  </p>
                )}
                <div className="overflow-x-auto">
                  <Table className="w-full text-left text-sm">
                    <TableHeader>
                      <TableRow>
                        {[
                          "Empresa",
                          "Provedor e domínio",
                          "Vencimento",
                          "Situação",
                          "Ações",
                        ].map((h) => (
                          <TableHead key={h} className="p-3">
                            {h}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.slice((page - 1) * PAGE, page * PAGE).map((c) => (
                        <TableRow key={c.id} className="border-t align-top">
                          <TableCell className="min-w-48 p-3">
                            <Link
                              className="font-medium underline"
                              to="/dashboard/workspace/$workspaceId/crm/companies/$companyId"
                              params={{ workspaceId, companyId: c.id }}
                            >
                              {c.name}
                            </Link>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {c.ownerName ?? "Sem responsável"}
                            </p>
                          </TableCell>
                          <TableCell className="min-w-44 p-3">
                            {c.hosting.provider || "Provedor não informado"}
                            <p className="text-xs text-muted-foreground">
                              {c.hosting.domain}
                            </p>
                          </TableCell>
                          <TableCell className="whitespace-nowrap p-3">
                            {c.hosting.renewsOn
                              ? dateLabel(c.hosting.renewsOn)
                              : "Sem data"}
                            {c.daysRemaining !== null && (
                              <p className="text-xs text-muted-foreground">
                                {c.daysRemaining < 0
                                  ? `${Math.abs(c.daysRemaining)} dias após a data`
                                  : `${c.daysRemaining} dias restantes`}
                              </p>
                            )}
                          </TableCell>
                          <TableCell className="p-3">
                            <StatusBadge
                              tone={
                                c.attention === "due"
                                  ? c.daysRemaining !== null &&
                                    c.daysRemaining < 0
                                    ? "danger"
                                    : "warning"
                                  : c.attention === "no_date"
                                    ? "neutral"
                                    : "success"
                              }
                            >
                              {c.attention === "due"
                                ? c.daysRemaining !== null &&
                                  c.daysRemaining < 0
                                  ? "Vencida"
                                  : "Vencendo"
                                : c.attention === "no_date"
                                  ? "Sem data"
                                  : "Em dia"}
                            </StatusBadge>
                          </TableCell>
                          <TableCell className="p-3">
                            {canUpdate && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setEditing(c.id)}
                              >
                                Editar
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                {!report.isLoading && !rows.length && (
                  <p className="py-6 text-sm text-muted-foreground">
                    Nenhum cliente com hospedagem de terceiros neste filtro.
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
                  {page} / {Math.max(1, Math.ceil(rows.length / PAGE))}
                  <Button
                    variant="outline"
                    disabled={page * PAGE >= rows.length}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Próxima
                  </Button>
                </div>
              </section>
            </TabsPanel>
            {permissions.canNotifyHosting() && (
              <TabsPanel value="digest">
                <HostingDigestSettings workspaceId={workspaceId} />
              </TabsPanel>
            )}
          </Tabs>
        )}
        {adding && (
          <AddClientModal
            workspaceId={workspaceId}
            onClose={() => setAdding(false)}
            onPick={(id) => {
              setAdding(false);
              setEditing(id);
            }}
          />
        )}
        {editing && (
          <HostingEditModal
            workspaceId={workspaceId}
            companyId={editing}
            onClose={() => setEditing(null)}
          />
        )}
      </div>
    </WorkspaceLayout>
  );
}

function AddClientModal({
  workspaceId,
  onClose,
  onPick,
}: {
  workspaceId: string;
  onClose: () => void;
  onPick: (companyId: string) => void;
}) {
  const [search, setSearch] = useState("");
  const companies = useCrmCompanies({
    workspaceId,
    search: search || undefined,
  });
  return (
    <Modal
      title="Adicionar cliente com hospedagem de terceiros"
      onClose={onClose}
    >
      <div className="space-y-3">
        <Field label="Buscar empresa">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Nome da empresa"
          />
        </Field>
        <ul className="max-h-72 space-y-1 overflow-y-auto">
          {companies.data?.items.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                className="w-full rounded-lg border p-2 text-left text-sm hover:bg-muted/50"
                onClick={() => onPick(c.id)}
              >
                {c.name}
              </button>
            </li>
          ))}
        </ul>
        {companies.isSuccess && !companies.data.items.length && (
          <p className="text-sm text-muted-foreground">
            Nenhuma empresa encontrada. Cadastre a empresa em Empresas e
            contatos.
          </p>
        )}
      </div>
    </Modal>
  );
}
