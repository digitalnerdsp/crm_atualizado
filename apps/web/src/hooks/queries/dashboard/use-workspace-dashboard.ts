import { useQuery } from "@tanstack/react-query";
import {
  getWorkspaceDashboard,
  type WorkspaceDashboardQuery,
} from "@/fetchers/dashboard/get-workspace-dashboard";

export function useWorkspaceDashboard(
  query: WorkspaceDashboardQuery,
  enabled = true,
) {
  return useQuery({
    queryKey: ["workspace-dashboard", query],
    queryFn: () => getWorkspaceDashboard(query),
    enabled,
    retry: false,
    staleTime: 30_000,
  });
}
