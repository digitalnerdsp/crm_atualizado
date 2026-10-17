import { client } from "@kaneo/libs";
import type { InferRequestType } from "hono/client";

export type CreateAdminRoleRequest = InferRequestType<
  (typeof client)["admin"]["roles"]["$post"]
>["json"];

export type UpdateAdminRoleRequest = InferRequestType<
  (typeof client)["admin"]["roles"][":role"]["$patch"]
>["json"] & {
  role: string;
};

export type DuplicateAdminRoleRequest = InferRequestType<
  (typeof client)["admin"]["roles"][":role"]["duplicate"]["$post"]
>["json"] & {
  sourceRole: string;
};

export type DeleteAdminRoleRequest = InferRequestType<
  (typeof client)["admin"]["roles"][":role"]["$delete"]
>["json"] & {
  role: string;
};

async function assertOk(response: Response) {
  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }
}

export async function createAdminRole(input: CreateAdminRoleRequest) {
  const response = await client.admin.roles.$post({ json: input });
  await assertOk(response);
  return response.json();
}

export async function updateAdminRole(input: UpdateAdminRoleRequest) {
  const { role, ...json } = input;
  const response = await client.admin.roles[":role"].$patch({
    param: { role },
    json,
  });
  await assertOk(response);
  return response.json();
}

export async function duplicateAdminRole(input: DuplicateAdminRoleRequest) {
  const { sourceRole, ...json } = input;
  const response = await client.admin.roles[":role"].duplicate.$post({
    param: { role: sourceRole },
    json,
  });
  await assertOk(response);
  return response.json();
}

export async function deleteAdminRole(input: DeleteAdminRoleRequest) {
  const { role, ...json } = input;
  const response = await client.admin.roles[":role"].$delete({
    param: { role },
    json,
  });
  await assertOk(response);
  return response.json();
}
