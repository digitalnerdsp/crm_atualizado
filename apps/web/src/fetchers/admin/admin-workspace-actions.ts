import { client } from "@kaneo/libs";
import type { InferRequestType } from "hono/client";

export type CreateAdminWorkspaceRequest = InferRequestType<
  (typeof client)["admin"]["workspaces"]["$post"]
>["json"];

export type UpdateAdminWorkspaceRequest = InferRequestType<
  (typeof client)["admin"]["workspaces"][":workspaceId"]["$patch"]
>["json"] & { workspaceId: string };

export type DeleteAdminWorkspaceRequest = InferRequestType<
  (typeof client)["admin"]["workspaces"][":workspaceId"]["$delete"]
>["json"] & { workspaceId: string };

export type AdminWorkspaceMemberRequest = InferRequestType<
  (typeof client)["admin"]["workspaces"][":workspaceId"]["members"]["$post"]
>["json"] & { workspaceId: string };

export type UpdateAdminWorkspaceMemberRequest = InferRequestType<
  (typeof client)["admin"]["workspaces"][":workspaceId"]["members"][":userId"]["$patch"]
>["json"] & { workspaceId: string };

async function assertOk(response: Response) {
  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }
}

export async function createAdminWorkspace(input: CreateAdminWorkspaceRequest) {
  const response = await client.admin.workspaces.$post({ json: input });
  await assertOk(response);
  return response.json();
}

export async function updateAdminWorkspace(input: UpdateAdminWorkspaceRequest) {
  const { workspaceId, ...json } = input;
  const response = await client.admin.workspaces[":workspaceId"].$patch({
    param: { workspaceId },
    json,
  });
  await assertOk(response);
  return response.json();
}

export async function archiveAdminWorkspace(workspaceId: string) {
  const response = await client.admin.workspaces[":workspaceId"].archive.$post({
    param: { workspaceId },
  });
  await assertOk(response);
  return response.json();
}

export async function restoreAdminWorkspace(workspaceId: string) {
  const response = await client.admin.workspaces[":workspaceId"].restore.$post({
    param: { workspaceId },
  });
  await assertOk(response);
  return response.json();
}

export async function deleteAdminWorkspace(input: DeleteAdminWorkspaceRequest) {
  const { workspaceId, ...json } = input;
  const response = await client.admin.workspaces[":workspaceId"].$delete({
    param: { workspaceId },
    json,
  });
  await assertOk(response);
  return response.json();
}

export async function addAdminWorkspaceMember(
  input: AdminWorkspaceMemberRequest,
) {
  const { workspaceId, ...json } = input;
  const response = await client.admin.workspaces[":workspaceId"].members.$post({
    param: { workspaceId },
    json,
  });
  await assertOk(response);
  return response.json();
}

export async function updateAdminWorkspaceMember(
  input: UpdateAdminWorkspaceMemberRequest,
) {
  const { workspaceId, userId, role } = input;
  const response = await client.admin.workspaces[":workspaceId"].members[
    ":userId"
  ].$patch({
    param: { workspaceId, userId },
    json: { userId, role },
  });
  await assertOk(response);
  return response.json();
}

export async function removeAdminWorkspaceMember(input: {
  workspaceId: string;
  userId: string;
}) {
  const response = await client.admin.workspaces[":workspaceId"].members[
    ":userId"
  ].$delete({
    param: input,
  });
  await assertOk(response);
  return response.json();
}
