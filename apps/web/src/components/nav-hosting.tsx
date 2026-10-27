import { useLocation, useNavigate } from "@tanstack/react-router";
import { MenuIcons } from "@/components/menu-icons";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import useActiveWorkspace from "@/hooks/queries/workspace/use-active-workspace";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";

export function NavHosting() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { data: workspace } = useActiveWorkspace();
  const permissions = useWorkspacePermission();
  if (
    !workspace ||
    permissions.isCheckingPermissions ||
    !permissions.canViewHosting()
  )
    return null;
  const url = `/dashboard/workspace/${workspace.id}/hosting`;
  return (
    <SidebarGroup className="gap-1 p-2">
      <SidebarGroupContent>
        <SidebarMenu className="gap-0.5">
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="Hospedagem"
              isActive={pathname.startsWith(url)}
              size="default"
              className="h-8 ps-3.5 text-sm hover:bg-transparent hover:text-sidebar-accent-foreground active:bg-transparent"
              onClick={() => navigate({ to: url })}
            >
              <MenuIcons.cloudServer className="size-5" />
              <span>Hospedagem</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
