import { useQuery } from "@tanstack/react-query";
import getCrmLostReasons from "@/fetchers/crm/pipeline/get-lost-reasons";

/** O diálogo de perda pede só as ativas; a tela de configuração pede todas. */
export function useCrmLostReasons(
  workspaceId: string | undefined,
  includeInactive = false,
) {
  return useQuery({
    queryKey: ["crm", "lost-reasons", workspaceId, includeInactive],
    queryFn: () => getCrmLostReasons(workspaceId as string, includeInactive),
    enabled: Boolean(workspaceId),
  });
}
