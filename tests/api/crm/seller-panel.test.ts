import { describe, expect, it } from "vitest";
import {
  commissionFigures,
  lastMonths,
} from "../../../apps/api/src/crm/seller-panel/controller";

const entry = (patch: Record<string, unknown>) =>
  ({
    cancelledAt: null,
    direction: "receivable",
    kind: "operating",
    sellerId: "u1",
    serviceId: "s1",
    commissionBasis: "received",
    commissionRateBps: 1000,
    competenceDate: "2026-10-01",
    dueDate: "2026-10-10",
    amountCents: 100_000,
    settlements: [],
    ...patch,
  }) as never;

describe("painel do vendedor", () => {
  it("lista os últimos seis meses até o atual", () => {
    expect(lastMonths("2026-10-17", 6)).toEqual([
      "2026-05",
      "2026-06",
      "2026-07",
      "2026-08",
      "2026-09",
      "2026-10",
    ]);
    expect(lastMonths("2026-02-03", 3)).toEqual([
      "2025-12",
      "2026-01",
      "2026-02",
    ]);
  });

  it("comissão do mês vem do recebido no mês; previsão, do que vence no seguinte", () => {
    const paidThisMonth = entry({
      settlements: [
        {
          id: "a",
          date: "2026-10-05",
          principalCents: 100_000,
          discountCents: 0,
          interestCents: 0,
          fineCents: 0,
          reversedAt: null,
        },
      ],
    });
    const paidLastMonth = entry({
      dueDate: "2026-09-10",
      settlements: [
        {
          id: "b",
          date: "2026-09-20",
          principalCents: 100_000,
          discountCents: 0,
          interestCents: 0,
          fineCents: 0,
          reversedAt: null,
        },
      ],
    });
    const dueNextMonth = entry({
      dueDate: "2026-11-10",
      amountCents: 200_000,
      commissionRateBps: 500,
    });
    const noRate = entry({ dueDate: "2026-11-15", commissionRateBps: 0 });
    const cancelled = entry({ dueDate: "2026-11-20", cancelledAt: new Date() });
    expect(
      commissionFigures(
        [paidThisMonth, paidLastMonth, dueNextMonth, noRate, cancelled],
        "2026-10-17",
      ),
    ).toEqual({ monthCents: 10_000, forecastCents: 10_000 });
  });
});
