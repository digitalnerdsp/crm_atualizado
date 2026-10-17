import { Link, useNavigate } from "@tanstack/react-router";
import { FileSignature } from "lucide-react";
import { useTranslation } from "react-i18next";
import ContractStatusBadge from "@/components/crm/contract-status-badge";
import { Button } from "@/components/ui/button";
import { useCreateCrmContractFromDeal } from "@/hooks/mutations/crm/use-crm-contract-mutations";
import { useCrmDeal } from "@/hooks/queries/crm/use-crm-deal";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import { formatMoney } from "@/lib/money";
import { toast } from "@/lib/toast";

/** Mesma conta do servidor (`crm/shared/contract-value.ts`), só para mostrar
 * o valor mensal antes de gerar. Quem grava é o servidor. */
const MONTHS = { monthly: 1, quarterly: 3, yearly: 12 } as const;

/**
 * O elo entre o negócio ganho e a receita recorrente. Mostra o contrato que o
 * negócio originou ou, quando ele tem serviço recorrente e ainda não virou
 * contrato, oferece gerar — sem obrigar: nem toda assinatura começa no
 * instante do ganho.
 */
export function GenerateContractPrompt({
  workspaceId,
  dealId,
  compact,
}: {
  workspaceId: string;
  dealId: string;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: deal } = useCrmDeal(dealId, workspaceId);
  const { canCreateDeals } = useWorkspacePermission();
  const generate = useCreateCrmContractFromDeal();

  if (!deal) return null;

  if (deal.contract) {
    if (compact) return null;
    return (
      <Link
        to="/dashboard/workspace/$workspaceId/crm/contracts/$contractId"
        params={{ workspaceId, contractId: deal.contract.id }}
        className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted/40"
      >
        <span className="flex items-center gap-2">
          <FileSignature className="size-4 text-muted-foreground" />
          {t("crm:contracts.viewContract", { number: deal.contract.number })}
          <ContractStatusBadge status={deal.contract.status} />
        </span>
        <span className="tabular-nums">
          {t("crm:contracts.perMonth", {
            value: formatMoney(deal.contract.monthlyValueCents),
          })}
        </span>
      </Link>
    );
  }

  const recurring = deal.services.filter(
    (line) => line.billingType !== "one_time",
  );
  if (
    deal.status !== "won" ||
    !deal.companyId ||
    recurring.length === 0 ||
    !canCreateDeals()
  ) {
    return null;
  }

  const monthlyCents = recurring.reduce(
    (total, line) =>
      total +
      Math.round(
        line.totalCents / MONTHS[line.billingType as keyof typeof MONTHS],
      ),
    0,
  );

  async function handleGenerate() {
    try {
      const contract = await generate.mutateAsync({
        dealId,
        payload: { workspaceId },
      });
      toast.success(t("crm:contracts.created"));
      navigate({
        to: "/dashboard/workspace/$workspaceId/crm/contracts/$contractId",
        params: { workspaceId, contractId: contract.id },
      });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("crm:contracts.createError"),
      );
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2">
      <p className="text-sm">
        {t("crm:contracts.generateHint")}{" "}
        <span className="font-medium tabular-nums">
          {t("crm:contracts.perMonth", { value: formatMoney(monthlyCents) })}
        </span>
      </p>
      <Button
        size="sm"
        className="h-7"
        onClick={handleGenerate}
        disabled={generate.isPending}
      >
        <FileSignature className="size-3.5" />
        {t("crm:contracts.generate")}
      </Button>
    </div>
  );
}

export default GenerateContractPrompt;
