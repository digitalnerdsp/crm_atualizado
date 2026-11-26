import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import { createWorkspaceMember } from "./helpers/fixtures";

async function seedRole(
  workspaceId: string,
  role: string,
  permission: Record<string, string[]>,
) {
  await db
    .insert(schema.workspaceRoleTable)
    .values({ workspaceId, role, permission: JSON.stringify(permission) });
}

async function storedPermission(workspaceId: string, role: string) {
  const [row] = await db
    .select({ permission: schema.workspaceRoleTable.permission })
    .from(schema.workspaceRoleTable)
    .where(
      and(
        eq(schema.workspaceRoleTable.workspaceId, workspaceId),
        eq(schema.workspaceRoleTable.role, role),
      ),
    );
  return row ? JSON.parse(row.permission) : null;
}

const put = (
  app: ReturnType<typeof createApp>["app"],
  workspaceId: string,
  role: string,
  permission: Record<string, string[]>,
) =>
  app.request(`/api/workspace/${workspaceId}/roles/${role}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ permission }),
  });

const salesWithCards = {
  project: ["read"],
  task: ["create", "read", "update"],
  crmDeal: ["create", "read", "update"],
};

describe("API integration: salvar funções do workspace", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  it("superadmin da plataforma que é só Membro no workspace consegue salvar", async () => {
    const ctx = await createWorkspaceMember({ role: "member" });
    await db
      .update(schema.userTable)
      .set({ role: "superadmin" })
      .where(eq(schema.userTable.id, ctx.user.id));
    await seedRole(ctx.workspace.id, "sales", { task: ["read"] });

    mockAuthenticatedSession({ ...ctx.user, role: "superadmin" } as never);
    const { app } = createApp();

    const response = await put(app, ctx.workspace.id, "sales", salesWithCards);
    expect(response.status).toBe(200);
    expect(await storedPermission(ctx.workspace.id, "sales")).toEqual(
      salesWithCards,
    );
  });

  it("superadmin consegue criar uma função nova, sem repetir nome nem usar nome reservado", async () => {
    const ctx = await createWorkspaceMember({ role: "member" });
    mockAuthenticatedSession({ ...ctx.user, role: "superadmin" } as never);
    const { app } = createApp();
    const create = (role: string) =>
      app.request(`/api/workspace/${ctx.workspace.id}/roles`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role, permission: { task: ["read"] } }),
      });

    expect((await create("Atendimento")).status).toBe(200);
    expect(await storedPermission(ctx.workspace.id, "atendimento")).toEqual({
      task: ["read"],
    });
    expect((await create("atendimento")).status).toBe(400);
    expect((await create("admin")).status).toBe(400);
  });

  it("proprietário do workspace consegue salvar", async () => {
    const ctx = await createWorkspaceMember({ role: "owner" });
    await seedRole(ctx.workspace.id, "sales", { task: ["read"] });
    mockAuthenticatedSession(ctx.user);
    const { app } = createApp();

    const response = await put(app, ctx.workspace.id, "sales", salesWithCards);
    expect(response.status).toBe(200);
  });

  it("membro comum não consegue alterar funções", async () => {
    const ctx = await createWorkspaceMember({ role: "member" });
    await seedRole(ctx.workspace.id, "sales", { task: ["read"] });
    mockAuthenticatedSession(ctx.user);
    const { app } = createApp();

    const response = await put(app, ctx.workspace.id, "sales", salesWithCards);
    expect([400, 403]).toContain(response.status);
    expect(await storedPermission(ctx.workspace.id, "sales")).toEqual({
      task: ["read"],
    });
  });

  it("recusa recurso ou ação que não existe", async () => {
    const ctx = await createWorkspaceMember({ role: "owner" });
    await seedRole(ctx.workspace.id, "sales", { task: ["read"] });
    mockAuthenticatedSession(ctx.user);
    const { app } = createApp();

    expect(
      (await put(app, ctx.workspace.id, "sales", { inventado: ["read"] }))
        .status,
    ).toBe(400);
    expect(
      (await put(app, ctx.workspace.id, "sales", { task: ["inventada"] }))
        .status,
    ).toBe(400);
  });
});
