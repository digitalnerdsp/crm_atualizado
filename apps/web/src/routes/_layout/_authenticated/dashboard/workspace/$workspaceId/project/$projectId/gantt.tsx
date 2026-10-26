import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  addMonths,
  eachDayOfInterval,
  endOfDay,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isToday,
  isWithinInterval,
  parseISO,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import ProjectLayout from "@/components/common/project-layout";
import PageTitle from "@/components/page-title";
import TaskDetailsSheet from "@/components/task/task-details-sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useGetTasks } from "@/hooks/queries/task/use-get-tasks";
import { cn } from "@/lib/cn";
import { getStatusLabel } from "@/lib/i18n/domain";
import { useUserPreferencesStore } from "@/store/user-preferences";

type GanttSearchParams = {
  taskId?: string;
};

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/workspace/$workspaceId/project/$projectId/gantt",
)({
  component: RouteComponent,
  validateSearch: (search: Record<string, unknown>): GanttSearchParams => ({
    taskId: typeof search.taskId === "string" ? search.taskId : undefined,
  }),
});

const MAX_CHIPS_PER_DAY = 3;
const monthTitle = new Intl.DateTimeFormat("pt-BR", {
  month: "long",
  year: "numeric",
});
const weekdayName = new Intl.DateTimeFormat("pt-BR", { weekday: "short" });

function parseTaskDate(value: string | null) {
  if (!value) return null;
  const parsed = parseISO(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function RouteComponent() {
  const { t } = useTranslation();
  const { projectId, workspaceId } = Route.useParams();
  const { taskId } = Route.useSearch();
  const navigate = useNavigate();
  const { data: project } = useGetTasks(projectId);
  const weekStartsOn = useUserPreferencesStore((state) => state.weekStartsOn);
  const [searchQuery, setSearchQuery] = useState("");
  const [month, setMonth] = useState(() => startOfMonth(new Date()));

  const allTasks = useMemo(
    () => [
      ...(project?.columns.flatMap((column) => column.tasks) ?? []),
      ...(project?.plannedTasks ?? []),
    ],
    [project],
  );

  // Tarefas com início ou prazo; quem só tem uma das datas ocupa esse dia.
  const scheduledTasks = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return allTasks
      .map((task) => {
        const start =
          parseTaskDate(task.startDate) ?? parseTaskDate(task.dueDate);
        const end =
          parseTaskDate(task.dueDate) ?? parseTaskDate(task.startDate);
        if (!start || !end) return null;
        return {
          ...task,
          scheduleStart: start <= end ? start : end,
          scheduleEnd: end >= start ? end : start,
        };
      })
      .filter((task): task is NonNullable<typeof task> => task !== null)
      .filter(
        (task) =>
          !query ||
          task.title.toLowerCase().includes(query) ||
          `${project?.slug ?? ""}-${task.number ?? ""}`
            .toLowerCase()
            .includes(query) ||
          task.status.toLowerCase().includes(query),
      )
      .sort((a, b) => a.scheduleStart.getTime() - b.scheduleStart.getTime());
  }, [allTasks, project?.slug, searchQuery]);

  const days = useMemo(
    () =>
      eachDayOfInterval({
        start: startOfWeek(startOfMonth(month), { weekStartsOn }),
        end: endOfWeek(endOfMonth(month), { weekStartsOn }),
      }),
    [month, weekStartsOn],
  );

  const tasksByDay = useMemo(() => {
    const map = new Map<string, typeof scheduledTasks>();
    for (const day of days) {
      const key = format(day, "yyyy-MM-dd");
      map.set(
        key,
        scheduledTasks.filter((task) =>
          isWithinInterval(day, {
            start: startOfDay(task.scheduleStart),
            end: endOfDay(task.scheduleEnd),
          }),
        ),
      );
    }
    return map;
  }, [days, scheduledTasks]);

  const openTask = (id: string) =>
    navigate({ to: ".", search: { taskId: id }, replace: true });

  return (
    <ProjectLayout
      projectId={projectId}
      workspaceId={workspaceId}
      activeView="gantt"
    >
      <PageTitle
        title={t("tasks:gantt.pageTitle", { name: project?.name })}
        hideAppName
      />
      <div className="flex h-full min-h-0 flex-col bg-background">
        <div className="border-b border-border/80 px-3 py-3 sm:px-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="xs"
                aria-label="Mês anterior"
                onClick={() => setMonth((current) => subMonths(current, 1))}
              >
                <ChevronLeft className="size-3.5" />
              </Button>
              <Button
                variant="outline"
                size="xs"
                aria-label="Próximo mês"
                onClick={() => setMonth((current) => addMonths(current, 1))}
              >
                <ChevronRight className="size-3.5" />
              </Button>
              <Button
                variant="outline"
                size="xs"
                onClick={() => setMonth(startOfMonth(new Date()))}
              >
                Hoje
              </Button>
              <h1 className="min-w-40 text-sm font-semibold capitalize text-foreground">
                {monthTitle.format(month)}
              </h1>
              <Input
                type="month"
                aria-label="Ir para o mês"
                value={format(month, "yyyy-MM")}
                onChange={(event) => {
                  const next = parseISO(`${event.target.value}-01`);
                  if (!Number.isNaN(next.getTime())) setMonth(next);
                }}
                className="h-8 w-40 [&_[data-slot=input]]:text-xs"
              />
            </div>

            <div className="relative w-full max-w-sm">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder={t("tasks:gantt.searchPlaceholder")}
                className="h-9 touch-manipulation sm:h-8 [&_[data-slot=input]]:pl-8 [&_[data-slot=input]]:text-xs"
              />
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto p-3 sm:p-4">
          <div className="grid min-w-[44rem] grid-cols-7 overflow-hidden rounded-lg border border-border">
            {days.slice(0, 7).map((day) => (
              <div
                key={`head-${day.getDay()}`}
                className="border-b border-border bg-muted/30 px-2 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
              >
                {weekdayName.format(day).replace(".", "")}
              </div>
            ))}
            {days.map((day) => {
              const dayTasks = tasksByDay.get(format(day, "yyyy-MM-dd")) ?? [];
              const extra = dayTasks.length - MAX_CHIPS_PER_DAY;
              return (
                <div
                  key={day.toISOString()}
                  className={cn(
                    "min-h-28 border-r border-b border-border/70 p-1.5",
                    !isSameMonth(day, month) && "bg-muted/25 opacity-60",
                  )}
                >
                  <div
                    className={cn(
                      "mb-1 flex size-6 items-center justify-center rounded-full text-xs font-medium",
                      isToday(day) && "bg-primary text-primary-foreground",
                    )}
                  >
                    {format(day, "d")}
                  </div>
                  <div className="flex flex-col gap-1">
                    {dayTasks.slice(0, MAX_CHIPS_PER_DAY).map((task) => (
                      <button
                        key={task.id}
                        type="button"
                        title={`${project?.slug ?? ""}-${task.number ?? ""} · ${getStatusLabel(task.status)} · ${format(task.scheduleStart, "dd/MM")} a ${format(task.scheduleEnd, "dd/MM")}`}
                        className="w-full truncate rounded-md border border-primary/25 bg-primary/10 px-1.5 py-1 text-left text-[11px] font-medium leading-tight text-foreground transition-colors hover:bg-primary/20"
                        onClick={() => openTask(task.id)}
                      >
                        {task.title}
                      </button>
                    ))}
                    {extra > 0 && (
                      <span className="px-1 text-[11px] text-muted-foreground">
                        +{extra} {extra === 1 ? "tarefa" : "tarefas"}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {scheduledTasks.length === 0 && (
            <p className="mt-4 text-center text-sm text-muted-foreground">
              {searchQuery
                ? t("tasks:gantt.noTasksMatch", { query: searchQuery })
                : t("tasks:gantt.noTasksSubtitle")}
            </p>
          )}
        </div>

        <TaskDetailsSheet
          taskId={taskId}
          projectId={projectId}
          workspaceId={workspaceId}
          onClose={() => navigate({ to: ".", search: {}, replace: true })}
        />
      </div>
    </ProjectLayout>
  );
}
