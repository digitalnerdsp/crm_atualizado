import { client } from "@kaneo/libs";
import type { InferResponseType } from "hono/client";

export type WorkspaceMembersResponse = InferResponseType<
  (typeof client)["workspace"][":workspaceId"]["members"]["$get"]
>;

export type WorkspaceMember = WorkspaceMembersResponse[number];

export async function getWorkspaceMembers(workspaceId: string) {
  const response = await client.workspace[":workspaceId"].members.$get({
    param: { workspaceId },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }

  return response.json();
}
