import { resolveApiBaseUrl } from "@kaneo/libs";

// Estas rotas ficam fora do cliente tipado (ver crm/contract/attachment-routes
// na API), então usam fetch como os comprovantes do financeiro.
const base = () => `${resolveApiBaseUrl(import.meta.env.VITE_API_URL)}/crm`;

export const MAX_CONTRACT_DOCUMENT_MB = 20;
export const CONTRACT_DOCUMENT_ACCEPT = "application/pdf,image/*";

export type ContractDocument = {
  id: string;
  contractId: string;
  title: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  createdAt: string;
  uploadedByName?: string | null;
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

export function checkContractDocument(file: File) {
  const okType =
    file.type === "application/pdf" || file.type.startsWith("image/");
  if (!okType) throw new Error("Envie um PDF ou uma imagem do documento.");
  if (file.size > MAX_CONTRACT_DOCUMENT_MB * 1024 * 1024)
    throw new Error(`O documento deve ter até ${MAX_CONTRACT_DOCUMENT_MB} MB.`);
}

export async function listContractDocuments(
  workspaceId: string,
  contractId: string,
) {
  const res = await fetch(
    `${base()}/contract/${contractId}/documents?workspaceId=${workspaceId}`,
    { credentials: "include" },
  );
  if (!res.ok) return fail(res);
  return (await res.json()) as ContractDocument[];
}

export async function listCompanyContractDocuments(
  workspaceId: string,
  companyId: string,
) {
  const res = await fetch(
    `${base()}/company/${companyId}/contract-documents?workspaceId=${workspaceId}`,
    { credentials: "include" },
  );
  if (!res.ok) return fail(res);
  return (await res.json()) as ContractDocument[];
}

export async function uploadContractDocument(
  workspaceId: string,
  contractId: string,
  file: File,
  title: string,
) {
  checkContractDocument(file);
  const form = new FormData();
  form.set("file", file);
  form.set("title", title);
  const res = await fetch(
    `${base()}/contract/${contractId}/documents?workspaceId=${workspaceId}`,
    { method: "POST", body: form, credentials: "include" },
  );
  if (!res.ok) return fail(res);
  return (await res.json()) as ContractDocument;
}

export async function deleteContractDocument(
  workspaceId: string,
  documentId: string,
) {
  const res = await fetch(
    `${base()}/contract/documents/${documentId}?workspaceId=${workspaceId}`,
    { method: "DELETE", credentials: "include" },
  );
  if (!res.ok) return fail(res);
}

// O arquivo só é entregue com sessão: busca como blob para mostrar na tela.
export async function fetchContractDocumentBlob(
  workspaceId: string,
  documentId: string,
) {
  const res = await fetch(
    `${base()}/contract/documents/${documentId}/file?workspaceId=${workspaceId}`,
    { credentials: "include" },
  );
  if (!res.ok) return fail(res);
  return res.blob();
}
