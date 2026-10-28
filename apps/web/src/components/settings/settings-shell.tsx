import { useNavigate } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import PageTitle from "@/components/page-title";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAdminMe } from "@/hooks/queries/admin/use-admin-me";
import useGetProjects from "@/hooks/queries/project/use-get-projects";
import useActiveWorkspace from "@/hooks/queries/workspace/use-active-workspace";

export type SettingsSection = "account" | "workspace" | "project" | "admin";

/**
 * Casca única das configurações: conta, workspace, projetos e, para quem é
 * administrador, a administração do sistema. Cada seção tem as próprias
 * páginas; a casca só dá o mesmo cabeçalho e as mesmas abas a todas.
 */
export function SettingsShell({
  section,
  children,
}: {
  section: SettingsSection;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: workspace } = useActiveWorkspace();
  const { data: projects } = useGetProjects({
    workspaceId: workspace?.id ?? "",
  });
  const { data: adminMe } = useAdminMe();

  return (
    <>
      <PageTitle title={t("navigation:page.settingsTitle")} />
      <div className="flex h-full w-full flex-col gap-4 bg-sidebar p-4">
        <div className="relative flex h-full flex-col gap-4 overflow-hidden rounded-md border border-border bg-card p-4">
          <div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                workspace?.id
                  ? navigate({
                      to: "/dashboard/workspace/$workspaceId",
                      params: { workspaceId: workspace.id },
                    })
                  : navigate({ to: "/dashboard" })
              }
            >
              <ChevronLeft className="size-6 rounded-md border border-border p-1" />
              {t("navigation:page.backToWorkspace")}
            </Button>

            <h1 className="mt-2 pl-2 text-2xl font-semibold">
              {t("navigation:page.settingsTitle")}
            </h1>

            <Tabs value={section} className="w-fit pt-2">
              <TabsList className="gap-2 bg-sidebar">
                <TabsTrigger
                  value="account"
                  onClick={() =>
                    navigate({ to: "/dashboard/settings/account/information" })
                  }
                >
                  {t("settings:account")}
                </TabsTrigger>
                <TabsTrigger
                  value="workspace"
                  onClick={() =>
                    navigate({ to: "/dashboard/settings/workspace/general" })
                  }
                >
                  {t("navigation:page.settingsWorkspaceTab")}
                </TabsTrigger>
                <TabsTrigger
                  disabled={projects?.length === 0}
                  value="project"
                  onClick={() =>
                    navigate({ to: "/dashboard/settings/projects" })
                  }
                >
                  {t("navigation:sidebar.projects")}
                </TabsTrigger>
                {adminMe ? (
                  <TabsTrigger
                    value="admin"
                    onClick={() => navigate({ to: "/admin" })}
                  >
                    Administração do sistema
                  </TabsTrigger>
                ) : null}
              </TabsList>
            </Tabs>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        </div>
      </div>
    </>
  );
}
