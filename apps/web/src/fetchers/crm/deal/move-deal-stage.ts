import { client } from "@kaneo/libs";
import type { InferRequestType } from "hono/client";

export type MoveDealStagePayload = InferRequestType<
  (typeof client)["crm"]["deal"][":dealId"]["stage"]["$patch"]
>["json"];

async function moveDealStage(dealId: string, payload: MoveDealStagePayload) {
  const response = await client.crm.deal[":dealId"].stage.$patch({
    param: { dealId },
    json: payload,
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
}

export default moveDealStage;
