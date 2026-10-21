import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useNavigate } from "@tanstack/react-router";
import { format } from "date-fns";
import {
  Calendar,
  CalendarClock,
  CalendarX,
  CheckSquare2,
  GitMerge,
  GitPullRequest,
  Repeat2,
} from "lucide-react";
import { type CSSProperties, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/preview-card";
import { useDeleteTask } from "@/hooks/mutations/task/use-delete-task";
import useExternalLinks from "@/hooks/queries/external-link/use-external-links";
import useActiveWorkspace from "@/hooks/queries/workspace/use-active-workspace";
import { useGetActiveWorkspaceUsers } from "@/hooks/queries/workspace-users/use-get-active-workspace-users";
import { dueDateStatusColors, getDueDateStatus } from "@/lib/due-date-status";
import { getInitials } from "@/lib/get-initials";
import { getPriorityBadgeClass, getPriorityIcon } from "@/lib/priority";
import { toast } from "@/lib/toast";
import queryClient from "@/query-client";
import useBulkSelectionStore from "@/store/bulk-selection";
import useProjectStore from "@/store/project";
import { useUserPreferencesStore } from "@/store/user-preferences";
import type Task from "@/types/task";
import { SiteTimeBadge } from "../task/site-time-panel";
import { Button } from "../ui/button";
import { ContextMenu, ContextMenuTrigger } from "../ui/context-menu";
import TaskCardContextMenuContent from "./task-card-context-menu/task-card-context-menu-content";
import TaskCardLabels from "./task-labels";

type TaskCardProps = {
  task: Task;
  disableDragDrop?: boolean;
};

function TaskCard({ task, disableDragDrop = false }: TaskCardProps) {
  const { t } = useTranslation();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id, disabled: disableDragDrop });
  const { project } = useProjectStore();
  const { data: workspace } = useActiveWorkspace();
  const { mutateAsync: deleteTask } = useDeleteTask();
  const navigate = useNavigate();
  const { showAssignees, showPriority, showDueDates, showLabels } =
    useUserPreferencesStore();
  const [isDeleteTaskModalOpen, setIsDeleteTaskModalOpen] = useState(false);
  const { data: externalLinks } = useExternalLinks(task.id);
  const { toggleSelection, isSelected, isFocused } = useBulkSelectionStore();
  const isTaskSelected = isSelected(task.id);
  const isTaskFocused = isFocused(task.id);

  const pullRequests = useMemo(() => {
    if (!externalLinks) return [];
    return externalLinks.filter((link) => link.resourceType === "pull_request");
  }, [externalLinks]);

  const getPRInfo = (pr: (typeof pullRequests)[number]) => {
    const isMerged = pr.metadata?.merged === true;
    const isDraft = pr.metadata?.draft === true;

    if (isMerged) {
      return {
        icon: <GitMerge className="h-3 w-3 text-info-foreground" />,
        status: t("tasks:pr.merged"),
        statusClass: "text-info-foreground",
      };
    }

    if (isDraft) {
      return {
        icon: <GitPullRequest className="h-3 w-3 text-muted-foreground" />,
        status: t("tasks:pr.draft"),
        statusClass: "text-muted-foreground",
      };
    }

    return {
      icon: <GitPullRequest className="h-3 w-3 text-success-foreground" />,
      status: t("tasks:pr.open"),
      statusClass: "text-success-foreground",
    };
  };

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition:
      transition || "transform 250ms cubic-bezier(0.25, 0.46, 0.45, 0.94)",
    opacity: isDragging ? 0.6 : 1,
    touchAction: isDragging ? "none" : "auto",
    zIndex: isDragging ? 999 : "auto",
  };
  const dueDateStatus = getDueDateStatus(task.dueDate);
  const checklistProgress = task.checklistProgress;
  const checklistPercent = checklistProgress?.total
    ? Math.round((checklistProgress.completed / checklistProgress.total) * 100)
    : 0;
  const taskAccent =
    dueDateStatus === "overdue" || task.priority === "urgent"
      ? "var(--destructive)"
      : dueDateStatus === "due-soon" || task.priority === "high"
        ? "var(--warning)"
        : task.priority === "medium" || task.priority === "low"
          ? "var(--info)"
          : null;

  const { data: workspaceUsers } = useGetActiveWorkspaceUsers(
    workspace?.id ?? "",
  );

  const assignee = useMemo(() => {
    return workspaceUsers?.members?.find(
      (member) => member.userId === task.userId,
    );
  }, [workspaceUsers, task.userId]);

  const assignees = useMemo(() => {
    if (task.assignees?.length) {
      return task.assignees;
    }

    if (!task.userId) return [];

    return [
      {
        id: task.userId,
        name: assignee?.user?.name ?? task.assigneeName ?? "",
        email: assignee?.user?.email ?? "",
        image: assignee?.user?.image ?? task.assigneeImage ?? null,
        avatarColor:
          (assignee?.user as { avatarColor?: string | null } | undefined)
            ?.avatarColor ?? null,
      },
    ];
  }, [
    (assignee?.user as { avatarColor?: string | null } | undefined)
      ?.avatarColor,
    assignee?.user?.email,
    assignee?.user?.image,
    assignee?.user?.name,
    task.assigneeImage,
    task.assigneeName,
    task.assignees,
    task.userId,
  ]);

  function handleTaskCardClick(
    e: React.MouseEvent<HTMLDivElement> | React.KeyboardEvent<HTMLDivElement>,
  ) {
    if (!project || !task || !workspace) return;

    if ((e as React.MouseEvent).metaKey || (e as React.KeyboardEvent).ctrlKey) {
      toggleSelection(task.id);
      return;
    }

    const currentParams = new URLSearchParams(window.location.search);
    const currentTaskId = currentParams.get("taskId");

    if (currentTaskId === task.id) {
      navigate({
        to: ".",
        search: {},
      });
    } else {
      navigate({
        to: ".",
        search: { taskId: task.id },
      });
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      toggleSelection(task.id);
    }
  };

  const handleDeleteTask = async () => {
    try {
      await deleteTask(task.id);
      queryClient.invalidateQueries({
        queryKey: ["tasks", project?.id],
      });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("tasks:delete.error"),
      );
    } finally {
      toast.success(t("tasks:delete.success"));
    }
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          {/** biome-ignore lint/a11y/noStaticElementInteractions: false positive for onClick and onKeyDown */}
          <div
            onClick={handleTaskCardClick}
            style={
              taskAccent
                ? ({
                    "--task-accent": taskAccent,
                  } as CSSProperties)
                : undefined
            }
            className={`group relative rounded-lg border bg-background p-3 shadow-xs/5 transition-[background-color,border-color,box-shadow,scale] duration-150 ease-out active:scale-[0.98] ${
              disableDragDrop ? "cursor-default" : "cursor-move"
            } ${
              isDragging
                ? "border-ring/40 bg-card shadow-lg"
                : "hover:border-border/90 hover:bg-background hover:shadow-sm"
            } ${
              isTaskSelected
                ? "border-ring/40 bg-accent/50 shadow-sm ring-1 ring-inset ring-ring/30"
                : "border-border"
            } ${isTaskFocused ? "ring-2 ring-inset ring-ring/50" : ""}`}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                handleTaskCardClick(e);
              } else if (e.key === "Escape") {
                handleKeyDown(e);
              }
            }}
          >
            {taskAccent && (
              <span className="absolute inset-y-2 left-0 w-0.5 rounded-r bg-[var(--task-accent)]" />
            )}
            {showAssignees && (
              <div className="absolute top-3 right-3">
                {assignees.length > 0 ? (
                  <div
                    className="flex -space-x-1"
                    title={assignees.map((item) => item.name).join(", ")}
                  >
                    {assignees.slice(0, 3).map((item) => (
                      <Avatar
                        className="size-7 border border-background"
                        key={item.id}
                      >
                        <AvatarImage src={item.image ?? ""} alt={item.name} />
                        <AvatarFallback
                          className="border border-border/30 text-xs font-medium"
                          style={
                            item.avatarColor
                              ? {
                                  backgroundColor: item.avatarColor,
                                  color: "white",
                                }
                              : undefined
                          }
                        >
                          {getInitials(item.name)}
                        </AvatarFallback>
                      </Avatar>
                    ))}
                    {assignees.length > 3 && (
                      <div className="flex h-7 min-w-7 items-center justify-center rounded-full border border-background bg-muted px-1 text-[10px] font-medium text-muted-foreground">
                        +{assignees.length - 3}
                      </div>
                    )}
                  </div>
                ) : (
                  <div
                    className="flex size-7 items-center justify-center rounded-full border border-border bg-muted"
                    title={t("tasks:assignee.unassigned")}
                  >
                    <span className="text-[10px] font-medium text-muted-foreground">
                      ?
                    </span>
                  </div>
                )}
              </div>
            )}

            <div className="mb-2.5 pr-6">
              <div
                className="overflow-hidden break-words text-sm leading-5 font-medium text-foreground/95"
                style={{
                  display: "-webkit-box",
                  WebkitLineClamp: 3,
                  WebkitBoxOrient: "vertical",
                  wordBreak: "break-word",
                  hyphens: "auto",
                }}
              >
                {task.title}
              </div>
            </div>

            {showLabels && (
              <div className="mb-2.5">
                <TaskCardLabels taskId={task.id} />
                <SiteTimeBadge taskId={task.id} projectId={task.projectId} />
              </div>
            )}

            {task.customFields?.some((field) => field.showOnCard) && (
              <div className="mb-2.5 grid grid-cols-2 gap-x-3 gap-y-1 border-y border-border/60 py-2">
                {task.customFields
                  .filter((field) => field.showOnCard)
                  .slice(0, 4)
                  .map((field) => (
                    <div key={field.id} className="min-w-0">
                      <p className="truncate text-[9px] text-muted-foreground">
                        {field.name}
                      </p>
                      <p className="truncate text-[11px] font-medium">
                        {field.type === "checkbox"
                          ? field.value === "true"
                            ? t("common:yes")
                            : t("common:no")
                          : field.value || "—"}
                      </p>
                    </div>
                  ))}
              </div>
            )}

            {checklistProgress && checklistProgress.total > 0 && (
              <div className="mb-2 space-y-1">
                <div className="flex items-center justify-between text-[10px] font-medium text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <CheckSquare2 className="size-3" />
                    {t("tasks:quality.checklist")}
                  </span>
                  <span>
                    {checklistProgress.completed}/{checklistProgress.total}
                  </span>
                </div>
                <div className="h-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full rounded-full transition-[width] duration-200 ${
                      checklistPercent === 100 ? "bg-success" : "bg-warning"
                    }`}
                    style={{ width: `${checklistPercent}%` }}
                  />
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-1.5">
              {task.recurrenceId && (
                <span
                  className="inline-flex items-center rounded border border-border/70 bg-muted/55 p-1 text-muted-foreground"
                  title={t("common:modals.createTask.recurrence.repeatTask")}
                >
                  <Repeat2 className="size-3" />
                </span>
              )}
              {showPriority && (
                <span
                  className={`inline-flex items-center gap-1 rounded border py-1 text-[10px] font-medium ${
                    task.priority === "no-priority" || !task.priority
                      ? "px-1"
                      : "px-2"
                  } ${getPriorityBadgeClass(task.priority ?? "")}`}
                  title={t(`tasks:priority.${task.priority ?? "no-priority"}`)}
                >
                  {getPriorityIcon(task.priority ?? "")}
                  {task.priority &&
                    task.priority !== "no-priority" &&
                    t(`tasks:priority.${task.priority}`)}
                </span>
              )}

              {showDueDates && task.dueDate && (
                <div
                  className={`flex items-center gap-1 text-[10px] px-2 py-1 rounded ${dueDateStatusColors[dueDateStatus]}`}
                >
                  {dueDateStatus === "overdue" && (
                    <CalendarX className="w-3 h-3" />
                  )}
                  {dueDateStatus === "due-soon" && (
                    <CalendarClock className="w-3 h-3" />
                  )}
                  {(dueDateStatus === "far-future" ||
                    dueDateStatus === "no-due-date") && (
                    <Calendar className="w-3 h-3" />
                  )}
                  <span>{format(new Date(task.dueDate), "MMM d")}</span>
                </div>
              )}

              {pullRequests.length === 1 && (
                <HoverCard openDelay={200} closeDelay={100}>
                  <HoverCardTrigger asChild>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        window.open(pullRequests[0].url, "_blank");
                      }}
                      className="inline-flex items-center gap-1.5 rounded border border-border/70 bg-muted/55 px-2 py-1 text-[10px] font-medium text-muted-foreground"
                    >
                      {getPRInfo(pullRequests[0]).icon}
                      <span>#{pullRequests[0].externalId}</span>
                    </button>
                  </HoverCardTrigger>
                  <HoverCardContent
                    className="w-72 p-3"
                    side="bottom"
                    onClick={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                  >
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        {getPRInfo(pullRequests[0]).icon}
                        <span>{getPRInfo(pullRequests[0]).status}</span>
                        <span className="text-muted-foreground/50">•</span>
                        <span>#{pullRequests[0].externalId}</span>
                      </div>
                      <p className="text-sm font-medium leading-snug">
                        {pullRequests[0].title || t("tasks:pr.label")}
                      </p>
                    </div>
                  </HoverCardContent>
                </HoverCard>
              )}

              {pullRequests.length > 1 &&
                (() => {
                  const hasOpen = pullRequests.some(
                    (pr) => !pr.metadata?.merged && !pr.metadata?.draft,
                  );
                  const allMerged = pullRequests.every(
                    (pr) => pr.metadata?.merged,
                  );
                  const iconColor = allMerged
                    ? "text-info-foreground"
                    : hasOpen
                      ? "text-success-foreground"
                      : "text-muted-foreground";

                  return (
                    <HoverCard openDelay={200} closeDelay={100}>
                      <HoverCardTrigger asChild>
                        <button
                          type="button"
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-1.5 rounded border border-border/70 bg-muted/55 px-2 py-1 text-[10px] font-medium text-muted-foreground"
                        >
                          <GitPullRequest className={`h-3 w-3 ${iconColor}`} />
                          <span>
                            {t("tasks:pr.count", {
                              count: pullRequests.length,
                            })}
                          </span>
                        </button>
                      </HoverCardTrigger>
                      <HoverCardContent
                        className="w-auto min-w-56 max-w-96 p-1"
                        side="bottom"
                        onClick={(e) => e.stopPropagation()}
                        onPointerDown={(e) => e.stopPropagation()}
                      >
                        {pullRequests.map((pr, index) => {
                          const prInfo = getPRInfo(pr);
                          const repoMatch = pr.url.match(
                            /github\.com\/([^/]+\/[^/]+)\/pull/,
                          );
                          const repoName = repoMatch ? repoMatch[1] : null;
                          return (
                            <div key={pr.id}>
                              {index > 0 && (
                                <hr className="border-border my-1" />
                              )}
                              <button
                                type="button"
                                onClick={() => window.open(pr.url, "_blank")}
                                className="w-full px-2 py-1.5 text-left hover:bg-muted/50 rounded transition-colors"
                              >
                                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                                  {prInfo.icon}
                                  <span>
                                    {repoName}#{pr.externalId}
                                  </span>
                                </div>
                                <p className="text-xs leading-tight line-clamp-2 mt-0.5">
                                  {pr.title || t("tasks:pr.label")}
                                </p>
                                <span className="text-[10px] text-muted-foreground">
                                  {prInfo.status}
                                </span>
                              </button>
                            </div>
                          );
                        })}
                      </HoverCardContent>
                    </HoverCard>
                  );
                })()}
            </div>
          </div>
        </ContextMenuTrigger>

        {project && workspace && (
          <TaskCardContextMenuContent
            task={task}
            taskCardContext={{
              projectId: project.id,
              worskpaceId: workspace.id,
            }}
            onDeleteClick={() => setIsDeleteTaskModalOpen(true)}
          />
        )}
      </ContextMenu>

      <AlertDialog
        open={isDeleteTaskModalOpen}
        onOpenChange={setIsDeleteTaskModalOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("tasks:delete.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("tasks:delete.description")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose>
              <Button variant="outline" size="sm">
                {t("common:actions.cancel")}
              </Button>
            </AlertDialogClose>
            <AlertDialogClose onClick={handleDeleteTask}>
              <Button variant="destructive" size="sm">
                {t("tasks:delete.action")}
              </Button>
            </AlertDialogClose>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default TaskCard;
