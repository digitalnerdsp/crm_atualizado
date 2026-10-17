import { client } from "@kaneo/libs";
import type { InferResponseType } from "hono/client";

export type AdminRolesResponse = InferResponseType<
  (typeof client)["admin"]["roles"]["$get"]
>;

export type AdminRole = AdminRolesResponse["roles"][number];
export type AdminPermission = AdminRolesResponse["permissions"][number];

export async function getAdminRoles() {
  const response = await client.admin.roles.$get();

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }

  return response.json();
}
