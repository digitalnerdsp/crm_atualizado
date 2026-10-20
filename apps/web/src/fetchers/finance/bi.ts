import { client } from "@kaneo/libs";
import type { InferRequestType } from "hono/client";

const api = client.finance[":workspaceId"].bi;
export type BiFilters = InferRequestType<typeof api.report.$get>["query"];
export type BiMetric = InferRequestType<
  (typeof api.details)[":metric"]["$get"]
>["param"]["metric"];
async function unwrap<T>(res: {
  ok: boolean;
  json: () => Promise<T>;
  text: () => Promise<string>;
}) {
  if (!res.ok) {
    const raw = await res.text();
    let message = raw;
    try {
      message = JSON.parse(raw).message ?? raw;
    } catch {}
    throw new Error(message);
  }
  return res.json();
}
export const getBiReport = async (workspaceId: string, query: BiFilters) =>
  unwrap(await api.report.$get({ param: { workspaceId }, query }));
export const getBiDetail = async (
  workspaceId: string,
  query: BiFilters,
  metric: BiMetric,
  page: number,
  days = 90,
) =>
  unwrap(
    await api.details[":metric"].$get({
      param: { workspaceId, metric },
      query: { ...query, ...{ page: String(page), days: String(days) } },
    }),
  );
export type BiReport = Awaited<ReturnType<typeof getBiReport>>;
export async function downloadBi(
  workspaceId: string,
  query: BiFilters,
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
  a.download = `bi-financeiro-${query.from}-${query.to}.${format}`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
