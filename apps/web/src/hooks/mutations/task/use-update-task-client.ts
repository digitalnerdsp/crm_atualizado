import { useMutation, useQueryClient } from "@tanstack/react-query";
import updateTaskClient from "@/fetchers/task/update-task-client";

export function useUpdateTaskClient() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateTaskClient,
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["task", variables.taskId] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      // The client and deal views count these tasks, so they go stale too.
      queryClient.invalidateQueries({ queryKey: ["crm"] });
    },
  });
}
