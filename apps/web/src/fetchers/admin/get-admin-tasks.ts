import { client } from "@kaneo/libs";
import type { InferResponseType } from "hono/client";

export type AdminTasksResponse = InferResponseType<
  (typeof client)["admin"]["tasks"]["$get"]
>;

export type AdminTask = AdminTasksResponse["tasks"][number];

export type AdminTasksQuery = {
  q?: string;
  workspaceId?: string;
  projectId?: string;
  status?: string;
  priority?: string;
  assigneeId?: string;
  overdue?: "true" | "false";
  limit?: string;
};

export async function getAdminTasks(query: AdminTasksQuery = {}) {
  const response = await client.admin.tasks.$get({ query });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }

  return response.json();
}
