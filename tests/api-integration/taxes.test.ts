import { createRequire } from "node:module";
import { defaultRolePayloads } from "@kaneo/permissions";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { beforeEach, describe, expect, it } from "vitest";
import db, { schema } from "../../apps/api/src/database";
import finance from "../../apps/api/src/finance";
import { loadEntries } from "../../apps/api/src/finance/controllers/finance";
import { today } from "../../apps/api/src/finance/model";
import { saveRule } from "../../apps/api/src/finance/performance/controller";
import {
  calculate,
  configuration,
  profileHistory,
  report,
  saveProfile,
  saveSimulation,
} from "../../apps/api/src/finance/taxes/controllers/taxes";
import type {
  CalculationInput,
  ProfileInput,
} from "../../apps/api/src/finance/taxes/validation";
import { resetTestDatabase } from "./helpers/database";
import { createWorkspaceMember } from "./helpers/fixtures";

function appFor(
  userId: string,
  apiKey?: { permissions: Record<string, string[]> },
) {
  const app = new Hono<{ Variables: { userId: string; apiKey: unknown } }>();
  app.use("*", async (c, next) => {
    c.set("userId", userId);
    if (apiKey) c.set("apiKey", apiKey);
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
      name: "Serviço de teste",
      billingType: "monthly",
      defaultPriceCents: 10000,
    })
    .returning();
  if (!service) throw new Error("Sem serviço");
  const profileInput: ProfileInput = {
    name: "Perfil cartão",
    notes: "Parâmetros informados",
    isActive: true,
    version: 0,
    items: [
      { name: "Imposto informado", kind: "tax", rateBps: 600, fixedCents: 0 },
      { name: "Taxa de pagamento", kind: "fee", rateBps: 300, fixedCents: 50 },
    ],
  };
  const profile = await saveProfile(m.workspace.id, m.user.id, profileInput);
  const input: CalculationInput = {
    profileId: profile.id,
    profileVersion: profile.version,
    date: today(),
    mode: "net",
    amountCents: 10000,
    costCents: 1000,
    commissionMode: "manual",
    commissionRateBps: 500,
    serviceId: service.id,
    sellerId: m.user.id,
  };
  return {
    ...m,
    service,
    profile,
    profileInput,
    input,
    app: appFor(m.user.id),
    base: `/finance/${m.workspace.id}/taxes`,
  };
}
type Seed = Awaited<ReturnType<typeof seed>>;
async function save(
  m: Seed,
  patch: Partial<{
    title: string;
    requestId: string;
    calculation: CalculationInput;
    calculationSignature: string;
  }> = {},
) {
  const calculated = await calculate(m.workspace.id, m.input);
  return saveSimulation(m.workspace.id, m.user.id, {
    calculation: m.input,
    calculationSignature: calculated.calculationSignature,
    title: "Simulação de teste",
    requestId: crypto.randomUUID(),
    ...patch,
  });
}
function send(
  app: ReturnType<typeof appFor>,
  path: string,
  body: unknown,
  method = "POST",
) {
  return app.request(path, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
beforeEach(() => resetTestDatabase());
describe("Fase 4: taxas e calculadora de vendas", () => {
  it("cria perfil, calcula o líquido alvo e não gera lançamentos financeiros", async () => {
    const m = await seed();
    const computed = await calculate(m.workspace.id, m.input);
    expect(computed.snapshot.result.netCents).toBeGreaterThanOrEqual(10000);
    expect(computed.snapshot.result.grossCents).toBeGreaterThan(10000);
    expect(await loadEntries(m.workspace.id)).toHaveLength(0);
    const saved = await save(m);
    expect(saved.snapshot.result).toEqual(computed.snapshot.result);
    expect(await loadEntries(m.workspace.id)).toHaveLength(0);
  });
  it("preserva parâmetros e nomes ao editar o perfil e o serviço", async () => {
    const m = await seed();
    const saved = await save(m);
    await saveProfile(
      m.workspace.id,
      m.user.id,
      { ...m.profileInput, name: "Novo perfil", version: 1, items: [] },
      m.profile.id,
    );
    await db
      .update(schema.crmServiceTable)
      .set({ name: "Serviço renomeado" })
      .where(eq(schema.crmServiceTable.id, m.service.id));
    const r = await report(m.workspace.id, { from: today(), to: today() });
    expect(r.rows[0]?.profileName).toBe("Perfil cartão");
    expect(r.rows[0]?.serviceName).toBe("Serviço de teste");
    expect(r.rows[0]?.result.grossCents).toBe(saved.snapshot.result.grossCents);
    expect(
      (await profileHistory(m.workspace.id, m.profile.id)).revisions,
    ).toHaveLength(2);
  });
  it("salva idempotentemente e rejeita reutilização com outro título", async () => {
    const m = await seed();
    const calculated = await calculate(m.workspace.id, m.input);
    const input = {
      calculation: m.input,
      calculationSignature: calculated.calculationSignature,
      title: "Cenário",
      requestId: crypto.randomUUID(),
    };
    const first = await saveSimulation(m.workspace.id, m.user.id, input);
    const second = await saveSimulation(m.workspace.id, m.user.id, input);
    expect(second.id).toBe(first.id);
    await expect(
      saveSimulation(m.workspace.id, m.user.id, {
        ...input,
        title: "Outro cenário",
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect(
      (await report(m.workspace.id, { from: today(), to: today() })).total,
    ).toBe(1);
  });
  it("rejeita cálculo com versão antiga e conflito de edição", async () => {
    const m = await seed();
    await saveProfile(
      m.workspace.id,
      m.user.id,
      { ...m.profileInput, version: 1 },
      m.profile.id,
    );
    await expect(calculate(m.workspace.id, m.input)).rejects.toMatchObject({
      status: 409,
    });
    await expect(
      saveProfile(
        m.workspace.id,
        m.user.id,
        { ...m.profileInput, version: 1 },
        m.profile.id,
      ),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("inativação bloqueia novos cálculos e mantém simulações anteriores", async () => {
    const m = await seed();
    const saved = await save(m);
    await saveProfile(
      m.workspace.id,
      m.user.id,
      { ...m.profileInput, isActive: false, version: 1 },
      m.profile.id,
    );
    await expect(
      calculate(m.workspace.id, { ...m.input, profileVersion: 2 }),
    ).rejects.toMatchObject({ status: 400 });
    const r = await report(m.workspace.id, { from: today(), to: today() });
    expect(r.rows[0]?.id).toBe(saved.id);
  });
  it("captura comissão vigente do serviço e exige recálculo se a regra mudar", async () => {
    const m = await seed();
    await saveRule(m.workspace.id, m.user.id, {
      serviceId: m.service.id,
      effectiveDate: today(),
      rateBps: 1000,
      basis: "received",
      version: 0,
    });
    const input = { ...m.input, commissionMode: "service" as const };
    const computed = await calculate(m.workspace.id, input);
    expect(computed.snapshot.input.commissionRateBps).toBe(1000);
    await saveRule(m.workspace.id, m.user.id, {
      serviceId: m.service.id,
      effectiveDate: today(),
      rateBps: 1500,
      basis: "billed",
      version: 1,
    });
    await expect(
      saveSimulation(m.workspace.id, m.user.id, {
        calculation: input,
        calculationSignature: computed.calculationSignature,
        title: "Comissão antiga",
        requestId: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("não assume comissão zero quando a opção é usar regra sem cadastro", async () => {
    const m = await seed();
    await expect(
      calculate(m.workspace.id, { ...m.input, commissionMode: "service" }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      calculate(m.workspace.id, {
        ...m.input,
        commissionMode: "service",
        serviceId: null,
      }),
    ).rejects.toMatchObject({ status: 400 });
  });
  it("rejeita percentuais agregados incompatíveis e payload de resultado forjado", async () => {
    const m = await seed();
    const bad = await send(m.app, `${m.base}/calculate`, {
      ...m.input,
      commissionRateBps: 9500,
    });
    expect(bad.status).toBe(400);
    const forged = await send(m.app, `${m.base}/simulations`, {
      calculation: m.input,
      calculationSignature: "forjado",
      title: "Fraude",
      requestId: crypto.randomUUID(),
      result: { netCents: 999999999 },
    });
    expect(forged.status).toBe(409);
  });
  it("valida nomes duplicados, limites de itens e datas pela API", async () => {
    const m = await seed();
    const duplicate = await send(m.app, `${m.base}/profiles`, {
      ...m.profileInput,
      items: [m.profileInput.items[0], m.profileInput.items[0]],
    });
    expect(duplicate.status).toBe(400);
    const excessive = await send(m.app, `${m.base}/profiles`, {
      ...m.profileInput,
      items: Array.from({ length: 21 }, (_, i) => ({
        name: `Taxa ${i}`,
        kind: "fee",
        rateBps: 0,
        fixedCents: 0,
      })),
    });
    expect(excessive.status).toBe(400);
    const invalid = await send(m.app, `${m.base}/calculate`, {
      ...m.input,
      date: "2026-02-30",
    });
    expect(invalid.status).toBe(400);
  });
  it("isola perfis, serviços e vendedores de outros workspaces", async () => {
    const m = await seed();
    const other = await seed();
    await expect(calculate(other.workspace.id, m.input)).rejects.toMatchObject({
      status: 404,
    });
    await expect(
      calculate(m.workspace.id, { ...m.input, serviceId: other.service.id }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      calculate(m.workspace.id, { ...m.input, sellerId: other.user.id }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      profileHistory(other.workspace.id, m.profile.id),
    ).rejects.toMatchObject({ status: 404 });
    expect((await configuration(other.workspace.id)).profiles).toHaveLength(1);
  });
  it("respeita permissões de leitura, configuração, gravação e exportação", async () => {
    const m = await seed();
    const sales = await seed("sales");
    expect(
      (await sales.app.request(`${sales.base}/configuration`)).status,
    ).toBe(403);
    expect((await sales.app.request(`${m.base}/configuration`)).status).toBe(
      403,
    );
    const read = appFor(m.user.id, { permissions: { finance: ["read"] } });
    expect((await send(read, `${m.base}/calculate`, m.input)).status).toBe(200);
    expect(
      (await send(read, `${m.base}/profiles`, m.profileInput)).status,
    ).toBe(403);
    const calculated = await calculate(m.workspace.id, m.input);
    expect(
      (
        await send(read, `${m.base}/simulations`, {
          calculation: m.input,
          calculationSignature: calculated.calculationSignature,
          title: "Sem permissão",
          requestId: crypto.randomUUID(),
        })
      ).status,
    ).toBe(403);
    expect(
      (await read.request(`${m.base}/export/pdf?from=${today()}&to=${today()}`))
        .status,
    ).toBe(403);
  });
  it("filtra simulações por perfil, serviço, vendedor e data", async () => {
    const m = await seed();
    await save(m);
    const r = await report(m.workspace.id, {
      from: today(),
      to: today(),
      profileId: m.profile.id,
      serviceId: m.service.id,
      sellerId: m.user.id,
    });
    expect(r.total).toBe(1);
    expect(r.current.simulatedTaxCents).toBeGreaterThan(0);
    const empty = await report(m.workspace.id, {
      from: today(),
      to: today(),
      profileId: "other",
    });
    expect(empty.total).toBe(0);
  });
  it("exporta arquivos reais com parâmetros e resultados salvos", async () => {
    const m = await seed();
    const saved = await save(m);
    const x = await m.app.request(
      `${m.base}/export/xlsx?from=${today()}&to=${today()}`,
    );
    expect(x.status).toBe(200);
    const require = createRequire(`${process.cwd()}/package.json`);
    const Excel = require("exceljs");
    const book = await new Excel.Workbook().xlsx.load(
      Buffer.from(await x.arrayBuffer()),
    );
    expect(book.getWorksheet("Simulações").rowCount).toBe(2);
    expect(book.getWorksheet("Simulações").getRow(2).getCell(1).value).toBe(
      saved.id,
    );
    expect(book.getWorksheet("Simulações").getRow(2).getCell(18).value).toBe(
      "Parâmetros informados",
    );
    expect(book.getWorksheet("Itens dos cálculos").rowCount).toBe(3);
    const pdf = await m.app.request(
      `${m.base}/export/pdf?from=${today()}&to=${today()}`,
    );
    expect(
      Buffer.from(await pdf.arrayBuffer())
        .subarray(0, 4)
        .toString(),
    ).toBe("%PDF");
  });
});
