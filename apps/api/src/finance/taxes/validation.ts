import * as v from "valibot";
import { civilDate, money } from "../validation";
export const id = v.pipe(v.string(), v.minLength(1), v.maxLength(128));
const text = (max: number) =>
  v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(max));
export const bps = v.pipe(
  v.number(),
  v.integer(),
  v.minValue(0),
  v.maxValue(9999),
);
export const version = v.pipe(v.number(), v.integer(), v.minValue(0));
export const profileSchema = v.pipe(
  v.object({
    name: text(120),
    notes: v.pipe(v.string(), v.maxLength(2000)),
    isActive: v.boolean(),
    version,
    items: v.pipe(
      v.array(
        v.object({
          name: text(80),
          kind: v.picklist(["tax", "fee"]),
          rateBps: bps,
          fixedCents: money,
        }),
      ),
      v.maxLength(20),
    ),
  }),
  v.check(
    (p) => p.items.reduce((sum, i) => sum + i.rateBps, 0) < 10000,
    "A soma dos percentuais deve ser menor que 100%.",
  ),
  v.check(
    (p) =>
      new Set(p.items.map((i) => i.name.toLocaleLowerCase())).size ===
      p.items.length,
    "Use nomes distintos para cada taxa ou imposto.",
  ),
);
export const calculationSchema = v.object({
  profileId: id,
  profileVersion: version,
  date: civilDate,
  mode: v.picklist(["gross", "net"]),
  amountCents: v.pipe(money, v.minValue(1)),
  costCents: money,
  commissionMode: v.picklist(["none", "manual", "service"]),
  commissionRateBps: bps,
  serviceId: v.nullable(id),
  sellerId: v.nullable(id),
});
export type CalculationInput = v.InferOutput<typeof calculationSchema>;
export type ProfileInput = v.InferOutput<typeof profileSchema>;
export const saveSchema = v.object({
  calculation: calculationSchema,
  calculationSignature: id,
  title: text(180),
  requestId: id,
});
export const filters = v.pipe(
  v.object({
    from: civilDate,
    to: civilDate,
    profileId: v.optional(id),
    serviceId: v.optional(id),
    sellerId: v.optional(id),
  }),
  v.check(
    (f) =>
      f.from <= f.to &&
      (Date.parse(f.to) - Date.parse(f.from)) / 86400000 <= 730,
    "Período inválido; máximo de 731 dias.",
  ),
);
export const params = v.object({ workspaceId: id, id });
