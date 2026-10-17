import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  type ConfigureTaskRecurrenceInput,
  configureTaskRecurrence,
} from "@/fetchers/task/configure-task-recurrence";

export function useConfigureTaskRecurrence() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: ConfigureTaskRecurrenceInput) =>
      configureTaskRecurrence(input),
    onSuccess: (_, input) => {
      void queryClient.invalidateQueries({ queryKey: ["task", input.taskId] });
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
}
