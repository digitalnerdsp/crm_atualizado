import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  type CreateLostReasonPayload,
  createCrmLostReason,
  type UpdateLostReasonPayload,
  updateCrmLostReason,
} from "@/fetchers/crm/pipeline/get-lost-reasons";
import {
  type CreateSegmentPayload,
  type CreateSourcePayload,
  createCrmSegment,
  createCrmSource,
  type UpdateSegmentPayload,
  type UpdateSourcePayload,
  updateCrmSegment,
  updateCrmSource,
} from "@/fetchers/crm/taxonomy";

function useInvalidateCrm() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["crm"] });
}

export function useCreateCrmSource() {
  const invalidate = useInvalidateCrm();
  return useMutation({
    mutationFn: (payload: CreateSourcePayload) => createCrmSource(payload),
    onSuccess: invalidate,
  });
}

export function useUpdateCrmSource() {
  const invalidate = useInvalidateCrm();
  return useMutation({
    mutationFn: ({
      sourceId,
      payload,
    }: {
      sourceId: string;
      payload: UpdateSourcePayload;
    }) => updateCrmSource(sourceId, payload),
    onSuccess: invalidate,
  });
}

export function useCreateCrmSegment() {
  const invalidate = useInvalidateCrm();
  return useMutation({
    mutationFn: (payload: CreateSegmentPayload) => createCrmSegment(payload),
    onSuccess: invalidate,
  });
}

export function useUpdateCrmSegment() {
  const invalidate = useInvalidateCrm();
  return useMutation({
    mutationFn: ({
      segmentId,
      payload,
    }: {
      segmentId: string;
      payload: UpdateSegmentPayload;
    }) => updateCrmSegment(segmentId, payload),
    onSuccess: invalidate,
  });
}

export function useCreateCrmLostReason() {
  const invalidate = useInvalidateCrm();
  return useMutation({
    mutationFn: (payload: CreateLostReasonPayload) =>
      createCrmLostReason(payload),
    onSuccess: invalidate,
  });
}

export function useUpdateCrmLostReason() {
  const invalidate = useInvalidateCrm();
  return useMutation({
    mutationFn: ({
      lostReasonId,
      payload,
    }: {
      lostReasonId: string;
      payload: UpdateLostReasonPayload;
    }) => updateCrmLostReason(lostReasonId, payload),
    onSuccess: invalidate,
  });
}
