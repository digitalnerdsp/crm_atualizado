import { useNavigate } from "@tanstack/react-router";
import {
  Building2,
  ChartColumn,
  ChartNoAxesCombined,
  ChevronRight,
  Contact,
  FileSignature,
  Handshake,
  PhoneCall,
  Server,
  TrendingUp,
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
  const {
    canViewCrm,
    canViewContacts,
    canViewCompanies,
    canViewCrmReports,
    isCheckingPermissions,
  } = useWorkspacePermission();

  if (
    !workspace ||
    isCheckingPermissions ||
    (!canViewCrm() && !canViewCompanies())
  )
    return null;

  const base = `/dashboard/workspace/${workspace.id}/crm`;
  const path = window.location.pathname;

  const items = [
    ...(canViewCrmReports()
      ? [
          {
            title: "Dashboard geral",
            url: `${base}/dashboard`,
            isActive: path.startsWith(`${base}/dashboard`),
            icon: ChartNoAxesCombined,
          },
        ]
      : []),
    ...(canViewCrm()
      ? [
          {
            title: t("crm:nav.pipeline"),
            url: base,
            isActive: path === base || path === `${base}/`,
            icon: Handshake,
          },
          {
            title: t("crm:nav.deals"),
            url: `${base}/deals`,
            isActive: path.startsWith(`${base}/deals`),
            icon: TrendingUp,
          },
          {
            title: t("crm:nav.contracts"),
            url: `${base}/contracts`,
            isActive: path.startsWith(`${base}/contracts`),
            icon: FileSignature,
          },
        ]
      : []),
    ...(canViewContacts()
      ? [
          {
            title: t("crm:nav.contacts"),
            url: `${base}/contacts`,
            isActive: path.startsWith(`${base}/contacts`),
            icon: Contact,
          },
        ]
      : []),
    ...(canViewCompanies()
      ? [
          {
            title: t("crm:nav.companies"),
            url: `${base}/companies`,
            isActive: path.startsWith(`${base}/companies`),
            icon: Building2,
          },
          {
            title: "Carteira e hospedagem",
            url: `${base}/hosting`,
            isActive: path.startsWith(`${base}/hosting`),
            icon: Server,
          },
        ]
      : []),
    ...(canViewCrm()
      ? [
          {
            title: t("crm:nav.activities"),
            url: `${base}/activities`,
            isActive: path.startsWith(`${base}/activities`),
            icon: PhoneCall,
          },
        ]
      : []),
    ...(canViewCrmReports()
      ? [
          {
            title: t("crm:nav.reports"),
            url: `${base}/reports`,
            isActive: path.startsWith(`${base}/reports`),
            icon: ChartColumn,
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
                    <item.icon className="size-4" />
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
