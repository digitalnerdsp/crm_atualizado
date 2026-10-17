import { client } from "@kaneo/libs";
import type { InferRequestType } from "hono/client";

export type CreateSourcePayload = InferRequestType<
  (typeof client)["crm"]["taxonomy"]["source"]["$post"]
>["json"];

export type UpdateSourcePayload = InferRequestType<
  (typeof client)["crm"]["taxonomy"]["source"][":sourceId"]["$patch"]
>["json"];

export type CreateSegmentPayload = InferRequestType<
  (typeof client)["crm"]["taxonomy"]["segment"]["$post"]
>["json"];

export type UpdateSegmentPayload = InferRequestType<
  (typeof client)["crm"]["taxonomy"]["segment"][":segmentId"]["$patch"]
>["json"];

async function unwrap<T>(response: {
  ok: boolean;
  text: () => Promise<string>;
  json: () => Promise<T>;
}) {
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

export async function getCrmSources(
  workspaceId: string,
  includeInactive = false,
) {
  return unwrap(
    await client.crm.taxonomy.source.$get({
      query: {
        workspaceId,
        ...(includeInactive ? { includeInactive: "true" } : {}),
      },
    }),
  );
}

export async function getCrmSegments(
  workspaceId: string,
  includeInactive = false,
) {
  return unwrap(
    await client.crm.taxonomy.segment.$get({
      query: {
        workspaceId,
        ...(includeInactive ? { includeInactive: "true" } : {}),
      },
    }),
  );
}

export async function createCrmSource(json: CreateSourcePayload) {
  return unwrap(await client.crm.taxonomy.source.$post({ json }));
}

export async function updateCrmSource(
  sourceId: string,
  json: UpdateSourcePayload,
) {
  return unwrap(
    await client.crm.taxonomy.source[":sourceId"].$patch({
      param: { sourceId },
      json,
    }),
  );
}

export async function createCrmSegment(json: CreateSegmentPayload) {
  return unwrap(await client.crm.taxonomy.segment.$post({ json }));
}

export async function updateCrmSegment(
  segmentId: string,
  json: UpdateSegmentPayload,
) {
  return unwrap(
    await client.crm.taxonomy.segment[":segmentId"].$patch({
      param: { segmentId },
      json,
    }),
  );
}

export type CompanyCitiesQuery = InferRequestType<
  (typeof client)["crm"]["company"]["cities"]["$get"]
>["query"];

export async function getCrmCompanyCities({
  workspaceId,
  state,
}: CompanyCitiesQuery) {
  return unwrap(
    await client.crm.company.cities.$get({
      query: { workspaceId, ...(state ? { state } : {}) },
    }),
  );
}
