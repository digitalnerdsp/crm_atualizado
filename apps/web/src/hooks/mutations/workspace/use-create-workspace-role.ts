import { useMutation, useQueryClient } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";

type CreateWorkspaceRoleRequest = {
  workspaceId: string;
  role: string;
  permission: Record<string, string[]>;
};
type OrganizationRoleClient = {
  createRole(input: {
    organizationId: string;
    role: string;
    permission: Record<string, string[]>;
  }): Promise<{ data: unknown; error: { message?: string } | null }>;
};

function useCreateWorkspaceRole() {
  const queryClient = useQueryClient();
  const organization =
    authClient.organization as unknown as OrganizationRoleClient;
  return useMutation({
    mutationFn: async ({
      workspaceId,
      role,
      permission,
    }: CreateWorkspaceRoleRequest) => {
      const { data, error } = await organization.createRole({
        organizationId: workspaceId,
        role,
        permission,
      });
      if (error) {
        throw new Error(error.message || "Failed to create role");
      }
      return data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["workspace-roles", variables.workspaceId],
      });
    },
  });
}

export default useCreateWorkspaceRole;
