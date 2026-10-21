import { defaultRolePayloads } from "@kaneo/permissions";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { beforeEach, describe, expect, it, vi } from "vitest";
import companyApi from "../../apps/api/src/crm/company";
import db, { schema as s } from "../../apps/api/src/database";
import finance from "../../apps/api/src/finance";
import { today } from "../../apps/api/src/finance/model";
import * as ctl from "../../apps/api/src/finance/portfolio/controller";
import work from "../../apps/api/src/finance/portfolio/work";
import timeApi from "../../apps/api/src/time-entry";
import { resetTestDatabase } from "./helpers/database";
import {
  createProjectFixture,
  createWorkspaceMember,
} from "./helpers/fixtures";
import { sendClientNoticeEmail } from "./mocks/email";

function appFor(userId: string) {
  const app = new Hono<{ Variables: { userId: string } }>();
  app.use("*", async (c, next) => {
    c.set("userId", userId);
    await next();
  });
  app.route("/finance", finance);
  app.route("/company", companyApi);
  app.route("/site-work", work);
  app.route("/time-entry", timeApi);
  app.onError((e, c) =>
    e instanceof HTTPException
      ? c.json({ message: e.message }, e.status)
      : c.json({ message: String(e) }, 500),
  );
  return app;
}
async function seed(role: "admin" | "finance_legal" | "member" = "admin") {
  const m = await createWorkspaceMember({ role });
  await db.insert(s.workspaceRoleTable).values({
    workspaceId: m.workspace.id,
    role,
    permission: JSON.stringify(defaultRolePayloads[role]),
  });
  const [company] = await db
    .insert(s.crmCompanyTable)
    .values({
      workspaceId: m.workspace.id,
      name: "Cliente teste",
      status: "active",
    })
    .returning();
  const [contact] = await db
    .insert(s.crmContactTable)
    .values({
      workspaceId: m.workspace.id,
      companyId: company.id,
      firstName: "Pessoa",
      email: "teste@example.com",
      mobile: "+5511999999999",
    })
    .returning();
  const [entry] = await db
    .insert(s.financeEntryTable)
    .values({
      workspaceId: m.workspace.id,
      companyId: company.id,
      description: "Serviço",
      direction: "receivable",
      kind: "operating",
      amountCents: 10000,
      competenceDate: today(),
      dueDate: today(),
      partyName: "Cliente",
      paymentMethod: "pix",
      seriesId: crypto.randomUUID(),
      requestSignature: "fixture",
    })
    .returning();
  return {
    ...m,
    company,
    contact,
    entry,
    base: `/finance/${m.workspace.id}/portfolio`,
    range: `from=${today().slice(0, 7)}-01&to=${today()}`,
  };
}
function request(
  app: ReturnType<typeof appFor>,
  url: string,
  body: unknown,
  method = "POST",
) {
  return app.request(url, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
function follow(
  m: Awaited<ReturnType<typeof seed>>,
  patch: Record<string, unknown> = {},
) {
  return {
    sourceKind: "receivable",
    sourceId: m.entry.id,
    sourceDate: today(),
    version: 0,
    status: "waiting",
    ownerUserId: m.user.id,
    nextOn: today(),
    nextAction: "Conferir retorno",
    promiseOn: null,
    promiseCents: null,
    note: "Cliente contatado",
    ...patch,
  };
}
const siteBody = (companyId: string) => ({
  companyId,
  contractId: null,
  name: "Novo site",
  status: "active",
  includeScenario: false,
  version: 0,
});
beforeEach(async () => {
  await resetTestDatabase();
  vi.mocked(sendClientNoticeEmail)
    .mockReset()
    .mockResolvedValue({ success: true });
});
describe("Carteira, horas e papel financeiro/jurídico", () => {
  it("permite visão financeira e impede produção e workspace alheio", async () => {
    const a = await seed("finance_legal");
    const b = await seed();
    const app = appFor(a.user.id);
    expect((await app.request(`${a.base}/report?${a.range}`)).status).toBe(200);
    expect((await app.request(`${a.base}/metadata`)).status).toBe(200);
    expect((await app.request(`${b.base}/report?${b.range}`)).status).toBe(403);
    const p = await createProjectFixture({ workspaceId: a.workspace.id });
    const res = await app.request(`/site-work/project/${p.project.id}`);
    expect(res.status).toBe(403);
  });
  it("não concede leitura financeira a colaborador de produção", async () => {
    const m = await seed("member");
    expect(
      (await appFor(m.user.id).request(`${m.base}/report?${m.range}`)).status,
    ).toBe(403);
  });
  it("acompanha com controle de versão e não dá baixa ao concluir", async () => {
    const m = await seed("finance_legal");
    const app = appFor(m.user.id);
    const first = await request(app, `${m.base}/cases`, follow(m));
    expect(first.status).toBe(200);
    const c = await first.json();
    expect((await request(app, `${m.base}/cases`, follow(m))).status).toBe(409);
    expect(
      (
        await request(
          app,
          `${m.base}/cases`,
          follow(m, { version: c.version, status: "done" }),
        )
      ).status,
    ).toBe(200);
    expect(await db.select().from(s.financeSettlementTable)).toHaveLength(0);
    const detail = await (await app.request(`${m.base}/cases/${c.id}`)).json();
    expect(detail.events).toHaveLength(2);
  });
  it("rejeita promessa acima do saldo e referências de outro workspace", async () => {
    const a = await seed();
    const b = await seed();
    const app = appFor(a.user.id);
    expect(
      (
        await request(
          app,
          `${a.base}/cases`,
          follow(a, {
            status: "promised",
            promiseOn: today(),
            promiseCents: 10001,
          }),
        )
      ).status,
    ).toBe(400);
    expect((await request(app, `${a.base}/cases`, follow(b))).status).toBe(409);
    expect(
      (await request(app, `${a.base}/sites`, siteBody(b.company.id))).status,
    ).toBe(404);
  });
  it("mantém histórico após quitação sem reabrir obrigação", async () => {
    const m = await seed();
    const app = appFor(m.user.id);
    expect((await request(app, `${m.base}/cases`, follow(m))).status).toBe(200);
    await db.insert(s.financeSettlementTable).values({
      entryId: m.entry.id,
      principalCents: 10000,
      date: today(),
      requestId: crypto.randomUUID(),
    });
    const r = await (await app.request(`${m.base}/report?${m.range}`)).json();
    expect(r.queue).toHaveLength(0);
    expect(r.caseHistory).toHaveLength(1);
    expect(r.caseHistory[0].resolved).toBe(true);
  });
  it("pagina 25 acompanhamentos e exporta os resultados completos", async () => {
    const m = await seed();
    const app = appFor(m.user.id);
    await db.insert(s.financeEntryTable).values(
      Array.from({ length: 27 }, (_, i) => ({
        workspaceId: m.workspace.id,
        companyId: m.company.id,
        description: `Serviço ${i}`,
        direction: "receivable" as const,
        kind: "operating" as const,
        amountCents: 100,
        competenceDate: today(),
        dueDate: today(),
        partyName: "Cliente",
        paymentMethod: "pix",
        seriesId: crypto.randomUUID(),
        requestSignature: "fixture",
      })),
    );
    const r = await (await app.request(`${m.base}/report?${m.range}`)).json();
    expect(r.queueTotal).toBe(28);
    expect(r.queue).toHaveLength(25);
    const next = await (
      await app.request(`${m.base}/report?${m.range}&page=2`)
    ).json();
    expect(next.queue).toHaveLength(3);
    expect(
      (await app.request(`${m.base}/report?${m.range}&page=-1`)).status,
    ).toBe(400);
    for (const f of ["xlsx", "pdf"]) {
      const res = await app.request(`${m.base}/export/${f}?${m.range}`);
      expect(res.status).toBe(200);
      expect((await res.arrayBuffer()).byteLength).toBeGreaterThan(1000);
    }
  });
  it("separa elaboração da aprovação e preserva minuta aprovada", async () => {
    const m = await seed("finance_legal");
    const app = appFor(m.user.id);
    const body = {
      companyId: m.company.id,
      contractId: null,
      title: "Renovação",
      body: "Termos propostos",
      proposedCents: 20000,
      status: "submitted",
      version: 0,
    };
    const res = await request(app, `${m.base}/drafts`, body);
    expect(res.status).toBe(200);
    const draft = await res.json();
    expect(
      (
        await request(app, `${m.base}/drafts/${draft.id}/decision`, {
          version: draft.version,
          status: "approved",
          decision: "Revisado",
        })
      ).status,
    ).toBe(403);
    await ctl.decideDraft(
      m.workspace.id,
      m.user.id,
      draft.id,
      draft.version,
      "approved",
      "Revisado pelo aprovador",
    );
    expect(
      (
        await request(
          app,
          `${m.base}/drafts/${draft.id}`,
          { ...body, version: draft.version + 1 },
          "PUT",
        )
      ).status,
    ).toBe(409);
    expect(await db.select().from(s.crmContractTable)).toHaveLength(0);
  });
  it("não permite cancelamento ou estorno com papel financeiro/jurídico", async () => {
    const m = await seed("finance_legal");
    const app = appFor(m.user.id);
    const root = `/finance/${m.workspace.id}`;
    expect(
      (
        await request(app, `${root}/entries/${m.entry.id}/cancel`, {
          version: 1,
          reason: "Teste",
        })
      ).status,
    ).toBe(403);
  });
  it("conserva taxas históricas e rejeita novas vigências retroativas", async () => {
    const m = await seed();
    const app = appFor(m.user.id);
    const old = {
      userId: m.user.id,
      effectiveOn: "2020-01-01",
      hourlyCents: 5000,
    };
    expect((await request(app, `${m.base}/rates`, old)).status).toBe(200);
    expect(
      (
        await request(app, `${m.base}/rates`, {
          ...old,
          effectiveOn: "2021-01-01",
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await request(app, `${m.base}/rates`, {
          ...old,
          effectiveOn: today(),
          hourlyCents: 6000,
        })
      ).status,
    ).toBe(200);
    expect(await db.select().from(s.financeLaborRateTable)).toHaveLength(2);
  });
  it("vincula tarefas do mesmo cliente e mantém horas por autor ao reatribuir", async () => {
    const m = await seed();
    const app = appFor(m.user.id);
    const p = await createProjectFixture({ workspaceId: m.workspace.id });
    const res = await request(app, `${m.base}/sites`, siteBody(m.company.id));
    expect(res.status).toBe(200);
    const site = await res.json();
    const [task] = await db
      .insert(s.taskTable)
      .values({
        projectId: p.project.id,
        title: "Criar layout",
        crmCompanyId: m.company.id,
        userId: m.user.id,
      })
      .returning();
    const link = await request(
      app,
      `/site-work/task/${task.id}`,
      { siteId: site.id, taskId: task.id, estimateMinutes: 120, version: 0 },
      "PUT",
    );
    expect(link.status).toBe(200);
    const body = {
      taskId: task.id,
      startTime: "2026-01-02T12:00:00Z",
      endTime: "2026-01-02T13:00:00Z",
      description: "Layout",
    };
    const t = await request(app, "/time-entry", body);
    expect(t.status).toBe(200);
    const logged = await t.json();
    expect(logged.duration).toBe(3600);
    expect((await request(app, "/time-entry", body)).status).toBe(409);
    await db
      .update(s.taskTable)
      .set({ userId: null })
      .where(eq(s.taskTable.id, task.id));
    const r = await (
      await app.request(`/site-work/project/${p.project.id}`)
    ).json();
    expect(r[0].contributors[0].userId).toBe(m.user.id);
    expect(r[0].seconds).toBe(3600);
    expect(JSON.stringify(r)).not.toMatch(
      /hourlyCents|estimatedCents|netProfit|rates/,
    );
    const foreign = await seed();
    const stranger = await appFor(foreign.user.id).request(
      `/site-work/task/${task.id}`,
    );
    expect(stranger.status).toBe(403);
  });
  it("rejeita vincular despesa de outro cliente e impede duplicar origem", async () => {
    const m = await seed();
    const app = appFor(m.user.id);
    const site = await (
      await request(app, `${m.base}/sites`, siteBody(m.company.id))
    ).json();
    const site2 = await (
      await request(app, `${m.base}/sites`, siteBody(m.company.id))
    ).json();
    await db
      .update(s.financeEntryTable)
      .set({ direction: "payable" })
      .where(eq(s.financeEntryTable.id, m.entry.id));
    const b = {
      userId: m.user.id,
      mode: "ledger",
      fixedCents: 0,
      chargedOn: today(),
      sourceEntryId: m.entry.id,
      version: 0,
    };
    expect(
      (await request(app, `${m.base}/sites/${site.id}/workers`, b, "PUT"))
        .status,
    ).toBe(200);
    expect(
      (await request(app, `${m.base}/sites/${site2.id}/workers`, b, "PUT"))
        .status,
    ).toBe(409);
    expect(await db.select().from(s.financeEntryTable)).toHaveLength(1);
  });
  it("revisa destinatário, respeita opt-out e impede envio com prévia desatualizada", async () => {
    const m = await seed();
    const app = appFor(m.user.id);
    const c = await (await request(app, `${m.base}/cases`, follow(m))).json();
    const b = {
      caseId: c.id,
      contactId: m.contact.id,
      channel: "email",
      subject: "",
      body: "",
    };
    const preview = await (await request(app, `${m.base}/preview`, b)).json();
    expect(preview.recipient).toBe(m.contact.email);
    await db
      .update(s.crmContactTable)
      .set({ email: "novo@example.com" })
      .where(eq(s.crmContactTable.id, m.contact.id));
    expect(
      (
        await request(app, `${m.base}/notices`, {
          ...b,
          requestId: crypto.randomUUID(),
          signature: preview.signature,
          confirmed: true,
        })
      ).status,
    ).toBe(409);
    await db
      .update(s.crmContactTable)
      .set({ emailOptOut: true })
      .where(eq(s.crmContactTable.id, m.contact.id));
    expect((await request(app, `${m.base}/preview`, b)).status).toBe(400);
    expect(sendClientNoticeEmail).not.toHaveBeenCalled();
  });
  it("envia e-mail uma vez por solicitação e prepara WhatsApp para confirmação manual", async () => {
    const m = await seed();
    const app = appFor(m.user.id);
    const c = await (await request(app, `${m.base}/cases`, follow(m))).json();
    const b = {
      caseId: c.id,
      contactId: m.contact.id,
      channel: "email",
      subject: "",
      body: "",
    };
    const preview = await (await request(app, `${m.base}/preview`, b)).json();
    const send = {
      ...b,
      requestId: crypto.randomUUID(),
      signature: preview.signature,
      confirmed: true,
    };
    const a = await request(app, `${m.base}/notices`, send);
    expect(a.status).toBe(200);
    expect((await request(app, `${m.base}/notices`, send)).status).toBe(200);
    expect(sendClientNoticeEmail).toHaveBeenCalledTimes(1);
    const wa = { ...b, channel: "whatsapp" };
    const wp = await (await request(app, `${m.base}/preview`, wa)).json();
    const wr = await request(app, `${m.base}/notices`, {
      ...wa,
      requestId: crypto.randomUUID(),
      signature: wp.signature,
      confirmed: true,
    });
    expect(wr.status).toBe(200);
    const prepared = await wr.json();
    expect(prepared.notice.status).toBe("prepared");
    expect(prepared.whatsappUrl).toContain("wa.me/");
    expect(
      (
        await request(app, `${m.base}/notices/${prepared.notice.id}/confirm`, {
          confirmed: true,
        })
      ).status,
    ).toBe(200);
    expect(sendClientNoticeEmail).toHaveBeenCalledTimes(1);
  });
  it("não permite avisar após quitação, mesmo com prévia anterior", async () => {
    const m = await seed();
    const app = appFor(m.user.id);
    const c = await (await request(app, `${m.base}/cases`, follow(m))).json();
    const b = {
      caseId: c.id,
      contactId: m.contact.id,
      channel: "email",
      subject: "",
      body: "",
    };
    const preview = await (await request(app, `${m.base}/preview`, b)).json();
    await db.insert(s.financeSettlementTable).values({
      entryId: m.entry.id,
      principalCents: 10000,
      date: today(),
      requestId: crypto.randomUUID(),
    });
    expect(
      (
        await request(app, `${m.base}/notices`, {
          ...b,
          requestId: crypto.randomUUID(),
          signature: preview.signature,
          confirmed: true,
        })
      ).status,
    ).toBe(409);
    expect(sendClientNoticeEmail).not.toHaveBeenCalled();
  });
  it("renovação vencida permanece na fila e nova data inicia novo acompanhamento", async () => {
    const m = await seed();
    const app = appFor(m.user.id);
    const [contract] = await db
      .insert(s.crmContractTable)
      .values({
        workspaceId: m.workspace.id,
        companyId: m.company.id,
        number: 1,
        title: "Renovação",
        startsAt: new Date("2025-01-01T12:00:00Z"),
        endsAt: new Date("2026-01-01T12:00:00Z"),
        status: "active",
      })
      .returning();
    const input = {
      ...follow(m),
      sourceKind: "contract",
      sourceId: contract.id,
      sourceDate: "2026-01-01",
    };
    expect((await request(app, `${m.base}/cases`, input)).status).toBe(200);
    let report = await (
      await app.request(`${m.base}/report?${m.range}`)
    ).json();
    expect(
      report.queue.find((r: { sourceId: string }) => r.sourceId === contract.id)
        .late,
    ).toBe(true);
    await db
      .update(s.crmContractTable)
      .set({ endsAt: new Date(`${today()}T12:00:00Z`) })
      .where(eq(s.crmContractTable.id, contract.id));
    report = await (await app.request(`${m.base}/report?${m.range}`)).json();
    expect(
      report.queue.find((r: { sourceId: string }) => r.sourceId === contract.id)
        .follow,
    ).toBeNull();
    expect(report.caseHistory[0].resolved).toBe(true);
  });
  it("oculta tarefas de produção nas respostas comerciais do financeiro/jurídico", async () => {
    const m = await seed("finance_legal");
    const p = await createProjectFixture({ workspaceId: m.workspace.id });
    await db.insert(s.taskTable).values({
      projectId: p.project.id,
      crmCompanyId: m.company.id,
      title: "Produção confidencial",
    });
    const res = await appFor(m.user.id).request(
      `/company/${m.company.id}?workspaceId=${m.workspace.id}`,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tasksByProject).toEqual([]);
    expect(JSON.stringify(body)).not.toContain("Produção confidencial");
  });
  it("bloqueia alterar horas alheias mesmo com acesso ao mesmo quadro", async () => {
    const m = await seed();
    const app = appFor(m.user.id);
    const p = await createProjectFixture({ workspaceId: m.workspace.id });
    const site = await (
      await request(app, `${m.base}/sites`, siteBody(m.company.id))
    ).json();
    const [task] = await db
      .insert(s.taskTable)
      .values({
        projectId: p.project.id,
        title: "Site",
        crmCompanyId: m.company.id,
      })
      .returning();
    await ctl.attachTask(m.workspace.id, m.user.id, {
      siteId: site.id,
      taskId: task.id,
      estimateMinutes: 60,
      version: 0,
    });
    const logged = await (
      await request(app, "/time-entry", {
        taskId: task.id,
        startTime: "2026-01-02T12:00:00Z",
        endTime: "2026-01-02T13:00:00Z",
      })
    ).json();
    const other = await createWorkspaceMember({ role: "member" });
    await db.insert(s.workspaceUserTable).values({
      workspaceId: m.workspace.id,
      userId: other.user.id,
      role: "member",
      joinedAt: new Date(),
    });
    const res = await request(
      appFor(other.user.id),
      `/time-entry/${logged.id}`,
      { startTime: "2026-01-02T12:00:00Z", endTime: "2026-01-02T14:00:00Z" },
      "PUT",
    );
    expect(res.status).toBe(403);
    const report = await (
      await app.request(`${m.base}/report?${m.range}`)
    ).json();
    expect(report.sites[0].seconds).toBe(3600);
  });
  it("retém envio com retorno incerto e não repete SMTP automaticamente", async () => {
    const m = await seed();
    const app = appFor(m.user.id);
    const c = await (await request(app, `${m.base}/cases`, follow(m))).json();
    const b = {
      caseId: c.id,
      contactId: m.contact.id,
      channel: "email",
      subject: "",
      body: "",
    };
    const p = await (await request(app, `${m.base}/preview`, b)).json();
    vi.mocked(sendClientNoticeEmail).mockRejectedValueOnce(
      new Error("timeout"),
    );
    const input = {
      ...b,
      requestId: crypto.randomUUID(),
      signature: p.signature,
      confirmed: true,
    };
    const sent = await (await request(app, `${m.base}/notices`, input)).json();
    expect(sent.notice.status).toBe("uncertain");
    await request(app, `${m.base}/notices`, input);
    expect(sendClientNoticeEmail).toHaveBeenCalledTimes(1);
  });
});
