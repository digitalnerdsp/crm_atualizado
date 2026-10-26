import { and, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../../database";
import {
  type CrmPaymentForm,
  crmDealServiceTable,
  crmDealTable,
} from "../../../database/schema";
import { publishEvent } from "../../../events";
import { sumLineTotals } from "../../shared/deal-line";

export type DealInput = {
  title?: string;
  companyId?: string | null;
  primaryContactId?: string | null;
  ownerUserId?: string | null;
  valueCents?: number;
  valueIsManual?: boolean;
  currency?: string;
  probability?: number | null;
  expectedCloseDate?: Date | null;
  sourceId?: string | null;
  archived?: boolean;
  notes?: string | null;
  paymentForm?: CrmPaymentForm | null;
  paymentFormNote?: string | null;
};

async function updateDeal({
  workspaceId,
  dealId,
  input,
  actorUserId,
}: {
  workspaceId: string;
  dealId: string;
  input: DealInput;
  actorUserId: string;
}) {
  const [existing] = await db
    .select({
      ownerUserId: crmDealTable.ownerUserId,
      valueIsManual: crmDealTable.valueIsManual,
    })
    .from(crmDealTable)
    .where(
      and(
        eq(crmDealTable.id, dealId),
        eq(crmDealTable.workspaceId, workspaceId),
      ),
    )
    .limit(1);

  if (!existing) {
    throw new HTTPException(404, { message: "Deal not found" });
  }

  /* Com itens e sem trava, o valor é a soma deles. Editar o campo nesse
   * estado seria sobrescrito na próxima gravação de item, então é recusado:
   * travar é uma decisão explícita (`valueIsManual: true`), não efeito
   * colateral de digitar no campo. Destravar devolve o valor aos itens. */
  const lines = await db
    .select({ totalCents: crmDealServiceTable.totalCents })
    .from(crmDealServiceTable)
    .where(eq(crmDealServiceTable.dealId, dealId));

  const willBeManual = input.valueIsManual ?? existing.valueIsManual;

  if (input.valueCents !== undefined && !willBeManual && lines.length > 0) {
    throw new HTTPException(409, {
      message:
        "O valor deste negócio é a soma dos itens. Trave o valor para editá-lo à mão.",
    });
  }

  const recomputedValue =
    input.valueIsManual === false && lines.length > 0
      ? sumLineTotals(lines)
      : undefined;

  // Stage, status and the closing fields are not settable here: they move
  // together and only through moveDealStage, which also writes the history.
  const [updated] = await db
    .update(crmDealTable)
    .set({
      ...(input.title === undefined ? {} : { title: input.title }),
      ...(input.companyId === undefined ? {} : { companyId: input.companyId }),
      ...(input.primaryContactId === undefined
        ? {}
        : { primaryContactId: input.primaryContactId }),
      ...(input.ownerUserId === undefined
        ? {}
        : { ownerUserId: input.ownerUserId }),
      ...(input.valueCents === undefined
        ? {}
        : { valueCents: input.valueCents }),
      ...(recomputedValue === undefined ? {} : { valueCents: recomputedValue }),
      ...(input.valueIsManual === undefined
        ? {}
        : { valueIsManual: input.valueIsManual }),
      ...(input.currency === undefined ? {} : { currency: input.currency }),
      ...(input.probability === undefined
        ? {}
        : { probability: input.probability }),
      ...(input.expectedCloseDate === undefined
        ? {}
        : { expectedCloseDate: input.expectedCloseDate }),
      ...(input.sourceId === undefined ? {} : { sourceId: input.sourceId }),
      ...(input.notes === undefined ? {} : { notes: input.notes }),
      ...(input.paymentForm === undefined
        ? {}
        : { paymentForm: input.paymentForm }),
      ...(input.paymentFormNote === undefined
        ? {}
        : { paymentFormNote: input.paymentFormNote }),
      ...(input.archived === undefined
        ? {}
        : { archivedAt: input.archived ? new Date() : null }),
    })
    .where(eq(crmDealTable.id, dealId))
    .returning();

  if (!updated) {
    throw new HTTPException(500, { message: "Failed to update deal" });
  }

  await publishEvent("crm.deal.updated", {
    dealId: updated.id,
    workspaceId,
    // The board's realtime bridge routes by pipeline, so it has to travel.
    pipelineId: updated.pipelineId,
    stageId: updated.stageId,
    ownerUserId: updated.ownerUserId,
  });

  if (
    input.ownerUserId !== undefined &&
    input.ownerUserId !== existing.ownerUserId
  ) {
    await publishEvent("crm.deal.assigned", {
      dealId: updated.id,
      workspaceId,
      ownerUserId: updated.ownerUserId,
      previousOwnerUserId: existing.ownerUserId,
      assignedByUserId: actorUserId,
      title: updated.title,
    });
  }

  return updated;
}

export default updateDeal;
