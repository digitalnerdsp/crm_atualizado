import { createHash } from "node:crypto";
import { sendClientNoticeEmail } from "@kaneo/email";
import { and, eq, isNull, sql } from "drizzle-orm";
import db, { schema as s } from "../../database";
import { getRuntimeSmtpEmailConfig } from "../../settings/email-settings";
import { today } from "../model";
import type { Tx } from "../performance/snapshot";
import { revisionAt } from "../recurrence/schedule";
import { audit, fail, load, sources } from "./controller";
import type { NoticeInput } from "./validation";

const hash = (v: unknown) =>
  createHash("sha256").update(JSON.stringify(v)).digest("hex");
async function previewWith(tx: Tx, workspaceId: string, input: NoticeInput) {
  const [row] = await tx
    .select()
    .from(s.portfolioCaseTable)
    .where(
      and(
        eq(s.portfolioCaseTable.workspaceId, workspaceId),
        eq(s.portfolioCaseTable.id, input.caseId),
      ),
    )
    .for("update");
  if (!row?.companyId)
    fail(400, "Acompanhamento precisa de cliente vinculado.");
  let sourceState: unknown;
  if (row.sourceKind === "receivable") {
    const [e] = await tx
      .select()
      .from(s.financeEntryTable)
      .where(
        and(
          eq(s.financeEntryTable.id, row.sourceId),
          eq(s.financeEntryTable.workspaceId, workspaceId),
        ),
      )
      .for("update");
    const payments = e
      ? await tx
          .select()
          .from(s.financeSettlementTable)
          .where(
            and(
              eq(s.financeSettlementTable.entryId, e.id),
              isNull(s.financeSettlementTable.reversedAt),
            ),
          )
      : [];
    const paid = payments
      .filter((p) => !p.reversedAt && p.date <= today())
      .reduce((sum, p) => sum + p.principalCents, 0);
    if (
      !e ||
      e.companyId !== row.companyId ||
      e.cancelledAt ||
      e.dueDate !== row.sourceDate ||
      e.amountCents - paid <= 0
    )
      fail(409, "Cobrança alterada ou já quitada. Atualize a fila.");
    sourceState = { version: e.version, remaining: e.amountCents - paid };
  } else if (row.sourceKind === "contract") {
    const [contract] = await tx
      .select()
      .from(s.crmContractTable)
      .where(
        and(
          eq(s.crmContractTable.workspaceId, workspaceId),
          eq(s.crmContractTable.id, row.sourceId),
        ),
      )
      .for("update");
    const revisions = contract
      ? await tx
          .select()
          .from(s.financeContractRevisionTable)
          .where(eq(s.financeContractRevisionTable.contractId, contract.id))
      : [];
    const revision = revisionAt(revisions, today());
    const endsOn = revision
      ? revision.endsOn
      : contract?.endsAt?.toISOString().slice(0, 10);
    if (
      !contract ||
      contract.companyId !== row.companyId ||
      (revision?.status ?? contract.status) !== "active" ||
      endsOn !== row.sourceDate
    )
      fail(409, "Contrato alterado ou renovado. Atualize a fila.");
    sourceState = { contract, revision };
  } else {
    const [hosting] = await tx
      .select()
      .from(s.crmHostingTable)
      .where(eq(s.crmHostingTable.companyId, row.companyId))
      .for("update");
    if (hosting?.mode !== "third_party" || hosting.renewsOn !== row.sourceDate)
      fail(409, "Hospedagem alterada ou renovada. Atualize a fila.");
    sourceState = hosting;
  }
  const [company] = await tx
    .select()
    .from(s.crmCompanyTable)
    .where(
      and(
        eq(s.crmCompanyTable.workspaceId, workspaceId),
        eq(s.crmCompanyTable.id, row.companyId),
      ),
    );
  if (!company || company.archivedAt || company.status !== "active")
    fail(400, "Avisos exigem cliente ativo, não arquivado.");
  const [contact] = await tx
    .select()
    .from(s.crmContactTable)
    .where(
      and(
        eq(s.crmContactTable.workspaceId, workspaceId),
        eq(s.crmContactTable.companyId, row.companyId),
        eq(s.crmContactTable.id, input.contactId),
      ),
    );
  if (!contact || contact.archivedAt)
    fail(400, "Contato não disponível para este cliente.");
  let recipient = contact.email ?? "";
  if (
    input.channel === "email" &&
    (contact.emailOptOut || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient))
  )
    fail(400, "Contato sem e-mail válido ou com opt-out.");
  if (input.channel === "whatsapp") {
    const raw = (contact.mobile || contact.phone || "").trim();
    recipient = raw.replace(/\D/g, "");
    if (!raw.startsWith("+") || !/^[1-9]\d{7,14}$/.test(recipient))
      fail(400, "Informe telefone internacional com +DDI e DDD no contato.");
  }
  const subject =
    input.subject ||
    `Acompanhamento comercial — ${company.name.replace(/[\r\n]/g, " ")}`;
  const body =
    input.body ||
    `Olá, ${[contact.firstName, contact.lastName].filter(Boolean).join(" ")}.\nEntramos em contato pela ${company.name} para conferir ${row.sourceKind === "receivable" ? "o pagamento" : "a renovação"} com data ${row.sourceDate.split("-").reverse().join("/")}.\nPor favor, nos informe a situação para atualizarmos o acompanhamento. Obrigado.`;
  const signature = hash({
    sourceState,
    caseId: row.id,
    version: row.version,
    company: company.name,
    contactId: contact.id,
    recipient,
    channel: input.channel,
    subject,
    body,
  });
  return { signature, recipient, subject, body, channel: input.channel };
}
export async function preview(workspaceId: string, input: NoticeInput) {
  const d = await load(workspaceId);
  const c = d.cases.find((c) => c.id === input.caseId);
  if (
    !c ||
    !sources(d).some(
      (r) =>
        r.sourceKind === c.sourceKind &&
        r.sourceId === c.sourceId &&
        r.sourceDate === c.sourceDate,
    )
  )
    fail(
      409,
      "Obrigação resolvida ou alterada. Atualize a fila antes de avisar.",
    );
  return db.transaction((tx) => previewWith(tx, workspaceId, input));
}
export async function send(
  workspaceId: string,
  actor: string,
  input: NoticeInput & { requestId: string; signature: string },
) {
  const requestSignature = hash(input);
  const prepared = await db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${workspaceId + input.requestId}))`,
    );
    const [old] = await tx
      .select()
      .from(s.portfolioNoticeTable)
      .where(
        and(
          eq(s.portfolioNoticeTable.workspaceId, workspaceId),
          eq(s.portfolioNoticeTable.requestId, input.requestId),
        ),
      );
    if (old) {
      if (old.signature !== requestSignature)
        fail(409, "Solicitação reutilizada com dados diferentes.");
      return { notice: old, fresh: false };
    }
    const p = await previewWith(tx, workspaceId, input);
    if (p.signature !== input.signature)
      fail(409, "Prévia mudou. Confira destinatário e mensagem novamente.");
    const [notice] = await tx
      .insert(s.portfolioNoticeTable)
      .values({
        workspaceId,
        caseId: input.caseId,
        requestId: input.requestId,
        signature: requestSignature,
        channel: input.channel,
        status: input.channel === "email" ? "sending" : "prepared",
        recipient: p.recipient,
        subject: p.subject,
        body: p.body,
        actorUserId: actor,
      })
      .returning();
    if (!notice) throw Error("Falha ao preparar aviso");
    await audit(
      tx,
      workspaceId,
      actor,
      notice.id,
      "notice-prepared",
      null,
      notice,
    );
    return { notice, fresh: true };
  });
  let notice = prepared.notice;
  if (prepared.fresh && notice.channel === "email") {
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
      if (!result.success) error = "SMTP não configurado.";
    } catch {
      error =
        "Confirmação indisponível. Confira o provedor antes de tentar novamente.";
    }
    const final = await db.transaction(async (tx) => {
      const [row] = await tx
        .update(s.portfolioNoticeTable)
        .set({ status, error })
        .where(eq(s.portfolioNoticeTable.id, notice.id))
        .returning();
      await audit(tx, workspaceId, actor, notice.id, "notice-result", null, {
        status,
        error,
      });
      return row;
    });
    if (final) notice = final;
  }
  return {
    notice,
    whatsappUrl:
      notice.channel === "whatsapp"
        ? `https://wa.me/${notice.recipient}?text=${encodeURIComponent(notice.body)}`
        : null,
  };
}
export async function confirm(workspaceId: string, actor: string, id: string) {
  return db.transaction(async (tx) => {
    const [old] = await tx
      .select()
      .from(s.portfolioNoticeTable)
      .where(
        and(
          eq(s.portfolioNoticeTable.id, id),
          eq(s.portfolioNoticeTable.workspaceId, workspaceId),
        ),
      )
      .for("update");
    if (!old) fail(404, "Aviso não encontrado.");
    if (
      old.channel !== "whatsapp" ||
      !["prepared", "confirmed"].includes(old.status)
    )
      fail(400, "Somente WhatsApp preparado pode receber confirmação manual.");
    if (old.status === "confirmed") return old;
    const [row] = await tx
      .update(s.portfolioNoticeTable)
      .set({ status: "confirmed", confirmedBy: actor })
      .where(eq(s.portfolioNoticeTable.id, id))
      .returning();
    await audit(
      tx,
      workspaceId,
      actor,
      id,
      "whatsapp-user-confirmation",
      old,
      row,
    );
    return row;
  });
}
