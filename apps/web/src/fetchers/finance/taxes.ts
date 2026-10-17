import { client } from "@kaneo/libs";
import type { InferRequestType } from "hono/client";

const api = client.finance[":workspaceId"].taxes;
export type TaxFilters = InferRequestType<typeof api.report.$get>["query"];
export type ProfilePayload = InferRequestType<
  typeof api.profiles.$post
>["json"];
export type CalculationPayload = InferRequestType<
  typeof api.calculate.$post
>["json"];
export type SimulationPayload = InferRequestType<
  typeof api.simulations.$post
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
export const getTaxConfig = async (workspaceId: string) =>
  unwrap(await api.configuration.$get({ param: { workspaceId } }));
export const getTaxReport = async (workspaceId: string, query: TaxFilters) =>
  unwrap(await api.report.$get({ param: { workspaceId }, query }));
export const getTaxProfileHistory = async (workspaceId: string, id: string) =>
  unwrap(await api.profiles[":id"].$get({ param: { workspaceId, id } }));
export const saveTaxProfile = async (
  workspaceId: string,
  json: ProfilePayload,
  id?: string,
) =>
  unwrap(
    id
      ? await api.profiles[":id"].$put({ param: { workspaceId, id }, json })
      : await api.profiles.$post({ param: { workspaceId }, json }),
  );
export const calculateSale = async (
  workspaceId: string,
  json: CalculationPayload,
) => unwrap(await api.calculate.$post({ param: { workspaceId }, json }));
export const saveTaxSimulation = async (
  workspaceId: string,
  json: SimulationPayload,
) => unwrap(await api.simulations.$post({ param: { workspaceId }, json }));
export async function downloadTaxes(
  workspaceId: string,
  query: TaxFilters,
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
  a.download = `taxas-impostos-${query.from}-${query.to}.${format}`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export type TaxConfig = Awaited<ReturnType<typeof getTaxConfig>>;
export type TaxReport = Awaited<ReturnType<typeof getTaxReport>>;
export type TaxCalculation = Awaited<ReturnType<typeof calculateSale>>;
