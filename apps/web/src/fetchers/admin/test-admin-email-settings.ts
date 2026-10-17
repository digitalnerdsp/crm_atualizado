import { client } from "@kaneo/libs";
import type { InferRequestType, InferResponseType } from "hono/client";

export type TestAdminEmailSettingsRequest = InferRequestType<
  (typeof client)["admin"]["settings"]["email"]["test"]["$post"]
>["json"];

export type TestAdminEmailSettingsResponse = InferResponseType<
  (typeof client)["admin"]["settings"]["email"]["test"]["$post"]
>;

export async function testAdminEmailSettings(
  input: TestAdminEmailSettingsRequest,
) {
  const response = await client.admin.settings.email.test.$post({
    json: input,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }

  return response.json();
}
