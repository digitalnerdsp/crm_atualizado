import { client } from "@kaneo/libs";
import type { InferRequestType } from "hono/client";

export type GetCompaniesQuery = InferRequestType<
  (typeof client)["crm"]["company"]["$get"]
>["query"];

export type CreateCompanyPayload = InferRequestType<
  (typeof client)["crm"]["company"]["$post"]
>["json"];

export type UpdateCompanyPayload = InferRequestType<
  (typeof client)["crm"]["company"][":companyId"]["$patch"]
>["json"];

async function unwrap<T>(response: {
  ok: boolean;
  text: () => Promise<string>;
  json: () => Promise<T>;
}) {
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

export async function getCompanies(query: GetCompaniesQuery) {
  return unwrap(await client.crm.company.$get({ query }));
}

export async function getCompany({
  companyId,
  workspaceId,
}: {
  companyId: string;
  workspaceId: string;
}) {
  return unwrap(
    await client.crm.company[":companyId"].$get({
      param: { companyId },
      query: { workspaceId },
    }),
  );
}

export async function createCompany(json: CreateCompanyPayload) {
  return unwrap(await client.crm.company.$post({ json }));
}

export async function updateCompany(
  companyId: string,
  json: UpdateCompanyPayload,
) {
  return unwrap(
    await client.crm.company[":companyId"].$patch({
      param: { companyId },
      json,
    }),
  );
}
