import { resolveApiBaseUrl } from "@kaneo/libs";
import { checkContractDocument } from "./contract-documents";

// Fora do cliente tipado (ver crm/activity/attachment-routes na API).
const base = () =>
  `${resolveApiBaseUrl(import.meta.env.VITE_API_URL)}/crm/activity`;

async function fail(res: Response): Promise<never> {
  const text = await res.text();
  let message = "Não foi possível concluir a operação.";
  try {
    message = JSON.parse(text).message ?? message;
  } catch {
    // resposta que não é JSON: mantém a mensagem padrão
  }
  throw new Error(message);
}

export async function uploadActivityAttachment(
  workspaceId: string,
  activityId: string,
  file: File,
) {
  checkContractDocument(file);
  const form = new FormData();
  form.set("file", file);
  const res = await fetch(
    `${base()}/${activityId}/attachments?workspaceId=${workspaceId}`,
    { method: "POST", body: form, credentials: "include" },
  );
  if (!res.ok) return fail(res);
}

/** Envia vários arquivos; devolve o nome dos que falharam. */
export async function uploadActivityFiles(
  workspaceId: string,
  activityId: string,
  files: File[],
) {
  const failed: string[] = [];
  for (const file of files) {
    try {
      await uploadActivityAttachment(workspaceId, activityId, file);
    } catch {
      failed.push(file.name);
    }
  }
  return failed;
}

export async function deleteActivityAttachment(
  workspaceId: string,
  attachmentId: string,
) {
  const res = await fetch(
    `${base()}/attachments/${attachmentId}?workspaceId=${workspaceId}`,
    { method: "DELETE", credentials: "include" },
  );
  if (!res.ok) return fail(res);
}

export async function fetchActivityAttachmentBlob(
  workspaceId: string,
  attachmentId: string,
) {
  const res = await fetch(
    `${base()}/attachments/${attachmentId}/file?workspaceId=${workspaceId}`,
    { credentials: "include" },
  );
  if (!res.ok) return fail(res);
  return res.blob();
}
