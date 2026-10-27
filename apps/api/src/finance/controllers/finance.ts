import { createHash } from "node:crypto";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db, { schema } from "../../database";
import {
  addMonths,
  cash,
  type Entry,
  type Filters,
  filterEntries,
  inPeriod,
  isCivilDate,
  reportBalance,
  type Settlement,
  status,
  today,
} from "../model";
import { commissionSnapshot } from "../performance/snapshot";
import type { EntryInput, SettleInput } from "../validation";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
function bad(message: string): never {
  throw new HTTPException(400, { message });
}
function conflict(message: string): never {
  throw new HTTPException(409, { message });
}
async function audit(
  tx: Tx,
  workspaceId: string,
  actorUserId: string,
  action: string,
  id: string,
  before: unknown,
  after: unknown,
  summary: string,
) {
  await tx.insert(schema.auditLogTable).values({
    workspaceId,
    actorUserId,
    action: `finance.${action}`,
    entityType: "finance",
    entityId: id,
    before,
    after,
    summary,
  });
}
async function entryForUpdate(tx: Tx, workspaceId: string, id: string) {
  const [entry] = await tx
    .select()
    .from(schema.financeEntryTable)
    .where(
      and(
        eq(schema.financeEntryTable.id, id),
        eq(schema.financeEntryTable.workspaceId, workspaceId),
      ),
    )
    .for("update");
  if (!entry)
    throw new HTTPException(404, { message: "Lançamento não encontrado." });
  return entry;
}
async function paid(tx: Tx, id: string) {
  const [row] = await tx
    .select({
      value: sql<string>`coalesce(sum(${schema.financeSettlementTable.principalCents}),0)`,
    })
    .from(schema.financeSettlementTable)
    .where(
      and(
        eq(schema.financeSettlementTable.entryId, id),
        sql`${schema.financeSettlementTable.reversedAt} is null`,
      ),
    );
  return Number(row?.value ?? 0);
}
async function references(
  tx: Tx,
  workspaceId: string,
  input: Pick<
    EntryInput,
    | "categoryId"
    | "partyId"
    | "companyId"
    | "serviceId"
    | "sellerId"
    | "direction"
    | "partyName"
  >,
) {
  const {
    financeCategoryTable: c,
    financePartyTable: p,
    crmCompanyTable: co,
    crmServiceTable: s,
    workspaceUserTable: u,
  } = schema;
  if (input.categoryId) {
    const [row] = await tx
      .select()
      .from(c)
      .where(and(eq(c.id, input.categoryId), eq(c.workspaceId, workspaceId)));
    if (!row?.isActive || row.direction !== input.direction)
      bad("Categoria inválida para este lançamento.");
  }
  let laborType: "pj" | "freelance" | "clt" | null = null;
  let partyName = input.partyName;
  if (input.partyId) {
    const [row] = await tx
      .select()
      .from(p)
      .where(and(eq(p.id, input.partyId), eq(p.workspaceId, workspaceId)));
    if (!row?.isActive) bad("Favorecido ou colaborador inválido.");
    laborType = row.laborType;
    partyName = row.name;
    if (laborType && input.direction !== "payable")
      bad("Vínculo de colaborador é exclusivo das contas a pagar.");
  }
  if (input.companyId) {
    const [row] = await tx
      .select({ id: co.id })
      .from(co)
      .where(and(eq(co.id, input.companyId), eq(co.workspaceId, workspaceId)));
    if (!row) bad("Cliente não pertence ao workspace.");
  }
  if (input.serviceId) {
    const [row] = await tx
      .select({ id: s.id })
      .from(s)
      .where(and(eq(s.id, input.serviceId), eq(s.workspaceId, workspaceId)));
    if (!row) bad("Serviço não pertence ao workspace.");
  }
  if (input.sellerId) {
    const [row] = await tx
      .select({ id: u.id })
      .from(u)
      .where(and(eq(u.userId, input.sellerId), eq(u.workspaceId, workspaceId)));
    if (!row) bad("Vendedor não pertence ao workspace.");
  }
  return { laborType, partyName };
}
export async function metadata(workspaceId: string) {
  const [categories, parties, companies, services, sellers, contracts] =
    await Promise.all([
      db
        .select()
        .from(schema.financeCategoryTable)
        .where(eq(schema.financeCategoryTable.workspaceId, workspaceId))
        .orderBy(asc(schema.financeCategoryTable.name)),
      db
        .select()
        .from(schema.financePartyTable)
        .where(eq(schema.financePartyTable.workspaceId, workspaceId))
        .orderBy(asc(schema.financePartyTable.name)),
      db
        .select({
          id: schema.crmCompanyTable.id,
          name: schema.crmCompanyTable.name,
        })
        .from(schema.crmCompanyTable)
        .where(eq(schema.crmCompanyTable.workspaceId, workspaceId))
        .orderBy(asc(schema.crmCompanyTable.name)),
      db
        .select({
          id: schema.crmServiceTable.id,
          name: schema.crmServiceTable.name,
        })
        .from(schema.crmServiceTable)
        .where(eq(schema.crmServiceTable.workspaceId, workspaceId))
        .orderBy(asc(schema.crmServiceTable.name)),
      db
        .select({ id: schema.userTable.id, name: schema.userTable.name })
        .from(schema.workspaceUserTable)
        .innerJoin(
          schema.userTable,
          eq(schema.userTable.id, schema.workspaceUserTable.userId),
        )
        .where(eq(schema.workspaceUserTable.workspaceId, workspaceId)),
      db
        .select({
          id: schema.crmContractTable.id,
          name: schema.crmContractTable.title,
        })
        .from(schema.crmContractTable)
        .where(eq(schema.crmContractTable.workspaceId, workspaceId)),
    ]);
  return { categories, parties, companies, services, sellers, contracts };
}
export async function saveCategory(
  workspaceId: string,
  actor: string,
  input: {
    name: string;
    direction: "payable" | "receivable";
    parentId: string | null;
    isActive: boolean;
  },
  id?: string,
) {
  return db.transaction(async (tx) => {
    let before = null;
    if (id) {
      [before] = await tx
        .select()
        .from(schema.financeCategoryTable)
        .where(
          and(
            eq(schema.financeCategoryTable.id, id),
            eq(schema.financeCategoryTable.workspaceId, workspaceId),
          ),
        )
        .for("update");
      if (!before)
        throw new HTTPException(404, { message: "Categoria não encontrada." });
      if (
        before.direction !== input.direction ||
        before.parentId !== input.parentId
      )
        bad("Tipo e hierarquia são imutáveis. Crie outra categoria.");
    }
    if (input.parentId) {
      const [parent] = await tx
        .select()
        .from(schema.financeCategoryTable)
        .where(
          and(
            eq(schema.financeCategoryTable.id, input.parentId),
            eq(schema.financeCategoryTable.workspaceId, workspaceId),
          ),
        );
      if (
        !parent?.isActive ||
        parent.parentId ||
        parent.direction !== input.direction ||
        parent.id === id
      )
        bad("Selecione uma categoria principal ativa do mesmo tipo.");
    }
    const [row] = id
      ? await tx
          .update(schema.financeCategoryTable)
          .set(input)
          .where(eq(schema.financeCategoryTable.id, id))
          .returning()
      : await tx
          .insert(schema.financeCategoryTable)
          .values({ ...input, workspaceId })
          .returning();
    await audit(
      tx,
      workspaceId,
      actor,
      "category",
      row?.id ?? "",
      before,
      row,
      "Cadastro de categoria financeira",
    );
    return row;
  });
}
export async function saveParty(
  workspaceId: string,
  actor: string,
  input: {
    name: string;
    laborType: "pj" | "freelance" | "clt" | null;
    isActive: boolean;
  },
  id?: string,
) {
  return db.transaction(async (tx) => {
    let before = null;
    if (id) {
      [before] = await tx
        .select()
        .from(schema.financePartyTable)
        .where(
          and(
            eq(schema.financePartyTable.id, id),
            eq(schema.financePartyTable.workspaceId, workspaceId),
          ),
        )
        .for("update");
      if (!before)
        throw new HTTPException(404, { message: "Favorecido não encontrado." });
    }
    const [row] = id
      ? await tx
          .update(schema.financePartyTable)
          .set(input)
          .where(eq(schema.financePartyTable.id, id))
          .returning()
      : await tx
          .insert(schema.financePartyTable)
          .values({ ...input, workspaceId })
          .returning();
    await audit(
      tx,
      workspaceId,
      actor,
      "party",
      row?.id ?? "",
      before,
      row,
      "Cadastro de favorecido ou colaborador",
    );
    return row;
  });
}
export async function createEntries(
  workspaceId: string,
  actor: string,
  input: EntryInput,
) {
  return db.transaction(async (tx) => {
    // Serializes retries of a batch without relying on an application-process lock.
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`${workspaceId}:${input.requestId}`},0))`,
    );
    const existing = await tx
      .select()
      .from(schema.financeEntryTable)
      .where(
        and(
          eq(schema.financeEntryTable.workspaceId, workspaceId),
          eq(schema.financeEntryTable.seriesId, input.requestId),
        ),
      );
    const signature = createHash("sha256")
      .update(JSON.stringify(input))
      .digest("hex");
    if (existing.length) {
      if (existing[0]?.requestSignature !== signature)
        conflict("A solicitação já foi utilizada com outros dados.");
      return existing;
    }
    const refs = await references(tx, workspaceId, input);
    const { requestId, count, intervalMonths, schedule, ...fields } = input;
    if (schedule === "installments" && input.amountCents < count)
      bad(
        "Valor insuficiente para dividir em parcelas de pelo menos um centavo.",
      );
    const rows = Array.from({ length: count }, (_, i) => ({
      ...fields,
      ...refs,
      workspaceId,
      seriesId: requestId,
      requestSignature: signature,
      installment: i + 1,
      installmentCount: count,
      amountCents:
        schedule === "recurring"
          ? input.amountCents
          : Math.floor(input.amountCents / count) +
            (i < input.amountCents % count ? 1 : 0),
      competenceDate: addMonths(input.competenceDate, i * intervalMonths),
      dueDate: addMonths(input.dueDate, i * intervalMonths),
    }));
    if (
      rows.some(
        (r) => !isCivilDate(r.dueDate) || !isCivilDate(r.competenceDate),
      )
    )
      bad("Cronograma excede o limite de datas.");
    const capturedRows = [];
    for (const row of rows)
      capturedRows.push({
        ...row,
        ...(await commissionSnapshot(tx, workspaceId, row)),
      });
    const result = await tx
      .insert(schema.financeEntryTable)
      .values(capturedRows)
      .returning();
    await audit(
      tx,
      workspaceId,
      actor,
      "created",
      requestId,
      null,
      result,
      "Criação de lançamentos financeiros",
    );
    return result;
  });
}
export async function updateEntry(
  workspaceId: string,
  actor: string,
  id: string,
  input: Omit<
    EntryInput,
    "requestId" | "count" | "intervalMonths" | "schedule"
  > & { version: number },
) {
  return db.transaction(async (tx) => {
    const before = await entryForUpdate(tx, workspaceId, id);
    const [payout] = await tx
      .select()
      .from(schema.financeCommissionPayoutTable)
      .where(eq(schema.financeCommissionPayoutTable.payableEntryId, id));
    if (payout)
      conflict(
        "Comissão gerada: cancele o título e gere novamente pela apuração para ajustar o valor.",
      );
    const [allocated] = await tx
      .select({ id: schema.financeCommissionPayoutTable.id })
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
          eq(schema.financeCommissionPayoutTable.sourceEntryId, id),
          sql`${schema.financeEntryTable.cancelledAt} is null`,
        ),
      )
      .limit(1);
    if (allocated)
      conflict(
        "Cobrança com comissão emitida. Confira e cancele os títulos de comissão antes de editar a origem.",
      );
    if (
      before.commissionRuleId &&
      (before.serviceId !== input.serviceId ||
        before.sellerId !== input.sellerId ||
        before.direction !== input.direction ||
        before.kind !== input.kind)
    )
      conflict(
        "Cobrança com regra de comissão registrada: preserve serviço, vendedor, tipo e natureza; cancele e recrie se necessário.",
      );
    if (before.contractId)
      conflict(
        "Cobrança gerenciada pelo contrato. Altere o contrato para ajustar os ciclos futuros.",
      );
    if (before.cancelledAt)
      conflict("Lançamento cancelado não pode ser editado.");
    if (before.version !== input.version)
      conflict("Lançamento alterado por outro usuário. Atualize a consulta.");
    if ((await paid(tx, id)) > 0)
      conflict("Estorne as baixas antes de editar o lançamento.");
    const refs = await references(tx, workspaceId, input);
    const [row] = await tx
      .update(schema.financeEntryTable)
      .set({ ...input, ...refs, version: before.version + 1 })
      .where(eq(schema.financeEntryTable.id, id))
      .returning();
    await audit(
      tx,
      workspaceId,
      actor,
      "updated",
      id,
      before,
      row,
      "Edição de lançamento financeiro",
    );
    return row;
  });
}
export async function settleEntry(
  workspaceId: string,
  actor: string,
  id: string,
  input: SettleInput,
) {
  return db.transaction(async (tx) => {
    const entry = await entryForUpdate(tx, workspaceId, id);
    const [existing] = await tx
      .select()
      .from(schema.financeSettlementTable)
      .where(
        and(
          eq(schema.financeSettlementTable.entryId, id),
          eq(schema.financeSettlementTable.requestId, input.requestId),
        ),
      );
    if (existing) {
      if (
        existing.date !== input.date ||
        existing.principalCents !== input.principalCents ||
        existing.discountCents !== input.discountCents ||
        existing.interestCents !== input.interestCents ||
        existing.fineCents !== input.fineCents ||
        existing.notes !== input.notes
      )
        conflict("Solicitação de baixa já utilizada com outros dados.");
      return existing;
    }
    if (entry.cancelledAt) conflict("Lançamento cancelado.");
    if (input.date > today()) bad("A data da baixa não pode estar no futuro.");
    const left = entry.amountCents - (await paid(tx, id));
    if (input.principalCents > left)
      conflict("A baixa ultrapassa o saldo em aberto.");
    if (input.discountCents > input.principalCents)
      bad("Desconto maior que o principal da baixa.");
    if (
      (input.discountCents || input.interestCents || input.fineCents) &&
      !input.notes.trim()
    )
      bad("Informe a justificativa dos ajustes.");
    const [row] = await tx
      .insert(schema.financeSettlementTable)
      .values({ ...input, entryId: id, actorUserId: actor })
      .returning();
    await tx
      .update(schema.financeEntryTable)
      .set({ version: entry.version + 1 })
      .where(eq(schema.financeEntryTable.id, id));
    await audit(
      tx,
      workspaceId,
      actor,
      "settled",
      id,
      null,
      row,
      "Baixa de lançamento financeiro",
    );
    return row;
  });
}
export async function reverseSettlement(
  workspaceId: string,
  actor: string,
  id: string,
  settlementId: string,
  reason: string,
) {
  return db.transaction(async (tx) => {
    const entry = await entryForUpdate(tx, workspaceId, id);
    const [before] = await tx
      .select()
      .from(schema.financeSettlementTable)
      .where(
        and(
          eq(schema.financeSettlementTable.id, settlementId),
          eq(schema.financeSettlementTable.entryId, id),
        ),
      );
    if (!before)
      throw new HTTPException(404, { message: "Baixa não encontrada." });
    if (before.reversedAt) conflict("Baixa já estornada.");
    const [row] = await tx
      .update(schema.financeSettlementTable)
      .set({ reversedAt: new Date(), reverseReason: reason, reversedBy: actor })
      .where(eq(schema.financeSettlementTable.id, settlementId))
      .returning();
    await tx
      .update(schema.financeEntryTable)
      .set({ version: entry.version + 1 })
      .where(eq(schema.financeEntryTable.id, id));
    await audit(
      tx,
      workspaceId,
      actor,
      "reversed",
      id,
      before,
      row,
      "Estorno de baixa financeira",
    );
    return row;
  });
}
export async function cancelEntry(
  workspaceId: string,
  actor: string,
  id: string,
  reason: string,
) {
  return db.transaction(async (tx) => {
    const before = await entryForUpdate(tx, workspaceId, id);
    if (before.contractId)
      conflict("Cancele ou ajuste a cobrança pelo contrato de origem.");
    if (before.cancelledAt) conflict("Lançamento já cancelado.");
    if ((await paid(tx, id)) > 0)
      conflict("Estorne as baixas antes de cancelar o lançamento.");
    const [row] = await tx
      .update(schema.financeEntryTable)
      .set({
        cancelledAt: new Date(),
        cancelReason: reason,
        version: before.version + 1,
      })
      .where(eq(schema.financeEntryTable.id, id))
      .returning();
    await audit(
      tx,
      workspaceId,
      actor,
      "cancelled",
      id,
      before,
      row,
      "Cancelamento de lançamento financeiro",
    );
    return row;
  });
}
export async function loadEntries(
  workspaceId: string,
  sellerId?: string,
): Promise<Entry[]> {
  const {
    financeEntryTable: e,
    financeCategoryTable: c,
    crmCompanyTable: co,
    crmServiceTable: sv,
    userTable: u,
  } = schema;
  const rows = await db
    .select({
      entry: e,
      categoryName: c.name,
      parentCategoryId: c.parentId,
      companyName: co.name,
      serviceName: sql<
        string | null
      >`coalesce(${e.serviceNameSnapshot}, ${sv.name})`,
      sellerName: sql<
        string | null
      >`coalesce(${e.sellerNameSnapshot}, ${u.name})`,
    })
    .from(e)
    .leftJoin(c, eq(c.id, e.categoryId))
    .leftJoin(co, eq(co.id, e.companyId))
    .leftJoin(sv, eq(sv.id, e.serviceId))
    .leftJoin(u, eq(u.id, e.sellerId))
    .where(
      sellerId
        ? and(eq(e.workspaceId, workspaceId), eq(e.sellerId, sellerId))
        : eq(e.workspaceId, workspaceId),
    )
    .orderBy(desc(e.dueDate), asc(e.id))
    .limit(50001);
  if (rows.length > 50000)
    throw new HTTPException(413, {
      message:
        "Mais de 50.000 lançamentos neste workspace. Solicite processamento de grande volume antes de continuar.",
    });
  if (!rows.length) return [];
  const payments = await db
    .select({ payment: schema.financeSettlementTable })
    .from(schema.financeSettlementTable)
    .innerJoin(e, eq(e.id, schema.financeSettlementTable.entryId))
    .where(
      sellerId
        ? and(eq(e.workspaceId, workspaceId), eq(e.sellerId, sellerId))
        : eq(e.workspaceId, workspaceId),
    );
  const byEntry = new Map<string, Settlement[]>();
  for (const { payment } of payments) {
    const values = byEntry.get(payment.entryId) ?? [];
    values.push(payment);
    byEntry.set(payment.entryId, values);
  }
  return rows.map(({ entry, ...rest }) => ({
    ...entry,
    ...rest,
    settlements: byEntry.get(entry.id) ?? [],
  }));
}
function sortEntries<T extends Entry>(items: T[], sort: Filters["sort"]) {
  if (!sort || sort === "due_desc") return items;
  const copy = [...items];
  if (sort === "due_asc")
    copy.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  else if (sort === "amount_asc")
    copy.sort((a, b) => a.amountCents - b.amountCents);
  else if (sort === "amount_desc")
    copy.sort((a, b) => b.amountCents - a.amountCents);
  else copy.sort((a, b) => a.description.localeCompare(b.description, "pt-BR"));
  return copy;
}
export function listEntries(entries: Entry[], filters: Filters, page: number) {
  const selected = sortEntries(filterEntries(entries, filters), filters.sort);
  const totals = selected.reduce(
    (t, e) => {
      if (!e.cancelledAt) {
        t.amountCents += e.amountCents;
        t.remainingCents += reportBalance(e, filters);
        for (const s of e.settlements.filter(
          (s) => !s.reversedAt && inPeriod(s.date, filters),
        )) {
          if (e.direction === "receivable") t.receivedCents += cash(s);
          else t.paidCents += cash(s);
        }
      }
      return t;
    },
    { amountCents: 0, remainingCents: 0, receivedCents: 0, paidCents: 0 },
  );
  return {
    items: selected.slice((page - 1) * 50, page * 50).map((e) => ({
      ...e,
      reportBalanceCents: e.cancelledAt ? 0 : reportBalance(e, filters),
      reportStatus: status(
        e,
        filters.view ? (filters.asOf ?? today()) : undefined,
      ),
    })),
    total: selected.length,
    page,
    pageSize: 50,
    totals,
  };
}
export async function history(workspaceId: string, id: string) {
  const [entry] = await db
    .select({ id: schema.financeEntryTable.id })
    .from(schema.financeEntryTable)
    .where(
      and(
        eq(schema.financeEntryTable.id, id),
        eq(schema.financeEntryTable.workspaceId, workspaceId),
      ),
    );
  if (!entry)
    throw new HTTPException(404, { message: "Lançamento não encontrado." });
  return db
    .select({
      id: schema.auditLogTable.id,
      action: schema.auditLogTable.action,
      summary: schema.auditLogTable.summary,
      before: schema.auditLogTable.before,
      after: schema.auditLogTable.after,
      createdAt: schema.auditLogTable.createdAt,
      actor: schema.userTable.name,
    })
    .from(schema.auditLogTable)
    .leftJoin(
      schema.userTable,
      eq(schema.userTable.id, schema.auditLogTable.actorUserId),
    )
    .where(
      and(
        eq(schema.auditLogTable.workspaceId, workspaceId),
        sql`(${schema.auditLogTable.entityId} = ${id} or ${schema.auditLogTable.entityId} = (select series_id from finance_entry where id = ${id} and workspace_id = ${workspaceId}))`,
      ),
    )
    .orderBy(desc(schema.auditLogTable.createdAt));
}
