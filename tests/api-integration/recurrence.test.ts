import { createRequire } from "node:module";
import { defaultRolePayloads } from "@kaneo/permissions";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { beforeEach, describe, expect, it } from "vitest";
import {
  changeContractValue,
  createContract,
  transitionContract,
  updateContract,
} from "../../apps/api/src/crm/contract/controllers/contracts";
import db, { schema } from "../../apps/api/src/database";
import finance from "../../apps/api/src/finance";
import {
  loadEntries,
  settleEntry,
  updateEntry,
} from "../../apps/api/src/finance/controllers/finance";
import { addMonths, today } from "../../apps/api/src/finance/model";
import {
  configureBilling,
  generateContract,
  renewContract,
  runContractBilling,
} from "../../apps/api/src/finance/recurrence/billing";
import {
  loadPortfolio,
  recurrenceReport,
} from "../../apps/api/src/finance/recurrence/report";
import { plusDays } from "../../apps/api/src/finance/recurrence/schedule";
import { resetTestDatabase } from "./helpers/database";
import { createWorkspaceMember } from "./helpers/fixtures";

function appFor(userId: string) {
  const app = new Hono<{ Variables: { userId: string } }>();
  app.use("*", async (c, next) => {
    c.set("userId", userId);
    await next();
  });
  app.route("/finance", finance);
  app.onError((e, c) =>
    e instanceof HTTPException
      ? c.json({ message: e.message }, e.status)
      : c.json({ message: String(e) }, 500),
  );
  return app;
}
async function seed(
  type: "monthly" | "yearly" = "monthly",
  endsOn: string | null = null,
  role: "admin" | "sales" = "admin",
) {
  const m = await createWorkspaceMember({ role });
  await db.insert(schema.workspaceRoleTable).values({
    workspaceId: m.workspace.id,
    role,
    permission: JSON.stringify(defaultRolePayloads[role]),
  });
  const [company] = await db
    .insert(schema.crmCompanyTable)
    .values({
      workspaceId: m.workspace.id,
      name: "Cliente recorrente",
      billingDay: Number(today().slice(-2)),
    })
    .returning();
  if (!company) throw new Error("Sem cliente");
  const [service] = await db
    .insert(schema.crmServiceTable)
    .values({
      workspaceId: m.workspace.id,
      name: "Serviço recorrente",
      billingType: type,
      defaultPriceCents: type === "yearly" ? 120000 : 10000,
    })
    .returning();
  if (!service) throw new Error("Sem serviço");
  const contract = await createContract({
    workspaceId: m.workspace.id,
    actorUserId: m.user.id,
    input: {
      companyId: company.id,
      title: "Contrato de teste",
      startsAt: new Date(`${today()}T00:00:00Z`),
      endsAt: endsOn ? new Date(`${endsOn}T00:00:00Z`) : null,
      lines: [{ serviceId: service.id, quantity: 1 }],
    },
  });
  return { ...m, company, service, contract };
}
const options = (patch: Record<string, unknown> = {}) => ({
  enabled: true,
  startsOn: today(),
  horizonMonths: 3,
  prorateFinal: false,
  categoryId: null,
  version: 0,
  ...patch,
});
async function enable(m: Awaited<ReturnType<typeof seed>>) {
  return configureBilling(m.workspace.id, m.contract.id, m.user.id, options());
}
beforeEach(() => resetTestDatabase());
describe("Integração de contratos com financeiro", () => {
  it("não gera cobranças de contratos antigos antes da ativação", async () => {
    const m = await seed();
    expect(await loadEntries(m.workspace.id)).toHaveLength(0);
    await runContractBilling();
    expect(await loadEntries(m.workspace.id)).toHaveLength(0);
  });
  it("gera mensalidades por ciclo e repetir a rotina não duplica", async () => {
    const m = await seed();
    await enable(m);
    const rows = await loadEntries(m.workspace.id);
    expect(rows).toHaveLength(4);
    expect(new Set(rows.map((e) => e.cycleStart)).size).toBe(4);
    await generateContract(m.workspace.id, m.contract.id, m.user.id);
    expect(await loadEntries(m.workspace.id)).toHaveLength(4);
  });
  it("cancela também cobranças já emitidas além de um horizonte reduzido", async () => {
    const m = await seed();
    await configureBilling(
      m.workspace.id,
      m.contract.id,
      m.user.id,
      options({ horizonMonths: 24 }),
    );
    const initial = await loadEntries(m.workspace.id);
    expect(initial).toHaveLength(25);
    const [config] = await db.select().from(schema.financeContractBillingTable);
    if (!config) throw new Error("Sem configuração");
    await configureBilling(
      m.workspace.id,
      m.contract.id,
      m.user.id,
      options({ horizonMonths: 1, version: config.version }),
    );
    await transitionContract({
      workspaceId: m.workspace.id,
      contractId: m.contract.id,
      actorUserId: m.user.id,
      action: "pause",
    });
    const after = await loadEntries(m.workspace.id);
    expect(after).toHaveLength(25);
    expect(after.every((entry) => entry.cancelledAt !== null)).toBe(true);
  });
  it("gera contrato anual pelo valor anual e respeita fim", async () => {
    const end = plusDays(addMonths(today(), 12), -1);
    const m = await seed("yearly", end);
    await configureBilling(
      m.workspace.id,
      m.contract.id,
      m.user.id,
      options({ horizonMonths: 12 }),
    );
    const rows = await loadEntries(m.workspace.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.amountCents).toBe(120000);
  });
  it("preserva cobranças já baixadas quando pausa o contrato", async () => {
    const m = await seed();
    await enable(m);
    const rows = await loadEntries(m.workspace.id);
    const future = rows.find((e) => e.cycleStart === addMonths(today(), 1));
    if (!future) throw new Error("Sem ciclo futuro");
    await settleEntry(m.workspace.id, m.user.id, future.id, {
      requestId: crypto.randomUUID(),
      date: today(),
      principalCents: future.amountCents,
      discountCents: 0,
      interestCents: 0,
      fineCents: 0,
      notes: "Antecipação",
    });
    await transitionContract({
      workspaceId: m.workspace.id,
      contractId: m.contract.id,
      actorUserId: m.user.id,
      action: "pause",
    });
    const after = await loadEntries(m.workspace.id);
    expect(after.find((e) => e.id === future.id)?.cancelledAt).toBeNull();
    expect(
      after.filter((e) => e.id !== future.id).every((e) => e.cancelledAt),
    ).toBe(true);
    const [config] = await db.select().from(schema.financeContractBillingTable);
    expect(config?.lastWarning).toContain("já possui baixa");
  });
  it("retomada futura mantém ciclos suspensos cancelados", async () => {
    const m = await seed();
    await enable(m);
    const pauseOn = addMonths(today(), 1);
    const resumeOn = addMonths(today(), 2);
    await transitionContract({
      workspaceId: m.workspace.id,
      contractId: m.contract.id,
      actorUserId: m.user.id,
      action: "pause",
      occurredAt: new Date(`${pauseOn}T12:00:00Z`),
    });
    await transitionContract({
      workspaceId: m.workspace.id,
      contractId: m.contract.id,
      actorUserId: m.user.id,
      action: "resume",
      occurredAt: new Date(`${resumeOn}T12:00:00Z`),
    });
    const rows = await loadEntries(m.workspace.id);
    expect(
      rows.find((e) => e.cycleStart === pauseOn)?.cancelledAt,
    ).not.toBeNull();
    expect(rows.find((e) => e.cycleStart === resumeOn)?.cancelledAt).toBeNull();
  });
  it("reajuste altera só ciclos futuros e guarda os serviços antigos", async () => {
    const m = await seed();
    await enable(m);
    const at = addMonths(today(), 1);
    await changeContractValue({
      workspaceId: m.workspace.id,
      contractId: m.contract.id,
      actorUserId: m.user.id,
      occurredAt: new Date(`${at}T12:00:00Z`),
      lines: [{ serviceId: m.service.id, quantity: 1, unitPriceCents: 20000 }],
    });
    const rows = await loadEntries(m.workspace.id);
    expect(rows.find((e) => e.cycleStart === today())?.amountCents).toBe(10000);
    expect(rows.find((e) => e.cycleStart === at)?.amountCents).toBe(20000);
    const revisions = await db
      .select()
      .from(schema.financeContractRevisionTable);
    expect(revisions).toHaveLength(2);
    expect(revisions[0]?.items[0]?.amountCents).toBe(10000);
  });
  it("cancela ciclos fora da vigência ao encurtar o contrato", async () => {
    const m = await seed();
    await enable(m);
    const end = plusDays(addMonths(today(), 1), -1);
    await updateContract({
      workspaceId: m.workspace.id,
      contractId: m.contract.id,
      actorUserId: m.user.id,
      input: { endsAt: new Date(`${end}T00:00:00Z`) },
    });
    const rows = await loadEntries(m.workspace.id);
    expect(rows.filter((e) => !e.cancelledAt)).toHaveLength(1);
  });
  it("renova vigência sem duplicar cobranças e registra auditoria", async () => {
    const m = await seed("monthly", plusDays(addMonths(today(), 1), -1));
    await enable(m);
    await renewContract(
      m.workspace.id,
      m.contract.id,
      m.user.id,
      plusDays(addMonths(today(), 3), -1),
      "Renovação acordada",
    );
    expect(
      (await loadEntries(m.workspace.id)).filter((e) => !e.cancelledAt),
    ).toHaveLength(3);
    const logs = await db
      .select()
      .from(schema.auditLogTable)
      .where(eq(schema.auditLogTable.action, "finance.contract.renovacao"));
    expect(logs).toHaveLength(1);
  });
  it("desativa automação cancelando apenas cobranças sem baixa", async () => {
    const m = await seed();
    await enable(m);
    await configureBilling(
      m.workspace.id,
      m.contract.id,
      m.user.id,
      options({ enabled: false, version: 1 }),
    );
    expect(
      (await loadEntries(m.workspace.id)).every((e) => e.cancelledAt),
    ).toBe(true);
    await runContractBilling();
    expect(
      (await loadEntries(m.workspace.id)).every((e) => e.cancelledAt),
    ).toBe(true);
  });
  it("impede edição manual de títulos gerenciados pelo contrato", async () => {
    const m = await seed();
    await enable(m);
    const [entry] = await loadEntries(m.workspace.id);
    if (!entry) throw new Error("Sem cobrança");
    await expect(
      updateEntry(m.workspace.id, m.user.id, entry.id, {
        description: "Edição",
        direction: "receivable",
        kind: "operating",
        amountCents: 2000,
        competenceDate: today(),
        dueDate: today(),
        categoryId: null,
        partyId: null,
        partyName: "Cliente",
        companyId: m.company.id,
        serviceId: m.service.id,
        sellerId: m.user.id,
        paymentMethod: "pix",
        notes: "",
        version: entry.version,
      }),
    ).rejects.toThrow("gerenciada pelo contrato");
  });
  it("rejeita acesso externo e vendedor sem permissão financeira", async () => {
    const a = await seed();
    const b = await seed();
    const res = await appFor(a.user.id).request(
      `/finance/${b.workspace.id}/recurrence/report?from=${today()}&to=${today()}`,
    );
    expect(res.status).toBe(403);
    const seller = await seed("monthly", null, "sales");
    expect(
      (
        await appFor(seller.user.id).request(
          `/finance/${seller.workspace.id}/recurrence/report?from=${today()}&to=${today()}`,
        )
      ).status,
    ).toBe(403);
  });
  it("dashboard separa contratado cobrado recebido e total dos gráficos", async () => {
    const m = await seed();
    await enable(m);
    const rows = await loadEntries(m.workspace.id);
    const entry = rows.find((e) => e.cycleStart === today());
    if (!entry) throw new Error("Sem cobrança");
    await settleEntry(m.workspace.id, m.user.id, entry.id, {
      requestId: crypto.randomUUID(),
      date: today(),
      principalCents: 4000,
      discountCents: 0,
      interestCents: 0,
      fineCents: 0,
      notes: "",
    });
    const report = recurrenceReport(await loadPortfolio(m.workspace.id), {
      from: today(),
      to: today(),
    });
    expect(report.current.mrrCents).toBe(10000);
    expect(report.current.billedCents).toBe(10000);
    expect(report.current.receivedCents).toBe(4000);
    expect(report.current.outstandingCents).toBe(6000);
    expect(report.months.reduce((s, m) => s + m.receivedCents, 0)).toBe(4000);
  });
  it("exporta todos os contratos em xlsx e PDF verdadeiros", async () => {
    const m = await seed();
    await enable(m);
    const app = appFor(m.user.id);
    const query = `from=${today()}&to=${today()}`;
    const xlsx = await app.request(
      `/finance/${m.workspace.id}/recurrence/export/xlsx?${query}`,
    );
    expect(xlsx.status).toBe(200);
    const requireApi = createRequire(
      new URL("../../apps/api/package.json", import.meta.url),
    );
    const { Workbook } = requireApi("exceljs");
    const book = new Workbook();
    await book.xlsx.load(Buffer.from(await xlsx.arrayBuffer()));
    expect(book.getWorksheet("Contratos").rowCount).toBe(3);
    const pdf = await app.request(
      `/finance/${m.workspace.id}/recurrence/export/pdf?${query}`,
    );
    expect(
      Buffer.from(await pdf.arrayBuffer())
        .subarray(0, 4)
        .toString(),
    ).toBe("%PDF");
  });
});
