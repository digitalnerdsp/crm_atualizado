import { useQuery } from "@tanstack/react-query";
import { getTaskTemplates } from "@/fetchers/task-template";

export function useTaskTemplates(workspaceId: string, enabled = true) {
  return useQuery({
    queryKey: ["task-templates", workspaceId],
    queryFn: () => getTaskTemplates(workspaceId),
    enabled: Boolean(workspaceId) && enabled,
  });
}
