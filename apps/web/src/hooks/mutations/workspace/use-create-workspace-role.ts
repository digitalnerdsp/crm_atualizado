import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createWorkspaceRole } from "@/fetchers/workspace/roles";

type CreateWorkspaceRoleRequest = {
  workspaceId: string;
  role: string;
  permission: Record<string, string[]>;
};

function useCreateWorkspaceRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      workspaceId,
      role,
      permission,
    }: CreateWorkspaceRoleRequest) =>
      createWorkspaceRole(workspaceId, role, permission),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["workspace-roles", variables.workspaceId],
      });
    },
  });
}

export default useCreateWorkspaceRole;
