import { client } from "@kaneo/libs";
import type { InferResponseType } from "hono/client";

export type WorkspaceDashboardResponse = InferResponseType<
  (typeof client)["dashboard"]["$get"]
>;

export type WorkspaceDashboardQuery = {
  workspaceId: string;
  from: string;
  to: string;
};

export async function getWorkspaceDashboard(query: WorkspaceDashboardQuery) {
  const response = await client.dashboard.$get({ query });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }

  return response.json();
}
