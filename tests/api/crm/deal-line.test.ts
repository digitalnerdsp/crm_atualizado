import { describe, expect, it } from "vitest";
import {
  computeLineTotalCents,
  sumLineTotals,
} from "../../../apps/api/src/crm/shared/deal-line";

describe("computeLineTotalCents", () => {
  it("multiplies quantity by unit price", () => {
    expect(
      computeLineTotalCents({
        quantity: 3,
        unitPriceCents: 150_000,
        discountPercent: 0,
      }),
    ).toBe(450_000);
  });

  it("applies the discount on the line", () => {
    expect(
      computeLineTotalCents({
        quantity: 1,
        unitPriceCents: 480_000,
        discountPercent: 10,
      }),
    ).toBe(432_000);
  });

  it("rounds to the nearest cent instead of truncating", () => {
    // 3 × 3.333 × 0,9 = 8.999,1 centavos
    expect(
      computeLineTotalCents({
        quantity: 3,
        unitPriceCents: 3_333,
        discountPercent: 10,
      }),
    ).toBe(8_999);
    // 1 × 5 × 0,5 = 2,5 → 3
    expect(
      computeLineTotalCents({
        quantity: 1,
        unitPriceCents: 5,
        discountPercent: 50,
      }),
    ).toBe(3);
  });

  it("gives zero for a full discount", () => {
    expect(
      computeLineTotalCents({
        quantity: 2,
        unitPriceCents: 99_900,
        discountPercent: 100,
      }),
    ).toBe(0);
  });
});

describe("sumLineTotals", () => {
  it("adds the stored totals", () => {
    expect(sumLineTotals([])).toBe(0);
    expect(
      sumLineTotals([{ totalCents: 432_000 }, { totalCents: 150_000 }]),
    ).toBe(582_000);
  });
});
