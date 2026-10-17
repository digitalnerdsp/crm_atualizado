import { describe, expect, it } from "vitest";
import type { Entry, Settlement } from "../../../apps/api/src/finance/model";
import {
  earned,
  percentage,
  performanceReport,
} from "../../../apps/api/src/finance/performance/model";

const settlement = (patch: Partial<Settlement> = {}): Settlement => ({
  id: "s",
  date: "2026-10-05",
  principalCents: 4000,
  discountCents: 200,
  interestCents: 100,
  fineCents: 50,
  reversedAt: null,
  createdAt: "2026-10-05",
  notes: "",
  reverseReason: null,
  ...patch,
});
const entry = (patch: Partial<Entry> = {}): Entry => ({
  id: "e",
  description: "Serviço",
  direction: "receivable",
  kind: "operating",
  amountCents: 10000,
  competenceDate: "2026-10-01",
  dueDate: "2026-10-10",
  categoryId: "sub",
  parentCategoryId: "category",
  categoryName: "Serviços",
  partyId: null,
  partyName: "Cliente",
  laborType: null,
  companyId: "co",
  companyName: "Cliente",
  serviceId: "sv",
  serviceName: "Site",
  sellerId: "seller",
  sellerName: "Vendedor",
  paymentMethod: "pix",
  notes: "",
  installment: 1,
  installmentCount: 1,
  cancelledAt: null,
  version: 1,
  settlements: [],
  ...patch,
});

const range = { from: "2026-10-01", to: "2026-10-31" };
describe("Comissões e resultados", () => {
  it("usa cálculo inteiro mesmo para valores próximos ao limite", () => {
    expect(percentage(999999999999, 9999)).toBe(999899999999);
    expect(percentage(1, 5000)).toBe(1);
  });
  it("comissiona recebimentos líquidos de desconto e exclui encargos", () => {
    const e = entry({
      commissionRateBps: 1000,
      commissionBasis: "received",
      settlements: [settlement()],
    });
    expect(earned(e, "2026-10-31")).toBe(380);
  });
  it("arredonda o acumulado e não cada baixa parcial", () => {
    const first = settlement({
      id: "s1",
      date: "2026-10-01",
      principalCents: 1,
      discountCents: 0,
      interestCents: 0,
      fineCents: 0,
    });
    const second = { ...first, id: "s2", date: "2026-10-02" };
    const e = entry({ commissionRateBps: 5000, settlements: [first, second] });
    expect(earned(e, "2026-10-01")).toBe(1);
    expect(earned(e, "2026-10-02")).toBe(1);
    expect(
      performanceReport([e], [], { from: "2026-10-02", to: "2026-10-02" }, null)
        .current.commissionCents,
    ).toBe(0);
  });
  it("diferencia comissão faturada da recebida e da potencial", () => {
    const e = entry({ commissionRateBps: 1000, commissionBasis: "received" });
    let r = performanceReport([e], [], range, null);
    expect(r.current.commissionCents).toBe(0);
    expect(r.current.netProfitCents).toBe(10000);
    expect(r.current.projectedProfitCents).toBe(9000);
    r = performanceReport(
      [{ ...e, commissionBasis: "billed" }],
      [],
      range,
      null,
    );
    expect(r.current.commissionCents).toBe(1000);
  });
  it("deduz custos e despesas sem duplicar a comissão emitida", () => {
    const sale = entry({ commissionRateBps: 1000, commissionBasis: "billed" });
    const direct = entry({
      id: "cost",
      direction: "payable",
      amountCents: 3000,
      resultClass: "direct",
    });
    const overhead = entry({
      id: "expense",
      direction: "payable",
      amountCents: 1000,
      resultClass: "unclassified",
    });
    const payout = entry({
      id: "payout",
      direction: "payable",
      amountCents: 1000,
      resultClass: "commission",
    });
    const r = performanceReport(
      [sale, direct, overhead, payout],
      [{ sourceEntryId: "e", payableEntryId: "payout" }],
      range,
      3200,
    );
    expect(r.current.grossProfitCents).toBe(7000);
    expect(r.current.netProfitCents).toBe(5000);
    expect(r.current.unclassifiedCount).toBe(1);
    expect(r.current.presumedProfitCents).toBe(3200);
    expect(r.totals.availableCents).toBe(0);
  });
  it("preserva aviso de comissão emitida a maior após estorno", () => {
    const sale = entry({
      commissionRateBps: 1000,
      settlements: [
        settlement({ principalCents: 10000, reversedAt: new Date() }),
      ],
    });
    const payout = entry({
      id: "payout",
      direction: "payable",
      amountCents: 1000,
    });
    const r = performanceReport(
      [sale, payout],
      [{ sourceEntryId: "e", payableEntryId: "payout" }],
      range,
      null,
    );
    expect(r.rows[0]?.overallocatedCents).toBe(1000);
    expect(r.rows[0]?.availableCents).toBe(0);
  });
  it("ignora títulos cancelados e transferências na receita", () => {
    const r = performanceReport(
      [
        entry({ cancelledAt: new Date() }),
        entry({ id: "transfer", kind: "transfer" }),
      ],
      [],
      range,
      null,
    );
    expect(r.current.revenueCents).toBe(0);
    expect(r.current.presumedProfitCents).toBeNull();
  });
  it("sinaliza despesas excluídas pelo filtro, sem rateio artificial", () => {
    const r = performanceReport(
      [
        entry(),
        entry({
          id: "expense",
          sellerId: null,
          direction: "payable",
          amountCents: 5000,
        }),
      ],
      [],
      { ...range, sellerId: "seller" },
      null,
    );
    expect(r.current.netProfitCents).toBe(10000);
    expect(r.unassignedExpenseCount).toBe(1);
  });
  it("separa caixa e competência com pagamento de outro período", () => {
    const e = entry({
      competenceDate: "2026-09-01",
      settlements: [
        settlement({
          principalCents: 10000,
          discountCents: 0,
          interestCents: 0,
          fineCents: 0,
        }),
      ],
    });
    const r = performanceReport([e], [], range, null);
    expect(r.current.revenueCents).toBe(0);
    expect(r.current.cashBalanceCents).toBe(10000);
  });
  it("representa prejuízo com número negativo", () => {
    const r = performanceReport(
      [
        entry(),
        entry({
          id: "expense",
          direction: "payable",
          amountCents: 15000,
          resultClass: "direct",
        }),
      ],
      [],
      range,
      null,
    );
    expect(r.current.grossProfitCents).toBe(-5000);
    expect(r.current.netProfitCents).toBe(-5000);
  });
  it("inclui comissões antigas com saldo pendente mesmo sem movimento no período", () => {
    const e = entry({
      competenceDate: "2026-08-01",
      commissionRateBps: 1000,
      commissionBasis: "billed",
    });
    const r = performanceReport([e], [], range, null);
    expect(r.rows).toHaveLength(1);
    expect(r.totals.availableCents).toBe(1000);
    expect(r.current.commissionCents).toBe(0);
  });
  it("reflete encargos na baixa da comissão sem deduzir novamente o principal", () => {
    const sale = entry({ commissionRateBps: 1000, commissionBasis: "billed" });
    const payout = entry({
      id: "payout",
      direction: "payable",
      amountCents: 1000,
      resultClass: "commission",
      settlements: [
        settlement({
          principalCents: 1000,
          discountCents: 0,
          interestCents: 100,
          fineCents: 0,
        }),
      ],
    });
    const r = performanceReport(
      [sale, payout],
      [{ sourceEntryId: "e", payableEntryId: "payout" }],
      range,
      null,
    );
    expect(r.current.netProfitCents).toBe(8900);
    expect(r.current.cashExpenseCents).toBe(1100);
  });
});
