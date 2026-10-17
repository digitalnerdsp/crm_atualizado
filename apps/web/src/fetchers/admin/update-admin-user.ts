import { client } from "@kaneo/libs";
import type { InferRequestType, InferResponseType } from "hono/client";

export type UpdateAdminUserRequest = InferRequestType<
  (typeof client)["admin"]["users"][":userId"]["$patch"]
>["json"] & {
  userId: string;
};

export type UpdateAdminUserResponse = InferResponseType<
  (typeof client)["admin"]["users"][":userId"]["$patch"]
>;

export async function updateAdminUser(input: UpdateAdminUserRequest) {
  const { userId, ...json } = input;
  const response = await client.admin.users[":userId"].$patch({
    param: { userId },
    json,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }

  return response.json();
}
