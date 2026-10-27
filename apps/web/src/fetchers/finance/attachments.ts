import { resolveApiBaseUrl } from "@kaneo/libs";

// Estas rotas ficam fora do cliente tipado (ver finance/index.ts na API).
const base = (workspaceId: string) =>
  `${resolveApiBaseUrl(import.meta.env.VITE_API_URL)}/finance/${workspaceId}`;

export const MAX_ATTACHMENT_MB = 10;
export const ATTACHMENT_ACCEPT = "image/*,application/pdf";

export type FinanceAttachment = {
  id: string;
  entryId: string;
  settlementId: string | null;
  filename: string;
  contentType: string;
  sizeBytes: number;
  createdAt: string;
};

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

export function checkAttachment(file: File) {
  const okType =
    file.type === "application/pdf" || file.type.startsWith("image/");
  if (!okType) throw new Error("Envie uma imagem ou um PDF como comprovante.");
  if (file.size > MAX_ATTACHMENT_MB * 1024 * 1024)
    throw new Error(`O comprovante deve ter até ${MAX_ATTACHMENT_MB} MB.`);
}

export async function listAttachments(workspaceId: string, entryId: string) {
  const res = await fetch(
    `${base(workspaceId)}/entries/${entryId}/attachments`,
    {
      credentials: "include",
    },
  );
  if (!res.ok) return fail(res);
  return (await res.json()) as FinanceAttachment[];
}

export async function uploadAttachment(
  workspaceId: string,
  entryId: string,
  file: File,
  settlementId?: string,
) {
  checkAttachment(file);
  const form = new FormData();
  form.set("file", file);
  if (settlementId) form.set("settlementId", settlementId);
  const res = await fetch(
    `${base(workspaceId)}/entries/${entryId}/attachments`,
    {
      method: "POST",
      body: form,
      credentials: "include",
    },
  );
  if (!res.ok) return fail(res);
  return (await res.json()) as FinanceAttachment;
}

export async function deleteAttachment(workspaceId: string, id: string) {
  const res = await fetch(`${base(workspaceId)}/attachments/${id}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) return fail(res);
}

// O arquivo só é entregue com sessão; abre numa nova aba via blob.
export async function openAttachment(workspaceId: string, id: string) {
  const res = await fetch(`${base(workspaceId)}/attachments/${id}`, {
    credentials: "include",
  });
  if (!res.ok) return fail(res);
  const url = URL.createObjectURL(await res.blob());
  window.open(url, "_blank", "noopener");
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
