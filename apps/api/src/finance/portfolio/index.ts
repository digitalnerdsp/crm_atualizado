import { Hono } from "hono";
import { describeRoute, validator } from "hono-openapi";
import * as v from "valibot";
import {
  hasWorkspacePermission,
  requireWorkspacePermission,
} from "../../utils/require-workspace-permission";
import * as ctl from "./controller";
import { exportPortfolio } from "./export";
import * as notices from "./notice";
import {
  caseInput,
  draftInput,
  id,
  noticeInput,
  range,
  rateInput,
  sendInput,
  siteInput,
  workerInput,
} from "./validation";

const doc = (operationId: string, description: string) =>
  describeRoute({
    operationId,
    description,
    tags: ["Gestão da carteira"],
    responses: { 200: { description: "Operação concluída" } },
  });
const grant = (action: string) =>
  requireWorkspacePermission({ portfolio: [action] });
const params = v.object({ id });
const portfolio = new Hono<{
  Variables: { userId: string; workspaceId: string };
}>()
  .get(
    "/report",
    doc("portfolioReport", "Cobranças, renovações e rentabilidade"),
    validator("query", range),
    async (c) => {
      const r = await ctl.report(
        c.get("workspaceId"),
        c.req.valid("query"),
        await hasWorkspacePermission(c, { task: ["read"] }),
      );
      const page = Number(c.req.query("page") ?? 1);
      if (!Number.isSafeInteger(page) || page < 1 || page > 100000)
        ctl.fail(400, "Página inválida.");
      c.header("Cache-Control", "private, no-store");
      return c.json({
        ...r,
        historyTotal: r.caseHistory.length,
        caseHistory: r.caseHistory.slice((page - 1) * 25, page * 25),
        queueTotal: r.queue.length,
        queue: r.queue.slice((page - 1) * 25, page * 25),
        page,
        pageSize: 25,
      });
    },
  )
  .get(
    "/metadata",
    doc("portfolioMetadata", "Cadastros financeiros e taxas internas"),
    grant("costs"),
    async (c) => c.json(await ctl.metadata(c.get("workspaceId"))),
  )
  .post(
    "/cases",
    doc(
      "portfolioSaveCase",
      "Registrar acompanhamento sem alterar a obrigação",
    ),
    grant("update"),
    validator("json", caseInput),
    async (c) =>
      c.json(
        await ctl.saveCase(
          c.get("workspaceId"),
          c.get("userId"),
          c.req.valid("json"),
        ),
      ),
  )
  .get(
    "/cases/:id",
    doc("portfolioCaseDetail", "Histórico e contatos da empresa"),
    validator("param", params),
    async (c) =>
      c.json(
        await ctl.caseDetail(c.get("workspaceId"), c.req.valid("param").id),
      ),
  )
  .post(
    "/preview",
    doc("portfolioNoticePreview", "Revisar mensagem e destinatário"),
    grant("notify"),
    validator("json", noticeInput),
    async (c) =>
      c.json(await notices.preview(c.get("workspaceId"), c.req.valid("json"))),
  )
  .post(
    "/notices",
    doc(
      "portfolioSendNotice",
      "Enviar SMTP ou preparar WhatsApp, com idempotência",
    ),
    grant("notify"),
    validator("json", sendInput),
    async (c) =>
      c.json(
        await notices.send(
          c.get("workspaceId"),
          c.get("userId"),
          c.req.valid("json"),
        ),
      ),
  )
  .post(
    "/notices/:id/confirm",
    doc("portfolioConfirmWhatsapp", "Informar envio manual no WhatsApp"),
    grant("notify"),
    validator("param", params),
    validator("json", v.object({ confirmed: v.literal(true) })),
    async (c) =>
      c.json(
        await notices.confirm(
          c.get("workspaceId"),
          c.get("userId"),
          c.req.valid("param").id,
        ),
      ),
  )
  .post(
    "/sites",
    doc("portfolioCreateSite", "Cadastrar projeto de site financeiro"),
    grant("costs"),
    validator("json", siteInput),
    async (c) =>
      c.json(
        await ctl.saveSite(
          c.get("workspaceId"),
          c.get("userId"),
          c.req.valid("json"),
        ),
      ),
  )
  .put(
    "/sites/:id",
    doc("portfolioUpdateSite", "Atualizar projeto e cenário explícito"),
    grant("costs"),
    validator("param", params),
    validator("json", siteInput),
    async (c) =>
      c.json(
        await ctl.saveSite(
          c.get("workspaceId"),
          c.get("userId"),
          c.req.valid("json"),
          c.req.valid("param").id,
        ),
      ),
  )
  .put(
    "/sites/:id/workers",
    doc("portfolioWorker", "Configurar origem de custo do colaborador"),
    grant("costs"),
    validator("param", params),
    validator("json", workerInput),
    async (c) =>
      c.json(
        await ctl.saveWorker(
          c.get("workspaceId"),
          c.get("userId"),
          c.req.valid("param").id,
          c.req.valid("json"),
        ),
      ),
  )
  .post(
    "/sites/:id/entries",
    doc("portfolioLinkEntry", "Vincular um título a um único projeto de site"),
    grant("costs"),
    validator("param", params),
    validator("json", v.object({ entryId: id })),
    async (c) =>
      c.json(
        await ctl.attachEntry(
          c.get("workspaceId"),
          c.get("userId"),
          c.req.valid("param").id,
          c.req.valid("json").entryId,
        ),
      ),
  )
  .post(
    "/rates",
    doc(
      "portfolioCreateRate",
      "Cadastrar nova vigência imutável de custo/hora",
    ),
    grant("costs"),
    validator("json", rateInput),
    async (c) =>
      c.json(
        await ctl.saveRate(
          c.get("workspaceId"),
          c.get("userId"),
          c.req.valid("json"),
        ),
      ),
  )
  .post(
    "/drafts",
    doc(
      "portfolioCreateDraft",
      "Elaborar minuta sem ativar contrato ou cobrança",
    ),
    grant("draft"),
    validator("json", draftInput),
    async (c) =>
      c.json(
        await ctl.saveDraft(
          c.get("workspaceId"),
          c.get("userId"),
          c.req.valid("json"),
        ),
      ),
  )
  .put(
    "/drafts/:id",
    doc("portfolioUpdateDraft", "Editar ou submeter minuta"),
    grant("draft"),
    validator("param", params),
    validator("json", draftInput),
    async (c) =>
      c.json(
        await ctl.saveDraft(
          c.get("workspaceId"),
          c.get("userId"),
          c.req.valid("json"),
          c.req.valid("param").id,
        ),
      ),
  )
  .post(
    "/drafts/:id/decision",
    doc(
      "portfolioDecideDraft",
      "Aprovar/rejeitar minuta sem alterar origem automaticamente",
    ),
    grant("approve"),
    validator("param", params),
    validator(
      "json",
      v.object({
        version: v.pipe(v.number(), v.integer(), v.minValue(1)),
        status: v.picklist(["approved", "rejected"]),
        decision: v.pipe(
          v.string(),
          v.trim(),
          v.minLength(1),
          v.maxLength(4000),
        ),
      }),
    ),
    async (c) => {
      const b = c.req.valid("json");
      return c.json(
        await ctl.decideDraft(
          c.get("workspaceId"),
          c.get("userId"),
          c.req.valid("param").id,
          b.version,
          b.status,
          b.decision,
        ),
      );
    },
  )
  .get(
    "/export/:format",
    doc(
      "portfolioExport",
      "Exportar fila completa, clientes, sites, custos e minutas",
    ),
    requireWorkspacePermission({ finance: ["read", "export"] }),
    validator("param", v.object({ format: v.picklist(["xlsx", "pdf"]) })),
    validator("query", range),
    async (c) => {
      const r = await ctl.report(c.get("workspaceId"), c.req.valid("query"));
      const format = c.req.valid("param").format;
      const bytes = await exportPortfolio(r, format);
      c.header(
        "Content-Type",
        format === "xlsx"
          ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          : "application/pdf",
      );
      c.header(
        "Content-Disposition",
        `attachment; filename="gestao-carteira.${format}"`,
      );
      c.header("Cache-Control", "no-store");
      return c.body(new Uint8Array(bytes).buffer);
    },
  );
const portfolioContract = new Hono().route(
  "/finance/:workspaceId/portfolio",
  portfolio,
);
export type PortfolioAppType = typeof portfolioContract;
export default portfolio;
