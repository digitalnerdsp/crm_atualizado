import { useLocation, useNavigate } from "@tanstack/react-router";
import { Wallet } from "lucide-react";
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
  const url = `/dashboard/workspace/${workspace.id}/finance`;
  return (
    <SidebarGroup>
      <SidebarGroupLabel>Financeiro</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              isActive={pathname.startsWith(url)}
              onClick={() => navigate({ to: url })}
            >
              <Wallet className="size-4" />
              <span>Resumo e lançamentos</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              isActive={pathname.endsWith("/recurrence")}
              onClick={() =>
                navigate({
                  to: `/dashboard/workspace/${workspace.id}/recurrence`,
                })
              }
            >
              <Wallet className="size-4" />
              <span>Contratos e recorrência</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              isActive={pathname.endsWith("/performance")}
              onClick={() =>
                navigate({
                  to: `/dashboard/workspace/${workspace.id}/performance`,
                })
              }
            >
              <Wallet className="size-4" />
              <span>Comissões e resultados</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              isActive={pathname.endsWith("/taxes")}
              onClick={() =>
                navigate({ to: `/dashboard/workspace/${workspace.id}/taxes` })
              }
            >
              <Wallet className="size-4" />
              <span>Taxas e impostos</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
