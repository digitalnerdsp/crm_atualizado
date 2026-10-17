import { client } from "@kaneo/libs";
import type { InferRequestType } from "hono/client";

const api = client.crm.hosting[":workspaceId"];
export type HostingFilters = InferRequestType<typeof api.report.$get>["query"];
export type HostingPayload = InferRequestType<
  (typeof api.companies)[":id"]["$put"]
>["json"];
export type DigestPayload = InferRequestType<typeof api.digest.$put>["json"];
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
export const getHostingMetadata = async (workspaceId: string) =>
  unwrap(await api.metadata.$get({ param: { workspaceId } }));
export const getHostingReport = async (
  workspaceId: string,
  query: HostingFilters,
) => unwrap(await api.report.$get({ param: { workspaceId }, query }));
export const getHostingDetail = async (workspaceId: string, id: string) =>
  unwrap(await api.companies[":id"].$get({ param: { workspaceId, id } }));
export const saveHosting = async (
  workspaceId: string,
  id: string,
  json: HostingPayload,
) =>
  unwrap(await api.companies[":id"].$put({ param: { workspaceId, id }, json }));
export const getDigestConfig = async (workspaceId: string) =>
  unwrap(await api.digest.$get({ param: { workspaceId } }));
export const saveDigestConfig = async (
  workspaceId: string,
  json: DigestPayload,
) => unwrap(await api.digest.$put({ param: { workspaceId }, json }));
export const getDigestPreview = async (workspaceId: string) =>
  unwrap(await api.digest.preview.$get({ param: { workspaceId } }));
export const retryDigestRun = async (workspaceId: string, id: string) =>
  unwrap(
    await api.digest.runs[":id"].retry.$post({ param: { workspaceId, id } }),
  );
export type HostingReport = Awaited<ReturnType<typeof getHostingReport>>;
export type HostingDetail = Awaited<ReturnType<typeof getHostingDetail>>;
export type HostingMetadata = Awaited<ReturnType<typeof getHostingMetadata>>;
export type DigestConfig = Awaited<ReturnType<typeof getDigestConfig>>;
export type DigestPreview = Awaited<ReturnType<typeof getDigestPreview>>;
