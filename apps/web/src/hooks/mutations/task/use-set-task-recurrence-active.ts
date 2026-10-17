import { useMutation, useQueryClient } from "@tanstack/react-query";
import { setTaskRecurrenceActive } from "@/fetchers/task/set-task-recurrence-active";

export function useSetTaskRecurrenceActive() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ taskId, isActive }: { taskId: string; isActive: boolean }) =>
      setTaskRecurrenceActive(taskId, isActive),
    onSuccess: (_, input) => {
      void queryClient.invalidateQueries({ queryKey: ["task", input.taskId] });
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
}
