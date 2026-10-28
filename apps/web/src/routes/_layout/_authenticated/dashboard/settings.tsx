import { createFileRoute, Outlet, useLocation } from "@tanstack/react-router";
import {
  type SettingsSection,
  SettingsShell,
} from "@/components/settings/settings-shell";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/settings",
)({
  component: SettingsLayout,
});

function SettingsLayout() {
  const { pathname } = useLocation();
  const section: SettingsSection = pathname.includes(
    "/dashboard/settings/workspace",
  )
    ? "workspace"
    : pathname.includes("/dashboard/settings/projects")
      ? "project"
      : "account";

  return (
    <SettingsShell section={section}>
      <Outlet />
    </SettingsShell>
  );
}
