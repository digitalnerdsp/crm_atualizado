import { client } from "@kaneo/libs";
import type { InferRequestType } from "hono/client";

const api = client.theme[":workspaceId"];
export type ThemePackageInput = InferRequestType<typeof api.$post>["json"];
async function unwrap<T>(res: {
  ok: boolean;
  json: () => Promise<T>;
  text: () => Promise<string>;
}) {
  if (!res.ok) {
    const text = await res.text();
    let message = text;
    try {
      const body = JSON.parse(text);
      // Erros de validação: mostra o campo e o motivo (ex.: light.primary).
      const issue = body.error?.[0];
      const field = Array.isArray(issue?.path)
        ? issue.path.map((p: { key: string }) => p.key).join(".")
        : "";
      message = issue?.message
        ? `${field ? `${field}: ` : ""}${issue.message}`
        : (body.message ?? text);
    } catch {}
    throw new Error(message);
  }
  return res.json();
}
export const getActiveTheme = async (workspaceId: string) =>
  unwrap(await api.active.$get({ param: { workspaceId } }));
export const listThemes = async (workspaceId: string) =>
  unwrap(await api.$get({ param: { workspaceId } }));
export const createTheme = async (
  workspaceId: string,
  json: ThemePackageInput,
) => unwrap(await api.$post({ param: { workspaceId }, json }));
export const activateTheme = async (workspaceId: string, id: string) =>
  unwrap(await api[":id"].activate.$put({ param: { workspaceId, id } }));
export const resetTheme = async (workspaceId: string) =>
  unwrap(await api.default.$put({ param: { workspaceId } }));
export const deleteTheme = async (workspaceId: string, id: string) =>
  unwrap(await api[":id"].$delete({ param: { workspaceId, id } }));
