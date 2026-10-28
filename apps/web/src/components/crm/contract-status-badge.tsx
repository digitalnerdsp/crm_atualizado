import { useTranslation } from "react-i18next";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";

const STATUS_TONE: Record<string, StatusTone> = {
  active: "success",
  paused: "warning",
  cancelled: "danger",
  finished: "neutral",
};

export type ContractStatus = "active" | "paused" | "cancelled" | "finished";

export function ContractStatusBadge({
  status,
}: {
  status: ContractStatus;
  size?: "sm" | "default" | "lg";
}) {
  const { t } = useTranslation();
  return (
    <StatusBadge tone={STATUS_TONE[status] ?? "neutral"}>
      {t(`crm:contracts.${status}`)}
    </StatusBadge>
  );
}

export default ContractStatusBadge;
