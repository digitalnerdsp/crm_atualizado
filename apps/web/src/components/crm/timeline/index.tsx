import { format, isToday, isYesterday } from "date-fns";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Skeleton } from "@/components/ui/skeleton";
import { useCrmActivities } from "@/hooks/queries/crm/use-crm-activities";
import type { CrmActivity } from "@/types/crm";
import ActivityComposer from "./activity-composer";
import ActivityRow from "./activity-row";

type TimelineProps = {
  workspaceId: string;
  dealId?: string;
  contactId?: string;
  companyId?: string;
  readOnly?: boolean;
};

/**
 * The same component on a deal, a contact and a company — only the filter
 * changes.
 *
 * Planned work sits above the history rather than being filed under the day it
 * was created: an activity scheduled for next week, listed under "Today",
 * reads as if it already happened.
 */
export function CrmTimeline({
  workspaceId,
  dealId,
  contactId,
  companyId,
  readOnly = false,
}: TimelineProps) {
  const { t } = useTranslation();

  const { data, isLoading } = useCrmActivities({
    workspaceId,
    ...(dealId ? { dealId } : {}),
    ...(contactId ? { contactId } : {}),
    ...(companyId ? { companyId } : {}),
    limit: "50",
  });

  const { planned, history } = useMemo(() => {
    const upcoming: CrmActivity[] = [];
    const buckets = new Map<string, CrmActivity[]>();

    for (const activity of data?.items ?? []) {
      if (activity.completedAt === null) {
        upcoming.push(activity);
        continue;
      }
      const day = format(new Date(activity.completedAt), "yyyy-MM-dd");
      const bucket = buckets.get(day);
      if (bucket) bucket.push(activity);
      else buckets.set(day, [activity]);
    }

    // Soonest first; undated planned work goes last.
    upcoming.sort((a, b) => {
      if (!a.dueAt) return 1;
      if (!b.dueAt) return -1;
      return new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime();
    });

    return { planned: upcoming, history: [...buckets.entries()] };
  }, [data]);

  function dayLabel(day: string) {
    const date = new Date(`${day}T12:00:00`);
    if (isToday(date)) return t("crm:timeline.today");
    if (isYesterday(date)) return t("crm:timeline.yesterday");
    return format(date, "dd/MM/yyyy");
  }

  return (
    <div className="space-y-4">
      {readOnly ? null : (
        <ActivityComposer
          workspaceId={workspaceId}
          dealId={dealId}
          contactId={contactId}
          companyId={companyId}
        />
      )}

      {isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((index) => (
            <Skeleton key={`crm-activity-${index}`} className="h-12 w-full" />
          ))}
        </div>
      ) : planned.length === 0 && history.length === 0 ? (
        <p className="py-4 text-sm text-muted-foreground">
          {t("crm:timeline.empty")}
        </p>
      ) : (
        <div className="space-y-5">
          {planned.length > 0 ? (
            <section className="space-y-2">
              <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t("crm:timeline.planned")}
              </h3>
              <ul className="space-y-2">
                {planned.map((activity) => (
                  <ActivityRow
                    key={activity.id}
                    activity={activity}
                    workspaceId={workspaceId}
                    readOnly={readOnly}
                  />
                ))}
              </ul>
            </section>
          ) : null}

          {history.map(([day, activities]) => (
            <section key={day} className="space-y-2">
              <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {dayLabel(day)}
              </h3>
              <ul className="space-y-2">
                {activities.map((activity) => (
                  <ActivityRow
                    key={activity.id}
                    activity={activity}
                    workspaceId={workspaceId}
                    readOnly={readOnly}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

export default CrmTimeline;
