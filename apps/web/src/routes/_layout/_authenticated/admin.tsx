import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { getAdminMe } from "@/fetchers/admin/get-admin-me";

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

function AdminLayout() {
  return <Outlet />;
}
