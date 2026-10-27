import { defaultRolePayloads } from "@kaneo/permissions";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { beforeEach, describe, expect, it, vi } from "vitest";
import crm from "../../apps/api/src/crm";
import {
  createCompany,
  deleteCompany,
} from "../../apps/api/src/crm/company/controllers/upsert-company";
import {
  detail,
  report,
  type Scope,
  saveHosting,
} from "../../apps/api/src/crm/hosting/controllers/hosting";
import type { HostingInput } from "../../apps/api/src/crm/hosting/validation";
import db, { schema } from "../../apps/api/src/database";
import { today } from "../../apps/api/src/finance/model";
import { resetTestDatabase } from "./helpers/database";
import { createWorkspaceMember } from "./helpers/fixtures";
import { sendClientNoticeEmail } from "./mocks/email";

vi.mock("../../apps/api/src/settings/email-settings", () => ({
  getRuntimeSmtpEmailConfig: async () => ({
    host: "smtp.example.test",
    port: 587,
    from: "noreply@example.test",
    secure: false,
  }),
}));
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
  app.route("/crm", crm);
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
  const company = await createCompany({
    workspaceId: m.workspace.id,
    input: {
      name: "Cliente de hospedagem",
      status: "active",
      ownerUserId: m.user.id,
    },
    primaryContact: {
      firstName: "Cliente",
      email: "cliente@example.test",
      phone: "+55 (15) 99999-9999",
    },
  });
  const [service] = await db
    .insert(schema.crmServiceTable)
    .values({ workspaceId: m.workspace.id, name: "Site institucional" })
    .returning();
  if (!service || !company.primaryContact) throw new Error("Sem cadastro");
  const scope: Scope = {
    workspaceId: m.workspace.id,
    userId: m.user.id,
    visibility: role === "sales" ? "own" : "all",
  };
  const input: HostingInput = {
    mode: "third_party",
    provider: "Provedor terceiro",
    domain: "EXEMPLO.COM.BR",
    renewsOn: today(),
    leadDays: 30,
    contactId: company.primaryContact.id,
    emailAllowed: true,
    whatsappAllowed: true,
    notes: "Contrato com terceiro",
    serviceIds: [service.id],
    version: 0,
  };
  return {
    ...m,
    company,
    service,
    scope,
    input,
    app: appFor(m.user.id),
    base: `/crm/hosting/${m.workspace.id}`,
  };
}
type Seed = Awaited<ReturnType<typeof seed>>;
async function enable(m: Seed) {
  return saveHosting(m.scope, m.company.id, m.input);
}
const range = () => ({ from: today(), to: today() });
function post(
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
beforeEach(async () => {
  await resetTestDatabase();
  sendClientNoticeEmail.mockReset();
  sendClientNoticeEmail.mockResolvedValue({ success: true });
});
describe("Fase 5: carteira e hospedagem", () => {
  it("registra hospedagem e serviços com histórico e normaliza domínio", async () => {
    const m = await seed();
    await enable(m);
    const d = await detail(m.scope, m.company.id);
    expect(d.hosting.mode).toBe("third_party");
    expect(d.hosting.domain).toBe("exemplo.com.br");
    expect(d.hosting.services.map((s) => s.id)).toEqual([m.service.id]);
    expect(d.revisions).toHaveLength(1);
    const r = await report(m.scope, {
      ...range(),
      mode: "third_party",
      serviceId: m.service.id,
    });
    expect(r.total).toBe(1);
    expect(r.current.due).toBe(1);
  });
  it("rejeita versão antiga sem apagar flags e versões anteriores", async () => {
    const m = await seed();
    await enable(m);
    await expect(enable(m)).rejects.toMatchObject({ status: 409 });
    await saveHosting(m.scope, m.company.id, {
      ...m.input,
      mode: "own",
      serviceIds: [],
      version: 1,
    });
    const d = await detail(m.scope, m.company.id);
    expect(d.revisions).toHaveLength(2);
    expect(d.revisions[1]?.snapshot.mode).toBe("third_party");
    expect(d.hosting.services).toHaveLength(0);
  });
  it("valida contatos e serviços de outra empresa ou workspace", async () => {
    const m = await seed();
    const other = await seed();
    await expect(
      saveHosting(m.scope, m.company.id, {
        ...m.input,
        contactId: other.company.primaryContact?.id ?? null,
      }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      saveHosting(m.scope, m.company.id, {
        ...m.input,
        serviceIds: [other.service.id],
      }),
    ).rejects.toMatchObject({ status: 400 });
  });
  it("impede vendedor de ler ou alterar hospedagem alheia no mesmo workspace", async () => {
    const m = await seed("sales");
    const other = await createWorkspaceMember({ role: "sales" });
    await db.insert(schema.workspaceUserTable).values({
      workspaceId: m.workspace.id,
      userId: other.user.id,
      joinedAt: new Date(),
      role: "sales",
    });
    const otherCompany = await createCompany({
      workspaceId: m.workspace.id,
      input: {
        name: "Outro vendedor",
        ownerUserId: other.user.id,
        status: "active",
      },
    });
    expect(
      (await m.app.request(`${m.base}/companies/${otherCompany.id}`)).status,
    ).toBe(404);
    expect(
      (
        await post(
          m.app,
          `${m.base}/companies/${otherCompany.id}`,
          m.input,
          "PUT",
        )
      ).status,
    ).toBe(404);
    const r = await report(m.scope, range());
    expect(r.rows.map((c) => c.id)).toEqual([m.company.id]);
  });
  it("isola workspaces e protege operações sem permissão", async () => {
    const m = await seed();
    const other = await seed();
    expect(
      (
        await other.app.request(
          `${m.base}/report?from=${today()}&to=${today()}`,
        )
      ).status,
    ).toBe(403);
    // Sem a permissão própria de hospedagem, ler a empresa não basta.
    const onlyCompany = appFor(m.user.id, {
      permissions: { crmCompany: ["read"] },
    });
    expect(
      (await onlyCompany.request(`${m.base}/companies/${m.company.id}`)).status,
    ).toBe(403);
    const read = appFor(m.user.id, {
      permissions: { crmCompany: ["read"], hosting: ["read"] },
    });
    expect(
      (await read.request(`${m.base}/companies/${m.company.id}`)).status,
    ).toBe(200);
    expect((await read.request(`${m.base}/digest`)).status).toBe(403);
    expect(
      (await post(read, `${m.base}/companies/${m.company.id}`, m.input, "PUT"))
        .status,
    ).toBe(403);
  });
  it("bloqueia exclusão da empresa com avisos e permite arquivar preservando o histórico", async () => {
    const m = await seed();
    await enable(m);
    await db.insert(schema.crmHostingNoticeTable).values({
      workspaceId: m.workspace.id,
      companyId: m.company.id,
      requestId: "historico-anterior",
      signature: "x",
      channel: "email",
      status: "accepted",
      recipient: "cliente@example.test",
      subject: "Aviso anterior",
      body: "Registro antigo",
    });
    await expect(
      deleteCompany({ workspaceId: m.workspace.id, companyId: m.company.id }),
    ).rejects.toMatchObject({ status: 409 });
    await db
      .update(schema.crmCompanyTable)
      .set({ archivedAt: new Date() })
      .where(eq(schema.crmCompanyTable.id, m.company.id));
    expect((await report(m.scope, range())).total).toBe(0);
    expect((await detail(m.scope, m.company.id)).notices).toHaveLength(1);
    await expect(
      saveHosting(m.scope, m.company.id, { ...m.input, version: 1 }),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("valida domínio, serviços duplicados, assunto e datas pela API", async () => {
    const m = await seed();
    expect(
      (
        await post(
          m.app,
          `${m.base}/companies/${m.company.id}`,
          { ...m.input, domain: "https://exemplo.com.br" },
          "PUT",
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await post(
          m.app,
          `${m.base}/companies/${m.company.id}`,
          { ...m.input, serviceIds: [m.service.id, m.service.id] },
          "PUT",
        )
      ).status,
    ).toBe(400);
    expect(
      (await m.app.request(`${m.base}/report?from=2027-01-01&to=2026-01-01`))
        .status,
    ).toBe(400);
  });
  it("nova empresa da API fica na carteira do criador e exibe a flag na lista", async () => {
    const m = await seed("sales");
    const created = await post(m.app, "/crm/company", {
      workspaceId: m.workspace.id,
      name: "Nova empresa",
      primaryContact: { firstName: "Pessoa" },
    });
    expect(created.status).toBe(200);
    const c = await created.json();
    expect(c.ownerUserId).toBe(m.user.id);
    const response = await m.app.request(
      `/crm/company?workspaceId=${m.workspace.id}`,
    );
    expect(response.status).toBe(200);
    const list = await response.json();
    expect(
      list.items.find((v: { id: string }) => v.id === c.id)?.hostingMode,
    ).toBe("unknown");
  });
});
