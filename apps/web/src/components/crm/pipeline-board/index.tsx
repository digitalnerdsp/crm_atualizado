import {
  closestCorners,
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  type DropAnimation,
  defaultDropAnimationSideEffects,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import DeliveryTasksDialog from "@/components/crm/delivery-tasks-dialog";
import { useMoveDealStage } from "@/hooks/mutations/crm/use-crm-mutations";
import { useCrmLostReasons } from "@/hooks/queries/crm/use-crm-lost-reasons";
import { formatMoney } from "@/lib/money";
import { toast } from "@/lib/toast";
import type { CrmBoard, CrmBoardDeal } from "@/types/crm";
import CloseDealDialog, { type CloseDealIntent } from "./close-deal-dialog";
import DealCard from "./deal-card";
import StageColumn from "./stage-column";

type PipelineBoardProps = {
  board: CrmBoard;
  workspaceId: string;
  disableDragDrop?: boolean;
};

/**
 * Deliberately separate from the task board: the cards, the column footers and
 * what happens on drop all differ. The one thing shared is the dnd-kit setup,
 * copied so both boards can evolve without a shared abstraction to fight.
 */
export function PipelineBoard({
  board,
  workspaceId,
  disableDragDrop = false,
}: PipelineBoardProps) {
  const { t } = useTranslation();
  const [activeDeal, setActiveDeal] = useState<CrmBoardDeal | null>(null);
  const [closeIntent, setCloseIntent] = useState<CloseDealIntent | null>(null);
  // Offered right after a win, never before: deciding the delivery must not
  // hold up closing the deal.
  const [wonDeal, setWonDeal] = useState<{ id: string; title: string } | null>(
    null,
  );
  const { data: lostReasons = [] } = useCrmLostReasons(workspaceId);
  const { mutateAsync: moveDealStage, isPending } = useMoveDealStage();

  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: { distance: disableDragDrop ? 999999 : 8 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: disableDragDrop ? 999999 : 250,
        tolerance: 10,
      },
    }),
    useSensor(KeyboardSensor),
  );

  const dropAnimation: DropAnimation = {
    sideEffects: defaultDropAnimationSideEffects({
      styles: { active: { opacity: "0.8" } },
    }),
    duration: 300,
    easing: "cubic-bezier(0.23, 1, 0.32, 1)",
  };

  const currency = board.stages[0]?.deals[0]?.currency ?? "BRL";

  const dealsById = useMemo(() => {
    const map = new Map<string, { deal: CrmBoardDeal; stageId: string }>();
    for (const stage of board.stages) {
      for (const deal of stage.deals) {
        map.set(deal.id, { deal, stageId: stage.id });
      }
    }
    return map;
  }, [board.stages]);

  async function commitMove({
    dealId,
    stageId,
    position,
    lostReasonId,
    lostReasonNote,
  }: {
    dealId: string;
    stageId: string;
    position?: number;
    lostReasonId?: string;
    lostReasonNote?: string;
  }) {
    try {
      await moveDealStage({
        dealId,
        payload: {
          workspaceId,
          stageId,
          ...(position === undefined ? {} : { position }),
          ...(lostReasonId ? { lostReasonId } : {}),
          ...(lostReasonNote ? { lostReasonNote } : {}),
        },
      });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("crm:board.moveError"),
      );
    }
  }

  function handleDragStart(event: DragStartEvent) {
    const entry = dealsById.get(String(event.active.id));
    setActiveDeal(entry?.deal ?? null);
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveDeal(null);

    if (!over) return;

    const source = dealsById.get(String(active.id));
    if (!source) return;

    const overId = String(over.id);
    const targetStage =
      board.stages.find((stage) => stage.id === overId) ??
      board.stages.find((stage) =>
        stage.deals.some((deal) => deal.id === overId),
      );

    if (!targetStage) return;

    const position =
      overId === targetStage.id
        ? targetStage.deals.length
        : targetStage.deals.findIndex((deal) => deal.id === overId);

    if (source.stageId === targetStage.id) {
      // Reordering inside a stage: the API leaves the rotting clock and the
      // stage history untouched for this case.
      await commitMove({
        dealId: source.deal.id,
        stageId: targetStage.id,
        position: Math.max(0, position),
      });
      return;
    }

    // Won and lost are decisions, so they get a dialog rather than a silent
    // write. The move only happens after it is confirmed.
    if (targetStage.outcome !== "open") {
      setCloseIntent({
        dealId: source.deal.id,
        dealTitle: source.deal.title,
        stageId: targetStage.id,
        outcome: targetStage.outcome === "won" ? "won" : "lost",
        valueCents: source.deal.valueCents,
        currency: source.deal.currency,
      });
      return;
    }

    await commitMove({
      dealId: source.deal.id,
      stageId: targetStage.id,
      position: Math.max(0, position),
    });
  }

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setActiveDeal(null)}
      >
        <div className="flex h-full min-h-0 flex-col">
          <div className="min-h-0 flex-1 overflow-x-auto px-4 pb-4 md:px-5">
            <div className="flex h-full gap-4">
              {board.stages.map((stage) => (
                <StageColumn
                  key={stage.id}
                  stage={stage}
                  workspaceId={workspaceId}
                  currency={currency}
                  disableDragDrop={disableDragDrop}
                />
              ))}
            </div>
          </div>

          <footer className="shrink-0 border-t border-border bg-background/80 px-5 py-2 backdrop-blur">
            <dl className="flex flex-wrap items-center gap-x-8 gap-y-1 text-xs">
              <div className="flex items-center gap-1.5">
                <dt className="text-muted-foreground">
                  {t("crm:board.openDeals")}
                </dt>
                <dd className="font-medium tabular-nums">
                  {board.summary.openCount}
                </dd>
              </div>
              <div className="flex items-center gap-1.5">
                <dt className="text-muted-foreground">
                  {t("crm:board.openValue")}
                </dt>
                <dd className="font-medium tabular-nums">
                  {formatMoney(board.summary.openValueCents, currency)}
                </dd>
              </div>
              <div className="flex items-center gap-1.5">
                <dt className="text-muted-foreground">
                  {t("crm:board.weightedValue")}
                </dt>
                <dd className="font-medium tabular-nums">
                  {formatMoney(board.summary.weightedValueCents, currency)}
                </dd>
              </div>
            </dl>
          </footer>
        </div>

        <DragOverlay dropAnimation={dropAnimation}>
          {activeDeal ? (
            <DealCard
              deal={activeDeal}
              stage={{ rottingDays: null }}
              workspaceId={workspaceId}
              isDragging
              disableDragDrop
            />
          ) : null}
        </DragOverlay>
      </DndContext>

      <CloseDealDialog
        key={closeIntent?.dealId ?? "closed"}
        intent={closeIntent}
        lostReasons={lostReasons}
        isSubmitting={isPending}
        onCancel={() => setCloseIntent(null)}
        onConfirm={async (result) => {
          if (!closeIntent) return;
          await commitMove({
            dealId: closeIntent.dealId,
            stageId: closeIntent.stageId,
            lostReasonId: result.lostReasonId,
            lostReasonNote: result.lostReasonNote,
          });
          if (closeIntent.outcome === "won") {
            setWonDeal({
              id: closeIntent.dealId,
              title: closeIntent.dealTitle,
            });
          }
          setCloseIntent(null);
        }}
      />

      {wonDeal ? (
        <DeliveryTasksDialog
          workspaceId={workspaceId}
          dealId={wonDeal.id}
          dealTitle={wonDeal.title}
          onClose={() => setWonDeal(null)}
        />
      ) : null}
    </>
  );
}

export default PipelineBoard;
