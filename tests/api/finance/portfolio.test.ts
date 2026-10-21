import { defaultRolePayloads } from "@kaneo/permissions";
import { describe, expect, it } from "vitest";
import type { Entry } from "../../../apps/api/src/finance/model";
import {
  closedSeconds,
  laborCost,
  profitability,
  type Time,
  timeSummary,
  type WorkData,
  type Worker,
} from "../../../apps/api/src/finance/portfolio/model";

const period = { from: "2026-10-01", to: "2026-10-31", horizon: "90" as const };
const time = (patch: Partial<Time> = {}): Time => ({
  id: "time",
  taskId: "task",
  userId: "a",
  startTime: "2026-10-02T12:00:00Z",
  endTime: "2026-10-02T14:00:00Z",
  duration: 999,
  ...patch,
});
const worker = (patch: Partial<Worker> = {}): Worker => ({
  id: "worker",
  siteId: "site",
  userId: "a",
  mode: "internal",
  fixedCents: 12000,
  chargedOn: "2026-10-01",
  sourceEntryId: null,
  version: 1,
  ...patch,
});
const entry = (patch: Partial<Entry> = {}): Entry => ({
  id: "income",
  description: "Site",
  direction: "receivable",
  kind: "operating",
  amountCents: 100000,
  competenceDate: "2026-10-01",
  dueDate: "2026-10-10",
  categoryId: null,
  parentCategoryId: null,
  categoryName: null,
  partyId: null,
  partyName: "Cliente",
  laborType: null,
  companyId: "client",
  companyName: "Cliente",
  serviceId: null,
  serviceName: null,
  sellerId: null,
  sellerName: null,
  paymentMethod: "pix",
  notes: "",
  installment: 1,
  installmentCount: 1,
  cancelledAt: null,
  version: 1,
  settlements: [],
  ...patch,
});
function data(): WorkData {
  return {
    sites: [
      {
        id: "site",
        companyId: "client",
        name: "Site",
        status: "active",
        includeScenario: false,
        version: 1,
        contractId: null,
      },
    ],
    tasks: [
      {
        taskId: "task",
        siteId: "site",
        title: "Layout",
        projectId: "board",
        assigneeId: "b",
        estimateMinutes: 180,
        version: 1,
      },
    ],
    times: [time()],
    workers: [worker()],
    rates: [
      { id: "rate", userId: "a", effectiveOn: "2026-01-01", hourlyCents: 5000 },
    ],
    links: [{ siteId: "site", entryId: "income" }],
    users: [
      { id: "a", name: "Ana" },
      { id: "b", name: "Bruno" },
    ],
    companies: [{ id: "client", name: "Cliente" }],
    entries: [entry()],
    payouts: [],
  };
}
describe("Horas de sites e rentabilidade", () => {
  it("calcula pelo intervalo real e ignora timer aberto ou inválido", () => {
    expect(closedSeconds(time())).toBe(7200);
    expect(closedSeconds(time({ endTime: null }))).toBe(0);
    expect(closedSeconds(time({ endTime: "inválido" }))).toBe(0);
  });
  it("soma apenas tarefas vinculadas a sites", () => {
    const d = data();
    expect(
      timeSummary(d.tasks, [...d.times, time({ taskId: "social" })]).seconds,
    ).toBe(7200);
  });
  it("preserva autoria e não transfere horas ao novo responsável", () => {
    const r = profitability(data(), period).sites[0];
    expect(r.workers.find((w) => w.userId === "a")?.seconds).toBe(7200);
    expect(r.workers.find((w) => w.userId === "b")?.seconds).toBe(0);
    expect(r.workers.find((w) => w.userId === "b")?.estimateMinutes).toBe(180);
    expect(r.tasks[0].contributors[0].userId).toBe("a");
  });
  it("aplica a taxa vigente na data trabalhada, sem reprecificar o passado", () => {
    const d = data();
    d.rates.push({
      id: "next",
      userId: "a",
      effectiveOn: "2026-10-03",
      hourlyCents: 10000,
    });
    expect(laborCost([time()], worker(), d.rates).estimatedCents).toBe(10000);
    expect(
      laborCost(
        [
          time({
            startTime: "2026-10-04T12:00:00Z",
            endTime: "2026-10-04T14:00:00Z",
          }),
        ],
        worker(),
        d.rates,
      ).estimatedCents,
    ).toBe(20000);
  });
  it("usa data de São Paulo para vigência e período", () => {
    const d = data();
    expect(
      laborCost(
        [
          time({
            startTime: "2026-10-01T01:00:00Z",
            endTime: "2026-10-01T02:00:00Z",
          }),
        ],
        worker(),
        d.rates,
        period,
      ).seconds,
    ).toBe(0);
  });
  it("sinaliza taxa ou acordo ausentes em vez de tratar custo como zero", () => {
    const d = data();
    d.rates = [];
    d.sites[0].includeScenario = true;
    const r = profitability(d, period).sites[0];
    expect(r.missingSeconds).toBe(7200);
    expect(r.scenarioCents).toBeNull();
    expect(laborCost([time()], undefined, data().rates).missingSeconds).toBe(
      7200,
    );
  });
  it("cobra preço fechado uma vez, independentemente das horas", () => {
    const d = data();
    d.workers = [worker({ mode: "fixed" })];
    d.times.push(time({ id: "t2" }));
    expect(profitability(d, period).sites[0].estimatedLaborCents).toBe(12000);
    expect(
      laborCost(d.times, d.workers[0], [], {
        from: "2026-11-01",
        to: "2026-11-30",
      }).estimatedCents,
    ).toBe(0);
  });
  it("só apresenta cenário com estimativas quando explicitamente habilitado", () => {
    const d = data();
    expect(profitability(d, period).sites[0].scenarioCents).toBeNull();
    d.sites[0].includeScenario = true;
    const r = profitability(d, period).sites[0];
    expect(r.finance.netProfitCents).toBe(100000);
    expect(r.scenarioCents).toBe(90000);
  });
  it("não desconta novamente custo já lançado e vinculado", () => {
    const d = data();
    d.sites[0].includeScenario = true;
    d.entries.push(
      entry({
        id: "expense",
        direction: "payable",
        amountCents: 10000,
        resultClass: "direct",
      }),
    );
    d.links.push({ siteId: "site", entryId: "expense" });
    d.workers = [worker({ sourceEntryId: "expense" })];
    const r = profitability(d, period).sites[0];
    expect(r.workers[0].booked).toBe(true);
    expect(r.finance.netProfitCents).toBe(90000);
    expect(r.scenarioCents).toBe(90000);
  });
  it("exige conciliação quando a despesa de origem é cancelada", () => {
    const d = data();
    d.sites[0].includeScenario = true;
    d.entries.push(
      entry({ id: "expense", direction: "payable", cancelledAt: "2026-10-04" }),
    );
    d.workers = [worker({ sourceEntryId: "expense" })];
    const r = profitability(d, period).sites[0];
    expect(r.workers[0].needsReconciliation).toBe(true);
    expect(r.scenarioCents).toBeNull();
  });
  it("apresenta rentabilidade dos demais serviços sem exigir horas", () => {
    const d = data();
    d.sites = [];
    d.tasks = [];
    d.times = [];
    const r = profitability(d, period);
    expect(r.companies[0].resultCents).toBe(100000);
    expect(r.companies[0].seconds).toBe(0);
  });
  it("mantém despesas gerais sem cliente separadas", () => {
    const d = data();
    d.entries.push(
      entry({
        id: "general",
        companyId: null,
        direction: "payable",
        amountCents: 5000,
      }),
    );
    const r = profitability(d, period);
    expect(r.unassignedExpenseCents).toBe(5000);
    expect(r.companies[0].resultCents).toBe(100000);
  });
  it("separa resultado do período do acumulado do site", () => {
    const d = data();
    d.entries.push(
      entry({ id: "old", competenceDate: "2026-09-01", amountCents: 20000 }),
    );
    d.links.push({ siteId: "site", entryId: "old" });
    const r = profitability(d, period).sites[0];
    expect(r.finance.revenueCents).toBe(100000);
    expect(r.totalFinancial.revenueCents).toBe(120000);
  });
});
describe("Papel Financeiro/Jurídico", () => {
  it("permite financeiro, acompanhamento e minutas, sem privilégios de produção ou administração", () => {
    const p = defaultRolePayloads.finance_legal;
    expect(p.finance).toEqual(
      expect.arrayContaining(["read", "create", "update", "settle", "export"]),
    );
    expect(p.portfolio).toEqual(
      expect.arrayContaining(["update", "notify", "costs", "draft"]),
    );
    for (const r of [
      "project",
      "task",
      "workspace",
      "member",
      "invitation",
      "organization",
      "dashboard",
    ])
      expect((p as Record<string, string[]>)[r]).toBeUndefined();
    for (const a of ["manage", "reverse", "cancel"])
      expect(p.finance).not.toContain(a);
    expect(p.portfolio).not.toContain("approve");
  });
});
