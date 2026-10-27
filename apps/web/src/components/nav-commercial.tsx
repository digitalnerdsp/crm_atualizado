import { useNavigate } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { MenuIcons } from "@/components/menu-icons";
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
import useActiveWorkspace from "@/hooks/queries/workspace/use-active-workspace";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";

/**
 * A group of its own rather than more entries under Overview: "deal" and
 * "project" are different objects, and mixing them in one list is what makes
 * people call a project a deal.
 */
export function NavCommercial() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: workspace } = useActiveWorkspace();
  const { canViewCrm, canViewCompanies, isCheckingPermissions } =
    useWorkspacePermission();

  if (
    !workspace ||
    isCheckingPermissions ||
    (!canViewCrm() && !canViewCompanies())
  )
    return null;

  const base = `/dashboard/workspace/${workspace.id}/crm`;
  const path = window.location.pathname;

  const items = [
    ...(canViewCrm()
      ? [
          {
            title: "Meu painel",
            url: `${base}/dashboard`,
            isActive: path.startsWith(`${base}/dashboard`),
            icon: MenuIcons.barChart,
          },
        ]
      : []),
    ...(canViewCrm()
      ? [
          {
            title: t("crm:nav.pipeline"),
            url: base,
            isActive: path === base || path === `${base}/`,
            icon: MenuIcons.deal,
          },
          {
            title: "Vendas",
            url: `${base}/sales`,
            isActive: path.startsWith(`${base}/sales`),
            icon: MenuIcons.growth,
          },
        ]
      : []),
    ...(canViewCompanies()
      ? [
          {
            title: t("crm:nav.companies"),
            url: `${base}/companies`,
            isActive: path.startsWith(`${base}/companies`),
            icon: MenuIcons.office,
          },
        ]
      : []),
    ...(canViewCrm()
      ? [
          {
            title: t("crm:nav.activities"),
            url: `${base}/activities`,
            isActive: path.startsWith(`${base}/activities`),
            icon: MenuIcons.phone,
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
          <span>{t("crm:nav.group")}</span>
          <ChevronRight className="h-3.5 w-3.5 text-sidebar-foreground/60 transition-transform duration-200" />
        </CollapsibleTrigger>
        <CollapsiblePanel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-0.5">
              {items.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton
                    tooltip={item.title}
                    isActive={item.isActive}
                    size="default"
                    className="h-8 ps-3.5 text-sm hover:bg-transparent hover:text-sidebar-accent-foreground active:bg-transparent"
                    onClick={() => navigate({ to: item.url })}
                  >
                    <item.icon className="size-5" />
                    <span>{item.title}</span>
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
