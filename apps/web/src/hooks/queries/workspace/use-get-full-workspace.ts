import { useQuery } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";

type GetFullWorkspaceRequest = {
  workspaceId?: string;
  workspaceSlug?: string;
  membersLimit?: number;
  enabled?: boolean;
};

function useGetFullWorkspace({
  workspaceId,
  workspaceSlug,
  membersLimit = 100,
  enabled = true,
}: GetFullWorkspaceRequest) {
  return useQuery({
    queryKey: ["workspace", "full", workspaceId || workspaceSlug],
    enabled: enabled && !!(workspaceId || workspaceSlug),
    queryFn: async () => {
      const { data, error } = await authClient.organization.getFullOrganization(
        {
          query: {
            organizationId: workspaceId,
            membersLimit,
          },
        },
      );

      if (error) {
        throw new Error(error.message || "Failed to get full workspace");
      }

      return data;
    },
  });
}

export default useGetFullWorkspace;
