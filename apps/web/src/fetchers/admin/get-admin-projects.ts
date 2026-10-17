import { client } from "@kaneo/libs";
import type { InferResponseType } from "hono/client";

export type AdminProjectsResponse = InferResponseType<
  (typeof client)["admin"]["projects"]["$get"]
>;

export type AdminProject = AdminProjectsResponse["projects"][number];

export type AdminProjectsQuery = {
  q?: string;
  workspaceId?: string;
  status?: "active" | "archived" | "all";
  ownerUserId?: string;
  overdue?: "true" | "false";
  limit?: string;
};

export async function getAdminProjects(query: AdminProjectsQuery = {}) {
  const response = await client.admin.projects.$get({ query });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }

  return response.json();
}
