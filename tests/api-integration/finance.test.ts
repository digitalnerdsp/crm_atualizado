import { createRequire } from "node:module";
import { defaultRolePayloads } from "@kaneo/permissions";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { beforeEach, describe, expect, it } from "vitest";
import db, { schema } from "../../apps/api/src/database";
import finance from "../../apps/api/src/finance";
import { resetTestDatabase } from "./helpers/database";
import { createWorkspaceMember } from "./helpers/fixtures";

const input = (patch: Record<string, unknown> = {}) => ({
  description: "Serviço mensal",
  direction: "receivable",
  kind: "operating",
  amountCents: 10001,
  competenceDate: "2026-01-01",
  dueDate: "2026-01-31",
  categoryId: null,
  partyId: null,
  partyName: "Cliente",
  companyId: null,
  serviceId: null,
  sellerId: null,
  paymentMethod: "pix",
  notes: "",
  requestId: crypto.randomUUID(),
  count: 1,
  intervalMonths: 1,
  schedule: "installments",
  ...patch,
});
const payment = (patch: Record<string, unknown> = {}) => ({
  requestId: crypto.randomUUID(),
  date: "2026-01-05",
  principalCents: 4000,
  discountCents: 200,
  interestCents: 100,
  fineCents: 50,
  notes: "Desconto acordado",
  ...patch,
});
function makeApp(
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
  app.onError((err, c) =>
    err instanceof HTTPException
      ? c.json({ message: err.message }, err.status)
      : c.json({ message: String(err) }, 500),
  );
  return app;
}
function send(
  app: ReturnType<typeof makeApp>,
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
async function seed(role: "admin" | "sales" = "admin") {
  const m = await createWorkspaceMember({ role });
  await db.insert(schema.workspaceRoleTable).values({
    workspaceId: m.workspace.id,
    role,
    permission: JSON.stringify(defaultRolePayloads[role]),
  });
  return { ...m, base: `/finance/${m.workspace.id}` };
}
beforeEach(() => resetTestDatabase());
describe("API financeira", () => {
  it("exige autenticação e permissão financeira", async () => {
    const m = await seed("sales");
    const app = makeApp(m.user.id);
    expect((await app.request(`${m.base}/metadata`)).status).toBe(403);
    expect((await makeApp("").request(`${m.base}/metadata`)).status).toBe(401);
  });
  it("isola workspaces, referências e escopos de chaves API", async () => {
    const a = await seed();
    const b = await seed();
    const app = makeApp(a.user.id);
    expect((await app.request(`${b.base}/metadata`)).status).toBe(403);
    const company = (
      await db
        .insert(schema.crmCompanyTable)
        .values({ name: "Outro cliente", workspaceId: b.workspace.id })
        .returning()
    )[0];
    if (!company) throw new Error("Falha ao criar cliente de teste.");
    expect(
      (await send(app, `${a.base}/entries`, input({ companyId: company.id })))
        .status,
    ).toBe(400);
    const limited = makeApp(a.user.id, { permissions: { finance: ["read"] } });
    expect((await send(limited, `${a.base}/entries`, input())).status).toBe(
      403,
    );
  });
  it("gera parcelas exatas e preserva idempotência da criação", async () => {
    const m = await seed();
    const app = makeApp(m.user.id);
    const payload = input({ count: 3 });
    const res = await send(app, `${m.base}/entries`, payload);
    expect(res.status).toBe(200);
    const rows = await res.json();
    expect(rows.map((r: { amountCents: number }) => r.amountCents)).toEqual([
      3334, 3334, 3333,
    ]);
    expect(rows.map((r: { dueDate: string }) => r.dueDate)).toEqual([
      "2026-01-31",
      "2026-02-28",
      "2026-03-31",
    ]);
    expect(
      (await (await send(app, `${m.base}/entries`, payload)).json()).map(
        (r: { id: string }) => r.id,
      ),
    ).toEqual(rows.map((r: { id: string }) => r.id));
    expect(
      (await send(app, `${m.base}/entries`, { ...payload, amountCents: 999 }))
        .status,
    ).toBe(409);
  });
  it("recorrência repete o valor por ciclo sem dividir o total", async () => {
    const m = await seed();
    const rows = await (
      await send(
        makeApp(m.user.id),
        `${m.base}/entries`,
        input({ count: 2, schedule: "recurring", intervalMonths: 12 }),
      )
    ).json();
    expect(rows.map((r: { amountCents: number }) => r.amountCents)).toEqual([
      10001, 10001,
    ]);
  });
  it("baixa parcial, duplicação, sobrepagamento, estorno e cancelamento", async () => {
    const m = await seed();
    const app = makeApp(m.user.id);
    const [entry] = await (
      await send(app, `${m.base}/entries`, input())
    ).json();
    const path = `${m.base}/entries/${entry.id}`;
    const p = payment();
    const res = await send(app, `${path}/settlements`, p);
    expect(res.status).toBe(200);
    const s = await res.json();
    expect((await (await send(app, `${path}/settlements`, p)).json()).id).toBe(
      s.id,
    );
    expect(
      (
        await send(
          app,
          `${path}/settlements`,
          payment({ principalCents: 7000 }),
        )
      ).status,
    ).toBe(409);
    expect(
      (await send(app, `${path}/cancel`, { reason: "Cancelamento" })).status,
    ).toBe(409);
    expect(
      (
        await send(app, `${path}/settlements/${s.id}/reverse`, {
          reason: "Correção",
        })
      ).status,
    ).toBe(200);
    expect(
      (await send(app, `${path}/cancel`, { reason: "Pedido cancelado" }))
        .status,
    ).toBe(200);
    const history = await (await app.request(`${path}/history`)).json();
    expect(history.map((r: { action: string }) => r.action)).toContain(
      "finance.reversed",
    );
  });
  it("recusa edição concorrente e edição após baixa", async () => {
    const m = await seed();
    const app = makeApp(m.user.id);
    const p = input();
    const [entry] = await (await send(app, `${m.base}/entries`, p)).json();
    expect(
      (
        await send(
          app,
          `${m.base}/entries/${entry.id}`,
          { ...p, version: 99 },
          "PATCH",
        )
      ).status,
    ).toBe(409);
    await send(app, `${m.base}/entries/${entry.id}/settlements`, payment());
    expect(
      (
        await send(
          app,
          `${m.base}/entries/${entry.id}`,
          { ...p, version: 2 },
          "PATCH",
        )
      ).status,
    ).toBe(409);
  });
  it("registra vínculo PJ e valida categoria e subtipo", async () => {
    const m = await seed();
    const app = makeApp(m.user.id);
    const category = await (
      await send(app, `${m.base}/categories`, {
        name: "Colaboradores",
        direction: "payable",
        parentId: null,
        isActive: true,
      })
    ).json();
    const party = await (
      await send(app, `${m.base}/parties`, {
        name: "PJ teste",
        laborType: "pj",
        isActive: true,
      })
    ).json();
    const res = await send(
      app,
      `${m.base}/entries`,
      input({
        direction: "payable",
        partyId: party.id,
        categoryId: category.id,
      }),
    );
    expect(res.status).toBe(200);
    const [entry] = await res.json();
    expect(entry.laborType).toBe("pj");
    expect(entry.partyName).toBe("PJ teste");
    expect(
      (await send(app, `${m.base}/entries`, input({ categoryId: category.id })))
        .status,
    ).toBe(400);
  });
  it("exporta além da página atual em formatos verdadeiros", async () => {
    const m = await seed();
    const app = makeApp(m.user.id);
    for (let i = 0; i < 3; i++)
      await send(
        app,
        `${m.base}/entries`,
        input({ count: 24, schedule: "recurring" }),
      );
    const query = "from=2026-01-01&to=2027-12-31&dateBasis=due";
    const list = await (await app.request(`${m.base}/entries?${query}`)).json();
    expect(list.total).toBe(72);
    expect(list.items).toHaveLength(50);
    const excel = await app.request(`${m.base}/export/xlsx?${query}`);
    expect(excel.status).toBe(200);
    const bytes = await excel.arrayBuffer();
    expect(Buffer.from(bytes).subarray(0, 2).toString()).toBe("PK");
    const requireApi = createRequire(
      new URL("../../apps/api/package.json", import.meta.url),
    );
    const ExcelJS = requireApi("exceljs");
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(Buffer.from(bytes));
    expect(book.getWorksheet("Lançamentos").rowCount).toBe(74);
    const pdf = await app.request(`${m.base}/export/pdf?${query}`);
    expect(pdf.status).toBe(200);
    expect(
      Buffer.from(await pdf.arrayBuffer())
        .subarray(0, 4)
        .toString(),
    ).toBe("%PDF");
  });
  it("rejeita datas inválidas e intervalos excessivos", async () => {
    const m = await seed();
    const app = makeApp(m.user.id);
    expect(
      (await send(app, `${m.base}/entries`, input({ dueDate: "2026-02-30" })))
        .status,
    ).toBe(400);
    expect(
      (
        await app.request(
          `${m.base}/dashboard?from=2026-10-16&to=2026-01-01&dateBasis=due`,
        )
      ).status,
    ).toBe(400);
  });
});
