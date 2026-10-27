import * as v from "valibot";
import { isCivilDate } from "./model";
export const money = v.pipe(
  v.number(),
  v.integer(),
  v.minValue(0),
  v.maxValue(1_000_000_000_000),
);
export const civilDate = v.pipe(
  v.string(),
  v.check(isCivilDate, "Data inválida; use AAAA-MM-DD."),
);
const text = (max: number) =>
  v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(max));
const nullableId = v.nullable(text(128));
export const laborType = v.picklist(["pj", "freelance", "clt"]);
export const direction = v.picklist(["payable", "receivable"]);
export const entryFields = {
  description: text(240),
  direction,
  kind: v.picklist(["operating", "opening"]),
  amountCents: v.pipe(money, v.minValue(1)),
  competenceDate: civilDate,
  dueDate: civilDate,
  categoryId: nullableId,
  partyId: nullableId,
  partyName: text(180),
  companyId: nullableId,
  serviceId: nullableId,
  sellerId: nullableId,
  paymentMethod: v.picklist([
    "pix",
    "boleto",
    "card",
    "transfer",
    "cash",
    "other",
  ]),
  notes: v.pipe(v.string(), v.maxLength(4000)),
};
export const createEntrySchema = v.object({
  ...entryFields,
  requestId: text(128),
  count: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(120)),
  intervalMonths: v.picklist([1, 3, 12]),
  schedule: v.picklist(["installments", "recurring"]),
});
export type EntryInput = v.InferOutput<typeof createEntrySchema>;
export const updateEntrySchema = v.object({
  ...entryFields,
  version: v.pipe(v.number(), v.integer(), v.minValue(1)),
});
export const settleSchema = v.object({
  requestId: text(128),
  date: civilDate,
  principalCents: v.pipe(money, v.minValue(1)),
  discountCents: money,
  interestCents: money,
  fineCents: money,
  notes: v.pipe(v.string(), v.maxLength(2000)),
});
export type SettleInput = v.InferOutput<typeof settleSchema>;
export const reasonSchema = v.object({ reason: text(1000) });
export const categorySchema = v.object({
  name: text(120),
  direction,
  parentId: nullableId,
  isActive: v.boolean(),
});
export const partySchema = v.object({
  name: text(180),
  laborType: v.nullable(laborType),
  isActive: v.boolean(),
});
export const filterFields = {
  contractId: v.optional(v.pipe(v.string(), v.minLength(1), v.maxLength(128))),
  view: v.optional(v.picklist(["outstanding", "overdue"])),
  asOf: v.optional(civilDate),
  from: civilDate,
  to: civilDate,
  dateBasis: v.picklist(["due", "competence", "settlement"]),
  direction: v.optional(direction),
  categoryId: v.optional(text(128)),
  subcategoryId: v.optional(text(128)),
  partyId: v.optional(text(128)),
  laborType: v.optional(laborType),
  companyId: v.optional(text(128)),
  serviceId: v.optional(text(128)),
  sellerId: v.optional(text(128)),
  kind: v.optional(v.picklist(["operating", "opening", "transfer"])),
  status: v.optional(
    v.picklist(["open", "partial", "settled", "overdue", "cancelled"]),
  ),
  search: v.optional(v.pipe(v.string(), v.maxLength(240))),
  sort: v.optional(
    v.picklist(["due_asc", "due_desc", "amount_asc", "amount_desc", "name"]),
  ),
};
export const filterSchema = v.pipe(
  v.object(filterFields),
  v.check(
    (f) =>
      f.from <= f.to &&
      (Date.parse(f.to) - Date.parse(f.from)) / 86400000 <= 730,
    "Selecione um período válido de até 731 dias.",
  ),
);
