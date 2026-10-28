import { useTranslation } from "react-i18next";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";

const STATUS_STYLE: Record<string, { tone: StatusTone; key: string }> = {
  prospect: { tone: "info", key: "statusProspect" },
  active: { tone: "success", key: "statusActive" },
  inactive: { tone: "neutral", key: "statusInactive" },
  churned: { tone: "danger", key: "statusChurned" },
};

export function CompanyStatusBadge({
  status,
}: {
  status: string;
  size?: "sm" | "default" | "lg";
}) {
  const { t } = useTranslation();
  const style = STATUS_STYLE[status] ?? STATUS_STYLE.prospect;
  return (
    <StatusBadge tone={style.tone}>{t(`crm:company.${style.key}`)}</StatusBadge>
  );
}

export default CompanyStatusBadge;
