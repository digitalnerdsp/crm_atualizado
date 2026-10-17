import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  type CancelContractPayload,
  type ChangeContractValuePayload,
  type ContractAction,
  type ContractFromDealPayload,
  type ContractTransitionPayload,
  type CreateContractPayload,
  cancelCrmContract,
  changeCrmContractValue,
  createCrmContract,
  createCrmContractFromDeal,
  transitionCrmContract,
  type UpdateContractPayload,
  updateCrmContract,
} from "@/fetchers/crm/contract";

/** Contrato mexe na situação do cliente e no MRR: invalidar o CRM inteiro é
 * o que mantém ficha do cliente, lista e negócio coerentes entre si. */
function useInvalidateCrm() {
  const queryClient = useQueryClient();
  return async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["crm"] }),
      queryClient.invalidateQueries({ queryKey: ["finance"] }),
    ]);
  };
}

export function useCreateCrmContract() {
  const invalidate = useInvalidateCrm();
  return useMutation({
    mutationFn: (payload: CreateContractPayload) => createCrmContract(payload),
    onSuccess: invalidate,
  });
}

export function useCreateCrmContractFromDeal() {
  const invalidate = useInvalidateCrm();
  return useMutation({
    mutationFn: ({
      dealId,
      payload,
    }: {
      dealId: string;
      payload: ContractFromDealPayload;
    }) => createCrmContractFromDeal(dealId, payload),
    onSuccess: invalidate,
  });
}

export function useUpdateCrmContract() {
  const invalidate = useInvalidateCrm();
  return useMutation({
    mutationFn: ({
      contractId,
      payload,
    }: {
      contractId: string;
      payload: UpdateContractPayload;
    }) => updateCrmContract(contractId, payload),
    onSuccess: invalidate,
  });
}

export function useChangeCrmContractValue() {
  const invalidate = useInvalidateCrm();
  return useMutation({
    mutationFn: ({
      contractId,
      payload,
    }: {
      contractId: string;
      payload: ChangeContractValuePayload;
    }) => changeCrmContractValue(contractId, payload),
    onSuccess: invalidate,
  });
}

export function useCancelCrmContract() {
  const invalidate = useInvalidateCrm();
  return useMutation({
    mutationFn: ({
      contractId,
      payload,
    }: {
      contractId: string;
      payload: CancelContractPayload;
    }) => cancelCrmContract(contractId, payload),
    onSuccess: invalidate,
  });
}

export function useTransitionCrmContract() {
  const invalidate = useInvalidateCrm();
  return useMutation({
    mutationFn: ({
      contractId,
      action,
      payload,
    }: {
      contractId: string;
      action: ContractAction;
      payload: ContractTransitionPayload;
    }) => transitionCrmContract(contractId, action, payload),
    onSuccess: invalidate,
  });
}
