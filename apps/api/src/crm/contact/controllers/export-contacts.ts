import { asc, eq, isNull } from "drizzle-orm";
import db from "../../../database";
import { crmCompanyTable, crmContactTable } from "../../../database/schema";
import { allOf, ownerScope } from "../../shared/list-filters";
import type { CrmVisibility } from "../../shared/resolve-visibility";

const COLUMNS = [
  "id",
  "firstName",
  "lastName",
  "email",
  "phone",
  "mobile",
  "jobTitle",
  "department",
  "company",
  "linkedinUrl",
  "emailOptOut",
  "consentSource",
  "consentAt",
  "createdAt",
] as const;

function escapeCsv(value: unknown) {
  if (value === null || value === undefined) return "";
  const text = value instanceof Date ? value.toISOString() : String(value);
  // A leading =, +, - or @ makes a spreadsheet treat the cell as a formula.
  const guarded = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${guarded.replace(/"/g, '""')}"`;
}

/**
 * Exporting the contact base is the module's highest LGPD risk, which is why it
 * sits behind its own `crmContact:export` action and is audited by the route.
 */
async function exportContacts({
  workspaceId,
  userId,
  visibility,
}: {
  workspaceId: string;
  userId: string;
  visibility: CrmVisibility;
}) {
  const rows = await db
    .select({
      contact: crmContactTable,
      companyName: crmCompanyTable.name,
    })
    .from(crmContactTable)
    .leftJoin(
      crmCompanyTable,
      eq(crmContactTable.companyId, crmCompanyTable.id),
    )
    .where(
      allOf(
        eq(crmContactTable.workspaceId, workspaceId),
        isNull(crmContactTable.archivedAt),
        ownerScope(crmContactTable.ownerUserId, visibility, userId),
      ),
    )
    .orderBy(asc(crmContactTable.firstName));

  const lines = [COLUMNS.join(",")];
  for (const row of rows) {
    const record: Record<string, unknown> = {
      ...row.contact,
      company: row.companyName,
    };
    lines.push(COLUMNS.map((column) => escapeCsv(record[column])).join(","));
  }

  return { csv: `${lines.join("\n")}\n`, count: rows.length };
}

export default exportContacts;
