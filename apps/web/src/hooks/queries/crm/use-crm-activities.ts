import { useQuery } from "@tanstack/react-query";
import {
  type GetActivitiesQuery,
  getActivities,
} from "@/fetchers/crm/activity";

export function useCrmActivities(query: GetActivitiesQuery | undefined) {
  return useQuery({
    queryKey: ["crm", "activities", query],
    queryFn: () => getActivities(query as GetActivitiesQuery),
    enabled: Boolean(query?.workspaceId),
  });
}
