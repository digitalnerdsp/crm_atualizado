import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Pause, Play, TrendingUp, XCircle } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import WorkspaceLayout from "@/components/common/workspace-layout";
import ContractActionDialog, {
  type ContractActionKind,
} from "@/components/crm/contract-action-dialog";
import ContractStatusBadge from "@/components/crm/contract-status-badge";
import { BILLING_LABEL_KEY } from "@/components/crm/deal-services-editor";
import PageTitle from "@/components/page-title";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { useCrmContract } from "@/hooks/queries/crm/use-crm-contracts";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/money";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/workspace/$workspaceId/crm/contracts/$contractId",
)({
  component: RouteComponent,
});

function formatDate(value: string | Date | null) {
  return value ? new Date(value).toLocaleDateString("pt-BR") : "—";
}

function Fact({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function RouteComponent() {
  const { t } = useTranslation();
  const { workspaceId, contractId } = Route.useParams();
  const { data: contract, isLoading } = useCrmContract(contractId, workspaceId);
  const { canChangeDealStage, canUpdateDeals, canViewFinance } =
    useWorkspacePermission();
  const [action, setAction] = useState<ContractActionKind | null>(null);

  if (isLoading) {
    return (
      <WorkspaceLayout title={t("crm:contracts.title")}>
        <div className="mx-auto w-full max-w-4xl space-y-4 px-5 py-6">
          <Skeleton className="h-8 w-1/2" />
          <Skeleton className="h-40 w-full" />
        </div>
      </WorkspaceLayout>
    );
  }

  if (!contract) {
    return (
      <WorkspaceLayout title={t("crm:contracts.title")}>
        <p className="px-5 py-6 text-sm text-muted-foreground">
          {t("crm:contracts.notFound")}
        </p>
      </WorkspaceLayout>
    );
  }

  const isOpen = contract.status === "active" || contract.status === "paused";
  const canTransition = isOpen && canChangeDealStage();

  const headerActions = (
    <>
      {canViewFinance() && (
        <Link
          to="/dashboard/workspace/$workspaceId/recurrence"
          params={{ workspaceId }}
          search={{ contractId }}
          className="rounded-md border px-3 py-1.5 text-xs"
        >
          Financeiro do contrato
        </Link>
      )}
      {isOpen && canUpdateDeals() ? (
        <Button
          size="sm"
          variant="outline"
          className="h-8"
          onClick={() => setAction("value")}
        >
          <TrendingUp className="size-4" />
          {t("crm:contracts.changeValue")}
        </Button>
      ) : null}
      {canTransition && contract.status === "active" ? (
        <Button
          size="sm"
          variant="outline"
          className="h-8"
          onClick={() => setAction("pause")}
        >
          <Pause className="size-4" />
          {t("crm:contracts.pause")}
        </Button>
      ) : null}
      {canTransition && contract.status === "paused" ? (
        <Button
          size="sm"
          variant="outline"
          className="h-8"
          onClick={() => setAction("resume")}
        >
          <Play className="size-4" />
          {t("crm:contracts.resume")}
        </Button>
      ) : null}
      {canTransition ? (
        <>
          <Button
            size="sm"
            variant="outline"
            className="h-8"
            onClick={() => setAction("finish")}
          >
            {t("crm:contracts.finish")}
          </Button>
          <Button
            size="sm"
            variant="destructive"
            className="h-8"
            onClick={() => setAction("cancel")}
          >
            <XCircle className="size-4" />
            {t("crm:contracts.cancel")}
          </Button>
        </>
      ) : null}
    </>
  );

  return (
    <WorkspaceLayout title={contract.title} headerActions={headerActions}>
      <PageTitle title={contract.title} />

      <div className="mx-auto w-full max-w-4xl px-5 py-6">
        <Link
          to="/dashboard/workspace/$workspaceId/crm/contracts"
          params={{ workspaceId }}
          className="mb-4 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          {t("crm:contracts.title")}
        </Link>

        <header className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-muted-foreground">
              #{contract.number}
            </span>
            <ContractStatusBadge status={contract.status} size="default" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {contract.title}
          </h1>
          <Link
            to="/dashboard/workspace/$workspaceId/crm/companies/$companyId"
            params={{ workspaceId, companyId: contract.company.id }}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            {contract.company.name}
          </Link>
          <p className="text-2xl font-semibold tabular-nums">
            {t("crm:contracts.perMonth", {
              value: formatMoney(contract.monthlyValueCents, contract.currency),
            })}
          </p>
        </header>

        <Separator className="my-6" />

        <dl className="grid grid-cols-2 gap-x-8 gap-y-4 text-sm sm:grid-cols-4">
          <Fact label={t("crm:contracts.startsAt")}>
            {formatDate(contract.startsAt)}
          </Fact>
          <Fact label={t("crm:contracts.endsAt")}>
            {contract.endsAt
              ? formatDate(contract.endsAt)
              : t("crm:contracts.indefinite")}
          </Fact>
          <Fact label={t("crm:contracts.billingDay")}>
            {contract.billingDay
              ? t("crm:contracts.billingDayValue", { day: contract.billingDay })
              : "—"}
          </Fact>
          <Fact label={t("crm:contracts.originDeal")}>
            {contract.deal?.id ? (
              <Link
                to="/dashboard/workspace/$workspaceId/crm/deals/$dealId"
                params={{ workspaceId, dealId: contract.deal.id }}
                className="hover:underline"
              >
                #{contract.deal.number} {contract.deal.title}
              </Link>
            ) : (
              "—"
            )}
          </Fact>
          {contract.cancelReason?.name ? (
            <Fact label={t("crm:contracts.cancelReason")}>
              {contract.cancelReason.name}
              {contract.cancelNote ? ` — ${contract.cancelNote}` : ""}
            </Fact>
          ) : null}
        </dl>

        <Separator className="my-6" />

        <section className="space-y-3">
          <h2 className="text-sm font-medium">{t("crm:contracts.services")}</h2>
          {contract.services.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("crm:contracts.noServices")}
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <Table className="w-full min-w-[480px] text-sm">
                <TableBody>
                  {contract.services.map((line) => (
                    <TableRow
                      key={line.id}
                      className="border-b border-border/60 last:border-b-0"
                    >
                      <TableCell className="px-3 py-2">
                        {line.name}
                        <Badge variant="outline" size="sm" className="ml-2">
                          {t(
                            `crm:services.${BILLING_LABEL_KEY[line.billingType]}`,
                          )}
                        </Badge>
                      </TableCell>
                      <TableCell className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                        {line.quantity} ×{" "}
                        {formatMoney(line.unitPriceCents, contract.currency)}
                        {line.discountPercent > 0
                          ? ` −${line.discountPercent}%`
                          : ""}
                      </TableCell>
                      <TableCell className="w-32 px-3 py-2 text-right tabular-nums">
                        {formatMoney(line.totalCents, contract.currency)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </section>

        <Separator className="my-6" />

        {/* O histórico é o que torna o MRR auditável: cada linha diz quanto o
            contrato contava na receita antes e depois. */}
        <section className="space-y-3">
          <h2 className="text-sm font-medium">{t("crm:contracts.history")}</h2>
          <ol className="space-y-2">
            {contract.events.map((event) => {
              const delta =
                event.toMonthlyValueCents - event.fromMonthlyValueCents;
              return (
                <li
                  key={event.id}
                  className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-border/60 pb-2 text-sm last:border-b-0"
                >
                  <div className="flex items-baseline gap-2">
                    <span className="w-24 shrink-0 tabular-nums text-xs text-muted-foreground">
                      {formatDate(event.occurredAt)}
                    </span>
                    <span>{t(`crm:contracts.event_${event.type}`)}</span>
                    {event.note ? (
                      <span className="text-xs text-muted-foreground">
                        {event.note}
                      </span>
                    ) : null}
                  </div>
                  <span
                    className={cn(
                      "tabular-nums text-xs",
                      delta > 0 && "text-success-foreground",
                      delta < 0 && "text-destructive-foreground",
                      delta === 0 && "text-muted-foreground",
                    )}
                  >
                    {formatMoney(event.fromMonthlyValueCents)} →{" "}
                    {formatMoney(event.toMonthlyValueCents)}
                  </span>
                </li>
              );
            })}
          </ol>
        </section>
      </div>

      {action ? (
        <ContractActionDialog
          kind={action}
          workspaceId={workspaceId}
          contractId={contract.id}
          monthlyValueCents={contract.monthlyValueCents}
          onClose={() => setAction(null)}
        />
      ) : null}
    </WorkspaceLayout>
  );
}
