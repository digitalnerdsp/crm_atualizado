import { client } from "@kaneo/libs";
import type { InferRequestType, InferResponseType } from "hono/client";

export type GetSalesQuery = InferRequestType<
  (typeof client)["crm"]["sale"]["$get"]
>["query"];
export type SalesResponse = InferResponseType<
  (typeof client)["crm"]["sale"]["$get"],
  200
>;
export type Sale = SalesResponse["items"][number];
export type CreateSalePayload = InferRequestType<
  (typeof client)["crm"]["sale"]["$post"]
>["json"];

export async function getSales(query: GetSalesQuery) {
  const response = await client.crm.sale.$get({ query });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

export async function createSale(payload: CreateSalePayload) {
  const response = await client.crm.sale.$post({ json: payload });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}
