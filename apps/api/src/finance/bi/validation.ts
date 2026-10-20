import * as v from "valibot";
import { civilDate, laborType } from "../validation";

const id = v.optional(v.pipe(v.string(), v.minLength(1), v.maxLength(128)));
export const fields = {
  from: civilDate,
  to: civilDate,
  comparison: v.optional(v.picklist(["previous", "year"]), "previous"),
  grouping: v.optional(v.picklist(["month", "day"]), "month"),
  ranking: v.optional(
    v.picklist(["revenue", "result", "overdue", "commission"]),
    "revenue",
  ),
  companyId: id,
  sellerId: id,
  serviceId: id,
  categoryId: id,
  subcategoryId: id,
  partyId: id,
  laborType: v.optional(laborType),
  resultClass: v.optional(
    v.picklist([
      "unclassified",
      "direct",
      "operating",
      "tax",
      "financial",
      "commission",
    ]),
  ),
  contractId: id,
  contractStatus: v.optional(
    v.picklist(["active", "paused", "cancelled", "finished", "not_started"]),
  ),
};
export const filters = v.pipe(
  v.object(fields),
  v.check(
    (f) =>
      f.from <= f.to &&
      (Date.parse(f.to) - Date.parse(f.from)) / 86400000 <= 730 &&
      (f.grouping !== "day" ||
        (Date.parse(f.to) - Date.parse(f.from)) / 86400000 < 93),
    "Período máximo de 731 dias; agrupamento diário de até 93 dias.",
  ),
);
export type BiFilters = v.InferOutput<typeof filters>;
export const metrics = [
  "revenue",
  "expenses",
  "received",
  "paid",
  "movement",
  "gross",
  "net",
  "grossMargin",
  "netMargin",
  "presumed",
  "receivable",
  "payable",
  "overdueReceivable",
  "overduePayable",
  "commission",
  "availableCommission",
  "commissionOpen",
  "commissionPaid",
  "commissionExcess",
  "tax",
  "fee",
  "taxPaid",
  "feePaid",
  "taxOpen",
  "feeOpen",
  "unclassified",
  "expenseSlice",
  "mrr",
  "contracts",
  "expiry",
  "disabledBilling",
  "simulation",
  "projection",
] as const;
export const metric = v.picklist(metrics);
export const page = v.optional(
  v.pipe(v.string(), v.regex(/^[1-9]\d{0,5}$/), v.transform(Number)),
  "1",
);
