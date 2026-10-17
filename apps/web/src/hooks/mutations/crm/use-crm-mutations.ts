import { useMutation, useQueryClient } from "@tanstack/react-query";
import createDeal, {
  type CreateDealPayload,
} from "@/fetchers/crm/deal/create-deal";
import createDeliveryTasks, {
  type CreateDeliveryTasksPayload,
} from "@/fetchers/crm/deal/create-delivery-tasks";
import deleteDeal from "@/fetchers/crm/deal/delete-deal";
import moveDealStage, {
  type MoveDealStagePayload,
} from "@/fetchers/crm/deal/move-deal-stage";
import reopenDeal from "@/fetchers/crm/deal/reopen-deal";
import updateDeal, {
  type UpdateDealPayload,
} from "@/fetchers/crm/deal/update-deal";

/**
 * Every CRM cache key starts with "crm", so one prefix invalidation refreshes
 * the board, the list and any open deal at once. Board totals are computed
 * server-side, so a stale board is a wrong number — not just a stale row.
 */
function useInvalidateCrm() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["crm"] });
}

export function useCreateDeal() {
  const invalidate = useInvalidateCrm();

  return useMutation({
    mutationFn: (payload: CreateDealPayload) => createDeal(payload),
    onSuccess: invalidate,
  });
}

export function useUpdateDeal() {
  const invalidate = useInvalidateCrm();

  return useMutation({
    mutationFn: ({
      dealId,
      payload,
    }: {
      dealId: string;
      payload: UpdateDealPayload;
    }) => updateDeal(dealId, payload),
    onSuccess: invalidate,
  });
}

export function useMoveDealStage() {
  const invalidate = useInvalidateCrm();

  return useMutation({
    mutationFn: ({
      dealId,
      payload,
    }: {
      dealId: string;
      payload: MoveDealStagePayload;
    }) => moveDealStage(dealId, payload),
    onSuccess: invalidate,
  });
}

export function useReopenDeal() {
  const invalidate = useInvalidateCrm();

  return useMutation({
    mutationFn: (params: {
      dealId: string;
      workspaceId: string;
      stageId?: string;
    }) => reopenDeal(params),
    onSuccess: invalidate,
  });
}

export function useDeleteDeal() {
  const invalidate = useInvalidateCrm();

  return useMutation({
    mutationFn: (params: { dealId: string; workspaceId: string }) =>
      deleteDeal(params),
    onSuccess: invalidate,
  });
}

export function useCreateDeliveryTasks() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      dealId,
      payload,
    }: {
      dealId: string;
      payload: CreateDeliveryTasksPayload;
    }) => createDeliveryTasks(dealId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm"] });
      // The tasks land in discipline boards that are already open elsewhere.
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}
