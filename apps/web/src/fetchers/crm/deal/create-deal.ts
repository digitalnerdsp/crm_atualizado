import { client } from "@kaneo/libs";
import type { InferRequestType } from "hono/client";

export type CreateDealPayload = InferRequestType<
  (typeof client)["crm"]["deal"]["$post"]
>["json"];

async function createDeal(payload: CreateDealPayload) {
  const response = await client.crm.deal.$post({ json: payload });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
}

export default createDeal;
