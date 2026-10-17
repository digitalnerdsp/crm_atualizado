import { client } from "@kaneo/libs";
import type { InferResponseType } from "hono/client";

export type AdminSettingsResponse = InferResponseType<
  (typeof client)["admin"]["settings"]["$get"]
>;

export type AdminSetting = AdminSettingsResponse["settings"][number];

export async function getAdminSettings() {
  const response = await client.admin.settings.$get();

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }

  return response.json();
}
