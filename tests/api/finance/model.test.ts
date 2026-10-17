import { afterEach, describe, expect, it, vi } from "vitest";
import {
  addMonths,
  cash,
  dashboard,
  type Entry,
  type Filters,
  filterEntries,
  isCivilDate,
  previousPeriod,
  remaining,
  type Settlement,
  status,
} from "../../../apps/api/src/finance/model";

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
const filters: Filters = {
  from: "2026-10-01",
  to: "2026-10-16",
  dateBasis: "due",
};
afterEach(() => vi.useRealTimers());
describe("Financeiro: datas e saldos", () => {
  it("valida datas civis e mantém o dia original ao gerar ciclos", () => {
    expect(isCivilDate("2026-02-30")).toBe(false);
    expect(isCivilDate("2024-02-29")).toBe(true);
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2026-01-31", 2)).toBe("2026-03-31");
  });
  it("compara períodos com o mesmo número de dias", () => {
    expect(previousPeriod(filters.from, filters.to)).toEqual({
      from: "2026-09-15",
      to: "2026-09-30",
    });
  });
  it("separa saldo do principal do valor efetivo com ajustes", () => {
    const e = entry({ settlements: [settlement()] });
    expect(cash(settlement())).toBe(3950);
    expect(remaining(e)).toBe(6000);
    expect(status(e)).toBe("partial");
  });
  it("preserva estorno no histórico sem contabilizá-lo no saldo", () => {
    const e = entry({
      settlements: [settlement({ reversedAt: "2026-10-10" })],
    });
    expect(remaining(e)).toBe(10000);
    expect(status(e)).toBe("open");
  });
  it("combina filtros de vendedor serviço categoria e vínculo", () => {
    const e = entry({ laborType: "pj" });
    expect(
      filterEntries([e], {
        ...filters,
        categoryId: "category",
        subcategoryId: "sub",
        laborType: "pj",
        sellerId: "seller",
        serviceId: "sv",
      }),
    ).toHaveLength(1);
    expect(filterEntries([e], { ...filters, laborType: "clt" })).toHaveLength(
      0,
    );
  });
  it("data de baixa pesquisa pagamentos sem limitar pelo vencimento", () => {
    const e = entry({ dueDate: "2026-09-01", settlements: [settlement()] });
    expect(
      filterEntries([e], { ...filters, dateBasis: "settlement" }),
    ).toHaveLength(1);
    expect(filterEntries([e], filters)).toHaveLength(0);
  });
});
describe("Financeiro: dashboard e conciliação", () => {
  it("concilia gráfico mensal com KPIs e exclui saldo inicial das operações", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-16T15:00:00Z"));
    const rows = [
      entry({ settlements: [settlement()] }),
      entry({
        id: "expense",
        direction: "payable",
        settlements: [
          settlement({
            principalCents: 1000,
            discountCents: 0,
            interestCents: 0,
            fineCents: 0,
          }),
        ],
      }),
      entry({
        id: "opening",
        kind: "opening",
        settlements: [
          settlement({
            principalCents: 10000,
            discountCents: 0,
            interestCents: 0,
            fineCents: 0,
          }),
        ],
      }),
    ];
    const d = dashboard(rows, filters);
    expect(d.current.income).toBe(3950);
    expect(d.current.expense).toBe(1000);
    expect(d.current.balance).toBe(12950);
    expect(d.months.reduce((s, m) => s + m.income, 0)).toBe(d.current.income);
    expect(d.months.reduce((s, m) => s + m.expense, 0)).toBe(d.current.expense);
  });
  it("reapresenta estornos de forma consistente no KPI e gráfico", () => {
    const d = dashboard(
      [entry({ settlements: [settlement({ reversedAt: "2026-10-17" })] })],
      filters,
    );
    expect(d.current.income).toBe(0);
    expect(d.months[0]?.income).toBe(0);
  });
  it("detalhamento inclui títulos anteriores ao início e pagamentos até a data de referência", () => {
    const e = entry({
      dueDate: "2026-09-01",
      settlements: [settlement({ date: "2026-10-20", principalCents: 10000 })],
    });
    const f = { ...filters, view: "outstanding" as const, asOf: "2026-10-16" };
    expect(filterEntries([e], f)).toHaveLength(1);
    expect(remaining(e, f.asOf)).toBe(10000);
  });
});
