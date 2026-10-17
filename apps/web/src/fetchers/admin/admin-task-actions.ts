import { client } from "@kaneo/libs";
import type { InferRequestType } from "hono/client";

export type UpdateAdminTaskRequest = InferRequestType<
  (typeof client)["admin"]["tasks"][":taskId"]["$patch"]
>["json"] & { taskId: string };

export type BulkAdminTaskRequest = InferRequestType<
  (typeof client)["admin"]["tasks"]["bulk"]["$patch"]
>["json"];

async function assertOk(response: Response) {
  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }
}

export async function updateAdminTask(input: UpdateAdminTaskRequest) {
  const { taskId, ...json } = input;
  const response = await client.admin.tasks[":taskId"].$patch({
    param: { taskId },
    json,
  });
  await assertOk(response);
  return response.json();
}

export async function deleteAdminTask(taskId: string) {
  const response = await client.admin.tasks[":taskId"].$delete({
    param: { taskId },
  });
  await assertOk(response);
  return response.json();
}

export async function bulkAdminTasks(input: BulkAdminTaskRequest) {
  const response = await client.admin.tasks.bulk.$patch({ json: input });
  await assertOk(response);
  return response.json();
}
