import { useQuery } from "@tanstack/react-query";
import getDeal from "@/fetchers/crm/deal/get-deal";

export function useCrmDeal(
  dealId: string | undefined,
  workspaceId: string | undefined,
) {
  return useQuery({
    queryKey: ["crm", "deal", dealId],
    queryFn: () =>
      getDeal({ dealId: dealId as string, workspaceId: workspaceId as string }),
    enabled: Boolean(dealId && workspaceId),
  });
}
