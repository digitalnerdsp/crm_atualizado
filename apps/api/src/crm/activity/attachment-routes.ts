import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { describeRoute, validator } from "hono-openapi";
import * as v from "valibot";
import { requireWorkspacePermission } from "../../utils/require-workspace-permission";
import { workspaceAccess } from "../../utils/workspace-access-middleware";
import { MAX_CRM_FILE_BYTES } from "../shared/store-upload";
import {
  addActivityAttachment,
  readActivityAttachment,
  removeActivityAttachment,
} from "./attachments";

type Vars = { Variables: { userId: string; workspaceId: string } };

const doc = (operationId: string, description: string) =>
  describeRoute({
    operationId,
    description,
    tags: ["CRM"],
    responses: { 200: { description: "Operação concluída" } },
  });
const query = validator("query", v.object({ workspaceId: v.string() }));

// Fora da cadeia tipada de `activity`: o front usa fetch (multipart e arquivo).
export const activityAttachments = new Hono<Vars>()
  .post(
    "/:activityId/attachments",
    doc("addCrmActivityAttachment", "Anexar imagem ou PDF (até 20 MB)"),
    validator("param", v.object({ activityId: v.string() })),
    query,
    workspaceAccess.fromQuery(),
    requireWorkspacePermission({ crmDeal: ["update"] }),
    async (c) => {
      const declared = Number(c.req.header("content-length") ?? 0);
      if (declared > MAX_CRM_FILE_BYTES + 1024 * 1024)
        throw new HTTPException(413, {
          message: "O arquivo deve ter até 20 MB.",
        });
      const file = (await c.req.formData()).get("file");
      if (!(file instanceof File))
        throw new HTTPException(400, { message: "Selecione um arquivo." });
      return c.json(
        await addActivityAttachment({
          workspaceId: c.get("workspaceId"),
          actorUserId: c.get("userId"),
          activityId: c.req.valid("param").activityId,
          file,
        }),
      );
    },
  )
  .get(
    "/attachments/:attachmentId/file",
    doc("downloadCrmActivityAttachment", "Abrir o arquivo anexado"),
    validator("param", v.object({ attachmentId: v.string() })),
    query,
    workspaceAccess.fromQuery(),
    requireWorkspacePermission({ crmDeal: ["read"] }),
    async (c) => {
      const { row, bytes } = await readActivityAttachment(
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
    doc("deleteCrmActivityAttachment", "Remover anexo da atividade"),
    validator("param", v.object({ attachmentId: v.string() })),
    query,
    workspaceAccess.fromQuery(),
    requireWorkspacePermission({ crmDeal: ["update"] }),
    async (c) => {
      await removeActivityAttachment(
        c.get("workspaceId"),
        c.req.valid("param").attachmentId,
      );
      return c.json({ ok: true });
    },
  );
