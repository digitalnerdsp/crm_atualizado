import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { describeRoute, validator } from "hono-openapi";
import * as v from "valibot";
import { requireWorkspacePermission } from "../../utils/require-workspace-permission";
import { workspaceAccess } from "../../utils/workspace-access-middleware";
import {
  addContractDocument,
  listCompanyContractDocuments,
  listContractDocuments,
  MAX_CONTRACT_DOCUMENT_BYTES,
  readContractDocument,
  removeContractDocument,
} from "./attachments";

const doc = (operationId: string, description: string) =>
  describeRoute({
    operationId,
    description,
    tags: ["CRM"],
    responses: { 200: { description: "Operação concluída" } },
  });
const query = validator("query", v.object({ workspaceId: v.string() }));
type Vars = { Variables: { userId: string; workspaceId: string } };

// Ficam fora da cadeia tipada de `contract`, como os comprovantes do
// financeiro: o front usa fetch para estas rotas.
export const contractDocuments = new Hono<Vars>()
  .get(
    "/:contractId/documents",
    doc("listCrmContractDocuments", "Documentos anexados ao contrato"),
    validator("param", v.object({ contractId: v.string() })),
    query,
    workspaceAccess.fromQuery(),
    requireWorkspacePermission({ crmDeal: ["read"] }),
    async (c) =>
      c.json(
        await listContractDocuments(
          c.get("workspaceId"),
          c.req.valid("param").contractId,
        ),
      ),
  )
  .post(
    "/:contractId/documents",
    doc("addCrmContractDocument", "Anexar documento (PDF ou imagem até 20 MB)"),
    validator("param", v.object({ contractId: v.string() })),
    query,
    workspaceAccess.fromQuery(),
    requireWorkspacePermission({ crmDeal: ["update"] }),
    async (c) => {
      const declared = Number(c.req.header("content-length") ?? 0);
      if (declared > MAX_CONTRACT_DOCUMENT_BYTES + 1024 * 1024)
        throw new HTTPException(413, {
          message: "O documento deve ter até 20 MB.",
        });
      const form = await c.req.formData();
      const file = form.get("file");
      if (!(file instanceof File))
        throw new HTTPException(400, { message: "Selecione um arquivo." });
      const title = form.get("title");
      return c.json(
        await addContractDocument({
          workspaceId: c.get("workspaceId"),
          actorUserId: c.get("userId"),
          contractId: c.req.valid("param").contractId,
          title: typeof title === "string" ? title : "",
          file,
        }),
      );
    },
  )
  .get(
    "/documents/:documentId/file",
    doc("downloadCrmContractDocument", "Abrir o arquivo do documento"),
    validator("param", v.object({ documentId: v.string() })),
    query,
    workspaceAccess.fromQuery(),
    requireWorkspacePermission({ crmDeal: ["read"] }),
    async (c) => {
      const { row, bytes } = await readContractDocument(
        c.get("workspaceId"),
        c.req.valid("param").documentId,
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
    "/documents/:documentId",
    doc("deleteCrmContractDocument", "Remover documento do contrato"),
    validator("param", v.object({ documentId: v.string() })),
    query,
    workspaceAccess.fromQuery(),
    requireWorkspacePermission({ crmDeal: ["update"] }),
    async (c) => {
      await removeContractDocument(
        c.get("workspaceId"),
        c.req.valid("param").documentId,
      );
      return c.json({ ok: true });
    },
  );

export const companyContractDocuments = new Hono<Vars>().get(
  "/:companyId/contract-documents",
  doc(
    "listCrmCompanyContractDocuments",
    "Documentos dos contratos de uma empresa",
  ),
  validator("param", v.object({ companyId: v.string() })),
  query,
  workspaceAccess.fromQuery(),
  requireWorkspacePermission({ crmCompany: ["read"] }),
  async (c) =>
    c.json(
      await listCompanyContractDocuments(
        c.get("workspaceId"),
        c.req.valid("param").companyId,
      ),
    ),
);
