import { client } from "@kaneo/libs";
import type { InferRequestType } from "hono/client";

const api = client.finance[":workspaceId"].performance;
export type PerformanceFilters = InferRequestType<
  typeof api.report.$get
>["query"];
export type RulePayload = InferRequestType<typeof api.rules.$post>["json"];
export type ClassPayload = InferRequestType<
  (typeof api.entries)[":id"]["classification"]["$put"]
>["json"];
async function unwrap<T>(res: {
  ok: boolean;
  json: () => Promise<T>;
  text: () => Promise<string>;
}) {
  if (!res.ok) {
    const text = await res.text();
    let message = text;
    try {
      message = JSON.parse(text).message ?? text;
    } catch {}
    throw new Error(message);
  }
  return res.json();
}
export const getPerformance = async (
  workspaceId: string,
  query: PerformanceFilters,
) => unwrap(await api.report.$get({ param: { workspaceId }, query }));
export const getPerformanceConfig = async (workspaceId: string) =>
  unwrap(await api.configuration.$get({ param: { workspaceId } }));
export const saveCommissionRule = async (
  workspaceId: string,
  json: RulePayload,
) => unwrap(await api.rules.$post({ param: { workspaceId }, json }));
export const savePresumption = async (
  workspaceId: string,
  json: { presumptionBps: number | null; version: number },
) => unwrap(await api.settings.$put({ param: { workspaceId }, json }));
export const classifyExpense = async (
  workspaceId: string,
  id: string,
  json: ClassPayload,
) =>
  unwrap(
    await api.entries[":id"].classification.$put({
      param: { workspaceId, id },
      json,
    }),
  );
export const applyCommissionRule = async (
  workspaceId: string,
  id: string,
  version: number,
) =>
  unwrap(
    await api.entries[":id"]["apply-rule"].$post({
      param: { workspaceId, id },
      json: { version },
    }),
  );
export const issueCommission = async (
  workspaceId: string,
  id: string,
  json: { requestId: string; dueDate: string; version: number },
) =>
  unwrap(
    await api.entries[":id"].issue.$post({ param: { workspaceId, id }, json }),
  );
export async function downloadPerformance(
  workspaceId: string,
  query: PerformanceFilters,
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
  a.download = `comissoes-resultados-${query.from}-${query.to}.${format}`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export type PerformanceReport = Awaited<ReturnType<typeof getPerformance>>;
export type PerformanceConfig = Awaited<
  ReturnType<typeof getPerformanceConfig>
>;

export const getPerformanceEntry = async (workspaceId: string, id: string) =>
  unwrap(
    await client.finance[":workspaceId"].entries[":id"].$get({
      param: { workspaceId, id },
    }),
  );
