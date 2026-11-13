import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { and, asc, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import * as schema from "../../database/schema";
import {
  allowedTypes,
  extensions,
  matchesSignature,
  uploadRoot,
} from "../../finance/attachments";

// Contrato escaneado passa fácil de 10 MB, o limite dos comprovantes.
export const MAX_CONTRACT_DOCUMENT_BYTES = 20 * 1024 * 1024;

const columns = {
  id: schema.crmContractAttachmentTable.id,
  contractId: schema.crmContractAttachmentTable.contractId,
  title: schema.crmContractAttachmentTable.title,
  filename: schema.crmContractAttachmentTable.filename,
  contentType: schema.crmContractAttachmentTable.contentType,
  sizeBytes: schema.crmContractAttachmentTable.sizeBytes,
  createdAt: schema.crmContractAttachmentTable.createdAt,
};

async function contractOrFail(workspaceId: string, contractId: string) {
  const [row] = await db
    .select({ id: schema.crmContractTable.id })
    .from(schema.crmContractTable)
    .where(
      and(
        eq(schema.crmContractTable.id, contractId),
        eq(schema.crmContractTable.workspaceId, workspaceId),
      ),
    );
  if (!row)
    throw new HTTPException(404, { message: "Contrato não encontrado." });
}

export async function addContractDocument(input: {
  workspaceId: string;
  actorUserId: string;
  contractId: string;
  title: string;
  file: File;
}) {
  await contractOrFail(input.workspaceId, input.contractId);
  const title = input.title.trim().slice(0, 120);
  if (!title)
    throw new HTTPException(400, {
      message: "Diga do que se trata o documento.",
    });
  const type = input.file.type.toLowerCase();
  if (!allowedTypes.has(type))
    throw new HTTPException(400, {
      message: "Envie um PDF ou uma imagem do documento.",
    });
  if (input.file.size === 0 || input.file.size > MAX_CONTRACT_DOCUMENT_BYTES)
    throw new HTTPException(400, {
      message: "O documento deve ter até 20 MB.",
    });
  const bytes = Buffer.from(await input.file.arrayBuffer());
  if (!matchesSignature(type, bytes))
    throw new HTTPException(400, {
      message: "O conteúdo do arquivo não corresponde ao tipo informado.",
    });

  const key = `contracts/${input.workspaceId}/${randomUUID()}.${extensions[type]}`;
  const target = path.resolve(uploadRoot(), key);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, bytes);
  const filename =
    input.file.name
      .replace(/[\r\n"\\/]/g, "")
      .trim()
      .slice(0, 200) || `documento.${extensions[type]}`;

  const [row] = await db
    .insert(schema.crmContractAttachmentTable)
    .values({
      workspaceId: input.workspaceId,
      contractId: input.contractId,
      title,
      filename,
      contentType: type,
      sizeBytes: bytes.length,
      storageKey: key,
      uploadedBy: input.actorUserId,
    })
    .returning();
  return row;
}

export async function listContractDocuments(
  workspaceId: string,
  contractId: string,
) {
  return db
    .select({
      ...columns,
      uploadedByName: schema.userTable.name,
    })
    .from(schema.crmContractAttachmentTable)
    .leftJoin(
      schema.userTable,
      eq(schema.crmContractAttachmentTable.uploadedBy, schema.userTable.id),
    )
    .where(
      and(
        eq(schema.crmContractAttachmentTable.workspaceId, workspaceId),
        eq(schema.crmContractAttachmentTable.contractId, contractId),
      ),
    )
    .orderBy(asc(schema.crmContractAttachmentTable.createdAt));
}

/** Documentos de todos os contratos de uma empresa, para a tela do cliente. */
export async function listCompanyContractDocuments(
  workspaceId: string,
  companyId: string,
) {
  return db
    .select(columns)
    .from(schema.crmContractAttachmentTable)
    .innerJoin(
      schema.crmContractTable,
      eq(
        schema.crmContractAttachmentTable.contractId,
        schema.crmContractTable.id,
      ),
    )
    .where(
      and(
        eq(schema.crmContractAttachmentTable.workspaceId, workspaceId),
        eq(schema.crmContractTable.companyId, companyId),
      ),
    )
    .orderBy(asc(schema.crmContractAttachmentTable.createdAt));
}

async function findDocument(workspaceId: string, id: string) {
  const [row] = await db
    .select()
    .from(schema.crmContractAttachmentTable)
    .where(
      and(
        eq(schema.crmContractAttachmentTable.id, id),
        eq(schema.crmContractAttachmentTable.workspaceId, workspaceId),
      ),
    );
  if (!row)
    throw new HTTPException(404, { message: "Documento não encontrado." });
  return row;
}

export async function readContractDocument(workspaceId: string, id: string) {
  const row = await findDocument(workspaceId, id);
  const root = uploadRoot();
  const target = path.resolve(root, row.storageKey);
  if (!target.startsWith(`${root}${path.sep}`))
    throw new HTTPException(400, { message: "Arquivo inválido." });
  try {
    return { row, bytes: await readFile(target) };
  } catch {
    throw new HTTPException(404, {
      message: "O arquivo não está mais no servidor.",
    });
  }
}

export async function removeContractDocument(workspaceId: string, id: string) {
  const row = await findDocument(workspaceId, id);
  await db
    .delete(schema.crmContractAttachmentTable)
    .where(eq(schema.crmContractAttachmentTable.id, id));
  await rm(path.resolve(uploadRoot(), row.storageKey), { force: true });
}
