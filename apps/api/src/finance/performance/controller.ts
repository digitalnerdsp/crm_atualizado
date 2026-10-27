import { and, desc, eq, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db, { schema } from "../../database";
import { loadEntries } from "../controllers/finance";
import { today } from "../model";
import {
  type classifications,
  earned,
  type PerformanceFilters,
  performanceReport,
} from "./model";
import { commissionSnapshot, type Tx } from "./snapshot";

function fail(status: 400 | 404 | 409, message: string): never {
  throw new HTTPException(status, { message });
}
async function audit(
  tx: Tx,
  workspaceId: string,
  actorUserId: string,
  entityId: string,
  action: string,
  before: unknown,
  after: unknown,
) {
  await tx.insert(schema.auditLogTable).values({
    workspaceId,
    actorUserId,
    entityType: "finance_commission",
    entityId,
    action: `finance.performance.${action}`,
    summary: `Comissões e resultados: ${action}`,
    before,
    after,
  });
}
async function lock(tx: Tx, workspaceId: string, id: string) {
  const [e] = await tx
    .select()
    .from(schema.financeEntryTable)
    .where(
      and(
        eq(schema.financeEntryTable.id, id),
        eq(schema.financeEntryTable.workspaceId, workspaceId),
      ),
    )
    .for("update");
  if (!e) fail(404, "Lançamento não encontrado.");
  return e;
}
export async function configuration(workspaceId: string) {
  const [rules, settings] = await Promise.all([
    db
      .select({
        rule: schema.financeCommissionRuleTable,
        serviceName: schema.crmServiceTable.name,
      })
      .from(schema.financeCommissionRuleTable)
      .innerJoin(
        schema.crmServiceTable,
        eq(
          schema.crmServiceTable.id,
          schema.financeCommissionRuleTable.serviceId,
        ),
      )
      .where(eq(schema.financeCommissionRuleTable.workspaceId, workspaceId))
      .orderBy(
        desc(schema.financeCommissionRuleTable.effectiveDate),
        desc(schema.financeCommissionRuleTable.sequence),
      ),
    db
      .select()
      .from(schema.financeResultSettingsTable)
      .where(eq(schema.financeResultSettingsTable.workspaceId, workspaceId)),
  ]);
  return {
    rules: rules.map(({ rule, serviceName }) => ({ ...rule, serviceName })),
    settings: settings[0] ?? { presumptionBps: null, version: 0 },
  };
}
export async function saveRule(
  workspaceId: string,
  actor: string,
  input: {
    serviceId: string;
    effectiveDate: string;
    rateBps: number;
    recurringRateBps: number;
    recurringMonths: number | null;
    version: number;
  },
) {
  return db.transaction(async (tx) => {
    const [service] = await tx
      .select()
      .from(schema.crmServiceTable)
      .where(
        and(
          eq(schema.crmServiceTable.id, input.serviceId),
          eq(schema.crmServiceTable.workspaceId, workspaceId),
        ),
      )
      .for("update");
    if (!service) fail(404, "Serviço não encontrado.");
    const [latest] = await tx
      .select()
      .from(schema.financeCommissionRuleTable)
      .where(eq(schema.financeCommissionRuleTable.serviceId, input.serviceId))
      .orderBy(desc(schema.financeCommissionRuleTable.sequence))
      .limit(1);
    if ((latest?.sequence ?? 0) !== input.version)
      fail(409, "Regra alterada. Atualize a tela.");
    if (
      input.effectiveDate < today() ||
      (latest && input.effectiveDate < latest.effectiveDate)
    )
      fail(
        400,
        "A vigência deve começar hoje ou no futuro e não pode anteceder a última regra.",
      );
    const [rule] = await tx
      .insert(schema.financeCommissionRuleTable)
      .values({
        workspaceId,
        actorUserId: actor,
        serviceId: input.serviceId,
        effectiveDate: input.effectiveDate,
        rateBps: input.rateBps,
        recurringRateBps: input.recurringRateBps,
        recurringMonths: input.recurringMonths,
        // Sempre recebido: a escolha faturado/recebido saiu da tela.
        basis: "received",
        sequence: input.version + 1,
      })
      .returning();
    await audit(
      tx,
      workspaceId,
      actor,
      rule?.id ?? input.serviceId,
      "regra",
      latest ?? null,
      rule,
    );
    return rule;
  });
}
export async function saveSettings(
  workspaceId: string,
  actor: string,
  input: { presumptionBps: number | null; version: number },
) {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`performance:${workspaceId}`},0))`,
    );
    const [before] = await tx
      .select()
      .from(schema.financeResultSettingsTable)
      .where(eq(schema.financeResultSettingsTable.workspaceId, workspaceId));
    if ((before?.version ?? 0) !== input.version)
      fail(409, "Configuração alterada. Atualize a tela.");
    const [after] = await tx
      .insert(schema.financeResultSettingsTable)
      .values({
        workspaceId,
        presumptionBps: input.presumptionBps,
        version: input.version + 1,
      })
      .onConflictDoUpdate({
        target: schema.financeResultSettingsTable.workspaceId,
        set: {
          presumptionBps: input.presumptionBps,
          version: input.version + 1,
        },
      })
      .returning();
    await audit(
      tx,
      workspaceId,
      actor,
      workspaceId,
      "presuncao",
      before ?? null,
      after,
    );
    return after;
  });
}
export async function classify(
  workspaceId: string,
  actor: string,
  id: string,
  input: { resultClass: keyof typeof classifications; version: number },
) {
  return db.transaction(async (tx) => {
    const before = await lock(tx, workspaceId, id);
    if (before.version !== input.version)
      fail(409, "Lançamento alterado. Atualize a tela.");
    if (before.direction !== "payable" || before.kind !== "operating")
      fail(400, "Classificação disponível para despesas operacionais.");
    const [payout] = await tx
      .select()
      .from(schema.financeCommissionPayoutTable)
      .where(eq(schema.financeCommissionPayoutTable.payableEntryId, id));
    if (payout) fail(400, "A classificação de comissão gerada é automática.");
    const [after] = await tx
      .update(schema.financeEntryTable)
      .set({ resultClass: input.resultClass, version: before.version + 1 })
      .where(eq(schema.financeEntryTable.id, id))
      .returning();
    await audit(tx, workspaceId, actor, id, "classificacao", before, after);
    return after;
  });
}
export async function applyRule(
  workspaceId: string,
  actor: string,
  id: string,
  version: number,
) {
  return db.transaction(async (tx) => {
    const e = await lock(tx, workspaceId, id);
    if (e.version !== version)
      fail(409, "Lançamento alterado. Atualize a tela.");
    if (
      e.cancelledAt ||
      e.competenceDate < today() ||
      e.commissionRuleId ||
      e.direction !== "receivable" ||
      !e.sellerId ||
      !e.serviceId
    )
      fail(
        400,
        "Use uma cobrança atual ou futura, com serviço e vendedor, sem regra registrada.",
      );
    const [settlement] = await tx
      .select()
      .from(schema.financeSettlementTable)
      .where(
        and(
          eq(schema.financeSettlementTable.entryId, id),
          sql`${schema.financeSettlementTable.reversedAt} is null`,
        ),
      )
      .limit(1);
    if (settlement)
      fail(409, "Cobrança com baixa: a regra histórica deve ser preservada.");
    const capture = await commissionSnapshot(tx, workspaceId, e);
    if (!capture.commissionRuleId)
      fail(
        400,
        "Não existe regra vigente para este serviço na competência da cobrança.",
      );
    const [after] = await tx
      .update(schema.financeEntryTable)
      .set({ ...capture, version: e.version + 1 })
      .where(eq(schema.financeEntryTable.id, id))
      .returning();
    await audit(tx, workspaceId, actor, id, "aplicar_regra", e, after);
    return after;
  });
}
export async function report(workspaceId: string, f: PerformanceFilters) {
  const [entries, payouts, settings] = await Promise.all([
    loadEntries(workspaceId),
    db
      .select()
      .from(schema.financeCommissionPayoutTable)
      .where(eq(schema.financeCommissionPayoutTable.workspaceId, workspaceId)),
    db
      .select()
      .from(schema.financeResultSettingsTable)
      .where(eq(schema.financeResultSettingsTable.workspaceId, workspaceId)),
  ]);
  return performanceReport(
    entries,
    payouts,
    f,
    settings[0]?.presumptionBps ?? null,
  );
}
export async function issueCommission(
  workspaceId: string,
  actor: string,
  id: string,
  input: { requestId: string; dueDate: string; version: number },
) {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`commission:${workspaceId}:${input.requestId}`},0))`,
    );
    const e = await lock(tx, workspaceId, id);
    const [retry] = await tx
      .select({
        payout: schema.financeCommissionPayoutTable,
        entry: schema.financeEntryTable,
      })
      .from(schema.financeCommissionPayoutTable)
      .innerJoin(
        schema.financeEntryTable,
        eq(
          schema.financeEntryTable.id,
          schema.financeCommissionPayoutTable.payableEntryId,
        ),
      )
      .where(
        and(
          eq(schema.financeCommissionPayoutTable.workspaceId, workspaceId),
          eq(schema.financeCommissionPayoutTable.requestId, input.requestId),
        ),
      );
    if (retry) {
      if (
        retry.payout.sourceEntryId !== id ||
        retry.entry.dueDate !== input.dueDate
      )
        fail(409, "Solicitação já utilizada com outros dados.");
      return retry.entry;
    }
    if (e.version !== input.version)
      fail(409, "Cobrança alterada. Atualize a apuração.");
    if (
      e.cancelledAt ||
      !e.sellerId ||
      !e.serviceId ||
      !e.commissionRuleId ||
      e.commissionRateBps <= 0
    )
      fail(400, "Cobrança sem comissão disponível.");
    const [member] = await tx
      .select()
      .from(schema.workspaceUserTable)
      .where(
        and(
          eq(schema.workspaceUserTable.workspaceId, workspaceId),
          eq(schema.workspaceUserTable.userId, e.sellerId),
        ),
      )
      .limit(1);
    if (!member)
      fail(
        400,
        "O vendedor precisa pertencer ao workspace para receber a comissão.",
      );
    const settlements = await tx
      .select()
      .from(schema.financeSettlementTable)
      .where(eq(schema.financeSettlementTable.entryId, id));
    const linked = await tx
      .select({ entry: schema.financeEntryTable })
      .from(schema.financeCommissionPayoutTable)
      .innerJoin(
        schema.financeEntryTable,
        eq(
          schema.financeEntryTable.id,
          schema.financeCommissionPayoutTable.payableEntryId,
        ),
      )
      .where(eq(schema.financeCommissionPayoutTable.sourceEntryId, id))
      .for("update");
    const accrued = earned({ ...e, settlements }, today());
    const allocated = linked
      .filter((p) => !p.entry.cancelledAt)
      .reduce((sum, p) => sum + p.entry.amountCents, 0);
    const amountCents = accrued - allocated;
    if (amountCents <= 0)
      fail(
        409,
        "Nenhuma comissão adicional disponível até hoje. Confira baixas, estornos e títulos já gerados.",
      );
    const [seller] = await tx
      .select({ name: schema.userTable.name })
      .from(schema.userTable)
      .where(eq(schema.userTable.id, e.sellerId));
    const [payable] = await tx
      .insert(schema.financeEntryTable)
      .values({
        workspaceId,
        description: `Comissão · ${e.description}`.slice(0, 240),
        direction: "payable",
        kind: "operating",
        resultClass: "commission",
        amountCents,
        competenceDate: today(),
        dueDate: input.dueDate,
        partyName: e.sellerNameSnapshot ?? seller?.name ?? "Vendedor",
        companyId: e.companyId,
        serviceId: e.serviceId,
        sellerId: e.sellerId,
        serviceNameSnapshot: e.serviceNameSnapshot,
        sellerNameSnapshot: e.sellerNameSnapshot ?? seller?.name,
        paymentMethod: "pix",
        notes: `Origem: ${e.id}. Regra: ${e.commissionRuleId}. Comissão de ${e.commissionRateBps / 100}% sobre ${e.commissionBasis === "received" ? "recebimentos sem juros e multas, após descontos" : "valor faturado"}.`,
        seriesId: `commission:${input.requestId}`,
        requestSignature: input.requestId,
      })
      .returning();
    if (!payable) throw new Error("Falha ao gerar comissão");
    await tx.insert(schema.financeCommissionPayoutTable).values({
      workspaceId,
      sourceEntryId: id,
      payableEntryId: payable.id,
      requestId: input.requestId,
    });
    await audit(
      tx,
      workspaceId,
      actor,
      id,
      "gerar_comissao",
      { accrued, allocated },
      payable,
    );
    return payable;
  });
}
