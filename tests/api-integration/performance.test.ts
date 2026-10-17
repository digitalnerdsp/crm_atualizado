import { createRequire } from "node:module";
import { defaultRolePayloads } from "@kaneo/permissions";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { beforeEach, describe, expect, it } from "vitest";
import {
  createContract,
  transitionContract,
} from "../../apps/api/src/crm/contract/controllers/contracts";
import db, { schema } from "../../apps/api/src/database";
import finance from "../../apps/api/src/finance";
import {
  cancelEntry,
  createEntries,
  loadEntries,
  reverseSettlement,
  settleEntry,
  updateEntry,
} from "../../apps/api/src/finance/controllers/finance";
import { today } from "../../apps/api/src/finance/model";
import {
  applyRule,
  classify,
  issueCommission,
  report,
  saveRule,
  saveSettings,
} from "../../apps/api/src/finance/performance/controller";
import { configureBilling } from "../../apps/api/src/finance/recurrence/billing";
import type { EntryInput } from "../../apps/api/src/finance/validation";
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
async function seed(role: "admin" | "sales" = "admin") {
  const m = await createWorkspaceMember({ role });
  await db.insert(schema.workspaceRoleTable).values({
    workspaceId: m.workspace.id,
    role,
    permission: JSON.stringify(defaultRolePayloads[role]),
  });
  const [service] = await db
    .insert(schema.crmServiceTable)
    .values({
      workspaceId: m.workspace.id,
      name: "Serviço mensal",
      billingType: "monthly",
      defaultPriceCents: 10000,
    })
    .returning();
  if (!service) throw new Error("Sem serviço");
  const input: EntryInput = {
    requestId: crypto.randomUUID(),
    description: "Venda de serviço",
    direction: "receivable",
    kind: "operating",
    amountCents: 10000,
    competenceDate: today(),
    dueDate: today(),
    categoryId: null,
    partyId: null,
    partyName: "Cliente",
    companyId: null,
    serviceId: service.id,
    sellerId: m.user.id,
    paymentMethod: "pix",
    notes: "",
    count: 1,
    intervalMonths: 1,
    schedule: "installments",
  };
  return {
    ...m,
    service,
    input,
    app: appFor(m.user.id),
    base: `/finance/${m.workspace.id}/performance`,
  };
}
type Seed = Awaited<ReturnType<typeof seed>>;
async function rule(
  m: Seed,
  basis: "received" | "billed" = "received",
  rateBps = 1000,
  version = 0,
) {
  return saveRule(m.workspace.id, m.user.id, {
    serviceId: m.service.id,
    effectiveDate: today(),
    rateBps,
    basis,
    version,
  });
}
async function invoice(m: Seed) {
  const [e] = await createEntries(m.workspace.id, m.user.id, m.input);
  if (!e) throw new Error("Sem cobrança");
  return e;
}
async function reload(_m: Seed, id: string) {
  const [e] = await db
    .select()
    .from(schema.financeEntryTable)
    .where(eq(schema.financeEntryTable.id, id));
  if (!e) throw new Error("Sem cobrança");
  return e;
}
async function issue(m: Seed, id: string, requestId = crypto.randomUUID()) {
  const e = await reload(m, id);
  return issueCommission(m.workspace.id, m.user.id, id, {
    requestId,
    dueDate: today(),
    version: e.version,
  });
}
async function payment(
  m: Seed,
  id: string,
  principalCents: number,
  discountCents = 0,
) {
  return settleEntry(m.workspace.id, m.user.id, id, {
    requestId: crypto.randomUUID(),
    date: today(),
    principalCents,
    discountCents,
    interestCents: 0,
    fineCents: 0,
    notes: discountCents ? "Desconto" : "",
  });
}
const range = () => ({ from: today(), to: today() });
beforeEach(() => resetTestDatabase());
describe("Fase 3: comissões e resultados integrados", () => {
  it("registra regra imutável na cobrança, sem alterar percentuais existentes", async () => {
    const m = await seed();
    await rule(m);
    const first = await invoice(m);
    await rule(m, "received", 2000, 1);
    const [next] = await createEntries(m.workspace.id, m.user.id, {
      ...m.input,
      requestId: crypto.randomUUID(),
    });
    expect((await reload(m, first.id)).commissionRateBps).toBe(1000);
    expect(next?.commissionRateBps).toBe(2000);
  });
  it("cria títulos de comissão pelo recebido após descontos e sem duplicação", async () => {
    const m = await seed();
    await rule(m);
    const e = await invoice(m);
    await payment(m, e.id, 4000, 200);
    const requestId = crypto.randomUUID();
    const p = await issue(m, e.id, requestId);
    expect(p.amountCents).toBe(380);
    const retry = await issue(m, e.id, requestId);
    expect(retry.id).toBe(p.id);
    await expect(issue(m, e.id)).rejects.toMatchObject({ status: 409 });
    expect(
      (await loadEntries(m.workspace.id)).filter(
        (e) => e.direction === "payable",
      ),
    ).toHaveLength(1);
  });
  it("gera somente a diferença após outra baixa parcial", async () => {
    const m = await seed();
    await rule(m);
    const e = await invoice(m);
    await payment(m, e.id, 4000);
    await issue(m, e.id);
    await payment(m, e.id, 6000);
    const second = await issue(m, e.id);
    expect(second.amountCents).toBe(600);
    expect(
      (await report(m.workspace.id, range())).current.commissionCents,
    ).toBe(1000);
  });
  it("registra pagamentos de comissão e não duplica despesa no lucro", async () => {
    const m = await seed();
    await rule(m, "billed");
    const e = await invoice(m);
    const p = await issue(m, e.id);
    await payment(m, p.id, 1000);
    const r = await report(m.workspace.id, range());
    expect(r.current.netProfitCents).toBe(9000);
    expect(r.current.manualCommissionCents).toBe(0);
    expect(r.totals.paidPeriodCents).toBe(1000);
    expect(r.current.cashExpenseCents).toBe(1000);
  });
  it("sinaliza saldo emitido a maior depois de estornar o recebimento", async () => {
    const m = await seed();
    await rule(m);
    const e = await invoice(m);
    const s = await payment(m, e.id, 10000);
    if (!s) throw new Error("Sem baixa");
    await issue(m, e.id);
    await reverseSettlement(
      m.workspace.id,
      m.user.id,
      e.id,
      s.id,
      "Estorno do cliente",
    );
    const r = await report(m.workspace.id, range());
    expect(r.totals.overallocatedCents).toBe(1000);
    expect(r.current.commissionCents).toBe(0);
    await expect(issue(m, e.id)).rejects.toMatchObject({ status: 409 });
  });
  it("permite regenerar comissão cujo título ainda não pago foi cancelado", async () => {
    const m = await seed();
    await rule(m, "billed");
    const e = await invoice(m);
    const first = await issue(m, e.id);
    await cancelEntry(
      m.workspace.id,
      m.user.id,
      first.id,
      "Refazer vencimento",
    );
    const second = await issue(m, e.id);
    expect(second.id).not.toBe(first.id);
    expect(second.amountCents).toBe(1000);
  });
  it("protege títulos de comissão gerados contra edição manual", async () => {
    const m = await seed();
    await rule(m, "billed");
    const e = await invoice(m);
    const p = await issue(m, e.id);
    const { requestId, count, intervalMonths, schedule, ...fields } = m.input;
    await expect(
      updateEntry(m.workspace.id, m.user.id, p.id, {
        ...fields,
        direction: "payable",
        version: p.version,
      }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      updateEntry(m.workspace.id, m.user.id, e.id, {
        ...fields,
        version: e.version,
      }),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("classifica despesas já baixadas sem alterar valores ou pagamentos", async () => {
    const m = await seed();
    const [e] = await createEntries(m.workspace.id, m.user.id, {
      ...m.input,
      direction: "payable",
      amountCents: 3000,
    });
    if (!e) throw new Error("Sem despesa");
    await payment(m, e.id, 3000);
    const current = await reload(m, e.id);
    const classified = await classify(m.workspace.id, m.user.id, e.id, {
      resultClass: "direct",
      version: current.version,
    });
    expect(classified?.amountCents).toBe(3000);
    const r = await report(m.workspace.id, range());
    expect(r.current.directCents).toBe(3000);
    expect(r.current.cashExpenseCents).toBe(3000);
    await expect(
      classify(m.workspace.id, m.user.id, e.id, {
        resultClass: "tax",
        version: current.version,
      }),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("aplica regra explicitamente a cobrança existente atual sem baixa", async () => {
    const m = await seed();
    const e = await invoice(m);
    await rule(m);
    const after = await applyRule(m.workspace.id, m.user.id, e.id, e.version);
    expect(after?.commissionRateBps).toBe(1000);
    await expect(
      applyRule(m.workspace.id, m.user.id, e.id, after?.version ?? 0),
    ).rejects.toMatchObject({ status: 400 });
  });
  it("não aplica regra retroativamente nem em cobrança com baixa", async () => {
    const m = await seed();
    const e = await invoice(m);
    await rule(m);
    await payment(m, e.id, 100);
    const current = await reload(m, e.id);
    await expect(
      applyRule(m.workspace.id, m.user.id, e.id, current.version),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      saveRule(m.workspace.id, m.user.id, {
        serviceId: m.service.id,
        effectiveDate: "2020-01-01",
        rateBps: 2000,
        basis: "billed",
        version: 1,
      }),
    ).rejects.toMatchObject({ status: 400 });
  });
  it("valida versão de regra e simulação de presunção", async () => {
    const m = await seed();
    await rule(m, "billed");
    await expect(rule(m, "billed", 500, 0)).rejects.toMatchObject({
      status: 409,
    });
    await invoice(m);
    await saveSettings(m.workspace.id, m.user.id, {
      presumptionBps: 3200,
      version: 0,
    });
    expect(
      (await report(m.workspace.id, range())).current.presumedProfitCents,
    ).toBe(3200);
    await expect(
      saveSettings(m.workspace.id, m.user.id, {
        presumptionBps: 1600,
        version: 0,
      }),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("isola dados e impede o perfil comercial de acessar finanças", async () => {
    const m = await seed();
    const other = await seed("sales");
    await rule(m);
    const e = await invoice(m);
    expect(
      (
        await other.app.request(
          `/finance/${m.workspace.id}/performance/configuration`,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await other.app.request(
          `${other.base}/report?from=${today()}&to=${today()}`,
        )
      ).status,
    ).toBe(403);
    await expect(
      applyRule(other.workspace.id, other.user.id, e.id, e.version),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      saveRule(other.workspace.id, other.user.id, {
        serviceId: m.service.id,
        effectiveDate: today(),
        rateBps: 500,
        basis: "billed",
        version: 0,
      }),
    ).rejects.toMatchObject({ status: 404 });
  });
  it("valida limites de percentual e datas pela API", async () => {
    const m = await seed();
    const res = await m.app.request(`${m.base}/rules`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        serviceId: m.service.id,
        effectiveDate: today(),
        rateBps: 10001,
        basis: "billed",
        version: 0,
      }),
    });
    expect(res.status).toBe(400);
    const rangeRes = await m.app.request(
      `${m.base}/report?from=2027-01-01&to=2026-01-01`,
    );
    expect(rangeRes.status).toBe(400);
  });
  it("contratos recorrentes capturam comissão e preservam títulos com comissão emitida", async () => {
    const m = await seed();
    await rule(m, "billed");
    const [company] = await db
      .insert(schema.crmCompanyTable)
      .values({
        workspaceId: m.workspace.id,
        name: "Cliente contratual",
        billingDay: 15,
      })
      .returning();
    if (!company) throw new Error("Sem cliente");
    const c = await createContract({
      workspaceId: m.workspace.id,
      actorUserId: m.user.id,
      input: {
        companyId: company.id,
        title: "Contrato",
        ownerUserId: m.user.id,
        startsAt: new Date(`${today()}T00:00:00Z`),
        lines: [{ serviceId: m.service.id, quantity: 1 }],
      },
    });
    await configureBilling(m.workspace.id, c.id, m.user.id, {
      enabled: true,
      startsOn: today(),
      horizonMonths: 1,
      prorateFinal: false,
      categoryId: null,
      version: 0,
    });
    const entries = await loadEntries(m.workspace.id);
    const e = entries.find(
      (e) => e.contractId === c.id && e.competenceDate === today(),
    );
    if (!e) throw new Error("Sem título");
    expect(e.commissionRateBps).toBe(1000);
    await issue(m, e.id);
    await transitionContract({
      workspaceId: m.workspace.id,
      contractId: c.id,
      actorUserId: m.user.id,
      action: "pause",
    });
    expect((await reload(m, e.id)).cancelledAt).toBeNull();
    const [config] = await db.select().from(schema.financeContractBillingTable);
    expect(config?.lastWarning).toContain("comissão emitida");
  });
  it("exporta Excel e PDF válidos e permite consultar o título vinculado", async () => {
    const m = await seed();
    await rule(m, "billed");
    const e = await invoice(m);
    const p = await issue(m, e.id);
    const x = await m.app.request(
      `${m.base}/export/xlsx?from=${today()}&to=${today()}`,
    );
    expect(x.status).toBe(200);
    const require = createRequire(`${process.cwd()}/package.json`);
    const Excel = require("exceljs");
    const book = await new Excel.Workbook().xlsx.load(
      Buffer.from(await x.arrayBuffer()),
    );
    expect(book.getWorksheet("Comissões").rowCount).toBe(3);
    expect(
      book.getWorksheet("Títulos de comissão").getRow(2).getCell(2).value,
    ).toBe(p.id);
    const pdfRes = await m.app.request(
      `${m.base}/export/pdf?from=${today()}&to=${today()}`,
    );
    expect(
      Buffer.from(await pdfRes.arrayBuffer())
        .subarray(0, 4)
        .toString(),
    ).toBe("%PDF");
    const detail = await m.app.request(
      `/finance/${m.workspace.id}/entries/${p.id}`,
    );
    expect(detail.status).toBe(200);
    expect((await detail.json()).amountCents).toBe(1000);
  });
});
