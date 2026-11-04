import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  FileSpreadsheet,
  Plus,
  Receipt,
  Repeat,
  Search,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { useMemo, useState } from "react";
import WorkspaceLayout from "@/components/common/workspace-layout";
import { CreateSaleModal } from "@/components/crm/create-sale-modal";
import {
  CONTRACT_STATUS_LABEL,
  PAYMENT_FORM_LABEL,
  SALE_KIND_LABEL,
} from "@/components/crm/sale-constants";
import PageTitle from "@/components/page-title";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { FilterPanel } from "@/components/ui/filter-panel";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/ui/stat-card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useCrmSales } from "@/hooks/queries/crm/use-crm-sales";
import { useWorkspaceMembers } from "@/hooks/queries/workspace/use-workspace-members";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import { downloadCsv } from "@/lib/download-csv";
import { formatDateMedium } from "@/lib/format";
import { formatMoney } from "@/lib/money";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/workspace/$workspaceId/crm/sales/",
)({
  component: RouteComponent,
});

const ALL = "__all__";
type Sort = "wonAt" | "valueCents" | "company";
const SORT_LABEL: Record<Sort, string> = {
  wonAt: "Mais recentes",
  valueCents: "Maior valor",
  company: "Empresa (A–Z)",
};

function RouteComponent() {
  const { workspaceId } = Route.useParams();
  const navigate = useNavigate();
  const { canCreateDeals } = useWorkspacePermission();
  const { data: members = [] } = useWorkspaceMembers(workspaceId);

  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [ownerUserId, setOwnerUserId] = useState("");
  const [sort, setSort] = useState<Sort>("wonAt");
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const query = useMemo(
    () => ({
      workspaceId,
      ...(search.trim() ? { search: search.trim() } : {}),
      ...(from ? { from: new Date(`${from}T00:00:00`).toISOString() } : {}),
      ...(to ? { to: new Date(`${to}T23:59:59`).toISOString() } : {}),
      ...(ownerUserId ? { ownerUserId } : {}),
      sortBy: sort,
      sortDirection: sort === "company" ? ("asc" as const) : ("desc" as const),
      limit: "100",
    }),
    [workspaceId, search, from, to, ownerUserId, sort],
  );
  const { data, isLoading } = useCrmSales(query);
  const owner = members.find((member) => member.id === ownerUserId);

  const items = data?.items ?? [];
  const totalCents = items.reduce((sum, sale) => sum + sale.valueCents, 0);
  const recurring = items.filter(
    (sale) => sale.kind && sale.kind !== "one_time",
  );

  const exportCsv = () =>
    downloadCsv(
      [
        [
          "Data",
          "Empresa",
          "Serviços",
          "Tipo",
          "Valor",
          "Vendedor",
          "Situação",
        ],
        ...items.map((sale) => [
          sale.soldAt ? formatDateMedium(sale.soldAt) : "",
          sale.company?.name ?? "Sem empresa",
          sale.services.join(", "),
          sale.kind ? SALE_KIND_LABEL[sale.kind] : "",
          (sale.valueCents / 100).toFixed(2).replace(".", ","),
          sale.owner?.name ?? "",
          sale.contract
            ? (CONTRACT_STATUS_LABEL[sale.contract.status] ??
              sale.contract.status)
            : "Concluída",
        ]),
      ],
      "vendas.csv",
    );

  const headerActions = (
    <>
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Buscar por empresa ou serviço…"
          className="h-8 w-64 pl-8"
        />
      </div>
      {canCreateDeals() ? (
        <Button size="sm" className="h-8" onClick={() => setIsCreateOpen(true)}>
          <Plus className="size-4" />
          Nova venda
        </Button>
      ) : null}
    </>
  );

  return (
    <WorkspaceLayout title="Vendas" headerActions={headerActions}>
      <PageTitle title="Vendas" />

      <div className="mx-auto w-full max-w-7xl space-y-5 p-4 md:p-6">
        <PageHeader
          title="Vendas"
          description="Tudo o que foi vendido, com valor, vendedor e situação do contrato."
        />

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            label="Total vendido"
            value={formatMoney(totalCents)}
            icon={Wallet}
            tone="success"
          />
          <StatCard
            label="Vendas"
            value={items.length}
            icon={Receipt}
            tone="primary"
          />
          <StatCard
            label="Ticket médio"
            value={formatMoney(
              items.length > 0 ? Math.round(totalCents / items.length) : 0,
            )}
            icon={TrendingUp}
            tone="info"
          />
          <StatCard
            label="Com recorrência"
            value={recurring.length}
            icon={Repeat}
            tone="warning"
          />
        </div>

        <section className="space-y-4 rounded-xl border bg-card p-4">
          <FilterPanel
            values={{ periodFrom: from, periodTo: to, ownerUserId }}
            extraActive={sort !== "wonAt" ? 1 : 0}
          >
            <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 p-3">
              <Input
                type="date"
                aria-label="De"
                value={from}
                onChange={(event) => setFrom(event.target.value)}
                className="h-8 w-36"
              />
              <Input
                type="date"
                aria-label="Até"
                value={to}
                onChange={(event) => setTo(event.target.value)}
                className="h-8 w-36"
              />
              <Select
                value={ownerUserId || ALL}
                onValueChange={(value) => {
                  if (typeof value === "string")
                    setOwnerUserId(value === ALL ? "" : value);
                }}
              >
                <SelectTrigger size="sm" className="h-8 w-44">
                  <SelectValue>
                    {owner?.name ?? "Todos os vendedores"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Todos os vendedores</SelectItem>
                  {members.map((member) => (
                    <SelectItem key={member.id} value={member.id}>
                      {member.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={sort}
                onValueChange={(value) => {
                  if (typeof value === "string") setSort(value as Sort);
                }}
              >
                <SelectTrigger size="sm" className="h-8 w-40">
                  <SelectValue>{SORT_LABEL[sort]}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(SORT_LABEL) as Sort[]).map((key) => (
                    <SelectItem key={key} value={key}>
                      {SORT_LABEL[key]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </FilterPanel>

          {isLoading ? (
            <div className="space-y-2">
              {[0, 1, 2, 3, 4].map((index) => (
                <Skeleton key={`sale-row-${index}`} className="h-11 w-full" />
              ))}
            </div>
          ) : !data || data.items.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Receipt className="size-5" />
                </EmptyMedia>
                <EmptyTitle>Nenhuma venda encontrada.</EmptyTitle>
              </EmptyHeader>
            </Empty>
          ) : (
            <>
              <Table containerClassName="max-h-[65vh] overflow-auto">
                <TableHeader>
                  <TableRow>
                    <TableHead className="sticky top-0 z-10 bg-card">
                      Data
                    </TableHead>
                    <TableHead className="sticky top-0 z-10 bg-card">
                      Empresa
                    </TableHead>
                    <TableHead className="sticky top-0 z-10 bg-card">
                      Serviços
                    </TableHead>
                    <TableHead className="sticky top-0 z-10 bg-card">
                      Tipo
                    </TableHead>
                    <TableHead className="sticky top-0 z-10 bg-card text-right">
                      Valor
                    </TableHead>
                    <TableHead className="sticky top-0 z-10 bg-card">
                      Vendedor
                    </TableHead>
                    <TableHead className="sticky top-0 z-10 bg-card">
                      Situação
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.items.map((sale) => (
                    <TableRow
                      key={sale.id}
                      className="cursor-pointer"
                      onClick={() =>
                        navigate({
                          to: "/dashboard/workspace/$workspaceId/crm/deals/$dealId",
                          params: { workspaceId, dealId: sale.id },
                        })
                      }
                    >
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {sale.soldAt ? formatDateMedium(sale.soldAt) : "—"}
                      </TableCell>
                      <TableCell className="font-semibold">
                        {sale.company?.name ?? (
                          <span className="text-destructive">Sem empresa</span>
                        )}
                      </TableCell>
                      <TableCell className="max-w-64 truncate text-muted-foreground">
                        {sale.services.length > 0
                          ? sale.services.join(", ")
                          : "—"}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {sale.kind ? SALE_KIND_LABEL[sale.kind] : "—"}
                      </TableCell>
                      <TableCell className="text-right font-bold tabular-nums">
                        {formatMoney(sale.valueCents, sale.currency)}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {sale.owner?.name ?? "—"}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-1">
                          {sale.contract ? (
                            <Badge variant="outline">
                              {CONTRACT_STATUS_LABEL[sale.contract.status] ??
                                sale.contract.status}
                            </Badge>
                          ) : (
                            <Badge variant="outline">Concluída</Badge>
                          )}
                          {sale.paymentForm ? (
                            <span className="text-xs text-muted-foreground">
                              {sale.paymentForm === "custom"
                                ? (sale.paymentFormNote ?? "Outra")
                                : PAYMENT_FORM_LABEL[sale.paymentForm]}
                            </span>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
                <span>
                  <strong className="text-foreground tabular-nums">
                    {items.length}
                  </strong>{" "}
                  {items.length === 1 ? "venda" : "vendas"} · Total{" "}
                  <strong className="text-foreground tabular-nums">
                    {formatMoney(totalCents)}
                  </strong>
                </span>
                <Button size="sm" variant="outline" onClick={exportCsv}>
                  <FileSpreadsheet className="size-4" />
                  Exportar lista (CSV)
                </Button>
              </div>
            </>
          )}
        </section>
      </div>

      {isCreateOpen ? (
        <CreateSaleModal
          workspaceId={workspaceId}
          onClose={() => setIsCreateOpen(false)}
        />
      ) : null}
    </WorkspaceLayout>
  );
}
