import { useQuery } from "@tanstack/react-query";
import getCrmPipelines from "@/fetchers/crm/pipeline/get-pipelines";

export function useCrmPipelines(workspaceId: string | undefined) {
  return useQuery({
    queryKey: ["crm", "pipelines", workspaceId],
    queryFn: () => getCrmPipelines(workspaceId as string),
    enabled: Boolean(workspaceId),
  });
}
