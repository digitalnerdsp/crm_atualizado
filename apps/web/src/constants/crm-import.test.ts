import { describe, expect, it } from "vitest";
import { guessImportMapping } from "./crm-import";

/** Rótulos como a tela em português os mostra. */
const label = (field: string) =>
  (
    ({
      name: "Nome",
      legalName: "Razão social",
      taxId: "CNPJ/CPF",
      city: "Cidade",
      email: "E-mail",
      firstName: "Nome",
      phone: "Telefone",
    }) as Record<string, string>
  )[field] ?? field;

describe("guessImportMapping", () => {
  it("links the columns a real spreadsheet has, accents and all", () => {
    const mapping = guessImportMapping(
      ["Nome", "Razão Social", "CNPJ/CPF", "CIDADE", "coluna solta"],
      "company",
      label,
    );

    expect(mapping).toEqual({
      Nome: "name",
      "Razão Social": "legalName",
      "CNPJ/CPF": "taxId",
      CIDADE: "city",
    });
  });

  it("links by the field name too, for a file exported from the system", () => {
    const mapping = guessImportMapping(
      ["firstName", "email"],
      "contact",
      label,
    );
    expect(mapping).toEqual({ firstName: "firstName", email: "email" });
  });

  it("never gives one field to two columns", () => {
    const mapping = guessImportMapping(
      ["Telefone", "telefone"],
      "contact",
      label,
    );

    expect(Object.values(mapping)).toEqual(["phone"]);
  });
});
