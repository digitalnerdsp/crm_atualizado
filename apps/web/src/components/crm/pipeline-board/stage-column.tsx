import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import type { CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { getLaneColor } from "@/constants/lane-colors";
import { formatMoneyCompact } from "@/lib/money";
import type { CrmBoardStage } from "@/types/crm";
import DealCard from "./deal-card";

type StageColumnProps = {
  stage: CrmBoardStage;
  workspaceId: string;
  currency: string;
  disableDragDrop?: boolean;
};

export function StageColumn({
  stage,
  workspaceId,
  currency,
  disableDragDrop = false,
}: StageColumnProps) {
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion();
  const { setNodeRef, isOver } = useDroppable({
    id: stage.id,
    data: { type: "stage", stage },
  });

  const laneColor = getLaneColor(stage.color, stage.slug);
  const laneStyle = {
    "--lane-color": laneColor,
    borderColor: `color-mix(in srgb, ${laneColor} 24%, var(--border))`,
    background: `color-mix(in srgb, ${laneColor} 4%, var(--card))`,
  } as CSSProperties;

  return (
    <div
      style={laneStyle}
      className={`group relative flex h-full min-h-0 w-72 shrink-0 flex-col overflow-hidden rounded-xl border transition-colors duration-150 ${
        isOver
          ? "shadow-md ring-2 ring-[color:var(--lane-color)]/30"
          : "shadow-xs/5 hover:shadow-sm"
      }`}
    >
      <div
        className="h-1 w-full shrink-0"
        style={{ backgroundColor: laneColor }}
      />

      <header className="shrink-0 border-b border-border/60 px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-medium">{stage.name}</span>
          <span className="shrink-0 rounded-sm bg-muted px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground">
            {stage.probability}%
          </span>
        </div>
        <div className="mt-1 flex items-baseline justify-between gap-2">
          <span className="text-xs tabular-nums text-muted-foreground">
            {t("crm:board.dealCount", { count: stage.dealCount })}
          </span>
          {/* Aggregated by the API over every deal in the stage, not just the
              page shown below — otherwise the footer would lie when paginated. */}
          <span className="text-xs font-semibold tabular-nums">
            {formatMoneyCompact(stage.totalValueCents, currency)}
          </span>
        </div>
      </header>

      <div
        ref={setNodeRef}
        className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-2 py-2 [-webkit-overflow-scrolling:touch]"
      >
        <SortableContext
          items={stage.deals.map((deal) => deal.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="flex flex-col gap-2">
            <AnimatePresence initial={false} mode="popLayout">
              {stage.deals.map((deal) => (
                <motion.div
                  key={deal.id}
                  initial={
                    reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.98 }
                  }
                  animate={
                    reduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1 }
                  }
                  exit={
                    reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.98 }
                  }
                  transition={{ type: "spring", duration: 0.35, bounce: 0.15 }}
                >
                  <DealCard
                    deal={deal}
                    stage={stage}
                    workspaceId={workspaceId}
                    disableDragDrop={disableDragDrop}
                  />
                </motion.div>
              ))}
            </AnimatePresence>

            {stage.deals.length === 0 ? (
              <p className="px-1 py-6 text-center text-xs text-muted-foreground">
                {t("crm:board.emptyStage")}
              </p>
            ) : null}

            {stage.hasMore ? (
              <p className="px-1 py-2 text-center text-[11px] text-muted-foreground">
                {t("crm:board.moreDeals", {
                  count: stage.dealCount - stage.deals.length,
                })}
              </p>
            ) : null}
          </div>
        </SortableContext>
      </div>
    </div>
  );
}

export default StageColumn;
