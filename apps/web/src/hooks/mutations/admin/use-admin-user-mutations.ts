import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  type CreateAdminUserRequest,
  createAdminUser,
} from "@/fetchers/admin/create-admin-user";
import {
  type DeleteAdminUserRequest,
  deleteAdminUser,
} from "@/fetchers/admin/delete-admin-user";
import {
  type ResetAdminUserPasswordRequest,
  resetAdminUserPassword,
} from "@/fetchers/admin/reset-admin-user-password";
import { revokeAdminUserSessions } from "@/fetchers/admin/revoke-admin-user-sessions";
import {
  type UpdateAdminUserRequest,
  updateAdminUser,
} from "@/fetchers/admin/update-admin-user";

function useAdminInvalidation() {
  const queryClient = useQueryClient();

  return () => {
    queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
    queryClient.invalidateQueries({ queryKey: ["admin", "workspaces"] });
    queryClient.invalidateQueries({ queryKey: ["admin", "projects"] });
    queryClient.invalidateQueries({ queryKey: ["admin", "overview"] });
  };
}

export function useCreateAdminUser() {
  const invalidateAdmin = useAdminInvalidation();

  return useMutation({
    mutationFn: (input: CreateAdminUserRequest) => createAdminUser(input),
    onSuccess: invalidateAdmin,
  });
}

export function useUpdateAdminUser() {
  const invalidateAdmin = useAdminInvalidation();

  return useMutation({
    mutationFn: (input: UpdateAdminUserRequest) => updateAdminUser(input),
    onSuccess: invalidateAdmin,
  });
}

export function useResetAdminUserPassword() {
  const invalidateAdmin = useAdminInvalidation();

  return useMutation({
    mutationFn: (input: ResetAdminUserPasswordRequest) =>
      resetAdminUserPassword(input),
    onSuccess: invalidateAdmin,
  });
}

export function useRevokeAdminUserSessions() {
  const invalidateAdmin = useAdminInvalidation();

  return useMutation({
    mutationFn: (userId: string) => revokeAdminUserSessions(userId),
    onSuccess: invalidateAdmin,
  });
}

export function useDeleteAdminUser() {
  const invalidateAdmin = useAdminInvalidation();

  return useMutation({
    mutationFn: (input: DeleteAdminUserRequest) => deleteAdminUser(input),
    onSuccess: invalidateAdmin,
  });
}
