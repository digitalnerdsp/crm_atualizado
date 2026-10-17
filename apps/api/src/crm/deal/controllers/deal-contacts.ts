import { and, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../../database";
import {
  crmContactTable,
  crmDealContactTable,
  crmDealTable,
} from "../../../database/schema";
import { isUniqueViolation } from "../../shared/unique-violation";

async function assertSameWorkspace({
  workspaceId,
  dealId,
  contactId,
}: {
  workspaceId: string;
  dealId: string;
  contactId: string;
}) {
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

  const [contact] = await db
    .select({ id: crmContactTable.id })
    .from(crmContactTable)
    .where(
      and(
        eq(crmContactTable.id, contactId),
        eq(crmContactTable.workspaceId, workspaceId),
      ),
    )
    .limit(1);

  if (!contact) throw new HTTPException(404, { message: "Contact not found" });
}

export async function linkContact({
  workspaceId,
  dealId,
  contactId,
  role,
}: {
  workspaceId: string;
  dealId: string;
  contactId: string;
  role?: string | null;
}) {
  await assertSameWorkspace({ workspaceId, dealId, contactId });

  try {
    const [created] = await db
      .insert(crmDealContactTable)
      .values({ dealId, contactId, role: role ?? null })
      .returning();
    return created;
  } catch (error) {
    if (isUniqueViolation(error)) {
      // Linking an already-linked contact updates their role instead of
      // failing — that is what the caller meant.
      const [updated] = await db
        .update(crmDealContactTable)
        .set({ role: role ?? null })
        .where(
          and(
            eq(crmDealContactTable.dealId, dealId),
            eq(crmDealContactTable.contactId, contactId),
          ),
        )
        .returning();
      return updated;
    }
    throw error;
  }
}

export async function unlinkContact({
  workspaceId,
  dealId,
  contactId,
}: {
  workspaceId: string;
  dealId: string;
  contactId: string;
}) {
  await assertSameWorkspace({ workspaceId, dealId, contactId });

  const [deleted] = await db
    .delete(crmDealContactTable)
    .where(
      and(
        eq(crmDealContactTable.dealId, dealId),
        eq(crmDealContactTable.contactId, contactId),
      ),
    )
    .returning();

  if (!deleted) {
    throw new HTTPException(404, {
      message: "This contact is not linked to the deal",
    });
  }

  return deleted;
}
