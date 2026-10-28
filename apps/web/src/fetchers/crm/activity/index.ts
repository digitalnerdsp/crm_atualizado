import { client } from "@kaneo/libs";
import type { InferRequestType } from "hono/client";

export type GetActivitiesQuery = InferRequestType<
  (typeof client)["crm"]["activity"]["$get"]
>["query"];

export type CreateActivityPayload = InferRequestType<
  (typeof client)["crm"]["activity"]["$post"]
>["json"];

async function unwrap<T>(response: {
  ok: boolean;
  text: () => Promise<string>;
  json: () => Promise<T>;
}) {
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

export async function getActivities(query: GetActivitiesQuery) {
  return unwrap(await client.crm.activity.$get({ query }));
}

export async function createActivity(json: CreateActivityPayload) {
  return unwrap(await client.crm.activity.$post({ json }));
}

export type UpdateActivityPayload = {
  activityId: string;
  workspaceId: string;
  body?: string | null;
  dueAt?: string | null;
};

export async function updateActivity({
  activityId,
  workspaceId,
  ...fields
}: UpdateActivityPayload) {
  return unwrap(
    await client.crm.activity[":activityId"].$patch({
      param: { activityId },
      json: { workspaceId, ...fields },
    }),
  );
}

export async function completeActivity({
  activityId,
  workspaceId,
  outcome,
  durationMinutes,
}: {
  activityId: string;
  workspaceId: string;
  outcome?: string;
  durationMinutes?: number;
}) {
  return unwrap(
    await client.crm.activity[":activityId"].complete.$post({
      param: { activityId },
      json: {
        workspaceId,
        ...(outcome ? { outcome } : {}),
        ...(durationMinutes ? { durationMinutes } : {}),
      },
    }),
  );
}

export async function deleteActivity({
  activityId,
  workspaceId,
}: {
  activityId: string;
  workspaceId: string;
}) {
  return unwrap(
    await client.crm.activity[":activityId"].$delete({
      param: { activityId },
      query: { workspaceId },
    }),
  );
}
