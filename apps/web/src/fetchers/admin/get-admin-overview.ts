import { client } from "@kaneo/libs";
import type { InferResponseType } from "hono/client";

export type AdminOverviewResponse = InferResponseType<
  (typeof client)["admin"]["overview"]["$get"]
>;

export async function getAdminOverview() {
  const response = await client.admin.overview.$get();

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }

  return response.json();
}
