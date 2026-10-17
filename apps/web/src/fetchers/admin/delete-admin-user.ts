import { client } from "@kaneo/libs";
import type { InferRequestType } from "hono/client";

export type DeleteAdminUserRequest = InferRequestType<
  (typeof client)["admin"]["users"][":userId"]["$delete"]
>["json"] & {
  userId: string;
};

export async function deleteAdminUser(input: DeleteAdminUserRequest) {
  const { userId, ...json } = input;
  const response = await client.admin.users[":userId"].$delete({
    param: { userId },
    json,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }

  return response.json();
}
