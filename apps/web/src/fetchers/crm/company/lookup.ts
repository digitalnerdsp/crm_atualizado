import { client } from "@kaneo/libs";

async function unwrap<T>(response: {
  ok: boolean;
  text: () => Promise<string>;
  json: () => Promise<T>;
}) {
  if (response.ok) return response.json();
  const body = await response.text();
  try {
    const message = (JSON.parse(body) as { message?: string }).message;
    throw new Error(message ?? "Consulta indisponível");
  } catch (error) {
    if (error instanceof Error && error.message !== "Consulta indisponível")
      throw error;
    throw new Error("Consulta indisponível");
  }
}

export async function lookupCompanyCnpj(workspaceId: string, cnpj: string) {
  return unwrap(
    await client.crm.company.lookup.cnpj.$get({ query: { workspaceId, cnpj } }),
  );
}

export async function lookupCompanyCep(workspaceId: string, cep: string) {
  return unwrap(
    await client.crm.company.lookup.cep.$get({ query: { workspaceId, cep } }),
  );
}
