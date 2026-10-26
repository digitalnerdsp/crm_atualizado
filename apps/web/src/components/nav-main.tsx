import { useNavigate } from "@tanstack/react-router";
import {
  CalendarDays,
  ChartNoAxesCombined,
  ChevronRight,
  FolderKanban,
  Shield,
  Users,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  Collapsible,
  CollapsiblePanel,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { useAdminMe } from "@/hooks/queries/admin/use-admin-me";
import useActiveWorkspace from "@/hooks/queries/workspace/use-active-workspace";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";

export function NavMain() {
  const { t } = useTranslation();
  const { data: workspace } = useActiveWorkspace();
  const navigate = useNavigate();
  const { data: adminMe } = useAdminMe();
  const {
    canViewCalendar,
    canViewDashboard,
    canViewProjects,
    canViewWorkspace,
    isAdmin,
  } = useWorkspacePermission();

  if (!workspace && !adminMe) return null;

  const navItems = [
    ...(workspace
      ? [
          ...(isAdmin || canViewDashboard()
            ? [
                {
                  title: t("navigation:sidebar.operationalDashboard", {
                    defaultValue: "Dashboard",
                  }),
                  url: "/overview",
                  isActive: window.location.pathname === "/overview",
                  badge: null,
                  icon: ChartNoAxesCombined,
                },
              ]
            : []),
          ...(canViewProjects()
            ? [
                {
                  title: t("navigation:sidebar.projects"),
                  url: `/dashboard/workspace/${workspace.id}`,
                  isActive:
                    window.location.pathname ===
                    `/dashboard/workspace/${workspace.id}`,
                  badge: null,
                  icon: FolderKanban,
                },
              ]
            : []),
          ...(canViewWorkspace()
            ? [
                {
                  title: t("navigation:sidebar.members"),
                  url: `/dashboard/workspace/${workspace.id}/members`,
                  isActive:
                    window.location.pathname ===
                    `/dashboard/workspace/${workspace.id}/members`,
                  badge: null,
                  icon: Users,
                },
              ]
            : []),
          ...(canViewCalendar()
            ? [
                {
                  title: t("navigation:sidebar.calendar", {
                    defaultValue: "Agenda",
                  }),
                  url: "/calendar",
                  isActive: window.location.pathname === "/calendar",
                  badge: null,
                  icon: CalendarDays,
                },
              ]
            : []),
        ]
      : []),
    ...(adminMe
      ? [
          {
            title: t("navigation:sidebar.admin", {
              defaultValue: "Administration",
            }),
            url: "/admin",
            isActive: window.location.pathname.startsWith("/admin"),
            badge: null,
            icon: Shield,
          },
        ]
      : []),
  ];

  return (
    <Collapsible defaultOpen className="group/collapsible">
      <SidebarGroup className="gap-1 p-2">
        <CollapsibleTrigger
          className="data-panel-open:[&_svg]:rotate-90"
          render={
            <SidebarGroupLabel className="h-7 cursor-pointer justify-between px-0 text-sidebar-accent-foreground" />
          }
        >
          <span>{t("navigation:sidebar.overview")}</span>
          <ChevronRight className="h-3.5 w-3.5 text-sidebar-foreground/60 transition-transform duration-200" />
        </CollapsibleTrigger>
        <CollapsiblePanel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-0.5">
              {navItems.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton
                    tooltip={item.title}
                    isActive={item.isActive}
                    size="default"
                    className="h-8 ps-3.5 text-sm hover:bg-transparent hover:text-sidebar-accent-foreground active:bg-transparent"
                    onClick={() => navigate({ to: item.url })}
                  >
                    {item.icon && <item.icon className="size-4 text-primary" />}
                    <span>{item.title}</span>
                    {item.badge !== null && (
                      <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-sm border border-sidebar-border/60 px-1 text-[11px] font-medium text-sidebar-foreground/80">
                        {item.badge}
                      </span>
                    )}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </CollapsiblePanel>
      </SidebarGroup>
    </Collapsible>
  );
}
