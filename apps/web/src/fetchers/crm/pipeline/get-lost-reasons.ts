import { client } from "@kaneo/libs";
import type { InferRequestType } from "hono/client";

export type CreateLostReasonPayload = InferRequestType<
  (typeof client)["crm"]["pipeline"]["lost-reason"]["$post"]
>["json"];

export type UpdateLostReasonPayload = InferRequestType<
  (typeof client)["crm"]["pipeline"]["lost-reason"][":lostReasonId"]["$patch"]
>["json"];

async function unwrap<T>(response: {
  ok: boolean;
  text: () => Promise<string>;
  json: () => Promise<T>;
}) {
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

async function getCrmLostReasons(workspaceId: string, includeInactive = false) {
  return unwrap(
    await client.crm.pipeline["lost-reason"].$get({
      query: {
        workspaceId,
        ...(includeInactive ? { includeInactive: "true" } : {}),
      },
    }),
  );
}

export async function createCrmLostReason(json: CreateLostReasonPayload) {
  return unwrap(await client.crm.pipeline["lost-reason"].$post({ json }));
}

export async function updateCrmLostReason(
  lostReasonId: string,
  json: UpdateLostReasonPayload,
) {
  return unwrap(
    await client.crm.pipeline["lost-reason"][":lostReasonId"].$patch({
      param: { lostReasonId },
      json,
    }),
  );
}

export default getCrmLostReasons;
