import { describe, expect, it } from "vitest";
import { formatDurationShort, formatTaxId } from "./format";

describe("formatDurationShort", () => {
  it("does not report a whole day for a stage that lasted seconds", () => {
    expect(formatDurationShort(59)).toBe("59s");
    expect(formatDurationShort(1)).toBe("1s");
  });

  it("steps up through minutes, hours and days", () => {
    expect(formatDurationShort(90)).toBe("2min");
    expect(formatDurationShort(3_600)).toBe("1h");
    expect(formatDurationShort(86_400)).toBe("1d");
    expect(formatDurationShort(9 * 86_400)).toBe("9d");
  });

  it("returns null when the stage has not been left yet", () => {
    expect(formatDurationShort(null)).toBeNull();
    expect(formatDurationShort(undefined)).toBeNull();
  });
});

describe("formatTaxId", () => {
  it("masks a CNPJ stored without punctuation", () => {
    expect(formatTaxId("11222333000181")).toBe("11.222.333/0001-81");
  });

  it("masks a CPF", () => {
    expect(formatTaxId("12345678901")).toBe("123.456.789-01");
  });

  it("re-masks input that already carries punctuation", () => {
    expect(formatTaxId("11.222.333/0001-81")).toBe("11.222.333/0001-81");
  });

  it("leaves anything of an unexpected length alone", () => {
    expect(formatTaxId("123")).toBe("123");
    expect(formatTaxId(null)).toBeNull();
    expect(formatTaxId("")).toBeNull();
  });
});
