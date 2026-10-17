import { randomUUID } from "node:crypto";
import { defaultRolePayloads } from "@kaneo/permissions";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import crm from "../../apps/api/src/crm";
import { createCompany } from "../../apps/api/src/crm/company/controllers/upsert-company";
import {
  report,
  type Scope,
  saveHosting,
} from "../../apps/api/src/crm/hosting/controllers/hosting";
import {
  claimRun,
  deliverRun,
  getConfig,
  previewDue,
  processDigests,
  retryRun,
  saveConfig,
} from "../../apps/api/src/crm/hosting/digest/controller";
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
const addDays = (date: string, days: number) =>
  new Date(Date.parse(date) + days * 86_400_000).toISOString().slice(0, 10);
const inDays = (days: number) => addDays(today(), days);

async function addMember(workspaceId: string, name: string) {
  const id = `user-${randomUUID()}`;
  const [user] = await db
    .insert(schema.userTable)
    .values({
      id,
      email: `${id}@example.com`,
      emailVerified: true,
      name,
    })
    .returning();
  if (!user) throw new Error("Sem usuário");
  await db.insert(schema.workspaceUserTable).values({
    workspaceId,
    userId: id,
    role: "admin",
    joinedAt: new Date(),
  });
  return user;
}
async function seed() {
  const m = await createWorkspaceMember({ role: "admin", userName: "Admin" });
  await db.insert(schema.workspaceRoleTable).values({
    workspaceId: m.workspace.id,
    role: "admin",
    permission: JSON.stringify(defaultRolePayloads.admin),
  });
  const scope: Scope = {
    workspaceId: m.workspace.id,
    userId: m.user.id,
    visibility: "all",
  };
  return {
    ...m,
    scope,
    base: `/crm/hosting/${m.workspace.id}`,
    app: appFor(m.user.id),
  };
}
type Seed = Awaited<ReturnType<typeof seed>>;
async function client(
  m: Seed,
  name: string,
  renewsOn: string | null,
  patch: Partial<HostingInput> = {},
  ownerUserId = m.user.id,
) {
  const company = await createCompany({
    workspaceId: m.workspace.id,
    input: { name, status: "active", ownerUserId },
  });
  await saveHosting({ ...m.scope, userId: m.user.id }, company.id, {
    mode: "third_party",
    provider: "Hostgator",
    domain: `${name.toLowerCase().replace(/\W/g, "")}.com.br`,
    renewsOn,
    leadDays: 30,
    contactId: null,
    emailAllowed: false,
    whatsappAllowed: false,
    notes: "",
    serviceIds: [],
    version: 0,
    ...patch,
  });
  return company;
}
async function configure(
  m: Seed,
  recipients: string[],
  extra: Partial<Parameters<typeof saveConfig>[1]> = {},
) {
  const current = await getConfig(m.workspace.id);
  return saveConfig(
    { workspaceId: m.workspace.id, userId: m.user.id },
    {
      enabled: true,
      marks: [30, 15],
      includeOwner: false,
      recipientUserIds: recipients,
      version: current.settings.version,
      ...extra,
    },
  );
}
async function runDay(m: Seed) {
  const run = await claimRun(m.workspace.id);
  return run ? deliverRun(run.id) : null;
}
const sentTo = () =>
  sendClientNoticeEmail.mock.calls.map((c) => c[0] as string).sort();

beforeEach(async () => {
  await resetTestDatabase();
  sendClientNoticeEmail.mockReset();
  sendClientNoticeEmail.mockResolvedValue({ success: true });
});
afterEach(() => vi.useRealTimers());

describe("Aviso interno de renovação de hospedagem", () => {
  it("salva destinatários, rejeita versão antiga, não membros e ativação vazia", async () => {
    const m = await seed();
    const outsider = await createWorkspaceMember();
    await expect(configure(m, [outsider.user.id])).rejects.toMatchObject({
      status: 400,
    });
    await expect(configure(m, [])).rejects.toMatchObject({ status: 400 });
    const saved = await configure(m, [m.user.id]);
    expect(saved.recipientUserIds).toEqual([m.user.id]);
    expect(saved.settings).toMatchObject({ enabled: true, version: 1 });
    await expect(
      saveConfig(
        { workspaceId: m.workspace.id, userId: m.user.id },
        {
          enabled: true,
          marks: [30],
          includeOwner: false,
          recipientUserIds: [m.user.id],
          version: 0,
        },
      ),
    ).rejects.toMatchObject({ status: 409 });
    const audits = await db
      .select()
      .from(schema.auditLogTable)
      .where(eq(schema.auditLogTable.workspaceId, m.workspace.id));
    expect(
      audits.some((a) => a.action === "crm.hosting.digest.configuracao"),
    ).toBe(true);
  });

  it("exige leitura total e permissão de avisar nas rotas", async () => {
    const m = await seed();
    const limited = appFor(m.user.id, {
      permissions: { crmCompany: ["read"] },
    });
    expect((await limited.request(`${m.base}/digest`)).status).toBe(403);
    expect((await limited.request(`${m.base}/digest/preview`)).status).toBe(
      403,
    );
    expect((await m.app.request(`${m.base}/digest`)).status).toBe(200);
  });

  it("envia uma lista com o provedor para os marcados e não repete no dia", async () => {
    const m = await seed();
    const boss = await addMember(m.workspace.id, "Chefe");
    await client(m, "Alfa", inDays(30));
    await client(m, "Beta", inDays(31));
    await configure(m, [boss.id]);
    const first = await runDay(m);
    expect(first?.status).toBe("sent");
    expect(sentTo()).toEqual([boss.email]);
    const [to, subject, body] = sendClientNoticeEmail.mock.calls[0] as string[];
    expect(to).toBe(boss.email);
    expect(subject).toBe("Hospedagens de terceiros a renovar: 1 cliente");
    expect(body).toContain("Alfa");
    expect(body).toContain("Hostgator");
    expect(body).not.toContain("Beta");
    expect(await runDay(m)).toBeNull();
    expect(sendClientNoticeEmail).toHaveBeenCalledTimes(1);
  });

  it("avisa de novo aos 15 dias e nunca mais para a mesma data", async () => {
    const m = await seed();
    await client(m, "Alfa", inDays(30));
    await configure(m, [m.user.id]);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date());
    expect((await runDay(m))?.status).toBe("sent");
    vi.setSystemTime(new Date(Date.now() + 10 * 86_400_000));
    expect(await runDay(m)).toBeNull();
    vi.setSystemTime(new Date(Date.now() + 5 * 86_400_000));
    expect((await runDay(m))?.status).toBe("sent");
    vi.setSystemTime(new Date(Date.now() + 5 * 86_400_000));
    expect(await runDay(m)).toBeNull();
    expect(sendClientNoticeEmail).toHaveBeenCalledTimes(2);
  });

  it("cadastro tardio lista só a marca mais próxima", async () => {
    const m = await seed();
    await client(m, "Alfa", inDays(10));
    await configure(m, [m.user.id]);
    expect((await runDay(m))?.status).toBe("sent");
    expect(sendClientNoticeEmail).toHaveBeenCalledTimes(1);
    const items = await db.select().from(schema.crmHostingDigestItemTable);
    expect(items.map((i) => [i.markDays, i.listed]).sort()).toEqual([
      [15, true],
      [30, false],
    ]);
  });

  it("ignora quem não deve ser avisado", async () => {
    const m = await seed();
    await client(m, "Propria", inDays(30), { mode: "own" });
    await client(m, "Sem hospedagem", inDays(30), { mode: "none" });
    await client(m, "Sem data", null);
    await client(m, "Vencida", inDays(-1));
    const inactive = await client(m, "Inativa", inDays(30));
    await db
      .update(schema.crmCompanyTable)
      .set({ status: "inactive" })
      .where(eq(schema.crmCompanyTable.id, inactive.id));
    const archived = await client(m, "Arquivada", inDays(30));
    await db
      .update(schema.crmCompanyTable)
      .set({ archivedAt: new Date() })
      .where(eq(schema.crmCompanyTable.id, archived.id));
    await configure(m, [m.user.id]);
    expect((await previewDue(m.workspace.id)).items).toEqual([]);
    expect(await runDay(m)).toBeNull();
    expect(sendClientNoticeEmail).not.toHaveBeenCalled();
  });

  it("responsável recebe só as próprias empresas; marcados recebem tudo", async () => {
    const m = await seed();
    const boss = await addMember(m.workspace.id, "Chefe");
    const seller = await addMember(m.workspace.id, "Vendedor");
    const other = await addMember(m.workspace.id, "Sem empresas");
    await client(m, "Alfa", inDays(30), {}, seller.id);
    await client(m, "Beta", inDays(30), {}, m.user.id);
    await configure(m, [boss.id], { includeOwner: true });
    expect((await runDay(m))?.status).toBe("sent");
    expect(sentTo()).toEqual([boss.email, m.user.email, seller.email].sort());
    expect(sentTo()).not.toContain(other.email);
    const bodyOf = (to: string) =>
      sendClientNoticeEmail.mock.calls.find((c) => c[0] === to)?.[2] as string;
    expect(bodyOf(boss.email)).toContain("Alfa");
    expect(bodyOf(boss.email)).toContain("Beta");
    expect(bodyOf(seller.email)).toContain("Alfa");
    expect(bodyOf(seller.email)).not.toContain("Beta");
  });

  it("não registra nada sem destinatário utilizável e avisa depois que houver", async () => {
    const m = await seed();
    await client(m, "Alfa", inDays(30));
    await configure(m, [], { includeOwner: true });
    await db
      .update(schema.userTable)
      .set({ email: "" })
      .where(eq(schema.userTable.id, m.user.id));
    expect(await claimRun(m.workspace.id)).toBeNull();
    expect(await db.select().from(schema.crmHostingDigestItemTable)).toEqual(
      [],
    );
    await db
      .update(schema.userTable)
      .set({ email: "volta@example.test" })
      .where(eq(schema.userTable.id, m.user.id));
    expect((await runDay(m))?.status).toBe("sent");
  });

  it("não envia quando o aviso está desativado", async () => {
    const m = await seed();
    await client(m, "Alfa", inDays(30));
    await configure(m, [m.user.id], { enabled: false });
    expect(await claimRun(m.workspace.id)).toBeNull();
  });

  it("tenta de novo, marca como falha após 3 tentativas e permite reenvio manual", async () => {
    const m = await seed();
    await client(m, "Alfa", inDays(30));
    await configure(m, [m.user.id]);
    sendClientNoticeEmail.mockResolvedValue({ success: false });
    const run = await claimRun(m.workspace.id);
    if (!run) throw new Error("Sem aviso");
    const hours = (n: number) => new Date(Date.now() + n * 3_600_000 + 60_000);
    expect((await deliverRun(run.id))?.status).toBe("pending");
    expect((await deliverRun(run.id, new Date()))?.status ?? null).toBeNull();
    expect((await deliverRun(run.id, hours(2)))?.status).toBe("pending");
    expect((await deliverRun(run.id, hours(10)))?.status).toBe("failed");
    expect(await deliverRun(run.id, hours(30))).toBeNull();
    sendClientNoticeEmail.mockResolvedValue({ success: true });
    const retried = await retryRun(
      { workspaceId: m.workspace.id, userId: m.user.id },
      run.id,
    );
    expect(retried?.status).toBe("sent");
    await expect(
      retryRun({ workspaceId: m.workspace.id, userId: m.user.id }, run.id),
    ).rejects.toMatchObject({ status: 409 });
    // Empresas já registradas não voltam a ser listadas.
    expect(await runDay(m)).toBeNull();
  });

  it("não reenvia a quem já aceitou quando outro destinatário falha", async () => {
    const m = await seed();
    const boss = await addMember(m.workspace.id, "Chefe");
    await client(m, "Alfa", inDays(30));
    await configure(m, [m.user.id, boss.id]);
    sendClientNoticeEmail.mockImplementation(async (...args: unknown[]) => ({
      success: args[0] !== boss.email,
    }));
    const run = await claimRun(m.workspace.id);
    if (!run) throw new Error("Sem aviso");
    expect((await deliverRun(run.id))?.status).toBe("pending");
    sendClientNoticeEmail.mockClear();
    sendClientNoticeEmail.mockResolvedValue({ success: true });
    const later = new Date(Date.now() + 2 * 3_600_000);
    expect((await deliverRun(run.id, later))?.status).toBe("sent");
    expect(sentTo()).toEqual([boss.email]);
  });

  it("só registra o aviso a partir das 8h de São Paulo", async () => {
    const m = await seed();
    await client(m, "Alfa", inDays(30));
    await configure(m, [m.user.id]);
    const day = today();
    expect(await processDigests(new Date(`${day}T10:30:00Z`))).toEqual({
      claimed: 0,
      delivered: 0,
    });
    const real = Date.now();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(`${day}T11:30:00Z`));
    // O registro acontece após as 8h; o envio vale a partir do relógio do banco.
    expect((await processDigests(new Date())).claimed).toBe(1);
    const later = new Date(Math.max(real, Date.now()) + 60_000);
    expect(await processDigests(later)).toMatchObject({ delivered: 1 });
    expect(sendClientNoticeEmail).toHaveBeenCalledTimes(1);
    expect((await processDigests(later)).claimed).toBe(0);
  });

  it("isola workspaces", async () => {
    const a = await seed();
    const b = await seed();
    await client(a, "Alfa", inDays(30));
    await configure(a, [a.user.id]);
    await configure(b, [b.user.id]);
    expect(await runDay(b)).toBeNull();
    expect((await runDay(a))?.status).toBe("sent");
    expect(sentTo()).toEqual([a.user.email]);
    expect((await getConfig(b.workspace.id)).runs).toEqual([]);
  });

  it("lista de terceiros: filtra por provedor e prazo e mostra último e próximo aviso", async () => {
    const m = await seed();
    await client(m, "Alfa", inDays(30), { provider: "Hostgator" });
    await client(m, "Beta", inDays(60), { provider: "Locaweb" });
    await configure(m, [m.user.id]);
    await runDay(m);
    const range = { from: today(), to: today(), mode: "third_party" as const };
    const byProvider = await report(m.scope, { ...range, provider: "locaweb" });
    expect(byProvider.rows.map((r) => r.name)).toEqual(["Beta"]);
    const byWindow = await report(m.scope, { ...range, window: "30" });
    expect(byWindow.rows.map((r) => r.name)).toEqual(["Alfa"]);
    const all = await report(m.scope, range);
    const alfa = all.rows.find((r) => r.name === "Alfa");
    const beta = all.rows.find((r) => r.name === "Beta");
    expect(alfa?.lastNotice).toMatchObject({ markDays: 30, status: "sent" });
    expect(alfa?.nextNotice?.markDays).toBe(15);
    expect(beta?.lastNotice).toBeNull();
    expect(beta?.nextNotice).toEqual({ markDays: 30, date: inDays(30) });
    const meta = await m.app.request(`${m.base}/metadata`);
    expect(((await meta.json()) as { providers: string[] }).providers).toEqual([
      "Hostgator",
      "Locaweb",
    ]);
  });
});
