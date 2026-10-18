import { Hono } from "hono";
import { describeRoute, validator } from "hono-openapi";
import * as v from "valibot";
import { requireWorkspacePermission } from "../utils/require-workspace-permission";
import { workspaceAccess } from "../utils/workspace-access-middleware";
import * as ctl from "./controller";
import { themePackageSchema } from "./model";

const doc = (operationId: string, description: string) =>
  describeRoute({
    operationId,
    description,
    tags: ["Temas"],
    responses: { 200: { description: "Operação concluída" } },
  });
const params = v.object({ workspaceId: v.string() });
const idParams = v.object({
  workspaceId: v.string(),
  id: v.pipe(v.string(), v.minLength(1), v.maxLength(128)),
});
// Qualquer membro lê o tema ativo; só quem gerencia o workspace envia e ativa.
const manage = requireWorkspacePermission({
  workspace: ["update", "manage_settings"],
});
const theme = new Hono<{
  Variables: { workspaceId: string; userId: string };
}>()
  .use(
    "/:workspaceId/*",
    workspaceAccess.fromParam("workspaceId"),
    requireWorkspacePermission({ workspace: ["read"] }),
  )
  .get(
    "/:workspaceId/active",
    doc("workspaceThemeActive", "Tema em uso no workspace"),
    validator("param", params),
    async (c) => c.json({ theme: await ctl.activeTheme(c.get("workspaceId")) }),
  )
  .get(
    "/:workspaceId",
    doc("workspaceThemeList", "Temas enviados ao workspace"),
    manage,
    validator("param", params),
    async (c) => c.json(await ctl.listThemes(c.get("workspaceId"))),
  )
  .post(
    "/:workspaceId",
    doc("workspaceThemeCreate", "Enviar um pacote de tema (JSON)"),
    manage,
    validator("param", params),
    validator("json", themePackageSchema),
    async (c) =>
      c.json(
        await ctl.createTheme(
          { workspaceId: c.get("workspaceId"), userId: c.get("userId") },
          c.req.valid("json"),
        ),
        201,
      ),
  )
  .put(
    "/:workspaceId/default",
    doc("workspaceThemeDefault", "Voltar à aparência padrão"),
    manage,
    validator("param", params),
    async (c) => {
      await ctl.setActiveTheme(
        { workspaceId: c.get("workspaceId"), userId: c.get("userId") },
        null,
      );
      return c.json({ ok: true });
    },
  )
  .put(
    "/:workspaceId/:id/activate",
    doc("workspaceThemeActivate", "Ativar um tema no workspace"),
    manage,
    validator("param", idParams),
    async (c) => {
      await ctl.setActiveTheme(
        { workspaceId: c.get("workspaceId"), userId: c.get("userId") },
        c.req.valid("param").id,
      );
      return c.json({ ok: true });
    },
  )
  .put(
    "/:workspaceId/:id",
    doc("workspaceThemeUpdate", "Substituir o pacote de um tema"),
    manage,
    validator("param", idParams),
    validator("json", themePackageSchema),
    async (c) =>
      c.json(
        await ctl.updateTheme(
          { workspaceId: c.get("workspaceId"), userId: c.get("userId") },
          c.req.valid("param").id,
          c.req.valid("json"),
        ),
      ),
  )
  .delete(
    "/:workspaceId/:id",
    doc("workspaceThemeDelete", "Remover um tema"),
    manage,
    validator("param", idParams),
    async (c) => {
      await ctl.deleteTheme(
        { workspaceId: c.get("workspaceId"), userId: c.get("userId") },
        c.req.valid("param").id,
      );
      return c.json({ ok: true });
    },
  );
export default theme;
