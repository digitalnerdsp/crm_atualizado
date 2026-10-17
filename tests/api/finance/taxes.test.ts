import { describe, expect, it } from "vitest";
import type { Entry, Settlement } from "../../../apps/api/src/finance/model";
import {
  calculateSale,
  MAX_PRICE,
  type Simulation,
  type TaxItem,
  taxReport,
} from "../../../apps/api/src/finance/taxes/model";

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

const input = {
  mode: "gross" as const,
  amountCents: 10000,
  costCents: 1000,
  commissionRateBps: 500,
};
const items: TaxItem[] = [
  { name: "Imposto informado", kind: "tax", rateBps: 600, fixedCents: 0 },
  { name: "Meio de pagamento", kind: "fee", rateBps: 300, fixedCents: 50 },
];
const range = { from: "2026-10-01", to: "2026-10-31" };
function saved(patch: Partial<Simulation> = {}): Simulation {
  return {
    id: "s",
    title: "Cenário de venda",
    date: "2026-10-01",
    profileId: "p",
    profileName: "Perfil",
    profileVersion: 1,
    notes: "Referência",
    serviceId: "sv",
    serviceName: "Site",
    sellerId: "seller",
    sellerName: "Vendedor",
    input,
    result: calculateSale(items, input),
    commissionSource: "Manual",
    createdAt: "2026-10-01",
    ...patch,
  };
}
describe("Taxas e impostos: cálculo de vendas", () => {
  it("separa impostos, taxas fixas, percentuais, custo e comissão", () => {
    const r = calculateSale(items, input);
    expect(r.taxCents).toBe(600);
    expect(r.feeCents).toBe(350);
    expect(r.commissionCents).toBe(500);
    expect(r.netCents).toBe(7550);
  });
  it("encontra preço mínimo para garantir o líquido após todos os encargos", () => {
    const request = { ...input, mode: "net" as const, amountCents: 10000 };
    const r = calculateSale(items, request);
    expect(r.netCents).toBeGreaterThanOrEqual(10000);
    expect(
      calculateSale(items, { ...input, amountCents: r.grossCents - 1 })
        .netCents,
    ).toBeLessThan(10000);
  });
  it("mantém precisão perto do limite monetário", () => {
    const r = calculateSale(
      [{ name: "Taxa", kind: "fee", rateBps: 9999, fixedCents: 0 }],
      { ...input, amountCents: MAX_PRICE, costCents: 0, commissionRateBps: 0 },
    );
    expect(r.netCents).toBe(100000000);
  });
  it("aceita perfil sem encargos e soma custo ao líquido desejado", () => {
    const r = calculateSale([], {
      ...input,
      mode: "net",
      amountCents: 10000,
      commissionRateBps: 0,
    });
    expect(r.grossCents).toBe(11000);
    expect(r.netCents).toBe(10000);
  });
  it("expõe líquido negativo quando o preço não cobre os custos", () => {
    const r = calculateSale(items, { ...input, costCents: 20000 });
    expect(r.netCents).toBe(-11450);
  });
  it("rejeita percentuais totais de 100%", () => {
    expect(() =>
      calculateSale(items, { ...input, commissionRateBps: 9100 }),
    ).toThrow("menor que 100%");
  });
  it("rejeita preço inverso acima do limite", () => {
    expect(() =>
      calculateSale(items, { ...input, mode: "net", amountCents: MAX_PRICE }),
    ).toThrow("excede o limite");
  });
  it("trata corretamente o arredondamento individual, inclusive quedas locais do líquido", () => {
    const pair: TaxItem[] = [
      { name: "A", kind: "tax", rateBps: 2500, fixedCents: 0 },
      { name: "B", kind: "fee", rateBps: 2500, fixedCents: 0 },
    ];
    for (let target = 1; target <= 100; target++) {
      const r = calculateSale(pair, {
        mode: "net",
        amountCents: target,
        costCents: 0,
        commissionRateBps: 0,
      });
      const first = Array.from({ length: 500 }, (_, i) => i + 1).find(
        (price) =>
          calculateSale(pair, {
            mode: "gross",
            amountCents: price,
            costCents: 0,
            commissionRateBps: 0,
          }).netCents >= target,
      );
      expect(r.grossCents).toBe(first);
    }
  });
  it("confere o mínimo inverso para múltiplas combinações contra busca exaustiva", () => {
    for (const rates of [
      [333, 777, 155],
      [1250, 2750, 500],
      [4900, 4900, 0],
      [9999, 0, 0],
    ]) {
      const list: TaxItem[] = [
        { name: "A", kind: "tax", rateBps: rates[0] ?? 0, fixedCents: 2 },
        { name: "B", kind: "fee", rateBps: rates[1] ?? 0, fixedCents: 1 },
      ];
      for (const target of [1, 2, 9, 20]) {
        const request = {
          mode: "net" as const,
          amountCents: target,
          costCents: 3,
          commissionRateBps: rates[2] ?? 0,
        };
        const r = calculateSale(list, request);
        expect(r.netCents).toBeGreaterThanOrEqual(target);
        for (let p = Math.max(1, r.grossCents - 100); p < r.grossCents; p++)
          expect(
            calculateSale(list, { ...request, mode: "gross", amountCents: p })
              .netCents,
          ).toBeLessThan(target);
      }
    }
  });
});
describe("Taxas e impostos: indicadores", () => {
  it("não transforma simulações em despesas ou receitas reais", () => {
    const r = taxReport([], [saved()], range);
    expect(r.current.simulationCount).toBe(1);
    expect(r.current.simulatedNetCents).toBe(7550);
    expect(r.current.taxAccruedCents).toBe(0);
    expect(r.current.taxPaidCents).toBe(0);
  });
  it("separa competência e baixa de impostos e despesas financeiras", () => {
    const tax = entry({
      direction: "payable",
      resultClass: "tax",
      competenceDate: "2026-09-01",
      settlements: [settlement()],
    });
    const fee = entry({
      id: "fee",
      direction: "payable",
      resultClass: "financial",
      amountCents: 500,
      settlements: [],
    });
    const r = taxReport([tax, fee], [], range);
    expect(r.current.taxAccruedCents).toBe(0);
    expect(r.current.taxPaidCents).toBe(3950);
    expect(r.current.financialAccruedCents).toBe(500);
  });
  it("filtro de perfil limita simulações sem esconder impostos reais", () => {
    const tax = entry({ direction: "payable", resultClass: "tax" });
    const r = taxReport([tax], [saved()], { ...range, profileId: "other" });
    expect(r.current.simulationCount).toBe(0);
    expect(r.current.taxAccruedCents).toBe(10000);
  });
  it("filtra vendedor e serviço e compara período anterior equivalente", () => {
    const r = taxReport(
      [],
      [
        saved(),
        saved({ id: "old", date: "2026-09-15" }),
        saved({ id: "other", sellerId: "other" }),
      ],
      { ...range, sellerId: "seller", serviceId: "sv" },
    );
    expect(r.rows).toHaveLength(1);
    expect(r.current.simulationCount).toBe(1);
    expect(r.previous.simulationCount).toBe(1);
  });
  it("ignora baixas estornadas, saldos iniciais e títulos cancelados", () => {
    const tax = entry({
      direction: "payable",
      resultClass: "tax",
      settlements: [settlement({ reversedAt: new Date() })],
    });
    const r = taxReport(
      [
        tax,
        entry({
          id: "cancel",
          direction: "payable",
          resultClass: "tax",
          cancelledAt: new Date(),
        }),
        entry({
          id: "opening",
          direction: "payable",
          resultClass: "tax",
          kind: "opening",
        }),
      ],
      [],
      range,
    );
    expect(r.current.taxAccruedCents).toBe(10000);
    expect(r.current.taxPaidCents).toBe(0);
  });
});
