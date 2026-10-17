import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  Building2,
  CalendarClock,
  FolderKanban,
  RotateCcw,
  User,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import WorkspaceLayout from "@/components/common/workspace-layout";
import DealServicesEditor from "@/components/crm/deal-services-editor";
import GenerateContractPrompt from "@/components/crm/generate-contract-prompt";
import CrmTimeline from "@/components/crm/timeline";
import PageTitle from "@/components/page-title";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
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

const STATUS_VARIANT = {
  open: "secondary",
  won: "default",
  lost: "destructive",
} as const;

function RouteComponent() {
  const { t } = useTranslation();
  const { workspaceId, dealId } = Route.useParams();
  const { data: deal, isLoading } = useCrmDeal(dealId, workspaceId);
  const { canChangeDealStage, canUpdateDeals } = useWorkspacePermission();
  const { mutateAsync: reopen, isPending: isReopening } = useReopenDeal();

  if (isLoading) {
    return (
      <WorkspaceLayout title={t("crm:list.title")}>
        <div className="mx-auto w-full max-w-4xl space-y-4 px-5 py-6">
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

      <div className="mx-auto w-full max-w-4xl px-5 py-6">
        <Link
          to="/dashboard/workspace/$workspaceId/crm"
          params={{ workspaceId }}
          className="mb-4 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          {t("crm:board.title")}
        </Link>

        <header className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-muted-foreground">
              #{deal.number}
            </span>
            <Badge variant={STATUS_VARIANT[deal.status]}>
              {t(`crm:deal.${deal.status}`)}
            </Badge>
            <Badge variant="outline">{deal.stage.name}</Badge>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {deal.title}
          </h1>
          <p className="text-2xl font-semibold tabular-nums">
            {formatMoney(deal.valueCents, deal.currency)}
          </p>
        </header>

        <Separator className="my-6" />

        {/* Os itens ficam logo abaixo do valor porque são eles que o formam:
            é aqui que se lê o que foi vendido, não só por quanto. */}
        <DealServicesEditor
          workspaceId={workspaceId}
          dealId={deal.id}
          currency={deal.currency}
          valueCents={deal.valueCents}
          valueIsManual={deal.valueIsManual}
          lines={deal.services}
          canEdit={canUpdateDeals()}
        />

        <div className="mt-3">
          <GenerateContractPrompt workspaceId={workspaceId} dealId={deal.id} />
        </div>

        <Separator className="my-6" />

        <dl className="grid grid-cols-2 gap-x-8 gap-y-4 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs text-muted-foreground">
              {t("crm:deal.probability")}
            </dt>
            <dd className="tabular-nums">
              {probability}%
              {deal.probability === null ? (
                <span className="ml-1 text-xs text-muted-foreground">
                  ({t("crm:deal.inheritedFromStage")})
                </span>
              ) : null}
            </dd>
          </div>

          <div>
            <dt className="text-xs text-muted-foreground">
              {t("crm:deal.expectedCloseLabel")}
            </dt>
            <dd className="flex items-center gap-1.5">
              <CalendarClock className="size-3.5 text-muted-foreground" />
              {deal.expectedCloseDate
                ? formatDateMedium(new Date(deal.expectedCloseDate))
                : "—"}
            </dd>
          </div>

          <div>
            <dt className="text-xs text-muted-foreground">
              {t("crm:deal.ownerLabel")}
            </dt>
            <dd className="flex items-center gap-1.5">
              {deal.owner?.name ? (
                <>
                  <Avatar className="size-5">
                    <AvatarImage src={deal.owner.image ?? undefined} />
                    <AvatarFallback className="text-[9px]">
                      {getInitials(deal.owner.name)}
                    </AvatarFallback>
                  </Avatar>
                  {deal.owner.name}
                </>
              ) : (
                <>
                  <User className="size-3.5 text-muted-foreground" />—
                </>
              )}
            </dd>
          </div>

          <div>
            <dt className="text-xs text-muted-foreground">
              {t("crm:deal.companyLabel")}
            </dt>
            <dd className="flex items-center gap-1.5">
              <Building2 className="size-3.5 text-muted-foreground" />
              {deal.company?.name ?? "—"}
            </dd>
          </div>

          {deal.lostReason ? (
            <div>
              <dt className="text-xs text-muted-foreground">
                {t("crm:close.reasonLabel")}
              </dt>
              <dd>{deal.lostReason.name}</dd>
            </div>
          ) : null}

          {deal.source ? (
            <div>
              <dt className="text-xs text-muted-foreground">
                {t("crm:deal.sourceLabel")}
              </dt>
              <dd>{deal.source.name}</dd>
            </div>
          ) : null}
        </dl>

        <Separator className="my-6" />

        <section className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-medium">
              {t("crm:deal.deliveryTasks")}
            </h2>
            {deal.deliveryTasks.length > 0 ? (
              <span className="text-xs tabular-nums text-muted-foreground">
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
                    className="flex items-center gap-2 text-sm hover:underline"
                  >
                    <FolderKanban className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">
                      {task.projectName}
                    </span>
                    <span className={task.isDone ? "line-through" : ""}>
                      {task.title}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <Separator className="my-6" />

        <section className="space-y-3">
          <h2 className="text-sm font-medium">{t("crm:timeline.title")}</h2>
          <CrmTimeline workspaceId={workspaceId} dealId={dealId} />
        </section>

        <Separator className="my-6" />

        <section className="space-y-3">
          <h2 className="text-sm font-medium">{t("crm:deal.history")}</h2>
          {deal.stageHistory.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("crm:deal.noHistory")}
            </p>
          ) : (
            <ol className="space-y-2 text-sm">
              {deal.stageHistory.map((entry) => (
                <li key={entry.id} className="flex items-baseline gap-3">
                  <span className="w-32 shrink-0 text-xs tabular-nums text-muted-foreground">
                    {formatDateMedium(new Date(entry.enteredAt))}
                  </span>
                  <span className="flex-1">
                    {entry.fromStageName ? (
                      <>
                        <span className="text-muted-foreground">
                          {entry.fromStageName}
                        </span>
                        <span className="mx-1.5 text-muted-foreground">→</span>
                      </>
                    ) : null}
                    <span className="font-medium">
                      {entry.toStageName ?? "—"}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {entry.exitedAt === null
                      ? t("crm:deal.currentStage")
                      : (formatDurationShort(entry.durationSeconds) ?? "—")}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </WorkspaceLayout>
  );
}
