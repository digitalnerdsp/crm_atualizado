import { client } from "@kaneo/libs";
import type { InferRequestType } from "hono/client";

export type ContractListQuery = InferRequestType<
  (typeof client)["crm"]["contract"]["$get"]
>["query"];

export type CreateContractPayload = InferRequestType<
  (typeof client)["crm"]["contract"]["$post"]
>["json"];

export type UpdateContractPayload = InferRequestType<
  (typeof client)["crm"]["contract"][":contractId"]["$patch"]
>["json"];

export type ChangeContractValuePayload = InferRequestType<
  (typeof client)["crm"]["contract"][":contractId"]["value"]["$post"]
>["json"];

export type CancelContractPayload = InferRequestType<
  (typeof client)["crm"]["contract"][":contractId"]["cancel"]["$post"]
>["json"];

export type ContractTransitionPayload = InferRequestType<
  (typeof client)["crm"]["contract"][":contractId"]["pause"]["$post"]
>["json"];

export type ContractFromDealPayload = InferRequestType<
  (typeof client)["crm"]["deal"][":dealId"]["contract"]["$post"]
>["json"];

export type ContractAction = "pause" | "resume" | "finish";

async function unwrap<T>(response: {
  ok: boolean;
  text: () => Promise<string>;
  json: () => Promise<T>;
}) {
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

export async function getCrmContracts(query: ContractListQuery) {
  return unwrap(await client.crm.contract.$get({ query }));
}

export async function getCrmContract({
  contractId,
  workspaceId,
}: {
  contractId: string;
  workspaceId: string;
}) {
  return unwrap(
    await client.crm.contract[":contractId"].$get({
      param: { contractId },
      query: { workspaceId },
    }),
  );
}

export async function createCrmContract(json: CreateContractPayload) {
  return unwrap(await client.crm.contract.$post({ json }));
}

export async function createCrmContractFromDeal(
  dealId: string,
  json: ContractFromDealPayload,
) {
  return unwrap(
    await client.crm.deal[":dealId"].contract.$post({
      param: { dealId },
      json,
    }),
  );
}

export async function updateCrmContract(
  contractId: string,
  json: UpdateContractPayload,
) {
  return unwrap(
    await client.crm.contract[":contractId"].$patch({
      param: { contractId },
      json,
    }),
  );
}

export async function changeCrmContractValue(
  contractId: string,
  json: ChangeContractValuePayload,
) {
  return unwrap(
    await client.crm.contract[":contractId"].value.$post({
      param: { contractId },
      json,
    }),
  );
}

export async function cancelCrmContract(
  contractId: string,
  json: CancelContractPayload,
) {
  return unwrap(
    await client.crm.contract[":contractId"].cancel.$post({
      param: { contractId },
      json,
    }),
  );
}

export async function transitionCrmContract(
  contractId: string,
  action: ContractAction,
  json: ContractTransitionPayload,
) {
  const route = client.crm.contract[":contractId"][action];
  return unwrap(await route.$post({ param: { contractId }, json }));
}
