import { createRequire } from "node:module";
import { defaultRolePayloads } from "@kaneo/permissions";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { beforeEach, describe, expect, it } from "vitest";
import db, { schema } from "../../apps/api/src/database";
import finance from "../../apps/api/src/finance";
import { today } from "../../apps/api/src/finance/model";
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
  return {
    ...m,
    base: `/finance/${m.workspace.id}/bi`,
    range: `from=${today().slice(0, 7)}-01&to=${today()}`,
  };
}
async function entries(workspaceId: string, count = 1) {
  return db
    .insert(schema.financeEntryTable)
    .values(
      Array.from({ length: count }, (_, i) => ({
        workspaceId,
        description: `Serviço ${i}`,
        direction: "receivable" as const,
        kind: "operating" as const,
        amountCents: 10000,
        competenceDate: today(),
        dueDate: today(),
        partyName: "Cliente",
        paymentMethod: "pix",
        seriesId: crypto.randomUUID(),
        requestSignature: "bi-fixture",
      })),
    )
    .returning();
}
beforeEach(() => resetTestDatabase());
describe("API de BI financeiro", () => {
  it("exige autenticação e leitura financeira", async () => {
    const m = await seed("sales");
    expect(
      (await appFor("").request(`${m.base}/report?${m.range}`)).status,
    ).toBe(401);
    expect(
      (await appFor(m.user.id).request(`${m.base}/report?${m.range}`)).status,
    ).toBe(403);
  });
  it("isola workspace e parâmetros estrangeiros não expõem registros", async () => {
    const a = await seed();
    const b = await seed();
    await entries(b.workspace.id);
    const app = appFor(a.user.id);
    expect((await app.request(`${b.base}/report?${b.range}`)).status).toBe(403);
    const res = await app.request(
      `${a.base}/report?${a.range}&companyId=foreign`,
    );
    expect(res.status).toBe(200);
    expect((await res.json()).current.revenue).toBe(0);
  });
  it("relatório não devolve a base de lançamentos e detalhamento pagina 25", async () => {
    const m = await seed();
    await entries(m.workspace.id, 31);
    const app = appFor(m.user.id);
    const response = await app.request(`${m.base}/report?${m.range}`);
    expect(response.status).toBe(200);
    const report = await response.json();
    expect(report.current.revenue).toBe(310000);
    expect(report.details).toBeUndefined();
    expect(report.entries).toBeUndefined();
    expect(report.detailCounts.revenue).toBe(31);
    const first = await (
      await app.request(`${m.base}/details/revenue?${m.range}&page=1`)
    ).json();
    const second = await (
      await app.request(`${m.base}/details/revenue?${m.range}&page=2`)
    ).json();
    expect(first.rows).toHaveLength(25);
    expect(second.rows).toHaveLength(6);
    expect(first.value).toBe(310000);
    expect(response.headers.get("cache-control")).toContain("no-store");
  });
  it("não altera dados ao consultar e concilia o dashboard por baixa", async () => {
    const m = await seed();
    const [e] = await entries(m.workspace.id);
    if (!e) throw Error("fixture");
    await db.insert(schema.financeSettlementTable).values({
      entryId: e.id,
      principalCents: 4000,
      discountCents: 200,
      interestCents: 100,
      fineCents: 50,
      date: today(),
      requestId: crypto.randomUUID(),
    });
    const app = appFor(m.user.id);
    const bi = await (await app.request(`${m.base}/report?${m.range}`)).json();
    const old = await (
      await app.request(
        `/finance/${m.workspace.id}/dashboard?${m.range}&dateBasis=competence`,
      )
    ).json();
    expect(bi.current.received).toBe(old.current.income);
    expect(bi.current.receivable).toBe(old.current.pendingReceivable);
    expect(bi.current.movement).toBe(3950);
    const detail = await (
      await app.request(`${m.base}/details/net?${m.range}`)
    ).json();
    expect(
      detail.rows.reduce((s: number, r: { value: number }) => s + r.value, 0),
    ).toBe(detail.value);
    const after = await db.select().from(schema.financeEntryTable);
    expect(after).toHaveLength(1);
  });
  it("chave de API de leitura não exporta", async () => {
    const m = await seed();
    const app = appFor(m.user.id, { permissions: { finance: ["read"] } });
    expect((await app.request(`${m.base}/report?${m.range}`)).status).toBe(200);
    expect(
      (await app.request(`${m.base}/details/revenue?${m.range}`)).status,
    ).toBe(200);
    expect((await app.request(`${m.base}/export/xlsx?${m.range}`)).status).toBe(
      403,
    );
  });
  it("recusa página, datas, métrica, horizonte e formato inválidos", async () => {
    const m = await seed();
    const app = appFor(m.user.id);
    for (const suffix of [
      `details/revenue?${m.range}&page=-1`,
      `details/revenue?${m.range}&days=200`,
      `details/nope?${m.range}`,
      "report?from=2026-02-30&to=2026-03-01",
      "report?from=2020-01-01&to=2026-01-01",
      `export/csv?${m.range}`,
    ])
      expect((await app.request(`${m.base}/${suffix}`)).status).toBe(400);
  });
  it("exporta todos os resultados em Excel e PDF sem paginação da tela", async () => {
    const m = await seed();
    await entries(m.workspace.id, 31);
    const app = appFor(m.user.id);
    const x = await app.request(`${m.base}/export/xlsx?${m.range}`);
    expect(x.status).toBe(200);
    expect(x.headers.get("content-type")).toContain("spreadsheetml");
    const bytes = new Uint8Array(await x.arrayBuffer());
    expect(String.fromCharCode(...bytes.slice(0, 2))).toBe("PK");
    const require = createRequire(
      new URL("../../apps/api/package.json", import.meta.url),
    );
    const ExcelJS = require("exceljs");
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(bytes);
    const composition = book.getWorksheet("Composição 1");
    let revenueRows = 0;
    composition.eachRow(
      (row: { getCell: (n: number) => { value: unknown } }) => {
        if (row.getCell(1).value === "Receita faturada") revenueRows++;
      },
    );
    expect(revenueRows).toBe(31);
    const p = await app.request(`${m.base}/export/pdf?${m.range}`);
    expect(p.status).toBe(200);
    expect(new TextDecoder().decode((await p.arrayBuffer()).slice(0, 4))).toBe(
      "%PDF",
    );
  });
});
