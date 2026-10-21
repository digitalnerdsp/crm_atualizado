import { portfolioClient } from "@kaneo/libs";
import type { InferRequestType } from "hono/client";

const api = portfolioClient.finance[":workspaceId"].portfolio;
async function unwrap<T>(r: {
  ok: boolean;
  json: () => Promise<T>;
  text: () => Promise<string>;
}) {
  if (!r.ok) {
    const text = await r.text();
    let message = text;
    try {
      message = JSON.parse(text).message ?? text;
    } catch {}
    throw Error(
      typeof message === "string" ? message : JSON.stringify(message),
    );
  }
  return r.json();
}
export type PortfolioFilters = InferRequestType<
  typeof api.report.$get
>["query"];
export type CaseInput = InferRequestType<typeof api.cases.$post>["json"];
export type SiteInput = InferRequestType<typeof api.sites.$post>["json"];
export type WorkerInput = InferRequestType<
  (typeof api.sites)[":id"]["workers"]["$put"]
>["json"];
export type RateInput = InferRequestType<typeof api.rates.$post>["json"];
export type DraftInput = InferRequestType<typeof api.drafts.$post>["json"];
export type NoticeInput = InferRequestType<typeof api.preview.$post>["json"];
export const getPortfolio = async (
  workspaceId: string,
  query: PortfolioFilters,
  page = 1,
) =>
  unwrap(
    await api.report.$get({
      param: { workspaceId },
      query: { ...query, ...{ page: String(page) } },
    }),
  );
export const getPortfolioMeta = async (workspaceId: string) =>
  unwrap(await api.metadata.$get({ param: { workspaceId } }));
export const getCase = async (workspaceId: string, id: string) =>
  unwrap(await api.cases[":id"].$get({ param: { workspaceId, id } }));
export const saveCase = async (workspaceId: string, json: CaseInput) =>
  unwrap(await api.cases.$post({ param: { workspaceId }, json }));
export const saveSite = async (
  workspaceId: string,
  json: SiteInput,
  id?: string,
) =>
  unwrap(
    id
      ? await api.sites[":id"].$put({ param: { workspaceId, id }, json })
      : await api.sites.$post({ param: { workspaceId }, json }),
  );
export const saveWorker = async (
  workspaceId: string,
  id: string,
  json: WorkerInput,
) =>
  unwrap(
    await api.sites[":id"].workers.$put({ param: { workspaceId, id }, json }),
  );
export const attachEntry = async (
  workspaceId: string,
  id: string,
  entryId: string,
) =>
  unwrap(
    await api.sites[":id"].entries.$post({
      param: { workspaceId, id },
      json: { entryId },
    }),
  );
export const saveRate = async (workspaceId: string, json: RateInput) =>
  unwrap(await api.rates.$post({ param: { workspaceId }, json }));
export const saveDraft = async (
  workspaceId: string,
  json: DraftInput,
  id?: string,
) =>
  unwrap(
    id
      ? await api.drafts[":id"].$put({ param: { workspaceId, id }, json })
      : await api.drafts.$post({ param: { workspaceId }, json }),
  );
export const decideDraft = async (
  workspaceId: string,
  id: string,
  json: InferRequestType<
    (typeof api.drafts)[":id"]["decision"]["$post"]
  >["json"],
) =>
  unwrap(
    await api.drafts[":id"].decision.$post({
      param: { workspaceId, id },
      json,
    }),
  );
export const previewNotice = async (workspaceId: string, json: NoticeInput) =>
  unwrap(await api.preview.$post({ param: { workspaceId }, json }));
export const sendNotice = async (
  workspaceId: string,
  json: InferRequestType<typeof api.notices.$post>["json"],
) => unwrap(await api.notices.$post({ param: { workspaceId }, json }));
export const confirmNotice = async (workspaceId: string, id: string) =>
  unwrap(
    await api.notices[":id"].confirm.$post({
      param: { workspaceId, id },
      json: { confirmed: true },
    }),
  );
export async function downloadPortfolio(
  workspaceId: string,
  query: PortfolioFilters,
  format: "xlsx" | "pdf",
) {
  const r = await api.export[":format"].$get({
    param: { workspaceId, format },
    query,
  });
  if (!r.ok) throw Error(await r.text());
  const url = URL.createObjectURL(await r.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = `gestao-carteira.${format}`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export type Portfolio = Awaited<ReturnType<typeof getPortfolio>>;
export type PortfolioMeta = Awaited<ReturnType<typeof getPortfolioMeta>>;
export type QueueRow =
  | Portfolio["queue"][number]
  | Portfolio["caseHistory"][number];
export type Site = Portfolio["sites"][number];
