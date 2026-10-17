import type { ImportEntity } from "@/fetchers/crm/import";

/** Espelha `IMPORT_FIELDS` da API. A lista é curta e estável; buscá-la por
 * rede só para desenhar os selects adiaria a tela sem ganho. */
export const IMPORT_FIELDS: Record<ImportEntity, string[]> = {
  company: [
    "name",
    "legalName",
    "taxId",
    "personType",
    "phone",
    "domain",
    "website",
    "billingEmail",
    "segment",
    "source",
    "status",
    "clientSince",
    "addressLine",
    "addressNumber",
    "district",
    "city",
    "state",
    "postalCode",
    "description",
  ],
  contact: [
    "firstName",
    "lastName",
    "email",
    "phone",
    "mobile",
    "jobTitle",
    "company",
    "notes",
  ],
  deal: [
    "title",
    "company",
    "value",
    "stage",
    "source",
    "ownerEmail",
    "expectedCloseDate",
  ],
};

export const IMPORT_REQUIRED_FIELD: Record<ImportEntity, string> = {
  company: "name",
  contact: "firstName",
  deal: "title",
};

/** Acentos, espaços e maiúsculas fora, para "Razão Social" achar `legalName`. */
function slug(value: string) {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Liga cada coluna ao campo de nome parecido, pelo nome do campo ou pelo
 * rótulo traduzido. Acerta "Nome", "CNPJ", "Cidade" e "E-mail" sem ninguém
 * escolher nada — que são quase todas as colunas de quase toda planilha.
 *
 * Um campo é usado uma vez só: duas colunas chamadas "Telefone" não podem
 * virar o mesmo campo, senão a segunda sobrescreve a primeira em silêncio.
 */
export function guessImportMapping(
  headers: ReadonlyArray<string>,
  entity: ImportEntity,
  label: (field: string) => string,
) {
  const mapping: Record<string, string> = {};
  const taken = new Set<string>();

  for (const header of headers) {
    const key = slug(header);
    if (!key) continue;

    const match = IMPORT_FIELDS[entity].find(
      (field) =>
        !taken.has(field) &&
        (slug(field) === key || slug(label(field)) === key),
    );

    if (match) {
      mapping[header] = match;
      taken.add(match);
    }
  }

  return mapping;
}
