import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  type CreateActivityPayload,
  completeActivity,
  createActivity,
  deleteActivity,
  type UpdateActivityPayload,
  updateActivity,
} from "@/fetchers/crm/activity";
import {
  type CreateCompanyPayload,
  createCompany,
  type UpdateCompanyPayload,
  updateCompany,
} from "@/fetchers/crm/company";
import {
  type CreateContactPayload,
  createContact,
  deleteContact,
  type UpdateContactPayload,
  updateContact,
} from "@/fetchers/crm/contact";

function useInvalidateCrm() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["crm"] });
}

export function useCreateContact() {
  const invalidate = useInvalidateCrm();
  return useMutation({
    mutationFn: (payload: CreateContactPayload) => createContact(payload),
    onSuccess: invalidate,
  });
}

export function useUpdateContact() {
  const invalidate = useInvalidateCrm();
  return useMutation({
    mutationFn: ({
      contactId,
      payload,
    }: {
      contactId: string;
      payload: UpdateContactPayload;
    }) => updateContact(contactId, payload),
    onSuccess: invalidate,
  });
}

export function useDeleteContact() {
  const invalidate = useInvalidateCrm();
  return useMutation({
    mutationFn: (params: { contactId: string; workspaceId: string }) =>
      deleteContact(params),
    onSuccess: invalidate,
  });
}

export function useCreateCompany() {
  const invalidate = useInvalidateCrm();
  return useMutation({
    mutationFn: (payload: CreateCompanyPayload) => createCompany(payload),
    onSuccess: invalidate,
  });
}

export function useUpdateCompany() {
  const invalidate = useInvalidateCrm();
  return useMutation({
    mutationFn: ({
      companyId,
      payload,
    }: {
      companyId: string;
      payload: UpdateCompanyPayload;
    }) => updateCompany(companyId, payload),
    onSuccess: invalidate,
  });
}

export function useCreateActivity() {
  const invalidate = useInvalidateCrm();
  return useMutation({
    mutationFn: (payload: CreateActivityPayload) => createActivity(payload),
    onSuccess: invalidate,
  });
}

export function useCompleteActivity() {
  const invalidate = useInvalidateCrm();
  return useMutation({
    mutationFn: (params: {
      activityId: string;
      workspaceId: string;
      outcome?: string;
      durationMinutes?: number;
    }) => completeActivity(params),
    onSuccess: invalidate,
  });
}

export function useUpdateActivity() {
  const invalidate = useInvalidateCrm();
  return useMutation({
    mutationFn: (payload: UpdateActivityPayload) => updateActivity(payload),
    onSuccess: invalidate,
  });
}

export function useDeleteActivity() {
  const invalidate = useInvalidateCrm();
  return useMutation({
    mutationFn: (params: { activityId: string; workspaceId: string }) =>
      deleteActivity(params),
    onSuccess: invalidate,
  });
}
