import type { HostingSnapshot } from "../../database/schema";
import { addMonths, DAY, previousPeriod, today } from "../../finance/model";
import { DEFAULT_MARKS, nextNotice } from "./digest/model";
export const modeLabels = {
  unknown: "Não informado",
  own: "Hospedagem nossa",
  third_party: "Hospedagem de terceiros",
  none: "Sem hospedagem",
};
export function civilDay(date: Date | string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(date));
}
export function phoneNumber(value: string | null) {
  const digits = (value ?? "").replace(/\D/g, "");
  return /^[1-9]\d{7,14}$/.test(digits) ? digits : null;
}
export function whatsappUrl(recipient: string, body: string) {
  const number = phoneNumber(recipient);
  if (!number)
    throw new Error("Telefone inválido; informe DDI e DDD no contato.");
  return `https://wa.me/${number}?text=${encodeURIComponent(body)}`;
}
export const emptyHosting: HostingSnapshot = {
  mode: "unknown",
  provider: "",
  domain: "",
  renewsOn: null,
  leadDays: 30,
  contactId: null,
  emailAllowed: false,
  whatsappAllowed: false,
  notes: "",
  services: [],
};
export function attention(s: HostingSnapshot, ref = today(), lead?: number) {
  if (s.mode !== "third_party") return "none";
  if (!s.renewsOn) return "no_date";
  return Date.parse(s.renewsOn) - Date.parse(ref) <= (lead ?? s.leadDays) * DAY
    ? "due"
    : "scheduled";
}
export type PortfolioCompany = {
  id: string;
  name: string;
  status: string;
  ownerId: string | null;
  ownerName: string | null;
  createdAt: Date | string;
  archivedAt: Date | string | null;
  hosting: HostingSnapshot;
  version: number;
  revisions: {
    sequence: number;
    createdAt: Date | string;
    snapshot: HostingSnapshot;
  }[];
  digest?: {
    renewsOn: string;
    markDays: number;
    listed: boolean;
    runStatus: string;
    createdAt: Date | string;
  }[];
  notices: {
    id: string;
    channel: string;
    status: string;
    createdAt: Date | string;
    confirmedAt: Date | string | null;
    updatedAt?: Date | string;
  }[];
};
function lastNoticeOf(c: PortfolioCompany) {
  const last = [...(c.digest ?? [])]
    .filter((d) => d.listed)
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )[0];
  return last
    ? {
        markDays: last.markDays,
        sentAt: last.createdAt,
        status: last.runStatus,
        renewsOn: last.renewsOn,
      }
    : null;
}
export type PortfolioFilters = {
  from: string;
  to: string;
  mode?: string;
  status?: string;
  ownerId?: string;
  serviceId?: string;
  companyId?: string;
  attention?: string;
  search?: string;
  provider?: string;
  window?: "overdue" | "15" | "30" | "60" | "90";
};
export function portfolioReport(
  companies: PortfolioCompany[],
  f: PortfolioFilters,
  options: { marks?: number[] } = {},
) {
  const marks = options.marks ?? DEFAULT_MARKS;
  // O prazo de atenção segue a primeira marca do aviso interno (a maior).
  const lead = Math.max(...marks);
  const reference = f.to > today() ? today() : f.to;
  const base = companies.filter(
    (c) =>
      !c.archivedAt &&
      (!f.status || c.status === f.status) &&
      (!f.ownerId || c.ownerId === f.ownerId) &&
      (!f.companyId || c.id === f.companyId) &&
      (!f.search ||
        `${c.name} ${c.hosting.domain} ${c.hosting.provider}`
          .toLocaleLowerCase()
          .includes(f.search.toLocaleLowerCase())),
  );
  const stateAt = (c: PortfolioCompany, day: string) =>
    [...c.revisions]
      .filter((r) => civilDay(r.createdAt) <= day)
      .sort((a, b) => b.sequence - a.sequence)[0]?.snapshot ?? emptyHosting;
  const matches = (s: HostingSnapshot, day: string) =>
    (!f.mode || s.mode === f.mode) &&
    (!f.serviceId || s.services.some((v) => v.id === f.serviceId)) &&
    (!f.provider ||
      s.provider.trim().toLocaleLowerCase() ===
        f.provider.trim().toLocaleLowerCase()) &&
    (!f.attention ||
      f.attention === "all" ||
      attention(s, day, lead) === f.attention);
  const range = (date: Date | string, p: { from: string; to: string }) => {
    const d = civilDay(date);
    return d >= p.from && d <= p.to;
  };
  const metrics = (period: { from: string; to: string }) => {
    const ref = period.to > today() ? today() : period.to;
    const scoped = base.filter(
      (c) =>
        civilDay(c.createdAt) <= ref &&
        (!c.archivedAt || civilDay(c.archivedAt) > ref) &&
        matches(stateAt(c, ref), ref),
    );
    const revisions = base
      .flatMap((c) => c.revisions)
      .filter((r) => range(r.createdAt, period) && matches(r.snapshot, ref));
    const notices = scoped.flatMap((c) => c.notices);
    return {
      companies: scoped.length,
      own: scoped.filter((c) => stateAt(c, ref).mode === "own").length,
      thirdParty: scoped.filter((c) => stateAt(c, ref).mode === "third_party")
        .length,
      unknown: scoped.filter((c) => stateAt(c, ref).mode === "unknown").length,
      due: scoped.filter(
        (c) =>
          c.status === "active" &&
          attention(stateAt(c, ref), ref, lead) === "due",
      ).length,
      newCompanies: scoped.filter((c) => range(c.createdAt, period)).length,
      changes: revisions.length,
      emailsAccepted: notices.filter(
        (n) =>
          n.status === "accepted" && range(n.updatedAt ?? n.createdAt, period),
      ).length,
      whatsappPrepared: notices.filter(
        (n) => n.channel === "whatsapp" && range(n.createdAt, period),
      ).length,
      whatsappConfirmed: notices.filter(
        (n) => n.confirmedAt && range(n.confirmedAt, period),
      ).length,
      historyAvailable: base.some((c) =>
        c.revisions.some((r) => civilDay(r.createdAt) <= ref),
      ),
    };
  };
  const prior = previousPeriod(f.from, f.to);
  const rows = base
    .filter(
      (c) =>
        !c.archivedAt &&
        civilDay(c.createdAt) <= reference &&
        matches(stateAt(c, reference), reference),
    )
    .map((c) => {
      const state = stateAt(c, reference);
      return {
        id: c.id,
        name: c.name,
        status: c.status,
        ownerId: c.ownerId,
        ownerName: c.ownerName,
        hosting: state,
        version: c.version,
        attention: attention(state, reference, lead),
        daysRemaining: state.renewsOn
          ? Math.round(
              (Date.parse(state.renewsOn) - Date.parse(reference)) / DAY,
            )
          : null,
        noticeCount: c.notices.length,
        nextNotice:
          c.status === "active"
            ? nextNotice(
                state.mode === "third_party" ? state.renewsOn : null,
                marks,
                new Set(
                  (c.digest ?? [])
                    .filter((d) => d.renewsOn === state.renewsOn)
                    .map((d) => d.markDays),
                ),
                reference,
              )
            : null,
        lastNotice: lastNoticeOf(c),
      };
    })
    .filter((r) => {
      if (!f.window) return true;
      if (r.daysRemaining === null) return false;
      return f.window === "overdue"
        ? r.daysRemaining < 0
        : r.daysRemaining >= 0 && r.daysRemaining <= Number(f.window);
    });
  const months = [];
  for (
    let m = `${f.from.slice(0, 7)}-01`;
    m <= reference;
    m = addMonths(m, 1)
  ) {
    const end = new Date(Date.parse(addMonths(m, 1)) - DAY)
      .toISOString()
      .slice(0, 10);
    months.push({
      month: m.slice(0, 7),
      ...metrics({
        from: m < f.from ? f.from : m,
        to: end > f.to ? f.to : end,
      }),
    });
  }
  return {
    current: metrics(f),
    previous: metrics(prior),
    previousPeriod: prior,
    referenceDate: reference,
    months,
    rows,
    total: rows.length,
    historyNote:
      "Responsável e situação filtram a carteira atual. Comparações de hospedagem usam as versões registradas desde a implantação; períodos sem esse histórico não representam a situação antiga.",
  };
}
