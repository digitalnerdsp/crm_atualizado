import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useNavigate } from "@tanstack/react-router";
import { differenceInCalendarDays } from "date-fns";
import { AlarmClock, Building2, CalendarClock } from "lucide-react";
import type { CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getInitials } from "@/lib/get-initials";
import { formatMoney } from "@/lib/money";
import type { CrmBoardDeal, CrmBoardStage } from "@/types/crm";

type DealCardProps = {
  deal: CrmBoardDeal;
  stage: Pick<CrmBoardStage, "rottingDays">;
  workspaceId: string;
  isDragging?: boolean;
  disableDragDrop?: boolean;
};

/** Days sitting in the current stage, which is what "stalled" means here. */
function daysInStage(stageEnteredAt: string) {
  return differenceInCalendarDays(new Date(), new Date(stageEnteredAt));
}

export function DealCard({
  deal,
  stage,
  workspaceId,
  isDragging = false,
  disableDragDrop = false,
}: DealCardProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: isSorting,
  } = useSortable({
    id: deal.id,
    disabled: disableDragDrop,
    data: { type: "deal", deal },
  });

  const style: CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isSorting ? 0.4 : 1,
  };

  const stalledDays = stage.rottingDays
    ? daysInStage(deal.stageEnteredAt)
    : null;
  const isStalled =
    stage.rottingDays !== null &&
    stalledDays !== null &&
    stalledDays >= stage.rottingDays;

  const ownerName = deal.owner?.name ?? null;

  return (
    <button
      type="button"
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() =>
        navigate({
          to: "/dashboard/workspace/$workspaceId/crm/deals/$dealId",
          params: { workspaceId, dealId: deal.id },
        })
      }
      className={`w-full cursor-pointer rounded-lg border border-border bg-card p-3 text-left shadow-xs transition-shadow duration-150 hover:shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
        isDragging ? "shadow-md" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="line-clamp-2 text-sm font-medium leading-snug">
          {deal.title}
        </span>
        <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
          #{deal.number}
        </span>
      </div>

      {deal.company?.name ? (
        <div className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Building2 className="size-3 shrink-0" />
          <span className="truncate">{deal.company.name}</span>
        </div>
      ) : null}

      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-sm font-semibold tabular-nums">
          {formatMoney(deal.valueCents, deal.currency)}
        </span>
        {ownerName ? (
          <Avatar className="size-5">
            <AvatarImage src={deal.owner?.image ?? undefined} />
            <AvatarFallback className="text-[9px]">
              {getInitials(ownerName)}
            </AvatarFallback>
          </Avatar>
        ) : null}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {deal.nextActivityAt ? (
          <span className="inline-flex items-center gap-1 rounded-sm bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
            <CalendarClock className="size-2.5" />
            {new Date(deal.nextActivityAt).toLocaleDateString()}
          </span>
        ) : (
          // The habit Pipedrive teaches: a deal with no next step is the one
          // that quietly dies, so the absence is what gets flagged.
          <span className="inline-flex items-center gap-1 rounded-sm bg-destructive/10 px-1.5 py-0.5 text-[10px] font-medium text-destructive">
            {t("crm:board.noNextActivity")}
          </span>
        )}

        {isStalled ? (
          <span className="inline-flex items-center gap-1 rounded-sm bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400">
            <AlarmClock className="size-2.5" />
            {t("crm:board.stalledDays", { count: stalledDays ?? 0 })}
          </span>
        ) : null}
      </div>
    </button>
  );
}

export default DealCard;
