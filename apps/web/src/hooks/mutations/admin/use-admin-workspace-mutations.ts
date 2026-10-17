import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  type AdminWorkspaceMemberRequest,
  addAdminWorkspaceMember,
  archiveAdminWorkspace,
  type CreateAdminWorkspaceRequest,
  createAdminWorkspace,
  type DeleteAdminWorkspaceRequest,
  deleteAdminWorkspace,
  removeAdminWorkspaceMember,
  restoreAdminWorkspace,
  type UpdateAdminWorkspaceMemberRequest,
  type UpdateAdminWorkspaceRequest,
  updateAdminWorkspace,
  updateAdminWorkspaceMember,
} from "@/fetchers/admin/admin-workspace-actions";

function useAdminWorkspaceInvalidation() {
  const queryClient = useQueryClient();

  return () => {
    queryClient.invalidateQueries({ queryKey: ["admin", "workspaces"] });
    queryClient.invalidateQueries({ queryKey: ["admin", "projects"] });
    queryClient.invalidateQueries({ queryKey: ["admin", "overview"] });
  };
}

export function useCreateAdminWorkspace() {
  const invalidate = useAdminWorkspaceInvalidation();
  return useMutation({
    mutationFn: (input: CreateAdminWorkspaceRequest) =>
      createAdminWorkspace(input),
    onSuccess: invalidate,
  });
}

export function useUpdateAdminWorkspace() {
  const invalidate = useAdminWorkspaceInvalidation();
  return useMutation({
    mutationFn: (input: UpdateAdminWorkspaceRequest) =>
      updateAdminWorkspace(input),
    onSuccess: invalidate,
  });
}

export function useArchiveAdminWorkspace() {
  const invalidate = useAdminWorkspaceInvalidation();
  return useMutation({
    mutationFn: (workspaceId: string) => archiveAdminWorkspace(workspaceId),
    onSuccess: invalidate,
  });
}

export function useRestoreAdminWorkspace() {
  const invalidate = useAdminWorkspaceInvalidation();
  return useMutation({
    mutationFn: (workspaceId: string) => restoreAdminWorkspace(workspaceId),
    onSuccess: invalidate,
  });
}

export function useDeleteAdminWorkspace() {
  const invalidate = useAdminWorkspaceInvalidation();
  return useMutation({
    mutationFn: (input: DeleteAdminWorkspaceRequest) =>
      deleteAdminWorkspace(input),
    onSuccess: invalidate,
  });
}

export function useAddAdminWorkspaceMember() {
  const invalidate = useAdminWorkspaceInvalidation();
  return useMutation({
    mutationFn: (input: AdminWorkspaceMemberRequest) =>
      addAdminWorkspaceMember(input),
    onSuccess: invalidate,
  });
}

export function useUpdateAdminWorkspaceMember() {
  const invalidate = useAdminWorkspaceInvalidation();
  return useMutation({
    mutationFn: (input: UpdateAdminWorkspaceMemberRequest) =>
      updateAdminWorkspaceMember(input),
    onSuccess: invalidate,
  });
}

export function useRemoveAdminWorkspaceMember() {
  const invalidate = useAdminWorkspaceInvalidation();
  return useMutation({
    mutationFn: (input: { workspaceId: string; userId: string }) =>
      removeAdminWorkspaceMember(input),
    onSuccess: invalidate,
  });
}
