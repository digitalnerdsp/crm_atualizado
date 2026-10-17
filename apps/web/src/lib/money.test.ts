import { describe, expect, it } from "vitest";
import { formatMoney, formatMoneyCompact, parseMoneyToCents } from "./money";

describe("parseMoneyToCents", () => {
  it("reads Brazilian input, with or without a thousands separator", () => {
    expect(parseMoneyToCents("15.750,00")).toBe(1_575_000);
    expect(parseMoneyToCents("15750,00")).toBe(1_575_000);
    expect(parseMoneyToCents("1.234.567,89")).toBe(123_456_789);
    expect(parseMoneyToCents("48,5")).toBe(4_850);
    expect(parseMoneyToCents("100")).toBe(10_000);
  });

  it("tolerates currency symbols and stray spacing", () => {
    expect(parseMoneyToCents("R$ 2.500,00")).toBe(250_000);
    expect(parseMoneyToCents("  980,50  ")).toBe(98_050);
  });

  it("returns zero rather than NaN for unusable input", () => {
    expect(parseMoneyToCents("")).toBe(0);
    expect(parseMoneyToCents("abc")).toBe(0);
  });

  it("rounds to whole cents so nothing is lost on the way to the API", () => {
    expect(parseMoneyToCents("0,015")).toBe(2);
    expect(parseMoneyToCents("10,004")).toBe(1_000);
  });
});

describe("formatMoney", () => {
  it("formats cents as BRL by default", () => {
    // Intl uses a narrow no-break space, so compare on the digits.
    expect(formatMoney(4_850_000).replace(/\s/g, " ")).toBe("R$ 48.500,00");
    expect(formatMoney(0).replace(/\s/g, " ")).toBe("R$ 0,00");
  });

  it("keeps a value beyond the 32-bit range exact", () => {
    // 2.5 billion reais — the reason value_cents is a bigint.
    expect(formatMoney(250_000_000_000).replace(/\s/g, " ")).toBe(
      "R$ 2.500.000.000,00",
    );
  });

  it("honours a different currency", () => {
    expect(formatMoney(10_000, "USD")).toContain("100,00");
  });
});

describe("formatMoneyCompact", () => {
  it("shortens large amounts for column headers", () => {
    expect(formatMoneyCompact(24_500_000)).toContain("245");
    expect(formatMoneyCompact(4_850_000)).toContain("48,5");
  });
});
