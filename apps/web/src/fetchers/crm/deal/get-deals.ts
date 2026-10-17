import { client } from "@kaneo/libs";
import type { InferRequestType } from "hono/client";

export type GetDealsQuery = InferRequestType<
  (typeof client)["crm"]["deal"]["$get"]
>["query"];

async function getDeals(query: GetDealsQuery) {
  const response = await client.crm.deal.$get({ query });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
}

export default getDeals;
