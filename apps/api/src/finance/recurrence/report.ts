export { recurrenceReport } from "./model";

import { asc, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db, { schema } from "../../database";
import { loadEntries } from "../controllers/finance";
import type { Entry } from "../model";
import { day } from "./schedule";
export type RecurrenceFilters = {
  from: string;
  to: string;
  companyId?: string;
  sellerId?: string;
  serviceId?: string;
  contractId?: string;
  status?: "active" | "paused" | "cancelled" | "finished" | "not_started";
  billingType?: "monthly" | "quarterly" | "yearly";
  dateField?: "start" | "end";
  expiresWithin?: "30" | "60" | "90";
  term?: "fixed" | "indefinite";
};
export async function loadPortfolio(
  workspaceId: string,
  existingEntries?: Entry[],
) {
  const c = schema.crmContractTable;
  const contracts = await db
    .select({
      contract: c,
      companyName: schema.crmCompanyTable.name,
      sellerName: schema.userTable.name,
    })
    .from(c)
    .innerJoin(
      schema.crmCompanyTable,
      eq(c.companyId, schema.crmCompanyTable.id),
    )
    .leftJoin(schema.userTable, eq(c.ownerUserId, schema.userTable.id))
    .where(eq(c.workspaceId, workspaceId))
    .orderBy(asc(c.number))
    .limit(10001);
  if (contracts.length > 10000)
    throw new HTTPException(413, {
      message:
        "Carteira acima de 10.000 contratos requer processamento de grande volume.",
    });
  const [lines, revisions, configs, events, entries] = await Promise.all([
    db
      .select({ line: schema.crmContractServiceTable })
      .from(schema.crmContractServiceTable)
      .innerJoin(c, eq(c.id, schema.crmContractServiceTable.contractId))
      .where(eq(c.workspaceId, workspaceId)),
    db
      .select({ revision: schema.financeContractRevisionTable })
      .from(schema.financeContractRevisionTable)
      .innerJoin(c, eq(c.id, schema.financeContractRevisionTable.contractId))
      .where(eq(c.workspaceId, workspaceId)),
    db
      .select()
      .from(schema.financeContractBillingTable)
      .where(eq(schema.financeContractBillingTable.workspaceId, workspaceId)),
    db
      .select({ event: schema.crmContractEventTable })
      .from(schema.crmContractEventTable)
      .innerJoin(c, eq(c.id, schema.crmContractEventTable.contractId))
      .where(eq(c.workspaceId, workspaceId))
      .orderBy(
        asc(schema.crmContractEventTable.occurredAt),
        asc(schema.crmContractEventTable.createdAt),
      ),
    existingEntries
      ? Promise.resolve(existingEntries)
      : loadEntries(workspaceId),
  ]);
  function grouped<T>(values: T[], key: (value: T) => string) {
    const groups = new Map<string, T[]>();
    for (const value of values) {
      const id = key(value);
      const list = groups.get(id) ?? [];
      list.push(value);
      groups.set(id, list);
    }
    return groups;
  }
  const linesById = grouped(
    lines.map((x) => x.line),
    (x) => x.contractId,
  );
  const revisionsById = grouped(
    revisions.map((x) => x.revision),
    (x) => x.contractId,
  );
  const configsById = new Map(configs.map((x) => [x.contractId, x]));
  const eventsById = grouped(
    events.map((x) => x.event),
    (x) => x.contractId,
  );
  const entriesById = grouped(entries, (x) => x.contractId ?? "");
  return contracts.map((row) => ({
    ...row.contract,
    companyName: row.companyName,
    sellerName: row.sellerName,
    lines: linesById.get(row.contract.id) ?? [],
    revisions: revisionsById.get(row.contract.id) ?? [],
    config: configsById.get(row.contract.id) ?? null,
    events: eventsById.get(row.contract.id) ?? [],
    entries: entriesById.get(row.contract.id) ?? [],
  }));
}
export type PortfolioContract = Awaited<
  ReturnType<typeof loadPortfolio>
>[number];
export async function detail(workspaceId: string, id: string) {
  const portfolio = await loadPortfolio(workspaceId);
  const c = portfolio.find((c) => c.id === id);
  if (!c) throw new HTTPException(404, { message: "Contrato não encontrado." });
  return {
    contract: {
      id: c.id,
      number: c.number,
      title: c.title,
      companyName: c.companyName,
      startsOn: day(c.startsAt),
      endsOn: c.endsAt ? day(c.endsAt) : null,
      status: c.status,
      monthlyValueCents: c.monthlyValueCents,
      lines: c.lines,
    },
    config: c.config,
    revisions: c.revisions,
    entries: c.entries.slice(0, 120),
    entryCount: c.entries.length,
  };
}
