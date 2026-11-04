import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  FileSignature,
  FileSpreadsheet,
  PauseCircle,
  Plus,
  RefreshCw,
  XCircle,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import WorkspaceLayout from "@/components/common/workspace-layout";
import ContractStatusBadge, {
  type ContractStatus,
} from "@/components/crm/contract-status-badge";
import CreateContractModal from "@/components/crm/create-contract-modal";
import PageTitle from "@/components/page-title";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { FilterPanel } from "@/components/ui/filter-panel";
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
import { useCrmContracts } from "@/hooks/queries/crm/use-crm-contracts";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import { downloadCsv } from "@/lib/download-csv";
import { formatMoney } from "@/lib/money";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/workspace/$workspaceId/crm/contracts/",
)({
  component: RouteComponent,
});

const STATUSES: ContractStatus[] = [
  "active",
  "paused",
  "cancelled",
  "finished",
];
const ALL = "__all__";

function formatDate(value: string | Date | null) {
  return value ? new Date(value).toLocaleDateString("pt-BR") : "—";
}

function RouteComponent() {
  const { t } = useTranslation();
  const { workspaceId } = Route.useParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<ContractStatus | undefined>();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const { canCreateDeals } = useWorkspacePermission();

  const { data, isLoading } = useCrmContracts({
    workspaceId,
    ...(status ? { status } : {}),
  });

  const headerActions = canCreateDeals() ? (
    <Button size="sm" className="h-8" onClick={() => setIsCreateOpen(true)}>
      <Plus className="size-4" />
      {t("crm:contracts.newContract")}
    </Button>
  ) : null;

  const exportCsv = () =>
    downloadCsv(
      [
        [
          "Nº",
          "Cliente",
          "Contrato",
          "Situação",
          "Valor mensal",
          "Início",
          "Fim",
          "Dia de cobrança",
        ],
        ...(data?.items ?? []).map((contract) => [
          String(contract.number),
          contract.company.name,
          contract.title,
          t(`crm:contracts.${contract.status}`),
          (contract.monthlyValueCents / 100).toFixed(2).replace(".", ","),
          formatDate(contract.startsAt),
          contract.endsAt ? formatDate(contract.endsAt) : "Indeterminado",
          contract.billingDay ? String(contract.billingDay) : "",
        ]),
      ],
      "contratos.csv",
    );

  return (
    <WorkspaceLayout
      title={t("crm:contracts.title")}
      headerActions={headerActions}
    >
      <PageTitle title={t("crm:contracts.title")} />

      <div className="mx-auto w-full max-w-7xl space-y-5 p-4 md:p-6">
        <PageHeader
          title={t("crm:contracts.title")}
          description="Contratos recorrentes dos clientes, com valor mensal e situação."
        />

        {data ? (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              label={t("crm:contracts.activeMrr")}
              value={formatMoney(data.summary.activeMrrCents)}
              icon={RefreshCw}
              tone="success"
            />
            <StatCard
              label={t("crm:contracts.active")}
              value={data.summary.counts.active ?? 0}
              icon={FileSignature}
              tone="primary"
              onClick={() => setStatus("active")}
            />
            <StatCard
              label={t("crm:contracts.paused")}
              value={data.summary.counts.paused ?? 0}
              icon={PauseCircle}
              tone="warning"
              onClick={() => setStatus("paused")}
            />
            <StatCard
              label={t("crm:contracts.cancelled")}
              value={data.summary.counts.cancelled ?? 0}
              icon={XCircle}
              tone="danger"
              onClick={() => setStatus("cancelled")}
            />
          </div>
        ) : null}

        <section className="space-y-4 rounded-xl border bg-card p-4">
          <FilterPanel values={{ status }}>
            <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 p-3">
              <Select
                value={status ?? ALL}
                onValueChange={(value) => {
                  if (typeof value !== "string") return;
                  setStatus(
                    value === ALL ? undefined : (value as ContractStatus),
                  );
                }}
              >
                <SelectTrigger
                  size="sm"
                  className="h-8 w-40"
                  aria-label={t("crm:contracts.statusFilter")}
                >
                  <SelectValue>
                    {status
                      ? t(`crm:contracts.${status}`)
                      : t("crm:contracts.allStatuses")}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>
                    {t("crm:contracts.allStatuses")}
                  </SelectItem>
                  {STATUSES.map((item) => (
                    <SelectItem key={item} value={item}>
                      {t(`crm:contracts.${item}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </FilterPanel>

          {isLoading ? (
            <Skeleton className="h-48 w-full" />
          ) : !data || data.items.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <FileSignature className="size-5" />
                </EmptyMedia>
                <EmptyTitle>{t("crm:contracts.title")}</EmptyTitle>
                <EmptyDescription>{t("crm:contracts.empty")}</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <>
              <Table containerClassName="max-h-[65vh] overflow-auto">
                <TableHeader>
                  <TableRow>
                    <TableHead className="sticky top-0 z-10 w-14 bg-card">
                      #
                    </TableHead>
                    <TableHead className="sticky top-0 z-10 bg-card">
                      {t("crm:contracts.client")}
                    </TableHead>
                    <TableHead className="sticky top-0 z-10 bg-card">
                      {t("crm:contracts.statusFilter")}
                    </TableHead>
                    <TableHead className="sticky top-0 z-10 bg-card text-right">
                      {t("crm:contracts.monthlyValue")}
                    </TableHead>
                    <TableHead className="sticky top-0 z-10 bg-card">
                      {t("crm:contracts.startsAt")}
                    </TableHead>
                    <TableHead className="sticky top-0 z-10 bg-card">
                      {t("crm:contracts.endsAt")}
                    </TableHead>
                    <TableHead className="sticky top-0 z-10 bg-card">
                      {t("crm:contracts.billingDay")}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.items.map((contract) => (
                    <TableRow
                      key={contract.id}
                      className="cursor-pointer"
                      onClick={() =>
                        navigate({
                          to: "/dashboard/workspace/$workspaceId/crm/contracts/$contractId",
                          params: { workspaceId, contractId: contract.id },
                        })
                      }
                    >
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {contract.number}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-semibold">
                            {contract.company.name}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {contract.title}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <ContractStatusBadge status={contract.status} />
                      </TableCell>
                      <TableCell className="text-right font-bold tabular-nums">
                        {formatMoney(
                          contract.monthlyValueCents,
                          contract.currency,
                        )}
                      </TableCell>
                      <TableCell className="tabular-nums text-muted-foreground">
                        {formatDate(contract.startsAt)}
                      </TableCell>
                      <TableCell className="tabular-nums text-muted-foreground">
                        {contract.endsAt
                          ? formatDate(contract.endsAt)
                          : t("crm:contracts.indefinite")}
                      </TableCell>
                      <TableCell className="tabular-nums text-muted-foreground">
                        {contract.billingDay
                          ? t("crm:contracts.billingDayValue", {
                              day: contract.billingDay,
                            })
                          : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
                <span>
                  <strong className="text-foreground tabular-nums">
                    {data.items.length}
                  </strong>{" "}
                  {data.items.length === 1 ? "contrato" : "contratos"}
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
        <CreateContractModal
          workspaceId={workspaceId}
          onClose={() => setIsCreateOpen(false)}
        />
      ) : null}
    </WorkspaceLayout>
  );
}
