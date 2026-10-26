import { defaultRolePayloads } from "@kaneo/permissions";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { seedCrmDefaults } from "../../apps/api/src/crm/shared/seed-workspace";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import { mockAnonymousSession, mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import { createWorkspaceMember } from "./helpers/fixtures";

type App = ReturnType<typeof createApp>["app"];

function post(app: App, path: string, body: unknown) {
  return app.request(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function put(app: App, path: string, body: unknown) {
  return app.request(path, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function patch(app: App, path: string, body: unknown) {
  return app.request(path, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

/**
 * Seeds a workspace whose member holds a CRM-capable role. Roles resolve from
 * `workspace_role` rows first, so the row has to exist for the request to be
 * authorized the way it is in a real workspace.
 */
async function seedCrmWorkspace(role: "admin" | "sales" = "admin") {
  const member = await createWorkspaceMember({ role });

  await db.insert(schema.workspaceRoleTable).values({
    workspaceId: member.workspace.id,
    role,
    permission: JSON.stringify(defaultRolePayloads[role]),
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  return member;
}

describe("API integration: CRM", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  it("rejects unauthenticated CRM requests", async () => {
    mockAnonymousSession();
    const { app } = createApp();

    const response = await app.request("/api/crm/deal/board?workspaceId=nope");

    expect(response.status).toBe(401);
  });

  it("seeds a pipeline with its closing stages and refuses to delete them", async () => {
    const member = await seedCrmWorkspace();
    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const created = await post(app, "/api/crm/pipeline", {
      workspaceId: member.workspace.id,
      name: "Vendas Diretas",
    });
    expect(created.status).toBe(200);

    const pipeline = (await created.json()) as { id: string; slug: string };
    expect(pipeline.slug).toBe("vendas-diretas");

    const listed = await app.request(
      `/api/crm/pipeline?workspaceId=${member.workspace.id}`,
    );
    const pipelines = (await listed.json()) as Array<{
      id: string;
      isDefault: boolean;
      stages: Array<{ id: string; outcome: string; probability: number }>;
    }>;

    expect(pipelines).toHaveLength(1);
    // The first pipeline in a workspace becomes the default even though the
    // request did not ask for it — otherwise the board opens on nothing.
    expect(pipelines[0].isDefault).toBe(true);

    const outcomes = pipelines[0].stages.map((stage) => stage.outcome);
    expect(outcomes).toEqual(["open", "open", "open", "open", "won", "lost"]);

    const wonStage = pipelines[0].stages.find(
      (stage) => stage.outcome === "won",
    );
    const deleteWon = await app.request(
      `/api/crm/pipeline/stage/${wonStage?.id}?workspaceId=${member.workspace.id}`,
      { method: "DELETE" },
    );
    expect(deleteWon.status).toBe(400);
  });

  it("numbers deals per workspace and opens their stage history", async () => {
    const member = await seedCrmWorkspace();
    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    await post(app, "/api/crm/pipeline", {
      workspaceId: member.workspace.id,
      name: "Vendas",
    });

    const first = await post(app, "/api/crm/deal", {
      workspaceId: member.workspace.id,
      title: "Implantação Acme",
      valueCents: 250_000_000_000,
    });
    expect(first.status).toBe(200);

    const dealOne = (await first.json()) as {
      id: string;
      number: number;
      status: string;
      valueCents: number;
      ownerUserId: string;
    };

    expect(dealOne.number).toBe(1);
    expect(dealOne.status).toBe("open");
    // R$ 2.5 bilhões — the point of storing cents in a bigint.
    expect(dealOne.valueCents).toBe(250_000_000_000);
    // Unassigned deals go stale unnoticed, so the creator owns it.
    expect(dealOne.ownerUserId).toBe(member.user.id);

    const second = await post(app, "/api/crm/deal", {
      workspaceId: member.workspace.id,
      title: "Suporte Acme",
    });
    expect(((await second.json()) as { number: number }).number).toBe(2);

    const history = await db
      .select()
      .from(schema.crmStageHistoryTable)
      .where(eq(schema.crmStageHistoryTable.dealId, dealOne.id));

    expect(history).toHaveLength(1);
    expect(history[0].fromStageId).toBeNull();
    expect(history[0].exitedAt).toBeNull();
  });

  it("closes and reopens the stage history as a deal moves", async () => {
    const member = await seedCrmWorkspace();
    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    await post(app, "/api/crm/pipeline", {
      workspaceId: member.workspace.id,
      name: "Vendas",
    });

    const pipelines = (await (
      await app.request(`/api/crm/pipeline?workspaceId=${member.workspace.id}`)
    ).json()) as Array<{
      id: string;
      stages: Array<{ id: string; outcome: string; slug: string }>;
    }>;

    const stages = pipelines[0].stages;
    const secondOpen = stages.filter((stage) => stage.outcome === "open")[1];

    const deal = (await (
      await post(app, "/api/crm/deal", {
        workspaceId: member.workspace.id,
        title: "Negócio",
      })
    ).json()) as { id: string };

    const moved = await patch(app, `/api/crm/deal/${deal.id}/stage`, {
      workspaceId: member.workspace.id,
      stageId: secondOpen.id,
    });
    expect(moved.status).toBe(200);

    const history = await db
      .select()
      .from(schema.crmStageHistoryTable)
      .where(eq(schema.crmStageHistoryTable.dealId, deal.id))
      .orderBy(schema.crmStageHistoryTable.enteredAt);

    expect(history).toHaveLength(2);
    expect(history[0].exitedAt).not.toBeNull();
    expect(history[0].durationSeconds).not.toBeNull();
    expect(history[1].toStageId).toBe(secondOpen.id);
    expect(history[1].exitedAt).toBeNull();
  });

  it("does not restart the rotting clock when a deal is only reordered", async () => {
    const member = await seedCrmWorkspace();
    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    await post(app, "/api/crm/pipeline", {
      workspaceId: member.workspace.id,
      name: "Vendas",
    });

    const deal = (await (
      await post(app, "/api/crm/deal", {
        workspaceId: member.workspace.id,
        title: "Negócio",
      })
    ).json()) as { id: string; stageId: string; stageEnteredAt: string };

    const before = new Date("2020-01-01T00:00:00.000Z");
    await db
      .update(schema.crmDealTable)
      .set({ stageEnteredAt: before })
      .where(eq(schema.crmDealTable.id, deal.id));

    await patch(app, `/api/crm/deal/${deal.id}/stage`, {
      workspaceId: member.workspace.id,
      stageId: deal.stageId,
      position: 3,
    });

    const [after] = await db
      .select()
      .from(schema.crmDealTable)
      .where(eq(schema.crmDealTable.id, deal.id));

    expect(after.position).toBe(3);
    expect(after.stageEnteredAt.toISOString()).toBe(before.toISOString());

    const history = await db
      .select()
      .from(schema.crmStageHistoryTable)
      .where(eq(schema.crmStageHistoryTable.dealId, deal.id));
    expect(history).toHaveLength(1);
  });

  it("requires a lost reason to lose a deal and clears it on reopen", async () => {
    const member = await seedCrmWorkspace();
    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    await post(app, "/api/crm/pipeline", {
      workspaceId: member.workspace.id,
      name: "Vendas",
    });

    const pipelines = (await (
      await app.request(`/api/crm/pipeline?workspaceId=${member.workspace.id}`)
    ).json()) as Array<{
      stages: Array<{ id: string; outcome: string }>;
    }>;

    const lostStage = pipelines[0].stages.find(
      (stage) => stage.outcome === "lost",
    );

    const deal = (await (
      await post(app, "/api/crm/deal", {
        workspaceId: member.workspace.id,
        title: "Negócio",
      })
    ).json()) as { id: string };

    const withoutReason = await patch(app, `/api/crm/deal/${deal.id}/stage`, {
      workspaceId: member.workspace.id,
      stageId: lostStage?.id,
    });
    expect(withoutReason.status).toBe(400);

    const reason = (await (
      await post(app, "/api/crm/pipeline/lost-reason", {
        workspaceId: member.workspace.id,
        name: "Preço",
      })
    ).json()) as { id: string };

    const lost = await patch(app, `/api/crm/deal/${deal.id}/stage`, {
      workspaceId: member.workspace.id,
      stageId: lostStage?.id,
      lostReasonId: reason.id,
      lostReasonNote: "Concorrente cobrou metade",
    });
    expect(lost.status).toBe(200);

    const lostDeal = (await lost.json()) as {
      status: string;
      lostAt: string | null;
      lostReasonId: string | null;
    };
    expect(lostDeal.status).toBe("lost");
    expect(lostDeal.lostAt).not.toBeNull();
    expect(lostDeal.lostReasonId).toBe(reason.id);

    const reopened = await post(app, `/api/crm/deal/${deal.id}/reopen`, {
      workspaceId: member.workspace.id,
    });
    expect(reopened.status).toBe(200);

    const reopenedDeal = (await reopened.json()) as {
      status: string;
      lostAt: string | null;
      lostReasonId: string | null;
    };
    expect(reopenedDeal.status).toBe("open");
    expect(reopenedDeal.lostAt).toBeNull();
    expect(reopenedDeal.lostReasonId).toBeNull();
  });

  it("keeps the lost reason when a lost deal is only reordered", async () => {
    const member = await seedCrmWorkspace();
    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    await post(app, "/api/crm/pipeline", {
      workspaceId: member.workspace.id,
      name: "Vendas",
    });

    const pipelines = (await (
      await app.request(`/api/crm/pipeline?workspaceId=${member.workspace.id}`)
    ).json()) as Array<{ stages: Array<{ id: string; outcome: string }> }>;
    const lostStage = pipelines[0].stages.find(
      (stage) => stage.outcome === "lost",
    );

    const reason = (await (
      await post(app, "/api/crm/pipeline/lost-reason", {
        workspaceId: member.workspace.id,
        name: "Preço",
      })
    ).json()) as { id: string };

    const deal = (await (
      await post(app, "/api/crm/deal", {
        workspaceId: member.workspace.id,
        title: "Negócio",
      })
    ).json()) as { id: string };

    await patch(app, `/api/crm/deal/${deal.id}/stage`, {
      workspaceId: member.workspace.id,
      stageId: lostStage?.id,
      lostReasonId: reason.id,
      lostReasonNote: "Concorrente mais barato",
    });

    // Dragging the card up or down inside the lost column sends no reason.
    const reordered = await patch(app, `/api/crm/deal/${deal.id}/stage`, {
      workspaceId: member.workspace.id,
      stageId: lostStage?.id,
      position: 2,
    });

    expect(reordered.status).toBe(200);

    const payload = (await reordered.json()) as {
      status: string;
      position: number;
      lostReasonId: string | null;
      lostReasonNote: string | null;
    };
    expect(payload.status).toBe("lost");
    expect(payload.position).toBe(2);
    expect(payload.lostReasonId).toBe(reason.id);
    expect(payload.lostReasonNote).toBe("Concorrente mais barato");
  });

  it("computes board totals in SQL, weighted by the deal's own probability", async () => {
    const member = await seedCrmWorkspace();
    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    await post(app, "/api/crm/pipeline", {
      workspaceId: member.workspace.id,
      name: "Vendas",
    });

    // Stage one is seeded at 10% probability.
    await post(app, "/api/crm/deal", {
      workspaceId: member.workspace.id,
      title: "A",
      valueCents: 100_000,
    });
    await post(app, "/api/crm/deal", {
      workspaceId: member.workspace.id,
      title: "B",
      valueCents: 200_000,
      probability: 50,
    });

    const board = (await (
      await app.request(
        `/api/crm/deal/board?workspaceId=${member.workspace.id}`,
      )
    ).json()) as {
      stages: Array<{
        outcome: string;
        dealCount: number;
        totalValueCents: number;
        weightedValueCents: number;
        hasMore: boolean;
      }>;
      summary: {
        openCount: number;
        openValueCents: number;
        weightedValueCents: number;
      };
    };

    const first = board.stages[0];
    expect(first.dealCount).toBe(2);
    expect(first.totalValueCents).toBe(300_000);
    // 100000 * 10% + 200000 * 50% (its own override, not the stage's 10%).
    expect(first.weightedValueCents).toBe(110_000);
    expect(first.hasMore).toBe(false);

    expect(board.summary.openCount).toBe(2);
    expect(board.summary.openValueCents).toBe(300_000);
    expect(board.summary.weightedValueCents).toBe(110_000);
  });

  it("keeps a seller inside their own pipeline", async () => {
    const owner = await seedCrmWorkspace("sales");

    // A second seller in the same workspace, with a deal of their own.
    const [colleague] = await db
      .insert(schema.userTable)
      .values({
        id: "user-colleague",
        email: "colleague@example.com",
        emailVerified: true,
        name: "Colleague",
      })
      .returning();

    await db.insert(schema.workspaceUserTable).values({
      workspaceId: owner.workspace.id,
      userId: colleague.id,
      role: "sales",
      joinedAt: new Date(),
    });

    await db.insert(schema.workspaceRoleTable).values({
      workspaceId: owner.workspace.id,
      role: "admin",
      permission: JSON.stringify(defaultRolePayloads.admin),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    mockAuthenticatedSession(owner.user);
    const { app } = createApp();

    // A seller cannot configure funnels (crmPipeline:read only), so the
    // pipeline is seeded directly.
    const [pipeline] = await db
      .insert(schema.crmPipelineTable)
      .values({
        workspaceId: owner.workspace.id,
        name: "Vendas",
        slug: "vendas",
        isDefault: true,
      })
      .returning();

    const [stage] = await db
      .insert(schema.crmStageTable)
      .values({
        pipelineId: pipeline.id,
        name: "Qualification",
        slug: "qualification",
        position: 0,
        probability: 10,
        outcome: "open",
      })
      .returning();

    await post(app, "/api/crm/deal", {
      workspaceId: owner.workspace.id,
      title: "Meu negócio",
      valueCents: 100_000,
    });

    await db.insert(schema.crmDealTable).values({
      workspaceId: owner.workspace.id,
      number: 99,
      pipelineId: pipeline.id,
      stageId: stage.id,
      title: "Negócio do colega",
      ownerUserId: colleague.id,
      valueCents: 900_000,
      stageEnteredAt: new Date(),
    });

    const list = (await (
      await app.request(`/api/crm/deal?workspaceId=${owner.workspace.id}`)
    ).json()) as { total: number; items: Array<{ title: string }> };

    // `sales` has crmDeal:read but not read_all.
    expect(list.total).toBe(1);
    expect(list.items[0].title).toBe("Meu negócio");

    const board = (await (
      await app.request(`/api/crm/deal/board?workspaceId=${owner.workspace.id}`)
    ).json()) as { summary: { openValueCents: number } };

    // The colleague's 900.000 must not leak into the totals either.
    expect(board.summary.openValueCents).toBe(100_000);
  });

  it("reports a bounded progression rate even when deals start mid-funnel", async () => {
    const member = await seedCrmWorkspace();
    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    await post(app, "/api/crm/pipeline", {
      workspaceId: member.workspace.id,
      name: "Vendas",
    });

    const pipelines = (await (
      await app.request(`/api/crm/pipeline?workspaceId=${member.workspace.id}`)
    ).json()) as Array<{
      stages: Array<{ id: string; outcome: string; position: number }>;
    }>;
    const open = pipelines[0].stages.filter(
      (stage) => stage.outcome === "open",
    );

    // Two deals created straight into the second stage, one into the first.
    // A stage-over-stage rate would read 200% here.
    await post(app, "/api/crm/deal", {
      workspaceId: member.workspace.id,
      title: "Direto na segunda A",
      stageId: open[1].id,
    });
    await post(app, "/api/crm/deal", {
      workspaceId: member.workspace.id,
      title: "Direto na segunda B",
      stageId: open[1].id,
    });
    const first = (await (
      await post(app, "/api/crm/deal", {
        workspaceId: member.workspace.id,
        title: "Começou no início",
        stageId: open[0].id,
      })
    ).json()) as { id: string };

    await patch(app, `/api/crm/deal/${first.id}/stage`, {
      workspaceId: member.workspace.id,
      stageId: open[1].id,
    });

    const report = (await (
      await app.request(
        `/api/crm/report/funnel?workspaceId=${member.workspace.id}`,
      )
    ).json()) as {
      stages: Array<{
        id: string;
        entered: number;
        advanced: number;
        progressionRate: number | null;
        outcome: string;
      }>;
    };

    const firstStage = report.stages.find((stage) => stage.id === open[0].id);
    const secondStage = report.stages.find((stage) => stage.id === open[1].id);

    expect(firstStage?.entered).toBe(1);
    expect(firstStage?.advanced).toBe(1);
    expect(firstStage?.progressionRate).toBe(100);

    // Three deals reached the second stage and none moved on.
    expect(secondStage?.entered).toBe(3);
    expect(secondStage?.progressionRate).toBe(0);

    // No rate can exceed 100%, which is the whole point of the metric.
    for (const stage of report.stages) {
      if (stage.progressionRate !== null) {
        expect(stage.progressionRate).toBeLessThanOrEqual(100);
      }
    }

    // Closing stages get no rate: a permanent 0% there reads like a failure.
    const closing = report.stages.filter((stage) => stage.outcome !== "open");
    expect(closing.every((stage) => stage.progressionRate === null)).toBe(true);
  });

  it("weights the forecast by the deal's own probability and separates undated deals", async () => {
    const member = await seedCrmWorkspace();
    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    await post(app, "/api/crm/pipeline", {
      workspaceId: member.workspace.id,
      name: "Vendas",
    });

    // Stage one is seeded at 10%.
    await post(app, "/api/crm/deal", {
      workspaceId: member.workspace.id,
      title: "Herda a etapa",
      valueCents: 100_000,
      expectedCloseDate: "2026-11-20T12:00:00.000Z",
    });
    await post(app, "/api/crm/deal", {
      workspaceId: member.workspace.id,
      title: "Probabilidade própria",
      valueCents: 200_000,
      probability: 50,
      expectedCloseDate: "2026-11-25T12:00:00.000Z",
    });
    await post(app, "/api/crm/deal", {
      workspaceId: member.workspace.id,
      title: "Sem previsão",
      valueCents: 900_000,
    });

    const report = (await (
      await app.request(
        `/api/crm/report/forecast?workspaceId=${member.workspace.id}`,
      )
    ).json()) as {
      months: Array<{
        month: string;
        openValueCents: number;
        weightedValueCents: number;
      }>;
      withoutCloseDate: { deals: number; valueCents: number };
    };

    const november = report.months.find((month) => month.month === "2026-11");
    expect(november?.openValueCents).toBe(300_000);
    // 100000 * 10% + 200000 * 50%, the override winning over the stage.
    expect(november?.weightedValueCents).toBe(110_000);

    // A deal with no expected close date cannot be forecast into a month, so
    // it is reported apart rather than silently dropped.
    expect(report.withoutCloseDate.deals).toBe(1);
    expect(report.withoutCloseDate.valueCents).toBe(900_000);
  });

  it("pairs closed revenue with the hours logged on the tasks that delivered it", async () => {
    const member = await seedCrmWorkspace();
    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    await post(app, "/api/crm/pipeline", {
      workspaceId: member.workspace.id,
      name: "Vendas",
    });

    const company = (await (
      await post(app, "/api/crm/company", {
        primaryContact: { firstName: "Contato" },
        workspaceId: member.workspace.id,
        name: "Acme",
      })
    ).json()) as { id: string };

    const deal = (await (
      await post(app, "/api/crm/deal", {
        workspaceId: member.workspace.id,
        title: "Campanha",
        companyId: company.id,
        valueCents: 1_000_000,
      })
    ).json()) as { id: string };

    const project = (await (
      await post(app, "/api/project", {
        workspaceId: member.workspace.id,
        name: "Projeto Design",
        icon: "Folder",
        slug: "projeto-design",
      })
    ).json()) as { id: string };

    const created = (await (
      await post(app, `/api/crm/deal/${deal.id}/delivery-tasks`, {
        workspaceId: member.workspace.id,
        items: [{ projectId: project.id, title: "Peças" }],
      })
    ).json()) as { tasks: Array<{ id: string }> };

    // Four hours, stored as seconds the way the time tracker does.
    await db.insert(schema.timeEntryTable).values({
      taskId: created.tasks[0].id,
      userId: member.user.id,
      startTime: new Date(),
      endTime: new Date(),
      duration: 4 * 3600,
    });

    const pipelines = (await (
      await app.request(`/api/crm/pipeline?workspaceId=${member.workspace.id}`)
    ).json()) as Array<{ stages: Array<{ id: string; outcome: string }> }>;
    const wonStage = pipelines[0].stages.find(
      (stage) => stage.outcome === "won",
    );

    await patch(app, `/api/crm/deal/${deal.id}/stage`, {
      workspaceId: member.workspace.id,
      stageId: wonStage?.id,
    });

    const report = (await (
      await app.request(
        `/api/crm/report/revenue-vs-delivery?workspaceId=${member.workspace.id}&groupBy=deal`,
      )
    ).json()) as Array<{
      dealId: string;
      valueCents: number;
      taskCount: number;
      trackedSeconds: number;
      revenuePerHourCents: number | null;
    }>;

    expect(report).toHaveLength(1);
    expect(report[0].dealId).toBe(deal.id);
    expect(report[0].taskCount).toBe(1);
    expect(report[0].trackedSeconds).toBe(4 * 3600);
    // R$ 10.000 over 4 hours.
    expect(report[0].revenuePerHourCents).toBe(250_000);
  });

  it("leaves revenue per hour null when nothing was tracked", async () => {
    const member = await seedCrmWorkspace();
    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    await post(app, "/api/crm/pipeline", {
      workspaceId: member.workspace.id,
      name: "Vendas",
    });

    const company = (await (
      await post(app, "/api/crm/company", {
        workspaceId: member.workspace.id,
        name: "Cliente sem apontamento",
        primaryContact: { firstName: "Ana" },
      })
    ).json()) as { id: string };

    const deal = (await (
      await post(app, "/api/crm/deal", {
        workspaceId: member.workspace.id,
        title: "Sem apontamento",
        valueCents: 500_000,
        companyId: company.id,
      })
    ).json()) as { id: string };

    const pipelines = (await (
      await app.request(`/api/crm/pipeline?workspaceId=${member.workspace.id}`)
    ).json()) as Array<{ stages: Array<{ id: string; outcome: string }> }>;
    const wonStage = pipelines[0].stages.find(
      (stage) => stage.outcome === "won",
    );

    await patch(app, `/api/crm/deal/${deal.id}/stage`, {
      workspaceId: member.workspace.id,
      stageId: wonStage?.id,
    });

    const report = (await (
      await app.request(
        `/api/crm/report/revenue-vs-delivery?workspaceId=${member.workspace.id}`,
      )
    ).json()) as Array<{ revenuePerHourCents: number | null }>;

    // Null, not zero: "no data" and "infinite revenue per hour" are different
    // answers and the UI has to be able to tell them apart.
    expect(report[0].revenuePerHourCents).toBeNull();
  });

  it("keeps a seller's reports to their own deals", async () => {
    const seller = await seedCrmWorkspace("sales");

    const [pipeline] = await db
      .insert(schema.crmPipelineTable)
      .values({
        workspaceId: seller.workspace.id,
        name: "Vendas",
        slug: "vendas",
        isDefault: true,
      })
      .returning();
    const [stage] = await db
      .insert(schema.crmStageTable)
      .values({
        pipelineId: pipeline.id,
        name: "Qualification",
        slug: "qualification",
        position: 0,
        probability: 10,
        outcome: "open",
      })
      .returning();

    const [colleague] = await db
      .insert(schema.userTable)
      .values({
        id: "user-report-colleague",
        email: "report-colleague@example.com",
        emailVerified: true,
        name: "Colleague",
      })
      .returning();

    await db.insert(schema.crmDealTable).values({
      workspaceId: seller.workspace.id,
      number: 90,
      pipelineId: pipeline.id,
      stageId: stage.id,
      title: "Negócio do colega",
      ownerUserId: colleague.id,
      valueCents: 900_000,
      stageEnteredAt: new Date(),
    });

    mockAuthenticatedSession(seller.user);
    const { app } = createApp();

    await post(app, "/api/crm/deal", {
      workspaceId: seller.workspace.id,
      title: "Meu negócio",
      valueCents: 100_000,
    });

    const team = (await (
      await app.request(
        `/api/crm/report/team?workspaceId=${seller.workspace.id}`,
      )
    ).json()) as Array<{ ownerUserId: string | null; open: { deals: number } }>;

    // `sales` has crmReport:read but not read_all.
    expect(team).toHaveLength(1);
    expect(team[0].ownerUserId).toBe(seller.user.id);
    expect(team[0].open.deals).toBe(1);
  });

  it("refuses to export contacts without the export permission", async () => {
    const member = await seedCrmWorkspace("sales");
    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const response = await app.request(
      `/api/crm/contact/export?workspaceId=${member.workspace.id}`,
    );

    expect(response.status).toBe(403);
  });

  it("exports contacts as CSV and records it in the audit log", async () => {
    const member = await seedCrmWorkspace();
    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    await post(app, "/api/crm/contact", {
      workspaceId: member.workspace.id,
      firstName: "Ana",
      lastName: "Souza",
      email: "ANA@Acme.com ",
    });

    const response = await app.request(
      `/api/crm/contact/export?workspaceId=${member.workspace.id}`,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/csv");

    const csv = await response.text();
    expect(csv.split("\n")[0]).toContain("firstName");
    // Emails are normalized on the way in so imports and dedup can match.
    expect(csv).toContain("ana@acme.com");

    const audit = await db
      .select()
      .from(schema.auditLogTable)
      .where(eq(schema.auditLogTable.action, "crm.contact.export"));

    expect(audit).toHaveLength(1);
    expect(audit[0].workspaceId).toBe(member.workspace.id);
  });

  it("surfaces duplicate companies without blocking the write", async () => {
    const member = await seedCrmWorkspace();
    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    await post(app, "/api/crm/company", {
      primaryContact: { firstName: "Contato" },
      workspaceId: member.workspace.id,
      name: "Acme LTDA",
      taxId: "11.222.333/0001-81",
    });

    const second = await post(app, "/api/crm/company", {
      primaryContact: { firstName: "Contato" },
      workspaceId: member.workspace.id,
      name: "Acme Brasil",
      // Same document, written with a different mask.
      taxId: "11222333000181",
    });

    // The unique index is partial on (workspaceId, taxId), so an identical tax
    // id is rejected by the database — which is the behaviour we want here.
    expect(second.status).toBe(500);

    const withDomain = await post(app, "/api/crm/company", {
      primaryContact: { firstName: "Contato" },
      workspaceId: member.workspace.id,
      name: "Acme Filial",
      domain: "https://www.acme.com/contato",
    });
    const created = (await withDomain.json()) as {
      domain: string;
      possibleDuplicates: unknown[];
    };
    expect(created.domain).toBe("acme.com");
  });

  it("keeps the deal's next-activity stamp in step with its activities", async () => {
    const member = await seedCrmWorkspace();
    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    await post(app, "/api/crm/pipeline", {
      workspaceId: member.workspace.id,
      name: "Vendas",
    });

    const deal = (await (
      await post(app, "/api/crm/deal", {
        workspaceId: member.workspace.id,
        title: "Negócio",
      })
    ).json()) as { id: string };

    const dueAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);

    const activity = (await (
      await post(app, "/api/crm/activity", {
        workspaceId: member.workspace.id,
        type: "call",
        subject: "Ligar para o decisor",
        dealId: deal.id,
        dueAt: dueAt.toISOString(),
      })
    ).json()) as { id: string };

    const [withPending] = await db
      .select()
      .from(schema.crmDealTable)
      .where(eq(schema.crmDealTable.id, deal.id));

    expect(withPending.nextActivityAt?.toISOString()).toBe(dueAt.toISOString());
    expect(withPending.lastActivityAt).toBeNull();

    const completed = await post(
      app,
      `/api/crm/activity/${activity.id}/complete`,
      { workspaceId: member.workspace.id, outcome: "connected" },
    );
    expect(completed.status).toBe(200);

    const [afterCompletion] = await db
      .select()
      .from(schema.crmDealTable)
      .where(eq(schema.crmDealTable.id, deal.id));

    expect(afterCompletion.nextActivityAt).toBeNull();
    expect(afterCompletion.lastActivityAt).not.toBeNull();
  });

  it("keeps a seller's activity timeline to their own deals", async () => {
    const seller = await seedCrmWorkspace("sales");

    const [colleague] = await db
      .insert(schema.userTable)
      .values({
        id: "user-activity-colleague",
        email: "activity-colleague@example.com",
        emailVerified: true,
        name: "Colleague",
      })
      .returning();

    const [pipeline] = await db
      .insert(schema.crmPipelineTable)
      .values({
        workspaceId: seller.workspace.id,
        name: "Vendas",
        slug: "vendas",
        isDefault: true,
      })
      .returning();

    const [stage] = await db
      .insert(schema.crmStageTable)
      .values({
        pipelineId: pipeline.id,
        name: "Qualification",
        slug: "qualification",
        position: 0,
        probability: 10,
        outcome: "open",
      })
      .returning();

    const [otherDeal] = await db
      .insert(schema.crmDealTable)
      .values({
        workspaceId: seller.workspace.id,
        number: 50,
        pipelineId: pipeline.id,
        stageId: stage.id,
        title: "Negócio do colega",
        ownerUserId: colleague.id,
        stageEnteredAt: new Date(),
      })
      .returning();

    await db.insert(schema.crmActivityTable).values({
      workspaceId: seller.workspace.id,
      type: "call",
      subject: "Ligação confidencial do colega",
      dealId: otherDeal.id,
      ownerUserId: colleague.id,
    });

    mockAuthenticatedSession(seller.user);
    const { app } = createApp();

    const mine = (await (
      await post(app, "/api/crm/deal", {
        workspaceId: seller.workspace.id,
        title: "Meu negócio",
      })
    ).json()) as { id: string };

    await post(app, "/api/crm/activity", {
      workspaceId: seller.workspace.id,
      type: "note",
      subject: "Minha nota",
      dealId: mine.id,
    });

    const listed = (await (
      await app.request(`/api/crm/activity?workspaceId=${seller.workspace.id}`)
    ).json()) as { total: number; items: Array<{ subject: string }> };

    expect(listed.total).toBe(1);
    expect(listed.items[0].subject).toBe("Minha nota");
  });

  it("validates custom field values against their definition", async () => {
    const member = await seedCrmWorkspace();
    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    await post(app, "/api/crm/pipeline", {
      workspaceId: member.workspace.id,
      name: "Vendas",
    });

    const definition = (await (
      await post(app, "/api/crm/field", {
        workspaceId: member.workspace.id,
        entity: "deal",
        label: "Origem do Lead",
        type: "select",
        options: ["Indicação", "Inbound"],
      })
    ).json()) as { id: string; key: string };

    expect(definition.key).toBe("origem-do-lead");

    const deal = (await (
      await post(app, "/api/crm/deal", {
        workspaceId: member.workspace.id,
        title: "Negócio",
      })
    ).json()) as { id: string };

    const rejected = await app.request(`/api/crm/field/value/deal/${deal.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        workspaceId: member.workspace.id,
        values: [{ key: "origem-do-lead", value: "Outdoor" }],
      }),
    });
    expect(rejected.status).toBe(400);

    const accepted = await app.request(`/api/crm/field/value/deal/${deal.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        workspaceId: member.workspace.id,
        values: [{ key: "origem-do-lead", value: "Indicação" }],
      }),
    });
    expect(accepted.status).toBe(200);

    const values = (await accepted.json()) as Array<{
      key: string;
      value: string;
    }>;
    expect(values[0].value).toBe("Indicação");
  });

  it("finds deals, contacts and companies in global search", async () => {
    const member = await seedCrmWorkspace();
    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    await post(app, "/api/crm/pipeline", {
      workspaceId: member.workspace.id,
      name: "Vendas",
    });
    await post(app, "/api/crm/company", {
      primaryContact: { firstName: "Contato" },
      workspaceId: member.workspace.id,
      name: "Zephyr Logística",
    });
    await post(app, "/api/crm/contact", {
      workspaceId: member.workspace.id,
      firstName: "Zephyr",
      lastName: "Contato",
    });
    await post(app, "/api/crm/deal", {
      workspaceId: member.workspace.id,
      title: "Projeto Zephyr",
    });

    const response = await app.request(
      `/api/search?q=zephyr&workspaceId=${member.workspace.id}`,
    );
    expect(response.status).toBe(200);

    const payload = (await response.json()) as {
      results: Array<{ type: string; title: string }>;
    };

    const types = new Set(payload.results.map((result) => result.type));
    expect(types.has("deal")).toBe(true);
    expect(types.has("contact")).toBe(true);
    expect(types.has("company")).toBe(true);
  });

  it("does not leak CRM records into a search by someone without CRM access", async () => {
    // `viewer` has no CRM statements at all.
    const member = await createWorkspaceMember({ role: "viewer" });
    await db.insert(schema.workspaceRoleTable).values({
      workspaceId: member.workspace.id,
      role: "viewer",
      permission: JSON.stringify(defaultRolePayloads.viewer),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const [pipeline] = await db
      .insert(schema.crmPipelineTable)
      .values({
        workspaceId: member.workspace.id,
        name: "Vendas",
        slug: "vendas",
        isDefault: true,
      })
      .returning();

    const [stage] = await db
      .insert(schema.crmStageTable)
      .values({
        pipelineId: pipeline.id,
        name: "Qualification",
        slug: "qualification",
        position: 0,
        probability: 10,
        outcome: "open",
      })
      .returning();

    await db.insert(schema.crmDealTable).values({
      workspaceId: member.workspace.id,
      number: 1,
      pipelineId: pipeline.id,
      stageId: stage.id,
      title: "Projeto Zephyr",
      valueCents: 500_000,
      stageEnteredAt: new Date(),
    });

    await db.insert(schema.crmContactTable).values({
      workspaceId: member.workspace.id,
      firstName: "Zephyr",
    });

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const response = await app.request(
      `/api/search?q=zephyr&workspaceId=${member.workspace.id}`,
    );
    expect(response.status).toBe(200);

    const payload = (await response.json()) as {
      results: Array<{ type: string }>;
    };
    const types = new Set(payload.results.map((result) => result.type));
    expect(types.has("deal")).toBe(false);
    expect(types.has("contact")).toBe(false);
    expect(types.has("company")).toBe(false);

    // Asking for them outright is refused rather than silently empty.
    const explicit = await app.request(
      `/api/search?q=zephyr&type=deals&workspaceId=${member.workspace.id}`,
    );
    expect(explicit.status).toBe(403);
  });

  it("keeps the client on a task when the deal or company goes away", async () => {
    const member = await seedCrmWorkspace();
    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    await post(app, "/api/crm/pipeline", {
      workspaceId: member.workspace.id,
      name: "Vendas",
    });

    const company = (await (
      await post(app, "/api/crm/company", {
        primaryContact: { firstName: "Contato" },
        workspaceId: member.workspace.id,
        name: "Acme",
      })
    ).json()) as { id: string };

    const deal = (await (
      await post(app, "/api/crm/deal", {
        workspaceId: member.workspace.id,
        title: "Negócio",
        companyId: company.id,
      })
    ).json()) as { id: string };

    // A discipline project: it holds work for every client, not just this one.
    // Created through the API so it gets its default columns, the way a real
    // one does.
    const project = (await (
      await post(app, "/api/project", {
        workspaceId: member.workspace.id,
        name: "Projeto Design",
        icon: "Folder",
        slug: "projeto-design",
      })
    ).json()) as { id: string };

    const created = await post(app, `/api/crm/deal/${deal.id}/delivery-tasks`, {
      workspaceId: member.workspace.id,
      items: [
        { projectId: project.id, title: "Identidade visual" },
        { projectId: project.id, title: "Manual da marca" },
      ],
    });
    expect(created.status).toBe(200);

    const payload = (await created.json()) as { tasks: Array<{ id: string }> };
    expect(payload.tasks).toHaveLength(2);

    const [task] = await db
      .select()
      .from(schema.taskTable)
      .where(eq(schema.taskTable.id, payload.tasks[0].id));

    expect(task.crmCompanyId).toBe(company.id);
    expect(task.crmDealId).toBe(deal.id);
    // Landed in the project's own entry column rather than a hardcoded slug.
    expect(task.status).toBe("to-do");

    // Losing the deal must not lose the client: the work is still Acme's.
    await app.request(
      `/api/crm/deal/${deal.id}?workspaceId=${member.workspace.id}`,
      { method: "DELETE" },
    );

    const [afterDealDelete] = await db
      .select()
      .from(schema.taskTable)
      .where(eq(schema.taskTable.id, task.id));

    expect(afterDealDelete.crmDealId).toBeNull();
    expect(afterDealDelete.crmCompanyId).toBe(company.id);

    await app.request(
      `/api/crm/company/${company.id}?workspaceId=${member.workspace.id}`,
      { method: "DELETE" },
    );

    const [afterCompanyDelete] = await db
      .select()
      .from(schema.taskTable)
      .where(eq(schema.taskTable.id, task.id));

    // The task survives both, unlinked.
    expect(afterCompanyDelete.crmCompanyId).toBeNull();
    expect(afterCompanyDelete.title).toBe("Identidade visual");
  });

  it("fills in the client from the deal, and clears the deal with the client", async () => {
    const member = await seedCrmWorkspace();
    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    await post(app, "/api/crm/pipeline", {
      workspaceId: member.workspace.id,
      name: "Vendas",
    });

    const company = (await (
      await post(app, "/api/crm/company", {
        primaryContact: { firstName: "Contato" },
        workspaceId: member.workspace.id,
        name: "Acme",
      })
    ).json()) as { id: string };

    const deal = (await (
      await post(app, "/api/crm/deal", {
        workspaceId: member.workspace.id,
        title: "Negócio",
        companyId: company.id,
      })
    ).json()) as { id: string };

    const [project] = await db
      .insert(schema.projectTable)
      .values({
        workspaceId: member.workspace.id,
        name: "Projeto Design",
        slug: "projeto-design",
      })
      .returning();

    const [task] = await db
      .insert(schema.taskTable)
      .values({
        projectId: project.id,
        number: 1,
        title: "Ajuste de banner",
        status: "to-do",
      })
      .returning();

    // Only the deal is sent; the client is inferred from it.
    const linked = await app.request(`/api/task/client/${task.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ crmCompanyId: null, crmDealId: deal.id }),
    });
    expect(linked.status).toBe(200);

    const withDeal = (await linked.json()) as {
      crmCompanyId: string | null;
      crmDealId: string | null;
    };
    expect(withDeal.crmCompanyId).toBe(company.id);
    expect(withDeal.crmDealId).toBe(deal.id);

    // Clearing the client clears the deal too — a deal on a clientless task
    // would be incoherent.
    const cleared = await app.request(`/api/task/client/${task.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ crmCompanyId: null }),
    });

    const withoutClient = (await cleared.json()) as {
      crmCompanyId: string | null;
      crmDealId: string | null;
    };
    expect(withoutClient.crmCompanyId).toBeNull();
    expect(withoutClient.crmDealId).toBeNull();
  });

  it("refuses a deal from another workspace", async () => {
    const member = await seedCrmWorkspace();
    const other = await seedCrmWorkspace();
    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const [pipeline] = await db
      .insert(schema.crmPipelineTable)
      .values({
        workspaceId: other.workspace.id,
        name: "Outro",
        slug: "outro",
        isDefault: true,
      })
      .returning();
    const [stage] = await db
      .insert(schema.crmStageTable)
      .values({
        pipelineId: pipeline.id,
        name: "Q",
        slug: "q",
        position: 0,
        probability: 10,
        outcome: "open",
      })
      .returning();
    const [foreignDeal] = await db
      .insert(schema.crmDealTable)
      .values({
        workspaceId: other.workspace.id,
        number: 1,
        pipelineId: pipeline.id,
        stageId: stage.id,
        title: "Negócio alheio",
        stageEnteredAt: new Date(),
      })
      .returning();

    const [project] = await db
      .insert(schema.projectTable)
      .values({
        workspaceId: member.workspace.id,
        name: "Projeto Design",
        slug: "projeto-design",
      })
      .returning();
    const [task] = await db
      .insert(schema.taskTable)
      .values({
        projectId: project.id,
        number: 1,
        title: "Tarefa",
        status: "to-do",
      })
      .returning();

    const response = await app.request(`/api/task/client/${task.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        crmCompanyId: null,
        crmDealId: foreignDeal.id,
      }),
    });

    expect(response.status).toBe(400);
  });

  it("groups a client's tasks by project on the company view", async () => {
    const member = await seedCrmWorkspace();
    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const company = (await (
      await post(app, "/api/crm/company", {
        primaryContact: { firstName: "Contato" },
        workspaceId: member.workspace.id,
        name: "Acme",
      })
    ).json()) as { id: string };

    const projects = [];
    for (const name of ["Projeto Design", "Projeto Dev"]) {
      const [project] = await db
        .insert(schema.projectTable)
        .values({
          workspaceId: member.workspace.id,
          name,
          slug: name.toLowerCase().replace(/\s+/g, "-"),
        })
        .returning();
      projects.push(project);
    }

    const [doneColumn] = await db
      .insert(schema.columnTable)
      .values({
        projectId: projects[0].id,
        name: "Done",
        slug: "done",
        position: 0,
        isFinal: true,
      })
      .returning();

    await db.insert(schema.taskTable).values([
      {
        projectId: projects[0].id,
        number: 1,
        title: "Identidade",
        status: "done",
        columnId: doneColumn.id,
        crmCompanyId: company.id,
      },
      {
        projectId: projects[0].id,
        number: 2,
        title: "Manual",
        status: "to-do",
        crmCompanyId: company.id,
      },
      {
        projectId: projects[1].id,
        number: 1,
        title: "Landing page",
        status: "to-do",
        crmCompanyId: company.id,
      },
      // Another client's task in the same discipline project must not show up.
      {
        projectId: projects[0].id,
        number: 3,
        title: "Trabalho de outro cliente",
        status: "to-do",
      },
    ]);

    const view = (await (
      await app.request(
        `/api/crm/company/${company.id}?workspaceId=${member.workspace.id}`,
      )
    ).json()) as {
      openTaskCount: number;
      tasksByProject: Array<{
        projectName: string;
        openCount: number;
        tasks: Array<{ title: string; isDone: boolean }>;
      }>;
    };

    expect(view.tasksByProject).toHaveLength(2);
    expect(view.openTaskCount).toBe(2);

    const design = view.tasksByProject.find(
      (group) => group.projectName === "Projeto Design",
    );
    expect(design?.tasks.map((task) => task.title).sort()).toEqual([
      "Identidade",
      "Manual",
    ]);
    // The finished one is marked, and does not count as open.
    expect(design?.openCount).toBe(1);
    expect(
      design?.tasks.find((task) => task.title === "Identidade")?.isDone,
    ).toBe(true);
  });
  it("refuses a company without a primary contact, and creates both at once", async () => {
    const member = await seedCrmWorkspace();
    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    // Uma empresa sem pessoa é um registro com o qual não se faz nada.
    const orphan = await post(app, "/api/crm/company", {
      workspaceId: member.workspace.id,
      name: "Sem contato",
    });
    expect(orphan.status).toBe(400);

    const response = await post(app, "/api/crm/company", {
      workspaceId: member.workspace.id,
      name: "Padaria do Ze",
      primaryContact: { firstName: "Jose", lastName: "Silva" },
    });
    expect(response.status).toBe(200);

    const created = (await response.json()) as {
      id: string;
      status: string;
      personType: string;
      primaryContact: { firstName: string; isPrimary: boolean } | null;
    };
    expect(created.status).toBe("prospect");
    expect(created.personType).toBe("pj");
    expect(created.primaryContact?.firstName).toBe("Jose");
    expect(created.primaryContact?.isPrimary).toBe(true);

    const contacts = await db
      .select()
      .from(schema.crmContactTable)
      .where(eq(schema.crmContactTable.companyId, created.id));
    expect(contacts).toHaveLength(1);
  });

  it("validates the document against the person type", async () => {
    const member = await seedCrmWorkspace();
    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const wrongDigits = await post(app, "/api/crm/company", {
      workspaceId: member.workspace.id,
      name: "Digito errado",
      taxId: "11.222.333/0001-82",
      primaryContact: { firstName: "Contato" },
    });
    expect(wrongDigits.status).toBe(400);

    // Um CNPJ válido não é um CPF válido: o tipo de pessoa escolhe o algoritmo.
    const wrongType = await post(app, "/api/crm/company", {
      workspaceId: member.workspace.id,
      name: "Tipo errado",
      personType: "pf",
      taxId: "11222333000181",
      primaryContact: { firstName: "Contato" },
    });
    expect(wrongType.status).toBe(400);

    const individual = await post(app, "/api/crm/company", {
      workspaceId: member.workspace.id,
      name: "Ana Souza",
      personType: "pf",
      taxId: "529.982.247-25",
      primaryContact: { firstName: "Ana" },
    });
    expect(individual.status).toBe(200);
    // Guardado sem máscara, como o índice único espera.
    expect(((await individual.json()) as { taxId: string }).taxId).toBe(
      "52998224725",
    );
  });

  it("seeds the default sources and keeps classification lists per workspace", async () => {
    const member = await seedCrmWorkspace();
    const other = await seedCrmWorkspace();
    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const source = await post(app, "/api/crm/taxonomy/source", {
      workspaceId: member.workspace.id,
      name: "Meta Ads",
      channel: "paid",
    });
    expect(source.status).toBe(200);
    const sourceId = ((await source.json()) as { id: string }).id;

    // 409, não 500: o Drizzle embrulha o erro do pg, e sem descer a cadeia de
    // causas a duplicata voltava como falha de servidor.
    const duplicate = await post(app, "/api/crm/taxonomy/source", {
      workspaceId: member.workspace.id,
      name: "Meta Ads",
    });
    expect(duplicate.status).toBe(409);

    // A chave estrangeira garante que a linha existe, não que ela é deste
    // workspace.
    mockAuthenticatedSession(other.user);
    const crossWorkspace = await post(app, "/api/crm/company", {
      workspaceId: other.workspace.id,
      name: "De outro lugar",
      sourceId,
      primaryContact: { firstName: "Contato" },
    });
    expect(crossWorkspace.status).toBe(404);

    mockAuthenticatedSession(member.user);
    const classified = await post(app, "/api/crm/company", {
      workspaceId: member.workspace.id,
      name: "Padaria do Ze",
      sourceId,
      state: "SP",
      city: "São Paulo",
      primaryContact: { firstName: "Contato" },
    });
    expect(classified.status).toBe(200);

    const cities = await app.request(
      `/api/crm/company/cities?workspaceId=${member.workspace.id}`,
    );
    expect(await cities.json()).toEqual(["São Paulo"]);
  });

  it("stamps the churn date from the transition, and clears it on the way back", async () => {
    const member = await seedCrmWorkspace();
    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const created = await post(app, "/api/crm/company", {
      workspaceId: member.workspace.id,
      name: "Studio Ana",
      primaryContact: { firstName: "Ana" },
    });
    const company = (await created.json()) as { id: string };

    const churned = await patch(app, `/api/crm/company/${company.id}`, {
      workspaceId: member.workspace.id,
      status: "churned",
      churnReason: "Reduziu investimento",
    });
    const afterChurn = (await churned.json()) as {
      status: string;
      churnedAt: string | null;
      churnReason: string | null;
    };
    expect(afterChurn.status).toBe("churned");
    // Ninguém preenche uma data no instante em que registra a perda.
    expect(afterChurn.churnedAt).not.toBeNull();
    expect(afterChurn.churnReason).toBe("Reduziu investimento");

    const revived = await patch(app, `/api/crm/company/${company.id}`, {
      workspaceId: member.workspace.id,
      status: "active",
    });
    expect(
      ((await revived.json()) as { churnedAt: string | null }).churnedAt,
    ).toBe(null);
  });

  it("rejects a state outside the 27 units of the federation", async () => {
    const member = await seedCrmWorkspace();
    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const response = await post(app, "/api/crm/company", {
      workspaceId: member.workspace.id,
      name: "UF invalida",
      state: "XX",
      primaryContact: { firstName: "Contato" },
    });

    expect(response.status).toBe(400);
  });
  it("seeds a working CRM once per workspace: funnel, sources and lost reasons", async () => {
    const member = await seedCrmWorkspace();

    // A seed roda nos três caminhos que criam workspace (cadastro, setup e
    // admin), que as fixtures não atravessam — então o teste chama a mesma
    // função que eles chamam, duas vezes, para provar que não duplica.
    await seedCrmDefaults(member.workspace.id);
    await seedCrmDefaults(member.workspace.id);

    const sources = await db
      .select()
      .from(schema.crmSourceTable)
      .where(eq(schema.crmSourceTable.workspaceId, member.workspace.id));
    expect(sources).toHaveLength(7);
    expect(sources.find((row) => row.name === "Meta Ads")?.channel).toBe(
      "paid",
    );

    // Sem funil o board não abre e não há tela para criar um.
    mockAuthenticatedSession(member.user);
    const { app } = createApp();
    const board = await app.request(
      `/api/crm/deal/board?workspaceId=${member.workspace.id}`,
    );
    expect(board.status).toBe(200);
    const payload = (await board.json()) as {
      pipeline: { name: string };
      stages: Array<{ name: string; outcome: string }>;
    };
    expect(payload.pipeline.name).toBe("Funil de vendas");
    expect(payload.stages.map((stage) => stage.name)).toEqual([
      "Qualificação",
      "Descoberta",
      "Proposta",
      "Negociação",
      "Ganho",
      "Perdido",
    ]);

    // Sem razão de perda nenhum negócio pode ser perdido.
    const reasons = await db
      .select()
      .from(schema.crmLostReasonTable)
      .where(eq(schema.crmLostReasonTable.workspaceId, member.workspace.id));
    expect(reasons).toHaveLength(7);
  });

  it("lets sellers read the service catalog but not change it", async () => {
    const admin = await seedCrmWorkspace();
    mockAuthenticatedSession(admin.user);
    const { app } = createApp();

    const category = await post(app, "/api/crm/service/category", {
      workspaceId: admin.workspace.id,
      name: "Design",
    });
    expect(category.status).toBe(200);
    const categoryId = ((await category.json()) as { id: string }).id;

    const created = await post(app, "/api/crm/service", {
      workspaceId: admin.workspace.id,
      name: "Identidade visual",
      code: " idv ",
      categoryId,
      defaultPriceCents: 480_000,
    });
    expect(created.status).toBe(200);
    const service = (await created.json()) as {
      id: string;
      code: string;
      billingType: string;
    };
    // Código normalizado para o índice único não depender de quem digitou.
    expect(service.code).toBe("IDV");
    expect(service.billingType).toBe("one_time");

    const sameCode = await post(app, "/api/crm/service", {
      workspaceId: admin.workspace.id,
      name: "Outra identidade",
      code: "IDV",
    });
    expect(sameCode.status).toBe(409);

    const seller = await seedCrmWorkspace("sales");
    mockAuthenticatedSession(seller.user);
    const readable = await app.request(
      `/api/crm/service?workspaceId=${seller.workspace.id}`,
    );
    expect(readable.status).toBe(200);

    const forbidden = await post(app, "/api/crm/service", {
      workspaceId: seller.workspace.id,
      name: "Serviço do vendedor",
    });
    expect(forbidden.status).toBe(403);

    // Arquivar tira do catálogo sem apagar o que já foi vendido.
    mockAuthenticatedSession(admin.user);
    await patch(app, `/api/crm/service/${service.id}`, {
      workspaceId: admin.workspace.id,
      archived: true,
    });
    const listed = await app.request(
      `/api/crm/service?workspaceId=${admin.workspace.id}`,
    );
    expect(await listed.json()).toEqual([]);
  });

  it("prices a deal from its line items and keeps what was sold", async () => {
    const member = await seedCrmWorkspace();
    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    await post(app, "/api/crm/pipeline", {
      workspaceId: member.workspace.id,
      name: "Vendas",
    });
    const service = (await (
      await post(app, "/api/crm/service", {
        workspaceId: member.workspace.id,
        name: "Gestão de tráfego",
        defaultPriceCents: 250_000,
        billingType: "monthly",
      })
    ).json()) as { id: string };

    const deal = (await (
      await post(app, "/api/crm/deal", {
        workspaceId: member.workspace.id,
        title: "Padaria do Zé",
      })
    ).json()) as { id: string };

    const saved = await put(app, `/api/crm/deal/${deal.id}/service`, {
      workspaceId: member.workspace.id,
      items: [
        // Do catálogo, sem preço: herda o de tabela e o tipo de cobrança.
        { serviceId: service.id, quantity: 1 },
        // Fora do catálogo, com desconto.
        {
          name: "Sessão de fotos",
          quantity: 2,
          unitPriceCents: 60_000,
          discountPercent: 10,
        },
      ],
    });
    expect(saved.status).toBe(200);
    const result = (await saved.json()) as {
      valueCents: number;
      services: Array<{
        name: string;
        billingType: string;
        unitPriceCents: number;
        totalCents: number;
      }>;
    };
    expect(result.services.map((line) => line.totalCents)).toEqual([
      250_000, 108_000,
    ]);
    expect(result.services[0]?.billingType).toBe("monthly");
    expect(result.services[1]?.billingType).toBe("one_time");
    expect(result.valueCents).toBe(358_000);

    // O preço de tabela sobe e o serviço é renomeado depois da venda.
    await patch(app, `/api/crm/service/${service.id}`, {
      workspaceId: member.workspace.id,
      name: "Tráfego pago",
      defaultPriceCents: 400_000,
    });

    const detail = (await (
      await app.request(
        `/api/crm/deal/${deal.id}?workspaceId=${member.workspace.id}`,
      )
    ).json()) as {
      valueCents: number;
      services: Array<{ name: string; unitPriceCents: number }>;
    };
    // Relatório que muda sozinho quando alguém edita o catálogo é relatório
    // em que ninguém confia.
    expect(detail.services[0]?.name).toBe("Gestão de tráfego");
    expect(detail.services[0]?.unitPriceCents).toBe(250_000);
    expect(detail.valueCents).toBe(358_000);
  });

  it("only lets a hand-typed value win over the items once it is locked", async () => {
    const member = await seedCrmWorkspace();
    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    await post(app, "/api/crm/pipeline", {
      workspaceId: member.workspace.id,
      name: "Vendas",
    });
    const deal = (await (
      await post(app, "/api/crm/deal", {
        workspaceId: member.workspace.id,
        title: "Topo de funil",
        valueCents: 500_000,
      })
    ).json()) as { id: string };

    // Um PUT vazio num negócio que nunca teve item não zera o valor digitado.
    const empty = await put(app, `/api/crm/deal/${deal.id}/service`, {
      workspaceId: member.workspace.id,
      items: [],
    });
    expect(((await empty.json()) as { valueCents: number }).valueCents).toBe(
      500_000,
    );

    await put(app, `/api/crm/deal/${deal.id}/service`, {
      workspaceId: member.workspace.id,
      items: [{ name: "Site", quantity: 1, unitPriceCents: 1_200_000 }],
    });

    const typed = await patch(app, `/api/crm/deal/${deal.id}`, {
      workspaceId: member.workspace.id,
      valueCents: 1_000_000,
    });
    expect(typed.status).toBe(409);

    const locked = await patch(app, `/api/crm/deal/${deal.id}`, {
      workspaceId: member.workspace.id,
      valueIsManual: true,
      valueCents: 1_000_000,
    });
    expect(locked.status).toBe(200);

    // Travado: os itens mudam, o valor não.
    const whileLocked = await put(app, `/api/crm/deal/${deal.id}/service`, {
      workspaceId: member.workspace.id,
      items: [{ name: "Site", quantity: 1, unitPriceCents: 1_500_000 }],
    });
    expect(
      ((await whileLocked.json()) as { valueCents: number }).valueCents,
    ).toBe(1_000_000);

    // Destravar devolve o valor aos itens.
    const unlocked = await patch(app, `/api/crm/deal/${deal.id}`, {
      workspaceId: member.workspace.id,
      valueIsManual: false,
    });
    expect(((await unlocked.json()) as { valueCents: number }).valueCents).toBe(
      1_500_000,
    );

    // Tirar o último item de um negócio calculado leva o valor a zero.
    const cleared = await put(app, `/api/crm/deal/${deal.id}/service`, {
      workspaceId: member.workspace.id,
      items: [],
    });
    expect(((await cleared.json()) as { valueCents: number }).valueCents).toBe(
      0,
    );
  });

  it("refuses a catalog service from another workspace on a deal", async () => {
    const member = await seedCrmWorkspace();
    const other = await seedCrmWorkspace();
    const { app } = createApp();

    mockAuthenticatedSession(other.user);
    const foreign = (await (
      await post(app, "/api/crm/service", {
        workspaceId: other.workspace.id,
        name: "Serviço alheio",
        defaultPriceCents: 100,
      })
    ).json()) as { id: string };

    mockAuthenticatedSession(member.user);
    await post(app, "/api/crm/pipeline", {
      workspaceId: member.workspace.id,
      name: "Vendas",
    });
    const deal = (await (
      await post(app, "/api/crm/deal", {
        workspaceId: member.workspace.id,
        title: "Negócio",
      })
    ).json()) as { id: string };

    const response = await put(app, `/api/crm/deal/${deal.id}/service`, {
      workspaceId: member.workspace.id,
      items: [{ serviceId: foreign.id, quantity: 1 }],
    });
    expect(response.status).toBe(404);
  });
  /** Funil, cliente e um negócio ganho com um item mensal, um anual e um
   * pontual — o ponto de partida de todo teste de contrato. */
  async function seedWonDeal(app: App, workspaceId: string) {
    await post(app, "/api/crm/pipeline", { workspaceId, name: "Vendas" });

    const company = (await (
      await post(app, "/api/crm/company", {
        workspaceId,
        name: "Padaria do Zé",
        primaryContact: { firstName: "José" },
      })
    ).json()) as { id: string };

    const deal = (await (
      await post(app, "/api/crm/deal", {
        workspaceId,
        title: "Tráfego + site",
        companyId: company.id,
      })
    ).json()) as { id: string };

    await put(app, `/api/crm/deal/${deal.id}/service`, {
      workspaceId,
      items: [
        {
          name: "Gestão de tráfego",
          billingType: "monthly",
          quantity: 1,
          unitPriceCents: 250_000,
        },
        {
          name: "Hospedagem",
          billingType: "yearly",
          quantity: 1,
          unitPriceCents: 120_000,
        },
        {
          name: "Site institucional",
          billingType: "one_time",
          quantity: 1,
          unitPriceCents: 800_000,
        },
      ],
    });

    const pipelines = (await (
      await app.request(`/api/crm/pipeline?workspaceId=${workspaceId}`)
    ).json()) as Array<{ stages: Array<{ id: string; outcome: string }> }>;
    const wonStage = pipelines[0]?.stages.find(
      (stage) => stage.outcome === "won",
    );

    await patch(app, `/api/crm/deal/${deal.id}/stage`, {
      workspaceId,
      stageId: wonStage?.id,
    });

    return { companyId: company.id, dealId: deal.id };
  }

  async function companyStatus(companyId: string) {
    const [row] = await db
      .select({
        status: schema.crmCompanyTable.status,
        clientSince: schema.crmCompanyTable.clientSince,
        churnReason: schema.crmCompanyTable.churnReason,
      })
      .from(schema.crmCompanyTable)
      .where(eq(schema.crmCompanyTable.id, companyId));
    return row;
  }

  it("turns a won deal's recurring items into a contract", async () => {
    const member = await seedCrmWorkspace();
    mockAuthenticatedSession(member.user);
    const { app } = createApp();
    const workspaceId = member.workspace.id;

    const { companyId, dealId } = await seedWonDeal(app, workspaceId);

    // Ganhar fez do prospect um cliente ativo (plano 009).
    const afterWin = await companyStatus(companyId);
    expect(afterWin?.status).toBe("active");
    expect(afterWin?.clientSince).not.toBeNull();

    const response = await post(app, `/api/crm/deal/${dealId}/contract`, {
      workspaceId,
    });
    expect(response.status).toBe(200);
    const contract = (await response.json()) as {
      id: string;
      number: number;
      monthlyValueCents: number;
      status: string;
    };
    // R$ 2.500 mensal + R$ 1.200 anual ÷ 12; o site pontual fica de fora.
    expect(contract.monthlyValueCents).toBe(260_000);
    expect(contract.number).toBe(1);
    expect(contract.status).toBe("active");

    const detail = (await (
      await app.request(
        `/api/crm/contract/${contract.id}?workspaceId=${workspaceId}`,
      )
    ).json()) as {
      services: Array<{ name: string }>;
      events: Array<{
        type: string;
        fromMonthlyValueCents: number;
        toMonthlyValueCents: number;
      }>;
    };
    expect(detail.services.map((line) => line.name)).toEqual([
      "Gestão de tráfego",
      "Hospedagem",
    ]);
    expect(detail.events).toHaveLength(1);
    expect(detail.events[0]).toMatchObject({
      type: "created",
      fromMonthlyValueCents: 0,
      toMonthlyValueCents: 260_000,
    });

    const again = await post(app, `/api/crm/deal/${dealId}/contract`, {
      workspaceId,
    });
    expect(again.status).toBe(409);

    // A ficha do negócio aponta para o contrato que ele originou.
    const deal = (await (
      await app.request(`/api/crm/deal/${dealId}?workspaceId=${workspaceId}`)
    ).json()) as { contract: { number: number } | null };
    expect(deal.contract?.number).toBe(1);
  });

  it("writes every value and status change into an MRR history", async () => {
    const member = await seedCrmWorkspace();
    mockAuthenticatedSession(member.user);
    const { app } = createApp();
    const workspaceId = member.workspace.id;
    const { companyId } = await seedWonDeal(app, workspaceId);

    const contract = (await (
      await post(app, "/api/crm/contract", {
        workspaceId,
        companyId,
        title: "Retainer",
        startsAt: "2026-01-01T12:00:00.000Z",
        monthlyValueCents: 300_000,
      })
    ).json()) as { id: string };

    const call = (action: string, body: Record<string, unknown> = {}) =>
      post(app, `/api/crm/contract/${contract.id}/${action}`, {
        workspaceId,
        ...body,
      });

    expect(
      (await call("pause", { occurredAt: "2026-03-01T12:00:00.000Z" })).status,
    ).toBe(200);
    // Reajuste com o contrato pausado: o valor muda, o MRR efetivo não.
    expect(
      (
        await call("value", {
          monthlyValueCents: 450_000,
          occurredAt: "2026-04-01T12:00:00.000Z",
        })
      ).status,
    ).toBe(200);
    expect(
      (await call("resume", { occurredAt: "2026-05-01T12:00:00.000Z" })).status,
    ).toBe(200);

    // Retroativo para antes da última mudança embaralharia o histórico.
    const backdated = await call("cancel", {
      occurredAt: "2026-02-01T12:00:00.000Z",
    });
    expect(backdated.status).toBe(400);

    const reasons = await db
      .insert(schema.crmLostReasonTable)
      .values({ workspaceId, name: "Reduziu investimento" })
      .returning();

    expect(
      (
        await call("cancel", {
          occurredAt: "2026-08-31T12:00:00.000Z",
          cancelReasonId: reasons[0]?.id,
        })
      ).status,
    ).toBe(200);
    expect((await call("cancel")).status).toBe(409);

    const detail = (await (
      await app.request(
        `/api/crm/contract/${contract.id}?workspaceId=${workspaceId}`,
      )
    ).json()) as {
      events: Array<{
        type: string;
        fromMonthlyValueCents: number;
        toMonthlyValueCents: number;
      }>;
    };
    const history = [...detail.events]
      .reverse()
      .map(
        (event) =>
          `${event.type}:${event.fromMonthlyValueCents}->${event.toMonthlyValueCents}`,
      );
    expect(history).toEqual([
      "created:0->300000",
      "paused:300000->0",
      "upgraded:0->0",
      "resumed:0->450000",
      "cancelled:450000->0",
    ]);

    // Era o único contrato ativo: o cliente virou churn, com o motivo.
    const company = await companyStatus(companyId);
    expect(company?.status).toBe("churned");
    expect(company?.churnReason).toBe("Reduziu investimento");
  });

  it("leaves the client inactive, not churned, when a fixed term simply ends", async () => {
    const member = await seedCrmWorkspace();
    mockAuthenticatedSession(member.user);
    const { app } = createApp();
    const workspaceId = member.workspace.id;
    const { companyId } = await seedWonDeal(app, workspaceId);

    const create = (title: string) =>
      post(app, "/api/crm/contract", {
        workspaceId,
        companyId,
        title,
        startsAt: "2026-01-01T12:00:00.000Z",
        monthlyValueCents: 100_000,
      }).then((response) => response.json() as Promise<{ id: string }>);

    const first = await create("Campanha de verão");
    const second = await create("Gestão de redes");

    await post(app, `/api/crm/contract/${first.id}/finish`, { workspaceId });
    // Ainda há outro contrato ativo: o cliente segue ativo.
    expect((await companyStatus(companyId))?.status).toBe("active");

    await post(app, `/api/crm/contract/${second.id}/finish`, { workspaceId });
    expect((await companyStatus(companyId))?.status).toBe("inactive");

    // O contrato protege o histórico de receita: o cliente não pode ser apagado.
    const removal = await app.request(
      `/api/crm/company/${companyId}?workspaceId=${workspaceId}`,
      { method: "DELETE" },
    );
    expect(removal.status).toBe(409);
  });

  it("refuses contracts that would not be recurring revenue", async () => {
    const member = await seedCrmWorkspace();
    mockAuthenticatedSession(member.user);
    const { app } = createApp();
    const workspaceId = member.workspace.id;
    const { companyId } = await seedWonDeal(app, workspaceId);

    const oneTime = await post(app, "/api/crm/contract", {
      workspaceId,
      companyId,
      title: "Site",
      startsAt: "2026-01-01T12:00:00.000Z",
      services: [
        {
          name: "Site",
          billingType: "one_time",
          quantity: 1,
          unitPriceCents: 800_000,
        },
      ],
    });
    expect(oneTime.status).toBe(400);

    const noValue = await post(app, "/api/crm/contract", {
      workspaceId,
      companyId,
      title: "Sem valor",
      startsAt: "2026-01-01T12:00:00.000Z",
    });
    expect(noValue.status).toBe(400);

    // Negócio aberto ainda não vendeu nada.
    const open = (await (
      await post(app, "/api/crm/deal", {
        workspaceId,
        title: "Ainda negociando",
        companyId,
      })
    ).json()) as { id: string };
    const early = await post(app, `/api/crm/deal/${open.id}/contract`, {
      workspaceId,
    });
    expect(early.status).toBe(400);
  });

  it("sums the active MRR in the contract list", async () => {
    const member = await seedCrmWorkspace();
    mockAuthenticatedSession(member.user);
    const { app } = createApp();
    const workspaceId = member.workspace.id;
    const { companyId } = await seedWonDeal(app, workspaceId);

    const create = (monthlyValueCents: number) =>
      post(app, "/api/crm/contract", {
        workspaceId,
        companyId,
        title: `Contrato ${monthlyValueCents}`,
        startsAt: "2026-01-01T12:00:00.000Z",
        monthlyValueCents,
      }).then((response) => response.json() as Promise<{ id: string }>);

    await create(100_000);
    await create(250_000);
    const paused = await create(400_000);
    await post(app, `/api/crm/contract/${paused.id}/pause`, { workspaceId });

    const list = (await (
      await app.request(
        `/api/crm/contract?workspaceId=${workspaceId}&status=paused`,
      )
    ).json()) as {
      summary: {
        activeMrrCents: number;
        counts: Record<string, number>;
      };
      items: Array<{ id: string }>;
    };

    // A lista respeita o filtro; o resumo mostra a carteira inteira.
    expect(list.items.map((item) => item.id)).toEqual([paused.id]);
    expect(list.summary.activeMrrCents).toBe(350_000);
    expect(list.summary.counts).toEqual({
      active: 2,
      paused: 1,
      cancelled: 0,
      finished: 0,
    });
  });
  it("reports revenue by service, apart from what is recurring", async () => {
    const member = await seedCrmWorkspace();
    mockAuthenticatedSession(member.user);
    const { app } = createApp();
    const workspaceId = member.workspace.id;
    await seedWonDeal(app, workspaceId);

    const report = (await (
      await app.request(
        `/api/crm/report/revenue-by-service?workspaceId=${workspaceId}`,
      )
    ).json()) as Array<{
      name: string;
      billingType: string;
      oneTimeCents: number;
      recurringCents: number;
      recurringMonthlyCents: number;
      deals: number;
    }>;

    const site = report.find((row) => row.name === "Site institucional");
    const hosting = report.find((row) => row.name === "Hospedagem");
    expect(site).toMatchObject({
      billingType: "one_time",
      oneTimeCents: 800_000,
      recurringCents: 0,
      deals: 1,
    });
    // Anual de R$ 1.200 é R$ 100 por mês; o valor cheio segue à parte.
    expect(hosting).toMatchObject({
      recurringCents: 120_000,
      recurringMonthlyCents: 10_000,
      oneTimeCents: 0,
    });

    const csv = await app.request(
      `/api/crm/report/export?workspaceId=${workspaceId}&report=revenue-by-service`,
    );
    expect(csv.headers.get("content-type")).toContain("text/csv");
    const text = await csv.text();
    expect(text).toContain("servico;categoria");
    expect(text).toContain("Hospedagem");
  });

  it("decomposes the monthly MRR movement from the contract history", async () => {
    const member = await seedCrmWorkspace();
    mockAuthenticatedSession(member.user);
    const { app } = createApp();
    const workspaceId = member.workspace.id;
    const { companyId } = await seedWonDeal(app, workspaceId);

    const contract = (await (
      await post(app, "/api/crm/contract", {
        workspaceId,
        companyId,
        title: "Retainer",
        startsAt: "2026-01-10T12:00:00.000Z",
        monthlyValueCents: 300_000,
      })
    ).json()) as { id: string };

    const second = (await (
      await post(app, "/api/crm/contract", {
        workspaceId,
        companyId,
        title: "Social",
        startsAt: "2026-02-01T12:00:00.000Z",
        monthlyValueCents: 100_000,
      })
    ).json()) as { id: string };

    await post(app, `/api/crm/contract/${contract.id}/value`, {
      workspaceId,
      monthlyValueCents: 450_000,
      occurredAt: "2026-03-05T12:00:00.000Z",
    });
    await post(app, `/api/crm/contract/${second.id}/cancel`, {
      workspaceId,
      occurredAt: "2026-04-20T12:00:00.000Z",
    });

    const report = (await (
      await app.request(`/api/crm/report/mrr?workspaceId=${workspaceId}`)
    ).json()) as {
      currentMrrCents: number;
      months: Array<{
        month: string;
        newCents: number;
        expansionCents: number;
        churnCents: number;
        netCents: number;
        closingCents: number;
        churnRate: number | null;
      }>;
    };

    const byMonth = new Map(report.months.map((month) => [month.month, month]));
    expect(byMonth.get("2026-01")).toMatchObject({
      newCents: 300_000,
      closingCents: 300_000,
    });
    expect(byMonth.get("2026-02")).toMatchObject({
      newCents: 100_000,
      closingCents: 400_000,
    });
    expect(byMonth.get("2026-03")).toMatchObject({
      expansionCents: 150_000,
      closingCents: 550_000,
    });
    const april = byMonth.get("2026-04");
    expect(april?.churnCents).toBe(-100_000);
    expect(april?.closingCents).toBe(450_000);
    // R$ 100 mil de churn sobre R$ 550 mil de abertura.
    expect(april?.churnRate).toBe(18.2);
    expect(report.currentMrrCents).toBe(450_000);
  });

  it("counts clients and revenue by source, not just deals", async () => {
    const member = await seedCrmWorkspace();
    mockAuthenticatedSession(member.user);
    const { app } = createApp();
    const workspaceId = member.workspace.id;

    await seedCrmDefaults(workspaceId);
    const [source] = await db
      .select()
      .from(schema.crmSourceTable)
      .where(eq(schema.crmSourceTable.name, "Meta Ads"));

    await post(app, "/api/crm/pipeline", { workspaceId, name: "Vendas" });
    const company = (await (
      await post(app, "/api/crm/company", {
        workspaceId,
        name: "Studio Ana",
        sourceId: source?.id,
        primaryContact: { firstName: "Ana" },
      })
    ).json()) as { id: string };

    await post(app, "/api/crm/deal", {
      workspaceId,
      title: "Perdido",
      companyId: company.id,
      sourceId: source?.id,
    });
    const won = (await (
      await post(app, "/api/crm/deal", {
        workspaceId,
        title: "Ganho",
        companyId: company.id,
        sourceId: source?.id,
        valueCents: 500_000,
      })
    ).json()) as { id: string };

    const pipelines = (await (
      await app.request(`/api/crm/pipeline?workspaceId=${workspaceId}`)
    ).json()) as Array<{ stages: Array<{ id: string; outcome: string }> }>;
    await patch(app, `/api/crm/deal/${won.id}/stage`, {
      workspaceId,
      stageId: pipelines[0]?.stages.find((stage) => stage.outcome === "won")
        ?.id,
    });

    await post(app, "/api/crm/contract", {
      workspaceId,
      companyId: company.id,
      title: "Tráfego",
      startsAt: "2026-01-01T12:00:00.000Z",
      monthlyValueCents: 250_000,
    });

    const report = (await (
      await app.request(
        `/api/crm/report/acquisition?workspaceId=${workspaceId}`,
      )
    ).json()) as {
      bySource: Array<{
        source: string | null;
        companies: number;
        deals: number;
        wonDeals: number;
        conversionRate: number | null;
        wonValueCents: number;
        mrrCents: number;
      }>;
      byChannel: Array<{ channel: string; mrrCents: number }>;
    };

    const meta = report.bySource.find((row) => row.source === "Meta Ads");
    expect(meta).toMatchObject({
      companies: 1,
      deals: 2,
      wonDeals: 1,
      conversionRate: 50,
      wonValueCents: 500_000,
      mrrCents: 250_000,
    });
    expect(
      report.byChannel.find((row) => row.channel === "paid")?.mrrCents,
    ).toBe(250_000);
  });

  it("shows how concentrated the recurring revenue is", async () => {
    const member = await seedCrmWorkspace();
    mockAuthenticatedSession(member.user);
    const { app } = createApp();
    const workspaceId = member.workspace.id;
    const { companyId } = await seedWonDeal(app, workspaceId);

    await post(app, "/api/crm/contract", {
      workspaceId,
      companyId,
      title: "Retainer",
      startsAt: "2026-01-01T12:00:00.000Z",
      monthlyValueCents: 900_000,
    });

    const report = (await (
      await app.request(`/api/crm/report/portfolio?workspaceId=${workspaceId}`)
    ).json()) as {
      byStatus: Array<{
        key: string | null;
        companies: number;
        mrrCents: number;
      }>;
      concentration: {
        totalMrrCents: number;
        topFiveShare: number | null;
        topClients: Array<{ company: string }>;
      };
    };

    expect(report.byStatus.find((row) => row.key === "active")).toMatchObject({
      companies: 1,
      mrrCents: 900_000,
    });
    // Um cliente só: toda a receita recorrente está nele.
    expect(report.concentration.topFiveShare).toBe(100);
    expect(report.concentration.topClients[0]?.company).toBe("Padaria do Zé");
  });

  it("leaves a cohort milestone empty until it has actually arrived", async () => {
    const member = await seedCrmWorkspace();
    mockAuthenticatedSession(member.user);
    const { app } = createApp();
    const workspaceId = member.workspace.id;
    const { companyId } = await seedWonDeal(app, workspaceId);

    // Cliente desde dois meses atrás, com contrato aberto até hoje.
    const twoMonthsAgo = new Date();
    twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);
    await db
      .update(schema.crmCompanyTable)
      .set({ clientSince: twoMonthsAgo })
      .where(eq(schema.crmCompanyTable.id, companyId));

    await post(app, "/api/crm/contract", {
      workspaceId,
      companyId,
      title: "Retainer",
      startsAt: twoMonthsAgo.toISOString(),
      monthlyValueCents: 200_000,
    });

    const report = (await (
      await app.request(`/api/crm/report/cohorts?workspaceId=${workspaceId}`)
    ).json()) as Array<{
      companies: number;
      milestones: Array<{ month: number; retained: number | null }>;
    }>;

    expect(report).toHaveLength(1);
    const milestones = new Map(
      report[0]?.milestones.map((milestone) => [milestone.month, milestone]),
    );
    expect(milestones.get(1)?.retained).toBe(1);
    // Três meses ainda não chegaram: vazio, não zero.
    expect(milestones.get(3)?.retained).toBeNull();
    expect(milestones.get(12)?.retained).toBeNull();
  });
  it("imports a spreadsheet of clients, creating the lists it mentions", async () => {
    const member = await seedCrmWorkspace();
    mockAuthenticatedSession(member.user);
    const { app } = createApp();
    const workspaceId = member.workspace.id;
    await seedCrmDefaults(workspaceId);

    const rows = [
      {
        name: "Padaria do Zé",
        taxId: "11.222.333/0001-81",
        segment: "Alimentação",
        source: "Meta Ads",
        status: "Cliente",
        state: "sp",
        city: "São Paulo",
        clientSince: "05/08/2026",
      },
      // Documento inválido não derruba a linha: entra com aviso.
      { name: "Studio Ana", taxId: "529.982.247-24", segment: "alimentação" },
      { name: "", taxId: "" },
    ];

    const preview = (await (
      await post(app, "/api/crm/import/preview", {
        workspaceId,
        entity: "company",
        rows,
      })
    ).json()) as {
      rows: Array<{ line: number; status: string; warnings?: string[] }>;
    };

    expect(preview.rows.map((row) => row.status)).toEqual([
      "created",
      "created",
      "error",
    ]);
    expect(preview.rows[1]?.warnings?.[0]).toContain("inválido");

    // Pré-visualização não escreve nada.
    const before = await db
      .select()
      .from(schema.crmCompanyTable)
      .where(eq(schema.crmCompanyTable.workspaceId, workspaceId));
    expect(before).toHaveLength(0);

    const run = (await (
      await post(app, "/api/crm/import", {
        workspaceId,
        entity: "company",
        rows,
      })
    ).json()) as { rows: Array<{ status: string }> };
    expect(run.rows.map((row) => row.status)).toEqual([
      "created",
      "created",
      "error",
    ]);

    const companies = await db
      .select()
      .from(schema.crmCompanyTable)
      .where(eq(schema.crmCompanyTable.workspaceId, workspaceId));
    expect(companies).toHaveLength(2);

    const padaria = companies.find((row) => row.name === "Padaria do Zé");
    expect(padaria?.taxId).toBe("11222333000181");
    expect(padaria?.status).toBe("active");
    expect(padaria?.state).toBe("SP");
    expect(padaria?.clientSince).not.toBeNull();

    // "Alimentação" e "alimentação" viram um segmento só, criado na hora.
    const segments = await db
      .select()
      .from(schema.crmSegmentTable)
      .where(eq(schema.crmSegmentTable.workspaceId, workspaceId));
    expect(segments).toHaveLength(1);
    expect(padaria?.segmentId).toBe(segments[0]?.id);

    // A origem já existia: a importação usa, não duplica.
    const sources = await db
      .select()
      .from(schema.crmSourceTable)
      .where(eq(schema.crmSourceTable.workspaceId, workspaceId));
    expect(sources).toHaveLength(7);
    expect(padaria?.sourceId).toBe(
      sources.find((row) => row.name === "Meta Ads")?.id,
    );
  });

  it("decides what to do with a client already in the base", async () => {
    const member = await seedCrmWorkspace();
    mockAuthenticatedSession(member.user);
    const { app } = createApp();
    const workspaceId = member.workspace.id;

    const row = {
      name: "Padaria do Zé",
      taxId: "11222333000181",
      city: "Santos",
    };
    await post(app, "/api/crm/import", {
      workspaceId,
      entity: "company",
      rows: [row],
    });

    const skipped = (await (
      await post(app, "/api/crm/import", {
        workspaceId,
        entity: "company",
        policy: "skip",
        rows: [{ ...row, city: "Campinas" }],
      })
    ).json()) as { rows: Array<{ status: string }> };
    expect(skipped.rows[0]?.status).toBe("skipped");

    const updated = (await (
      await post(app, "/api/crm/import", {
        workspaceId,
        entity: "company",
        policy: "update",
        rows: [{ ...row, city: "Campinas" }],
      })
    ).json()) as { rows: Array<{ status: string }> };
    expect(updated.rows[0]?.status).toBe("updated");

    const companies = await db
      .select()
      .from(schema.crmCompanyTable)
      .where(eq(schema.crmCompanyTable.workspaceId, workspaceId));
    expect(companies).toHaveLength(1);
    expect(companies[0]?.city).toBe("Campinas");
  });

  it("links imported people and deals to the client they mention", async () => {
    const member = await seedCrmWorkspace();
    mockAuthenticatedSession(member.user);
    const { app } = createApp();
    const workspaceId = member.workspace.id;
    await seedCrmDefaults(workspaceId);

    await post(app, "/api/crm/import", {
      workspaceId,
      entity: "company",
      rows: [{ name: "Padaria do Zé" }],
    });

    const contacts = (await (
      await post(app, "/api/crm/import", {
        workspaceId,
        entity: "contact",
        rows: [
          {
            firstName: "José",
            email: "Jose@Padaria.test",
            company: "padaria do zé",
          },
          { firstName: "Ana", email: "ana@studio.test", company: "Studio Ana" },
        ],
      })
    ).json()) as {
      rows: Array<{ status: string; warnings?: string[] }>;
    };

    expect(contacts.rows[0]?.status).toBe("created");
    // Empresa que não existe não derruba a linha: o contato entra sem vínculo.
    expect(contacts.rows[1]?.warnings?.[0]).toContain("não encontrada");

    const people = await db
      .select()
      .from(schema.crmContactTable)
      .where(eq(schema.crmContactTable.workspaceId, workspaceId));
    const jose = people.find((row) => row.firstName === "José");
    expect(jose?.email).toBe("jose@padaria.test");
    expect(jose?.companyId).not.toBeNull();
    expect(people.find((row) => row.firstName === "Ana")?.companyId).toBeNull();

    const deals = (await (
      await post(app, "/api/crm/import", {
        workspaceId,
        entity: "deal",
        rows: [
          {
            title: "Site institucional",
            company: "Padaria do Zé",
            value: "R$ 8.000,00",
            stage: "Proposta",
            source: "Indicação",
          },
          { title: "Etapa que não existe", stage: "Enviado" },
        ],
      })
    ).json()) as { rows: Array<{ status: string; warnings?: string[] }> };

    expect(deals.rows[0]?.status).toBe("created");
    expect(deals.rows[1]?.warnings?.[0]).toContain("não existe no funil");

    const saved = await db
      .select()
      .from(schema.crmDealTable)
      .where(eq(schema.crmDealTable.workspaceId, workspaceId));
    const site = saved.find((row) => row.title === "Site institucional");
    expect(site?.valueCents).toBe(800_000);
    expect(site?.companyId).not.toBeNull();
    expect(saved.map((row) => row.number).sort()).toEqual([1, 2]);
  });

  it("lists companies with their primary contact and finds them by contact", async () => {
    const member = await seedCrmWorkspace();
    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const created = await post(app, "/api/crm/company", {
      workspaceId: member.workspace.id,
      name: "Padaria do Ze",
      primaryContact: {
        firstName: "Marcia",
        lastName: "Oliveira",
        email: "marcia@padaria.example",
        phone: "15999990000",
      },
    });
    const company = (await created.json()) as { id: string };
    await post(app, "/api/crm/contact", {
      workspaceId: member.workspace.id,
      companyId: company.id,
      firstName: "Carlos",
    });
    await post(app, "/api/crm/company", {
      workspaceId: member.workspace.id,
      name: "Outra Empresa",
      primaryContact: { firstName: "Paulo" },
    });

    type Listed = {
      total: number;
      items: {
        id: string;
        contactCount: number;
        primaryContact: { name: string; phone: string | null } | null;
      }[];
    };
    const list = async (search: string) =>
      (await (
        await app.request(
          `/api/crm/company?workspaceId=${member.workspace.id}&search=${encodeURIComponent(search)}`,
        )
      ).json()) as Listed;

    // Pelo nome de um contato, pelo e-mail e pelo celular.
    for (const term of ["Marcia Oliveira", "marcia@padaria", "15999990000"]) {
      const found = await list(term);
      expect(found.total).toBe(1);
      expect(found.items[0]?.id).toBe(company.id);
    }

    const found = await list("Padaria");
    const row = found.items[0];
    expect(row?.contactCount).toBe(2);
    expect(row?.primaryContact?.name).toBe("Marcia Oliveira");
    expect(row?.primaryContact?.phone).toBe("15999990000");

    expect((await list("inexistente-xyz")).total).toBe(0);
  });

  it("creates a sale directly and lists it, generating a contract only for recurring items", async () => {
    const member = await seedCrmWorkspace();
    mockAuthenticatedSession(member.user);
    const { app } = createApp();
    const workspaceId = member.workspace.id;
    await post(app, "/api/crm/pipeline", { workspaceId, name: "Vendas" });

    const company = (await (
      await post(app, "/api/crm/company", {
        workspaceId,
        name: "Padaria do Ze",
        primaryContact: { firstName: "Jose" },
      })
    ).json()) as { id: string };

    // Sem empresa e sem serviço não há venda.
    expect(
      (
        await post(app, "/api/crm/sale", {
          workspaceId,
          soldAt: "2026-10-05T12:00:00.000Z",
          items: [
            {
              name: "Site",
              billingType: "one_time",
              quantity: 1,
              unitPriceCents: 500_000,
            },
          ],
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await post(app, "/api/crm/sale", {
          workspaceId,
          companyId: company.id,
          soldAt: "2026-10-05T12:00:00.000Z",
          items: [],
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await post(app, "/api/crm/sale", {
          workspaceId,
          companyId: company.id,
          soldAt: "2026-10-05T12:00:00.000Z",
          paymentForm: "custom",
          items: [
            {
              name: "Site",
              billingType: "one_time",
              quantity: 1,
              unitPriceCents: 500_000,
            },
          ],
        })
      ).status,
    ).toBe(400);

    // Pagamento único: vira venda, sem contrato.
    const oneTime = await post(app, "/api/crm/sale", {
      workspaceId,
      companyId: company.id,
      soldAt: "2026-10-05T12:00:00.000Z",
      notes: "Domínio padariadoze.com.br",
      paymentForm: "custom",
      paymentFormNote: "50% hoje e 50% na entrega",
      items: [
        {
          name: "Site",
          billingType: "one_time",
          quantity: 1,
          unitPriceCents: 500_000,
          notes: "WordPress",
        },
      ],
    });
    expect(oneTime.status).toBe(200);
    const oneTimeBody = (await oneTime.json()) as {
      dealId: string;
      contractId: string | null;
    };
    expect(oneTimeBody.contractId).toBeNull();

    // Item recorrente: o contrato nasce na data da venda.
    const mixed = await post(app, "/api/crm/sale", {
      workspaceId,
      companyId: company.id,
      soldAt: "2026-10-20T12:00:00.000Z",
      paymentForm: "pix",
      items: [
        {
          name: "Site",
          billingType: "one_time",
          quantity: 1,
          unitPriceCents: 300_000,
        },
        {
          name: "Tráfego pago",
          billingType: "monthly",
          quantity: 1,
          unitPriceCents: 150_000,
        },
      ],
    });
    expect(mixed.status).toBe(200);
    const mixedBody = (await mixed.json()) as {
      dealId: string;
      contractId: string | null;
    };
    expect(mixedBody.contractId).not.toBeNull();

    type Sales = {
      total: number;
      items: {
        id: string;
        kind: string | null;
        valueCents: number;
        notes: string | null;
        paymentForm: string | null;
        paymentFormNote: string | null;
        services: string[];
        company: { name: string } | null;
        contract: { status: string } | null;
        soldAt: string;
      }[];
    };
    const list = (await (
      await app.request(`/api/crm/sale?workspaceId=${workspaceId}`)
    ).json()) as Sales;
    expect(list.total).toBe(2);
    // Mais recente primeiro.
    expect(list.items[0]?.id).toBe(mixedBody.dealId);
    expect(list.items[0]?.kind).toBe("mixed");
    expect(list.items[0]?.contract?.status).toBe("active");
    expect(list.items[0]?.valueCents).toBe(450_000);
    const first = list.items[1];
    expect(first?.kind).toBe("one_time");
    expect(first?.contract).toBeNull();
    expect(first?.company?.name).toBe("Padaria do Ze");
    expect(first?.notes).toBe("Domínio padariadoze.com.br");
    expect(first?.paymentForm).toBe("custom");
    expect(first?.paymentFormNote).toBe("50% hoje e 50% na entrega");
    expect(first?.services).toEqual(["Site"]);
    expect(first?.soldAt.startsWith("2026-10-05")).toBe(true);

    // Filtro de período pela data da venda.
    const october = (await (
      await app.request(
        `/api/crm/sale?workspaceId=${workspaceId}&from=${encodeURIComponent("2026-10-10T00:00:00.000Z")}`,
      )
    ).json()) as Sales;
    expect(october.total).toBe(1);

    // Um lead em aberto não é venda.
    await post(app, "/api/crm/deal", {
      workspaceId,
      title: "Lead qualquer",
      companyId: company.id,
    });
    const still = (await (
      await app.request(`/api/crm/sale?workspaceId=${workspaceId}`)
    ).json()) as Sales;
    expect(still.total).toBe(2);
  });

  it("does not let a deal without a company be won", async () => {
    const member = await seedCrmWorkspace();
    mockAuthenticatedSession(member.user);
    const { app } = createApp();
    const workspaceId = member.workspace.id;
    await post(app, "/api/crm/pipeline", { workspaceId, name: "Vendas" });

    const created = (await (
      await post(app, "/api/crm/deal", { workspaceId, title: "Sem empresa" })
    ).json()) as { id: string; pipelineId: string };
    const stages = (await (
      await app.request(`/api/crm/pipeline?workspaceId=${workspaceId}`)
    ).json()) as {
      id: string;
      stages: { id: string; outcome: string }[];
    }[];
    const won = stages
      .flatMap((pipeline) => pipeline.stages)
      .find((stage) => stage.outcome === "won");
    expect(won).toBeDefined();

    const response = await patch(app, `/api/crm/deal/${created.id}/stage`, {
      workspaceId,
      stageId: won?.id,
    });
    expect(response.status).toBe(400);
  });
});
