import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";

/** Situação lida em forma, não só em texto: numa lista de cinquenta clientes
 * o que precisa de atenção tem de saltar sem ser lido. */
const STATUS_STYLE = {
  prospect: { variant: "info", key: "statusProspect" },
  active: { variant: "success", key: "statusActive" },
  inactive: { variant: "outline", key: "statusInactive" },
  churned: { variant: "error", key: "statusChurned" },
} as const;

export function CompanyStatusBadge({
  status,
  size,
}: {
  status: string;
  size?: "sm" | "default" | "lg";
}) {
  const { t } = useTranslation();
  const style =
    STATUS_STYLE[status as keyof typeof STATUS_STYLE] ?? STATUS_STYLE.prospect;

  return (
    <Badge variant={style.variant} size={size ?? "sm"}>
      {t(`crm:company.${style.key}`)}
    </Badge>
  );
}

export default CompanyStatusBadge;
