import type * as React from "react";

import { NavCommercial } from "@/components/nav-commercial";
import { NavFinance } from "@/components/nav-finance";
import { NavMain } from "@/components/nav-main";
import { NavProjects } from "@/components/nav-projects";
import { ThemeToggleDropdown } from "@/components/theme-toggle-dropdown";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  useSidebar,
} from "@/components/ui/sidebar";
import { VersionDisplay } from "@/components/version-display";
import { WorkspaceSwitcher } from "@/components/workspace-switcher";
import { shortcuts } from "@/constants/shortcuts";
import { useRegisterShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { useThemeLayout } from "@/hooks/use-theme-layout";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import Search from "./search";

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const permissions = useWorkspacePermission();
  const { toggleSidebar } = useSidebar();
  const qerza = useThemeLayout() === "qerza";

  useRegisterShortcuts({
    modifierShortcuts: {
      [shortcuts.sidebar.prefix]: {
        [shortcuts.sidebar.toggle]: toggleSidebar,
      },
    },
  });

  return (
    <Sidebar
      collapsible="offcanvas"
      variant="inset"
      className="border-none pt-1.5"
      {...props}
    >
      {!qerza && (
        <SidebarHeader className="pt-1 pb-1.5">
          <WorkspaceSwitcher />
        </SidebarHeader>
      )}
      <SidebarContent className="overflow-hidden gap-1 py-1">
        {!qerza && permissions.canViewProjects() && <Search />}
        <NavMain />
        <NavCommercial />
        <NavFinance />
        <NavProjects />
      </SidebarContent>
      <SidebarFooter>
        <div className="flex items-center justify-between">
          <VersionDisplay />
          <ThemeToggleDropdown />
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
