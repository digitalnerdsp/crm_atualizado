import { Hono } from "hono";
import { describeRoute, validator } from "hono-openapi";
import * as v from "valibot";
import { requireWorkspacePermission } from "../../utils/require-workspace-permission";
import * as ctl from "./controllers/taxes";
import { exportTaxExcel, exportTaxPdf } from "./export";
import {
  calculationSchema,
  filters,
  id,
  params,
  profileSchema,
  saveSchema,
} from "./validation";

const doc = (operationId: string, description: string) =>
  describeRoute({
    operationId,
    description,
    tags: ["Taxas e impostos"],
    responses: { 200: { description: "Operação concluída" } },
  });
const manage = requireWorkspacePermission({ finance: ["read", "manage"] });
const taxes = new Hono<{ Variables: { workspaceId: string; userId: string } }>()
  .get(
    "/configuration",
    doc("financeTaxConfiguration", "Perfis de taxas e impostos"),
    async (c) => c.json(await ctl.configuration(c.get("workspaceId"))),
  )
  .get(
    "/profiles/:id",
    doc("financeTaxProfileHistory", "Histórico de versões do perfil"),
    validator("param", params),
    async (c) =>
      c.json(
        await ctl.profileHistory(c.get("workspaceId"), c.req.valid("param").id),
      ),
  )
  .post(
    "/profiles",
    doc("financeTaxCreateProfile", "Cadastrar perfil de taxas e impostos"),
    manage,
    validator("json", profileSchema),
    async (c) =>
      c.json(
        await ctl.saveProfile(
          c.get("workspaceId"),
          c.get("userId"),
          c.req.valid("json"),
        ),
      ),
  )
  .put(
    "/profiles/:id",
    doc("financeTaxUpdateProfile", "Criar nova versão de perfil"),
    manage,
    validator("param", params),
    validator("json", profileSchema),
    async (c) =>
      c.json(
        await ctl.saveProfile(
          c.get("workspaceId"),
          c.get("userId"),
          c.req.valid("json"),
          c.req.valid("param").id,
        ),
      ),
  )
  .post(
    "/calculate",
    doc("financeTaxCalculate", "Calcular preço bruto ou líquido em centavos"),
    validator("json", calculationSchema),
    async (c) =>
      c.json(await ctl.calculate(c.get("workspaceId"), c.req.valid("json"))),
  )
  .post(
    "/simulations",
    doc(
      "financeTaxSaveSimulation",
      "Salvar simulação e seus parâmetros imutáveis",
    ),
    requireWorkspacePermission({ finance: ["read", "create"] }),
    validator("json", saveSchema),
    async (c) =>
      c.json(
        await ctl.saveSimulation(
          c.get("workspaceId"),
          c.get("userId"),
          c.req.valid("json"),
        ),
      ),
  )
  .get(
    "/report",
    doc("financeTaxReport", "KPIs comparativos, lançamentos e simulações"),
    validator("query", filters),
    async (c) =>
      c.json(await ctl.report(c.get("workspaceId"), c.req.valid("query"))),
  )
  .get(
    "/export/:format",
    doc(
      "financeTaxExport",
      "Exportar parâmetros, simulações e resumo em Excel ou PDF",
    ),
    requireWorkspacePermission({ finance: ["read", "export"] }),
    validator(
      "param",
      v.object({ workspaceId: id, format: v.picklist(["xlsx", "pdf"]) }),
    ),
    validator("query", filters),
    async (c) => {
      const f = c.req.valid("query");
      const format = c.req.valid("param").format;
      const r = await ctl.report(c.get("workspaceId"), f);
      const bytes = await (format === "xlsx" ? exportTaxExcel : exportTaxPdf)(
        r,
        f,
      );
      c.header(
        "Content-Type",
        format === "xlsx"
          ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          : "application/pdf",
      );
      c.header(
        "Content-Disposition",
        `attachment; filename="taxas-impostos.${format}"`,
      );
      c.header("Cache-Control", "no-store");
      return c.body(bytes);
    },
  );
export default taxes;
