import { useQuery } from "@tanstack/react-query";
import { getWorkspaceMembers } from "@/fetchers/workspace/get-workspace-members";

export function useWorkspaceMembers(workspaceId?: string) {
  return useQuery({
    queryKey: ["workspace", workspaceId, "members"],
    queryFn: () => getWorkspaceMembers(workspaceId ?? ""),
    enabled: Boolean(workspaceId),
  });
}
