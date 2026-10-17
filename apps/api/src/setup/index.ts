import { DEFAULT_ROLE_NAMES, defaultRolePayloads } from "@kaneo/permissions";
import { createId } from "@paralleldrive/cuid2";
import bcrypt from "bcryptjs";
import { count, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { describeRoute, resolver, validator } from "hono-openapi";
import * as v from "valibot";
import { DEFAULT_APP_DESCRIPTION, DEFAULT_APP_NAME } from "../branding";
import { seedCrmDefaults } from "../crm/shared/seed-workspace";
import db, { schema } from "../database";
import { publishEvent } from "../events";
import { checkWorkspaceName } from "../utils/check-workspace-name";

const setupRequestSchema = v.object({
  appName: v.optional(v.pipe(v.string(), v.trim(), v.minLength(1))),
  appDescription: v.optional(v.pipe(v.string(), v.trim())),
  adminName: v.pipe(v.string(), v.trim(), v.minLength(1)),
  adminEmail: v.pipe(v.string(), v.trim(), v.email()),
  adminPassword: v.pipe(v.string(), v.minLength(8)),
  workspaceName: v.pipe(v.string(), v.trim(), v.minLength(1)),
  workspaceDescription: v.optional(v.pipe(v.string(), v.trim())),
  locale: v.optional(v.pipe(v.string(), v.trim())),
  timezone: v.optional(v.pipe(v.string(), v.trim())),
});

const setupResponseSchema = v.object({
  userId: v.string(),
  workspaceId: v.string(),
  appName: v.string(),
});

function slugify(value: string) {
  const slug = value
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "workspace";
}

async function createUniqueWorkspaceSlug(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  workspaceName: string,
) {
  const base = slugify(workspaceName);

  for (let index = 0; index < 25; index += 1) {
    const slug = index === 0 ? base : `${base}-${index + 1}`;
    const existing = await tx
      .select({ id: schema.workspaceTable.id })
      .from(schema.workspaceTable)
      .where(eq(schema.workspaceTable.slug, slug))
      .limit(1);

    if (!existing[0]) {
      return slug;
    }
  }

  return `${base}-${createId().slice(0, 8)}`;
}

function getSetupSettingRows(input: {
  appName: string;
  appDescription: string;
  locale: string;
  timezone: string;
  userId: string;
  now: Date;
}) {
  return [
    {
      key: "branding.appName",
      value: input.appName,
      valueType: "string",
      category: "branding",
    },
    {
      key: "branding.appDescription",
      value: input.appDescription,
      valueType: "string",
      category: "branding",
    },
    {
      key: "instance.locale",
      value: input.locale,
      valueType: "string",
      category: "instance",
    },
    {
      key: "instance.timezone",
      value: input.timezone,
      valueType: "string",
      category: "instance",
    },
  ].map((setting) => ({
    ...setting,
    isSecret: false,
    updatedByUserId: input.userId,
    createdAt: input.now,
    updatedAt: input.now,
  }));
}

function getDefaultWorkspaceRoleRows(workspaceId: string, now: Date) {
  return DEFAULT_ROLE_NAMES.map((role) => ({
    workspaceId,
    role,
    permission: JSON.stringify(defaultRolePayloads[role]),
    createdAt: now,
    updatedAt: now,
  }));
}

const setup = new Hono().post(
  "/",
  describeRoute({
    operationId: "setupInstance",
    tags: ["Setup"],
    description:
      "Create the first superadmin, initial workspace, and setup settings. Available only while the instance has no users.",
    security: [],
    responses: {
      201: {
        description: "Initial setup completed",
        content: {
          "application/json": { schema: resolver(setupResponseSchema) },
        },
      },
      409: {
        description: "Instance setup has already been completed",
      },
    },
  }),
  validator("json", setupRequestSchema),
  async (c) => {
    const input = c.req.valid("json");
    const workspaceCheck = checkWorkspaceName(input.workspaceName);
    if (!workspaceCheck.ok) {
      throw new HTTPException(400, { message: workspaceCheck.reason });
    }

    const appName = input.appName?.trim() || DEFAULT_APP_NAME;
    const appDescription =
      input.appDescription?.trim() || DEFAULT_APP_DESCRIPTION;
    const locale = input.locale?.trim() || "pt-BR";
    const timezone = input.timezone?.trim() || "UTC";

    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(2027)`);

      const [totalRow] = await tx
        .select({ value: count() })
        .from(schema.userTable);

      if ((totalRow?.value ?? 0) > 0) {
        throw new HTTPException(409, {
          message: "Initial setup has already been completed.",
        });
      }

      const now = new Date();
      const userId = createId();
      const workspaceId = createId();
      const passwordHash = await bcrypt.hash(input.adminPassword, 10);
      const workspaceSlug = await createUniqueWorkspaceSlug(
        tx,
        input.workspaceName,
      );

      await tx.insert(schema.userTable).values({
        id: userId,
        name: input.adminName,
        email: input.adminEmail.toLowerCase(),
        emailVerified: true,
        locale,
        role: "superadmin",
        createdAt: now,
        updatedAt: now,
      });

      await tx.insert(schema.accountTable).values({
        id: createId(),
        accountId: input.adminEmail.toLowerCase(),
        providerId: "credential",
        userId,
        password: passwordHash,
        createdAt: now,
        updatedAt: now,
      });

      await tx.insert(schema.workspaceTable).values({
        id: workspaceId,
        name: input.workspaceName,
        slug: workspaceSlug,
        description: input.workspaceDescription?.trim() || null,
        createdAt: now,
      });

      await tx.insert(schema.workspaceUserTable).values({
        id: createId(),
        workspaceId,
        userId,
        role: "owner",
        joinedAt: now,
      });

      await tx
        .insert(schema.workspaceRoleTable)
        .values(getDefaultWorkspaceRoleRows(workspaceId, now));

      await seedCrmDefaults(workspaceId, tx);

      await tx.insert(schema.systemSettingTable).values(
        getSetupSettingRows({
          appName,
          appDescription,
          locale,
          timezone,
          userId,
          now,
        }),
      );

      return {
        userId,
        workspaceId,
        appName,
        workspaceName: input.workspaceName,
      };
    });

    publishEvent("workspace.created", {
      workspaceId: result.workspaceId,
      workspaceName: result.workspaceName,
      ownerEmail: input.adminEmail.toLowerCase(),
      ownerId: result.userId,
    });

    return c.json(
      {
        userId: result.userId,
        workspaceId: result.workspaceId,
        appName: result.appName,
      },
      201,
    );
  },
);

export default setup;
