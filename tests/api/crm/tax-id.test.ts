import { describe, expect, it } from "vitest";
import {
  formatTaxId,
  isValidCnpj,
  isValidCpf,
  isValidTaxId,
  stripTaxId,
} from "../../../apps/api/src/crm/shared/tax-id";

describe("stripTaxId", () => {
  it("keeps only the digits", () => {
    expect(stripTaxId("12.345.678/0001-95")).toBe("12345678000195");
    expect(stripTaxId(" 529.982.247-25 ")).toBe("52998224725");
    expect(stripTaxId("abc")).toBe("");
  });
});

describe("isValidCpf", () => {
  it("accepts a CPF whose check digits close", () => {
    expect(isValidCpf("529.982.247-25")).toBe(true);
    expect(isValidCpf("52998224725")).toBe(true);
  });

  it("rejects a wrong check digit", () => {
    expect(isValidCpf("529.982.247-26")).toBe(false);
  });

  it("rejects repeated digits, which pass the arithmetic but do not exist", () => {
    expect(isValidCpf("111.111.111-11")).toBe(false);
    expect(isValidCpf("00000000000")).toBe(false);
  });

  it("rejects the wrong length", () => {
    expect(isValidCpf("5299822472")).toBe(false);
    expect(isValidCpf("12345678000195")).toBe(false);
  });
});

describe("isValidCnpj", () => {
  it("accepts a CNPJ whose check digits close", () => {
    expect(isValidCnpj("11.222.333/0001-81")).toBe(true);
    expect(isValidCnpj("11222333000181")).toBe(true);
  });

  it("rejects a wrong check digit", () => {
    expect(isValidCnpj("11.222.333/0001-82")).toBe(false);
  });

  it("rejects repeated digits", () => {
    expect(isValidCnpj("11.111.111/1111-11")).toBe(false);
  });

  it("rejects the wrong length", () => {
    expect(isValidCnpj("52998224725")).toBe(false);
  });
});

describe("isValidTaxId", () => {
  it("validates against the person type, not the length alone", () => {
    expect(isValidTaxId("pf", "529.982.247-25")).toBe(true);
    // Um CNPJ válido não é um CPF válido.
    expect(isValidTaxId("pf", "11222333000181")).toBe(false);
    expect(isValidTaxId("pj", "11222333000181")).toBe(true);
    expect(isValidTaxId("pj", "52998224725")).toBe(false);
  });

  it("accepts an empty document: cadastro travado é cadastro não preenchido", () => {
    expect(isValidTaxId("pj", null)).toBe(true);
    expect(isValidTaxId("pj", undefined)).toBe(true);
    expect(isValidTaxId("pj", "")).toBe(true);
    expect(isValidTaxId("pf", "   ")).toBe(true);
  });
});

describe("formatTaxId", () => {
  it("masks by length and leaves anything else alone", () => {
    expect(formatTaxId("11222333000181")).toBe("11.222.333/0001-81");
    expect(formatTaxId("52998224725")).toBe("529.982.247-25");
    expect(formatTaxId("123")).toBe("123");
    expect(formatTaxId(null)).toBe("");
  });
});
