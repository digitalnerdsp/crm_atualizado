import * as v from "valibot";
import { civilDate } from "../../finance/validation";
export const id = v.pipe(v.string(), v.minLength(1), v.maxLength(128));
export const params = v.object({ workspaceId: id, id });
const text = (max: number) => v.pipe(v.string(), v.trim(), v.maxLength(max));
export const configSchema = v.object({
  mode: v.picklist(["unknown", "own", "third_party", "none"]),
  provider: text(180),
  domain: v.pipe(
    text(253),
    v.check(
      (s) =>
        !s ||
        /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,63}$/.test(
          s,
        ),
      "Informe somente o domínio, sem protocolo ou caminho.",
    ),
  ),
  renewsOn: v.nullable(civilDate),
  leadDays: v.optional(
    v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(365)),
    30,
  ),
  contactId: v.nullable(id),
  emailAllowed: v.optional(v.boolean(), false),
  whatsappAllowed: v.optional(v.boolean(), false),
  notes: text(2000),
  serviceIds: v.pipe(
    v.array(id),
    v.maxLength(100),
    v.check((ids) => new Set(ids).size === ids.length, "Serviços duplicados."),
  ),
  version: v.pipe(v.number(), v.integer(), v.minValue(0)),
});
export type HostingInput = v.InferOutput<typeof configSchema>;
export const filters = v.pipe(
  v.object({
    from: civilDate,
    to: civilDate,
    mode: v.optional(v.picklist(["unknown", "own", "third_party", "none"])),
    status: v.optional(
      v.picklist(["prospect", "active", "inactive", "churned"]),
    ),
    ownerId: v.optional(id),
    serviceId: v.optional(id),
    companyId: v.optional(id),
    attention: v.optional(v.picklist(["due", "no_date", "all"])),
    search: v.optional(text(200)),
    provider: v.optional(text(180)),
    window: v.optional(v.picklist(["overdue", "15", "30", "60", "90"])),
  }),
  v.check(
    (f) =>
      f.from <= f.to &&
      (Date.parse(f.to) - Date.parse(f.from)) / 86400000 <= 730,
    "Período inválido; máximo de 731 dias.",
  ),
);
export const digestSchema = v.object({
  enabled: v.boolean(),
  marks: v.pipe(
    v.array(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(365))),
    v.minLength(1),
    v.maxLength(5),
    v.check((m) => new Set(m).size === m.length, "Marcas duplicadas."),
  ),
  includeOwner: v.boolean(),
  recipientUserIds: v.pipe(
    v.array(id),
    v.maxLength(100),
    v.check(
      (ids) => new Set(ids).size === ids.length,
      "Destinatários duplicados.",
    ),
  ),
  version: v.pipe(v.number(), v.integer(), v.minValue(0)),
});
export type DigestInput = v.InferOutput<typeof digestSchema>;
