import { client } from "@kaneo/libs";
import type { InferRequestType } from "hono/client";

const api = client.finance[":workspaceId"];
export type FinanceFilters = InferRequestType<
  typeof api.dashboard.$get
>["query"];
export type EntryPayload = InferRequestType<typeof api.entries.$post>["json"];
export type UpdatePayload = InferRequestType<
  (typeof api.entries)[":id"]["$patch"]
>["json"];
export type SettlementPayload = InferRequestType<
  (typeof api.entries)[":id"]["settlements"]["$post"]
>["json"];
export type CategoryPayload = InferRequestType<
  typeof api.categories.$post
>["json"];
export type PartyPayload = InferRequestType<typeof api.parties.$post>["json"];
async function unwrap<T>(res: {
  ok: boolean;
  json: () => Promise<T>;
  text: () => Promise<string>;
}) {
  if (!res.ok) {
    const text = await res.text();
    let message = text;
    try {
      const error = JSON.parse(text);
      message =
        error.message ?? error.error ?? "Verifique os dados informados.";
    } catch {}
    throw new Error(
      typeof message === "string" ? message : JSON.stringify(message),
    );
  }
  return res.json();
}
export const getMetadata = async (workspaceId: string) =>
  unwrap(await api.metadata.$get({ param: { workspaceId } }));
export const getDashboard = async (
  workspaceId: string,
  query: FinanceFilters,
) => unwrap(await api.dashboard.$get({ param: { workspaceId }, query }));
export const getEntries = async (
  workspaceId: string,
  query: FinanceFilters,
  page: number,
) => {
  // `page` is parsed separately by the route; include it in the URL query.
  return unwrap(
    await api.entries.$get({
      param: { workspaceId },
      query: { ...query, ...{ page: String(page) } },
    }),
  );
};
export const createEntry = async (workspaceId: string, json: EntryPayload) =>
  unwrap(await api.entries.$post({ param: { workspaceId }, json }));
export const updateEntry = async (
  workspaceId: string,
  id: string,
  json: UpdatePayload,
) =>
  unwrap(await api.entries[":id"].$patch({ param: { workspaceId, id }, json }));
export const settleEntry = async (
  workspaceId: string,
  id: string,
  json: SettlementPayload,
) =>
  unwrap(
    await api.entries[":id"].settlements.$post({
      param: { workspaceId, id },
      json,
    }),
  );
export const cancelEntry = async (
  workspaceId: string,
  id: string,
  reason: string,
) =>
  unwrap(
    await api.entries[":id"].cancel.$post({
      param: { workspaceId, id },
      json: { reason },
    }),
  );
export const reverseSettlement = async (
  workspaceId: string,
  id: string,
  settlementId: string,
  reason: string,
) =>
  unwrap(
    await api.entries[":id"].settlements[":settlementId"].reverse.$post({
      param: { workspaceId, id, settlementId },
      json: { reason },
    }),
  );
export const getHistory = async (workspaceId: string, id: string) =>
  unwrap(await api.entries[":id"].history.$get({ param: { workspaceId, id } }));
export const saveCategory = async (
  workspaceId: string,
  json: CategoryPayload,
  id?: string,
) =>
  unwrap(
    id
      ? await api.categories[":id"].$patch({ param: { workspaceId, id }, json })
      : await api.categories.$post({ param: { workspaceId }, json }),
  );
export const saveParty = async (
  workspaceId: string,
  json: PartyPayload,
  id?: string,
) =>
  unwrap(
    id
      ? await api.parties[":id"].$patch({ param: { workspaceId, id }, json })
      : await api.parties.$post({ param: { workspaceId }, json }),
  );
export async function downloadReport(
  workspaceId: string,
  query: FinanceFilters,
  format: "xlsx" | "pdf",
) {
  const res = await api.export[":format"].$get({
    param: { workspaceId, format },
    query,
  });
  if (!res.ok) throw new Error(await res.text());
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = `financeiro-${query.from}-${query.to}.${format}`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export type FinanceMetadata = Awaited<ReturnType<typeof getMetadata>>;
export type FinanceEntry = Awaited<
  ReturnType<typeof getEntries>
>["items"][number];
export type FinanceDashboard = Awaited<ReturnType<typeof getDashboard>>;
