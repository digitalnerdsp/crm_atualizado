import { useQuery } from "@tanstack/react-query";
import { type GetSalesQuery, getSales } from "@/fetchers/crm/sale";

export function useCrmSales(query: GetSalesQuery | undefined) {
  return useQuery({
    queryKey: ["crm", "sales", query],
    queryFn: () => getSales(query as GetSalesQuery),
    enabled: Boolean(query?.workspaceId),
  });
}
