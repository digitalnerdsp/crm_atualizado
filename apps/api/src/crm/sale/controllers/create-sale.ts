import { and, asc, eq, like } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../../database";
import {
  type CrmPaymentForm,
  crmCompanyTable,
  crmDealTable,
  crmPipelineTable,
  crmStageTable,
  financeEntryTable,
} from "../../../database/schema";
import { createEntries } from "../../../finance/controllers/finance";
import { createContractFromDeal } from "../../contract/controllers/contracts";
import createDeal from "../../deal/controllers/create-deal";
import setDealServices, {
  type DealServiceLineInput,
} from "../../deal/controllers/set-deal-services";
import { isRecurring } from "../../shared/contract-value";

type CreateSaleInput = {
  workspaceId: string;
  actorUserId: string;
  companyId: string;
  ownerUserId?: string | null;
  soldAt: Date;
  items: DealServiceLineInput[];
  notes?: string | null;
  paymentForm?: CrmPaymentForm | null;
  paymentFormNote?: string | null;
  contractEndsAt?: Date | null;
  billingDay?: number | null;
};

async function findWonStage(workspaceId: string) {
  const pipelines = await db
    .select({ id: crmPipelineTable.id, isDefault: crmPipelineTable.isDefault })
    .from(crmPipelineTable)
    .where(eq(crmPipelineTable.workspaceId, workspaceId))
    .orderBy(asc(crmPipelineTable.position));
  const ordered = [
    ...pipelines.filter((pipeline) => pipeline.isDefault),
    ...pipelines.filter((pipeline) => !pipeline.isDefault),
  ];
  for (const pipeline of ordered) {
    const [stage] = await db
      .select({ id: crmStageTable.id })
      .from(crmStageTable)
      .where(
        and(
          eq(crmStageTable.pipelineId, pipeline.id),
          eq(crmStageTable.outcome, "won"),
        ),
      )
      .orderBy(asc(crmStageTable.position))
      .limit(1);
    if (stage) return { pipelineId: pipeline.id, stageId: stage.id };
  }
  throw new HTTPException(400, {
    message: "O funil não tem uma etapa de ganho para registrar a venda.",
  });
}

/**
 * Cria a venda direto, sem passar pelo funil: é um negócio já ganho, com
 * empresa e itens. Item recorrente gera o contrato na mesma hora, na data da
 * venda. Se qualquer passo falha, o negócio criado é apagado — a venda não
 * pode ficar pela metade, sem itens ou sem contrato.
 */
async function createSale(input: CreateSaleInput) {
  if (input.items.length === 0) {
    throw new HTTPException(400, {
      message: "Inclua ao menos um serviço na venda.",
    });
  }
  if (input.paymentForm === "custom" && !input.paymentFormNote?.trim()) {
    throw new HTTPException(400, {
      message: "Descreva a forma de pagamento personalizada.",
    });
  }

  const [company] = await db
    .select({ id: crmCompanyTable.id, name: crmCompanyTable.name })
    .from(crmCompanyTable)
    .where(
      and(
        eq(crmCompanyTable.id, input.companyId),
        eq(crmCompanyTable.workspaceId, input.workspaceId),
      ),
    )
    .limit(1);
  if (!company) throw new HTTPException(404, { message: "Company not found" });

  const target = await findWonStage(input.workspaceId);
  const firstName = input.items[0]?.name?.trim();
  const extra = input.items.length > 1 ? ` +${input.items.length - 1}` : "";
  const title =
    `${company.name}${firstName ? ` — ${firstName}` : ""}${extra}`.slice(
      0,
      200,
    );

  const deal = await createDeal({
    workspaceId: input.workspaceId,
    createdByUserId: input.actorUserId,
    title,
    pipelineId: target.pipelineId,
    stageId: target.stageId,
    companyId: company.id,
    ownerUserId: input.ownerUserId ?? input.actorUserId,
  });

  try {
    const saved = await setDealServices({
      workspaceId: input.workspaceId,
      dealId: deal.id,
      lines: input.items,
    });

    // A data informada é a da venda: ela manda no contrato e nos relatórios.
    await db
      .update(crmDealTable)
      .set({
        wonAt: input.soldAt,
        notes: input.notes?.trim() || null,
        paymentForm: input.paymentForm ?? null,
        paymentFormNote:
          input.paymentForm === "custom"
            ? (input.paymentFormNote?.trim() ?? null)
            : null,
      })
      .where(eq(crmDealTable.id, deal.id));

    const hasRecurring = saved.services.some((item) =>
      isRecurring(item.billingType),
    );
    const contract = hasRecurring
      ? await createContractFromDeal({
          workspaceId: input.workspaceId,
          actorUserId: input.actorUserId,
          dealId: deal.id,
          overrides: {
            startsAt: input.soldAt,
            endsAt: input.contractEndsAt ?? null,
            billingDay: input.billingDay,
          },
        })
      : null;

    // Item pontual vira conta a receber na data da venda (uma por item), com
    // o vendedor e o serviço, para a comissão do "na venda" ser liberada
    // quando o financeiro der baixa.
    const paymentMethod =
      input.paymentForm === "pix" ||
      input.paymentForm === "boleto" ||
      input.paymentForm === "card"
        ? input.paymentForm
        : input.paymentForm === "cash"
          ? "cash"
          : "other";
    const day = input.soldAt.toISOString().slice(0, 10);
    for (const item of saved.services) {
      if (isRecurring(item.billingType) || item.totalCents <= 0) continue;
      await createEntries(input.workspaceId, input.actorUserId, {
        requestId: `sale:${deal.id}:${item.id}`,
        description: `Venda — ${item.name}`.slice(0, 240),
        direction: "receivable",
        kind: "operating",
        amountCents: item.totalCents,
        competenceDate: day,
        dueDate: day,
        categoryId: null,
        partyId: null,
        partyName: company.name,
        companyId: company.id,
        serviceId: item.serviceId,
        sellerId: input.ownerUserId ?? input.actorUserId,
        paymentMethod,
        notes: item.notes ?? "",
        count: 1,
        intervalMonths: 1,
        schedule: "installments",
      });
    }

    return {
      dealId: deal.id,
      number: deal.number,
      contractId: contract?.id ?? null,
    };
  } catch (error) {
    // Contas já lançadas para a venda também saem: sem negócio, ficariam órfãs.
    await db
      .delete(financeEntryTable)
      .where(
        and(
          eq(financeEntryTable.workspaceId, input.workspaceId),
          like(financeEntryTable.seriesId, `sale:${deal.id}:%`),
        ),
      )
      .catch(() => undefined);
    await db.delete(crmDealTable).where(eq(crmDealTable.id, deal.id));
    throw error;
  }
}

export default createSale;
