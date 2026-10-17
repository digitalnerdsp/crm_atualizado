import { useQuery } from "@tanstack/react-query";
import getDeals, { type GetDealsQuery } from "@/fetchers/crm/deal/get-deals";

export function useCrmDeals(query: GetDealsQuery | undefined) {
  return useQuery({
    queryKey: ["crm", "deals", query],
    queryFn: () => getDeals(query as GetDealsQuery),
    enabled: Boolean(query?.workspaceId),
  });
}
