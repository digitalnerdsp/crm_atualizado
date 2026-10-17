import { createFileRoute } from "@tanstack/react-router";
import { LayoutTemplate, Play, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import PageTitle from "@/components/page-title";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  deleteTaskTemplate,
  instantiateTaskTemplate,
} from "@/fetchers/task-template";
import useGetProjects from "@/hooks/queries/project/use-get-projects";
import { useTaskTemplates } from "@/hooks/queries/task-template/use-task-templates";
import useActiveWorkspace from "@/hooks/queries/workspace/use-active-workspace";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import { toast } from "@/lib/toast";
import queryClient from "@/query-client";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/settings/workspace/templates",
)({
  component: WorkspaceTemplates,
});

function WorkspaceTemplates() {
  const { t } = useTranslation();
  const { data: workspace } = useActiveWorkspace();
  const { canViewTemplates, canUseTemplates, canManageTemplates } =
    useWorkspacePermission();
  const canView = canViewTemplates();
  const canUse = canUseTemplates();
  const canManage = canManageTemplates();
  const { data: templates = [] } = useTaskTemplates(
    workspace?.id ?? "",
    canView,
  );
  const { data: projects = [] } = useGetProjects({
    workspaceId: workspace?.id ?? "",
  });
  const [projectByTemplate, setProjectByTemplate] = useState<
    Record<string, string>
  >({});
  const [busyId, setBusyId] = useState<string | null>(null);

  async function instantiate(templateId: string) {
    const projectId = projectByTemplate[templateId];
    if (!projectId) return;
    setBusyId(templateId);
    try {
      await instantiateTaskTemplate(templateId, projectId);
      await queryClient.invalidateQueries({ queryKey: ["tasks", projectId] });
      toast.success(t("tasks:templates.applied"));
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("tasks:templates.applyError"),
      );
    } finally {
      setBusyId(null);
    }
  }

  async function remove(templateId: string) {
    if (!workspace?.id) return;
    setBusyId(templateId);
    try {
      await deleteTaskTemplate(templateId, workspace.id);
      await queryClient.invalidateQueries({ queryKey: ["task-templates"] });
      toast.success(t("tasks:templates.deleted"));
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("tasks:templates.deleteError"),
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <PageTitle title={t("tasks:templates.title")} />
      <div className="mx-auto max-w-4xl space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">
            {t("tasks:templates.title")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t("tasks:templates.description")}
          </p>
        </div>

        {templates.length === 0 ? (
          <div className="border-y border-border py-10 text-center">
            <LayoutTemplate className="mx-auto mb-3 size-7 text-muted-foreground" />
            <p className="text-sm font-medium">{t("tasks:templates.empty")}</p>
            <p className="text-xs text-muted-foreground">
              {t("tasks:templates.emptyHint")}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border border-y border-border">
            {templates.map((template) => (
              <div
                key={template.id}
                className="grid grid-cols-1 items-center gap-3 py-3 md:grid-cols-[minmax(160px,1fr)_minmax(180px,260px)_auto]"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {template.name}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {template.title} · {template.checklistItems.length}{" "}
                    {t("tasks:templates.items")} ·{" "}
                    {template.customFields.length} {t("tasks:templates.fields")}
                  </p>
                </div>
                <Select
                  value={projectByTemplate[template.id] ?? ""}
                  disabled={!canUse}
                  onValueChange={(projectId) =>
                    setProjectByTemplate((current) => ({
                      ...current,
                      [template.id]: projectId ?? "",
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={t("tasks:templates.chooseProject")}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map((project) => (
                      <SelectItem key={project.id} value={project.id}>
                        {project.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex items-center">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-sm"
                    title={t("tasks:templates.apply")}
                    disabled={
                      !canUse ||
                      !projectByTemplate[template.id] ||
                      busyId === template.id
                    }
                    onClick={() => instantiate(template.id)}
                  >
                    <Play className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    title={t("common:actions.delete")}
                    disabled={!canManage || busyId === template.id}
                    onClick={() => remove(template.id)}
                  >
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
