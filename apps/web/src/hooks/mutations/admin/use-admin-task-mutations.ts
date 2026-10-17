import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  type BulkAdminTaskRequest,
  bulkAdminTasks,
  deleteAdminTask,
  type UpdateAdminTaskRequest,
  updateAdminTask,
} from "@/fetchers/admin/admin-task-actions";

function useAdminTaskInvalidation() {
  const queryClient = useQueryClient();

  return () => {
    queryClient.invalidateQueries({ queryKey: ["admin", "tasks"] });
    queryClient.invalidateQueries({ queryKey: ["admin", "projects"] });
    queryClient.invalidateQueries({ queryKey: ["admin", "workspaces"] });
    queryClient.invalidateQueries({ queryKey: ["admin", "overview"] });
  };
}

export function useUpdateAdminTask() {
  const invalidate = useAdminTaskInvalidation();
  return useMutation({
    mutationFn: (input: UpdateAdminTaskRequest) => updateAdminTask(input),
    onSuccess: invalidate,
  });
}

export function useDeleteAdminTask() {
  const invalidate = useAdminTaskInvalidation();
  return useMutation({
    mutationFn: (taskId: string) => deleteAdminTask(taskId),
    onSuccess: invalidate,
  });
}

export function useBulkAdminTasks() {
  const invalidate = useAdminTaskInvalidation();
  return useMutation({
    mutationFn: (input: BulkAdminTaskRequest) => bulkAdminTasks(input),
    onSuccess: invalidate,
  });
}
