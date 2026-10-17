import type { HostingDigestItemSnapshot } from "../../../database/schema";

const DAY = 86_400_000;
export const DEFAULT_MARKS = [30, 15];
export const MAX_ATTEMPTS = 3;
// Intervalos entre tentativas depois da 1ª e da 2ª falha (em milissegundos).
export const RETRY_DELAYS = [60 * 60_000, 6 * 60 * 60_000];
// O aviso só sai a partir desta hora (America/Sao_Paulo), nunca de madrugada.
export const SEND_FROM_HOUR = 8;

export function normalizeMarks(marks: number[]) {
  return [...new Set(marks)].sort((a, b) => b - a);
}
export function daysUntil(renewsOn: string, reference: string) {
  return Math.round((Date.parse(renewsOn) - Date.parse(reference)) / DAY);
}
export function localHour(now = new Date()) {
  const hour = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    hour12: false,
  }).format(now);
  return Number(hour) % 24;
}

export type DigestCandidate = {
  companyId: string;
  renewsOn: string;
} & HostingDigestItemSnapshot;
export type PlannedItem = {
  candidate: DigestCandidate;
  markDays: number;
  listed: boolean;
  daysRemaining: number;
};
export const itemKey = (companyId: string, renewsOn: string, mark: number) =>
  `${companyId}|${renewsOn}|${mark}`;

/**
 * Decide o que entra no próximo aviso.
 * - Uma marca vence quando faltam `marca` dias ou menos para a renovação.
 * - Cada marca é registrada uma única vez por empresa e data de renovação.
 * - Se mais de uma marca venceu de uma vez (ex.: data cadastrada faltando 10
 *   dias com marcas 30 e 15), só a mais próxima é listada; as demais ficam
 *   registradas como não listadas para não reaparecerem depois.
 * - Renovações já vencidas não geram aviso.
 */
export function planDigest(
  candidates: DigestCandidate[],
  existing: Set<string>,
  marks: number[],
  reference: string,
): PlannedItem[] {
  const ordered = normalizeMarks(marks);
  const planned: PlannedItem[] = [];
  for (const candidate of candidates) {
    const daysRemaining = daysUntil(candidate.renewsOn, reference);
    if (daysRemaining < 0) continue;
    const due = ordered.filter(
      (mark) =>
        daysRemaining <= mark &&
        !existing.has(itemKey(candidate.companyId, candidate.renewsOn, mark)),
    );
    if (!due.length) continue;
    const nearest = Math.min(...due);
    for (const markDays of due)
      planned.push({
        candidate,
        markDays,
        listed: markDays === nearest,
        daysRemaining,
      });
  }
  return planned;
}

/** Próximo aviso previsto para uma empresa, ou null se não houver. */
export function nextNotice(
  renewsOn: string | null,
  marks: number[],
  sentMarks: Set<number>,
  reference: string,
) {
  if (!renewsOn) return null;
  const days = daysUntil(renewsOn, reference);
  if (days < 0) return null;
  const pending = normalizeMarks(marks).filter((m) => !sentMarks.has(m));
  const overdue = pending.filter((m) => days <= m);
  if (overdue.length)
    return { markDays: Math.min(...overdue), date: reference };
  const future = pending.filter((m) => days > m);
  if (!future.length) return null;
  const mark = Math.max(...future);
  return {
    markDays: mark,
    date: new Date(Date.parse(renewsOn) - mark * DAY)
      .toISOString()
      .slice(0, 10),
  };
}

const oneLine = (value: string | null | undefined) =>
  (value ?? "").replace(/[\r\n\t]+/g, " ").trim();
const dateBr = (iso: string) => iso.split("-").reverse().join("/");
const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

export type DigestLine = {
  companyId: string;
  markDays: number;
  renewsOn: string;
  daysRemaining: number;
  snapshot: HostingDigestItemSnapshot;
};

/** Monta o e-mail em texto puro; o assunto nunca inclui dados do cadastro. */
export function buildDigestEmail(
  lines: DigestLine[],
  options: { clientUrl: string; workspaceId: string },
) {
  const total = lines.length;
  const subject = `Hospedagens de terceiros a renovar: ${total} ${plural(total, "cliente", "clientes")}`;
  const base = options.clientUrl.replace(/\/+$/, "");
  const marks = [...new Set(lines.map((l) => l.markDays))].sort(
    (a, b) => b - a,
  );
  const out: string[] = [
    "Estes clientes têm a hospedagem de terceiros vencendo em breve, nos provedores abaixo.",
    "É a hora de oferecer a nossa hospedagem antes da renovação.",
    "",
  ];
  for (const mark of marks) {
    const section = lines
      .filter((l) => l.markDays === mark)
      .sort(
        (a, b) =>
          a.renewsOn.localeCompare(b.renewsOn) ||
          a.snapshot.companyName.localeCompare(b.snapshot.companyName, "pt-BR"),
      );
    out.push(
      `RENOVAM EM ATÉ ${mark} DIAS (${section.length} ${plural(section.length, "cliente", "clientes")})`,
      "",
    );
    for (const l of section) {
      const s = l.snapshot;
      const contact = [s.contactName, s.contactEmail, s.contactPhone]
        .map(oneLine)
        .filter(Boolean)
        .join(" · ");
      out.push(
        `- ${oneLine(s.companyName)}${s.domain ? ` (${oneLine(s.domain)})` : ""}`,
        `  Provedor atual: ${oneLine(s.provider) || "não informado"}`,
        `  Renovação: ${dateBr(l.renewsOn)} (${l.daysRemaining === 0 ? "hoje" : `em ${l.daysRemaining} ${plural(l.daysRemaining, "dia", "dias")}`})`,
        `  Responsável: ${oneLine(s.ownerName) || "não definido"}`,
      );
      if (contact) out.push(`  Contato: ${contact}`);
      out.push(
        `  Ficha: ${base}/dashboard/workspace/${options.workspaceId}/crm/companies/${l.companyId}`,
        "",
      );
    }
  }
  out.push(
    "Mensagem automática do Nortys, somente para a equipe interna. Nenhum aviso é enviado aos clientes.",
  );
  return { subject, text: out.join("\n") };
}

/** Define quem recebe o quê. Marcados recebem tudo; responsáveis, só o seu. */
export function planDeliveries(input: {
  listed: { companyId: string; ownerUserId: string | null }[];
  recipients: { userId: string; email: string; name: string }[];
  owners: { userId: string; email: string; name: string }[];
  includeOwner: boolean;
}) {
  const all = input.listed.map((l) => l.companyId);
  const byUser = new Map<
    string,
    { userId: string; email: string; name: string; companyIds: string[] }
  >();
  for (const r of input.recipients)
    byUser.set(r.userId, { ...r, companyIds: all });
  if (input.includeOwner) {
    for (const owner of input.owners) {
      if (byUser.has(owner.userId)) continue;
      const own = input.listed
        .filter((l) => l.ownerUserId === owner.userId)
        .map((l) => l.companyId);
      if (own.length) byUser.set(owner.userId, { ...owner, companyIds: own });
    }
  }
  return [...byUser.values()].filter((d) => d.companyIds.length > 0);
}
