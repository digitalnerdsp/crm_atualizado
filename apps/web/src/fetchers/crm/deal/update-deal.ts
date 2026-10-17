import { client } from "@kaneo/libs";
import type { InferRequestType } from "hono/client";

export type UpdateDealPayload = InferRequestType<
  (typeof client)["crm"]["deal"][":dealId"]["$patch"]
>["json"];

async function updateDeal(dealId: string, payload: UpdateDealPayload) {
  const response = await client.crm.deal[":dealId"].$patch({
    param: { dealId },
    json: payload,
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
}

export default updateDeal;
