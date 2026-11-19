import {
  asc,
  count,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  lte,
  or,
} from "drizzle-orm";
import db from "../../../database";
import {
  crmActivityAttachmentTable,
  crmActivityTable,
  crmContactTable,
  crmDealTable,
  userTable,
} from "../../../database/schema";
import { allOf, clampLimit } from "../../shared/list-filters";
import type { CrmVisibility } from "../../shared/resolve-visibility";

async function getActivities({
  workspaceId,
  userId,
  visibility,
  dealId,
  contactId,
  companyId,
  ownerUserId,
  pendingOnly,
  dueBefore,
  dueAfter,
  limit,
  offset,
}: {
  workspaceId: string;
  userId: string;
  visibility: CrmVisibility;
  dealId?: string;
  contactId?: string;
  companyId?: string;
  ownerUserId?: string;
  pendingOnly?: boolean;
  dueBefore?: Date;
  dueAfter?: Date;
  limit?: number;
  offset?: number;
}) {
  // Without read_all a seller sees their own activities plus everything logged
  // on the deals they own — including a call a manager logged on their behalf.
  const ownScope =
    visibility === "all"
      ? undefined
      : or(
          eq(crmActivityTable.ownerUserId, userId),
          inArray(
            crmActivityTable.dealId,
            db
              .select({ id: crmDealTable.id })
              .from(crmDealTable)
              .where(
                allOf(
                  eq(crmDealTable.workspaceId, workspaceId),
                  eq(crmDealTable.ownerUserId, userId),
                ),
              ),
          ),
        );

  // Histórico do cliente: tudo o que a equipe registrou sobre a empresa, direto
  // nela ou nos negócios e contatos dela. Quem abre a empresa vê o histórico
  // inteiro, não só as atividades que são suas.
  const companyScope = companyId
    ? or(
        eq(crmActivityTable.companyId, companyId),
        inArray(
          crmActivityTable.dealId,
          db
            .select({ id: crmDealTable.id })
            .from(crmDealTable)
            .where(
              allOf(
                eq(crmDealTable.workspaceId, workspaceId),
                eq(crmDealTable.companyId, companyId),
              ),
            ),
        ),
        inArray(
          crmActivityTable.contactId,
          db
            .select({ id: crmContactTable.id })
            .from(crmContactTable)
            .where(
              allOf(
                eq(crmContactTable.workspaceId, workspaceId),
                eq(crmContactTable.companyId, companyId),
              ),
            ),
        ),
      )
    : undefined;

  const where = allOf(
    eq(crmActivityTable.workspaceId, workspaceId),
    companyId ? undefined : ownScope,
    dealId ? eq(crmActivityTable.dealId, dealId) : undefined,
    contactId ? eq(crmActivityTable.contactId, contactId) : undefined,
    companyScope,
    ownerUserId ? eq(crmActivityTable.ownerUserId, ownerUserId) : undefined,
    pendingOnly ? isNull(crmActivityTable.completedAt) : undefined,
    dueBefore ? lte(crmActivityTable.dueAt, dueBefore) : undefined,
    dueAfter ? gte(crmActivityTable.dueAt, dueAfter) : undefined,
  );

  const pageSize = clampLimit(limit);

  const [total] = await db
    .select({ value: count() })
    .from(crmActivityTable)
    .where(where);

  const rows = await db
    .select({
      activity: crmActivityTable,
      owner: {
        id: userTable.id,
        name: userTable.name,
        email: userTable.email,
        image: userTable.image,
      },
    })
    .from(crmActivityTable)
    .leftJoin(userTable, eq(crmActivityTable.ownerUserId, userTable.id))
    .where(where)
    // Pending work is read by due date, history is read newest first. Ordering
    // by due date then creation covers both without a second endpoint.
    .orderBy(
      pendingOnly
        ? asc(crmActivityTable.dueAt)
        : desc(crmActivityTable.createdAt),
    )
    .limit(pageSize)
    .offset(offset ?? 0);

  const files =
    rows.length === 0
      ? []
      : await db
          .select({
            id: crmActivityAttachmentTable.id,
            activityId: crmActivityAttachmentTable.activityId,
            filename: crmActivityAttachmentTable.filename,
            contentType: crmActivityAttachmentTable.contentType,
            sizeBytes: crmActivityAttachmentTable.sizeBytes,
          })
          .from(crmActivityAttachmentTable)
          .where(
            inArray(
              crmActivityAttachmentTable.activityId,
              rows.map((row) => row.activity.id),
            ),
          )
          .orderBy(asc(crmActivityAttachmentTable.createdAt));

  return {
    total: total?.value ?? 0,
    limit: pageSize,
    offset: offset ?? 0,
    items: rows.map((row) => ({
      ...row.activity,
      owner: row.owner,
      attachments: files
        .filter((file) => file.activityId === row.activity.id)
        .map(({ activityId: _activityId, ...file }) => file),
    })),
  };
}

export default getActivities;
