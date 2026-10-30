import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  Building2,
  CalendarClock,
  FolderKanban,
  RotateCcw,
  User,
} from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import WorkspaceLayout from "@/components/common/workspace-layout";
import DealServicesEditor from "@/components/crm/deal-services-editor";
import GenerateContractPrompt from "@/components/crm/generate-contract-prompt";
import CrmTimeline from "@/components/crm/timeline";
import PageTitle from "@/components/page-title";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { useReopenDeal } from "@/hooks/mutations/crm/use-crm-mutations";
import { useCrmDeal } from "@/hooks/queries/crm/use-crm-deal";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import { formatDateMedium, formatDurationShort } from "@/lib/format";
import { getInitials } from "@/lib/get-initials";
import { formatMoney } from "@/lib/money";
import { toast } from "@/lib/toast";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/workspace/$workspaceId/crm/deals/$dealId",
)({
  component: RouteComponent,
});

const STATUS_TONE: Record<"open" | "won" | "lost", StatusTone> = {
  open: "info",
  won: "success",
  lost: "danger",
};

function DataRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-right">{children}</dd>
    </div>
  );
}

function RouteComponent() {
  const { t } = useTranslation();
  const { workspaceId, dealId } = Route.useParams();
  const { data: deal, isLoading } = useCrmDeal(dealId, workspaceId);
  const { canChangeDealStage, canUpdateDeals } = useWorkspacePermission();
  const { mutateAsync: reopen, isPending: isReopening } = useReopenDeal();

  if (isLoading) {
    return (
      <WorkspaceLayout title={t("crm:list.title")}>
        <div className="mx-auto w-full max-w-7xl space-y-4 p-4 md:p-6">
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-40 w-full" />
        </div>
      </WorkspaceLayout>
    );
  }

  if (!deal) {
    return (
      <WorkspaceLayout title={t("crm:list.title")}>
        <p className="px-5 py-6 text-sm text-muted-foreground">
          {t("crm:deal.notFound")}
        </p>
      </WorkspaceLayout>
    );
  }

  const probability = deal.probability ?? deal.stage.probability;
  const isClosed = deal.status !== "open";

  async function handleReopen() {
    try {
      await reopen({ dealId, workspaceId });
      toast.success(t("crm:deal.reopened"));
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("crm:board.moveError"),
      );
    }
  }

  return (
    <WorkspaceLayout
      title={deal.title}
      headerActions={
        isClosed && canChangeDealStage() ? (
          <Button
            size="sm"
            variant="outline"
            className="h-8"
            onClick={handleReopen}
            disabled={isReopening}
          >
            <RotateCcw className="size-4" />
            {t("crm:deal.reopen")}
          </Button>
        ) : null
      }
    >
      <PageTitle title={deal.title} />

      <div className="mx-auto w-full max-w-7xl space-y-4 p-4 md:p-6">
        <Link
          to="/dashboard/workspace/$workspaceId/crm"
          params={{ workspaceId }}
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          {t("crm:board.title")}
        </Link>

        <header className="flex flex-wrap items-end justify-between gap-4 rounded-xl border bg-card p-5">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs font-semibold text-muted-foreground">
                #{deal.number}
              </span>
              <StatusBadge tone={STATUS_TONE[deal.status]}>
                {t(`crm:deal.${deal.status}`)}
              </StatusBadge>
              {deal.status === "open" ? (
                <StatusBadge tone="neutral">{deal.stage.name}</StatusBadge>
              ) : null}
            </div>
            <h1 className="text-2xl font-bold">{deal.title}</h1>
            {deal.company ? (
              <Link
                to="/dashboard/workspace/$workspaceId/crm/companies/$companyId"
                params={{ workspaceId, companyId: deal.company.id }}
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
              >
                <Building2 className="size-4" />
                {deal.company.name}
              </Link>
            ) : null}
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Valor do negócio</p>
            <p className="text-3xl font-bold tabular-nums text-primary">
              {formatMoney(deal.valueCents, deal.currency)}
            </p>
          </div>
        </header>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_21rem]">
          <div className="min-w-0 space-y-4">
            <div className="space-y-3 rounded-xl border bg-card p-4">
              {/* Os itens ficam logo abaixo do valor porque são eles que o
                  formam: é aqui que se lê o que foi vendido, não só por quanto. */}
              <DealServicesEditor
                workspaceId={workspaceId}
                dealId={deal.id}
                currency={deal.currency}
                valueCents={deal.valueCents}
                valueIsManual={deal.valueIsManual}
                lines={deal.services}
                canEdit={canUpdateDeals()}
              />
              <GenerateContractPrompt
                workspaceId={workspaceId}
                dealId={deal.id}
              />
            </div>

            <section className="space-y-3 rounded-xl border bg-card p-4">
              <div className="flex items-baseline justify-between">
                <h2 className="text-sm font-semibold">
                  {t("crm:deal.deliveryTasks")}
                </h2>
                {deal.deliveryTasks.length > 0 ? (
                  <span className="text-xs font-semibold tabular-nums text-muted-foreground">
                    {deal.completedTaskCount}/{deal.deliveryTasks.length}
                  </span>
                ) : null}
              </div>

              {deal.deliveryTasks.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t("crm:deal.noDeliveryTasks")}
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {deal.deliveryTasks.map((task) => (
                    <li key={task.id}>
                      <Link
                        to="/dashboard/workspace/$workspaceId/project/$projectId/task/$taskId"
                        params={{
                          workspaceId,
                          projectId: task.projectId,
                          taskId: task.id,
                        }}
                        className="flex items-center gap-2 rounded-lg border bg-background/40 px-3 py-2 text-sm hover:bg-muted/40"
                      >
                        <FolderKanban className="size-3.5 shrink-0 text-muted-foreground" />
                        <span
                          className={
                            task.isDone
                              ? "flex-1 text-muted-foreground line-through"
                              : "flex-1 font-semibold"
                          }
                        >
                          {task.title}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {task.projectName}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="space-y-3 rounded-xl border bg-card p-4">
              <h2 className="text-sm font-semibold">
                {t("crm:timeline.title")}
              </h2>
              <CrmTimeline workspaceId={workspaceId} dealId={dealId} />
            </section>
          </div>

          <aside className="min-w-0 space-y-4 lg:sticky lg:top-4 lg:self-start">
            <section className="rounded-xl border bg-card p-4">
              <h2 className="mb-3 text-sm font-semibold">Dados do negócio</h2>
              <dl className="divide-y divide-border/60 text-sm">
                <DataRow label={t("crm:deal.probability")}>
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${Math.min(100, probability)}%` }}
                      />
                    </div>
                    <span className="font-bold tabular-nums">
                      {probability}%
                    </span>
                  </div>
                </DataRow>
                <DataRow label={t("crm:deal.expectedCloseLabel")}>
                  <span className="inline-flex items-center gap-1.5 font-bold">
                    <CalendarClock className="size-3.5 text-muted-foreground" />
                    {deal.expectedCloseDate
                      ? formatDateMedium(new Date(deal.expectedCloseDate))
                      : "—"}
                  </span>
                </DataRow>
                <DataRow label={t("crm:deal.ownerLabel")}>
                  {deal.owner?.name ? (
                    <span className="inline-flex items-center gap-1.5 font-bold">
                      <Avatar className="size-5">
                        <AvatarImage src={deal.owner.image ?? undefined} />
                        <AvatarFallback className="text-[9px]">
                          {getInitials(deal.owner.name)}
                        </AvatarFallback>
                      </Avatar>
                      {deal.owner.name}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 font-bold">
                      <User className="size-3.5 text-muted-foreground" />—
                    </span>
                  )}
                </DataRow>
                {deal.source ? (
                  <DataRow label={t("crm:deal.sourceLabel")}>
                    <span className="font-bold">{deal.source.name}</span>
                  </DataRow>
                ) : null}
                {deal.lostReason ? (
                  <DataRow label={t("crm:close.reasonLabel")}>
                    <span className="font-bold">{deal.lostReason.name}</span>
                  </DataRow>
                ) : null}
                {deal.probability === null ? (
                  <p className="pt-2 text-xs text-muted-foreground">
                    {t("crm:deal.inheritedFromStage")}
                  </p>
                ) : null}
              </dl>
            </section>

            <section className="rounded-xl border bg-card p-4">
              <h2 className="mb-3 text-sm font-semibold">
                {t("crm:deal.history")}
              </h2>
              {deal.stageHistory.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t("crm:deal.noHistory")}
                </p>
              ) : (
                <ol className="relative space-y-4 border-l border-border pl-4">
                  {deal.stageHistory.map((entry) => {
                    const current = entry.exitedAt === null;
                    return (
                      <li key={entry.id} className="relative text-sm">
                        <span
                          className={`absolute -left-[1.3rem] top-1.5 size-2.5 rounded-full border-2 border-card ${current ? "bg-primary" : "bg-muted-foreground/50"}`}
                        />
                        <p className="font-bold">{entry.toStageName ?? "—"}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDateMedium(new Date(entry.enteredAt))} ·{" "}
                          {current
                            ? t("crm:deal.currentStage")
                            : (formatDurationShort(entry.durationSeconds) ??
                              "—")}
                        </p>
                      </li>
                    );
                  })}
                </ol>
              )}
            </section>
          </aside>
        </div>
      </div>
    </WorkspaceLayout>
  );
}
