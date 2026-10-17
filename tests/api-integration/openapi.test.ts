import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import { mockAnonymousSession, mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";

describe("API integration: openapi", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  async function createUser(role: string) {
    const [user] = await db
      .insert(schema.userTable)
      .values({
        id: `user-${randomUUID()}`,
        name: "OpenAPI Test User",
        email: `openapi-${randomUUID()}@example.com`,
        emailVerified: true,
        role,
      })
      .returning();

    return user;
  }

  it("requires an authenticated session", async () => {
    mockAnonymousSession();
    const { app } = createApp();

    const response = await app.request("/api/admin/openapi");

    expect(response.status).toBe(401);
  });

  it.each(["user", "operations_admin"])(
    "rejects the authenticated global role %s",
    async (role) => {
      const user = await createUser(role);
      mockAuthenticatedSession(user);
      const { app } = createApp();

      const response = await app.request("/api/admin/openapi");

      expect(response.status).toBe(403);
    },
  );

  it("does not expose the previous public OpenAPI path", async () => {
    const user = await createUser("admin");
    mockAuthenticatedSession(user);
    const { app } = createApp();

    const response = await app.request("/api/openapi");

    expect(response.status).toBe(404);
  });

  it.each(["admin", "superadmin"] as const)(
    "serves a merged OpenAPI document to %s",
    async (role) => {
      const user = await createUser(role);
      mockAuthenticatedSession(user);
      const { app } = createApp();

      const response = await app.request("/api/admin/openapi");

      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      const payload = (await response.json()) as {
        openapi: string;
        info?: { title?: string };
        paths?: Record<string, unknown>;
        components?: {
          securitySchemes?: Record<string, unknown>;
        };
      };

      expect(payload.openapi).toBe("3.0.3");
      expect(payload.info?.title).toBe("Nortys API");
      expect(payload.paths?.["/config"]).toBeTruthy();
      expect(
        Object.keys(payload.paths || {}).some((path) =>
          path.startsWith("/auth/"),
        ),
      ).toBe(true);
      expect(payload.components?.securitySchemes).toMatchObject({
        bearerAuth: expect.any(Object),
      });
    },
  );
});
