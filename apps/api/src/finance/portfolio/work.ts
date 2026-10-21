import { Hono } from "hono";
import { describeRoute, validator } from "hono-openapi";
import * as v from "valibot";
import { requireWorkspacePermission } from "../../utils/require-workspace-permission";
import { workspaceAccess } from "../../utils/workspace-access-middleware";
import * as ctl from "./controller";
import { id, taskInput } from "./validation";

const doc = (operationId: string, description: string) =>
  describeRoute({
    operationId,
    description,
    tags: ["Horas de sites"],
    responses: { 200: { description: "Resumo operacional sem custos" } },
  });
const work = new Hono<{ Variables: { workspaceId: string; userId: string } }>()
  .get(
    "/project/:projectId",
    doc("siteHoursBoard", "Horas e estimativas de sites no quadro; sem custos"),
    validator("param", v.object({ projectId: id })),
    workspaceAccess.fromProject("projectId"),
    requireWorkspacePermission({ task: ["read"] }),
    async (c) =>
      c.json(
        await ctl.workSummary(
          c.get("workspaceId"),
          c.req.valid("param").projectId,
        ),
      ),
  )
  .get(
    "/task/:taskId",
    doc("siteHoursOptions", "Sites do cliente da tarefa; sem valores"),
    validator("param", v.object({ taskId: id })),
    workspaceAccess.fromTaskId(),
    requireWorkspacePermission({ task: ["read"] }),
    async (c) =>
      c.json(
        await ctl.taskOptions(
          c.get("workspaceId"),
          c.req.valid("param").taskId,
        ),
      ),
  )
  .put(
    "/task/:taskId",
    doc("siteHoursPlan", "Vincular tarefa ao site e definir estimativa"),
    validator("param", v.object({ taskId: id })),
    validator("json", taskInput),
    workspaceAccess.fromTaskId(),
    requireWorkspacePermission({ task: ["update"] }),
    async (c) => {
      const b = c.req.valid("json");
      if (b.taskId !== c.req.valid("param").taskId)
        ctl.fail(400, "Tarefa divergente.");
      return c.json(
        await ctl.attachTask(c.get("workspaceId"), c.get("userId"), b),
      );
    },
  );
const workContract = new Hono().route("/site-work", work);
export type SiteWorkAppType = typeof workContract;
export default work;
