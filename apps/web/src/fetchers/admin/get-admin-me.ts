import { client } from "@kaneo/libs";
import type { InferResponseType } from "hono/client";

export type AdminMeResponse = InferResponseType<
  (typeof client)["admin"]["me"]["$get"]
>;

export async function getAdminMe() {
  const response = await client.admin.me.$get();

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }

  return response.json();
}
