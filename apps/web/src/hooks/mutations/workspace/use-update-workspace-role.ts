import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateWorkspaceRolePermissions } from "@/fetchers/workspace/roles";

type UpdateWorkspaceRoleRequest = {
  workspaceId: string;
  roleName: string;
  permission: Record<string, string[]>;
};
function useUpdateWorkspaceRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      workspaceId,
      roleName,
      permission,
    }: UpdateWorkspaceRoleRequest) =>
      updateWorkspaceRolePermissions(workspaceId, roleName, permission),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["workspace-roles", variables.workspaceId],
      });
      // The role's permission set just changed, so any cached capability
      // map for members assigned to this role is now stale.
      queryClient.invalidateQueries({
        queryKey: ["workspace-capabilities", variables.workspaceId],
      });
    },
  });
}

export default useUpdateWorkspaceRole;
