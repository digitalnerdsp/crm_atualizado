import { and, between, eq, isNotNull, isNull, lt, sql } from "drizzle-orm";
import db from "../database";
import {
  crmActivityTable,
  crmDealTable,
  crmStageTable,
  notificationTable,
} from "../database/schema";
import createNotification from "../notification/controllers/create-notification";
import { REMINDER_WINDOW_MINUTES } from "./reminder-timing";

const MINUTE_MS = 60 * 1000;

export const ROTTING_NOTIFICATION_TYPE = "crm_deal_rotting";
export const ACTIVITY_NOTIFICATION_TYPE = "crm_activity_due";

/**
 * The notification row is itself the "already told them" marker, so no extra
 * column or control table is needed. A deal that moves stage gets a fresh
 * `stageEnteredAt`, which makes any earlier notification stop counting — that
 * is exactly the behaviour we want when a stalled deal is finally moved.
 */
function alreadyNotified(
  type: string,
  resourceIdColumn: ReturnType<typeof sql>,
  sinceColumn: ReturnType<typeof sql>,
) {
  return sql`exists (
    select 1 from ${notificationTable} n
    where n.type = ${type}
      and n.resource_id = ${resourceIdColumn}
      and n.created_at > ${sinceColumn}
  )`;
}

export async function checkRottingDeals(now = new Date()) {
  const stalled = await db
    .select({
      dealId: crmDealTable.id,
      number: crmDealTable.number,
      title: crmDealTable.title,
      ownerUserId: crmDealTable.ownerUserId,
      workspaceId: crmDealTable.workspaceId,
      stageName: crmStageTable.name,
      rottingDays: crmStageTable.rottingDays,
      stageEnteredAt: crmDealTable.stageEnteredAt,
    })
    .from(crmDealTable)
    .innerJoin(crmStageTable, eq(crmDealTable.stageId, crmStageTable.id))
    .where(
      and(
        eq(crmDealTable.status, "open"),
        isNull(crmDealTable.archivedAt),
        isNotNull(crmDealTable.ownerUserId),
        isNotNull(crmStageTable.rottingDays),
        lt(
          crmDealTable.stageEnteredAt,
          sql`now() - make_interval(days => ${crmStageTable.rottingDays})`,
        ),
        sql`not ${alreadyNotified(
          ROTTING_NOTIFICATION_TYPE,
          sql`${crmDealTable.id}`,
          sql`${crmDealTable.stageEnteredAt}`,
        )}`,
      ),
    )
    .limit(200);

  for (const deal of stalled) {
    if (!deal.ownerUserId) continue;

    const days = Math.floor(
      (now.getTime() - deal.stageEnteredAt.getTime()) / (24 * 60 * MINUTE_MS),
    );

    await createNotification({
      userId: deal.ownerUserId,
      type: ROTTING_NOTIFICATION_TYPE,
      title: `Negócio parado: #${deal.number} ${deal.title}`,
      content: `Está em "${deal.stageName}" há ${days} dias.`,
      resourceId: deal.dealId,
      resourceType: "crm_deal",
      eventData: {
        dealId: deal.dealId,
        workspaceId: deal.workspaceId,
        stageName: deal.stageName,
        days,
      },
    });
  }

  return stalled.length;
}

export async function checkCrmActivityReminders(now = new Date()) {
  const windowStart = new Date(
    now.getTime() - REMINDER_WINDOW_MINUTES * MINUTE_MS,
  );

  const due = await db
    .select({
      activityId: crmActivityTable.id,
      subject: crmActivityTable.subject,
      type: crmActivityTable.type,
      dueAt: crmActivityTable.dueAt,
      ownerUserId: crmActivityTable.ownerUserId,
      workspaceId: crmActivityTable.workspaceId,
      dealId: crmActivityTable.dealId,
    })
    .from(crmActivityTable)
    .where(
      and(
        isNull(crmActivityTable.completedAt),
        isNotNull(crmActivityTable.ownerUserId),
        isNotNull(crmActivityTable.dueAt),
        between(crmActivityTable.dueAt, windowStart, now),
        sql`not ${alreadyNotified(
          ACTIVITY_NOTIFICATION_TYPE,
          sql`${crmActivityTable.id}`,
          sql`${crmActivityTable.createdAt}`,
        )}`,
      ),
    )
    .limit(200);

  for (const activity of due) {
    if (!activity.ownerUserId) continue;

    await createNotification({
      userId: activity.ownerUserId,
      type: ACTIVITY_NOTIFICATION_TYPE,
      title: `Atividade de hoje: ${activity.subject}`,
      content: null,
      resourceId: activity.activityId,
      resourceType: "crm_activity",
      eventData: {
        activityId: activity.activityId,
        workspaceId: activity.workspaceId,
        dealId: activity.dealId,
        type: activity.type,
      },
    });
  }

  return due.length;
}
