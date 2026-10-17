import { useQuery } from "@tanstack/react-query";
import {
  getCrmServiceCategories,
  getCrmServices,
} from "@/fetchers/crm/service";

export function useCrmServices(
  workspaceId: string | undefined,
  includeArchived = false,
) {
  return useQuery({
    queryKey: ["crm", "services", workspaceId, includeArchived],
    queryFn: () => getCrmServices(workspaceId as string, includeArchived),
    enabled: Boolean(workspaceId),
  });
}

export function useCrmServiceCategories(workspaceId: string | undefined) {
  return useQuery({
    queryKey: ["crm", "service-categories", workspaceId],
    queryFn: () => getCrmServiceCategories(workspaceId as string),
    enabled: Boolean(workspaceId),
  });
}
