import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db, { schema } from "../../../database";
import type { Tx } from "../../../finance/performance/snapshot";
import { ownerScope } from "../../shared/list-filters";
import type { CrmVisibility } from "../../shared/resolve-visibility";
import { DEFAULT_MARKS, normalizeMarks } from "../digest/model";
import {
  emptyHosting,
  type PortfolioCompany,
  type PortfolioFilters,
  portfolioReport,
} from "../model";
import type { HostingInput } from "../validation";
export type Scope = {
  workspaceId: string;
  userId: string;
  visibility: CrmVisibility;
};
function fail(status: 400 | 404 | 409 | 413, message: string): never {
  throw new HTTPException(status, { message });
}
const where = (s: Scope) =>
  and(
    eq(schema.crmCompanyTable.workspaceId, s.workspaceId),
    ownerScope(schema.crmCompanyTable.ownerUserId, s.visibility, s.userId),
  );
async function company(tx: Tx, s: Scope, id: string) {
  const [c] = await tx
    .select()
    .from(schema.crmCompanyTable)
    .where(and(where(s), eq(schema.crmCompanyTable.id, id)))
    .for("update");
  if (!c) fail(404, "Empresa não encontrada.");
  return c;
}
async function audit(
  tx: Tx,
  s: Scope,
  id: string,
  action: string,
  before: unknown,
  after: unknown,
) {
  await tx.insert(schema.auditLogTable).values({
    workspaceId: s.workspaceId,
    actorUserId: s.userId,
    entityType: "crm_hosting",
    entityId: id,
    action: `crm.hosting.${action}`,
    summary: `Hospedagem: ${action}`,
    before,
    after,
  });
}
export async function metadata(s: Scope) {
  const [services, owners, providerRows] = await Promise.all([
    db
      .select({
        id: schema.crmServiceTable.id,
        name: schema.crmServiceTable.name,
        archivedAt: schema.crmServiceTable.archivedAt,
      })
      .from(schema.crmServiceTable)
      .where(eq(schema.crmServiceTable.workspaceId, s.workspaceId))
      .orderBy(asc(schema.crmServiceTable.name)),
    db
      .selectDistinct({ id: schema.userTable.id, name: schema.userTable.name })
      .from(schema.crmCompanyTable)
      .innerJoin(
        schema.userTable,
        eq(schema.userTable.id, schema.crmCompanyTable.ownerUserId),
      )
      .where(where(s)),
    db
      .selectDistinct({ provider: schema.crmHostingTable.provider })
      .from(schema.crmHostingTable)
      .innerJoin(
        schema.crmCompanyTable,
        eq(schema.crmCompanyTable.id, schema.crmHostingTable.companyId),
      )
      .where(and(where(s), isNull(schema.crmCompanyTable.archivedAt)))
      .orderBy(asc(schema.crmHostingTable.provider)),
  ]);
  const providers = [
    ...new Set(
      providerRows.map((r) => r.provider.trim()).filter((p) => p.length > 0),
    ),
  ];
  return { services, owners, providers };
}
export async function loadPortfolio(s: Scope): Promise<PortfolioCompany[]> {
  const c = schema.crmCompanyTable;
  const rows = await db
    .select({
      company: c,
      hosting: schema.crmHostingTable,
      ownerName: schema.userTable.name,
    })
    .from(c)
    .leftJoin(
      schema.crmHostingTable,
      eq(schema.crmHostingTable.companyId, c.id),
    )
    .leftJoin(schema.userTable, eq(schema.userTable.id, c.ownerUserId))
    .where(where(s))
    .orderBy(asc(c.name))
    .limit(10001);
  if (rows.length > 10000)
    fail(
      413,
      "Mais de 10.000 empresas nesta carteira. Solicite processamento de grande volume.",
    );
  if (!rows.length) return [];
  const [revisions, notices, flags, digestRows] = await Promise.all([
    db
      .select({ revision: schema.crmHostingRevisionTable })
      .from(schema.crmHostingRevisionTable)
      .innerJoin(c, eq(c.id, schema.crmHostingRevisionTable.companyId))
      .where(where(s)),
    db
      .select({ notice: schema.crmHostingNoticeTable })
      .from(schema.crmHostingNoticeTable)
      .innerJoin(c, eq(c.id, schema.crmHostingNoticeTable.companyId))
      .where(where(s)),
    db
      .select({
        companyId: schema.crmCompanyServiceFlagTable.companyId,
        id: schema.crmServiceTable.id,
        name: schema.crmServiceTable.name,
      })
      .from(schema.crmCompanyServiceFlagTable)
      .innerJoin(c, eq(c.id, schema.crmCompanyServiceFlagTable.companyId))
      .innerJoin(
        schema.crmServiceTable,
        eq(
          schema.crmServiceTable.id,
          schema.crmCompanyServiceFlagTable.serviceId,
        ),
      )
      .where(where(s)),
    db
      .select({
        companyId: schema.crmHostingDigestItemTable.companyId,
        renewsOn: schema.crmHostingDigestItemTable.renewsOn,
        markDays: schema.crmHostingDigestItemTable.markDays,
        listed: schema.crmHostingDigestItemTable.listed,
        runStatus: schema.crmHostingDigestRunTable.status,
        createdAt: schema.crmHostingDigestItemTable.createdAt,
      })
      .from(schema.crmHostingDigestItemTable)
      .innerJoin(
        schema.crmHostingDigestRunTable,
        eq(
          schema.crmHostingDigestRunTable.id,
          schema.crmHostingDigestItemTable.runId,
        ),
      )
      .innerJoin(c, eq(c.id, schema.crmHostingDigestItemTable.companyId))
      .where(where(s)),
  ]);
  const grouped = <T>(values: T[], key: (v: T) => string) => {
    const map = new Map<string, T[]>();
    for (const value of values) {
      const k = key(value);
      const list = map.get(k) ?? [];
      list.push(value);
      map.set(k, list);
    }
    return map;
  };
  const revs = grouped(
    revisions.map((v) => v.revision),
    (r) => r.companyId,
  );
  const notes = grouped(
    notices.map((v) => v.notice),
    (n) => n.companyId,
  );
  const services = grouped(flags, (f) => f.companyId);
  const digests = grouped(digestRows, (d) => d.companyId);
  return rows.map(({ company: c, hosting: h, ownerName }) => ({
    id: c.id,
    name: c.name,
    status: c.status,
    ownerId: c.ownerUserId,
    ownerName,
    createdAt: c.createdAt,
    archivedAt: c.archivedAt,
    version: h?.version ?? 0,
    hosting: {
      ...emptyHosting,
      ...h,
      services: (services.get(c.id) ?? []).map(({ id, name }) => ({
        id,
        name,
      })),
    },
    revisions: revs.get(c.id) ?? [],
    notices: notes.get(c.id) ?? [],
    digest: digests.get(c.id) ?? [],
  }));
}
export async function report(s: Scope, f: PortfolioFilters) {
  const [portfolio, [setting]] = await Promise.all([
    loadPortfolio(s),
    db
      .select({ marks: schema.crmHostingDigestSettingTable.marks })
      .from(schema.crmHostingDigestSettingTable)
      .where(
        eq(schema.crmHostingDigestSettingTable.workspaceId, s.workspaceId),
      ),
  ]);
  return portfolioReport(portfolio, f, {
    marks: normalizeMarks(setting?.marks ?? DEFAULT_MARKS),
  });
}
export async function detail(s: Scope, id: string) {
  return db.transaction(async (tx) => {
    const c = await company(tx, s, id);
    const [h] = await tx
      .select()
      .from(schema.crmHostingTable)
      .where(eq(schema.crmHostingTable.companyId, id));
    const [contacts, flags, revisions, notices] = await Promise.all([
      tx
        .select({
          id: schema.crmContactTable.id,
          firstName: schema.crmContactTable.firstName,
          lastName: schema.crmContactTable.lastName,
          email: schema.crmContactTable.email,
          phone: schema.crmContactTable.phone,
          mobile: schema.crmContactTable.mobile,
          emailOptOut: schema.crmContactTable.emailOptOut,
          isPrimary: schema.crmContactTable.isPrimary,
        })
        .from(schema.crmContactTable)
        .where(
          and(
            eq(schema.crmContactTable.companyId, id),
            eq(schema.crmContactTable.workspaceId, s.workspaceId),
            isNull(schema.crmContactTable.archivedAt),
          ),
        )
        .orderBy(desc(schema.crmContactTable.isPrimary)),
      tx
        .select({
          id: schema.crmServiceTable.id,
          name: schema.crmServiceTable.name,
        })
        .from(schema.crmCompanyServiceFlagTable)
        .innerJoin(
          schema.crmServiceTable,
          eq(
            schema.crmServiceTable.id,
            schema.crmCompanyServiceFlagTable.serviceId,
          ),
        )
        .where(eq(schema.crmCompanyServiceFlagTable.companyId, id)),
      tx
        .select()
        .from(schema.crmHostingRevisionTable)
        .where(eq(schema.crmHostingRevisionTable.companyId, id))
        .orderBy(desc(schema.crmHostingRevisionTable.sequence)),
      tx
        .select()
        .from(schema.crmHostingNoticeTable)
        .where(eq(schema.crmHostingNoticeTable.companyId, id))
        .orderBy(desc(schema.crmHostingNoticeTable.createdAt))
        .limit(101),
    ]);
    return {
      company: {
        id: c.id,
        name: c.name,
        status: c.status,
        archived: Boolean(c.archivedAt),
      },
      hosting: {
        ...emptyHosting,
        ...h,
        version: h?.version ?? 0,
        services: flags,
      },
      contacts,
      revisions,
      notices: notices.slice(0, 100),
      hasMoreNotices: notices.length > 100,
    };
  });
}
export async function saveHosting(s: Scope, id: string, input: HostingInput) {
  return db.transaction(async (tx) => {
    const c = await company(tx, s, id);
    if (c.archivedAt)
      fail(409, "Empresa arquivada. Reative-a antes de editar a hospedagem.");
    const [before] = await tx
      .select()
      .from(schema.crmHostingTable)
      .where(eq(schema.crmHostingTable.companyId, id));
    if ((before?.version ?? 0) !== input.version)
      fail(409, "Cadastro alterado. Atualize a tela.");
    if (input.contactId) {
      const [contact] = await tx
        .select()
        .from(schema.crmContactTable)
        .where(
          and(
            eq(schema.crmContactTable.id, input.contactId),
            eq(schema.crmContactTable.companyId, id),
            eq(schema.crmContactTable.workspaceId, s.workspaceId),
            isNull(schema.crmContactTable.archivedAt),
          ),
        );
      if (!contact)
        fail(400, "O contato precisa pertencer à empresa e estar ativo.");
    }
    const services = input.serviceIds.length
      ? await tx
          .select()
          .from(schema.crmServiceTable)
          .where(
            and(
              eq(schema.crmServiceTable.workspaceId, s.workspaceId),
              inArray(schema.crmServiceTable.id, input.serviceIds),
            ),
          )
      : [];
    if (services.length !== input.serviceIds.length)
      fail(400, "Um ou mais serviços não pertencem ao workspace.");
    const oldFlags = await tx
      .select()
      .from(schema.crmCompanyServiceFlagTable)
      .where(eq(schema.crmCompanyServiceFlagTable.companyId, id));
    if (
      services.some(
        (service) =>
          service.archivedAt &&
          !oldFlags.some((flag) => flag.serviceId === service.id),
      )
    )
      fail(400, "Serviço arquivado não pode ser adicionado como novo vínculo.");
    const { serviceIds, version, ...fields } = input;
    fields.domain = fields.domain.toLowerCase();
    const [saved] = await tx
      .insert(schema.crmHostingTable)
      .values({ ...fields, companyId: id, version: version + 1 })
      .onConflictDoUpdate({
        target: schema.crmHostingTable.companyId,
        set: { ...fields, version: version + 1 },
      })
      .returning();
    await tx
      .delete(schema.crmCompanyServiceFlagTable)
      .where(eq(schema.crmCompanyServiceFlagTable.companyId, id));
    if (serviceIds.length)
      await tx
        .insert(schema.crmCompanyServiceFlagTable)
        .values(serviceIds.map((serviceId) => ({ companyId: id, serviceId })));
    const snapshot = {
      ...fields,
      services: services.map((service) => ({
        id: service.id,
        name: service.name,
      })),
    };
    await tx.insert(schema.crmHostingRevisionTable).values({
      companyId: id,
      sequence: version + 1,
      snapshot,
      actorUserId: s.userId,
    });
    await audit(tx, s, id, "cadastro", before ?? null, {
      ...saved,
      services: snapshot.services,
    });
    if (!saved) throw new Error("Falha ao atualizar cadastro");
    return saved;
  });
}
