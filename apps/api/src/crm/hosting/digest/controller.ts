import { sendClientNoticeEmail } from "@kaneo/email";
import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  lte,
  sql,
} from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db, { schema } from "../../../database";
import type { HostingDigestDelivery } from "../../../database/schema";
import { today } from "../../../finance/model";
import type { Tx } from "../../../finance/performance/snapshot";
import { getRuntimeSmtpEmailConfig } from "../../../settings/email-settings";
import {
  buildDigestEmail,
  DEFAULT_MARKS,
  type DigestCandidate,
  type DigestLine,
  itemKey,
  localHour,
  MAX_ATTEMPTS,
  normalizeMarks,
  planDeliveries,
  planDigest,
  RETRY_DELAYS,
  SEND_FROM_HOUR,
} from "./model";

type Db = typeof db | Tx;
export type DigestScope = { workspaceId: string; userId: string };
export type DigestInput = {
  enabled: boolean;
  marks: number[];
  includeOwner: boolean;
  recipientUserIds: string[];
  version: number;
};

const LEASE_MS = 15 * 60_000;
function fail(status: 400 | 404 | 409, message: string): never {
  throw new HTTPException(status, { message });
}
async function audit(
  tx: Db,
  workspaceId: string,
  actorUserId: string | null,
  entityId: string,
  action: string,
  before: unknown,
  after: unknown,
) {
  await tx.insert(schema.auditLogTable).values({
    workspaceId,
    actorUserId,
    entityType: "crm_hosting_digest",
    entityId,
    action: `crm.hosting.digest.${action}`,
    summary: `Aviso interno de hospedagem: ${action}`,
    before,
    after,
  });
}
async function settingsOf(tx: Db, workspaceId: string) {
  const [row] = await tx
    .select()
    .from(schema.crmHostingDigestSettingTable)
    .where(eq(schema.crmHostingDigestSettingTable.workspaceId, workspaceId));
  return {
    enabled: row?.enabled ?? false,
    marks: normalizeMarks(row?.marks ?? DEFAULT_MARKS),
    includeOwner: row?.includeOwner ?? false,
    version: row?.version ?? 0,
  };
}
async function membersOf(tx: Db, workspaceId: string) {
  return tx
    .select({
      userId: schema.userTable.id,
      name: schema.userTable.name,
      email: schema.userTable.email,
    })
    .from(schema.workspaceUserTable)
    .innerJoin(
      schema.userTable,
      eq(schema.userTable.id, schema.workspaceUserTable.userId),
    )
    .where(eq(schema.workspaceUserTable.workspaceId, workspaceId))
    .orderBy(asc(schema.userTable.name));
}
async function loadCandidates(
  tx: Db,
  workspaceId: string,
): Promise<DigestCandidate[]> {
  const c = schema.crmCompanyTable;
  const h = schema.crmHostingTable;
  const ct = schema.crmContactTable;
  const rows = await tx
    .select({
      companyId: c.id,
      companyName: c.name,
      ownerUserId: c.ownerUserId,
      ownerName: schema.userTable.name,
      provider: h.provider,
      domain: h.domain,
      renewsOn: h.renewsOn,
      firstName: ct.firstName,
      lastName: ct.lastName,
      contactEmail: ct.email,
      mobile: ct.mobile,
      phone: ct.phone,
    })
    .from(c)
    .innerJoin(h, eq(h.companyId, c.id))
    .leftJoin(schema.userTable, eq(schema.userTable.id, c.ownerUserId))
    .leftJoin(
      ct,
      and(
        eq(ct.id, h.contactId),
        eq(ct.workspaceId, workspaceId),
        isNull(ct.archivedAt),
      ),
    )
    .where(
      and(
        eq(c.workspaceId, workspaceId),
        eq(c.status, "active"),
        isNull(c.archivedAt),
        eq(h.mode, "third_party"),
        isNotNull(h.renewsOn),
      ),
    )
    .orderBy(asc(h.renewsOn), asc(c.name));
  return rows.flatMap((r) =>
    r.renewsOn
      ? [
          {
            companyId: r.companyId,
            renewsOn: r.renewsOn,
            companyName: r.companyName,
            provider: r.provider,
            domain: r.domain,
            ownerUserId: r.ownerUserId,
            ownerName: r.ownerName,
            contactName: r.firstName
              ? `${r.firstName} ${r.lastName ?? ""}`.trim()
              : null,
            contactEmail: r.contactEmail,
            contactPhone: r.mobile || r.phone,
          },
        ]
      : [],
  );
}
async function existingKeys(tx: Db, workspaceId: string) {
  const rows = await tx
    .select({
      companyId: schema.crmHostingDigestItemTable.companyId,
      renewsOn: schema.crmHostingDigestItemTable.renewsOn,
      markDays: schema.crmHostingDigestItemTable.markDays,
    })
    .from(schema.crmHostingDigestItemTable)
    .where(eq(schema.crmHostingDigestItemTable.workspaceId, workspaceId));
  return new Set(rows.map((r) => itemKey(r.companyId, r.renewsOn, r.markDays)));
}

export async function getConfig(workspaceId: string) {
  const [settings, members, recipients, runs] = await Promise.all([
    settingsOf(db, workspaceId),
    membersOf(db, workspaceId),
    db
      .select({ userId: schema.crmHostingDigestRecipientTable.userId })
      .from(schema.crmHostingDigestRecipientTable)
      .where(
        eq(schema.crmHostingDigestRecipientTable.workspaceId, workspaceId),
      ),
    db
      .select()
      .from(schema.crmHostingDigestRunTable)
      .where(eq(schema.crmHostingDigestRunTable.workspaceId, workspaceId))
      .orderBy(desc(schema.crmHostingDigestRunTable.createdAt))
      .limit(20),
  ]);
  const counts = runs.length
    ? await db
        .select({
          runId: schema.crmHostingDigestItemTable.runId,
          total: sql<number>`count(*) filter (where ${schema.crmHostingDigestItemTable.listed})::int`,
        })
        .from(schema.crmHostingDigestItemTable)
        .where(
          inArray(
            schema.crmHostingDigestItemTable.runId,
            runs.map((r) => r.id),
          ),
        )
        .groupBy(schema.crmHostingDigestItemTable.runId)
    : [];
  const total = new Map(counts.map((c) => [c.runId, c.total]));
  return {
    settings,
    members,
    recipientUserIds: recipients.map((r) => r.userId),
    runs: runs.map((r) => ({
      id: r.id,
      createdAt: r.createdAt,
      status: r.status,
      attempts: r.attempts,
      nextAttemptAt: r.nextAttemptAt,
      companies: total.get(r.id) ?? 0,
      deliveries: r.deliveries.map((d) => ({
        userId: d.userId,
        name: d.name,
        email: d.email,
        status: d.status,
        error: d.error,
        companies: d.companyIds.length,
      })),
    })),
  };
}

export async function saveConfig(s: DigestScope, input: DigestInput) {
  await db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`hosting-digest-config:${s.workspaceId}`},0))`,
    );
    const before = await settingsOf(tx, s.workspaceId);
    if (before.version !== input.version)
      fail(409, "Configuração alterada. Atualize a tela.");
    const members = await membersOf(tx, s.workspaceId);
    const memberIds = new Set(members.map((m) => m.userId));
    if (input.recipientUserIds.some((id) => !memberIds.has(id)))
      fail(400, "Um ou mais destinatários não pertencem ao workspace.");
    if (input.enabled && !input.recipientUserIds.length && !input.includeOwner)
      fail(
        400,
        "Selecione ao menos um destinatário ou habilite o envio ao responsável.",
      );
    const marks = normalizeMarks(input.marks);
    const [after] = await tx
      .insert(schema.crmHostingDigestSettingTable)
      .values({
        workspaceId: s.workspaceId,
        enabled: input.enabled,
        marks,
        includeOwner: input.includeOwner,
        version: input.version + 1,
      })
      .onConflictDoUpdate({
        target: schema.crmHostingDigestSettingTable.workspaceId,
        set: {
          enabled: input.enabled,
          marks,
          includeOwner: input.includeOwner,
          version: input.version + 1,
        },
      })
      .returning();
    const previous = await tx
      .select({ userId: schema.crmHostingDigestRecipientTable.userId })
      .from(schema.crmHostingDigestRecipientTable)
      .where(
        eq(schema.crmHostingDigestRecipientTable.workspaceId, s.workspaceId),
      );
    await tx
      .delete(schema.crmHostingDigestRecipientTable)
      .where(
        eq(schema.crmHostingDigestRecipientTable.workspaceId, s.workspaceId),
      );
    if (input.recipientUserIds.length)
      await tx.insert(schema.crmHostingDigestRecipientTable).values(
        input.recipientUserIds.map((userId) => ({
          workspaceId: s.workspaceId,
          userId,
        })),
      );
    await audit(
      tx,
      s.workspaceId,
      s.userId,
      s.workspaceId,
      "configuracao",
      { ...before, recipientUserIds: previous.map((p) => p.userId) },
      { ...after, recipientUserIds: input.recipientUserIds },
    );
  });
  return getConfig(s.workspaceId);
}

/** O que sairia hoje, sem registrar nada. */
export async function previewDue(workspaceId: string) {
  const reference = today();
  const [settings, candidates, existing] = await Promise.all([
    settingsOf(db, workspaceId),
    loadCandidates(db, workspaceId),
    existingKeys(db, workspaceId),
  ]);
  const planned = planDigest(candidates, existing, settings.marks, reference);
  return {
    reference,
    enabled: settings.enabled,
    items: planned
      .filter((p) => p.listed)
      .map((p) => ({
        companyId: p.candidate.companyId,
        companyName: p.candidate.companyName,
        provider: p.candidate.provider,
        domain: p.candidate.domain,
        renewsOn: p.candidate.renewsOn,
        daysRemaining: p.daysRemaining,
        markDays: p.markDays,
      })),
  };
}

/**
 * Registra o aviso do dia (se houver algo novo) sob um lock por workspace.
 * Os itens ficam gravados com chave única por empresa, data de renovação e
 * marca, então rodar de novo nunca repete uma empresa.
 */
export async function claimRun(workspaceId: string) {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`hosting-digest:${workspaceId}`},0))`,
    );
    const settings = await settingsOf(tx, workspaceId);
    if (!settings.enabled) return null;
    const candidates = await loadCandidates(tx, workspaceId);
    const existing = await existingKeys(tx, workspaceId);
    const planned = planDigest(candidates, existing, settings.marks, today());
    const listed = planned.filter((p) => p.listed);
    if (!listed.length) return null;
    const members = await membersOf(tx, workspaceId);
    const memberById = new Map(members.map((m) => [m.userId, m]));
    const recipientRows = await tx
      .select({ userId: schema.crmHostingDigestRecipientTable.userId })
      .from(schema.crmHostingDigestRecipientTable)
      .where(
        eq(schema.crmHostingDigestRecipientTable.workspaceId, workspaceId),
      );
    const recipients = recipientRows.flatMap((r) => {
      const m = memberById.get(r.userId);
      return m?.email ? [m] : [];
    });
    const owners = settings.includeOwner ? members.filter((m) => m.email) : [];
    const deliveries = planDeliveries({
      listed: listed.map((p) => ({
        companyId: p.candidate.companyId,
        ownerUserId: p.candidate.ownerUserId,
      })),
      recipients,
      owners,
      includeOwner: settings.includeOwner,
    });
    // Sem ninguém para receber, nada é registrado: a empresa continua pendente.
    if (!deliveries.length) return null;
    const [run] = await tx
      .insert(schema.crmHostingDigestRunTable)
      .values({
        workspaceId,
        deliveries: deliveries.map((d) => ({
          ...d,
          status: "pending" as const,
          error: null,
        })),
      })
      .returning();
    if (!run) throw new Error("Falha ao registrar o aviso");
    await tx.insert(schema.crmHostingDigestItemTable).values(
      planned.map((p) => {
        const { companyId, renewsOn, ...snapshot } = p.candidate;
        return {
          workspaceId,
          runId: run.id,
          companyId,
          renewsOn,
          markDays: p.markDays,
          listed: p.listed,
          snapshot,
        };
      }),
    );
    await audit(tx, workspaceId, null, run.id, "aviso_registrado", null, {
      companies: listed.length,
      recipients: deliveries.length,
    });
    return run;
  });
}

/** Envia (ou reenvia) o que ainda não foi aceito. Idempotente por lease. */
export async function deliverRun(runId: string, now = new Date()) {
  const run = await db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(schema.crmHostingDigestRunTable)
      .where(
        and(
          eq(schema.crmHostingDigestRunTable.id, runId),
          eq(schema.crmHostingDigestRunTable.status, "pending"),
          lte(schema.crmHostingDigestRunTable.nextAttemptAt, now),
        ),
      )
      .for("update", { skipLocked: true });
    if (!row) return null;
    await tx
      .update(schema.crmHostingDigestRunTable)
      .set({ nextAttemptAt: new Date(Date.now() + LEASE_MS) })
      .where(eq(schema.crmHostingDigestRunTable.id, runId));
    return row;
  });
  if (!run) return null;
  const items = await db
    .select()
    .from(schema.crmHostingDigestItemTable)
    .where(
      and(
        eq(schema.crmHostingDigestItemTable.runId, runId),
        eq(schema.crmHostingDigestItemTable.listed, true),
      ),
    );
  const lines: DigestLine[] = items.map((i) => ({
    companyId: i.companyId,
    markDays: i.markDays,
    renewsOn: i.renewsOn,
    daysRemaining: Math.max(
      0,
      Math.round((Date.parse(i.renewsOn) - Date.parse(today())) / 86_400_000),
    ),
    snapshot: i.snapshot,
  }));
  const clientUrl = process.env.KANEO_CLIENT_URL || "http://localhost:5173";
  let config: Awaited<ReturnType<typeof getRuntimeSmtpEmailConfig>> | null =
    null;
  try {
    config = await getRuntimeSmtpEmailConfig();
  } catch {
    config = null;
  }
  const deliveries: HostingDigestDelivery[] = [];
  for (const d of run.deliveries) {
    if (d.status === "accepted") {
      deliveries.push(d);
      continue;
    }
    const own = lines.filter((l) => d.companyIds.includes(l.companyId));
    if (!own.length) {
      deliveries.push({ ...d, status: "accepted" as const, error: null });
      continue;
    }
    const { subject, text } = buildDigestEmail(own, {
      clientUrl,
      workspaceId: run.workspaceId,
    });
    try {
      const result = config
        ? await sendClientNoticeEmail(d.email, subject, text, config)
        : { success: false };
      deliveries.push(
        result.success
          ? { ...d, status: "accepted" as const, error: null }
          : {
              ...d,
              status: "failed" as const,
              error:
                "SMTP não configurado. Configure o envio de e-mails do sistema.",
            },
      );
    } catch {
      deliveries.push({
        ...d,
        status: "failed" as const,
        error:
          "O servidor de e-mail não aceitou o envio. Nova tentativa programada.",
      });
    }
  }
  const attempts = run.attempts + 1;
  const done = deliveries.every((d) => d.status === "accepted");
  const status = done
    ? "sent"
    : attempts >= MAX_ATTEMPTS
      ? "failed"
      : "pending";
  const delay =
    RETRY_DELAYS[Math.min(attempts - 1, RETRY_DELAYS.length - 1)] ?? 0;
  return db.transaction(async (tx) => {
    const [saved] = await tx
      .update(schema.crmHostingDigestRunTable)
      .set({
        deliveries,
        attempts,
        status,
        nextAttemptAt: new Date(
          Date.now() + (status === "pending" ? delay : 0),
        ),
      })
      .where(eq(schema.crmHostingDigestRunTable.id, runId))
      .returning();
    await audit(tx, run.workspaceId, null, runId, "resultado_envio", null, {
      status,
      attempts,
      accepted: deliveries.filter((d) => d.status === "accepted").length,
      failed: deliveries.filter((d) => d.status !== "accepted").length,
    });
    return saved ?? null;
  });
}

export async function retryRun(s: DigestScope, runId: string) {
  await db.transaction(async (tx) => {
    const [run] = await tx
      .select()
      .from(schema.crmHostingDigestRunTable)
      .where(
        and(
          eq(schema.crmHostingDigestRunTable.id, runId),
          eq(schema.crmHostingDigestRunTable.workspaceId, s.workspaceId),
        ),
      )
      .for("update");
    if (!run) fail(404, "Aviso não encontrado.");
    if (run.status !== "failed")
      fail(409, "Somente avisos com falha podem ser reenviados.");
    await tx
      .update(schema.crmHostingDigestRunTable)
      .set({
        status: "pending",
        attempts: 0,
        nextAttemptAt: new Date(),
        deliveries: run.deliveries.map((d) =>
          d.status === "accepted"
            ? d
            : { ...d, status: "pending" as const, error: null },
        ),
      })
      .where(eq(schema.crmHostingDigestRunTable.id, runId));
    await audit(tx, s.workspaceId, s.userId, runId, "reenvio", null, {
      previousAttempts: run.attempts,
    });
  });
  await deliverRun(runId);
  return (await getConfig(s.workspaceId)).runs.find((r) => r.id === runId);
}

/** Rotina agendada: registra o aviso do dia e envia/retenta os pendentes. */
export async function processDigests(now = new Date()) {
  let claimed = 0;
  let delivered = 0;
  if (localHour(now) >= SEND_FROM_HOUR) {
    const enabled = await db
      .select({
        workspaceId: schema.crmHostingDigestSettingTable.workspaceId,
      })
      .from(schema.crmHostingDigestSettingTable)
      .where(eq(schema.crmHostingDigestSettingTable.enabled, true));
    for (const { workspaceId } of enabled) {
      try {
        if (await claimRun(workspaceId)) claimed++;
      } catch (error) {
        console.error("Hosting digest claim failed", workspaceId, error);
      }
    }
  }
  const due = await db
    .select({ id: schema.crmHostingDigestRunTable.id })
    .from(schema.crmHostingDigestRunTable)
    .where(
      and(
        eq(schema.crmHostingDigestRunTable.status, "pending"),
        lte(schema.crmHostingDigestRunTable.nextAttemptAt, now),
      ),
    )
    .orderBy(asc(schema.crmHostingDigestRunTable.createdAt))
    .limit(50);
  for (const { id } of due) {
    try {
      if (await deliverRun(id, now)) delivered++;
    } catch (error) {
      console.error("Hosting digest delivery failed", id, error);
    }
  }
  return { claimed, delivered };
}
