import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { and, asc, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../database";
import * as schema from "../database/schema";

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

const allowedTypes = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
  "image/avif",
]);
const extensions: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/heic": "heic",
  "image/heif": "heif",
  "image/avif": "avif",
};

function uploadRoot() {
  return path.resolve(
    process.env.LOCAL_UPLOAD_DIR?.trim() ||
      process.env.FILES_UPLOAD_DIR?.trim() ||
      "data/uploads",
  );
}

// O tipo declarado pelo navegador não basta: confere os primeiros bytes dos
// formatos mais comuns para não aceitar outro conteúdo com extensão trocada.
function matchesSignature(type: string, bytes: Buffer) {
  const starts = (sig: number[], offset = 0) =>
    sig.every((b, i) => bytes[offset + i] === b);
  if (type === "application/pdf") return starts([0x25, 0x50, 0x44, 0x46]);
  if (type === "image/png") return starts([0x89, 0x50, 0x4e, 0x47]);
  if (type === "image/jpeg") return starts([0xff, 0xd8, 0xff]);
  if (type === "image/gif") return starts([0x47, 0x49, 0x46, 0x38]);
  if (type === "image/webp")
    return starts([0x52, 0x49, 0x46, 0x46]) && starts([0x57, 0x45, 0x42], 8);
  return true;
}

async function entryOrFail(workspaceId: string, entryId: string) {
  const [row] = await db
    .select({ id: schema.financeEntryTable.id })
    .from(schema.financeEntryTable)
    .where(
      and(
        eq(schema.financeEntryTable.id, entryId),
        eq(schema.financeEntryTable.workspaceId, workspaceId),
      ),
    );
  if (!row)
    throw new HTTPException(404, { message: "Lançamento não encontrado." });
}

export async function addAttachment(input: {
  workspaceId: string;
  actorUserId: string;
  entryId: string;
  settlementId: string | null;
  file: File;
}) {
  await entryOrFail(input.workspaceId, input.entryId);
  const type = input.file.type.toLowerCase();
  if (!allowedTypes.has(type))
    throw new HTTPException(400, {
      message: "Envie uma imagem ou um PDF como comprovante.",
    });
  if (input.file.size === 0 || input.file.size > MAX_ATTACHMENT_BYTES)
    throw new HTTPException(400, {
      message: "O comprovante deve ter até 10 MB.",
    });
  if (input.settlementId) {
    const [s] = await db
      .select({ id: schema.financeSettlementTable.id })
      .from(schema.financeSettlementTable)
      .where(
        and(
          eq(schema.financeSettlementTable.id, input.settlementId),
          eq(schema.financeSettlementTable.entryId, input.entryId),
        ),
      );
    if (!s) throw new HTTPException(400, { message: "Baixa não encontrada." });
  }
  const bytes = Buffer.from(await input.file.arrayBuffer());
  if (!matchesSignature(type, bytes))
    throw new HTTPException(400, {
      message: "O conteúdo do arquivo não corresponde ao tipo informado.",
    });
  const key = `finance/${input.workspaceId}/${randomUUID()}.${extensions[type]}`;
  const target = path.resolve(uploadRoot(), key);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, bytes);
  const filename =
    input.file.name
      .replace(/[\r\n"\\/]/g, "")
      .trim()
      .slice(0, 200) || `comprovante.${extensions[type]}`;
  const [row] = await db
    .insert(schema.financeAttachmentTable)
    .values({
      workspaceId: input.workspaceId,
      entryId: input.entryId,
      settlementId: input.settlementId,
      filename,
      contentType: type,
      sizeBytes: bytes.length,
      storageKey: key,
      uploadedBy: input.actorUserId,
    })
    .returning();
  return row;
}

export async function listAttachments(workspaceId: string, entryId: string) {
  return db
    .select({
      id: schema.financeAttachmentTable.id,
      entryId: schema.financeAttachmentTable.entryId,
      settlementId: schema.financeAttachmentTable.settlementId,
      filename: schema.financeAttachmentTable.filename,
      contentType: schema.financeAttachmentTable.contentType,
      sizeBytes: schema.financeAttachmentTable.sizeBytes,
      createdAt: schema.financeAttachmentTable.createdAt,
    })
    .from(schema.financeAttachmentTable)
    .where(
      and(
        eq(schema.financeAttachmentTable.workspaceId, workspaceId),
        eq(schema.financeAttachmentTable.entryId, entryId),
      ),
    )
    .orderBy(asc(schema.financeAttachmentTable.createdAt));
}

async function findAttachment(workspaceId: string, id: string) {
  const [row] = await db
    .select()
    .from(schema.financeAttachmentTable)
    .where(
      and(
        eq(schema.financeAttachmentTable.id, id),
        eq(schema.financeAttachmentTable.workspaceId, workspaceId),
      ),
    );
  if (!row)
    throw new HTTPException(404, { message: "Comprovante não encontrado." });
  return row;
}

export async function readAttachment(workspaceId: string, id: string) {
  const row = await findAttachment(workspaceId, id);
  const root = uploadRoot();
  const target = path.resolve(root, row.storageKey);
  if (!target.startsWith(`${root}${path.sep}`))
    throw new HTTPException(400, { message: "Arquivo inválido." });
  try {
    return { row, bytes: await readFile(target) };
  } catch {
    throw new HTTPException(404, {
      message: "O arquivo do comprovante não está mais no servidor.",
    });
  }
}

export async function removeAttachment(workspaceId: string, id: string) {
  const row = await findAttachment(workspaceId, id);
  await db
    .delete(schema.financeAttachmentTable)
    .where(eq(schema.financeAttachmentTable.id, id));
  await rm(path.resolve(uploadRoot(), row.storageKey), { force: true });
}
