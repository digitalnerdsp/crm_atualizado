import { client } from "@kaneo/libs";
import type { InferResponseType } from "hono/client";

export type AdminWorkspacesResponse = InferResponseType<
  (typeof client)["admin"]["workspaces"]["$get"]
>;

export type AdminWorkspace = AdminWorkspacesResponse["workspaces"][number];

export type AdminWorkspacesQuery = {
  q?: string;
  status?: "active" | "archived" | "all";
  limit?: string;
};

export async function getAdminWorkspaces(query: AdminWorkspacesQuery = {}) {
  const response = await client.admin.workspaces.$get({ query });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }

  return response.json();
}
