import { describe, expect, it } from "vitest";
import {
  isRecurring,
  monthlyEquivalentCents,
  sumMonthlyEquivalents,
} from "../../../apps/api/src/crm/shared/contract-value";

describe("monthlyEquivalentCents", () => {
  it("spreads quarterly and yearly cycles across their months", () => {
    expect(monthlyEquivalentCents(250_000, "monthly")).toBe(250_000);
    expect(monthlyEquivalentCents(900_000, "quarterly")).toBe(300_000);
    expect(monthlyEquivalentCents(1_200_000, "yearly")).toBe(100_000);
  });

  it("rounds to the nearest cent", () => {
    // R$ 1.000 por trimestre = R$ 333,33 por mês
    expect(monthlyEquivalentCents(100_000, "quarterly")).toBe(33_333);
  });
});

describe("sumMonthlyEquivalents", () => {
  it("ignores one-time lines: a setup fee is not recurring revenue", () => {
    expect(
      sumMonthlyEquivalents([
        { totalCents: 250_000, billingType: "monthly" },
        { totalCents: 1_200_000, billingType: "yearly" },
        { totalCents: 500_000, billingType: "one_time" },
      ]),
    ).toBe(350_000);
  });
});

describe("isRecurring", () => {
  it("is false only for one-time billing", () => {
    expect(isRecurring("one_time")).toBe(false);
    expect(isRecurring("monthly")).toBe(true);
    expect(isRecurring("quarterly")).toBe(true);
    expect(isRecurring("yearly")).toBe(true);
  });
});
