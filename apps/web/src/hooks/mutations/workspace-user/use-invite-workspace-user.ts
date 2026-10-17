import { useMutation } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";
import queryClient from "@/query-client";

type InviteWorkspaceUserRequest = {
  workspaceId: string;
  email: string;
  /* Qualquer papel do workspace, não só os três estáticos do better-auth: com
   * controle de acesso dinâmico, `sales`, `sales_manager` e os papéis criados
   * pela equipe são linhas em `workspace_role` e valem no convite. O tipo do
   * cliente ainda reflete só os estáticos, daí o cast na chamada. */
  role: string;
  resend?: boolean;
};

function useInviteWorkspaceUser() {
  return useMutation({
    mutationFn: async ({
      workspaceId,
      email,
      role,
      resend,
    }: InviteWorkspaceUserRequest) => {
      const { data, error } = await authClient.organization.inviteMember({
        email,
        role: role as "admin" | "member" | "owner",
        organizationId: workspaceId,
        resend,
      });

      if (error) {
        throw new Error(error.message || "Failed to invite workspace member");
      }

      return data;
    },
    onSuccess: (_, { workspaceId }) => {
      queryClient.invalidateQueries({
        queryKey: ["workspace-invites", workspaceId],
      });

      queryClient.invalidateQueries({
        queryKey: ["workspace", "full", workspaceId],
      });

      queryClient.invalidateQueries({
        queryKey: ["workspace-users", workspaceId],
      });
    },
  });
}

export default useInviteWorkspaceUser;
