import { and, eq, ne } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../../database";
import { crmContactTable } from "../../../database/schema";
import { publishEvent } from "../../../events";

export type ContactInput = {
  firstName?: string;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  mobile?: string | null;
  jobTitle?: string | null;
  department?: string | null;
  linkedinUrl?: string | null;
  companyId?: string | null;
  ownerUserId?: string | null;
  isPrimary?: boolean;
  emailOptOut?: boolean;
  consentSource?: string | null;
  consentAt?: Date | null;
  notes?: string | null;
  archived?: boolean;
};

function normalizeEmail(email: string | null | undefined) {
  if (email === undefined) return undefined;
  if (email === null) return null;
  const cleaned = email.trim().toLowerCase();
  return cleaned.length > 0 ? cleaned : null;
}

/** Warned about, never blocked — see the note in the company controller. */
export async function findDuplicateContacts({
  workspaceId,
  email,
  excludeId,
}: {
  workspaceId: string;
  email?: string | null;
  excludeId?: string;
}) {
  if (!email) return [];

  return db
    .select({
      id: crmContactTable.id,
      firstName: crmContactTable.firstName,
      lastName: crmContactTable.lastName,
      email: crmContactTable.email,
      companyId: crmContactTable.companyId,
    })
    .from(crmContactTable)
    .where(
      and(
        eq(crmContactTable.workspaceId, workspaceId),
        eq(crmContactTable.email, email),
        excludeId ? ne(crmContactTable.id, excludeId) : undefined,
      ),
    )
    .limit(5);
}

/**
 * A company has at most one primary contact, so promoting one demotes the rest
 * in the same transaction.
 */
async function clearOtherPrimaries({
  tx,
  companyId,
  keepContactId,
}: {
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0];
  companyId: string;
  keepContactId?: string;
}) {
  await tx
    .update(crmContactTable)
    .set({ isPrimary: false })
    .where(
      and(
        eq(crmContactTable.companyId, companyId),
        eq(crmContactTable.isPrimary, true),
        keepContactId ? ne(crmContactTable.id, keepContactId) : undefined,
      ),
    );
}

export async function createContact({
  workspaceId,
  input,
}: {
  workspaceId: string;
  input: ContactInput & { firstName: string };
}) {
  const email = normalizeEmail(input.email) ?? null;
  const duplicates = await findDuplicateContacts({ workspaceId, email });

  const created = await db.transaction(async (tx) => {
    if (input.isPrimary && input.companyId) {
      await clearOtherPrimaries({ tx, companyId: input.companyId });
    }

    const [row] = await tx
      .insert(crmContactTable)
      .values({
        workspaceId,
        companyId: input.companyId ?? null,
        firstName: input.firstName,
        lastName: input.lastName ?? null,
        email,
        phone: input.phone ?? null,
        mobile: input.mobile ?? null,
        jobTitle: input.jobTitle ?? null,
        department: input.department ?? null,
        linkedinUrl: input.linkedinUrl ?? null,
        ownerUserId: input.ownerUserId ?? null,
        isPrimary: input.isPrimary ?? false,
        emailOptOut: input.emailOptOut ?? false,
        consentSource: input.consentSource ?? null,
        consentAt: input.consentAt ?? null,
        notes: input.notes ?? null,
      })
      .returning();

    return row;
  });

  if (!created) {
    throw new HTTPException(500, { message: "Failed to create contact" });
  }

  await publishEvent("crm.contact.created", {
    contactId: created.id,
    workspaceId,
  });

  return { ...created, possibleDuplicates: duplicates };
}

export async function updateContact({
  workspaceId,
  contactId,
  input,
}: {
  workspaceId: string;
  contactId: string;
  input: ContactInput;
}) {
  const email = normalizeEmail(input.email);

  const updated = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({
        id: crmContactTable.id,
        companyId: crmContactTable.companyId,
      })
      .from(crmContactTable)
      .where(
        and(
          eq(crmContactTable.id, contactId),
          eq(crmContactTable.workspaceId, workspaceId),
        ),
      )
      .limit(1);

    if (!existing) return undefined;

    const targetCompanyId =
      input.companyId === undefined ? existing.companyId : input.companyId;

    if (input.isPrimary === true && targetCompanyId) {
      await clearOtherPrimaries({
        tx,
        companyId: targetCompanyId,
        keepContactId: contactId,
      });
    }

    const [row] = await tx
      .update(crmContactTable)
      .set({
        ...(input.firstName === undefined
          ? {}
          : { firstName: input.firstName }),
        ...(input.lastName === undefined ? {} : { lastName: input.lastName }),
        ...(email === undefined ? {} : { email }),
        ...(input.phone === undefined ? {} : { phone: input.phone }),
        ...(input.mobile === undefined ? {} : { mobile: input.mobile }),
        ...(input.jobTitle === undefined ? {} : { jobTitle: input.jobTitle }),
        ...(input.department === undefined
          ? {}
          : { department: input.department }),
        ...(input.linkedinUrl === undefined
          ? {}
          : { linkedinUrl: input.linkedinUrl }),
        ...(input.companyId === undefined
          ? {}
          : { companyId: input.companyId }),
        ...(input.ownerUserId === undefined
          ? {}
          : { ownerUserId: input.ownerUserId }),
        ...(input.isPrimary === undefined
          ? {}
          : { isPrimary: input.isPrimary }),
        ...(input.emailOptOut === undefined
          ? {}
          : { emailOptOut: input.emailOptOut }),
        ...(input.consentSource === undefined
          ? {}
          : { consentSource: input.consentSource }),
        ...(input.consentAt === undefined
          ? {}
          : { consentAt: input.consentAt }),
        ...(input.notes === undefined ? {} : { notes: input.notes }),
        ...(input.archived === undefined
          ? {}
          : { archivedAt: input.archived ? new Date() : null }),
      })
      .where(eq(crmContactTable.id, contactId))
      .returning();

    return row;
  });

  if (!updated) {
    throw new HTTPException(404, { message: "Contact not found" });
  }

  await publishEvent("crm.contact.updated", {
    contactId: updated.id,
    workspaceId,
  });

  return updated;
}

export async function deleteContact({
  workspaceId,
  contactId,
}: {
  workspaceId: string;
  contactId: string;
}) {
  const [deleted] = await db
    .delete(crmContactTable)
    .where(
      and(
        eq(crmContactTable.id, contactId),
        eq(crmContactTable.workspaceId, workspaceId),
      ),
    )
    .returning();

  if (!deleted) {
    throw new HTTPException(404, { message: "Contact not found" });
  }

  await publishEvent("crm.contact.deleted", {
    contactId: deleted.id,
    workspaceId,
  });

  return deleted;
}
