import { Hono } from "hono";
import { describeRoute, validator } from "hono-openapi";
import * as v from "valibot";
import { requireWorkspacePermission } from "../../utils/require-workspace-permission";
import { civilDate } from "../validation";
import * as ctl from "./controller";
import { exportPerformanceExcel, exportPerformancePdf } from "./export";

const doc = (operationId: string, description: string) =>
  describeRoute({
    operationId,
    description,
    tags: ["Comissões e resultados"],
    responses: { 200: { description: "Operação concluída" } },
  });
const id = v.pipe(v.string(), v.minLength(1), v.maxLength(128));
const version = v.pipe(v.number(), v.integer(), v.minValue(0));
const bps = v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(10000));
const params = v.object({ workspaceId: id, id });
const filters = v.pipe(
  v.object({
    from: civilDate,
    to: civilDate,
    sellerId: v.optional(id),
    serviceId: v.optional(id),
  }),
  v.check(
    (f) =>
      f.from <= f.to &&
      (Date.parse(f.to) - Date.parse(f.from)) / 86400000 <= 730,
    "Período inválido; máximo de 731 dias.",
  ),
);
const manage = requireWorkspacePermission({ finance: ["read", "manage"] });
const performance = new Hono<{
  Variables: { workspaceId: string; userId: string };
}>()
  .get(
    "/report",
    doc(
      "financePerformanceReport",
      "Indicadores e apuração de comissões e resultados",
    ),
    validator("query", filters),
    async (c) =>
      c.json(await ctl.report(c.get("workspaceId"), c.req.valid("query"))),
  )
  .get(
    "/configuration",
    doc(
      "financePerformanceConfiguration",
      "Regras por serviço e parâmetros gerenciais",
    ),
    async (c) => c.json(await ctl.configuration(c.get("workspaceId"))),
  )
  .post(
    "/rules",
    doc(
      "financeCommissionRule",
      "Cadastrar nova versão da comissão por serviço",
    ),
    manage,
    validator(
      "json",
      v.object({
        serviceId: id,
        effectiveDate: civilDate,
        rateBps: bps,
        recurringRateBps: bps,
        // Nulo = a recorrência vale em todo ciclo, sem limite de meses.
        recurringMonths: v.nullable(
          v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(120)),
        ),
        version,
      }),
    ),
    async (c) =>
      c.json(
        await ctl.saveRule(
          c.get("workspaceId"),
          c.get("userId"),
          c.req.valid("json"),
        ),
      ),
  )
  .put(
    "/settings",
    doc(
      "financePresumptionSettings",
      "Configurar simulação de lucro presumido",
    ),
    manage,
    validator("json", v.object({ presumptionBps: v.nullable(bps), version })),
    async (c) =>
      c.json(
        await ctl.saveSettings(
          c.get("workspaceId"),
          c.get("userId"),
          c.req.valid("json"),
        ),
      ),
  )
  .put(
    "/entries/:id/classification",
    doc("financeResultClassification", "Classificar custo ou despesa"),
    requireWorkspacePermission({ finance: ["read", "update"] }),
    validator("param", params),
    validator(
      "json",
      v.object({
        resultClass: v.picklist([
          "unclassified",
          "direct",
          "operating",
          "tax",
          "financial",
          "commission",
        ]),
        version,
      }),
    ),
    async (c) =>
      c.json(
        await ctl.classify(
          c.get("workspaceId"),
          c.get("userId"),
          c.req.valid("param").id,
          c.req.valid("json"),
        ),
      ),
  )
  .post(
    "/entries/:id/apply-rule",
    doc(
      "financeCommissionApplyRule",
      "Aplicar regra a cobrança elegível sem histórico",
    ),
    manage,
    requireWorkspacePermission({ finance: ["update"] }),
    validator("param", params),
    validator("json", v.object({ version })),
    async (c) =>
      c.json(
        await ctl.applyRule(
          c.get("workspaceId"),
          c.get("userId"),
          c.req.valid("param").id,
          c.req.valid("json").version,
        ),
      ),
  )
  .post(
    "/entries/:id/issue",
    doc("financeCommissionIssue", "Gerar conta a pagar pelo saldo disponível"),
    manage,
    requireWorkspacePermission({ finance: ["create"] }),
    validator("param", params),
    validator("json", v.object({ requestId: id, dueDate: civilDate, version })),
    async (c) =>
      c.json(
        await ctl.issueCommission(
          c.get("workspaceId"),
          c.get("userId"),
          c.req.valid("param").id,
          c.req.valid("json"),
        ),
      ),
  )
  .get(
    "/export/:format",
    doc("financePerformanceExport", "Exportar comissões e resultados"),
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
      const bytes = await (format === "xlsx"
        ? exportPerformanceExcel
        : exportPerformancePdf)(r, f);
      c.header(
        "Content-Type",
        format === "xlsx"
          ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          : "application/pdf",
      );
      c.header(
        "Content-Disposition",
        `attachment; filename="comissoes-resultados.${format}"`,
      );
      c.header("Cache-Control", "no-store");
      return c.body(bytes);
    },
  );
export default performance;
