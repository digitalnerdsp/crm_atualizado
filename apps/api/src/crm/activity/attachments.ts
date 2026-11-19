import { and, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import * as schema from "../../database/schema";
import {
  readCrmFile,
  removeCrmFile,
  storeCrmFile,
} from "../shared/store-upload";

async function activityOrFail(workspaceId: string, activityId: string) {
  const [row] = await db
    .select({ id: schema.crmActivityTable.id })
    .from(schema.crmActivityTable)
    .where(
      and(
        eq(schema.crmActivityTable.id, activityId),
        eq(schema.crmActivityTable.workspaceId, workspaceId),
      ),
    );
  if (!row)
    throw new HTTPException(404, { message: "Atividade não encontrada." });
}

export async function addActivityAttachment(input: {
  workspaceId: string;
  actorUserId: string;
  activityId: string;
  file: File;
}) {
  await activityOrFail(input.workspaceId, input.activityId);
  const stored = await storeCrmFile({
    workspaceId: input.workspaceId,
    folder: "activities",
    file: input.file,
  });
  const [row] = await db
    .insert(schema.crmActivityAttachmentTable)
    .values({
      workspaceId: input.workspaceId,
      activityId: input.activityId,
      uploadedBy: input.actorUserId,
      ...stored,
    })
    .returning({
      id: schema.crmActivityAttachmentTable.id,
      filename: schema.crmActivityAttachmentTable.filename,
      contentType: schema.crmActivityAttachmentTable.contentType,
      sizeBytes: schema.crmActivityAttachmentTable.sizeBytes,
    });
  return row;
}

async function findAttachment(workspaceId: string, id: string) {
  const [row] = await db
    .select()
    .from(schema.crmActivityAttachmentTable)
    .where(
      and(
        eq(schema.crmActivityAttachmentTable.id, id),
        eq(schema.crmActivityAttachmentTable.workspaceId, workspaceId),
      ),
    );
  if (!row) throw new HTTPException(404, { message: "Anexo não encontrado." });
  return row;
}

export async function readActivityAttachment(workspaceId: string, id: string) {
  const row = await findAttachment(workspaceId, id);
  return { row, bytes: await readCrmFile(row.storageKey) };
}

export async function removeActivityAttachment(
  workspaceId: string,
  id: string,
) {
  const row = await findAttachment(workspaceId, id);
  await db
    .delete(schema.crmActivityAttachmentTable)
    .where(eq(schema.crmActivityAttachmentTable.id, id));
  await removeCrmFile(row.storageKey);
}
