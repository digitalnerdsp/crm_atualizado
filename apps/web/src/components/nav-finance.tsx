import { useLocation, useNavigate } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
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

export function NavFinance() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { data: workspace } = useActiveWorkspace();
  const permissions = useWorkspacePermission();
  if (
    !workspace ||
    permissions.isCheckingPermissions ||
    !permissions.canViewFinance()
  )
    return null;
  const base = `/dashboard/workspace/${workspace.id}`;
  const crmReports = `${base}/crm/reports`;
  const items = [
    {
      title: "Dashboard geral — BI",
      url: `${base}/bi`,
      isActive: pathname.endsWith("/bi"),
      icon: MenuIcons.barChart,
    },
    {
      title: "Gestão da carteira",
      url: `${base}/portfolio`,
      isActive: pathname.endsWith("/portfolio"),
      icon: MenuIcons.folderChart,
    },
    {
      title: "Resumo e lançamentos",
      url: `${base}/finance`,
      isActive: pathname.startsWith(`${base}/finance`),
      icon: MenuIcons.receipt,
    },
    {
      title: "Contratos e recorrência",
      url: `${base}/recurrence`,
      isActive: pathname.endsWith("/recurrence"),
      icon: MenuIcons.exchange,
    },
    {
      title: "Comissões e resultados",
      url: `${base}/performance`,
      isActive: pathname.endsWith("/performance"),
      icon: MenuIcons.bank,
    },
    {
      title: "Taxas e impostos",
      url: `${base}/taxes`,
      isActive: pathname.endsWith("/taxes"),
      icon: MenuIcons.tax,
    },
    ...(permissions.canViewCrmReports()
      ? [
          {
            title: "Relatórios comerciais",
            url: crmReports,
            isActive: pathname.startsWith(crmReports),
            icon: MenuIcons.lineChart,
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
          <span>Financeiro</span>
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
