import { siteWorkClient } from "@kaneo/libs";

const api = siteWorkClient["site-work"];
async function unwrap<T>(r: {
  ok: boolean;
  json: () => Promise<T>;
  text: () => Promise<string>;
}) {
  if (!r.ok) {
    let message = await r.text();
    try {
      message = JSON.parse(message).message ?? message;
    } catch {}
    throw Error(message);
  }
  return r.json();
}
export const getSiteSummary = async (projectId: string) =>
  unwrap(await api.project[":projectId"].$get({ param: { projectId } }));
export const getSiteOptions = async (taskId: string) =>
  unwrap(await api.task[":taskId"].$get({ param: { taskId } }));
export const saveTaskPlan = async (
  taskId: string,
  siteId: string,
  estimateMinutes: number,
  version: number,
) =>
  unwrap(
    await api.task[":taskId"].$put({
      param: { taskId },
      json: { taskId, siteId, estimateMinutes, version },
    }),
  );
