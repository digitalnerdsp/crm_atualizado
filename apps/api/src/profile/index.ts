import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { validator } from "hono-openapi";
import * as v from "valibot";
import db, { schema } from "../database";
import {
  assertUploadedObjectExists,
  assertUserAvatarKey,
  createUserAvatarUploadUrl,
  deleteS3Object,
  getPrivateObject,
} from "../storage/s3";

const profile = new Hono<{ Variables: { userId: string } }>()
  .put(
    "/avatar-upload",
    validator(
      "json",
      v.object({
        filename: v.string(),
        contentType: v.string(),
        size: v.number(),
      }),
    ),
    async (c) => {
      const input = c.req.valid("json");
      try {
        return c.json(
          await createUserAvatarUploadUrl({
            ...input,
            userId: c.get("userId"),
            apiBaseUrl: process.env.KANEO_API_URL || new URL(c.req.url).origin,
          }),
        );
      } catch (error) {
        throw new HTTPException(400, {
          message:
            error instanceof Error ? error.message : "Invalid avatar upload.",
        });
      }
    },
  )
  .post(
    "/avatar-upload/finalize",
    validator("json", v.object({ key: v.string() })),
    async (c) => {
      const userId = c.get("userId");
      const key = c.req.valid("json").key;
      if (!assertUserAvatarKey(key, userId)) {
        throw new HTTPException(400, { message: "Invalid avatar key." });
      }

      try {
        await assertUploadedObjectExists(key);
      } catch {
        throw new HTTPException(400, { message: "Avatar upload not found." });
      }

      const [current] = await db
        .select({ avatarObjectKey: schema.userTable.avatarObjectKey })
        .from(schema.userTable)
        .where(eq(schema.userTable.id, userId))
        .limit(1);
      const image = `/api/profile/avatar/${userId}?v=${Date.now()}`;

      await db
        .update(schema.userTable)
        .set({ image, avatarObjectKey: key })
        .where(eq(schema.userTable.id, userId));

      if (current?.avatarObjectKey && current.avatarObjectKey !== key) {
        void deleteS3Object(current.avatarObjectKey).catch(() => {});
      }

      return c.json({ image });
    },
  )
  .get("/avatar/:userId", async (c) => {
    const [user] = await db
      .select({ avatarObjectKey: schema.userTable.avatarObjectKey })
      .from(schema.userTable)
      .where(eq(schema.userTable.id, c.req.param("userId")))
      .limit(1);
    if (!user?.avatarObjectKey) {
      throw new HTTPException(404, { message: "Avatar not found." });
    }

    try {
      const object = await getPrivateObject(user.avatarObjectKey);
      return new Response(object.body as BodyInit, {
        headers: {
          "Cache-Control": "private, max-age=86400",
          "Content-Type": object.contentType || "application/octet-stream",
          "Content-Length": object.contentLength?.toString() || "",
          "X-Content-Type-Options": "nosniff",
        },
      });
    } catch {
      throw new HTTPException(404, { message: "Avatar object not found." });
    }
  });

export default profile;
