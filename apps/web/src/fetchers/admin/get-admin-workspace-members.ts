import { client } from "@kaneo/libs";
import type { InferResponseType } from "hono/client";

export type AdminWorkspaceMembersResponse = InferResponseType<
  (typeof client)["admin"]["workspaces"][":workspaceId"]["members"]["$get"]
>;

export type AdminWorkspaceMember =
  AdminWorkspaceMembersResponse["members"][number];

export async function getAdminWorkspaceMembers(workspaceId: string) {
  const response = await client.admin.workspaces[":workspaceId"].members.$get({
    param: { workspaceId },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }

  return response.json();
}
