import { format } from "date-fns";
import { Check, Clock } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ActivityIcon } from "@/components/crm/timeline/activity-icon";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useCompleteActivity } from "@/hooks/mutations/crm/use-crm-contact-mutations";
import { getInitials } from "@/lib/get-initials";
import { toast } from "@/lib/toast";
import type { CrmActivity } from "@/types/crm";

type ActivityRowProps = {
  activity: CrmActivity;
  workspaceId: string;
  readOnly?: boolean;
};

export function ActivityRow({
  activity,
  workspaceId,
  readOnly = false,
}: ActivityRowProps) {
  const { t } = useTranslation();
  const { mutateAsync: complete, isPending } = useCompleteActivity();

  const isPendingActivity = activity.completedAt === null;
  const isOverdue =
    isPendingActivity &&
    activity.dueAt !== null &&
    new Date(activity.dueAt) < new Date();

  return (
    <li className="flex gap-3 rounded-lg border border-border bg-card p-3">
      <span
        className={`mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full ${
          isPendingActivity
            ? "bg-primary/10 text-primary"
            : "bg-muted text-muted-foreground"
        }`}
      >
        <ActivityIcon type={activity.type} className="size-3.5" />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-sm font-medium">{activity.subject}</span>
          {isPendingActivity && activity.dueAt ? (
            <span
              className={`inline-flex items-center gap-1 text-xs ${
                isOverdue ? "text-destructive" : "text-warning-foreground"
              }`}
            >
              <Clock className="size-3" />
              {format(new Date(activity.dueAt), "dd/MM")}
            </span>
          ) : null}
        </div>

        {activity.body ? (
          <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
            {activity.body}
          </p>
        ) : null}

        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {activity.owner?.name ? (
            <span className="inline-flex items-center gap-1.5">
              <Avatar className="size-4">
                <AvatarImage src={activity.owner.image ?? undefined} />
                <AvatarFallback className="text-[8px]">
                  {getInitials(activity.owner.name)}
                </AvatarFallback>
              </Avatar>
              {activity.owner.name}
            </span>
          ) : null}
          {activity.outcome ? <span>· {activity.outcome}</span> : null}
          {activity.durationMinutes ? (
            <span>· {activity.durationMinutes}min</span>
          ) : null}
        </div>
      </div>

      {isPendingActivity && !readOnly ? (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 shrink-0 px-2"
          disabled={isPending}
          onClick={async () => {
            try {
              await complete({ activityId: activity.id, workspaceId });
              toast.success(t("crm:timeline.completed"));
            } catch (error) {
              toast.error(
                error instanceof Error
                  ? error.message
                  : t("crm:timeline.logError"),
              );
            }
          }}
        >
          <Check className="size-3.5" />
          <span className="hidden sm:inline">{t("crm:timeline.complete")}</span>
        </Button>
      ) : null}
    </li>
  );
}

export default ActivityRow;
