import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../apps/api/src/index";
import { resetTestDatabase } from "./helpers/database";

describe("API integration: authentication rate limit", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  it("limits repeated password sign-in attempts in self-hosted mode", async () => {
    const { app } = createApp();
    const request = () =>
      app.request("/api/auth/sign-in/email", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": "203.0.113.45",
        },
        body: JSON.stringify({
          email: "missing-user@example.com",
          password: "invalid-password",
        }),
      });

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await request();
      expect(response.status).not.toBe(429);
    }

    const blocked = await request();
    expect(blocked.status).toBe(429);
  });
});
