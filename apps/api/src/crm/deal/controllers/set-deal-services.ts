import { and, count, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../../database";
import { crmDealServiceTable, crmDealTable } from "../../../database/schema";
import { publishEvent } from "../../../events";
import { sumLineTotals } from "../../shared/deal-line";
import {
  resolveServiceLines,
  type ServiceLineInput,
} from "../../shared/service-lines";

export type DealServiceLineInput = ServiceLineInput;

/**
 * Substitui a lista inteira de itens do negócio numa transação.
 *
 * Lista inteira, não linha a linha: editar item por item num formulário de
 * proposta gera meia dúzia de chamadas e estados intermediários em que o
 * valor do negócio não bate com nada.
 *
 * Nome, tipo de cobrança e preço de cada linha são cópia: vêm do payload
 * quando a tela manda (é o que preserva a venda antiga ao salvar de novo) e
 * só caem para o catálogo quando faltam.
 */
async function setDealServices({
  workspaceId,
  dealId,
  lines,
}: {
  workspaceId: string;
  dealId: string;
  lines: DealServiceLineInput[];
}) {
  const [deal] = await db
    .select({
      id: crmDealTable.id,
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

  if (!deal) {
    throw new HTTPException(404, { message: "Deal not found" });
  }

  const rows = (await resolveServiceLines(workspaceId, lines)).map((line) => ({
    ...line,
    dealId,
  }));

  const result = await db.transaction(async (tx) => {
    const [previous] = await tx
      .select({ total: count() })
      .from(crmDealServiceTable)
      .where(eq(crmDealServiceTable.dealId, dealId));

    await tx
      .delete(crmDealServiceTable)
      .where(eq(crmDealServiceTable.dealId, dealId));

    const saved =
      rows.length === 0
        ? []
        : await tx.insert(crmDealServiceTable).values(rows).returning();

    /* O valor só passa a ser dos itens quando há ou havia item. Um negócio
     * que nunca teve linha nenhuma guarda o valor digitado no topo do funil,
     * e um PUT vazio vindo da tela não pode zerá-lo. Tirar o último item de
     * um negócio calculado, esse sim, leva o valor a zero. */
    const hadOrHasLines = (previous?.total ?? 0) > 0 || rows.length > 0;
    const shouldRecompute = !deal.valueIsManual && hadOrHasLines;

    const [updated] = await tx
      .update(crmDealTable)
      .set(
        shouldRecompute
          ? { valueCents: sumLineTotals(saved) }
          : { updatedAt: new Date() },
      )
      .where(eq(crmDealTable.id, dealId))
      .returning();

    if (!updated) {
      throw new HTTPException(500, { message: "Failed to update deal" });
    }

    return { deal: updated, services: saved };
  });

  await publishEvent("crm.deal.updated", {
    dealId,
    workspaceId,
    pipelineId: result.deal.pipelineId,
    stageId: result.deal.stageId,
    ownerUserId: result.deal.ownerUserId,
  });

  return {
    valueCents: result.deal.valueCents,
    valueIsManual: result.deal.valueIsManual,
    services: result.services,
  };
}

export default setDealServices;
