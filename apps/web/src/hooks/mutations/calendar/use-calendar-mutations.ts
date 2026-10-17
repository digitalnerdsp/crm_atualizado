import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  type CreateCalendarEventRequest,
  createCalendarEvent,
  deleteCalendarEvent,
  type UpdateCalendarEventRequest,
  type UpdateCalendarTaskDatesRequest,
  updateCalendarEvent,
  updateCalendarTaskDates,
} from "@/fetchers/calendar/calendar-actions";

function useCalendarInvalidation() {
  const queryClient = useQueryClient();

  return () => {
    queryClient.invalidateQueries({ queryKey: ["calendar"] });
    queryClient.invalidateQueries({ queryKey: ["tasks"] });
    queryClient.invalidateQueries({ queryKey: ["admin", "tasks"] });
  };
}

export function useCreateCalendarEvent() {
  const invalidate = useCalendarInvalidation();
  return useMutation({
    mutationFn: (input: CreateCalendarEventRequest) =>
      createCalendarEvent(input),
    onSuccess: invalidate,
  });
}

export function useUpdateCalendarEvent() {
  const invalidate = useCalendarInvalidation();
  return useMutation({
    mutationFn: (input: UpdateCalendarEventRequest) =>
      updateCalendarEvent(input),
    onSuccess: invalidate,
  });
}

export function useDeleteCalendarEvent() {
  const invalidate = useCalendarInvalidation();
  return useMutation({
    mutationFn: (eventId: string) => deleteCalendarEvent(eventId),
    onSuccess: invalidate,
  });
}

export function useUpdateCalendarTaskDates() {
  const invalidate = useCalendarInvalidation();
  return useMutation({
    mutationFn: (input: UpdateCalendarTaskDatesRequest) =>
      updateCalendarTaskDates(input),
    onSuccess: invalidate,
  });
}
