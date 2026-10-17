import { createHash } from "node:crypto";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { markCompanyActive } from "../../crm/shared/company-lifecycle";
import { sumMonthlyEquivalents } from "../../crm/shared/contract-value";
import db, { schema } from "../../database";
import { addMonths, isCivilDate, today } from "../model";
import { day, effectiveDay, planCycles, snapshotItems } from "./schedule";
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Contract = typeof schema.crmContractTable.$inferSelect;
export async function lockContract(tx: Tx, workspaceId: string, id: string) {
  const [c] = await tx
    .select()
    .from(schema.crmContractTable)
    .where(
      and(
        eq(schema.crmContractTable.id, id),
        eq(schema.crmContractTable.workspaceId, workspaceId),
      ),
    )
    .for("update");
  if (!c) throw new HTTPException(404, { message: "Contrato não encontrado." });
  return c;
}
async function log(
  tx: Tx,
  c: Contract,
  actor: string | null,
  action: string,
  before: unknown,
  after: unknown,
) {
  await tx.insert(schema.auditLogTable).values({
    workspaceId: c.workspaceId,
    actorUserId: actor,
    entityType: "finance_contract",
    entityId: c.id,
    action: `finance.contract.${action}`,
    summary: `Contrato #${c.number}: ${action}`,
    before,
    after,
  });
}
export async function billingRevisions(tx: Tx, id: string) {
  return tx
    .select()
    .from(schema.financeContractRevisionTable)
    .where(eq(schema.financeContractRevisionTable.contractId, id))
    .orderBy(asc(schema.financeContractRevisionTable.sequence));
}
export async function appendRevision(
  tx: Tx,
  c: Contract,
  at: string,
  actor: string | null,
  config: typeof schema.financeContractBillingTable.$inferSelect,
) {
  const revisions = await billingRevisions(tx, c.id);
  const last = revisions[revisions.length - 1];
  const effectiveDate =
    last &&
    at < last.effectiveDate &&
    last.effectiveDate === config.startsOn &&
    config.startsOn > today()
      ? config.startsOn
      : at;
  if (last && effectiveDate < last.effectiveDate)
    throw new HTTPException(409, {
      message: "Data anterior à última versão financeira do contrato.",
    });
  const lines = await tx
    .select()
    .from(schema.crmContractServiceTable)
    .where(eq(schema.crmContractServiceTable.contractId, c.id))
    .orderBy(
      asc(schema.crmContractServiceTable.position),
      asc(schema.crmContractServiceTable.id),
    );
  if (lines.length && sumMonthlyEquivalents(lines) !== c.monthlyValueCents)
    throw new HTTPException(400, {
      message:
        "Ajuste os preços dos serviços para corresponder ao valor mensal do contrato.",
    });
  if (c.ownerUserId) {
    const [member] = await tx
      .select({ id: schema.workspaceUserTable.id })
      .from(schema.workspaceUserTable)
      .where(
        and(
          eq(schema.workspaceUserTable.workspaceId, c.workspaceId),
          eq(schema.workspaceUserTable.userId, c.ownerUserId),
        ),
      );
    if (!member)
      throw new HTTPException(400, {
        message: "Responsável do contrato não pertence ao workspace.",
      });
  }
  const items = snapshotItems(
    lines,
    c.monthlyValueCents,
    effectiveDate,
    last?.items ?? [],
  );
  if (
    items.some(
      (i) =>
        !Number.isSafeInteger(i.amountCents) ||
        i.amountCents < 0 ||
        i.amountCents > 1e12 ||
        !isCivilDate(i.anchor),
    )
  )
    throw new HTTPException(400, {
      message:
        "Revise os valores ou as datas dos serviços antes de ativar as cobranças.",
    });
  const [seller] = c.ownerUserId
    ? await tx
        .select({ name: schema.userTable.name })
        .from(schema.userTable)
        .where(eq(schema.userTable.id, c.ownerUserId))
    : [];
  const [revision] = await tx
    .insert(schema.financeContractRevisionTable)
    .values({
      contractId: c.id,
      effectiveDate,
      prorateFinal: config.prorateFinal,
      sequence: (last?.sequence ?? 0) + 1,
      status: config.enabled ? c.status : "paused",
      endsOn: c.endsAt ? day(c.endsAt) : null,
      billingDay: c.billingDay,
      items,
      sellerId: c.ownerUserId,
      sellerName: seller?.name ?? null,
      actorUserId: actor,
    })
    .returning();
  await log(tx, c, actor, "versao", last ?? null, revision);
  return revision;
}
async function amountsPaid(tx: Tx, entryId: string) {
  const [r] = await tx
    .select({
      value: sql<string>`coalesce(sum(${schema.financeSettlementTable.principalCents}),0)`,
    })
    .from(schema.financeSettlementTable)
    .where(
      and(
        eq(schema.financeSettlementTable.entryId, entryId),
        sql`${schema.financeSettlementTable.reversedAt} is null`,
      ),
    );
  return Number(r?.value ?? 0);
}
export async function reconcile(
  tx: Tx,
  c: Contract,
  actor: string | null,
  config: typeof schema.financeContractBillingTable.$inferSelect,
  mutableFrom = today(),
) {
  const revisions = await billingRevisions(tx, c.id);
  const through = addMonths(today(), config.horizonMonths);
  const entries = await tx
    .select()
    .from(schema.financeEntryTable)
    .where(eq(schema.financeEntryTable.contractId, c.id))
    .for("update");
  // A shorter generation horizon must not leave previously issued future bills
  // untouched when a contract is paused, cancelled, or amended.
  const evaluationThrough = entries.reduce(
    (last, entry) =>
      entry.cycleStart && entry.cycleStart > last ? entry.cycleStart : last,
    through,
  );
  const planned = planCycles(revisions, evaluationThrough, config.prorateFinal);
  const desired = new Map(planned.map((p) => [`${p.key}:${p.start}`, p]));
  const existing = new Map(
    entries.map((e) => [`${e.contractLineKey}:${e.cycleStart}`, e]),
  );
  const [company] = await tx
    .select()
    .from(schema.crmCompanyTable)
    .where(eq(schema.crmCompanyTable.id, c.companyId));
  if (!company)
    throw new HTTPException(400, { message: "Cliente não encontrado." });
  let created = 0;
  let updated = 0;
  let cancelled = 0;
  const warnings: string[] = [];
  for (const entry of entries) {
    if (!entry.cycleStart || entry.cycleStart < mutableFrom) continue;
    const cycle = desired.get(`${entry.contractLineKey}:${entry.cycleStart}`);
    const differs =
      !cycle ||
      entry.amountCents !== cycle.amountCents ||
      entry.dueDate !== cycle.dueDate ||
      entry.cycleEnd !== cycle.end ||
      entry.serviceNameSnapshot !== cycle.item.name ||
      entry.sellerId !== cycle.revision.sellerId ||
      entry.categoryId !== config.categoryId;
    if (!differs && !entry.cancelledAt) continue;
    if ((await amountsPaid(tx, entry.id)) > 0) {
      if (differs)
        warnings.push(
          `Cobrança de ${entry.cycleStart} já possui baixa e foi preservada.`,
        );
      continue;
    }
    if (!cycle) {
      if (!entry.cancelledAt) {
        await tx
          .update(schema.financeEntryTable)
          .set({
            cancelledAt: new Date(),
            cancelReason: "Alteração de vigência ou situação do contrato",
            version: entry.version + 1,
          })
          .where(eq(schema.financeEntryTable.id, entry.id));
        await log(tx, c, actor, "cobranca_cancelada", entry, { id: entry.id });
        cancelled++;
      }
      continue;
    }
    const patch = {
      amountCents: cycle.amountCents,
      dueDate: cycle.dueDate,
      cycleEnd: cycle.end,
      serviceId: cycle.item.serviceId,
      serviceNameSnapshot: cycle.item.name,
      sellerId: cycle.revision.sellerId,
      sellerNameSnapshot: cycle.revision.sellerName,
      billingRevisionId: cycle.revision.id,
      categoryId: config.categoryId,
      cancelledAt: null,
      cancelReason: null,
      version: entry.version + 1,
    };
    await tx
      .update(schema.financeEntryTable)
      .set(patch)
      .where(eq(schema.financeEntryTable.id, entry.id));
    await log(tx, c, actor, "cobranca_atualizada", entry, patch);
    updated++;
  }
  for (const cycle of planned) {
    if (cycle.start > through || existing.has(`${cycle.key}:${cycle.start}`))
      continue;
    const seriesId = `contract:${c.id}:${cycle.key}:${cycle.start}`;
    const [entry] = await tx
      .insert(schema.financeEntryTable)
      .values({
        workspaceId: c.workspaceId,
        description: `Contrato #${c.number} · ${cycle.item.name} · ${cycle.start}`,
        direction: "receivable",
        kind: "operating",
        amountCents: cycle.amountCents,
        competenceDate: cycle.start,
        dueDate: cycle.dueDate,
        categoryId: config.categoryId,
        partyName: company.name,
        companyId: c.companyId,
        serviceId: cycle.item.serviceId,
        sellerId: cycle.revision.sellerId,
        paymentMethod: company.paymentMethod ?? "pix",
        notes: `Período: ${cycle.start} a ${cycle.end}. Contrato: ${c.title}.`,
        seriesId,
        requestSignature: createHash("sha256")
          .update(`${c.id}:${cycle.key}:${cycle.start}`)
          .digest("hex"),
        installment: 1,
        installmentCount: 1,
        contractId: c.id,
        contractLineKey: cycle.key,
        cycleStart: cycle.start,
        cycleEnd: cycle.end,
        billingRevisionId: cycle.revision.id,
        serviceNameSnapshot: cycle.item.name,
        sellerNameSnapshot: cycle.revision.sellerName,
      })
      .onConflictDoNothing()
      .returning();
    if (entry) {
      await log(tx, c, actor, "cobranca_criada", null, entry);
      created++;
    }
  }
  const lastWarning = [...new Set(warnings)].join(" ") || null;
  await tx
    .update(schema.financeContractBillingTable)
    .set({ lastGeneratedAt: new Date(), lastWarning })
    .where(eq(schema.financeContractBillingTable.contractId, c.id));
  return {
    created,
    updated,
    cancelled,
    warnings: [...new Set(warnings)],
    through,
  };
}
/** Called in the SAME transaction as CRM changes; no asynchronous event can lose an invoice update. */
export async function syncContractBilling(
  tx: Tx,
  c: Contract,
  actor: string | null,
  at: Date,
) {
  const [config] = await tx
    .select()
    .from(schema.financeContractBillingTable)
    .where(eq(schema.financeContractBillingTable.contractId, c.id));
  if (!config) return;
  const effective = effectiveDay(at);
  if (effective < today())
    throw new HTTPException(409, {
      message:
        "Contrato integrado ao financeiro: use uma data de efeito a partir de hoje. Baixas e períodos anteriores são preservados.",
    });
  await appendRevision(tx, c, effective, actor, config);
  await reconcile(tx, c, actor, config, effective);
}
export type BillingConfigInput = {
  enabled: boolean;
  startsOn: string;
  horizonMonths: number;
  prorateFinal: boolean;
  categoryId: string | null;
  version: number;
};
export async function configureBilling(
  workspaceId: string,
  id: string,
  actor: string,
  input: BillingConfigInput,
) {
  return db.transaction(async (tx) => {
    const c = await lockContract(tx, workspaceId, id);
    if (c.currency !== "BRL")
      throw new HTTPException(400, {
        message: "A integração financeira desta etapa aceita contratos em BRL.",
      });
    if (input.startsOn < day(c.startsAt))
      throw new HTTPException(400, {
        message: "A geração não pode começar antes do contrato.",
      });
    const [old] = await tx
      .select()
      .from(schema.financeContractBillingTable)
      .where(eq(schema.financeContractBillingTable.contractId, id));
    if (!old && input.startsOn < today())
      throw new HTTPException(400, {
        message:
          "A primeira ativação deve começar hoje ou em uma data futura. Mantenha cobranças históricas no financeiro manual.",
      });
    if ((old && input.version !== old.version) || (!old && input.version !== 0))
      throw new HTTPException(409, {
        message: "Configuração alterada. Atualize a consulta.",
      });
    if (old && old.startsOn !== input.startsOn)
      throw new HTTPException(400, {
        message:
          "A data inicial fica fixa após a primeira configuração para preservar os ciclos.",
      });
    if (input.categoryId) {
      const [category] = await tx
        .select()
        .from(schema.financeCategoryTable)
        .where(
          and(
            eq(schema.financeCategoryTable.id, input.categoryId),
            eq(schema.financeCategoryTable.workspaceId, workspaceId),
          ),
        );
      if (!category?.isActive || category.direction !== "receivable")
        throw new HTTPException(400, {
          message: "Selecione uma categoria ativa de contas a receber.",
        });
    }
    const [config] = await tx
      .insert(schema.financeContractBillingTable)
      .values({
        ...input,
        contractId: id,
        workspaceId,
        version: (old?.version ?? 0) + 1,
      })
      .onConflictDoUpdate({
        target: schema.financeContractBillingTable.contractId,
        set: {
          enabled: input.enabled,
          horizonMonths: input.horizonMonths,
          prorateFinal: input.prorateFinal,
          categoryId: input.categoryId,
          version: (old?.version ?? 0) + 1,
        },
      })
      .returning();
    if (!config)
      throw new HTTPException(500, {
        message: "Falha ao salvar configuração.",
      });
    const revisions = await billingRevisions(tx, id);
    const effective = revisions.length ? today() : input.startsOn;
    await appendRevision(tx, c, effective, actor, config);
    await log(tx, c, actor, "configuracao", old ?? null, config);
    return {
      config,
      result: await reconcile(
        tx,
        c,
        actor,
        config,
        revisions.length ? today() : input.startsOn,
      ),
    };
  });
}
export async function generateContract(
  workspaceId: string,
  id: string,
  actor: string | null,
) {
  return db.transaction(async (tx) => {
    const c = await lockContract(tx, workspaceId, id);
    const [config] = await tx
      .select()
      .from(schema.financeContractBillingTable)
      .where(eq(schema.financeContractBillingTable.contractId, id));
    if (!config?.enabled)
      throw new HTTPException(409, {
        message: "Ative a geração financeira deste contrato.",
      });
    return reconcile(tx, c, actor, config);
  });
}
export async function renewContract(
  workspaceId: string,
  id: string,
  actor: string,
  endsOn: string,
  note: string,
) {
  return db.transaction(async (tx) => {
    const c = await lockContract(tx, workspaceId, id);
    if (c.status === "cancelled")
      throw new HTTPException(409, {
        message: "Contrato cancelado exige um novo contrato.",
      });
    if (endsOn <= today() || (c.endsAt && endsOn <= day(c.endsAt)))
      throw new HTTPException(400, {
        message: "A nova vigência deve ser posterior à atual e a hoje.",
      });
    const [latest] = await tx
      .select()
      .from(schema.crmContractEventTable)
      .where(eq(schema.crmContractEventTable.contractId, id))
      .orderBy(desc(schema.crmContractEventTable.occurredAt))
      .limit(1);
    if (
      latest &&
      (latest.type === "created"
        ? day(latest.occurredAt)
        : effectiveDay(latest.occurredAt)) > today()
    )
      throw new HTTPException(409, {
        message:
          "Existe uma alteração futura. Aguarde a data de efeito antes de renovar.",
      });
    const [renewed] = await tx
      .update(schema.crmContractTable)
      .set({
        endsAt: new Date(`${endsOn}T00:00:00Z`),
        status: c.status === "finished" ? "active" : c.status,
        endedAt: c.status === "finished" ? null : c.endedAt,
      })
      .where(eq(schema.crmContractTable.id, id))
      .returning();
    if (!renewed)
      throw new HTTPException(500, { message: "Falha ao renovar contrato." });
    if (c.status === "finished")
      await tx.insert(schema.crmContractEventTable).values({
        contractId: id,
        type: "resumed",
        fromMonthlyValueCents: 0,
        toMonthlyValueCents: c.monthlyValueCents,
        occurredAt: new Date(),
        changedByUserId: actor,
        note,
      });
    if (renewed.status === "active")
      await markCompanyActive(tx, renewed.companyId, new Date());
    await syncContractBilling(tx, renewed, actor, new Date());
    await log(tx, renewed, actor, "renovacao", c, { ...renewed, note });
    return renewed;
  });
}
export async function runContractBilling() {
  const configs = await db
    .select({
      id: schema.financeContractBillingTable.contractId,
      workspaceId: schema.financeContractBillingTable.workspaceId,
    })
    .from(schema.financeContractBillingTable)
    .where(eq(schema.financeContractBillingTable.enabled, true));
  let failed = 0;
  for (const config of configs) {
    try {
      await generateContract(config.workspaceId, config.id, null);
    } catch (error) {
      failed++;
      console.error("Contract billing failed", config.id, error);
      await db
        .update(schema.financeContractBillingTable)
        .set({
          lastWarning:
            "Falha na geração automática. Revise a configuração e tente gerar novamente.",
        })
        .where(eq(schema.financeContractBillingTable.contractId, config.id));
    }
  }
  return { processed: configs.length, failed };
}
