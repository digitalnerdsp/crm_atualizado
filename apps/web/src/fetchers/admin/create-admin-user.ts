import { client } from "@kaneo/libs";
import type { InferRequestType, InferResponseType } from "hono/client";

export type CreateAdminUserRequest = InferRequestType<
  (typeof client)["admin"]["users"]["$post"]
>["json"];

export type AdminUserResponse = InferResponseType<
  (typeof client)["admin"]["users"]["$post"]
>;

export async function createAdminUser(input: CreateAdminUserRequest) {
  const response = await client.admin.users.$post({ json: input });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }

  return response.json();
}
