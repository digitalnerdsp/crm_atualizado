import { client } from "@kaneo/libs";
import type { InferRequestType } from "hono/client";

export type ResetAdminUserPasswordRequest = InferRequestType<
  (typeof client)["admin"]["users"][":userId"]["reset-password"]["$post"]
>["json"] & {
  userId: string;
};

export async function resetAdminUserPassword(
  input: ResetAdminUserPasswordRequest,
) {
  const { userId, ...json } = input;
  const response = await client.admin.users[":userId"]["reset-password"].$post({
    param: { userId },
    json,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }

  return response.json();
}
