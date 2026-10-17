import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { describeRoute, validator } from "hono-openapi";
import * as v from "valibot";
import { requireWorkspacePermission } from "../utils/require-workspace-permission";
import { workspaceAccess } from "../utils/workspace-access-middleware";
import * as ctl from "./controllers/finance";
import { excel, pdf } from "./export";
import { dashboard, remaining, status } from "./model";
import performance from "./performance";
import recurrence from "./recurrence";
import taxes from "./taxes";
import {
  categorySchema,
  createEntrySchema,
  filterSchema,
  partySchema,
  reasonSchema,
  settleSchema,
  updateEntrySchema,
} from "./validation";

const doc = (operationId: string, description: string) =>
  describeRoute({
    operationId,
    description,
    tags: ["Financeiro"],
    responses: { 200: { description: "Operação concluída" } },
  });
const grant = (action: string) =>
  requireWorkspacePermission({ finance: ["read", action] });
const params = v.object({
  workspaceId: v.string(),
  id: v.pipe(v.string(), v.minLength(1)),
});
const finance = new Hono<{
  Variables: { userId: string; workspaceId: string };
}>()
  .use(
    "/:workspaceId/*",
    workspaceAccess.fromParam("workspaceId"),
    requireWorkspacePermission({ finance: ["read"] }),
  )
  .route("/:workspaceId/recurrence", recurrence)
  .route("/:workspaceId/performance", performance)
  .route("/:workspaceId/taxes", taxes)
  .get(
    "/:workspaceId/metadata",
    doc("financeMetadata", "Cadastros financeiros do workspace"),
    async (c) => c.json(await ctl.metadata(c.get("workspaceId"))),
  )
  .post(
    "/:workspaceId/categories",
    doc("financeCreateCategory", "Cadastrar categoria financeira"),
    grant("manage"),
    validator("json", categorySchema),
    async (c) =>
      c.json(
        await ctl.saveCategory(
          c.get("workspaceId"),
          c.get("userId"),
          c.req.valid("json"),
        ),
      ),
  )
  .patch(
    "/:workspaceId/categories/:id",
    doc("financeUpdateCategory", "Editar ou desativar categoria"),
    grant("manage"),
    validator("param", params),
    validator("json", categorySchema),
    async (c) =>
      c.json(
        await ctl.saveCategory(
          c.get("workspaceId"),
          c.get("userId"),
          c.req.valid("json"),
          c.req.valid("param").id,
        ),
      ),
  )
  .post(
    "/:workspaceId/parties",
    doc("financeCreateParty", "Cadastrar favorecido ou colaborador"),
    grant("manage"),
    validator("json", partySchema),
    async (c) =>
      c.json(
        await ctl.saveParty(
          c.get("workspaceId"),
          c.get("userId"),
          c.req.valid("json"),
        ),
      ),
  )
  .patch(
    "/:workspaceId/parties/:id",
    doc("financeUpdateParty", "Editar ou desativar favorecido"),
    grant("manage"),
    validator("param", params),
    validator("json", partySchema),
    async (c) =>
      c.json(
        await ctl.saveParty(
          c.get("workspaceId"),
          c.get("userId"),
          c.req.valid("json"),
          c.req.valid("param").id,
        ),
      ),
  )
  .get(
    "/:workspaceId/dashboard",
    doc("financeDashboard", "KPIs e comparações entre períodos equivalentes"),
    validator("query", filterSchema),
    async (c) =>
      c.json(
        dashboard(
          await ctl.loadEntries(c.get("workspaceId")),
          c.req.valid("query"),
        ),
      ),
  )
  .get(
    "/:workspaceId/entries",
    doc("financeListEntries", "Consultar lançamentos com filtros e paginação"),
    validator("query", filterSchema),
    async (c) => {
      const raw = c.req.query("page") ?? "1";
      const page = Number(raw);
      if (!/^\d+$/.test(raw) || !Number.isSafeInteger(page) || page < 1)
        throw new HTTPException(400, { message: "Página inválida." });
      return c.json(
        ctl.listEntries(
          await ctl.loadEntries(c.get("workspaceId")),
          c.req.valid("query"),
          page,
        ),
      );
    },
  )
  .post(
    "/:workspaceId/entries",
    doc(
      "financeCreateEntries",
      "Criar lançamento, parcelas ou recorrências finitas",
    ),
    grant("create"),
    validator("json", createEntrySchema),
    async (c) =>
      c.json(
        await ctl.createEntries(
          c.get("workspaceId"),
          c.get("userId"),
          c.req.valid("json"),
        ),
      ),
  )
  .get(
    "/:workspaceId/entries/:id",
    doc("financeGetEntry", "Consultar título financeiro vinculado"),
    validator("param", params),
    async (c) => {
      const entry = (await ctl.loadEntries(c.get("workspaceId"))).find(
        (e) => e.id === c.req.valid("param").id,
      );
      if (!entry)
        throw new HTTPException(404, { message: "Lançamento não encontrado." });
      return c.json({
        ...entry,
        reportBalanceCents: remaining(entry),
        reportStatus: status(entry),
      });
    },
  )
  .patch(
    "/:workspaceId/entries/:id",
    doc("financeUpdateEntry", "Editar lançamento sem baixas ativas"),
    grant("update"),
    validator("param", params),
    validator("json", updateEntrySchema),
    async (c) =>
      c.json(
        await ctl.updateEntry(
          c.get("workspaceId"),
          c.get("userId"),
          c.req.valid("param").id,
          c.req.valid("json"),
        ),
      ),
  )
  .post(
    "/:workspaceId/entries/:id/cancel",
    doc("financeCancelEntry", "Cancelar com justificativa"),
    grant("update"),
    validator("param", params),
    validator("json", reasonSchema),
    async (c) =>
      c.json(
        await ctl.cancelEntry(
          c.get("workspaceId"),
          c.get("userId"),
          c.req.valid("param").id,
          c.req.valid("json").reason,
        ),
      ),
  )
  .post(
    "/:workspaceId/entries/:id/settlements",
    doc(
      "financeSettleEntry",
      "Baixa parcial ou total com proteção contra duplicações",
    ),
    grant("settle"),
    validator("param", params),
    validator("json", settleSchema),
    async (c) =>
      c.json(
        await ctl.settleEntry(
          c.get("workspaceId"),
          c.get("userId"),
          c.req.valid("param").id,
          c.req.valid("json"),
        ),
      ),
  )
  .post(
    "/:workspaceId/entries/:id/settlements/:settlementId/reverse",
    doc("financeReverseSettlement", "Estornar baixa mantendo histórico"),
    grant("settle"),
    validator(
      "param",
      v.object({
        workspaceId: v.string(),
        id: v.string(),
        settlementId: v.string(),
      }),
    ),
    validator("json", reasonSchema),
    async (c) => {
      const p = c.req.valid("param");
      return c.json(
        await ctl.reverseSettlement(
          c.get("workspaceId"),
          c.get("userId"),
          p.id,
          p.settlementId,
          c.req.valid("json").reason,
        ),
      );
    },
  )
  .get(
    "/:workspaceId/entries/:id/history",
    doc("financeEntryHistory", "Histórico auditável do lançamento"),
    validator("param", params),
    async (c) =>
      c.json(await ctl.history(c.get("workspaceId"), c.req.valid("param").id)),
  )
  .get(
    "/:workspaceId/export/:format",
    doc(
      "financeExport",
      "Exportar todos os lançamentos filtrados em Excel ou PDF",
    ),
    grant("export"),
    validator("query", filterSchema),
    validator(
      "param",
      v.object({
        workspaceId: v.string(),
        format: v.picklist(["xlsx", "pdf"]),
      }),
    ),
    async (c) => {
      const { format } = c.req.valid("param");
      const entries = await ctl.loadEntries(c.get("workspaceId"));
      const bytes = await (format === "xlsx" ? excel : pdf)(
        entries,
        c.req.valid("query"),
      );
      c.header(
        "Content-Type",
        format === "xlsx"
          ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          : "application/pdf",
      );
      c.header(
        "Content-Disposition",
        `attachment; filename="financeiro.${format}"`,
      );
      c.header("Cache-Control", "no-store");
      return c.body(bytes);
    },
  );
export default finance;
