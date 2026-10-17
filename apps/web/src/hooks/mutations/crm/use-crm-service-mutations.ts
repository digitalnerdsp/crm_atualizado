import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  type CreateServiceCategoryPayload,
  type CreateServicePayload,
  createCrmService,
  createCrmServiceCategory,
  type SetDealServicesPayload,
  setCrmDealServices,
  type UpdateServiceCategoryPayload,
  type UpdateServicePayload,
  updateCrmService,
  updateCrmServiceCategory,
} from "@/fetchers/crm/service";

function useInvalidateCrm() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["crm"] });
}

export function useCreateCrmService() {
  const invalidate = useInvalidateCrm();
  return useMutation({
    mutationFn: (payload: CreateServicePayload) => createCrmService(payload),
    onSuccess: invalidate,
  });
}

export function useUpdateCrmService() {
  const invalidate = useInvalidateCrm();
  return useMutation({
    mutationFn: ({
      serviceId,
      payload,
    }: {
      serviceId: string;
      payload: UpdateServicePayload;
    }) => updateCrmService(serviceId, payload),
    onSuccess: invalidate,
  });
}

export function useCreateCrmServiceCategory() {
  const invalidate = useInvalidateCrm();
  return useMutation({
    mutationFn: (payload: CreateServiceCategoryPayload) =>
      createCrmServiceCategory(payload),
    onSuccess: invalidate,
  });
}

export function useUpdateCrmServiceCategory() {
  const invalidate = useInvalidateCrm();
  return useMutation({
    mutationFn: ({
      categoryId,
      payload,
    }: {
      categoryId: string;
      payload: UpdateServiceCategoryPayload;
    }) => updateCrmServiceCategory(categoryId, payload),
    onSuccess: invalidate,
  });
}

export function useSetCrmDealServices() {
  const invalidate = useInvalidateCrm();
  return useMutation({
    mutationFn: ({
      dealId,
      payload,
    }: {
      dealId: string;
      payload: SetDealServicesPayload;
    }) => setCrmDealServices(dealId, payload),
    onSuccess: invalidate,
  });
}
