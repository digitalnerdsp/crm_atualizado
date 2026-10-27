import { Hono } from "hono";
import { describeRoute, validator } from "hono-openapi";
import * as v from "valibot";
import { requireWorkspacePermission } from "../../utils/require-workspace-permission";
import { workspaceAccess } from "../../utils/workspace-access-middleware";
import sellerPanel from "./controller";

/**
 * Painel do vendedor: sempre os números de quem pergunta, mesmo para quem
 * enxerga a equipe toda — o painel geral fica no BI.
 */
const route = new Hono<{
  Variables: { userId: string; workspaceId: string };
}>().get(
  "/",
  describeRoute({
    operationId: "crmSellerPanel",
    tags: ["CRM"],
    description:
      "Vendas por mês, comissão do mês e previsão do mês seguinte do próprio usuário.",
    responses: { 200: { description: "Painel do vendedor" } },
  }),
  validator("query", v.object({ workspaceId: v.string() })),
  workspaceAccess.fromQuery(),
  requireWorkspacePermission({ crmDeal: ["read"] }),
  async (c) =>
    c.json(
      await sellerPanel({
        workspaceId: c.get("workspaceId"),
        userId: c.get("userId"),
      }),
    ),
);
export default route;
