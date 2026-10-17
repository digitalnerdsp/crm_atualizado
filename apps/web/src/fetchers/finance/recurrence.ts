import { client } from "@kaneo/libs";
import type { InferRequestType } from "hono/client";

const api = client.finance[":workspaceId"].recurrence;
export type RecurrenceFilters = InferRequestType<
  typeof api.report.$get
>["query"];
export type BillingPayload = InferRequestType<
  (typeof api)["contracts"][":id"]["config"]["$put"]
>["json"];
async function unwrap<T>(response: {
  ok: boolean;
  json: () => Promise<T>;
  text: () => Promise<string>;
}) {
  if (!response.ok) {
    const text = await response.text();
    let msg = text;
    try {
      msg = JSON.parse(text).message ?? text;
    } catch {}
    throw new Error(msg);
  }
  return response.json();
}
export const getRecurrenceReport = async (
  workspaceId: string,
  query: RecurrenceFilters,
) => unwrap(await api.report.$get({ param: { workspaceId }, query }));
export const getBillingDetail = async (workspaceId: string, id: string) =>
  unwrap(await api.contracts[":id"].$get({ param: { workspaceId, id } }));
export const configureBilling = async (
  workspaceId: string,
  id: string,
  json: BillingPayload,
) =>
  unwrap(
    await api.contracts[":id"].config.$put({
      param: { workspaceId, id },
      json,
    }),
  );
export const generateBilling = async (workspaceId: string, id: string) =>
  unwrap(
    await api.contracts[":id"].generate.$post({ param: { workspaceId, id } }),
  );
export const renewBillingContract = async (
  workspaceId: string,
  id: string,
  endsOn: string,
  note: string,
) =>
  unwrap(
    await api.contracts[":id"].renew.$post({
      param: { workspaceId, id },
      json: { endsOn, note },
    }),
  );
export async function downloadRecurrence(
  workspaceId: string,
  query: RecurrenceFilters,
  format: "xlsx" | "pdf",
) {
  const response = await api.export[":format"].$get({
    param: { workspaceId, format },
    query,
  });
  if (!response.ok) throw new Error(await response.text());
  const url = URL.createObjectURL(await response.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = `contratos-recorrencia-${query.from}-${query.to}.${format}`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export type RecurrenceReport = Awaited<ReturnType<typeof getRecurrenceReport>>;
export type BillingDetail = Awaited<ReturnType<typeof getBillingDetail>>;
