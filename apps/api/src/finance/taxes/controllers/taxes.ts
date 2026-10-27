import { createHash } from "node:crypto";
import { and, desc, eq, lte, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db, { schema } from "../../../database";
import { loadEntries } from "../../controllers/finance";
import type { Tx } from "../../performance/snapshot";
import {
  calculateSale,
  type Simulation,
  type TaxFilters,
  taxReport,
} from "../model";
import type { CalculationInput, ProfileInput } from "../validation";

function fail(status: 400 | 404 | 409 | 413, message: string): never {
  throw new HTTPException(status, { message });
}
async function audit(
  tx: Tx,
  workspaceId: string,
  actorUserId: string,
  entityId: string,
  action: string,
  before: unknown,
  after: unknown,
) {
  await tx.insert(schema.auditLogTable).values({
    workspaceId,
    actorUserId,
    entityType: "finance_tax",
    entityId,
    action: `finance.tax.${action}`,
    summary: `Taxas e impostos: ${action}`,
    before,
    after,
  });
}
export async function configuration(workspaceId: string) {
  const { financeTaxProfileTable: p, financeTaxProfileRevisionTable: r } =
    schema;
  const rows = await db
    .select({ profile: p, revision: r })
    .from(p)
    .innerJoin(r, and(eq(r.profileId, p.id), eq(r.sequence, p.version)))
    .where(eq(p.workspaceId, workspaceId))
    .orderBy(desc(p.updatedAt))
    .limit(1001);
  if (rows.length > 1000)
    fail(413, "Mais de 1.000 perfis. Solicite processamento de grande volume.");
  return {
    profiles: rows.map(({ profile, revision }) => ({
      ...profile,
      notes: revision.notes,
      items: revision.items,
      revisionId: revision.id,
    })),
  };
}
export async function profileHistory(workspaceId: string, id: string) {
  const { financeTaxProfileTable: p, financeTaxProfileRevisionTable: r } =
    schema;
  const [profile] = await db
    .select()
    .from(p)
    .where(and(eq(p.id, id), eq(p.workspaceId, workspaceId)));
  if (!profile) fail(404, "Perfil não encontrado.");
  const revisions = await db
    .select()
    .from(r)
    .where(eq(r.profileId, id))
    .orderBy(desc(r.sequence));
  return { profile, revisions };
}
export async function saveProfile(
  workspaceId: string,
  actor: string,
  input: ProfileInput,
  id?: string,
) {
  return db.transaction(async (tx) => {
    const { items, notes, version, ...fields } = input;
    let before: typeof schema.financeTaxProfileTable.$inferSelect | undefined;
    if (id) {
      [before] = await tx
        .select()
        .from(schema.financeTaxProfileTable)
        .where(
          and(
            eq(schema.financeTaxProfileTable.id, id),
            eq(schema.financeTaxProfileTable.workspaceId, workspaceId),
          ),
        )
        .for("update");
      if (!before) fail(404, "Perfil não encontrado.");
    }
    if ((before?.version ?? 0) !== version)
      fail(409, "Perfil alterado. Atualize a tela.");
    const [profile] = before
      ? await tx
          .update(schema.financeTaxProfileTable)
          .set({ ...fields, version: version + 1 })
          .where(eq(schema.financeTaxProfileTable.id, before.id))
          .returning()
      : await tx
          .insert(schema.financeTaxProfileTable)
          .values({ ...fields, workspaceId, version: 1 })
          .returning();
    if (!profile) throw new Error("Falha ao salvar perfil");
    const [revision] = await tx
      .insert(schema.financeTaxProfileRevisionTable)
      .values({
        profileId: profile.id,
        sequence: profile.version,
        name: profile.name,
        items,
        notes,
        actorUserId: actor,
      })
      .returning();
    await audit(tx, workspaceId, actor, profile.id, "perfil", before ?? null, {
      profile,
      revision,
    });
    return { ...profile, items, notes, revisionId: revision?.id };
  });
}
async function compute(tx: Tx, workspaceId: string, input: CalculationInput) {
  const { financeTaxProfileTable: p, financeTaxProfileRevisionTable: r } =
    schema;
  const [row] = await tx
    .select({ profile: p, revision: r })
    .from(p)
    .innerJoin(r, and(eq(r.profileId, p.id), eq(r.sequence, p.version)))
    .where(and(eq(p.workspaceId, workspaceId), eq(p.id, input.profileId)))
    .for("share");
  if (!row) fail(404, "Perfil não encontrado.");
  if (!row.profile.isActive)
    fail(
      400,
      "Perfil inativo. Selecione um perfil ativo para uma nova simulação.",
    );
  if (row.profile.version !== input.profileVersion)
    fail(409, "O perfil mudou. Atualize os parâmetros e calcule novamente.");
  let serviceName: string | null = null;
  let sellerName: string | null = null;
  if (input.serviceId) {
    const [service] = await tx
      .select({ name: schema.crmServiceTable.name })
      .from(schema.crmServiceTable)
      .where(
        and(
          eq(schema.crmServiceTable.id, input.serviceId),
          eq(schema.crmServiceTable.workspaceId, workspaceId),
        ),
      );
    if (!service) fail(400, "Serviço não pertence ao workspace.");
    serviceName = service.name;
  }
  if (input.sellerId) {
    const [seller] = await tx
      .select({ name: schema.userTable.name })
      .from(schema.workspaceUserTable)
      .innerJoin(
        schema.userTable,
        eq(schema.userTable.id, schema.workspaceUserTable.userId),
      )
      .where(
        and(
          eq(schema.workspaceUserTable.workspaceId, workspaceId),
          eq(schema.workspaceUserTable.userId, input.sellerId),
        ),
      );
    if (!seller) fail(400, "Vendedor não pertence ao workspace.");
    sellerName = seller.name;
  }
  let rateBps = input.commissionMode === "manual" ? input.commissionRateBps : 0;
  let commissionSource =
    input.commissionMode === "none"
      ? "Sem comissão"
      : `Manual: ${rateBps / 100}%`;
  if (input.commissionMode === "service") {
    if (!input.serviceId)
      fail(400, "Selecione um serviço para utilizar sua regra de comissão.");
    const [rule] = await tx
      .select()
      .from(schema.financeCommissionRuleTable)
      .where(
        and(
          eq(schema.financeCommissionRuleTable.workspaceId, workspaceId),
          eq(schema.financeCommissionRuleTable.serviceId, input.serviceId),
          lte(schema.financeCommissionRuleTable.effectiveDate, input.date),
        ),
      )
      .orderBy(
        desc(schema.financeCommissionRuleTable.effectiveDate),
        desc(schema.financeCommissionRuleTable.sequence),
      )
      .limit(1);
    if (!rule)
      fail(
        400,
        "Sem regra de comissão vigente na data. Cadastre a regra ou escolha comissão manual.",
      );
    rateBps = rule.rateBps;
    commissionSource = `Regra ${rule.id} · versão ${rule.sequence} · ${rateBps / 100}% na venda · base recebido. Projeção considera recebimento integral, sem descontos.`;
  }
  const normalized = {
    mode: input.mode,
    amountCents: input.amountCents,
    costCents: input.costCents,
    commissionRateBps: rateBps,
  };
  try {
    const computed = {
      profileId: row.profile.id,
      revisionId: row.revision.id,
      snapshot: {
        profileName: row.revision.name,
        profileVersion: row.revision.sequence,
        notes: row.revision.notes,
        serviceName,
        sellerName,
        input: normalized,
        result: calculateSale(row.revision.items, normalized),
        commissionSource,
      },
    };
    return {
      ...computed,
      calculationSignature: createHash("sha256")
        .update(JSON.stringify(computed))
        .digest("hex"),
    };
  } catch (error) {
    if (error instanceof RangeError) fail(400, error.message);
    throw error;
  }
}
export async function calculate(workspaceId: string, input: CalculationInput) {
  return db.transaction((tx) => compute(tx, workspaceId, input));
}
export async function saveSimulation(
  workspaceId: string,
  actor: string,
  input: {
    calculation: CalculationInput;
    calculationSignature: string;
    title: string;
    requestId: string;
  },
) {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`tax:${workspaceId}:${input.requestId}`},0))`,
    );
    const signature = createHash("sha256")
      .update(
        JSON.stringify({
          calculation: input.calculation,
          title: input.title,
          calculationSignature: input.calculationSignature,
        }),
      )
      .digest("hex");
    const [retry] = await tx
      .select()
      .from(schema.financeTaxSimulationTable)
      .where(
        and(
          eq(schema.financeTaxSimulationTable.workspaceId, workspaceId),
          eq(schema.financeTaxSimulationTable.requestId, input.requestId),
        ),
      );
    if (retry) {
      if (retry.requestSignature !== signature)
        fail(409, "Solicitação já utilizada com outros dados.");
      return retry;
    }
    const computed = await compute(tx, workspaceId, input.calculation);
    if (computed.calculationSignature !== input.calculationSignature)
      fail(
        409,
        "Os parâmetros da simulação mudaram. Calcule novamente antes de salvar.",
      );
    const [saved] = await tx
      .insert(schema.financeTaxSimulationTable)
      .values({
        workspaceId,
        actorUserId: actor,
        profileId: computed.profileId,
        revisionId: computed.revisionId,
        requestId: input.requestId,
        requestSignature: signature,
        title: input.title,
        date: input.calculation.date,
        serviceId: input.calculation.serviceId,
        sellerId: input.calculation.sellerId,
        snapshot: computed.snapshot,
      })
      .returning();
    if (!saved) throw new Error("Falha ao salvar simulação");
    await audit(tx, workspaceId, actor, saved.id, "simulacao", null, saved);
    return saved;
  });
}
export async function loadSimulations(
  workspaceId: string,
): Promise<Simulation[]> {
  const rows = await db
    .select()
    .from(schema.financeTaxSimulationTable)
    .where(eq(schema.financeTaxSimulationTable.workspaceId, workspaceId))
    .orderBy(
      desc(schema.financeTaxSimulationTable.date),
      desc(schema.financeTaxSimulationTable.createdAt),
    )
    .limit(10001);
  if (rows.length > 10000)
    fail(
      413,
      "Mais de 10.000 simulações. Solicite processamento de grande volume.",
    );
  return rows.map(({ snapshot, ...row }) => ({ ...row, ...snapshot }));
}
export async function report(workspaceId: string, f: TaxFilters) {
  const [entries, saved] = await Promise.all([
    loadEntries(workspaceId),
    loadSimulations(workspaceId),
  ]);
  return taxReport(entries, saved, f);
}
