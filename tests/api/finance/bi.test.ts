import * as v from "valibot";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { excelBi, pdfBi } from "../../../apps/api/src/finance/bi/export";
import {
  type BiData,
  buildBi,
  comparisonPeriod,
} from "../../../apps/api/src/finance/bi/model";
import { filters } from "../../../apps/api/src/finance/bi/validation";
import type { Entry, Settlement } from "../../../apps/api/src/finance/model";
import { performanceReport } from "../../../apps/api/src/finance/performance/model";
import type { PortfolioContract } from "../../../apps/api/src/finance/recurrence/report";

const f = {
  from: "2026-10-01",
  to: "2026-10-31",
  comparison: "previous",
  grouping: "month",
} as const;
const entry = (patch: Partial<Entry> = {}): Entry => ({
  id: "income",
  description: "Serviço",
  direction: "receivable",
  kind: "operating",
  amountCents: 10000,
  competenceDate: "2026-10-01",
  dueDate: "2026-10-10",
  categoryId: "cat",
  parentCategoryId: null,
  categoryName: "Serviços",
  partyId: null,
  partyName: "Cliente",
  laborType: null,
  companyId: "client",
  companyName: "Cliente",
  serviceId: "service",
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
const settlement = (patch: Partial<Settlement> = {}): Settlement => ({
  id: "paid",
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
const data = (entries: Entry[] = [], patch: Partial<BiData> = {}): BiData => ({
  entries,
  payouts: [],
  portfolio: [],
  simulations: [],
  presumptionBps: null,
  ...patch,
});
const contract = (
  entries: Entry[] = [],
  patch: Partial<PortfolioContract> = {},
): PortfolioContract =>
  ({
    id: "contract",
    number: 1,
    title: "Hospedagem",
    companyId: "client",
    companyName: "Cliente",
    ownerUserId: "seller",
    sellerName: "Vendedor",
    currency: "BRL",
    startsAt: new Date("2026-10-01"),
    endsAt: new Date("2026-12-31"),
    status: "active",
    monthlyValueCents: 10000,
    lines: [
      {
        serviceId: "service",
        name: "Site",
        billingType: "monthly",
        totalCents: 10000,
      },
    ],
    config: { enabled: true, startsOn: "2026-10-01", prorateFinal: false },
    events: [
      {
        type: "created",
        occurredAt: new Date("2026-10-01"),
        toMonthlyValueCents: 10000,
      },
    ],
    revisions: [
      {
        id: "revision",
        sequence: 1,
        effectiveDate: "2026-10-01",
        status: "active",
        endsOn: "2026-12-31",
        sellerId: "seller",
        sellerName: "Vendedor",
        billingDay: 1,
        items: [
          {
            key: "line",
            serviceId: "service",
            name: "Site",
            billingType: "monthly",
            amountCents: 10000,
            anchor: "2026-10-01",
          },
        ],
      },
    ],
    entries,
    ...patch,
  }) as PortfolioContract;
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-20T15:00:00Z"));
});
afterEach(() => vi.useRealTimers());
describe("BI financeiro consolidado", () => {
  it("retorna zero sem dados e margens não aplicáveis", () => {
    const r = buildBi(data(), f);
    expect(r.current.revenue).toBe(0);
    expect(r.current.netMargin).toBeNull();
    expect(r.current.presumed).toBeNull();
    expect(r.rankings.companies).toEqual([]);
  });
  it("concilia caixa com descontos, juros, multas e baixas parciais", () => {
    const r = buildBi(data([entry({ settlements: [settlement()] })]), f);
    expect(r.current.received).toBe(3950);
    expect(r.current.receivable).toBe(6000);
    expect(r.current.overdueReceivable).toBe(6000);
    expect(r.current.revenue).toBe(10000);
  });
  it("concilia lucro e composição assinada com o módulo atual", () => {
    const entries = [
      entry({
        commissionRateBps: 1000,
        commissionBasis: "received",
        settlements: [settlement()],
      }),
      entry({
        id: "cost",
        direction: "payable",
        amountCents: 2000,
        resultClass: "direct",
        settlements: [
          settlement({
            principalCents: 1000,
            discountCents: 50,
            interestCents: 20,
            fineCents: 0,
          }),
        ],
      }),
      entry({
        id: "tax",
        direction: "payable",
        resultClass: "tax",
        amountCents: 500,
      }),
    ];
    const r = buildBi(data(entries), f);
    const p = performanceReport(entries, [], f, 2000).current;
    expect(r.current.net).toBe(p.netProfitCents);
    expect(r.current.gross).toBe(p.grossProfitCents);
    expect(r.details.net.reduce((s, x) => s + x.value, 0)).toBe(r.current.net);
    expect(r.details.gross.reduce((s, x) => s + x.value, 0)).toBe(
      r.current.gross,
    );
    expect(r.waterfall.slice(0, -1).reduce((s, x) => s + x.value, 0)).toBe(
      r.current.net,
    );
  });
  it("não deduz novamente títulos de comissão", () => {
    const source = entry({
      commissionBasis: "billed",
      commissionRateBps: 1000,
    });
    const payable = entry({
      id: "commission",
      direction: "payable",
      amountCents: 1000,
      resultClass: "commission",
    });
    const r = buildBi(
      data([source, payable], {
        payouts: [{ sourceEntryId: source.id, payableEntryId: payable.id }],
      }),
      f,
    );
    expect(r.current.net).toBe(9000);
    expect(r.current.expenses).toBe(1000);
    expect(r.current.commissionOpen).toBe(1000);
    expect(r.current.availableCommission).toBe(0);
  });
  it("preserva alerta de comissão emitida a maior após cancelamento da origem", () => {
    const source = entry({
      cancelledAt: new Date(),
      commissionBasis: "billed",
      commissionRateBps: 1000,
    });
    const payout = entry({
      id: "commission",
      direction: "payable",
      amountCents: 1000,
    });
    const r = buildBi(
      data([source, payout], {
        payouts: [{ sourceEntryId: source.id, payableEntryId: payout.id }],
      }),
      f,
    );
    expect(r.current.commissionExcess).toBe(1000);
    expect(r.current.revenue).toBe(0);
  });
  it("ignora baixas estornadas, títulos cancelados e saldos iniciais", () => {
    const r = buildBi(
      data([
        entry({ settlements: [settlement({ reversedAt: new Date() })] }),
        entry({ id: "cancelled", cancelledAt: new Date() }),
        entry({ id: "opening", kind: "opening" }),
      ]),
      f,
    );
    expect(r.current.received).toBe(0);
    expect(r.current.revenue).toBe(10000);
  });
  it("filtros específicos não removem receita nem contratos", () => {
    const rows = [
      entry(),
      entry({
        id: "clt",
        direction: "payable",
        laborType: "clt",
        amountCents: 2000,
      }),
      entry({
        id: "pj",
        direction: "payable",
        laborType: "pj",
        amountCents: 3000,
      }),
    ];
    const r = buildBi(data(rows, { portfolio: [contract()] }), {
      ...f,
      laborType: "clt",
    });
    expect(r.current.revenue).toBe(10000);
    expect(r.current.expenseSlice).toBe(2000);
    expect(r.current.expenses).toBe(5000);
    expect(r.current.mrr).toBe(10000);
    expect(r.labor).toEqual([{ label: "CLT", value: 2000 }]);
  });
  it("filtros gerais e grupos sem vínculo não rateiam despesas", () => {
    const r = buildBi(
      data([
        entry(),
        entry({
          id: "general",
          direction: "payable",
          companyId: null,
          companyName: null,
          amountCents: 500,
        }),
      ]),
      { ...f, companyId: "client" },
    );
    expect(r.current.expenses).toBe(0);
    expect(r.rankings.companies).toHaveLength(1);
    expect(r.rankings.companies[0].result).toBe(10000);
  });
  it("permite investigar rankings por saldo vencido além da receita", () => {
    const d = data([
      entry({
        companyId: "new",
        companyName: "Nova",
        amountCents: 5000,
        dueDate: "2026-10-25",
      }),
      entry({
        id: "old",
        companyId: "old",
        companyName: "Antiga",
        amountCents: 20000,
        competenceDate: "2026-08-01",
        dueDate: "2026-08-01",
      }),
    ]);
    const r = buildBi(d, { ...f, ranking: "overdue" });
    expect(r.rankings.companies[0].id).toBe("old");
    expect(r.rankings.companies[0].overdue).toBe(20000);
  });
  it("compara ano anterior ajustando 29/02", () => {
    expect(
      comparisonPeriod({
        ...f,
        from: "2024-02-29",
        to: "2024-03-01",
        comparison: "year",
      }),
    ).toEqual({ from: "2023-02-28", to: "2023-03-01" });
  });
  it("diário e mensal preservam totais", () => {
    const d = data([entry({ settlements: [settlement()] })]);
    for (const grouping of ["day", "month"] as const) {
      const r = buildBi(d, { ...f, grouping });
      expect(r.months.reduce((s, m) => s + m.revenue, 0)).toBe(
        r.current.revenue,
      );
      expect(r.months.reduce((s, m) => s + m.received, 0)).toBe(
        r.current.received,
      );
    }
  });
  it("aging usa saldo principal e não o total original", () => {
    const r = buildBi(
      data([
        entry({ dueDate: "2026-08-01", settlements: [settlement()] }),
        entry({ id: "future", dueDate: "2026-10-31" }),
      ]),
      f,
    );
    expect(r.aging.find((x) => x.label === "61–90 dias")?.value).toBe(6000);
    expect(r.aging[0].value).toBe(10000);
  });
  it("projeção não duplica ciclos emitidos, mesmo cancelados", () => {
    const billed = entry({
      contractId: "contract",
      contractLineKey: "line",
      cycleStart: "2026-11-01",
      dueDate: "2026-11-01",
      settlements: [settlement({ principalCents: 4000 })],
    });
    const cancelled = entry({
      id: "cancelled",
      contractId: "contract",
      contractLineKey: "line",
      cycleStart: "2026-12-01",
      dueDate: "2026-12-01",
      cancelledAt: new Date(),
    });
    const r = buildBi(
      data([billed, cancelled], { portfolio: [contract([billed, cancelled])] }),
      f,
    );
    expect(r.projection[2].income).toBe(6000);
    expect(r.details.projection).toHaveLength(1);
  });
  it("projeta ciclos habilitados sem gravar e exclui vencidos", () => {
    const r = buildBi(
      data([entry({ dueDate: "2026-10-10" })], { portfolio: [contract()] }),
      f,
    );
    expect(r.projection[2].income).toBe(20000);
    expect(r.details.projection.every((x) => x.kind === "contract")).toBe(true);
    expect(r.current.overdueReceivable).toBe(10000);
  });
  it("inclui ciclo ainda não emitido com início passado e vencimento futuro", () => {
    const c = contract();
    c.revisions[0].billingDay = 31;
    const r = buildBi(data([], { portfolio: [c] }), f);
    expect(r.projection[0].income).toBe(10000);
    expect(r.projection[2].income).toBe(30000);
  });
  it("não projeta contrato desabilitado ou de outra moeda", () => {
    const disabled = contract([], {
      config: { enabled: false } as PortfolioContract["config"],
    });
    const foreign = contract([], { id: "usd", currency: "USD" });
    const r = buildBi(data([], { portfolio: [disabled, foreign] }), f);
    expect(r.projection[2].income).toBe(0);
    expect(r.current.disabledBilling).toBe(1);
    expect(r.warnings.some((w) => w.includes("outras moedas"))).toBe(true);
  });
  it("separa simulações de receita, resultado e caixa", () => {
    const simulations = [
      {
        id: "sim",
        title: "Cenário",
        date: "2026-10-02",
        profileName: "Perfil",
        serviceId: "service",
        sellerId: "seller",
        result: {
          grossCents: 100000,
          netCents: 80000,
          taxCents: 10000,
          feeCents: 5000,
          commissionCents: 5000,
        },
      },
    ] as BiData["simulations"];
    const r = buildBi(data([], { simulations }), { ...f, companyId: "client" });
    expect(r.current.simulation).toBe(1);
    expect(r.current.revenue).toBe(0);
    expect(r.current.net).toBe(0);
    expect(r.simulationSummary.simulatedGrossCents).toBe(100000);
  });
  it("valida período, enums, datas e limite diário", () => {
    expect(v.safeParse(filters, f).success).toBe(true);
    for (const patch of [
      { from: "2026-02-30" },
      { to: "2025-01-01" },
      { comparison: "x" },
      { grouping: "day", from: "2026-01-01" },
      { from: "2020-01-01" },
    ])
      expect(v.safeParse(filters, { ...f, ...patch }).success).toBe(false);
  });
  it("gera Excel e PDF reais com perdas e nomes Unicode", async () => {
    const r = buildBi(
      data([
        entry({ description: "Serviço 🚀", companyName: "Cliente 中文" }),
        entry({ id: "expense", direction: "payable", amountCents: 20000 }),
      ]),
      f,
    );
    vi.useRealTimers();
    const x = await excelBi(r);
    const p = await pdfBi(r);
    expect(String.fromCharCode(...x.slice(0, 2))).toBe("PK");
    expect(new TextDecoder().decode(p.slice(0, 4))).toBe("%PDF");
    expect(p.length).toBeGreaterThan(3000);
  }, 20000);
});
