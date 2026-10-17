import { and, desc, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../../database";
import {
  crmCompanyTable,
  crmContactTable,
  crmDealContactTable,
  crmDealTable,
  userTable,
} from "../../../database/schema";

async function getContact({
  workspaceId,
  contactId,
}: {
  workspaceId: string;
  contactId: string;
}) {
  const [row] = await db
    .select({
      contact: crmContactTable,
      company: {
        id: crmCompanyTable.id,
        name: crmCompanyTable.name,
        domain: crmCompanyTable.domain,
      },
      owner: {
        id: userTable.id,
        name: userTable.name,
        email: userTable.email,
        image: userTable.image,
      },
    })
    .from(crmContactTable)
    .leftJoin(
      crmCompanyTable,
      eq(crmContactTable.companyId, crmCompanyTable.id),
    )
    .leftJoin(userTable, eq(crmContactTable.ownerUserId, userTable.id))
    .where(
      and(
        eq(crmContactTable.id, contactId),
        eq(crmContactTable.workspaceId, workspaceId),
      ),
    )
    .limit(1);

  if (!row) {
    throw new HTTPException(404, { message: "Contact not found" });
  }

  const deals = await db
    .select({
      id: crmDealTable.id,
      number: crmDealTable.number,
      title: crmDealTable.title,
      status: crmDealTable.status,
      valueCents: crmDealTable.valueCents,
      currency: crmDealTable.currency,
      stageId: crmDealTable.stageId,
      role: crmDealContactTable.role,
    })
    .from(crmDealContactTable)
    .innerJoin(crmDealTable, eq(crmDealContactTable.dealId, crmDealTable.id))
    .where(eq(crmDealContactTable.contactId, contactId))
    .orderBy(desc(crmDealTable.createdAt));

  return { ...row.contact, company: row.company, owner: row.owner, deals };
}

export default getContact;
