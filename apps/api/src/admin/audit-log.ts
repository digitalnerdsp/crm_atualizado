import type { Context } from "hono";
import db, { schema } from "../database";

type AuditContext = Context;

type AuditLogInput = {
  actorUserId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  entityName?: string | null;
  workspaceId?: string | null;
  projectId?: string | null;
  summary: string;
  before?: unknown;
  after?: unknown;
  metadata?: unknown;
  ipAddress?: string | null;
  userAgent?: string | null;
};

function headerValue(c: AuditContext, key: string) {
  return c.req.header(key) ?? null;
}

export async function recordAuditLogEntry(input: AuditLogInput) {
  await db.insert(schema.auditLogTable).values({
    actorUserId: input.actorUserId ?? null,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId ?? null,
    entityName: input.entityName ?? null,
    workspaceId: input.workspaceId ?? null,
    projectId: input.projectId ?? null,
    summary: input.summary,
    before: input.before ?? null,
    after: input.after ?? null,
    metadata: input.metadata ?? null,
    ipAddress: input.ipAddress ?? null,
    userAgent: input.userAgent ?? null,
    createdAt: new Date(),
  });
}

export async function recordAuditLog(c: AuditContext, input: AuditLogInput) {
  await recordAuditLogEntry({
    ...input,
    actorUserId:
      input.actorUserId ?? (c.get("userId") as string | null) ?? null,
    ipAddress:
      input.ipAddress ??
      headerValue(c, "x-forwarded-for")?.split(",")[0]?.trim() ??
      headerValue(c, "x-real-ip"),
    userAgent: input.userAgent ?? headerValue(c, "user-agent"),
  });
}
