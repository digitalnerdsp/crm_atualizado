import { describe, expect, it } from "vitest";
import {
  dueDate,
  effectiveDay,
  planCycles,
  type Revision,
  snapshotItems,
} from "../../../apps/api/src/finance/recurrence/schedule";

const revision = (patch: Partial<Revision> = {}): Revision => ({
  id: "r1",
  sequence: 1,
  effectiveDate: "2026-01-01",
  status: "active",
  endsOn: null,
  billingDay: 10,
  sellerId: "seller",
  sellerName: "Vendedor",
  items: [
    {
      key: "service:1:0",
      serviceId: "1",
      name: "Hospedagem",
      billingType: "monthly",
      amountCents: 10000,
      anchor: "2026-01-01",
    },
  ],
  ...patch,
});
describe("Cronogramas contratuais", () => {
  it("usa o dia de São Paulo para mudanças próximas da meia-noite UTC", () => {
    expect(effectiveDay("2026-10-17T01:30:00Z")).toBe("2026-10-16");
  });
  it("gera uma cobrança anual pelo valor do ciclo sem mensalizar o título", () => {
    const r = revision({
      endsOn: "2026-12-31",
      items: [
        { ...revision().items[0], billingType: "yearly", amountCents: 120000 },
      ],
    });
    const rows = planCycles([r], "2027-01-01", false);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.amountCents).toBe(120000);
  });
  it("respeita ciclos trimestrais e vigência", () => {
    const r = revision({
      endsOn: "2026-12-31",
      items: [{ ...revision().items[0], billingType: "quarterly" }],
    });
    expect(planCycles([r], "2026-12-31", false).map((c) => c.start)).toEqual([
      "2026-01-01",
      "2026-04-01",
      "2026-07-01",
      "2026-10-01",
    ]);
  });
  it("mantém dia 31 como referência após fevereiro", () => {
    const r = revision({
      effectiveDate: "2026-01-31",
      items: [{ ...revision().items[0], anchor: "2026-01-31" }],
    });
    expect(planCycles([r], "2026-03-31", false).map((c) => c.start)).toEqual([
      "2026-01-31",
      "2026-02-28",
      "2026-03-31",
    ]);
  });
  it("ajusta vencimentos sem lançar antes do início do ciclo", () => {
    expect(dueDate("2026-02-01", 31)).toBe("2026-02-28");
    expect(dueDate("2026-01-16", 10)).toBe("2026-02-10");
  });
  it("permite último ciclo proporcional com arredondamento em centavos", () => {
    const rows = planCycles(
      [revision({ endsOn: "2026-01-15" })],
      "2026-02-01",
      true,
    );
    expect(rows[0]?.amountCents).toBe(Math.round((10000 * 15) / 31));
    expect(rows[0]?.end).toBe("2026-01-15");
  });
  it("pausa e retoma sem cobrar os ciclos iniciados na suspensão", () => {
    const r = revision();
    const rows = planCycles(
      [
        r,
        revision({
          id: "r2",
          sequence: 2,
          effectiveDate: "2026-02-10",
          status: "paused",
        }),
        revision({ id: "r3", sequence: 3, effectiveDate: "2026-04-10" }),
      ],
      "2026-05-01",
      false,
    );
    expect(rows.map((c) => c.start)).toEqual([
      "2026-01-01",
      "2026-02-01",
      "2026-05-01",
    ]);
  });
  it("aplica reajuste apenas aos ciclos que começam após o efeito", () => {
    const r = revision();
    const next = revision({
      id: "r2",
      sequence: 2,
      effectiveDate: "2026-02-10",
      items: [{ ...r.items[0], amountCents: 15000 }],
    });
    expect(
      planCycles([r, next], "2026-03-01", false).map((c) => c.amountCents),
    ).toEqual([10000, 10000, 15000]);
  });
  it("não preenche o intervalo entre término e renovação", () => {
    const r = revision({ endsOn: "2026-01-31" });
    const renew = revision({
      id: "r2",
      sequence: 2,
      effectiveDate: "2026-03-10",
      endsOn: "2026-04-30",
    });
    expect(
      planCycles([r, renew], "2026-05-01", false).map((c) => c.start),
    ).toEqual(["2026-01-01", "2026-04-01"]);
  });
  it("preserva a política proporcional da versão original", () => {
    const r = revision({ endsOn: "2026-01-15", prorateFinal: false });
    expect(planCycles([r], "2026-01-31", true)[0]?.amountCents).toBe(10000);
  });
  it("mantém identidade e âncora do serviço quando o preço muda", () => {
    const r = revision();
    const items = snapshotItems(
      [
        {
          serviceId: "1",
          name: "Hospedagem nova",
          billingType: "monthly",
          totalCents: 20000,
        },
      ],
      20000,
      "2026-03-10",
      r.items,
    );
    expect(items[0]?.key).toBe(r.items[0]?.key);
    expect(items[0]?.anchor).toBe("2026-01-01");
  });
});
