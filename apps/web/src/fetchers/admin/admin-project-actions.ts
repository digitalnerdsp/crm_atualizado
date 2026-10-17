import { client } from "@kaneo/libs";
import type { InferRequestType } from "hono/client";

export type CreateAdminProjectRequest = InferRequestType<
  (typeof client)["admin"]["projects"]["$post"]
>["json"];

export type UpdateAdminProjectRequest = InferRequestType<
  (typeof client)["admin"]["projects"][":projectId"]["$patch"]
>["json"] & { projectId: string };

export type DeleteAdminProjectRequest = InferRequestType<
  (typeof client)["admin"]["projects"][":projectId"]["$delete"]
>["json"] & { projectId: string };

async function assertOk(response: Response) {
  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }
}

export async function createAdminProject(input: CreateAdminProjectRequest) {
  const response = await client.admin.projects.$post({ json: input });
  await assertOk(response);
  return response.json();
}

export async function updateAdminProject(input: UpdateAdminProjectRequest) {
  const { projectId, ...json } = input;
  const response = await client.admin.projects[":projectId"].$patch({
    param: { projectId },
    json,
  });
  await assertOk(response);
  return response.json();
}

export async function archiveAdminProject(projectId: string) {
  const response = await client.admin.projects[":projectId"].archive.$post({
    param: { projectId },
  });
  await assertOk(response);
  return response.json();
}

export async function restoreAdminProject(projectId: string) {
  const response = await client.admin.projects[":projectId"].restore.$post({
    param: { projectId },
  });
  await assertOk(response);
  return response.json();
}

export async function duplicateAdminProject(projectId: string) {
  const response = await client.admin.projects[":projectId"].duplicate.$post({
    param: { projectId },
  });
  await assertOk(response);
  return response.json();
}

export async function deleteAdminProject(input: DeleteAdminProjectRequest) {
  const { projectId, ...json } = input;
  const response = await client.admin.projects[":projectId"].$delete({
    param: { projectId },
    json,
  });
  await assertOk(response);
  return response.json();
}
