import { and, desc, eq, gte, ilike, lte, or, type SQL } from "drizzle-orm";
import { Hono } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";
import * as v from "valibot";
import db, { schema } from "../database";
import { requireAdminPermission } from "./require-admin-permission";

const auditEventSchema = v.object({
  id: v.string(),
  action: v.string(),
  entityType: v.string(),
  entityId: v.nullish(v.string()),
  entityName: v.nullish(v.string()),
  workspaceId: v.nullish(v.string()),
  projectId: v.nullish(v.string()),
  summary: v.string(),
  before: v.unknown(),
  after: v.unknown(),
  metadata: v.unknown(),
  ipAddress: v.nullish(v.string()),
  userAgent: v.nullish(v.string()),
  createdAt: v.string(),
  actor: v.nullish(
    v.object({
      id: v.string(),
      name: v.string(),
      email: v.string(),
    }),
  ),
});

const listAuditQuerySchema = v.object({
  q: v.optional(v.pipe(v.string(), v.trim())),
  action: v.optional(v.pipe(v.string(), v.trim())),
  entityType: v.optional(v.pipe(v.string(), v.trim())),
  actorUserId: v.optional(v.pipe(v.string(), v.trim())),
  from: v.optional(v.pipe(v.string(), v.trim())),
  to: v.optional(v.pipe(v.string(), v.trim())),
  limit: v.optional(v.pipe(v.string(), v.regex(/^\d+$/))),
});

function parseDateFilter(value?: string) {
  if (!value) return null;

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

const audit = new Hono<{
  Variables: {
    userId: string;
    adminRole?: string;
    adminPermissions?: string[];
  };
}>().get(
  "/",
  describeRoute({
    operationId: "listAdminAuditEvents",
    tags: ["Admin"],
    description: "List administrative audit events.",
    responses: {
      200: {
        description: "Administrative audit event list",
        content: {
          "application/json": {
            schema: resolver(v.object({ events: v.array(auditEventSchema) })),
          },
        },
      },
    },
  }),
  validator("query", listAuditQuerySchema),
  requireAdminPermission("system.audit.view"),
  async (c) => {
    const query = c.req.valid("query");
    const filters: SQL[] = [];

    if (query.q) {
      const pattern = `%${query.q}%`;
      const search = or(
        ilike(schema.auditLogTable.summary, pattern),
        ilike(schema.auditLogTable.action, pattern),
        ilike(schema.auditLogTable.entityName, pattern),
        ilike(schema.userTable.name, pattern),
        ilike(schema.userTable.email, pattern),
      );
      if (search) filters.push(search);
    }

    if (query.action) {
      filters.push(eq(schema.auditLogTable.action, query.action));
    }

    if (query.entityType) {
      filters.push(eq(schema.auditLogTable.entityType, query.entityType));
    }

    if (query.actorUserId) {
      filters.push(eq(schema.auditLogTable.actorUserId, query.actorUserId));
    }

    const from = parseDateFilter(query.from);
    if (from) {
      filters.push(gte(schema.auditLogTable.createdAt, from));
    }

    const to = parseDateFilter(query.to);
    if (to) {
      filters.push(lte(schema.auditLogTable.createdAt, to));
    }

    const limit = Math.min(Number(query.limit ?? 100), 200);
    const rows = await db
      .select({
        id: schema.auditLogTable.id,
        action: schema.auditLogTable.action,
        entityType: schema.auditLogTable.entityType,
        entityId: schema.auditLogTable.entityId,
        entityName: schema.auditLogTable.entityName,
        workspaceId: schema.auditLogTable.workspaceId,
        projectId: schema.auditLogTable.projectId,
        summary: schema.auditLogTable.summary,
        before: schema.auditLogTable.before,
        after: schema.auditLogTable.after,
        metadata: schema.auditLogTable.metadata,
        ipAddress: schema.auditLogTable.ipAddress,
        userAgent: schema.auditLogTable.userAgent,
        createdAt: schema.auditLogTable.createdAt,
        actorId: schema.userTable.id,
        actorName: schema.userTable.name,
        actorEmail: schema.userTable.email,
      })
      .from(schema.auditLogTable)
      .leftJoin(
        schema.userTable,
        eq(schema.userTable.id, schema.auditLogTable.actorUserId),
      )
      .where(filters.length ? and(...filters) : undefined)
      .orderBy(desc(schema.auditLogTable.createdAt))
      .limit(limit);

    return c.json({
      events: rows.map((row) => ({
        id: row.id,
        action: row.action,
        entityType: row.entityType,
        entityId: row.entityId,
        entityName: row.entityName,
        workspaceId: row.workspaceId,
        projectId: row.projectId,
        summary: row.summary,
        before: row.before,
        after: row.after,
        metadata: row.metadata,
        ipAddress: row.ipAddress,
        userAgent: row.userAgent,
        createdAt: row.createdAt.toISOString(),
        actor: row.actorId
          ? {
              id: row.actorId,
              name: row.actorName ?? "Usuário removido",
              email: row.actorEmail ?? "",
            }
          : null,
      })),
    });
  },
);

export default audit;
