import { client } from "@kaneo/libs";
import type { InferRequestType, InferResponseType } from "hono/client";

export type UpdateAdminSettingsRequest = InferRequestType<
  (typeof client)["admin"]["settings"]["$patch"]
>["json"];

export type UpdateAdminSettingsResponse = InferResponseType<
  (typeof client)["admin"]["settings"]["$patch"]
>;

export async function updateAdminSettings(input: UpdateAdminSettingsRequest) {
  const response = await client.admin.settings.$patch({ json: input });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }

  return response.json();
}
