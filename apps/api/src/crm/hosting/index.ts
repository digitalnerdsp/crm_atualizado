import { Hono } from "hono";
import { describeRoute, validator } from "hono-openapi";
import { requireWorkspacePermission } from "../../utils/require-workspace-permission";
import { workspaceAccess } from "../../utils/workspace-access-middleware";
import { resolveVisibility } from "../shared/resolve-visibility";
import * as ctl from "./controllers/hosting";
import * as digest from "./digest/controller";
import { configSchema, digestSchema, filters, params } from "./validation";

const doc = (operationId: string, description: string) =>
  describeRoute({
    operationId,
    description,
    tags: ["Carteira e hospedagem"],
    responses: { 200: { description: "Operação concluída" } },
  });
// O aviso interno lista a carteira inteira: só quem enxerga tudo e pode avisar.
const digestAdmin = requireWorkspacePermission({
  hosting: ["notify"],
  crmCompany: ["read_all"],
});
const hosting = new Hono<{
  Variables: { workspaceId: string; userId: string };
}>()
  .use(
    "/:workspaceId/*",
    workspaceAccess.fromParam("workspaceId"),
    requireWorkspacePermission({ hosting: ["read"], crmCompany: ["read"] }),
  )
  .get(
    "/:workspaceId/metadata",
    doc("crmHostingMetadata", "Serviços e responsáveis disponíveis"),
    async (c) =>
      c.json(
        await ctl.metadata({
          workspaceId: c.get("workspaceId"),
          userId: c.get("userId"),
          visibility: await resolveVisibility(c, "crmCompany"),
        }),
      ),
  )
  .get(
    "/:workspaceId/report",
    doc("crmHostingReport", "Dashboard e carteira com filtros"),
    validator("query", filters),
    async (c) =>
      c.json(
        await ctl.report(
          {
            workspaceId: c.get("workspaceId"),
            userId: c.get("userId"),
            visibility: await resolveVisibility(c, "crmCompany"),
          },
          c.req.valid("query"),
        ),
      ),
  )
  .get(
    "/:workspaceId/companies/:id",
    doc("crmHostingCompany", "Cadastro, serviços e avisos da empresa"),
    validator("param", params),
    async (c) =>
      c.json(
        await ctl.detail(
          {
            workspaceId: c.get("workspaceId"),
            userId: c.get("userId"),
            visibility: await resolveVisibility(c, "crmCompany"),
          },
          c.req.valid("param").id,
        ),
      ),
  )
  .put(
    "/:workspaceId/companies/:id",
    doc("crmHostingSave", "Atualizar hospedagem e flags de serviços"),
    requireWorkspacePermission({ hosting: ["update"], crmCompany: ["update"] }),
    validator("param", params),
    validator("json", configSchema),
    async (c) =>
      c.json(
        await ctl.saveHosting(
          {
            workspaceId: c.get("workspaceId"),
            userId: c.get("userId"),
            visibility: await resolveVisibility(c, "crmCompany"),
          },
          c.req.valid("param").id,
          c.req.valid("json"),
        ),
      ),
  )
  .get(
    "/:workspaceId/digest",
    doc(
      "crmHostingDigestConfig",
      "Configuração, destinatários e histórico do aviso interno de renovação",
    ),
    digestAdmin,
    async (c) => c.json(await digest.getConfig(c.get("workspaceId"))),
  )
  .put(
    "/:workspaceId/digest",
    doc(
      "crmHostingDigestSave",
      "Definir destinatários, marcas de dias e ativação do aviso interno",
    ),
    digestAdmin,
    validator("json", digestSchema),
    async (c) =>
      c.json(
        await digest.saveConfig(
          { workspaceId: c.get("workspaceId"), userId: c.get("userId") },
          c.req.valid("json"),
        ),
      ),
  )
  .get(
    "/:workspaceId/digest/preview",
    doc("crmHostingDigestPreview", "O que seria avisado hoje, sem registrar"),
    digestAdmin,
    async (c) => c.json(await digest.previewDue(c.get("workspaceId"))),
  )
  .post(
    "/:workspaceId/digest/runs/:id/retry",
    doc("crmHostingDigestRetry", "Reenviar um aviso interno que falhou"),
    digestAdmin,
    validator("param", params),
    async (c) =>
      c.json(
        await digest.retryRun(
          { workspaceId: c.get("workspaceId"), userId: c.get("userId") },
          c.req.valid("param").id,
        ),
      ),
  );
export default hosting;
