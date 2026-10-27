import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { describeRoute, validator } from "hono-openapi";
import * as v from "valibot";
import { requireWorkspacePermission } from "../utils/require-workspace-permission";
import {
  addAttachment,
  listAttachments,
  MAX_ATTACHMENT_BYTES,
  readAttachment,
  removeAttachment,
} from "./attachments";

const doc = (operationId: string, description: string) =>
  describeRoute({
    operationId,
    description,
    tags: ["Financeiro"],
    responses: { 200: { description: "Operação concluída" } },
  });
const grant = requireWorkspacePermission({ finance: ["read", "settle"] });
const params = v.object({
  workspaceId: v.string(),
  id: v.pipe(v.string(), v.minLength(1)),
});
const attachments = new Hono<{
  Variables: { userId: string; workspaceId: string };
}>()
  .get(
    "/entries/:id/attachments",
    doc("financeListAttachments", "Comprovantes anexados ao lançamento"),
    validator("param", params),
    async (c) =>
      c.json(
        await listAttachments(c.get("workspaceId"), c.req.valid("param").id),
      ),
  )
  .post(
    "/entries/:id/attachments",
    doc("financeAddAttachment", "Anexar comprovante (imagem ou PDF até 10 MB)"),
    grant,
    validator("param", params),
    async (c) => {
      const declared = Number(c.req.header("content-length") ?? 0);
      if (declared > MAX_ATTACHMENT_BYTES + 1024 * 1024)
        throw new HTTPException(413, {
          message: "O comprovante deve ter até 10 MB.",
        });
      const form = await c.req.formData();
      const file = form.get("file");
      if (!(file instanceof File))
        throw new HTTPException(400, { message: "Selecione um arquivo." });
      const settlementId = form.get("settlementId");
      return c.json(
        await addAttachment({
          workspaceId: c.get("workspaceId"),
          actorUserId: c.get("userId"),
          entryId: c.req.valid("param").id,
          settlementId:
            typeof settlementId === "string" && settlementId
              ? settlementId
              : null,
          file,
        }),
      );
    },
  )
  .get(
    "/attachments/:attachmentId",
    doc("financeDownloadAttachment", "Baixar comprovante"),
    validator(
      "param",
      v.object({ workspaceId: v.string(), attachmentId: v.string() }),
    ),
    async (c) => {
      const { row, bytes } = await readAttachment(
        c.get("workspaceId"),
        c.req.valid("param").attachmentId,
      );
      return c.body(new Uint8Array(bytes), 200, {
        "Content-Type": row.contentType,
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(row.filename)}`,
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "sandbox",
        "Cache-Control": "private, max-age=300",
      });
    },
  )
  .delete(
    "/attachments/:attachmentId",
    doc("financeDeleteAttachment", "Remover comprovante"),
    grant,
    validator(
      "param",
      v.object({ workspaceId: v.string(), attachmentId: v.string() }),
    ),
    async (c) => {
      await removeAttachment(
        c.get("workspaceId"),
        c.req.valid("param").attachmentId,
      );
      return c.json({ ok: true });
    },
  );
export default attachments;
