import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db, { schema as s } from "../../database";
import {
  metadata as financeMetadata,
  loadEntries,
} from "../controllers/finance";
import { remaining, today } from "../model";
import { performanceReport } from "../performance/model";
import type { Tx } from "../performance/snapshot";
import { recurrenceReport } from "../recurrence/model";
import { loadPortfolio } from "../recurrence/report";
import { plusDays, revisionAt } from "../recurrence/schedule";
import { closedSeconds, profitability } from "./model";
import type {
  CaseInput,
  DraftInput,
  Range,
  RateInput,
  SiteInput,
  Source,
  TaskInput,
  WorkerInput,
} from "./validation";
export function fail(
  status: 400 | 403 | 404 | 409 | 413,
  message: string,
): never {
  throw new HTTPException(status, { message });
}
export async function audit(
  tx: Tx,
  workspaceId: string,
  actor: string,
  id: string,
  action: string,
  before: unknown,
  after: unknown,
) {
  await tx.insert(s.auditLogTable).values({
    workspaceId,
    actorUserId: actor,
    entityType: "finance_portfolio",
    entityId: id,
    action: `portfolio.${action}`,
    summary: `Gestão da carteira: ${action}`,
    before,
    after,
  });
}
export async function member(tx: Tx, workspaceId: string, id: string | null) {
  if (!id) return;
  const [m] = await tx
    .select({ id: s.workspaceUserTable.id })
    .from(s.workspaceUserTable)
    .where(
      and(
        eq(s.workspaceUserTable.workspaceId, workspaceId),
        eq(s.workspaceUserTable.userId, id),
      ),
    );
  if (!m) fail(400, "Colaborador não pertence ao workspace.");
}
async function company(tx: Tx, workspaceId: string, id: string) {
  const [c] = await tx
    .select()
    .from(s.crmCompanyTable)
    .where(
      and(
        eq(s.crmCompanyTable.id, id),
        eq(s.crmCompanyTable.workspaceId, workspaceId),
      ),
    );
  if (!c) fail(404, "Cliente não encontrado.");
  return c;
}
async function contract(
  tx: Tx,
  workspaceId: string,
  id: string | null,
  companyId: string,
) {
  if (!id) return;
  const [c] = await tx
    .select()
    .from(s.crmContractTable)
    .where(
      and(
        eq(s.crmContractTable.id, id),
        eq(s.crmContractTable.workspaceId, workspaceId),
        eq(s.crmContractTable.companyId, companyId),
      ),
    );
  if (!c) fail(400, "Contrato não pertence ao cliente/workspace.");
}
export async function site(tx: Tx, workspaceId: string, id: string) {
  const [r] = await tx
    .select()
    .from(s.financeSiteTable)
    .where(
      and(
        eq(s.financeSiteTable.id, id),
        eq(s.financeSiteTable.workspaceId, workspaceId),
      ),
    )
    .for("update");
  if (!r) fail(404, "Projeto de site não encontrado.");
  return r;
}
export async function load(workspaceId: string) {
  const entries = await loadEntries(workspaceId);
  const [
    companies,
    cases,
    sites,
    workers,
    taskLinks,
    links,
    times,
    rates,
    users,
    payouts,
    hostings,
    drafts,
  ] = await Promise.all([
    db
      .select()
      .from(s.crmCompanyTable)
      .where(eq(s.crmCompanyTable.workspaceId, workspaceId))
      .limit(10001),
    db
      .select()
      .from(s.portfolioCaseTable)
      .where(eq(s.portfolioCaseTable.workspaceId, workspaceId))
      .limit(20001),
    db
      .select()
      .from(s.financeSiteTable)
      .where(eq(s.financeSiteTable.workspaceId, workspaceId))
      .limit(2001),
    db
      .select({ worker: s.financeSiteWorkerTable })
      .from(s.financeSiteWorkerTable)
      .innerJoin(
        s.financeSiteTable,
        eq(s.financeSiteTable.id, s.financeSiteWorkerTable.siteId),
      )
      .where(eq(s.financeSiteTable.workspaceId, workspaceId)),
    db
      .select({
        link: s.financeSiteTaskTable,
        title: s.taskTable.title,
        projectId: s.taskTable.projectId,
        assigneeId: s.taskTable.userId,
      })
      .from(s.financeSiteTaskTable)
      .innerJoin(s.taskTable, eq(s.taskTable.id, s.financeSiteTaskTable.taskId))
      .innerJoin(
        s.financeSiteTable,
        eq(s.financeSiteTable.id, s.financeSiteTaskTable.siteId),
      )
      .where(eq(s.financeSiteTable.workspaceId, workspaceId))
      .limit(20001),
    db
      .select({ link: s.financeSiteEntryTable })
      .from(s.financeSiteEntryTable)
      .innerJoin(
        s.financeSiteTable,
        eq(s.financeSiteTable.id, s.financeSiteEntryTable.siteId),
      )
      .where(eq(s.financeSiteTable.workspaceId, workspaceId)),
    db
      .select({ time: s.timeEntryTable })
      .from(s.timeEntryTable)
      .innerJoin(
        s.financeSiteTaskTable,
        eq(s.financeSiteTaskTable.taskId, s.timeEntryTable.taskId),
      )
      .innerJoin(
        s.financeSiteTable,
        eq(s.financeSiteTable.id, s.financeSiteTaskTable.siteId),
      )
      .where(eq(s.financeSiteTable.workspaceId, workspaceId))
      .limit(100001),
    db
      .select()
      .from(s.financeLaborRateTable)
      .where(eq(s.financeLaborRateTable.workspaceId, workspaceId))
      .limit(20001),
    db
      .select({ id: s.userTable.id, name: s.userTable.name })
      .from(s.workspaceUserTable)
      .innerJoin(s.userTable, eq(s.userTable.id, s.workspaceUserTable.userId))
      .where(eq(s.workspaceUserTable.workspaceId, workspaceId)),
    db
      .select()
      .from(s.financeCommissionPayoutTable)
      .where(eq(s.financeCommissionPayoutTable.workspaceId, workspaceId)),
    db
      .select({ hosting: s.crmHostingTable })
      .from(s.crmHostingTable)
      .innerJoin(
        s.crmCompanyTable,
        eq(s.crmCompanyTable.id, s.crmHostingTable.companyId),
      )
      .where(eq(s.crmCompanyTable.workspaceId, workspaceId)),
    db
      .select()
      .from(s.portfolioDraftTable)
      .where(eq(s.portfolioDraftTable.workspaceId, workspaceId))
      .orderBy(desc(s.portfolioDraftTable.updatedAt))
      .limit(5001),
  ]);
  if (
    companies.length > 10000 ||
    cases.length > 20000 ||
    sites.length > 2000 ||
    taskLinks.length > 20000 ||
    times.length > 100000 ||
    rates.length > 20000 ||
    drafts.length > 5000
  )
    fail(
      413,
      "Volume acima do limite da carteira. Solicite processamento em lote.",
    );
  const portfolio = await loadPortfolio(workspaceId, entries);
  return {
    entries,
    companies,
    cases,
    sites,
    workers: workers.map((x) => x.worker),
    tasks: taskLinks.map((x) => ({
      ...x.link,
      title: x.title,
      projectId: x.projectId,
      assigneeId: x.assigneeId,
    })),
    links: links.map((x) => x.link),
    times: times.map((x) => x.time),
    rates,
    users,
    payouts,
    hostings: hostings.map((x) => x.hosting),
    drafts,
    portfolio,
  };
}
export type Data = Awaited<ReturnType<typeof load>>;
export function sources(d: Data) {
  const ref = today();
  const companies = new Map(d.companies.map((c) => [c.id, c]));
  const invoices = d.entries
    .filter(
      (e) =>
        !e.cancelledAt &&
        e.direction === "receivable" &&
        e.kind === "operating" &&
        remaining(e, ref) > 0,
    )
    .map((e) => ({
      sourceKind: "receivable" as const,
      sourceId: e.id,
      sourceDate: e.dueDate,
      companyId: e.companyId,
      companyName: e.companyName ?? "Sem cliente vinculado",
      title: e.description,
      amountCents: remaining(e, ref),
    }));
  const r = recurrenceReport(d.portfolio, { from: ref, to: ref });
  const contracts = r.rows
    .filter((c) => {
      const original = d.portfolio.find((p) => p.id === c.id);
      const activeStatus = original
        ? (revisionAt(original.revisions, ref)?.status ?? original.status)
        : c.status;
      return activeStatus === "active" && c.endsOn;
    })
    .map((c) => ({
      sourceKind: "contract" as const,
      sourceId: c.id,
      sourceDate: c.endsOn ?? ref,
      companyId: c.companyId,
      companyName: c.companyName,
      title: `Contrato ${c.number} · ${c.title}`,
      amountCents: c.monthlyValueCents,
    }));
  const hostings = d.hostings
    .filter(
      (h) =>
        h.mode === "third_party" &&
        h.renewsOn &&
        companies.get(h.companyId)?.status === "active" &&
        !companies.get(h.companyId)?.archivedAt,
    )
    .map((h) => ({
      sourceKind: "hosting" as const,
      sourceId: h.companyId,
      sourceDate: h.renewsOn ?? ref,
      companyId: h.companyId,
      companyName: companies.get(h.companyId)?.name ?? "Cliente",
      title: `Hospedagem · ${h.domain || h.provider || "Terceiros"}`,
      amountCents: 0,
    }));
  return [...invoices, ...contracts, ...hostings];
}
const sourceKey = (r: Source) =>
  `${r.sourceKind}:${r.sourceId}:${r.sourceDate}`;
export function assemble(d: Data, f: Range, includeTasks = false) {
  const saved = new Map(d.cases.map((c) => [sourceKey(c), c]));
  const ref = today();
  const queue = sources(d)
    .filter((r) => r.sourceDate <= plusDays(ref, Number(f.horizon)))
    .map((r) => {
      const follow = saved.get(sourceKey(r)) ?? null;
      return {
        ...r,
        id: follow?.id ?? null,
        follow,
        resolved: false,
        status: follow?.status ?? "open",
        late: r.sourceDate < ref,
        brokenPromise: Boolean(
          follow?.status === "promised" &&
            follow.promiseOn &&
            follow.promiseOn < ref,
        ),
        actionLate: Boolean(
          follow?.nextOn && follow.nextOn < ref && follow.status !== "done",
        ),
      };
    })
    .filter(
      (r) =>
        (!f.companyId || r.companyId === f.companyId) &&
        (!f.kind || r.sourceKind === f.kind) &&
        (!f.ownerId || r.follow?.ownerUserId === f.ownerId) &&
        (!f.status || r.status === f.status),
    )
    .sort(
      (a, b) =>
        a.sourceDate.localeCompare(b.sourceDate) ||
        a.title.localeCompare(b.title),
    );
  const profit = profitability(d, f);
  const selected = d.entries.filter(
    (e) => !f.companyId || e.companyId === f.companyId,
  );
  const performance = performanceReport(selected, d.payouts, f, null);
  const actualSources = new Map(sources(d).map((r) => [sourceKey(r), r]));
  const caseHistory = d.cases
    .filter(
      (c) =>
        (!f.companyId || c.companyId === f.companyId) &&
        (!f.ownerId || c.ownerUserId === f.ownerId) &&
        (!f.kind || c.sourceKind === f.kind) &&
        (!f.status || c.status === f.status),
    )
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
    .map((c) => {
      const current = actualSources.get(sourceKey(c));
      return {
        ...(current ?? {
          sourceKind: c.sourceKind,
          sourceId: c.sourceId,
          sourceDate: c.sourceDate,
          companyId: c.companyId,
          companyName:
            d.companies.find((co) => co.id === c.companyId)?.name ?? "Cliente",
          title: "Acompanhamento histórico",
          amountCents: 0,
        }),
        id: c.id,
        follow: c,
        status: c.status,
        late: c.sourceDate < ref,
        brokenPromise: false,
        actionLate: false,
        resolved: !current,
      };
    });
  const alerts = [
    ...queue
      .filter((r) => r.brokenPromise)
      .map((r) => ({
        key: sourceKey(r),
        label: `Promessa vencida: ${r.companyName}`,
        value: r.amountCents,
      })),
    ...profit.companies
      .filter((c) => c.resultCents < 0)
      .map((c) => ({
        key: c.id,
        label: `Resultado negativo: ${c.name}`,
        value: c.resultCents,
      })),
  ];
  return {
    referenceDate: ref,
    filters: f,
    queue,
    caseHistory,
    companies: profit.companies,
    sites: profit.sites.map((s) => ({
      ...s,
      taskCount: s.tasks.length,
      tasks: includeTasks ? s.tasks : [],
    })),
    unassignedExpenseCents: profit.unassignedExpenseCents,
    previousPeriod: performance.previousPeriod,
    current: performance.current,
    previous: performance.previous,
    months: performance.months,
    summary: {
      overdueCents: queue
        .filter((r) => r.sourceKind === "receivable" && r.late)
        .reduce((a, r) => a + r.amountCents, 0),
      receivableCount: queue.filter((r) => r.sourceKind === "receivable")
        .length,
      renewals: queue.filter((r) => r.sourceKind !== "receivable").length,
      brokenPromises: queue.filter((r) => r.brokenPromise).length,
      lowMarginClients: profit.companies.filter((c) => c.resultCents < 0)
        .length,
      missingSeconds: profit.companies.reduce(
        (s, c) => s + c.missingSeconds,
        0,
      ),
    },
    alerts,
    drafts: d.drafts.filter((r) => !f.companyId || r.companyId === f.companyId),
    generatedAt: new Date().toISOString(),
  };
}
export async function report(
  workspaceId: string,
  f: Range,
  includeTasks = false,
) {
  return assemble(await load(workspaceId), f, includeTasks);
}
export async function metadata(workspaceId: string) {
  return {
    ...(await financeMetadata(workspaceId)),
    members: await loadMembers(workspaceId),
    rates: await db
      .select()
      .from(s.financeLaborRateTable)
      .where(eq(s.financeLaborRateTable.workspaceId, workspaceId))
      .orderBy(desc(s.financeLaborRateTable.effectiveOn)),
    sites: await db
      .select({
        id: s.financeSiteTable.id,
        name: s.financeSiteTable.name,
        companyId: s.financeSiteTable.companyId,
      })
      .from(s.financeSiteTable)
      .where(eq(s.financeSiteTable.workspaceId, workspaceId)),
  };
}
async function loadMembers(workspaceId: string) {
  return db
    .select({ id: s.userTable.id, name: s.userTable.name })
    .from(s.workspaceUserTable)
    .innerJoin(s.userTable, eq(s.userTable.id, s.workspaceUserTable.userId))
    .where(eq(s.workspaceUserTable.workspaceId, workspaceId));
}
export async function saveCase(
  workspaceId: string,
  actor: string,
  input: CaseInput,
) {
  const d = await load(workspaceId);
  const src = sources(d).find((r) => sourceKey(r) === sourceKey(input));
  if (!src)
    fail(409, "A obrigação mudou ou já foi resolvida. Atualize a fila.");
  if (
    input.status === "promised" &&
    (!input.promiseOn ||
      !input.promiseCents ||
      input.sourceKind !== "receivable" ||
      input.promiseCents > src.amountCents)
  )
    fail(400, "Promessa exige cobrança, data e valor positivo até o saldo.");
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${workspaceId + sourceKey(input)}))`,
    );
    await member(tx, workspaceId, input.ownerUserId);
    const [before] = await tx
      .select()
      .from(s.portfolioCaseTable)
      .where(
        and(
          eq(s.portfolioCaseTable.workspaceId, workspaceId),
          eq(s.portfolioCaseTable.sourceKind, input.sourceKind),
          eq(s.portfolioCaseTable.sourceId, input.sourceId),
          eq(s.portfolioCaseTable.sourceDate, input.sourceDate),
        ),
      )
      .for("update");
    if ((before?.version ?? 0) !== input.version)
      fail(409, "Acompanhamento alterado. Atualize a tela.");
    const { note, version, ...fields } = input;
    const values = {
      ...fields,
      companyId: src.companyId,
      version: version + 1,
    };
    const [row] = before
      ? await tx
          .update(s.portfolioCaseTable)
          .set(values)
          .where(eq(s.portfolioCaseTable.id, before.id))
          .returning()
      : await tx
          .insert(s.portfolioCaseTable)
          .values({ ...values, workspaceId })
          .returning();
    if (!row) throw Error("Falha ao salvar acompanhamento");
    await tx.insert(s.portfolioEventTable).values({
      caseId: row.id,
      actorUserId: actor,
      note,
      snapshot: { ...values },
    });
    await audit(tx, workspaceId, actor, row.id, "case", before, row);
    return row;
  });
}
export async function caseDetail(workspaceId: string, id: string) {
  const [row] = await db
    .select()
    .from(s.portfolioCaseTable)
    .where(
      and(
        eq(s.portfolioCaseTable.workspaceId, workspaceId),
        eq(s.portfolioCaseTable.id, id),
      ),
    );
  if (!row) fail(404, "Acompanhamento não encontrado.");
  const [events, notices, contacts] = await Promise.all([
    db
      .select()
      .from(s.portfolioEventTable)
      .where(eq(s.portfolioEventTable.caseId, id))
      .orderBy(desc(s.portfolioEventTable.createdAt))
      .limit(100),
    db
      .select()
      .from(s.portfolioNoticeTable)
      .where(eq(s.portfolioNoticeTable.caseId, id))
      .orderBy(desc(s.portfolioNoticeTable.createdAt))
      .limit(100),
    row.companyId
      ? db
          .select()
          .from(s.crmContactTable)
          .where(
            and(
              eq(s.crmContactTable.workspaceId, workspaceId),
              eq(s.crmContactTable.companyId, row.companyId),
              isNull(s.crmContactTable.archivedAt),
            ),
          )
      : [],
  ]);
  return { case: row, events, notices, contacts };
}
export async function saveSite(
  workspaceId: string,
  actor: string,
  input: SiteInput,
  id?: string,
) {
  return db.transaction(async (tx) => {
    await company(tx, workspaceId, input.companyId);
    await contract(tx, workspaceId, input.contractId, input.companyId);
    const before = id ? await site(tx, workspaceId, id) : null;
    if ((before?.version ?? 0) !== input.version)
      fail(409, "Projeto alterado.");
    if (before && before.companyId !== input.companyId)
      fail(400, "Cliente do projeto não pode ser trocado; crie outro projeto.");
    const { version, ...values } = input;
    const [r] = before
      ? await tx
          .update(s.financeSiteTable)
          .set({ ...values, version: version + 1 })
          .where(eq(s.financeSiteTable.id, before.id))
          .returning()
      : await tx
          .insert(s.financeSiteTable)
          .values({ ...values, workspaceId })
          .returning();
    if (!r) throw Error("Falha ao salvar site");
    await audit(tx, workspaceId, actor, r.id, "site", before, r);
    return r;
  });
}
export async function saveRate(
  workspaceId: string,
  actor: string,
  input: RateInput,
) {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${workspaceId + input.userId}))`,
    );
    await member(tx, workspaceId, input.userId);
    const [last] = await tx
      .select()
      .from(s.financeLaborRateTable)
      .where(
        and(
          eq(s.financeLaborRateTable.workspaceId, workspaceId),
          eq(s.financeLaborRateTable.userId, input.userId),
        ),
      )
      .orderBy(desc(s.financeLaborRateTable.effectiveOn))
      .limit(1);
    if (
      last &&
      (input.effectiveOn <= last.effectiveOn || input.effectiveOn < today())
    )
      fail(
        400,
        "Nova vigência deve ser posterior à última e não retroativa. A primeira taxa pode informar a vigência histórica inicial.",
      );
    const [r] = await tx
      .insert(s.financeLaborRateTable)
      .values({ ...input, workspaceId })
      .returning();
    if (!r) throw Error("Falha na taxa");
    await audit(tx, workspaceId, actor, r.id, "rate", null, r);
    return r;
  });
}
async function entry(
  tx: Tx,
  workspaceId: string,
  id: string,
  companyId: string,
) {
  const [e] = await tx
    .select()
    .from(s.financeEntryTable)
    .where(
      and(
        eq(s.financeEntryTable.workspaceId, workspaceId),
        eq(s.financeEntryTable.id, id),
      ),
    )
    .for("update");
  if (
    !e ||
    e.companyId !== companyId ||
    e.kind !== "operating" ||
    e.cancelledAt
  )
    fail(
      400,
      "Lançamento deve estar ativo, ser operacional e pertencer ao cliente/workspace.",
    );
  return e;
}
async function linkEntry(tx: Tx, siteId: string, entryId: string) {
  const [old] = await tx
    .select()
    .from(s.financeSiteEntryTable)
    .where(eq(s.financeSiteEntryTable.entryId, entryId));
  if (old && old.siteId !== siteId)
    fail(409, "Lançamento já vinculado a outro projeto.");
  if (!old)
    await tx.insert(s.financeSiteEntryTable).values({ siteId, entryId });
}
export async function saveWorker(
  workspaceId: string,
  actor: string,
  siteId: string,
  input: WorkerInput,
) {
  return db.transaction(async (tx) => {
    const project = await site(tx, workspaceId, siteId);
    await member(tx, workspaceId, input.userId);
    if (input.mode === "ledger" && !input.sourceEntryId)
      fail(400, "Custo já lançado exige uma conta a pagar de origem.");
    if (input.sourceEntryId) {
      const e = await entry(
        tx,
        workspaceId,
        input.sourceEntryId,
        project.companyId,
      );
      if (e.direction !== "payable")
        fail(400, "Origem do custo deve ser uma conta a pagar.");
      const [used] = await tx
        .select()
        .from(s.financeSiteWorkerTable)
        .where(eq(s.financeSiteWorkerTable.sourceEntryId, input.sourceEntryId));
      if (used && (used.siteId !== siteId || used.userId !== input.userId))
        fail(409, "Essa despesa já foi atribuída a outro colaborador.");
      await linkEntry(tx, siteId, input.sourceEntryId);
    }
    const [before] = await tx
      .select()
      .from(s.financeSiteWorkerTable)
      .where(
        and(
          eq(s.financeSiteWorkerTable.siteId, siteId),
          eq(s.financeSiteWorkerTable.userId, input.userId),
        ),
      )
      .for("update");
    if ((before?.version ?? 0) !== input.version) fail(409, "Acordo alterado.");
    const { version, ...values } = input;
    const [r] = before
      ? await tx
          .update(s.financeSiteWorkerTable)
          .set({ ...values, version: version + 1 })
          .where(eq(s.financeSiteWorkerTable.id, before.id))
          .returning()
      : await tx
          .insert(s.financeSiteWorkerTable)
          .values({ ...values, siteId })
          .returning();
    if (!r) throw Error("Falha no acordo");
    await audit(tx, workspaceId, actor, r.id, "worker", before, r);
    return r;
  });
}
export async function attachEntry(
  workspaceId: string,
  actor: string,
  siteId: string,
  entryId: string,
) {
  return db.transaction(async (tx) => {
    const project = await site(tx, workspaceId, siteId);
    await entry(tx, workspaceId, entryId, project.companyId);
    await linkEntry(tx, siteId, entryId);
    await audit(tx, workspaceId, actor, siteId, "entry-link", null, {
      entryId,
    });
    return { success: true };
  });
}
export async function attachTask(
  workspaceId: string,
  actor: string,
  input: TaskInput,
) {
  return db.transaction(async (tx) => {
    const project = await site(tx, workspaceId, input.siteId);
    const [task] = await tx
      .select({ task: s.taskTable, workspaceId: s.projectTable.workspaceId })
      .from(s.taskTable)
      .innerJoin(s.projectTable, eq(s.projectTable.id, s.taskTable.projectId))
      .where(eq(s.taskTable.id, input.taskId))
      .for("update", { of: s.taskTable });
    if (
      !task ||
      task.workspaceId !== workspaceId ||
      !task.task.crmCompanyId ||
      task.task.crmCompanyId !== project.companyId
    )
      fail(
        400,
        "A tarefa precisa estar vinculada ao mesmo cliente do site, no mesmo workspace.",
      );
    const [before] = await tx
      .select()
      .from(s.financeSiteTaskTable)
      .where(eq(s.financeSiteTaskTable.taskId, input.taskId))
      .for("update");
    if ((before?.version ?? 0) !== input.version)
      fail(409, "Planejamento alterado.");
    if (before && before.siteId !== input.siteId)
      fail(
        400,
        "Tarefa já tem projeto de site; preserve o histórico e crie outra tarefa.",
      );
    const [r] = before
      ? await tx
          .update(s.financeSiteTaskTable)
          .set({
            estimateMinutes: input.estimateMinutes,
            version: input.version + 1,
          })
          .where(eq(s.financeSiteTaskTable.taskId, input.taskId))
          .returning()
      : await tx
          .insert(s.financeSiteTaskTable)
          .values({
            taskId: input.taskId,
            siteId: input.siteId,
            estimateMinutes: input.estimateMinutes,
          })
          .returning();
    await audit(tx, workspaceId, actor, input.taskId, "task-plan", before, r);
    return r;
  });
}
export async function saveDraft(
  workspaceId: string,
  actor: string,
  input: DraftInput,
  id?: string,
) {
  return db.transaction(async (tx) => {
    await company(tx, workspaceId, input.companyId);
    await contract(tx, workspaceId, input.contractId, input.companyId);
    let before: typeof s.portfolioDraftTable.$inferSelect | undefined;
    if (id) {
      [before] = await tx
        .select()
        .from(s.portfolioDraftTable)
        .where(
          and(
            eq(s.portfolioDraftTable.id, id),
            eq(s.portfolioDraftTable.workspaceId, workspaceId),
          ),
        )
        .for("update");
      if (!before) fail(404, "Minuta não encontrada.");
      if (before.status === "approved")
        fail(
          409,
          "Minuta aprovada é imutável. Crie uma nova versão como outra minuta.",
        );
    }
    if ((before?.version ?? 0) !== input.version) fail(409, "Minuta alterada.");
    const { version, ...values } = input;
    const [r] = before
      ? await tx
          .update(s.portfolioDraftTable)
          .set({
            ...values,
            version: version + 1,
            decision: "",
            approvedBy: null,
          })
          .where(eq(s.portfolioDraftTable.id, before.id))
          .returning()
      : await tx
          .insert(s.portfolioDraftTable)
          .values({ ...values, workspaceId })
          .returning();
    if (!r) throw Error("Falha na minuta");
    await audit(tx, workspaceId, actor, r.id, "draft", before, r);
    return r;
  });
}
export async function decideDraft(
  workspaceId: string,
  actor: string,
  id: string,
  version: number,
  status: "approved" | "rejected",
  decision: string,
) {
  return db.transaction(async (tx) => {
    const [before] = await tx
      .select()
      .from(s.portfolioDraftTable)
      .where(
        and(
          eq(s.portfolioDraftTable.id, id),
          eq(s.portfolioDraftTable.workspaceId, workspaceId),
        ),
      )
      .for("update");
    if (!before) fail(404, "Minuta não encontrada.");
    if (before.version !== version || before.status !== "submitted")
      fail(409, "Minuta precisa estar submetida e atualizada.");
    const [r] = await tx
      .update(s.portfolioDraftTable)
      .set({ status, decision, approvedBy: actor, version: version + 1 })
      .where(eq(s.portfolioDraftTable.id, id))
      .returning();
    await audit(tx, workspaceId, actor, id, "draft-decision", before, r);
    return r;
  });
}
export async function workSummary(workspaceId: string, projectId: string) {
  const tasks = await db
    .select({
      link: s.financeSiteTaskTable,
      name: s.financeSiteTable.name,
      assigneeId: s.taskTable.userId,
    })
    .from(s.financeSiteTaskTable)
    .innerJoin(
      s.financeSiteTable,
      eq(s.financeSiteTable.id, s.financeSiteTaskTable.siteId),
    )
    .innerJoin(s.taskTable, eq(s.taskTable.id, s.financeSiteTaskTable.taskId))
    .where(
      and(
        eq(s.financeSiteTable.workspaceId, workspaceId),
        eq(s.taskTable.projectId, projectId),
      ),
    )
    .limit(10001);
  if (tasks.length > 10000)
    fail(413, "Quadro excede o limite de tarefas acompanhadas.");
  const ids = tasks.map((t) => t.link.taskId);
  const times = ids.length
    ? await db
        .select()
        .from(s.timeEntryTable)
        .where(inArray(s.timeEntryTable.taskId, ids))
    : [];
  return tasks.map(({ link, name, assigneeId }) => ({
    ...link,
    name,
    assigneeId,
    seconds: times
      .filter((t) => t.taskId === link.taskId)
      .reduce((a, t) => a + closedSeconds(t), 0),
    running: times.filter((t) => t.taskId === link.taskId && !t.endTime).length,
    contributors: [
      ...new Set(
        times.filter((t) => t.taskId === link.taskId).map((t) => t.userId),
      ),
    ].map((userId) => ({
      userId,
      seconds: times
        .filter((t) => t.taskId === link.taskId && t.userId === userId)
        .reduce((a, t) => a + closedSeconds(t), 0),
    })),
  }));
}
export async function taskOptions(workspaceId: string, taskId: string) {
  const [t] = await db
    .select({
      companyId: s.taskTable.crmCompanyId,
      projectId: s.taskTable.projectId,
    })
    .from(s.taskTable)
    .where(eq(s.taskTable.id, taskId));
  const sites = t?.companyId
    ? await db
        .select({ id: s.financeSiteTable.id, name: s.financeSiteTable.name })
        .from(s.financeSiteTable)
        .where(
          and(
            eq(s.financeSiteTable.workspaceId, workspaceId),
            eq(s.financeSiteTable.companyId, t.companyId),
            eq(s.financeSiteTable.status, "active"),
          ),
        )
    : [];
  const [link] = await db
    .select()
    .from(s.financeSiteTaskTable)
    .where(eq(s.financeSiteTaskTable.taskId, taskId));
  return { companyId: t?.companyId ?? null, sites, link: link ?? null };
}
