import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  archiveAdminProject,
  type CreateAdminProjectRequest,
  createAdminProject,
  type DeleteAdminProjectRequest,
  deleteAdminProject,
  duplicateAdminProject,
  restoreAdminProject,
  type UpdateAdminProjectRequest,
  updateAdminProject,
} from "@/fetchers/admin/admin-project-actions";

function useAdminProjectInvalidation() {
  const queryClient = useQueryClient();

  return () => {
    queryClient.invalidateQueries({ queryKey: ["admin", "projects"] });
    queryClient.invalidateQueries({ queryKey: ["admin", "workspaces"] });
    queryClient.invalidateQueries({ queryKey: ["admin", "overview"] });
  };
}

export function useCreateAdminProject() {
  const invalidate = useAdminProjectInvalidation();
  return useMutation({
    mutationFn: (input: CreateAdminProjectRequest) => createAdminProject(input),
    onSuccess: invalidate,
  });
}

export function useUpdateAdminProject() {
  const invalidate = useAdminProjectInvalidation();
  return useMutation({
    mutationFn: (input: UpdateAdminProjectRequest) => updateAdminProject(input),
    onSuccess: invalidate,
  });
}

export function useArchiveAdminProject() {
  const invalidate = useAdminProjectInvalidation();
  return useMutation({
    mutationFn: (projectId: string) => archiveAdminProject(projectId),
    onSuccess: invalidate,
  });
}

export function useRestoreAdminProject() {
  const invalidate = useAdminProjectInvalidation();
  return useMutation({
    mutationFn: (projectId: string) => restoreAdminProject(projectId),
    onSuccess: invalidate,
  });
}

export function useDuplicateAdminProject() {
  const invalidate = useAdminProjectInvalidation();
  return useMutation({
    mutationFn: (projectId: string) => duplicateAdminProject(projectId),
    onSuccess: invalidate,
  });
}

export function useDeleteAdminProject() {
  const invalidate = useAdminProjectInvalidation();
  return useMutation({
    mutationFn: (input: DeleteAdminProjectRequest) => deleteAdminProject(input),
    onSuccess: invalidate,
  });
}
