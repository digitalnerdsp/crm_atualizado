import {
  and,
  asc,
  count,
  desc,
  eq,
  inArray,
  isNull,
  or,
  sql,
} from "drizzle-orm";
import db from "../../../database";
import {
  crmCompanyTable,
  crmContactTable,
  crmHostingTable,
  crmSegmentTable,
  crmSourceTable,
  userTable,
} from "../../../database/schema";
import {
  allOf,
  clampLimit,
  ownerScope,
  searchAcross,
} from "../../shared/list-filters";
import type { CrmVisibility } from "../../shared/resolve-visibility";

/**
 * Empresas e contatos são uma lista só: a busca acha a empresa pelo próprio
 * cadastro ou por qualquer contato dela (nome, e-mail ou telefone).
 */
function companySearch(search?: string) {
  const term = search?.trim();
  if (!term) return undefined;
  const pattern = `%${term}%`;
  // SQL explícito: num subselect de uma tabela só, o drizzle tira o prefixo
  // das colunas e "company_id = id" compararia o contato com ele mesmo.
  const byContact = sql`exists (
    select 1 from crm_contact ct
    where ct.company_id = ${crmCompanyTable.id}
      and ct.archived_at is null
      and (
        concat_ws(' ', ct.first_name, ct.last_name) ilike ${pattern}
        or ct.email ilike ${pattern}
        or ct.phone ilike ${pattern}
        or ct.mobile ilike ${pattern}
      )
  )`;
  return or(
    searchAcross(
      [
        crmCompanyTable.name,
        crmCompanyTable.legalName,
        crmCompanyTable.taxId,
        crmCompanyTable.domain,
        crmCompanyTable.city,
      ],
      search,
    ),
    byContact,
  );
}

async function getCompanies({
  workspaceId,
  userId,
  visibility,
  search,
  ownerUserId,
  includeArchived,
  limit,
  offset,
}: {
  workspaceId: string;
  userId: string;
  visibility: CrmVisibility;
  search?: string;
  ownerUserId?: string;
  includeArchived?: boolean;
  limit?: number;
  offset?: number;
}) {
  const where = allOf(
    eq(crmCompanyTable.workspaceId, workspaceId),
    includeArchived ? undefined : isNull(crmCompanyTable.archivedAt),
    ownerScope(crmCompanyTable.ownerUserId, visibility, userId),
    ownerUserId ? eq(crmCompanyTable.ownerUserId, ownerUserId) : undefined,
    companySearch(search),
  );

  const pageSize = clampLimit(limit);

  const [total] = await db
    .select({ value: count() })
    .from(crmCompanyTable)
    .where(where);

  const rows = await db
    .select({
      company: crmCompanyTable,
      hostingMode: crmHostingTable.mode,
      owner: {
        id: userTable.id,
        name: userTable.name,
        email: userTable.email,
        image: userTable.image,
      },
      segment: { id: crmSegmentTable.id, name: crmSegmentTable.name },
      source: { id: crmSourceTable.id, name: crmSourceTable.name },
    })
    .from(crmCompanyTable)
    .leftJoin(
      crmHostingTable,
      eq(crmHostingTable.companyId, crmCompanyTable.id),
    )
    .leftJoin(userTable, eq(crmCompanyTable.ownerUserId, userTable.id))
    .leftJoin(
      crmSegmentTable,
      eq(crmCompanyTable.segmentId, crmSegmentTable.id),
    )
    .leftJoin(crmSourceTable, eq(crmCompanyTable.sourceId, crmSourceTable.id))
    .where(where)
    .orderBy(asc(crmCompanyTable.name), desc(crmCompanyTable.createdAt))
    .limit(pageSize)
    .offset(offset ?? 0);

  // Contato principal da página: o marcado como principal, senão o mais antigo.
  const ids = rows.map((row) => row.company.id);
  const contacts = ids.length
    ? await db
        .select({
          id: crmContactTable.id,
          companyId: crmContactTable.companyId,
          firstName: crmContactTable.firstName,
          lastName: crmContactTable.lastName,
          email: crmContactTable.email,
          phone: crmContactTable.phone,
          mobile: crmContactTable.mobile,
        })
        .from(crmContactTable)
        .where(
          and(
            inArray(crmContactTable.companyId, ids),
            isNull(crmContactTable.archivedAt),
          ),
        )
        .orderBy(
          desc(crmContactTable.isPrimary),
          asc(crmContactTable.createdAt),
        )
    : [];
  const primaryContact = new Map<string, (typeof contacts)[number]>();
  const contactCount = new Map<string, number>();
  for (const contact of contacts) {
    if (!contact.companyId) continue;
    if (!primaryContact.has(contact.companyId))
      primaryContact.set(contact.companyId, contact);
    contactCount.set(
      contact.companyId,
      (contactCount.get(contact.companyId) ?? 0) + 1,
    );
  }

  return {
    total: total?.value ?? 0,
    limit: pageSize,
    offset: offset ?? 0,
    items: rows.map((row) => ({
      ...row.company,
      hostingMode: row.hostingMode ?? "unknown",
      contactCount: contactCount.get(row.company.id) ?? 0,
      primaryContact: (() => {
        const contact = primaryContact.get(row.company.id);
        if (!contact) return null;
        return {
          id: contact.id,
          name: [contact.firstName, contact.lastName].filter(Boolean).join(" "),
          email: contact.email,
          phone: contact.mobile ?? contact.phone,
        };
      })(),
      owner: row.owner,
      segment: row.segment,
      source: row.source,
    })),
  };
}

export default getCompanies;
