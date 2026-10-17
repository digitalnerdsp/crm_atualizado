import { Hono } from "hono";
import { describeRoute, validator } from "hono-openapi";
import { requireWorkspacePermission } from "../../utils/require-workspace-permission";
import { workspaceAccess } from "../../utils/workspace-access-middleware";
import { resolveVisibility } from "../shared/resolve-visibility";
import * as ctl from "./controllers/hosting";
import {
  configSchema,
  filters,
  params,
  previewSchema,
  sendSchema,
} from "./validation";

const doc = (operationId: string, description: string) =>
  describeRoute({
    operationId,
    description,
    tags: ["Carteira e hospedagem"],
    responses: { 200: { description: "Operação concluída" } },
  });
const notify = requireWorkspacePermission({ crmCompany: ["notify"] });
const hosting = new Hono<{
  Variables: { workspaceId: string; userId: string };
}>()
  .use(
    "/:workspaceId/*",
    workspaceAccess.fromParam("workspaceId"),
    requireWorkspacePermission({ crmCompany: ["read"] }),
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
    requireWorkspacePermission({ crmCompany: ["update"] }),
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
  .post(
    "/:workspaceId/companies/:id/preview",
    doc("crmHostingPreview", "Revisar destinatário e mensagem do aviso"),
    notify,
    validator("param", params),
    validator("json", previewSchema),
    async (c) =>
      c.json(
        await ctl.preview(
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
  .post(
    "/:workspaceId/companies/:id/notices",
    doc("crmHostingNotice", "Enviar e-mail ou preparar conversa de WhatsApp"),
    notify,
    validator("param", params),
    validator("json", sendSchema),
    async (c) =>
      c.json(
        await ctl.sendNotice(
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
  .post(
    "/:workspaceId/notices/:id/confirm",
    doc("crmHostingConfirmWhatsApp", "Registrar confirmação manual de envio"),
    notify,
    validator("param", params),
    async (c) =>
      c.json(
        await ctl.confirmWhatsApp(
          {
            workspaceId: c.get("workspaceId"),
            userId: c.get("userId"),
            visibility: await resolveVisibility(c, "crmCompany"),
          },
          c.req.valid("param").id,
        ),
      ),
  );
export default hosting;
