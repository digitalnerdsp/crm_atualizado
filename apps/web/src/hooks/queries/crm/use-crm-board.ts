import { useQuery } from "@tanstack/react-query";
import getDealBoard, {
  type GetDealBoardParams,
} from "@/fetchers/crm/deal/get-deal-board";

export function crmBoardQueryKey(params: Partial<GetDealBoardParams>) {
  return [
    "crm",
    "board",
    params.workspaceId,
    params.pipelineId ?? null,
    params.ownerUserId ?? null,
    params.search ?? null,
  ] as const;
}

export function useCrmBoard(params: Partial<GetDealBoardParams>) {
  return useQuery({
    queryKey: crmBoardQueryKey(params),
    queryFn: () => getDealBoard(params as GetDealBoardParams),
    enabled: Boolean(params.workspaceId),
    // The board is the screen a rep leaves open; a short window keeps a tab
    // switch from refetching while the websocket keeps it live anyway.
    staleTime: 30 * 1000,
  });
}
