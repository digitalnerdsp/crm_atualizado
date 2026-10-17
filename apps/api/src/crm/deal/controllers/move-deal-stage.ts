import { and, eq, gte, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../../database";
import {
  crmDealTable,
  crmLostReasonTable,
  crmStageTable,
} from "../../../database/schema";
import { publishEvent } from "../../../events";
import { markCompanyActive } from "../../shared/company-lifecycle";
import { recordStageChange } from "../../shared/record-stage-change";

/**
 * The single entry point for moving a deal. Everything that has to stay in step
 * — status, closing timestamps, stage history and the rotting clock — is
 * written in one transaction, so a board drag can never leave a deal in a stage
 * that says "won" with a status that says "open".
 */
async function moveDealStage({
  workspaceId,
  dealId,
  stageId,
  position,
  changedByUserId,
  lostReasonId,
  lostReasonNote,
}: {
  workspaceId: string;
  dealId: string;
  stageId: string;
  position?: number;
  changedByUserId: string;
  lostReasonId?: string | null;
  lostReasonNote?: string | null;
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

  if (!deal) {
    throw new HTTPException(404, { message: "Deal not found" });
  }

  const [stage] = await db
    .select()
    .from(crmStageTable)
    .where(eq(crmStageTable.id, stageId))
    .limit(1);

  if (!stage || stage.pipelineId !== deal.pipelineId) {
    throw new HTTPException(400, {
      message: "Stage does not belong to this deal's pipeline",
    });
  }

  const isSameStage = deal.stageId === stageId;

  // Reordering a card already sitting in the lost stage keeps the reason it
  // was lost for; only entering the stage has to supply one. Without this,
  // dragging a lost deal up or down its own column is rejected.
  const effectiveLostReasonId =
    lostReasonId ?? (isSameStage ? deal.lostReasonId : null);
  const effectiveLostReasonNote =
    lostReasonNote ?? (isSameStage ? deal.lostReasonNote : null);

  if (stage.outcome === "lost") {
    if (!effectiveLostReasonId) {
      throw new HTTPException(400, {
        message: "A lost reason is required to mark a deal as lost",
      });
    }

    const [reason] = await db
      .select({ id: crmLostReasonTable.id })
      .from(crmLostReasonTable)
      .where(
        and(
          eq(crmLostReasonTable.id, effectiveLostReasonId),
          eq(crmLostReasonTable.workspaceId, workspaceId),
        ),
      )
      .limit(1);

    if (!reason) {
      throw new HTTPException(400, { message: "Unknown lost reason" });
    }
  }

  const now = new Date();
  const status = stage.outcome === "open" ? "open" : stage.outcome;

  const updated = await db.transaction(async (tx) => {
    const targetPosition = position ?? 0;

    await tx
      .update(crmDealTable)
      .set({ position: sql`${crmDealTable.position} + 1` })
      .where(
        and(
          eq(crmDealTable.stageId, stageId),
          gte(crmDealTable.position, targetPosition),
        ),
      );

    const [row] = await tx
      .update(crmDealTable)
      .set({
        stageId,
        position: targetPosition,
        status,
        // Reordering inside a stage must not restart the rotting clock: the
        // deal did not move forward, someone just tidied the column.
        ...(isSameStage ? {} : { stageEnteredAt: now }),
        wonAt: status === "won" ? (deal.wonAt ?? now) : null,
        lostAt: status === "lost" ? (deal.lostAt ?? now) : null,
        lostReasonId: status === "lost" ? effectiveLostReasonId : null,
        lostReasonNote: status === "lost" ? effectiveLostReasonNote : null,
      })
      .where(eq(crmDealTable.id, dealId))
      .returning();

    if (!row) {
      throw new HTTPException(500, { message: "Failed to move deal" });
    }

    if (!isSameStage) {
      await recordStageChange({
        tx,
        dealId,
        toStageId: stageId,
        changedByUserId,
        at: now,
      });
    }

    // Ganhar faz do cliente um cliente ativo (plano 009). Dentro da transação:
    // se o ganho não grava, a situação do cliente também não muda.
    if (status === "won" && row.companyId) {
      await markCompanyActive(tx, row.companyId, row.wonAt ?? now);
    }

    return row;
  });

  if (!isSameStage) {
    const payload = {
      dealId: updated.id,
      workspaceId,
      pipelineId: updated.pipelineId,
      fromStageId: deal.stageId,
      stageId: updated.stageId,
      ownerUserId: updated.ownerUserId,
      title: updated.title,
      valueCents: updated.valueCents,
      currency: updated.currency,
    };

    await publishEvent("crm.deal.stage_changed", payload);
    if (status === "won") await publishEvent("crm.deal.won", payload);
    if (status === "lost") {
      await publishEvent("crm.deal.lost", {
        ...payload,
        lostReasonId: updated.lostReasonId,
      });
    }
  }

  return updated;
}

export default moveDealStage;
