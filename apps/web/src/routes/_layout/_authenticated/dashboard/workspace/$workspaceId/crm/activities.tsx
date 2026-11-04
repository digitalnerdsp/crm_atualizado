import { createFileRoute, Link } from "@tanstack/react-router";
import { endOfWeek, isAfter, isBefore, isToday, startOfDay } from "date-fns";
import {
  AlertTriangle,
  CalendarClock,
  CalendarDays,
  Check,
  ListChecks,
  PhoneCall,
  Plus,
  Sun,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import WorkspaceLayout from "@/components/common/workspace-layout";
import {
  type ActivityDefaults,
  ActivityFormDialog,
  addDays,
  CompleteActivityDialog,
  dateInput,
  rescheduledAt,
} from "@/components/crm/activity-dialogs";
import { ActivityIcon } from "@/components/crm/timeline/activity-icon";
import PageTitle from "@/components/page-title";
import useAuth from "@/components/providers/auth-provider/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { useUpdateActivity } from "@/hooks/mutations/crm/use-crm-contact-mutations";
import { useCrmActivities } from "@/hooks/queries/crm/use-crm-activities";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import { formatDateMedium } from "@/lib/format";
import { toast } from "@/lib/toast";
import type { CrmActivity } from "@/types/crm";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/workspace/$workspaceId/crm/activities",
)({
  component: RouteComponent,
});

type Bucket = "overdue" | "today" | "week" | "later" | "noDate";

const BUCKET_ORDER: Bucket[] = ["overdue", "today", "week", "later", "noDate"];

/**
 * Buckets by urgency instead of a flat list: what a rep needs at 9am is "what
 * slipped and what is due today", not every pending activity by date.
 */
function bucketOf(activity: CrmActivity, now: Date): Bucket {
  if (!activity.dueAt) return "noDate";
  const due = new Date(activity.dueAt);
  if (isToday(due)) return "today";
  if (isBefore(due, startOfDay(now))) return "overdue";
  if (isAfter(due, endOfWeek(now, { weekStartsOn: 1 }))) return "later";
  return "week";
}

function RouteComponent() {
  const { t } = useTranslation();
  const { workspaceId } = Route.useParams();
  const { user } = useAuth();
  const { canViewAllDeals } = useWorkspacePermission();
  const { mutateAsync: update } = useUpdateActivity();
  const [creating, setCreating] = useState<ActivityDefaults | null>(null);
  const [completing, setCompleting] = useState<CrmActivity | null>(null);

  async function reschedule(activity: CrmActivity, day: string) {
    try {
      await update({
        activityId: activity.id,
        workspaceId,
        dueAt: rescheduledAt(activity, day),
      });
      toast.success("Atividade remarcada.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("crm:timeline.logError"),
      );
    }
  }
  const [onlyMine, setOnlyMine] = useState(true);
  const [bucketFilter, setBucketFilter] = useState<Bucket | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggleOne = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  async function rescheduleSelected(days: number) {
    const targets = (data?.items ?? []).filter((a) => selected.has(a.id));
    try {
      for (const activity of targets) {
        await update({
          activityId: activity.id,
          workspaceId,
          dueAt: rescheduledAt(activity, dateInput(addDays(days))),
        });
      }
      toast.success(
        `${targets.length} atividade${targets.length > 1 ? "s" : ""} remarcada${targets.length > 1 ? "s" : ""}.`,
      );
      setSelected(new Set());
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("crm:timeline.logError"),
      );
    }
  }

  const { data, isLoading } = useCrmActivities({
    workspaceId,
    pendingOnly: "true",
    ...(onlyMine && user?.id ? { ownerUserId: user.id } : {}),
    limit: "200",
  });

  const grouped = useMemo(() => {
    const now = new Date();
    const buckets = new Map<Bucket, CrmActivity[]>();
    for (const activity of data?.items ?? []) {
      const bucket = bucketOf(activity, now);
      const list = buckets.get(bucket);
      if (list) list.push(activity);
      else buckets.set(bucket, [activity]);
    }
    return buckets;
  }, [data]);

  const headerActions = (
    <div className="flex items-center gap-2">
      {canViewAllDeals() ? (
        <Button
          size="sm"
          variant={onlyMine ? "secondary" : "outline"}
          className="h-8"
          onClick={() => setOnlyMine((value) => !value)}
        >
          {onlyMine
            ? t("crm:activities.onlyMine")
            : t("crm:activities.everyone")}
        </Button>
      ) : null}
      <Button size="sm" className="h-8" onClick={() => setCreating({})}>
        <Plus className="size-4" />
        Nova atividade
      </Button>
    </div>
  );

  const total = data?.items.length ?? 0;

  return (
    <WorkspaceLayout
      title={t("crm:activities.title")}
      headerActions={headerActions}
    >
      <PageTitle title={t("crm:activities.title")} />

      <div className="mx-auto w-full max-w-7xl space-y-5 p-4 md:p-6">
        <PageHeader
          title={t("crm:activities.title")}
          description="Ligações, reuniões e tarefas comerciais que ainda estão pendentes."
        />

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            label="Atrasadas"
            value={grouped.get("overdue")?.length ?? 0}
            icon={AlertTriangle}
            tone="danger"
            onClick={() => setBucketFilter("overdue")}
          />
          <StatCard
            label="Hoje"
            value={grouped.get("today")?.length ?? 0}
            icon={Sun}
            tone="warning"
            onClick={() => setBucketFilter("today")}
          />
          <StatCard
            label="Esta semana"
            value={grouped.get("week")?.length ?? 0}
            icon={CalendarDays}
            tone="info"
            onClick={() => setBucketFilter("week")}
          />
          <StatCard
            label="Pendentes"
            value={total}
            icon={ListChecks}
            tone="primary"
            onClick={() => setBucketFilter(null)}
          />
        </div>

        {bucketFilter ? (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Mostrando:</span>
            <span className="font-semibold">
              {t(`crm:activities.${bucketFilter}`)}
            </span>
            <Button
              size="sm"
              variant="ghost"
              className="h-7"
              onClick={() => setBucketFilter(null)}
            >
              <X className="size-3.5" />
              Mostrar todas
            </Button>
          </div>
        ) : null}

        {selected.size > 0 ? (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/50 px-3 py-2 text-sm">
            <span className="font-semibold">
              {selected.size} selecionada{selected.size > 1 ? "s" : ""}
            </span>
            <div className="ml-auto flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="soft"
                onClick={() => rescheduleSelected(1)}
              >
                <CalendarClock className="size-4" />
                Remarcar para amanhã
              </Button>
              <Button
                size="sm"
                variant="soft"
                onClick={() => rescheduleSelected(7)}
              >
                Próxima semana
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setSelected(new Set())}
              >
                <X className="size-4" />
                Limpar
              </Button>
            </div>
          </div>
        ) : null}

        {isLoading ? (
          <div className="space-y-2">
            {[0, 1, 2, 3].map((index) => (
              <Skeleton key={`crm-agenda-${index}`} className="h-12 w-full" />
            ))}
          </div>
        ) : total === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <PhoneCall className="size-5" />
              </EmptyMedia>
              <EmptyTitle>{t("crm:activities.empty")}</EmptyTitle>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="space-y-6">
            {BUCKET_ORDER.filter(
              (b) => !bucketFilter || b === bucketFilter,
            ).map((bucket) => {
              const activities = grouped.get(bucket);
              if (!activities || activities.length === 0) return null;

              return (
                <section
                  key={bucket}
                  className="space-y-2 rounded-xl border bg-card p-4"
                >
                  <h2
                    className={`text-xs font-semibold uppercase tracking-wide ${
                      bucket === "overdue"
                        ? "text-destructive"
                        : "text-muted-foreground"
                    }`}
                  >
                    {t(`crm:activities.${bucket}`)} ({activities.length})
                  </h2>
                  <ul className="space-y-2">
                    {activities.map((activity) => (
                      <li
                        key={activity.id}
                        className="flex items-center gap-3 rounded-lg border bg-background/40 p-3"
                      >
                        <Checkbox
                          aria-label={`Selecionar ${activity.subject}`}
                          checked={selected.has(activity.id)}
                          onCheckedChange={() => toggleOne(activity.id)}
                        />
                        <ActivityIcon
                          type={activity.type}
                          className="size-4 shrink-0 text-muted-foreground"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold">
                            {activity.subject}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {activity.dueAt
                              ? `${formatDateMedium(new Date(activity.dueAt))} ${new Date(activity.dueAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`
                              : t("crm:activities.noDate")}
                            {activity.dealId ? (
                              <>
                                {" · "}
                                <Link
                                  to="/dashboard/workspace/$workspaceId/crm/deals/$dealId"
                                  params={{
                                    workspaceId,
                                    dealId: activity.dealId,
                                  }}
                                  className="hover:underline"
                                >
                                  {t("crm:nav.deals")}
                                </Link>
                              </>
                            ) : null}
                          </p>
                        </div>
                        {bucket === "overdue" ? (
                          <StatusBadge tone="danger">Atrasada</StatusBadge>
                        ) : bucket === "today" ? (
                          <StatusBadge tone="warning">Hoje</StatusBadge>
                        ) : null}
                        <Popover>
                          <PopoverTrigger
                            render={
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 shrink-0 px-2"
                                aria-label="Remarcar"
                              />
                            }
                          >
                            <CalendarClock className="size-3.5" />
                          </PopoverTrigger>
                          <PopoverContent className="w-56 space-y-2 p-3">
                            {(
                              [
                                ["Amanhã", 1],
                                ["Daqui a 3 dias", 3],
                                ["Próxima semana", 7],
                              ] as const
                            ).map(([label, days]) => (
                              <Button
                                key={label}
                                variant="outline"
                                size="sm"
                                className="w-full justify-start"
                                onClick={() =>
                                  reschedule(activity, dateInput(addDays(days)))
                                }
                              >
                                {label}
                              </Button>
                            ))}
                            <Input
                              type="date"
                              aria-label="Escolher data"
                              min={dateInput(new Date())}
                              onChange={(event) => {
                                if (event.target.value)
                                  reschedule(activity, event.target.value);
                              }}
                            />
                          </PopoverContent>
                        </Popover>
                        <Button
                          size="sm"
                          variant="success"
                          className="h-7 shrink-0 px-2"
                          aria-label={t("crm:timeline.complete")}
                          onClick={() => setCompleting(activity)}
                        >
                          <Check className="size-3.5" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        )}
      </div>
      {creating ? (
        <ActivityFormDialog
          workspaceId={workspaceId}
          defaults={creating}
          onClose={() => setCreating(null)}
        />
      ) : null}
      {completing ? (
        <CompleteActivityDialog
          workspaceId={workspaceId}
          activity={completing}
          onClose={() => setCompleting(null)}
          onScheduleNext={(defaults) => setCreating(defaults)}
        />
      ) : null}
    </WorkspaceLayout>
  );
}
