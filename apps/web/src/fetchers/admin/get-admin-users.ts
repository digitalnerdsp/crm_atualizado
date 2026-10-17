import { client } from "@kaneo/libs";
import type { InferResponseType } from "hono/client";

export type AdminUsersResponse = InferResponseType<
  (typeof client)["admin"]["users"]["$get"]
>;

export type AdminUser = AdminUsersResponse["users"][number];

export type AdminUsersQuery = {
  q?: string;
  role?: string;
  status?: "active" | "blocked" | "all";
  emailVerified?: "true" | "false";
  limit?: string;
};

export async function getAdminUsers(query: AdminUsersQuery = {}) {
  const response = await client.admin.users.$get({ query });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }

  return response.json();
}
