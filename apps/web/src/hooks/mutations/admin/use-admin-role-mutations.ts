import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  type CreateAdminRoleRequest,
  createAdminRole,
  type DeleteAdminRoleRequest,
  type DuplicateAdminRoleRequest,
  deleteAdminRole,
  duplicateAdminRole,
  type UpdateAdminRoleRequest,
  updateAdminRole,
} from "@/fetchers/admin/admin-role-actions";

function useAdminRoleInvalidation() {
  const queryClient = useQueryClient();

  return () => {
    queryClient.invalidateQueries({ queryKey: ["admin", "roles"] });
    queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
    queryClient.invalidateQueries({ queryKey: ["admin", "overview"] });
    queryClient.invalidateQueries({ queryKey: ["admin", "me"] });
  };
}

export function useCreateAdminRole() {
  const invalidateRoles = useAdminRoleInvalidation();

  return useMutation({
    mutationFn: (input: CreateAdminRoleRequest) => createAdminRole(input),
    onSuccess: invalidateRoles,
  });
}

export function useUpdateAdminRole() {
  const invalidateRoles = useAdminRoleInvalidation();

  return useMutation({
    mutationFn: (input: UpdateAdminRoleRequest) => updateAdminRole(input),
    onSuccess: invalidateRoles,
  });
}

export function useDuplicateAdminRole() {
  const invalidateRoles = useAdminRoleInvalidation();

  return useMutation({
    mutationFn: (input: DuplicateAdminRoleRequest) => duplicateAdminRole(input),
    onSuccess: invalidateRoles,
  });
}

export function useDeleteAdminRole() {
  const invalidateRoles = useAdminRoleInvalidation();

  return useMutation({
    mutationFn: (input: DeleteAdminRoleRequest) => deleteAdminRole(input),
    onSuccess: invalidateRoles,
  });
}
