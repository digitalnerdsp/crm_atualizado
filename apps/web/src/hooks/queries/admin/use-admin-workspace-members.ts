import { useQuery } from "@tanstack/react-query";
import { getAdminWorkspaceMembers } from "@/fetchers/admin/get-admin-workspace-members";

export function useAdminWorkspaceMembers(workspaceId?: string) {
  return useQuery({
    queryKey: ["admin", "workspaces", workspaceId, "members"],
    queryFn: () => getAdminWorkspaceMembers(workspaceId ?? ""),
    enabled: Boolean(workspaceId),
    retry: false,
  });
}
