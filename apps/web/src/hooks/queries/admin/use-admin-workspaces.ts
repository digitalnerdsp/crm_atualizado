import { useQuery } from "@tanstack/react-query";
import {
  type AdminWorkspacesQuery,
  getAdminWorkspaces,
} from "@/fetchers/admin/get-admin-workspaces";

export function useAdminWorkspaces(query: AdminWorkspacesQuery = {}) {
  return useQuery({
    queryKey: ["admin", "workspaces", query],
    queryFn: () => getAdminWorkspaces(query),
    retry: false,
    staleTime: 15_000,
  });
}
