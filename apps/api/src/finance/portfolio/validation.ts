import * as v from "valibot";
import { civilDate, money } from "../validation";

const text = (n: number) =>
  v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(n));
export const id = text(128);
const optionalId = v.nullable(id);
export const range = v.pipe(
  v.object({
    from: civilDate,
    to: civilDate,
    companyId: v.optional(id),
    ownerId: v.optional(id),
    kind: v.optional(v.picklist(["receivable", "contract", "hosting"])),
    status: v.optional(
      v.picklist([
        "open",
        "waiting",
        "promised",
        "negotiating",
        "done",
        "snoozed",
      ]),
    ),
    horizon: v.optional(v.picklist(["30", "60", "90"]), "90"),
  }),
  v.check(
    (f) =>
      f.from <= f.to &&
      (Date.parse(f.to) - Date.parse(f.from)) / 86400000 <= 730,
    "Período inválido; máximo de 731 dias.",
  ),
);
export type Range = v.InferOutput<typeof range>;
export const source = v.object({
  sourceKind: v.picklist(["receivable", "contract", "hosting"]),
  sourceId: id,
  sourceDate: civilDate,
});
export type Source = v.InferOutput<typeof source>;
const version = v.pipe(v.number(), v.integer(), v.minValue(0));
export const caseInput = v.object({
  ...source.entries,
  version,
  status: v.picklist([
    "open",
    "waiting",
    "promised",
    "negotiating",
    "done",
    "snoozed",
  ]),
  ownerUserId: optionalId,
  nextOn: v.nullable(civilDate),
  nextAction: v.pipe(v.string(), v.trim(), v.maxLength(1000)),
  promiseOn: v.nullable(civilDate),
  promiseCents: v.nullable(money),
  note: text(4000),
});
export type CaseInput = v.InferOutput<typeof caseInput>;
export const siteInput = v.object({
  companyId: id,
  contractId: optionalId,
  name: text(200),
  status: v.picklist(["active", "completed"]),
  includeScenario: v.boolean(),
  version,
});
export type SiteInput = v.InferOutput<typeof siteInput>;
export const taskInput = v.object({
  siteId: id,
  taskId: id,
  estimateMinutes: v.pipe(
    v.number(),
    v.integer(),
    v.minValue(0),
    v.maxValue(600000),
  ),
  version,
});
export type TaskInput = v.InferOutput<typeof taskInput>;
export const rateInput = v.object({
  userId: id,
  effectiveOn: civilDate,
  hourlyCents: money,
});
export type RateInput = v.InferOutput<typeof rateInput>;
export const workerInput = v.object({
  userId: id,
  mode: v.picklist(["internal", "hourly", "fixed", "ledger"]),
  fixedCents: money,
  chargedOn: civilDate,
  sourceEntryId: optionalId,
  version,
});
export type WorkerInput = v.InferOutput<typeof workerInput>;
export const draftInput = v.object({
  companyId: id,
  contractId: optionalId,
  title: text(200),
  body: text(30000),
  proposedCents: money,
  status: v.picklist(["draft", "submitted"]),
  version,
});
export type DraftInput = v.InferOutput<typeof draftInput>;
export const noticeInput = v.object({
  caseId: id,
  contactId: id,
  channel: v.picklist(["email", "whatsapp"]),
  subject: v.pipe(
    v.string(),
    v.trim(),
    v.maxLength(200),
    v.check((s) => !/[\r\n]/.test(s), "Assunto inválido."),
  ),
  body: v.pipe(v.string(), v.trim(), v.maxLength(6000)),
});
export type NoticeInput = v.InferOutput<typeof noticeInput>;
export const sendInput = v.object({
  ...noticeInput.entries,
  requestId: id,
  signature: text(128),
  confirmed: v.literal(true),
});
