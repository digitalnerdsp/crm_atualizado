import { Hono } from "hono";
import { describeRoute, validator } from "hono-openapi";
import * as v from "valibot";
import { requireWorkspacePermission } from "../../utils/require-workspace-permission";
import { civilDate } from "../validation";
import { configureBilling, generateContract, renewContract } from "./billing";
import { exportRecurrenceExcel, exportRecurrencePdf } from "./export";
import { detail, loadPortfolio, recurrenceReport } from "./report";

const id = v.pipe(v.string(), v.minLength(1), v.maxLength(128));
const param = v.object({ workspaceId: id, id });
const filters = v.pipe(
  v.object({
    from: civilDate,
    to: civilDate,
    companyId: v.optional(id),
    sellerId: v.optional(id),
    serviceId: v.optional(id),
    contractId: v.optional(id),
    status: v.optional(
      v.picklist(["active", "paused", "cancelled", "finished", "not_started"]),
    ),
    billingType: v.optional(v.picklist(["monthly", "quarterly", "yearly"])),
    dateField: v.optional(v.picklist(["start", "end"])),
    expiresWithin: v.optional(v.picklist(["30", "60", "90"])),
    term: v.optional(v.picklist(["fixed", "indefinite"])),
  }),
  v.check(
    (f) =>
      f.from <= f.to &&
      (Date.parse(f.to) - Date.parse(f.from)) / 86400000 <= 730,
    "Período inválido; máximo de 731 dias.",
  ),
);
const doc = (operationId: string, description: string) =>
  describeRoute({
    operationId,
    description,
    tags: ["Recorrência"],
    responses: { 200: { description: "Operação concluída" } },
  });
const manage = requireWorkspacePermission({
  finance: ["read", "manage", "create", "update"],
});
const recurrence = new Hono<{
  Variables: { workspaceId: string; userId: string };
}>()
  .get(
    "/report",
    doc("recurrenceReport", "Dashboard e relatório de contratos recorrentes"),
    validator("query", filters),
    async (c) =>
      c.json(
        recurrenceReport(
          await loadPortfolio(c.get("workspaceId")),
          c.req.valid("query"),
        ),
      ),
  )
  .get(
    "/contracts/:id",
    doc(
      "recurrenceContractDetail",
      "Configuração, versões e cobranças do contrato",
    ),
    validator("param", param),
    async (c) =>
      c.json(await detail(c.get("workspaceId"), c.req.valid("param").id)),
  )
  .put(
    "/contracts/:id/config",
    doc(
      "recurrenceConfigureBilling",
      "Ativar ou ajustar geração financeira do contrato",
    ),
    manage,
    validator("param", param),
    validator(
      "json",
      v.object({
        enabled: v.boolean(),
        startsOn: civilDate,
        horizonMonths: v.pipe(
          v.number(),
          v.integer(),
          v.minValue(1),
          v.maxValue(24),
        ),
        prorateFinal: v.boolean(),
        categoryId: v.nullable(id),
        version: v.pipe(v.number(), v.integer(), v.minValue(0)),
      }),
    ),
    async (c) =>
      c.json(
        await configureBilling(
          c.get("workspaceId"),
          c.req.valid("param").id,
          c.get("userId"),
          c.req.valid("json"),
        ),
      ),
  )
  .post(
    "/contracts/:id/generate",
    doc("recurrenceGenerateBilling", "Sincronizar cobranças sem duplicação"),
    manage,
    validator("param", param),
    async (c) =>
      c.json(
        await generateContract(
          c.get("workspaceId"),
          c.req.valid("param").id,
          c.get("userId"),
        ),
      ),
  )
  .post(
    "/contracts/:id/renew",
    doc(
      "recurrenceRenewContract",
      "Renovar vigência preservando cobranças e histórico",
    ),
    manage,
    requireWorkspacePermission({ crmDeal: ["update", "change_stage"] }),
    validator("param", param),
    validator(
      "json",
      v.object({
        endsOn: civilDate,
        note: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(1000)),
      }),
    ),
    async (c) => {
      const b = c.req.valid("json");
      return c.json(
        await renewContract(
          c.get("workspaceId"),
          c.req.valid("param").id,
          c.get("userId"),
          b.endsOn,
          b.note,
        ),
      );
    },
  )
  .get(
    "/export/:format",
    doc("recurrenceExport", "Exportar contratos e serviços em Excel ou PDF"),
    requireWorkspacePermission({ finance: ["read", "export"] }),
    validator(
      "param",
      v.object({ workspaceId: id, format: v.picklist(["xlsx", "pdf"]) }),
    ),
    validator("query", filters),
    async (c) => {
      const f = c.req.valid("query");
      const format = c.req.valid("param").format;
      const report = recurrenceReport(
        await loadPortfolio(c.get("workspaceId")),
        f,
      );
      const bytes = await (format === "xlsx"
        ? exportRecurrenceExcel
        : exportRecurrencePdf)(report, f);
      c.header(
        "Content-Type",
        format === "xlsx"
          ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          : "application/pdf",
      );
      c.header(
        "Content-Disposition",
        `attachment; filename="contratos-recorrencia.${format}"`,
      );
      c.header("Cache-Control", "no-store");
      return c.body(bytes);
    },
  );
export default recurrence;
