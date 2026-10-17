import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { FileSignature, Plus } from "lucide-react";
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
import { useCrmContracts } from "@/hooks/queries/crm/use-crm-contracts";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
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

  const headerActions = (
    <>
      <Select
        value={status ?? ALL}
        onValueChange={(value) => {
          if (typeof value !== "string") return;
          setStatus(value === ALL ? undefined : (value as ContractStatus));
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
          <SelectItem value={ALL}>{t("crm:contracts.allStatuses")}</SelectItem>
          {STATUSES.map((item) => (
            <SelectItem key={item} value={item}>
              {t(`crm:contracts.${item}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {canCreateDeals() ? (
        <Button size="sm" className="h-8" onClick={() => setIsCreateOpen(true)}>
          <Plus className="size-4" />
          {t("crm:contracts.newContract")}
        </Button>
      ) : null}
    </>
  );

  return (
    <WorkspaceLayout
      title={t("crm:contracts.title")}
      headerActions={headerActions}
    >
      <PageTitle title={t("crm:contracts.title")} />

      <div className="space-y-4 px-5 py-4">
        {/* O MRR ativo abre a página: é a pergunta que traz alguém aqui. As
            contagens por situação mostram de onde vem e o que está parado. */}
        {data ? (
          <dl className="flex flex-wrap items-end gap-x-10 gap-y-3">
            <div>
              <dt className="text-xs text-muted-foreground">
                {t("crm:contracts.activeMrr")}
              </dt>
              <dd className="text-2xl font-semibold tabular-nums">
                {formatMoney(data.summary.activeMrrCents)}
              </dd>
            </div>
            {STATUSES.map((item) => (
              <div key={item}>
                <dt className="text-xs text-muted-foreground">
                  {t(`crm:contracts.${item}`)}
                </dt>
                <dd className="text-lg tabular-nums">
                  {data.summary.counts[item] ?? 0}
                </dd>
              </div>
            ))}
          </dl>
        ) : null}

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
          <div className="overflow-x-auto rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-14">#</TableHead>
                  <TableHead>{t("crm:contracts.client")}</TableHead>
                  <TableHead>{t("crm:contracts.statusFilter")}</TableHead>
                  <TableHead className="text-right">
                    {t("crm:contracts.monthlyValue")}
                  </TableHead>
                  <TableHead>{t("crm:contracts.startsAt")}</TableHead>
                  <TableHead>{t("crm:contracts.endsAt")}</TableHead>
                  <TableHead>{t("crm:contracts.billingDay")}</TableHead>
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
                        <span>{contract.company.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {contract.title}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <ContractStatusBadge status={contract.status} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
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
          </div>
        )}
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
