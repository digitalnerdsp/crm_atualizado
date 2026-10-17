import { and, asc, count, desc, eq, inArray, max, sum } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../../database";
import {
  type CrmContractEventType,
  type CrmContractStatus,
  crmCompanyTable,
  crmContractEventTable,
  crmContractServiceTable,
  crmContractTable,
  crmDealServiceTable,
  crmDealTable,
  crmLostReasonTable,
  userTable,
  workspaceUserTable,
} from "../../../database/schema";
import { publishEvent } from "../../../events";
import {
  lockContract,
  syncContractBilling,
} from "../../../finance/recurrence/billing";
import {
  markCompanyActive,
  settleCompanyAfterContractEnd,
} from "../../shared/company-lifecycle";
import {
  isRecurring,
  sumMonthlyEquivalents,
} from "../../shared/contract-value";
import { withNextContractNumber } from "../../shared/deal-number";
import { allOf, ownerScope } from "../../shared/list-filters";
import type { CrmVisibility } from "../../shared/resolve-visibility";
import {
  type ResolvedServiceLine,
  resolveServiceLines,
  type ServiceLineInput,
} from "../../shared/service-lines";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/* ---------------------------------------------------------------- linhas */

/** Contrato só leva o que se repete: cobrança pontual fica no negócio. */
function assertRecurringLines(lines: ReadonlyArray<ResolvedServiceLine>) {
  const oneTime = lines.find((line) => !isRecurring(line.billingType));
  if (oneTime) {
    throw new HTTPException(400, {
      message: `"${oneTime.name}" é cobrança pontual e não entra em contrato. Cobrança pontual fica no negócio.`,
    });
  }
}

/** Valor mensal do contrato: a soma dos equivalentes mensais das linhas, ou
 * o valor informado quando o contrato não é detalhado por serviço. */
function resolveMonthlyValue(
  lines: ReadonlyArray<ResolvedServiceLine>,
  monthlyValueCents: number | undefined,
) {
  if (lines.length > 0) return sumMonthlyEquivalents(lines);
  if (monthlyValueCents === undefined) {
    throw new HTTPException(400, {
      message: "Informe os serviços do contrato ou o valor mensal.",
    });
  }
  return monthlyValueCents;
}

/** MRR efetivo: pausado, cancelado e encerrado não contam. */
function effectiveMrr(status: CrmContractStatus, monthlyValueCents: number) {
  return status === "active" ? monthlyValueCents : 0;
}

async function recordEvent(
  tx: Tx,
  event: {
    contractId: string;
    type: CrmContractEventType;
    from: number;
    to: number;
    occurredAt: Date;
    changedByUserId: string | null;
    note?: string | null;
  },
) {
  await tx.insert(crmContractEventTable).values({
    contractId: event.contractId,
    type: event.type,
    fromMonthlyValueCents: event.from,
    toMonthlyValueCents: event.to,
    occurredAt: event.occurredAt,
    changedByUserId: event.changedByUserId,
    note: event.note ?? null,
  });
}

/**
 * O histórico é lido em ordem de data: "o MRR em março" é a soma do último
 * evento de cada contrato até março. Um evento datado antes do último já
 * gravado embaralharia essa ordem — um cancelamento retroativo passaria para
 * trás de um reajuste que aconteceu depois dele.
 */
async function assertChronological(
  contractId: string,
  occurredAt: Date,
  executor: typeof db | Tx = db,
) {
  const [latest] = await executor
    .select({ at: max(crmContractEventTable.occurredAt) })
    .from(crmContractEventTable)
    .where(eq(crmContractEventTable.contractId, contractId));

  if (latest?.at && occurredAt < new Date(latest.at)) {
    throw new HTTPException(400, {
      message: `A data não pode ser anterior à última mudança do contrato (${new Date(latest.at).toLocaleDateString("pt-BR")}).`,
    });
  }
}

async function loadContract(workspaceId: string, contractId: string) {
  const [contract] = await db
    .select()
    .from(crmContractTable)
    .where(
      and(
        eq(crmContractTable.id, contractId),
        eq(crmContractTable.workspaceId, workspaceId),
      ),
    )
    .limit(1);

  if (!contract) {
    throw new HTTPException(404, { message: "Contract not found" });
  }
  return contract;
}

async function publishContractEvent(
  name: string,
  contract: { id: string; workspaceId: string; companyId: string },
) {
  await publishEvent(name, {
    contractId: contract.id,
    workspaceId: contract.workspaceId,
    companyId: contract.companyId,
  });
}

/* ---------------------------------------------------------------- criar */

export type ContractInput = {
  companyId: string;
  dealId?: string | null;
  title: string;
  startsAt: Date;
  endsAt?: Date | null;
  billingDay?: number | null;
  ownerUserId?: string | null;
  lines: ServiceLineInput[];
  monthlyValueCents?: number;
};

export async function createContract({
  workspaceId,
  actorUserId,
  input,
}: {
  workspaceId: string;
  actorUserId: string;
  input: ContractInput;
}) {
  const [company] = await db
    .select({
      id: crmCompanyTable.id,
      billingDay: crmCompanyTable.billingDay,
    })
    .from(crmCompanyTable)
    .where(
      and(
        eq(crmCompanyTable.id, input.companyId),
        eq(crmCompanyTable.workspaceId, workspaceId),
      ),
    )
    .limit(1);

  if (!company) {
    throw new HTTPException(404, { message: "Company not found" });
  }

  if (input.dealId) {
    const [deal] = await db
      .select({ companyId: crmDealTable.companyId })
      .from(crmDealTable)
      .where(
        and(
          eq(crmDealTable.id, input.dealId),
          eq(crmDealTable.workspaceId, workspaceId),
        ),
      )
      .limit(1);
    if (!deal) {
      throw new HTTPException(404, { message: "Deal not found" });
    }
    if (deal.companyId && deal.companyId !== input.companyId) {
      throw new HTTPException(400, {
        message: "O negócio é de outro cliente.",
      });
    }
  }

  if (input.endsAt && input.endsAt <= input.startsAt) {
    throw new HTTPException(400, {
      message: "O fim do contrato precisa ser depois do início.",
    });
  }

  const lines = await resolveServiceLines(workspaceId, input.lines);
  assertRecurringLines(lines);
  const monthlyValueCents = resolveMonthlyValue(lines, input.monthlyValueCents);

  const contract = await withNextContractNumber(workspaceId, (number) =>
    db.transaction(async (tx) => {
      const [created] = await tx
        .insert(crmContractTable)
        .values({
          workspaceId,
          number,
          companyId: input.companyId,
          dealId: input.dealId ?? null,
          title: input.title,
          startsAt: input.startsAt,
          endsAt: input.endsAt ?? null,
          monthlyValueCents,
          // o dia de vencimento do cliente vale para o contrato, salvo exceção
          billingDay: input.billingDay ?? company.billingDay ?? null,
          ownerUserId: input.ownerUserId ?? actorUserId,
          status: "active",
        })
        .returning();

      if (!created) {
        throw new HTTPException(500, { message: "Failed to create contract" });
      }

      if (lines.length > 0) {
        await tx
          .insert(crmContractServiceTable)
          .values(lines.map((line) => ({ ...line, contractId: created.id })));
      }

      // O evento nasce na data de início, não na de cadastro: um contrato
      // assinado hoje que começa em outubro não é MRR de setembro.
      await recordEvent(tx, {
        contractId: created.id,
        type: "created",
        from: 0,
        to: monthlyValueCents,
        occurredAt: input.startsAt,
        changedByUserId: actorUserId,
      });

      await markCompanyActive(tx, input.companyId, input.startsAt);

      return created;
    }),
  );

  await publishContractEvent("crm.contract.created", contract);
  return contract;
}

/**
 * Gera o contrato a partir dos itens recorrentes de um negócio ganho. Os itens
 * vão como estão — com a cópia de nome e preço do dia da venda —, e o início é
 * a data do ganho.
 */
export async function createContractFromDeal({
  workspaceId,
  actorUserId,
  dealId,
  overrides,
}: {
  workspaceId: string;
  actorUserId: string;
  dealId: string;
  overrides: {
    title?: string;
    startsAt?: Date;
    endsAt?: Date | null;
    billingDay?: number | null;
  };
}) {
  const [deal] = await db
    .select()
    .from(crmDealTable)
    .where(
      and(
        eq(crmDealTable.id, dealId),
        eq(crmDealTable.workspaceId, workspaceId),
      ),
    )
    .limit(1);

  if (!deal) throw new HTTPException(404, { message: "Deal not found" });

  if (deal.status !== "won") {
    throw new HTTPException(400, {
      message: "Só negócio ganho gera contrato.",
    });
  }
  if (!deal.companyId) {
    throw new HTTPException(400, {
      message: "Vincule um cliente ao negócio antes de gerar o contrato.",
    });
  }

  const [existing] = await db
    .select({ number: crmContractTable.number })
    .from(crmContractTable)
    .where(
      and(
        eq(crmContractTable.dealId, dealId),
        inArray(crmContractTable.status, ["active", "paused"]),
      ),
    )
    .limit(1);
  if (existing) {
    throw new HTTPException(409, {
      message: `Este negócio já gerou o contrato #${existing.number}.`,
    });
  }

  const items = await db
    .select()
    .from(crmDealServiceTable)
    .where(eq(crmDealServiceTable.dealId, dealId))
    .orderBy(asc(crmDealServiceTable.position));

  const recurring = items.filter((item) => isRecurring(item.billingType));
  if (recurring.length === 0) {
    throw new HTTPException(400, {
      message: "O negócio não tem serviço recorrente para virar contrato.",
    });
  }

  return createContract({
    workspaceId,
    actorUserId,
    input: {
      companyId: deal.companyId,
      dealId,
      title: overrides.title ?? deal.title,
      startsAt: overrides.startsAt ?? deal.wonAt ?? new Date(),
      endsAt: overrides.endsAt ?? null,
      billingDay: overrides.billingDay,
      ownerUserId: deal.ownerUserId,
      lines: recurring.map((item) => ({
        serviceId: item.serviceId,
        name: item.name,
        billingType: item.billingType,
        quantity: item.quantity,
        unitPriceCents: item.unitPriceCents,
        discountPercent: item.discountPercent,
      })),
    },
  });
}

/* ---------------------------------------------------------------- ler */

export async function getContracts({
  workspaceId,
  userId,
  visibility,
  status,
  companyId,
}: {
  workspaceId: string;
  userId: string;
  visibility: CrmVisibility;
  status?: CrmContractStatus;
  companyId?: string;
}) {
  const scope = allOf(
    eq(crmContractTable.workspaceId, workspaceId),
    ownerScope(crmContractTable.ownerUserId, visibility, userId),
    companyId ? eq(crmContractTable.companyId, companyId) : undefined,
  );

  const items = await db
    .select({
      contract: crmContractTable,
      company: { id: crmCompanyTable.id, name: crmCompanyTable.name },
    })
    .from(crmContractTable)
    .innerJoin(
      crmCompanyTable,
      eq(crmContractTable.companyId, crmCompanyTable.id),
    )
    .where(
      allOf(scope, status ? eq(crmContractTable.status, status) : undefined),
    )
    .orderBy(desc(crmContractTable.monthlyValueCents))
    .limit(500);

  // O resumo ignora o filtro de situação: o cabeçalho mostra a carteira
  // inteira mesmo quando a lista está filtrada em "pausados".
  const byStatus = await db
    .select({
      status: crmContractTable.status,
      total: count(),
      monthlyValueCents: sum(crmContractTable.monthlyValueCents),
    })
    .from(crmContractTable)
    .where(scope)
    .groupBy(crmContractTable.status);

  const summary = {
    activeMrrCents: 0,
    counts: { active: 0, paused: 0, cancelled: 0, finished: 0 } as Record<
      CrmContractStatus,
      number
    >,
  };
  for (const row of byStatus) {
    summary.counts[row.status] = row.total;
    if (row.status === "active") {
      summary.activeMrrCents = Number(row.monthlyValueCents ?? 0);
    }
  }

  return {
    summary,
    items: items.map((row) => ({ ...row.contract, company: row.company })),
  };
}

export async function getContract({
  workspaceId,
  contractId,
}: {
  workspaceId: string;
  contractId: string;
}) {
  const [row] = await db
    .select({
      contract: crmContractTable,
      company: { id: crmCompanyTable.id, name: crmCompanyTable.name },
      deal: {
        id: crmDealTable.id,
        number: crmDealTable.number,
        title: crmDealTable.title,
      },
      cancelReason: {
        id: crmLostReasonTable.id,
        name: crmLostReasonTable.name,
      },
    })
    .from(crmContractTable)
    .innerJoin(
      crmCompanyTable,
      eq(crmContractTable.companyId, crmCompanyTable.id),
    )
    .leftJoin(crmDealTable, eq(crmContractTable.dealId, crmDealTable.id))
    .leftJoin(
      crmLostReasonTable,
      eq(crmContractTable.cancelReasonId, crmLostReasonTable.id),
    )
    .where(
      and(
        eq(crmContractTable.id, contractId),
        eq(crmContractTable.workspaceId, workspaceId),
      ),
    )
    .limit(1);

  if (!row) throw new HTTPException(404, { message: "Contract not found" });

  const services = await db
    .select()
    .from(crmContractServiceTable)
    .where(eq(crmContractServiceTable.contractId, contractId))
    .orderBy(asc(crmContractServiceTable.position));

  const events = await db
    .select({
      id: crmContractEventTable.id,
      type: crmContractEventTable.type,
      fromMonthlyValueCents: crmContractEventTable.fromMonthlyValueCents,
      toMonthlyValueCents: crmContractEventTable.toMonthlyValueCents,
      occurredAt: crmContractEventTable.occurredAt,
      note: crmContractEventTable.note,
      changedBy: { id: userTable.id, name: userTable.name },
    })
    .from(crmContractEventTable)
    .leftJoin(
      userTable,
      eq(crmContractEventTable.changedByUserId, userTable.id),
    )
    .where(eq(crmContractEventTable.contractId, contractId))
    .orderBy(
      desc(crmContractEventTable.occurredAt),
      desc(crmContractEventTable.createdAt),
    );

  return {
    ...row.contract,
    company: row.company,
    deal: row.deal,
    cancelReason: row.cancelReason,
    services,
    events,
  };
}

/* ---------------------------------------------------------------- editar */

/** Campos que não mexem em valor nem em situação — esses têm rota própria,
 * porque são eles que escrevem o histórico. */
export async function updateContract({
  workspaceId,
  contractId,
  input,
  actorUserId,
}: {
  workspaceId: string;
  contractId: string;
  actorUserId?: string;
  input: {
    title?: string;
    endsAt?: Date | null;
    billingDay?: number | null;
    ownerUserId?: string | null;
  };
}) {
  return db.transaction(async (tx) => {
    const contract = await lockContract(tx, workspaceId, contractId);
    if (input.endsAt && input.endsAt <= contract.startsAt)
      throw new HTTPException(400, {
        message: "O fim do contrato precisa ser depois do início.",
      });
    if (input.ownerUserId) {
      const [member] = await tx
        .select({ id: workspaceUserTable.id })
        .from(workspaceUserTable)
        .where(
          and(
            eq(workspaceUserTable.workspaceId, workspaceId),
            eq(workspaceUserTable.userId, input.ownerUserId),
          ),
        );
      if (!member)
        throw new HTTPException(400, {
          message: "Responsável não pertence ao workspace.",
        });
    }
    const [updated] = await tx
      .update(crmContractTable)
      .set(input)
      .where(eq(crmContractTable.id, contract.id))
      .returning();
    const result = updated ?? contract;
    await syncContractBilling(tx, result, actorUserId ?? null, new Date());
    return result;
  });
}

/**
 * Reajuste, inclusão ou retirada de serviço. Grava `upgraded` ou
 * `downgraded` com o MRR efetivo antes e depois — em contrato pausado os dois
 * são zero, e o novo valor só passa a contar na retomada.
 */
export async function changeContractValue({
  workspaceId,
  contractId,
  actorUserId,
  lines,
  monthlyValueCents,
  note,
  occurredAt,
}: {
  workspaceId: string;
  contractId: string;
  actorUserId: string;
  lines?: ServiceLineInput[];
  monthlyValueCents?: number;
  note?: string | null;
  occurredAt?: Date;
}) {
  const contract = await loadContract(workspaceId, contractId);

  if (contract.status !== "active" && contract.status !== "paused") {
    throw new HTTPException(409, {
      message: "Contrato encerrado não muda de valor.",
    });
  }

  const at = occurredAt ?? new Date();
  await assertChronological(contract.id, at);

  const resolved =
    lines === undefined
      ? undefined
      : await resolveServiceLines(workspaceId, lines);
  if (resolved) assertRecurringLines(resolved);

  const nextValue = resolved
    ? resolveMonthlyValue(resolved, monthlyValueCents)
    : monthlyValueCents;

  if (nextValue === undefined) {
    throw new HTTPException(400, {
      message: "Informe os serviços do contrato ou o valor mensal.",
    });
  }

  const updated = await db.transaction(async (tx) => {
    const locked = await lockContract(tx, workspaceId, contractId);
    if (locked.status !== "active" && locked.status !== "paused")
      throw new HTTPException(409, {
        message: "Contrato encerrado não muda de valor.",
      });
    await assertChronological(locked.id, at, tx);
    if (locked.updatedAt.getTime() !== contract.updatedAt.getTime())
      throw new HTTPException(409, {
        message: "Contrato alterado simultaneamente. Atualize a consulta.",
      });
    if (resolved) {
      await tx
        .delete(crmContractServiceTable)
        .where(eq(crmContractServiceTable.contractId, contract.id));
      if (resolved.length > 0) {
        await tx
          .insert(crmContractServiceTable)
          .values(
            resolved.map((line) => ({ ...line, contractId: contract.id })),
          );
      }
    }

    const [row] = await tx
      .update(crmContractTable)
      .set({ monthlyValueCents: nextValue })
      .where(eq(crmContractTable.id, contract.id))
      .returning();

    // Trocar um serviço por outro de mesmo valor não é movimento de receita.
    if (nextValue !== contract.monthlyValueCents) {
      await recordEvent(tx, {
        contractId: contract.id,
        type:
          nextValue > contract.monthlyValueCents ? "upgraded" : "downgraded",
        from: effectiveMrr(contract.status, contract.monthlyValueCents),
        to: effectiveMrr(contract.status, nextValue),
        occurredAt: at,
        changedByUserId: actorUserId,
        note,
      });
    }

    await syncContractBilling(tx, row ?? contract, actorUserId, at);
    return row ?? contract;
  });

  await publishContractEvent("crm.contract.value_changed", updated);
  return updated;
}

const TRANSITIONS: Record<
  "pause" | "resume" | "cancel" | "finish",
  {
    from: CrmContractStatus[];
    to: CrmContractStatus;
    event: CrmContractEventType;
    refusal: string;
  }
> = {
  pause: {
    from: ["active"],
    to: "paused",
    event: "paused",
    refusal: "Só contrato ativo pode ser pausado.",
  },
  resume: {
    from: ["paused"],
    to: "active",
    event: "resumed",
    refusal: "Só contrato pausado pode ser retomado.",
  },
  cancel: {
    from: ["active", "paused"],
    to: "cancelled",
    event: "cancelled",
    refusal: "Este contrato já está encerrado.",
  },
  finish: {
    from: ["active", "paused"],
    to: "finished",
    event: "finished",
    refusal: "Este contrato já está encerrado.",
  },
};

/**
 * Pausar, retomar, cancelar e encerrar. Cada um grava o evento com o MRR
 * efetivo antes e depois, e os dois últimos acertam a situação do cliente
 * quando era o último contrato dele.
 */
export async function transitionContract({
  workspaceId,
  contractId,
  actorUserId,
  action,
  occurredAt,
  note,
  cancelReasonId,
}: {
  workspaceId: string;
  contractId: string;
  actorUserId: string;
  action: keyof typeof TRANSITIONS;
  occurredAt?: Date;
  note?: string | null;
  cancelReasonId?: string | null;
}) {
  const contract = await loadContract(workspaceId, contractId);
  const rule = TRANSITIONS[action];

  if (!rule.from.includes(contract.status)) {
    throw new HTTPException(409, { message: rule.refusal });
  }

  const at = occurredAt ?? new Date();
  await assertChronological(contract.id, at);

  let reasonName: string | null = null;
  if (action === "cancel" && cancelReasonId) {
    const [reason] = await db
      .select({ name: crmLostReasonTable.name })
      .from(crmLostReasonTable)
      .where(
        and(
          eq(crmLostReasonTable.id, cancelReasonId),
          eq(crmLostReasonTable.workspaceId, workspaceId),
        ),
      )
      .limit(1);
    if (!reason) {
      throw new HTTPException(404, { message: "Lost reason not found" });
    }
    reasonName = reason.name;
  }

  const ends = action === "cancel" || action === "finish";

  const updated = await db.transaction(async (tx) => {
    const locked = await lockContract(tx, workspaceId, contractId);
    if (
      !rule.from.includes(locked.status) ||
      locked.updatedAt.getTime() !== contract.updatedAt.getTime()
    )
      throw new HTTPException(409, {
        message: "Contrato alterado simultaneamente. Atualize a consulta.",
      });
    await assertChronological(locked.id, at, tx);
    const [row] = await tx
      .update(crmContractTable)
      .set({
        status: rule.to,
        ...(ends ? { endedAt: at } : {}),
        ...(action === "cancel"
          ? { cancelReasonId: cancelReasonId ?? null, cancelNote: note ?? null }
          : {}),
      })
      .where(eq(crmContractTable.id, contract.id))
      .returning();

    await recordEvent(tx, {
      contractId: contract.id,
      type: rule.event,
      from: effectiveMrr(contract.status, contract.monthlyValueCents),
      to: effectiveMrr(rule.to, contract.monthlyValueCents),
      occurredAt: at,
      changedByUserId: actorUserId,
      note,
    });

    if (ends) {
      await settleCompanyAfterContractEnd(tx, {
        companyId: contract.companyId,
        endedContractId: contract.id,
        kind: action === "cancel" ? "cancelled" : "finished",
        reason: reasonName ?? note ?? null,
        at,
      });
    }

    await syncContractBilling(tx, row ?? contract, actorUserId, at);
    return row ?? contract;
  });

  await publishContractEvent(`crm.contract.${rule.event}`, updated);
  return updated;
}
