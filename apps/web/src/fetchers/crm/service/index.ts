import { client } from "@kaneo/libs";
import type { InferRequestType } from "hono/client";

export type CreateServicePayload = InferRequestType<
  (typeof client)["crm"]["service"]["$post"]
>["json"];

export type UpdateServicePayload = InferRequestType<
  (typeof client)["crm"]["service"][":serviceId"]["$patch"]
>["json"];

export type CreateServiceCategoryPayload = InferRequestType<
  (typeof client)["crm"]["service"]["category"]["$post"]
>["json"];

export type UpdateServiceCategoryPayload = InferRequestType<
  (typeof client)["crm"]["service"]["category"][":categoryId"]["$patch"]
>["json"];

export type SetDealServicesPayload = InferRequestType<
  (typeof client)["crm"]["deal"][":dealId"]["service"]["$put"]
>["json"];

async function unwrap<T>(response: {
  ok: boolean;
  text: () => Promise<string>;
  json: () => Promise<T>;
}) {
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

export async function getCrmServices(
  workspaceId: string,
  includeArchived = false,
) {
  return unwrap(
    await client.crm.service.$get({
      query: {
        workspaceId,
        ...(includeArchived ? { includeArchived: "true" } : {}),
      },
    }),
  );
}

export async function getCrmServiceCategories(workspaceId: string) {
  return unwrap(
    await client.crm.service.category.$get({ query: { workspaceId } }),
  );
}

export async function createCrmService(json: CreateServicePayload) {
  return unwrap(await client.crm.service.$post({ json }));
}

export async function updateCrmService(
  serviceId: string,
  json: UpdateServicePayload,
) {
  return unwrap(
    await client.crm.service[":serviceId"].$patch({
      param: { serviceId },
      json,
    }),
  );
}

export async function createCrmServiceCategory(
  json: CreateServiceCategoryPayload,
) {
  return unwrap(await client.crm.service.category.$post({ json }));
}

export async function updateCrmServiceCategory(
  categoryId: string,
  json: UpdateServiceCategoryPayload,
) {
  return unwrap(
    await client.crm.service.category[":categoryId"].$patch({
      param: { categoryId },
      json,
    }),
  );
}

export async function setCrmDealServices(
  dealId: string,
  json: SetDealServicesPayload,
) {
  return unwrap(
    await client.crm.deal[":dealId"].service.$put({
      param: { dealId },
      json,
    }),
  );
}
