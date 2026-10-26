import { asc, count, desc, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import db from "../../../database";
import {
  crmCompanyTable,
  crmContractTable,
  crmDealServiceTable,
  crmDealTable,
  userTable,
} from "../../../database/schema";
import {
  allOf,
  clampLimit,
  ownerScope,
  searchAcross,
} from "../../shared/list-filters";
import type { CrmVisibility } from "../../shared/resolve-visibility";

const SORTABLE = {
  wonAt: crmDealTable.wonAt,
  valueCents: crmDealTable.valueCents,
  company: crmCompanyTable.name,
} as const;

export type SaleSortField = keyof typeof SORTABLE;
export type SaleKind = "one_time" | "recurring" | "mixed";

/**
 * Venda = negócio ganho. A tabela é de consulta rápida: uma linha por venda,
 * com os serviços e o contrato (quando há item recorrente) já resumidos.
 */
async function getSales({
  workspaceId,
  userId,
  visibility,
  from,
  to,
  ownerUserId,
  search,
  sortBy,
  sortDirection,
  limit,
  offset,
}: {
  workspaceId: string;
  userId: string;
  visibility: CrmVisibility;
  from?: Date;
  to?: Date;
  ownerUserId?: string;
  search?: string;
  sortBy?: SaleSortField;
  sortDirection?: "asc" | "desc";
  limit?: number;
  offset?: number;
}) {
  const where = allOf(
    eq(crmDealTable.workspaceId, workspaceId),
    eq(crmDealTable.status, "won"),
    isNull(crmDealTable.archivedAt),
    ownerScope(crmDealTable.ownerUserId, visibility, userId),
    ownerUserId ? eq(crmDealTable.ownerUserId, ownerUserId) : undefined,
    from ? gte(crmDealTable.wonAt, from) : undefined,
    to ? lte(crmDealTable.wonAt, to) : undefined,
    searchAcross([crmDealTable.title, crmCompanyTable.name], search),
  );

  const pageSize = clampLimit(limit);
  const column = SORTABLE[sortBy ?? "wonAt"];
  const order = sortDirection === "asc" ? asc(column) : desc(column);

  const [total] = await db
    .select({ value: count() })
    .from(crmDealTable)
    .leftJoin(crmCompanyTable, eq(crmDealTable.companyId, crmCompanyTable.id))
    .where(where);

  const rows = await db
    .select({
      deal: crmDealTable,
      company: { id: crmCompanyTable.id, name: crmCompanyTable.name },
      owner: { id: userTable.id, name: userTable.name },
    })
    .from(crmDealTable)
    .leftJoin(crmCompanyTable, eq(crmDealTable.companyId, crmCompanyTable.id))
    .leftJoin(userTable, eq(crmDealTable.ownerUserId, userTable.id))
    .where(where)
    .orderBy(order, desc(crmDealTable.number))
    .limit(pageSize)
    .offset(offset ?? 0);

  const ids = rows.map((row) => row.deal.id);
  const [services, contracts] = ids.length
    ? await Promise.all([
        db
          .select({
            dealId: crmDealServiceTable.dealId,
            name: crmDealServiceTable.name,
            billingType: crmDealServiceTable.billingType,
          })
          .from(crmDealServiceTable)
          .where(inArray(crmDealServiceTable.dealId, ids))
          .orderBy(asc(crmDealServiceTable.position)),
        db
          .select({
            dealId: crmContractTable.dealId,
            id: crmContractTable.id,
            number: crmContractTable.number,
            status: crmContractTable.status,
          })
          .from(crmContractTable)
          .where(inArray(crmContractTable.dealId, ids))
          .orderBy(desc(crmContractTable.createdAt)),
      ])
    : [[], []];

  const servicesByDeal = new Map<string, typeof services>();
  for (const service of services) {
    const list = servicesByDeal.get(service.dealId) ?? [];
    list.push(service);
    servicesByDeal.set(service.dealId, list);
  }
  const contractByDeal = new Map<string, (typeof contracts)[number]>();
  for (const contract of contracts) {
    if (contract.dealId && !contractByDeal.has(contract.dealId))
      contractByDeal.set(contract.dealId, contract);
  }

  return {
    total: total?.value ?? 0,
    limit: pageSize,
    offset: offset ?? 0,
    items: rows.map((row) => {
      const items = servicesByDeal.get(row.deal.id) ?? [];
      const recurring = items.filter(
        (item) => item.billingType !== "one_time",
      ).length;
      const kind: SaleKind | null =
        items.length === 0
          ? null
          : recurring === 0
            ? "one_time"
            : recurring === items.length
              ? "recurring"
              : "mixed";
      const contract = contractByDeal.get(row.deal.id);
      return {
        id: row.deal.id,
        number: row.deal.number,
        title: row.deal.title,
        soldAt: row.deal.wonAt,
        valueCents: row.deal.valueCents,
        currency: row.deal.currency,
        notes: row.deal.notes,
        paymentForm: row.deal.paymentForm,
        paymentFormNote: row.deal.paymentFormNote,
        company: row.company?.id ? row.company : null,
        owner: row.owner?.id ? row.owner : null,
        services: items.map((item) => item.name),
        kind,
        contract: contract
          ? {
              id: contract.id,
              number: contract.number,
              status: contract.status,
            }
          : null,
      };
    }),
  };
}

export default getSales;
