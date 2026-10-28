import {
  createFileRoute,
  Link,
  Outlet,
  redirect,
  useLocation,
} from "@tanstack/react-router";
import {
  Braces,
  BriefcaseBusiness,
  ClipboardList,
  FolderKanban,
  ListChecks,
  type LucideIcon,
  Settings,
  Shield,
  Users,
} from "lucide-react";
import { SettingsShell } from "@/components/settings/settings-shell";
import { Button } from "@/components/ui/button";
import { getAdminMe } from "@/fetchers/admin/get-admin-me";
import { useAdminMe } from "@/hooks/queries/admin/use-admin-me";
import { cn } from "@/lib/cn";

export const Route = createFileRoute("/_layout/_authenticated/admin")({
  beforeLoad: async () => {
    try {
      await getAdminMe();
    } catch {
      throw redirect({ to: "/dashboard" });
    }
  },
  component: AdminLayout,
});

type AdminItem = {
  title: string;
  url: string;
  icon: LucideIcon;
  show: boolean;
};

function AdminLayout() {
  const { pathname } = useLocation();
  const { data: adminMe } = useAdminMe();
  const permissions = adminMe?.permissions ?? [];
  const has = (permission: string) =>
    permissions.includes("*") || permissions.includes(permission);
  const isAdmin = adminMe?.role === "admin" || adminMe?.role === "superadmin";
  const items: AdminItem[] = [
    { title: "Usuários", url: "/admin", icon: Users, show: true },
    {
      title: "Workspaces",
      url: "/admin/workspaces",
      icon: BriefcaseBusiness,
      show: has("admin.workspaces.view"),
    },
    {
      title: "Projetos",
      url: "/admin/projects",
      icon: FolderKanban,
      show: has("admin.projects.view"),
    },
    {
      title: "Tarefas",
      url: "/admin/tasks",
      icon: ListChecks,
      show: has("admin.tasks.view"),
    },
    {
      title: "Papéis globais",
      url: "/admin/roles",
      icon: Shield,
      show: has("admin.users.manage_roles"),
    },
    {
      title: "Auditoria",
      url: "/admin/audit",
      icon: ClipboardList,
      show: has("system.audit.view"),
    },
    {
      title: "Parâmetros do sistema",
      url: "/admin/settings",
      icon: Settings,
      show: has("system.settings.view"),
    },
    { title: "API", url: "/admin/api-docs", icon: Braces, show: isAdmin },
  ];
  const isActive = (url: string) =>
    url === "/admin"
      ? pathname.replace(/\/$/, "") === "/admin"
      : pathname.startsWith(url);

  return (
    <SettingsShell section="admin">
      <div className="flex h-full gap-6">
        <aside className="w-56 shrink-0">
          <p className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Administração do sistema
          </p>
          <nav className="flex flex-col gap-0.5">
            {items
              .filter((item) => item.show)
              .map((item) => (
                <Button
                  key={item.url}
                  render={<Link to={item.url} />}
                  variant="ghost"
                  size="sm"
                  className={cn(
                    "h-8 w-full justify-start gap-2 rounded-lg px-2 text-sm font-medium text-foreground/80",
                    isActive(item.url) &&
                      "bg-sidebar-accent text-sidebar-accent-foreground",
                  )}
                >
                  <item.icon className="size-4" />
                  <span>{item.title}</span>
                </Button>
              ))}
          </nav>
        </aside>
        <div className="min-w-0 flex-1">
          <Outlet />
        </div>
      </div>
    </SettingsShell>
  );
}
