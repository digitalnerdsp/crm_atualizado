import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import { resetTestDatabase } from "./helpers/database";

const origin = "http://localhost:5173";

async function completeSetup(app: ReturnType<typeof createApp>["app"]) {
  return app.request("/api/setup", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Origin: origin,
    },
    body: JSON.stringify({
      appName: "Nortys Ops",
      appDescription: "Private operations workspace",
      adminName: "Ada Admin",
      adminEmail: "ada@example.com",
      adminPassword: "correct-horse-battery",
      workspaceName: "Operations",
      workspaceDescription: "Main workspace",
      locale: "en-US",
      timezone: "America/Sao_Paulo",
    }),
  });
}

describe("API integration: initial setup", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  it("creates the first superadmin, workspace, settings, and supports sign-in", async () => {
    const { app } = createApp();

    const response = await completeSetup(app);

    expect(response.status).toBe(201);
    const payload = (await response.json()) as {
      userId: string;
      workspaceId: string;
      appName: string;
    };
    expect(payload.appName).toBe("Nortys Ops");

    const [user] = await db
      .select()
      .from(schema.userTable)
      .where(eq(schema.userTable.id, payload.userId));
    expect(user).toMatchObject({
      email: "ada@example.com",
      emailVerified: true,
      locale: "en-US",
      role: "superadmin",
    });

    const [membership] = await db
      .select()
      .from(schema.workspaceUserTable)
      .where(eq(schema.workspaceUserTable.userId, payload.userId));
    expect(membership).toMatchObject({
      workspaceId: payload.workspaceId,
      role: "owner",
    });

    const roles = await db
      .select({ role: schema.workspaceRoleTable.role })
      .from(schema.workspaceRoleTable)
      .where(eq(schema.workspaceRoleTable.workspaceId, payload.workspaceId));
    expect(roles.map((row) => row.role).sort()).toEqual([
      "admin",
      "member",
      "sales",
      "sales_manager",
      "viewer",
    ]);

    const settings = await db
      .select({
        key: schema.systemSettingTable.key,
        value: schema.systemSettingTable.value,
      })
      .from(schema.systemSettingTable);
    expect(
      Object.fromEntries(settings.map((row) => [row.key, row.value])),
    ).toMatchObject({
      "branding.appName": "Nortys Ops",
      "branding.appDescription": "Private operations workspace",
      "instance.locale": "en-US",
      "instance.timezone": "America/Sao_Paulo",
    });

    const configResponse = await app.request("/api/config");
    expect(configResponse.status).toBe(200);
    await expect(configResponse.json()).resolves.toMatchObject({
      appName: "Nortys Ops",
      appDescription: "Private operations workspace",
    });

    const instanceStatusResponse = await app.request("/api/instance/status");
    expect(instanceStatusResponse.status).toBe(200);
    await expect(instanceStatusResponse.json()).resolves.toMatchObject({
      hasUsers: true,
      hasAdmin: true,
    });

    const signIn = await app.request("/api/auth/sign-in/email", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Origin: origin,
      },
      body: JSON.stringify({
        email: "ada@example.com",
        password: "correct-horse-battery",
      }),
    });
    expect(signIn.status).toBe(200);
  });

  it("blocks setup after a user exists", async () => {
    const { app } = createApp();

    expect((await completeSetup(app)).status).toBe(201);
    const second = await completeSetup(app);

    expect(second.status).toBe(409);
  });

  it("blocks the legacy first-user signup path before setup", async () => {
    const { app } = createApp();

    const response = await app.request("/api/auth/sign-up/email", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Origin: origin,
      },
      body: JSON.stringify({
        name: "Legacy Admin",
        email: "legacy@example.com",
        password: "correct-horse-battery",
      }),
    });

    expect(response.status).toBe(403);
  });
});
