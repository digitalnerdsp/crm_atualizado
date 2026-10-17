import { describe, expect, it } from "vitest";
import {
  parseDate,
  parseMoneyCents,
  parsePersonType,
  parseState,
  parseStatus,
  parseTaxId,
} from "../../../apps/api/src/crm/import/controllers/fields";

describe("parseMoneyCents", () => {
  it("reads what a Brazilian spreadsheet writes", () => {
    expect(parseMoneyCents("R$ 1.234,56")).toBe(123_456);
    expect(parseMoneyCents("1.234,56")).toBe(123_456);
    expect(parseMoneyCents("2500")).toBe(250_000);
    // Ponto de milhar sem decimais: 1.234 é mil duzentos e trinta e quatro.
    expect(parseMoneyCents("1.234")).toBe(123_400);
  });

  it("reads the other convention too", () => {
    expect(parseMoneyCents("1234.56")).toBe(123_456);
  });

  it("gives nothing for an empty or unreadable cell", () => {
    expect(parseMoneyCents("")).toBeNull();
    expect(parseMoneyCents(undefined)).toBeNull();
    expect(parseMoneyCents("a combinar")).toBeNull();
  });
});

describe("parseDate", () => {
  it("reads dd/mm/yyyy without sliding a day", () => {
    const date = parseDate("05/08/2026");
    expect(date?.getFullYear()).toBe(2026);
    expect(date?.getMonth()).toBe(7);
    expect(date?.getDate()).toBe(5);
  });

  it("reads ISO and refuses nonsense", () => {
    expect(parseDate("2026-08-05")?.getUTCFullYear()).toBe(2026);
    expect(parseDate("qualquer coisa")).toBeNull();
  });
});

describe("parsePersonType", () => {
  it("uses the column when there is one", () => {
    expect(parsePersonType("PF", null)).toBe("pf");
    expect(parsePersonType("Pessoa Física", null)).toBe("pf");
    expect(parsePersonType("jurídica", null)).toBe("pj");
  });

  it("falls back to the document length", () => {
    expect(parsePersonType(undefined, "529.982.247-25")).toBe("pf");
    expect(parsePersonType(undefined, "11222333000181")).toBe("pj");
    expect(parsePersonType(undefined, null)).toBe("pj");
  });
});

describe("parseTaxId", () => {
  it("keeps only the digits of a valid document", () => {
    expect(parseTaxId("11.222.333/0001-81", "pj")).toEqual({
      taxId: "11222333000181",
      warning: null,
    });
  });

  it("warns and imports without it instead of rejecting the row", () => {
    const result = parseTaxId("11.222.333/0001-82", "pj");
    expect(result.taxId).toBeNull();
    expect(result.warning).toContain("inválido");
  });
});

describe("parseStatus and parseState", () => {
  it("reads the words a team actually types", () => {
    expect(parseStatus("Cliente")).toBe("active");
    expect(parseStatus("churn")).toBe("churned");
    expect(parseStatus("qualquer")).toBeNull();
  });

  it("only takes the 27 units of the federation", () => {
    expect(parseState("sp")).toBe("SP");
    expect(parseState("XX")).toBeNull();
  });
});
