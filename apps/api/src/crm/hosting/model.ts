import type { HostingSnapshot } from "../../database/schema";
import { addMonths, DAY, previousPeriod, today } from "../../finance/model";
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
export function attention(s: HostingSnapshot, ref = today()) {
  if (s.mode !== "third_party") return "none";
  if (!s.renewsOn) return "no_date";
  return Date.parse(s.renewsOn) - Date.parse(ref) <= s.leadDays * DAY
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
  notices: {
    id: string;
    channel: string;
    status: string;
    createdAt: Date | string;
    confirmedAt: Date | string | null;
    updatedAt?: Date | string;
  }[];
};
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
};
export function portfolioReport(
  companies: PortfolioCompany[],
  f: PortfolioFilters,
) {
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
    (!f.attention ||
      f.attention === "all" ||
      attention(s, day) === f.attention);
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
          c.status === "active" && attention(stateAt(c, ref), ref) === "due",
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
        attention: attention(state, reference),
        daysRemaining: state.renewsOn
          ? Math.round(
              (Date.parse(state.renewsOn) - Date.parse(reference)) / DAY,
            )
          : null,
        noticeCount: c.notices.length,
      };
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
      "Responsável e situação filtram a carteira atual. Comparações de hospedagem usam as versões registradas desde a implantação; períodos sem esse histórico não representam a situação antiga. Avisos preparados não comprovam envio; aceitação SMTP não comprova entrega.",
  };
}
