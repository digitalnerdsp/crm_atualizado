import { createHash } from "node:crypto";
import { sendClientNoticeEmail } from "@kaneo/email";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import * as v from "valibot";
import db, { schema } from "../../../database";
import type { Tx } from "../../../finance/performance/snapshot";
import { getRuntimeSmtpEmailConfig } from "../../../settings/email-settings";
import { ownerScope } from "../../shared/list-filters";
import type { CrmVisibility } from "../../shared/resolve-visibility";
import {
  emptyHosting,
  type PortfolioCompany,
  type PortfolioFilters,
  phoneNumber,
  portfolioReport,
  whatsappUrl,
} from "../model";
import type { HostingInput, previewSchema, sendSchema } from "../validation";
export type Scope = {
  workspaceId: string;
  userId: string;
  visibility: CrmVisibility;
};
const digest = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
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
  const [services, owners] = await Promise.all([
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
  ]);
  return { services, owners };
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
  const [revisions, notices, flags] = await Promise.all([
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
  }));
}
export async function report(s: Scope, f: PortfolioFilters) {
  return portfolioReport(await loadPortfolio(s), f);
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
    if ((input.emailAllowed || input.whatsappAllowed) && !input.contactId)
      fail(400, "Selecione um contato antes de habilitar os canais de aviso.");
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
async function previewInTx(
  tx: Tx,
  s: Scope,
  id: string,
  input: v.InferOutput<typeof previewSchema>,
) {
  const c = await company(tx, s, id);
  const [h] = await tx
    .select()
    .from(schema.crmHostingTable)
    .where(eq(schema.crmHostingTable.companyId, id));
  if (c.archivedAt || c.status !== "active" || h?.mode !== "third_party")
    fail(
      400,
      "Avisos estão disponíveis para clientes ativos com hospedagem de terceiros.",
    );
  if (!h.contactId) fail(400, "Selecione um contato para os avisos.");
  const [contact] = await tx
    .select()
    .from(schema.crmContactTable)
    .where(
      and(
        eq(schema.crmContactTable.id, h.contactId),
        eq(schema.crmContactTable.companyId, id),
        eq(schema.crmContactTable.workspaceId, s.workspaceId),
        isNull(schema.crmContactTable.archivedAt),
      ),
    );
  if (!contact) fail(400, "Contato indisponível. Atualize o cadastro.");
  let recipient = "";
  if (input.channel === "email") {
    if (!h.emailAllowed || contact.emailOptOut)
      fail(400, "Contato não está habilitado para este aviso por e-mail.");
    if (!v.safeParse(v.pipe(v.string(), v.email()), contact.email).success)
      fail(400, "Cadastre um e-mail válido no contato.");
    recipient = contact.email ?? "";
  } else {
    if (!h.whatsappAllowed)
      fail(400, "Contato não está habilitado para avisos por WhatsApp.");
    const phone = phoneNumber(contact.mobile || contact.phone);
    if (!phone)
      fail(400, "Cadastre um telefone válido com DDI e DDD no contato.");
    recipient = phone;
  }
  const subject =
    input.subject ||
    `Hospedagem de ${c.name}`.replace(/[\r\n]/g, " ").slice(0, 180);
  const body =
    input.body ||
    `Olá, ${contact.firstName}. Estamos entrando em contato sobre a hospedagem de ${c.name}${h.domain ? ` (${h.domain})` : ""}, mantida com ${h.provider || "um provedor terceiro"}.${h.renewsOn ? ` A data de renovação registrada é ${h.renewsOn.split("-").reverse().join("/")}.` : ""} Podemos confirmar as informações e os próximos passos?`;
  return {
    channel: input.channel,
    recipient,
    subject,
    body,
    signature: digest({
      companyId: id,
      companyName: c.name,
      version: h.version,
      contactId: contact.id,
      recipient,
      subject,
      body,
      channel: input.channel,
    }),
  };
}
export async function preview(
  s: Scope,
  id: string,
  input: v.InferOutput<typeof previewSchema>,
) {
  return db.transaction((tx) => previewInTx(tx, s, id, input));
}
export async function sendNotice(
  s: Scope,
  id: string,
  input: v.InferOutput<typeof sendSchema>,
) {
  const claim = await db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`hosting:${s.workspaceId}:${input.requestId}`},0))`,
    );
    await company(tx, s, id);
    const requestHash = digest({
      signature: input.signature,
      channel: input.channel,
      subject: input.subject,
      body: input.body,
    });
    const [retry] = await tx
      .select()
      .from(schema.crmHostingNoticeTable)
      .where(
        and(
          eq(schema.crmHostingNoticeTable.workspaceId, s.workspaceId),
          eq(schema.crmHostingNoticeTable.requestId, input.requestId),
        ),
      );
    if (retry) {
      if (retry.companyId !== id || retry.signature !== requestHash)
        fail(409, "Solicitação já utilizada com outros dados.");
      return { notice: retry, fresh: false };
    }
    const current = await previewInTx(tx, s, id, input);
    if (current.signature !== input.signature)
      fail(
        409,
        "O destinatário ou o cadastro mudou. Revise o aviso novamente.",
      );
    const [notice] = await tx
      .insert(schema.crmHostingNoticeTable)
      .values({
        workspaceId: s.workspaceId,
        companyId: id,
        requestId: input.requestId,
        signature: requestHash,
        channel: input.channel,
        status: input.channel === "email" ? "sending" : "prepared",
        recipient: current.recipient,
        subject: current.subject,
        body: current.body,
        actorUserId: s.userId,
      })
      .returning();
    if (!notice) throw new Error("Falha ao registrar aviso");
    await audit(tx, s, id, "aviso_preparado", null, notice);
    return { notice, fresh: true };
  });
  let notice = claim.notice;
  if (claim.fresh && notice.channel === "email") {
    let status: "accepted" | "failed" | "uncertain" = "uncertain";
    let error: string | null = null;
    try {
      const config = await getRuntimeSmtpEmailConfig();
      const result = await sendClientNoticeEmail(
        notice.recipient,
        notice.subject,
        notice.body,
        config,
      );
      status = result.success ? "accepted" : "failed";
      if (!result.success)
        error =
          "SMTP não configurado. Configure o envio antes de tentar um novo aviso.";
    } catch {
      error =
        "O envio não foi confirmado. Verifique o provedor antes de reenviar para evitar duplicação.";
    }
    const updated = await db.transaction(async (tx) => {
      const [row] = await tx
        .update(schema.crmHostingNoticeTable)
        .set({ status, error })
        .where(eq(schema.crmHostingNoticeTable.id, notice.id))
        .returning();
      await audit(
        tx,
        s,
        id,
        "resultado_email",
        { id: notice.id, status: notice.status },
        row,
      );
      return row;
    });
    if (updated) notice = updated;
  }
  return {
    notice,
    whatsappUrl:
      notice.channel === "whatsapp"
        ? whatsappUrl(notice.recipient, notice.body)
        : null,
  };
}
export async function confirmWhatsApp(s: Scope, id: string) {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(schema.crmHostingNoticeTable)
      .where(
        and(
          eq(schema.crmHostingNoticeTable.workspaceId, s.workspaceId),
          eq(schema.crmHostingNoticeTable.id, id),
        ),
      );
    if (!row) fail(404, "Aviso não encontrado.");
    await company(tx, s, row.companyId);
    const [current] = await tx
      .select()
      .from(schema.crmHostingNoticeTable)
      .where(eq(schema.crmHostingNoticeTable.id, id))
      .for("update");
    if (!current) fail(404, "Aviso não encontrado.");
    if (
      current.channel !== "whatsapp" ||
      !["prepared", "confirmed"].includes(current.status)
    )
      fail(
        400,
        "Confirmação manual é exclusiva de aviso preparado por WhatsApp.",
      );
    if (current.status === "confirmed") return current;
    const [saved] = await tx
      .update(schema.crmHostingNoticeTable)
      .set({
        status: "confirmed",
        confirmedBy: s.userId,
        confirmedAt: new Date(),
      })
      .where(eq(schema.crmHostingNoticeTable.id, id))
      .returning();
    await audit(tx, s, row.companyId, "whatsapp_confirmado", current, saved);
    if (!saved) throw new Error("Falha ao atualizar cadastro");
    return saved;
  });
}
