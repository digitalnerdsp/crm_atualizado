import { client } from "@kaneo/libs";
import type { InferRequestType } from "hono/client";

export type CreateDeliveryTasksPayload = InferRequestType<
  (typeof client)["crm"]["deal"][":dealId"]["delivery-tasks"]["$post"]
>["json"];

async function createDeliveryTasks(
  dealId: string,
  json: CreateDeliveryTasksPayload,
) {
  const response = await client.crm.deal[":dealId"]["delivery-tasks"].$post({
    param: { dealId },
    json,
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
}

export default createDeliveryTasks;
