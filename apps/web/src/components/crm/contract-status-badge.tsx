import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";

/** Situação do contrato em forma, não só em texto: ativo e cancelado têm de
 * se distinguir de relance numa lista de trinta. */
const STATUS_VARIANT = {
  active: "success",
  paused: "warning",
  cancelled: "error",
  finished: "outline",
} as const;

export type ContractStatus = keyof typeof STATUS_VARIANT;

export function ContractStatusBadge({
  status,
  size,
}: {
  status: ContractStatus;
  size?: "sm" | "default" | "lg";
}) {
  const { t } = useTranslation();
  return (
    <Badge variant={STATUS_VARIANT[status]} size={size ?? "sm"}>
      {t(`crm:contracts.${status}`)}
    </Badge>
  );
}

export default ContractStatusBadge;
