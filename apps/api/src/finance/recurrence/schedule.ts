import type { FinanceBillingItem } from "../../database/schema";
import { addMonths, DAY } from "../model";
export type Revision = {
  prorateFinal?: boolean;
  id: string;
  effectiveDate: string;
  sequence: number;
  status: string;
  endsOn: string | null;
  billingDay: number | null;
  items: FinanceBillingItem[];
  sellerId: string | null;
  sellerName: string | null;
};
export const monthsPerCycle = { monthly: 1, quarterly: 3, yearly: 12 } as const;
export function effectiveDay(value: Date | string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}
export function day(value: Date | string) {
  return new Date(value).toISOString().slice(0, 10);
}
export function plusDays(value: string, count: number) {
  return new Date(Date.parse(value) + count * DAY).toISOString().slice(0, 10);
}
export function revisionAt(revisions: Revision[], date: string) {
  return [...revisions]
    .filter((r) => r.effectiveDate <= date)
    .sort(
      (a, b) =>
        b.effectiveDate.localeCompare(a.effectiveDate) ||
        b.sequence - a.sequence,
    )[0];
}
export function dueDate(cycleStart: string, billingDay: number | null) {
  if (!billingDay) return cycleStart;
  const first = `${cycleStart.slice(0, 7)}-01`;
  const last = Number(plusDays(addMonths(first, 1), -1).slice(-2));
  const date = `${cycleStart.slice(0, 7)}-${String(Math.min(last, billingDay)).padStart(2, "0")}`;
  if (date >= cycleStart) return date;
  const next = addMonths(first, 1);
  const nextLast = Number(plusDays(addMonths(next, 1), -1).slice(-2));
  return `${next.slice(0, 7)}-${String(Math.min(billingDay, nextLast)).padStart(2, "0")}`;
}
export type Cycle = {
  key: string;
  start: string;
  end: string;
  dueDate: string;
  amountCents: number;
  revision: Revision;
  item: FinanceBillingItem;
};
/** Every item keeps its own original anchor. Annual prices are never divided into monthly invoices. */
export function planCycles(
  revisions: Revision[],
  through: string,
  prorateFinal: boolean,
): Cycle[] {
  const candidates = new Map<string, { key: string; date: string }>();
  for (const revision of revisions)
    for (const item of revision.items) {
      const interval = monthsPerCycle[item.billingType];
      for (let n = 0; n < 2400; n++) {
        const date = addMonths(item.anchor, n * interval);
        if (date > through) break;
        if (n === 2399)
          throw new Error(
            "Cronograma excede 2.400 ciclos por serviço. Revise a data inicial.",
          );
        candidates.set(`${item.key}:${date}`, { key: item.key, date });
      }
    }
  const cycles: Cycle[] = [];
  for (const { key, date } of candidates.values()) {
    const revision = revisionAt(revisions, date);
    if (
      revision?.status !== "active" ||
      (revision.endsOn && date > revision.endsOn)
    )
      continue;
    const item = revision.items.find((i) => i.key === key);
    if (!item || date < item.anchor) continue;
    const interval = monthsPerCycle[item.billingType];
    const monthDifference =
      (Number(date.slice(0, 4)) - Number(item.anchor.slice(0, 4))) * 12 +
      Number(date.slice(5, 7)) -
      Number(item.anchor.slice(5, 7));
    if (
      monthDifference < 0 ||
      monthDifference % interval ||
      addMonths(item.anchor, monthDifference) !== date
    )
      continue;
    const fullEnd = plusDays(
      addMonths(item.anchor, monthDifference + interval),
      -1,
    );
    const end =
      revision.endsOn && revision.endsOn < fullEnd ? revision.endsOn : fullEnd;
    const amountCents =
      (revision.prorateFinal ?? prorateFinal) && end < fullEnd
        ? Math.round(
            (item.amountCents *
              ((Date.parse(end) - Date.parse(date)) / DAY + 1)) /
              ((Date.parse(fullEnd) - Date.parse(date)) / DAY + 1),
          )
        : item.amountCents;
    if (amountCents <= 0) continue;
    cycles.push({
      key,
      start: date,
      end,
      dueDate: dueDate(date, revision.billingDay),
      amountCents,
      revision,
      item,
    });
  }
  return cycles.sort(
    (a, b) => a.start.localeCompare(b.start) || a.key.localeCompare(b.key),
  );
}
export function snapshotItems(
  lines: {
    serviceId: string | null;
    name: string;
    billingType: string;
    totalCents: number;
  }[],
  fallback: number,
  anchor: string,
  previous: FinanceBillingItem[] = [],
): FinanceBillingItem[] {
  const counts = new Map<string, number>();
  const source = lines.length
    ? lines
    : [
        {
          serviceId: null,
          name: "Contrato mensal",
          billingType: "monthly",
          totalCents: fallback,
        },
      ];
  return source.map((line) => {
    if (!(line.billingType in monthsPerCycle))
      throw new Error("Contrato contém serviço sem periodicidade recorrente.");
    const base = line.serviceId
      ? `service:${line.serviceId}`
      : `name:${line.name.trim().toLowerCase()}`;
    const n = counts.get(base) ?? 0;
    counts.set(base, n + 1);
    const key = `${base}:${n}`;
    const old = previous.find(
      (p) => p.key === key && p.billingType === line.billingType,
    );
    return {
      key,
      serviceId: line.serviceId,
      name: line.name,
      billingType: line.billingType as FinanceBillingItem["billingType"],
      amountCents: line.totalCents,
      anchor: old?.anchor ?? anchor,
    };
  });
}
