import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Plus, Receipt, Search } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
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

  const headerActions = canCreateDeals() ? (
    <Button size="sm" className="h-8" onClick={() => setIsCreateOpen(true)}>
      <Plus className="size-4" />
      Nova venda
    </Button>
  ) : null;

  return (
    <WorkspaceLayout title="Vendas" headerActions={headerActions}>
      <PageTitle title="Vendas" />

      <div className="mx-auto w-full max-w-6xl space-y-4 px-5 py-6">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por empresa ou serviço…"
              className="h-8 w-64 pl-8"
            />
          </div>
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
              <SelectValue>{owner?.name ?? "Todos os vendedores"}</SelectValue>
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
          <div className="overflow-x-auto rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Empresa</TableHead>
                  <TableHead>Serviços</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead>Vendedor</TableHead>
                  <TableHead>Situação</TableHead>
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
                    <TableCell>
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
                    <TableCell className="text-right tabular-nums">
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
          </div>
        )}
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
