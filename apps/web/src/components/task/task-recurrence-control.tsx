import { Pause, Play, Repeat2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { useSetTaskRecurrenceActive } from "@/hooks/mutations/task/use-set-task-recurrence-active";
import { formatDateShort } from "@/lib/format";
import { toast } from "@/lib/toast";
import type Task from "@/types/task";

export default function TaskRecurrenceControl({ task }: { task: Task }) {
  const { t } = useTranslation();
  const mutation = useSetTaskRecurrenceActive();
  const recurrence = task.recurrence;

  if (!recurrence) return null;

  const schedule =
    recurrence.frequency === "weekly" && recurrence.weekdays.length > 0
      ? recurrence.weekdays
          .map((day) =>
            t(`common:modals.createTask.recurrence.weekdays.${day}`),
          )
          .join(", ")
      : t(
          `common:modals.createTask.recurrence.summary.${recurrence.frequency}`,
          { count: recurrence.interval },
        );

  async function toggleActive() {
    try {
      await mutation.mutateAsync({
        taskId: task.id,
        isActive: !recurrence?.isActive,
      });
      toast.success(
        t(
          recurrence?.isActive
            ? "tasks:recurrence.paused"
            : "tasks:recurrence.resumed",
        ),
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("tasks:recurrence.updateError"),
      );
    }
  }

  return (
    <div className="flex items-center justify-between gap-3 border-y border-border py-2">
      <div className="flex min-w-0 items-center gap-2">
        <Repeat2 className="size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{schedule}</p>
          <p className="truncate text-xs text-muted-foreground">
            {recurrence.isActive && recurrence.nextOccurrenceAt
              ? t("tasks:recurrence.next", {
                  date: formatDateShort(recurrence.nextOccurrenceAt),
                })
              : t("tasks:recurrence.inactive")}
          </p>
        </div>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={mutation.isPending}
        onClick={toggleActive}
      >
        {recurrence.isActive ? (
          <Pause className="size-4" />
        ) : (
          <Play className="size-4" />
        )}
        {t(
          recurrence.isActive
            ? "tasks:recurrence.pause"
            : "tasks:recurrence.resume",
        )}
      </Button>
    </div>
  );
}
