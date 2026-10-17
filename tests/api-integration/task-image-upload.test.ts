import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import { mockAnonymousSession, mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import {
  createProjectFixture,
  createWorkspaceMember,
} from "./helpers/fixtures";

describe("API integration: task image upload finalize", () => {
  beforeEach(async () => {
    await resetTestDatabase();

    process.env.S3_ENDPOINT = "https://storage.example.test";
    process.env.S3_BUCKET = "test-bucket";
    process.env.S3_ACCESS_KEY_ID = "test-access-key";
    process.env.S3_SECRET_ACCESS_KEY = "test-secret-key";
    delete process.env.S3_KEY_PREFIX;
    delete process.env.FILE_STORAGE_DRIVER;
    delete process.env.LOCAL_UPLOAD_DIR;
    delete process.env.LOCAL_UPLOAD_SECRET;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns a URL using KANEO_API_URL", async () => {
    process.env.KANEO_API_URL = "http://kaneo.test:1337";

    const member = await createWorkspaceMember();
    const { project, columns } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });

    const [task] = await db
      .insert(schema.taskTable)
      .values({
        projectId: project.id,
        userId: member.user.id,
        title: "URL test task",
        status: "to-do",
        columnId: columns.todo.id,
        priority: "medium",
        number: 1,
        position: 1,
      })
      .returning();

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const key = `workspace/${member.workspace.id}/project/${project.id}/task/${task.id}/descriptions/test-image.png`;

    const response = await app.request(
      `/api/task/image-upload/${task.id}/finalize`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          key,
          filename: "test-image.png",
          contentType: "image/png",
          size: 12345,
          surface: "description",
        }),
      },
    );

    expect(response.status).toBe(200);
    const payload = (await response.json()) as { id: string; url: string };
    expect(payload).toHaveProperty("id");
    expect(payload).toHaveProperty("url");
    expect(payload.url).toBe(`http://kaneo.test:1337/api/asset/${payload.id}`);
    expect(payload.url).not.toContain("localhost");
  });

  it("updates the URL when KANEO_API_URL changes", async () => {
    process.env.KANEO_API_URL = "https://proxy.kaneo.internal";

    const member = await createWorkspaceMember();
    const { project, columns } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });

    const [task] = await db
      .insert(schema.taskTable)
      .values({
        projectId: project.id,
        userId: member.user.id,
        title: "Proxy test",
        status: "to-do",
        columnId: columns.todo.id,
        priority: "medium",
        number: 1,
        position: 1,
      })
      .returning();

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const key = `workspace/${member.workspace.id}/project/${project.id}/task/${task.id}/descriptions/proxy-image.png`;

    const response = await app.request(
      `/api/task/image-upload/${task.id}/finalize`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          key,
          filename: "proxy-image.png",
          contentType: "image/png",
          size: 99999,
          surface: "description",
        }),
      },
    );

    expect(response.status).toBe(200);
    const payload = (await response.json()) as { id: string; url: string };
    expect(payload.url).toBe(
      `https://proxy.kaneo.internal/api/asset/${payload.id}`,
    );
    expect(payload.url).not.toContain("localhost");
  });

  it("falls back to deriving URL from the request when KANEO_API_URL is not set", async () => {
    delete process.env.KANEO_API_URL;

    const member = await createWorkspaceMember();
    const { project, columns } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });

    const [task] = await db
      .insert(schema.taskTable)
      .values({
        projectId: project.id,
        userId: member.user.id,
        title: "Fallback test",
        status: "to-do",
        columnId: columns.todo.id,
        priority: "medium",
        number: 1,
        position: 1,
      })
      .returning();

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const key = `workspace/${member.workspace.id}/project/${project.id}/task/${task.id}/descriptions/fallback-image.png`;

    const response = await app.request(
      `https://app.kaneo.test/api/task/image-upload/${task.id}/finalize`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          key,
          filename: "fallback-image.png",
          contentType: "image/png",
          size: 12345,
          surface: "description",
        }),
      },
    );

    expect(response.status).toBe(200);
    const payload = (await response.json()) as { id: string; url: string };
    expect(payload.url).toBe(`https://app.kaneo.test/api/asset/${payload.id}`);
    expect(payload.url).not.toContain("localhost");
  });

  it("persists a new asset record with correct metadata", async () => {
    process.env.KANEO_API_URL = "http://localhost:1337";

    const member = await createWorkspaceMember();
    const { project, columns } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });

    const [task] = await db
      .insert(schema.taskTable)
      .values({
        projectId: project.id,
        userId: member.user.id,
        title: "Persist test",
        status: "to-do",
        columnId: columns.todo.id,
        priority: "medium",
        number: 1,
        position: 1,
      })
      .returning();

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const key = `workspace/${member.workspace.id}/project/${project.id}/task/${task.id}/descriptions/persist-asset.png`;

    const response = await app.request(
      `/api/task/image-upload/${task.id}/finalize`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          key,
          filename: "persist-asset.png",
          contentType: "image/png",
          size: 45678,
          surface: "description",
        }),
      },
    );

    expect(response.status).toBe(200);
    const payload = (await response.json()) as { id: string; url: string };

    const asset = await db.query.assetTable.findFirst({
      where: (t, { eq }) => eq(t.id, payload.id),
    });

    expect(asset).toBeDefined();
    expect(asset?.id).toBe(payload.id);
    expect(asset?.objectKey).toBe(key);
    expect(asset?.filename).toBe("persist-asset.png");
    expect(asset?.mimeType).toBe("image/png");
    expect(asset?.size).toBe(45678);
    expect(asset?.kind).toBe("image");
    expect(asset?.surface).toBe("description");
    expect(asset?.workspaceId).toBe(member.workspace.id);
    expect(asset?.projectId).toBe(project.id);
    expect(asset?.taskId).toBe(task.id);
    expect(asset?.createdBy).toBe(member.user.id);
  });

  it("uploads and finalizes an asset using local filesystem storage", async () => {
    const uploadDir = await mkdtemp(path.join(tmpdir(), "nortys-upload-"));

    delete process.env.S3_ENDPOINT;
    delete process.env.S3_BUCKET;
    delete process.env.S3_ACCESS_KEY_ID;
    delete process.env.S3_SECRET_ACCESS_KEY;
    process.env.FILE_STORAGE_DRIVER = "local";
    process.env.LOCAL_UPLOAD_DIR = uploadDir;
    process.env.LOCAL_UPLOAD_SECRET =
      "local-upload-integration-secret-with-32-chars";
    process.env.KANEO_API_URL = "http://localhost:1337";

    try {
      const member = await createWorkspaceMember();
      const { project, columns } = await createProjectFixture({
        workspaceId: member.workspace.id,
      });

      const [task] = await db
        .insert(schema.taskTable)
        .values({
          projectId: project.id,
          userId: member.user.id,
          title: "Local upload test",
          status: "to-do",
          columnId: columns.todo.id,
          priority: "medium",
          number: 1,
          position: 1,
        })
        .returning();

      mockAuthenticatedSession(member.user);
      const { app } = createApp();

      const createResponse = await app.request(
        `/api/task/image-upload/${task.id}`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            filename: "local-note.txt",
            contentType: "text/plain",
            size: 5,
            surface: "description",
          }),
        },
      );

      expect(createResponse.status).toBe(200);
      const upload = (await createResponse.json()) as {
        key: string;
        uploadUrl: string;
        headers: Record<string, string>;
      };
      expect(upload.uploadUrl).toContain("/api/storage/local-upload");

      const putResponse = await app.request(upload.uploadUrl, {
        method: "PUT",
        headers: upload.headers,
        body: "hello",
      });
      expect(putResponse.status).toBe(204);

      const finalizeResponse = await app.request(
        `/api/task/image-upload/${task.id}/finalize`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            key: upload.key,
            filename: "local-note.txt",
            contentType: "text/plain",
            size: 5,
            surface: "description",
          }),
        },
      );

      expect(finalizeResponse.status).toBe(200);
      const payload = (await finalizeResponse.json()) as {
        id: string;
        url: string;
      };
      expect(payload.url).toBe(`http://localhost:1337/api/asset/${payload.id}`);

      const asset = await db.query.assetTable.findFirst({
        where: (t, { eq }) => eq(t.id, payload.id),
      });
      expect(asset?.objectKey).toBe(upload.key);
      expect(asset?.kind).toBe("attachment");
    } finally {
      await rm(uploadDir, { force: true, recursive: true });
    }
  });

  it("creates attachment records for non-image content types", async () => {
    process.env.KANEO_API_URL = "http://localhost:1337";

    const member = await createWorkspaceMember();
    const { project, columns } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });

    const [task] = await db
      .insert(schema.taskTable)
      .values({
        projectId: project.id,
        userId: member.user.id,
        title: "Attachment test",
        status: "to-do",
        columnId: columns.todo.id,
        priority: "medium",
        number: 1,
        position: 1,
      })
      .returning();

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const key = `workspace/${member.workspace.id}/project/${project.id}/task/${task.id}/descriptions/report.pdf`;

    const response = await app.request(
      `/api/task/image-upload/${task.id}/finalize`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          key,
          filename: "report.pdf",
          contentType: "application/pdf",
          size: 102400,
          surface: "description",
        }),
      },
    );

    expect(response.status).toBe(200);
    const payload = (await response.json()) as { id: string; url: string };

    const asset = await db.query.assetTable.findFirst({
      where: (t, { eq }) => eq(t.id, payload.id),
    });
    expect(asset?.kind).toBe("attachment");
  });

  it("rejects key that does not match the task context", async () => {
    process.env.KANEO_API_URL = "http://localhost:1337";

    const member = await createWorkspaceMember();
    const { project, columns } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });

    const [task] = await db
      .insert(schema.taskTable)
      .values({
        projectId: project.id,
        userId: member.user.id,
        title: "Bad key test",
        status: "to-do",
        columnId: columns.todo.id,
        priority: "medium",
        number: 1,
        position: 1,
      })
      .returning();

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const response = await app.request(
      `/api/task/image-upload/${task.id}/finalize`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          key: "totally/wrong/path/image.png",
          filename: "test.png",
          contentType: "image/png",
          size: 100,
          surface: "description",
        }),
      },
    );

    expect(response.status).toBe(400);
    const text = await response.text();
    expect(text).toBe("Image upload key does not match the task context.");
  });

  it("rejects unauthenticated requests", async () => {
    process.env.KANEO_API_URL = "http://localhost:1337";

    const member = await createWorkspaceMember();
    const { project, columns } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });

    const [task] = await db
      .insert(schema.taskTable)
      .values({
        projectId: project.id,
        userId: member.user.id,
        title: "Auth test",
        status: "to-do",
        columnId: columns.todo.id,
        priority: "medium",
        number: 1,
        position: 1,
      })
      .returning();

    mockAnonymousSession();
    const { app } = createApp();

    const response = await app.request(
      `/api/task/image-upload/${task.id}/finalize`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          key: "some/key.png",
          filename: "test.png",
          contentType: "image/png",
          size: 100,
          surface: "description",
        }),
      },
    );

    expect(response.status).toBe(401);
  });

  it("rejects requests from users outside the workspace", async () => {
    process.env.KANEO_API_URL = "http://localhost:1337";

    const member = await createWorkspaceMember();
    const outsiderId = `user-${randomUUID()}`;

    const [outsider] = await db
      .insert(schema.userTable)
      .values({
        id: outsiderId,
        email: `${outsiderId}@example.com`,
        emailVerified: true,
        name: "Outsider",
      })
      .returning();

    const { project, columns } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });

    const [task] = await db
      .insert(schema.taskTable)
      .values({
        projectId: project.id,
        userId: member.user.id,
        title: "RBAC test",
        status: "to-do",
        columnId: columns.todo.id,
        priority: "medium",
        number: 1,
        position: 1,
      })
      .returning();

    mockAuthenticatedSession(outsider);
    const { app } = createApp();

    const response = await app.request(
      `/api/task/image-upload/${task.id}/finalize`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          key: `workspace/${member.workspace.id}/project/${project.id}/task/${task.id}/descriptions/rbac-test.png`,
          filename: "rbac-test.png",
          contentType: "image/png",
          size: 100,
          surface: "description",
        }),
      },
    );

    expect(response.status).toBe(403);
    await expect(response.text()).resolves.toBe(
      "You don't have access to this workspace",
    );
  });
});
