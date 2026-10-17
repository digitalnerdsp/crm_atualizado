import { and, asc, desc, eq, gt, isNotNull, isNull } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../../database";
import type { CrmActivityType } from "../../../database/schema";
import { crmActivityTable, crmDealTable } from "../../../database/schema";
import { publishEvent } from "../../../events";

export type ActivityInput = {
  type?: CrmActivityType;
  subject?: string;
  body?: string | null;
  dealId?: string | null;
  contactId?: string | null;
  companyId?: string | null;
  ownerUserId?: string | null;
  dueAt?: Date | null;
  completedAt?: Date | null;
  durationMinutes?: number | null;
  outcome?: string | null;
};

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * `lastActivityAt` and `nextActivityAt` on the deal are denormalized so the
 * board does not need a subquery per card. They are only correct if every write
 * that touches an activity recomputes them, which is what this does.
 */
export async function refreshDealActivityStamps(tx: Tx, dealId: string) {
  const now = new Date();

  const [lastDone] = await tx
    .select({ completedAt: crmActivityTable.completedAt })
    .from(crmActivityTable)
    .where(
      and(
        eq(crmActivityTable.dealId, dealId),
        isNotNull(crmActivityTable.completedAt),
      ),
    )
    .orderBy(desc(crmActivityTable.completedAt))
    .limit(1);

  const [nextDue] = await tx
    .select({ dueAt: crmActivityTable.dueAt })
    .from(crmActivityTable)
    .where(
      and(
        eq(crmActivityTable.dealId, dealId),
        isNull(crmActivityTable.completedAt),
        gt(crmActivityTable.dueAt, now),
      ),
    )
    .orderBy(asc(crmActivityTable.dueAt))
    .limit(1);

  await tx
    .update(crmDealTable)
    .set({
      lastActivityAt: lastDone?.completedAt ?? null,
      nextActivityAt: nextDue?.dueAt ?? null,
    })
    .where(eq(crmDealTable.id, dealId));
}

async function assertDealInWorkspace(workspaceId: string, dealId: string) {
  const [deal] = await db
    .select({ id: crmDealTable.id })
    .from(crmDealTable)
    .where(
      and(
        eq(crmDealTable.id, dealId),
        eq(crmDealTable.workspaceId, workspaceId),
      ),
    )
    .limit(1);

  if (!deal) throw new HTTPException(404, { message: "Deal not found" });
}

export async function createActivity({
  workspaceId,
  createdByUserId,
  input,
}: {
  workspaceId: string;
  createdByUserId: string;
  input: ActivityInput & { type: CrmActivityType; subject: string };
}) {
  if (input.dealId) await assertDealInWorkspace(workspaceId, input.dealId);

  const created = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(crmActivityTable)
      .values({
        workspaceId,
        type: input.type,
        subject: input.subject,
        body: input.body ?? null,
        dealId: input.dealId ?? null,
        contactId: input.contactId ?? null,
        companyId: input.companyId ?? null,
        // An activity nobody owns never gets done, so it falls to its author.
        ownerUserId: input.ownerUserId ?? createdByUserId,
        dueAt: input.dueAt ?? null,
        completedAt: input.completedAt ?? null,
        durationMinutes: input.durationMinutes ?? null,
        outcome: input.outcome ?? null,
        createdByUserId,
      })
      .returning();

    if (!row) {
      throw new HTTPException(500, { message: "Failed to create activity" });
    }

    if (row.dealId) await refreshDealActivityStamps(tx, row.dealId);

    return row;
  });

  await publishEvent("crm.activity.created", {
    activityId: created.id,
    workspaceId,
    dealId: created.dealId,
    ownerUserId: created.ownerUserId,
    type: created.type,
    subject: created.subject,
    dueAt: created.dueAt,
  });

  return created;
}

export async function updateActivity({
  workspaceId,
  activityId,
  input,
}: {
  workspaceId: string;
  activityId: string;
  input: ActivityInput;
}) {
  const updated = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ dealId: crmActivityTable.dealId })
      .from(crmActivityTable)
      .where(
        and(
          eq(crmActivityTable.id, activityId),
          eq(crmActivityTable.workspaceId, workspaceId),
        ),
      )
      .limit(1);

    if (!existing) return undefined;

    const [row] = await tx
      .update(crmActivityTable)
      .set({
        ...(input.type === undefined ? {} : { type: input.type }),
        ...(input.subject === undefined ? {} : { subject: input.subject }),
        ...(input.body === undefined ? {} : { body: input.body }),
        ...(input.dealId === undefined ? {} : { dealId: input.dealId }),
        ...(input.contactId === undefined
          ? {}
          : { contactId: input.contactId }),
        ...(input.companyId === undefined
          ? {}
          : { companyId: input.companyId }),
        ...(input.ownerUserId === undefined
          ? {}
          : { ownerUserId: input.ownerUserId }),
        ...(input.dueAt === undefined ? {} : { dueAt: input.dueAt }),
        ...(input.completedAt === undefined
          ? {}
          : { completedAt: input.completedAt }),
        ...(input.durationMinutes === undefined
          ? {}
          : { durationMinutes: input.durationMinutes }),
        ...(input.outcome === undefined ? {} : { outcome: input.outcome }),
      })
      .where(eq(crmActivityTable.id, activityId))
      .returning();

    if (!row) return undefined;

    // Both sides when the activity was moved between deals.
    for (const dealId of new Set(
      [existing.dealId, row.dealId].filter((id): id is string => Boolean(id)),
    )) {
      await refreshDealActivityStamps(tx, dealId);
    }

    return row;
  });

  if (!updated) {
    throw new HTTPException(404, { message: "Activity not found" });
  }

  return updated;
}

export async function completeActivity({
  workspaceId,
  activityId,
  outcome,
  durationMinutes,
}: {
  workspaceId: string;
  activityId: string;
  outcome?: string | null;
  durationMinutes?: number | null;
}) {
  const completed = await updateActivity({
    workspaceId,
    activityId,
    input: {
      completedAt: new Date(),
      ...(outcome === undefined ? {} : { outcome }),
      ...(durationMinutes === undefined ? {} : { durationMinutes }),
    },
  });

  await publishEvent("crm.activity.completed", {
    activityId: completed.id,
    workspaceId,
    dealId: completed.dealId,
    ownerUserId: completed.ownerUserId,
    type: completed.type,
  });

  return completed;
}

export async function deleteActivity({
  workspaceId,
  activityId,
}: {
  workspaceId: string;
  activityId: string;
}) {
  const deleted = await db.transaction(async (tx) => {
    const [row] = await tx
      .delete(crmActivityTable)
      .where(
        and(
          eq(crmActivityTable.id, activityId),
          eq(crmActivityTable.workspaceId, workspaceId),
        ),
      )
      .returning();

    if (row?.dealId) await refreshDealActivityStamps(tx, row.dealId);

    return row;
  });

  if (!deleted) {
    throw new HTTPException(404, { message: "Activity not found" });
  }

  return deleted;
}
