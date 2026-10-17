import { and, eq, inArray, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../../database";
import {
  crmCompanyTable,
  crmContactTable,
  crmDealTable,
  crmSegmentTable,
  crmSourceTable,
  crmStageTable,
  userTable,
} from "../../../database/schema";
import { withNextDealNumber } from "../../shared/deal-number";
import {
  type ImportEntity,
  type ImportRow,
  normalizeDomain,
  parseDate,
  parseMoneyCents,
  parsePersonType,
  parseState,
  parseStatus,
  parseTaxId,
  REQUIRED_FIELD,
  text,
} from "./fields";

export type DuplicatePolicy = "skip" | "update" | "create";

export type RowOutcome = {
  line: number;
  status: "created" | "updated" | "skipped" | "error";
  message?: string;
  /** Avisos não impedem a linha: documento inválido, UF desconhecida. */
  warnings?: string[];
  id?: string;
};

type Ctx = {
  workspaceId: string;
  ownerUserId: string;
  entity: ImportEntity;
  policy: DuplicatePolicy;
  /** Pré-visualização não escreve nada: diz o que aconteceria. */
  dryRun: boolean;
};

/* ------------------------------------------------------- listas e buscas */

/**
 * Origem e segmento da planilha viram linhas de lista, criadas na hora.
 *
 * Sem isso, importar uma base de trezentos clientes deixaria trezentas
 * classificações em branco para alguém preencher à mão depois — que é
 * exatamente o trabalho que a importação existe para poupar.
 */
async function resolveListValue(
  table: typeof crmSourceTable | typeof crmSegmentTable,
  workspaceId: string,
  value: string | null,
  dryRun: boolean,
) {
  if (!value) return null;

  const [existing] = await db
    .select({ id: table.id })
    .from(table)
    .where(
      and(
        eq(table.workspaceId, workspaceId),
        sql`lower(${table.name}) = lower(${value})`,
      ),
    )
    .limit(1);

  if (existing) return existing.id;
  if (dryRun) return null;

  const [created] = await db
    .insert(table)
    .values({ workspaceId, name: value })
    .returning({ id: table.id });

  return created?.id ?? null;
}

/** Empresa referida por nome ou documento — o que a planilha tiver. */
async function findCompany(
  workspaceId: string,
  reference: string | null,
  taxId: string | null,
) {
  if (!reference && !taxId) return null;

  const [byTaxId] = taxId
    ? await db
        .select({ id: crmCompanyTable.id })
        .from(crmCompanyTable)
        .where(
          and(
            eq(crmCompanyTable.workspaceId, workspaceId),
            eq(crmCompanyTable.taxId, taxId),
          ),
        )
        .limit(1)
    : [];
  if (byTaxId) return byTaxId.id;

  if (!reference) return null;

  const [byName] = await db
    .select({ id: crmCompanyTable.id })
    .from(crmCompanyTable)
    .where(
      and(
        eq(crmCompanyTable.workspaceId, workspaceId),
        sql`lower(${crmCompanyTable.name}) = lower(${reference})`,
      ),
    )
    .limit(1);

  return byName?.id ?? null;
}

/* ----------------------------------------------------------- por entidade */

async function importCompany(row: ImportRow, ctx: Ctx, warnings: string[]) {
  const name = text(row.name);
  if (!name) throw new Error("Sem nome.");

  const personType = parsePersonType(row.personType, text(row.taxId));
  const { taxId, warning } = parseTaxId(row.taxId, personType);
  if (warning) warnings.push(warning);

  const domain = normalizeDomain(row.domain);
  const state = parseState(row.state);
  if (row.state && !state) {
    warnings.push(`UF "${row.state}" não existe; a linha entrou sem ela.`);
  }

  // Documento é a chave forte; domínio e nome resolvem quem não tem CNPJ.
  const existingId = await findCompany(ctx.workspaceId, name, taxId);

  const values = {
    workspaceId: ctx.workspaceId,
    name,
    legalName: text(row.legalName),
    taxId,
    personType,
    phone: text(row.phone),
    domain,
    website: text(row.website),
    billingEmail: text(row.billingEmail),
    segmentId: await resolveListValue(
      crmSegmentTable,
      ctx.workspaceId,
      text(row.segment),
      ctx.dryRun,
    ),
    sourceId: await resolveListValue(
      crmSourceTable,
      ctx.workspaceId,
      text(row.source),
      ctx.dryRun,
    ),
    status: parseStatus(row.status) ?? ("prospect" as const),
    clientSince: parseDate(row.clientSince),
    addressLine: text(row.addressLine),
    addressNumber: text(row.addressNumber),
    district: text(row.district),
    city: text(row.city),
    state,
    postalCode: text(row.postalCode),
    description: text(row.description),
    ownerUserId: ctx.ownerUserId,
  };

  if (existingId) {
    if (ctx.policy === "skip") {
      return { status: "skipped" as const, id: existingId };
    }
    if (ctx.policy === "update") {
      if (ctx.dryRun) return { status: "updated" as const, id: existingId };
      const [updated] = await db
        .update(crmCompanyTable)
        .set(values)
        .where(eq(crmCompanyTable.id, existingId))
        .returning({ id: crmCompanyTable.id });
      return { status: "updated" as const, id: updated?.id };
    }
    // política "create": o documento é único por workspace, então a cópia
    // entra sem ele para não bater na constraint.
    values.taxId = null;
  }

  if (ctx.dryRun) return { status: "created" as const };

  const [created] = await db
    .insert(crmCompanyTable)
    .values(values)
    .returning({ id: crmCompanyTable.id });

  return { status: "created" as const, id: created?.id };
}

async function importContact(row: ImportRow, ctx: Ctx, warnings: string[]) {
  const firstName = text(row.firstName);
  if (!firstName) throw new Error("Sem nome.");

  const email = text(row.email)?.toLowerCase() ?? null;
  const companyReference = text(row.company);
  const companyId = await findCompany(ctx.workspaceId, companyReference, null);

  if (companyReference && !companyId) {
    warnings.push(
      `Empresa "${companyReference}" não encontrada; o contato entrou sem vínculo.`,
    );
  }

  const values = {
    workspaceId: ctx.workspaceId,
    companyId,
    firstName,
    lastName: text(row.lastName),
    email,
    phone: text(row.phone),
    mobile: text(row.mobile),
    jobTitle: text(row.jobTitle),
    notes: text(row.notes),
    ownerUserId: ctx.ownerUserId,
  };

  // E-mail é a chave de pessoa; sem ele, toda linha é gente nova.
  const [existing] = email
    ? await db
        .select({ id: crmContactTable.id })
        .from(crmContactTable)
        .where(
          and(
            eq(crmContactTable.workspaceId, ctx.workspaceId),
            sql`lower(${crmContactTable.email}) = ${email}`,
          ),
        )
        .limit(1)
    : [];

  if (existing) {
    if (ctx.policy === "skip") {
      return { status: "skipped" as const, id: existing.id };
    }
    if (ctx.policy === "update") {
      if (ctx.dryRun) return { status: "updated" as const, id: existing.id };
      const [updated] = await db
        .update(crmContactTable)
        .set(values)
        .where(eq(crmContactTable.id, existing.id))
        .returning({ id: crmContactTable.id });
      return { status: "updated" as const, id: updated?.id };
    }
  }

  if (ctx.dryRun) return { status: "created" as const };

  const [created] = await db
    .insert(crmContactTable)
    .values(values)
    .returning({ id: crmContactTable.id });

  return { status: "created" as const, id: created?.id };
}

type DealContext = {
  pipelineId: string;
  stages: Array<{ id: string; name: string; outcome: string }>;
};

async function importDeal(
  row: ImportRow,
  ctx: Ctx,
  warnings: string[],
  deal: DealContext,
) {
  const title = text(row.title);
  if (!title) throw new Error("Sem título.");

  const companyReference = text(row.company);
  const companyId = await findCompany(ctx.workspaceId, companyReference, null);
  if (companyReference && !companyId) {
    warnings.push(
      `Empresa "${companyReference}" não encontrada; o negócio entrou sem cliente.`,
    );
  }

  const stageName = text(row.stage);
  const stage = stageName
    ? deal.stages.find(
        (item) => item.name.toLowerCase() === stageName.toLowerCase(),
      )
    : undefined;
  if (stageName && !stage) {
    warnings.push(
      `Etapa "${stageName}" não existe no funil; o negócio entrou na primeira.`,
    );
  }
  const target = stage ?? deal.stages[0];
  if (!target) throw new Error("O funil não tem etapas.");

  const ownerEmail = text(row.ownerEmail)?.toLowerCase();
  const [owner] = ownerEmail
    ? await db
        .select({ id: userTable.id })
        .from(userTable)
        .where(sql`lower(${userTable.email}) = ${ownerEmail}`)
        .limit(1)
    : [];
  if (ownerEmail && !owner) {
    warnings.push(
      `Responsável "${ownerEmail}" não é usuário; ficou com quem importou.`,
    );
  }

  if (ctx.dryRun) return { status: "created" as const };

  const sourceId = await resolveListValue(
    crmSourceTable,
    ctx.workspaceId,
    text(row.source),
    ctx.dryRun,
  );

  const now = new Date();
  const status =
    target.outcome === "open"
      ? ("open" as const)
      : (target.outcome as "won" | "lost");

  const created = await withNextDealNumber(ctx.workspaceId, (number) =>
    db
      .insert(crmDealTable)
      .values({
        workspaceId: ctx.workspaceId,
        number,
        pipelineId: deal.pipelineId,
        stageId: target.id,
        title,
        companyId,
        ownerUserId: owner?.id ?? ctx.ownerUserId,
        createdByUserId: ctx.ownerUserId,
        valueCents: parseMoneyCents(row.value) ?? 0,
        expectedCloseDate: parseDate(row.expectedCloseDate),
        sourceId,
        status,
        wonAt: status === "won" ? now : null,
        lostAt: status === "lost" ? now : null,
        stageEnteredAt: now,
      })
      .returning({ id: crmDealTable.id }),
  );

  return { status: "created" as const, id: created[0]?.id };
}

/* ------------------------------------------------------------- orquestra */

/**
 * Importa um lote.
 *
 * Um lote por transação, e não o arquivo inteiro: uma planilha de vinte mil
 * linhas numa transação só segura o banco e, se falhar na linha 19.999,
 * devolve tudo ao zero. Aqui, o que entrou fica, e o relatório final diz o
 * que sobrou de fora.
 */
export async function importRows({
  workspaceId,
  ownerUserId,
  entity,
  rows,
  policy,
  dryRun,
  firstLine,
  pipelineId,
}: {
  workspaceId: string;
  ownerUserId: string;
  entity: ImportEntity;
  rows: ImportRow[];
  policy: DuplicatePolicy;
  dryRun: boolean;
  firstLine: number;
  pipelineId?: string;
}): Promise<RowOutcome[]> {
  const dealContext =
    entity === "deal"
      ? await resolveDealContext(workspaceId, pipelineId)
      : undefined;

  const outcomes: RowOutcome[] = [];

  for (const [index, row] of rows.entries()) {
    const line = firstLine + index;
    const warnings: string[] = [];

    if (!text(row[REQUIRED_FIELD[entity]])) {
      outcomes.push({
        line,
        status: "error",
        message: `Coluna obrigatória "${REQUIRED_FIELD[entity]}" vazia.`,
      });
      continue;
    }

    try {
      const result =
        entity === "company"
          ? await importCompany(
              row,
              { workspaceId, ownerUserId, entity, policy, dryRun },
              warnings,
            )
          : entity === "contact"
            ? await importContact(
                row,
                { workspaceId, ownerUserId, entity, policy, dryRun },
                warnings,
              )
            : await importDeal(
                row,
                { workspaceId, ownerUserId, entity, policy, dryRun },
                warnings,
                dealContext as DealContext,
              );

      outcomes.push({
        line,
        status: result.status,
        id: result.id,
        ...(warnings.length > 0 ? { warnings } : {}),
      });
    } catch (error) {
      outcomes.push({
        line,
        status: "error",
        message: error instanceof Error ? error.message : "Falha ao importar.",
        ...(warnings.length > 0 ? { warnings } : {}),
      });
    }
  }

  return outcomes;
}

async function resolveDealContext(
  workspaceId: string,
  pipelineId?: string,
): Promise<DealContext> {
  const stages = await db
    .select({
      id: crmStageTable.id,
      name: crmStageTable.name,
      outcome: crmStageTable.outcome,
      pipelineId: crmStageTable.pipelineId,
    })
    .from(crmStageTable)
    .where(
      pipelineId
        ? eq(crmStageTable.pipelineId, pipelineId)
        : inArray(
            crmStageTable.pipelineId,
            db
              .select({ id: sql<string>`id` })
              .from(sql`crm_pipeline`)
              .where(
                sql`workspace_id = ${workspaceId} and is_default = true and archived_at is null`,
              ),
          ),
    )
    .orderBy(crmStageTable.position);

  if (stages.length === 0) {
    throw new HTTPException(400, {
      message: "Este workspace não tem funil com etapas para receber negócios.",
    });
  }

  return {
    pipelineId: stages[0]?.pipelineId as string,
    stages,
  };
}
