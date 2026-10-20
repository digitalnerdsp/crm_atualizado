import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { describeRoute, validator } from "hono-openapi";
import * as v from "valibot";
import { requireWorkspacePermission } from "../../utils/require-workspace-permission";
import * as ctl from "./controller";
import { excelBi, pdfBi } from "./export";
import { filters, metric, page } from "./validation";

const doc = (operationId: string, description: string) =>
  describeRoute({
    operationId,
    description,
    tags: ["BI financeiro"],
    responses: { 200: { description: "Consulta concluída" } },
  });
const bi = new Hono<{ Variables: { userId: string; workspaceId: string } }>()
  .get(
    "/report",
    doc(
      "financeBiReport",
      "Dashboard consolidado, comparativos, projeções e alertas",
    ),
    validator("query", filters),
    async (c) => {
      c.header("Cache-Control", "private, no-store");
      return c.json(
        await ctl.report(c.get("workspaceId"), c.req.valid("query")),
      );
    },
  )
  .get(
    "/details/:metric",
    doc("financeBiDetails", "Composição paginada de um indicador"),
    validator("param", v.object({ metric })),
    validator("query", filters),
    async (c) => {
      const parsed = v.safeParse(page, c.req.query("page"));
      if (!parsed.success)
        throw new HTTPException(400, { message: "Página inválida." });
      const horizon = v.safeParse(
        v.optional(v.picklist(["30", "60", "90"]), "90"),
        c.req.query("days"),
      );
      if (!horizon.success)
        throw new HTTPException(400, { message: "Horizonte inválido." });
      const p = parsed.output;
      c.header("Cache-Control", "private, no-store");
      return c.json(
        await ctl.detail(
          c.get("workspaceId"),
          c.req.valid("query"),
          c.req.valid("param").metric,
          p,
          Number(horizon.output),
        ),
      );
    },
  )
  .get(
    "/export/:format",
    doc(
      "financeBiExport",
      "Exportar BI e composição em Excel ou PDF executivo",
    ),
    requireWorkspacePermission({ finance: ["read", "export"] }),
    validator("param", v.object({ format: v.picklist(["xlsx", "pdf"]) })),
    validator("query", filters),
    async (c) => {
      const r = await ctl.fullReport(
        c.get("workspaceId"),
        c.req.valid("query"),
      );
      const format = c.req.valid("param").format;
      const bytes = await (format === "xlsx" ? excelBi : pdfBi)(r);
      c.header(
        "Content-Type",
        format === "xlsx"
          ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          : "application/pdf",
      );
      c.header(
        "Content-Disposition",
        `attachment; filename="bi-financeiro.${format}"`,
      );
      c.header("Cache-Control", "no-store");
      return c.body(new Uint8Array(bytes).buffer);
    },
  );
export default bi;
