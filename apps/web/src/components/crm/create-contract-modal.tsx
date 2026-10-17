import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCreateCrmContract } from "@/hooks/mutations/crm/use-crm-contract-mutations";
import { useCrmCompanies } from "@/hooks/queries/crm/use-crm-companies";
import { parseMoneyToCents } from "@/lib/money";
import { toast } from "@/lib/toast";

function todayInput() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

/**
 * Contrato sem negócio de origem.
 *
 * Nem toda assinatura nasce no funil: uma agência que adota o sistema já tem
 * clientes pagando mensalidade há anos, e sem esta tela ela precisaria
 * inventar um negócio ganho para cada um só para registrar o que já existe.
 */
export function CreateContractModal({
  workspaceId,
  onClose,
}: {
  workspaceId: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { data: companies } = useCrmCompanies({ workspaceId, limit: "200" });
  const { mutateAsync, isPending } = useCreateCrmContract();

  const [companyId, setCompanyId] = useState("");
  const [title, setTitle] = useState("");
  const [value, setValue] = useState("");
  const [startsAt, setStartsAt] = useState(todayInput);
  const [endsAt, setEndsAt] = useState("");
  const [billingDay, setBillingDay] = useState("");

  const options = companies?.items ?? [];
  const selected = options.find((company) => company.id === companyId);
  const canSubmit = companyId !== "" && title.trim() !== "";

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;

    try {
      await mutateAsync({
        workspaceId,
        companyId,
        title: title.trim(),
        // Meio-dia local: meia-noite viraria o dia anterior em UTC-3.
        startsAt: new Date(`${startsAt}T12:00:00`).toISOString(),
        ...(endsAt
          ? { endsAt: new Date(`${endsAt}T12:00:00`).toISOString() }
          : {}),
        ...(billingDay ? { billingDay: Number(billingDay) } : {}),
        monthlyValueCents: parseMoneyToCents(value),
      });
      toast.success(t("crm:contracts.created"));
      onClose();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("crm:contracts.createError"),
      );
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("crm:contracts.newContract")}</DialogTitle>
          <DialogDescription className="sr-only">
            {t("crm:contracts.newContract")}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4 px-6 pb-2">
            <div className="space-y-2">
              <Label htmlFor="crm-contract-company">
                {t("crm:contracts.client")}
              </Label>
              <Select
                value={companyId}
                onValueChange={(next) => {
                  if (typeof next === "string") setCompanyId(next);
                }}
              >
                <SelectTrigger id="crm-contract-company">
                  <SelectValue>
                    {selected?.name ?? t("crm:contracts.pickClient")}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {options.map((company) => (
                    <SelectItem key={company.id} value={company.id}>
                      {company.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="crm-contract-title">
                {t("crm:contracts.titleLabel")}
              </Label>
              <Input
                id="crm-contract-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="crm-contract-monthly">
                  {t("crm:contracts.monthlyValue")}
                </Label>
                <Input
                  id="crm-contract-monthly"
                  inputMode="decimal"
                  placeholder="0,00"
                  value={value}
                  onChange={(event) => setValue(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="crm-contract-billing-day">
                  {t("crm:contracts.billingDay")}
                </Label>
                <Input
                  id="crm-contract-billing-day"
                  type="number"
                  min={1}
                  max={31}
                  value={billingDay}
                  onChange={(event) => setBillingDay(event.target.value)}
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="crm-contract-starts">
                  {t("crm:contracts.startsAt")}
                </Label>
                <Input
                  id="crm-contract-starts"
                  type="date"
                  value={startsAt}
                  onChange={(event) => setStartsAt(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="crm-contract-ends">
                  {t("crm:contracts.endsAt")}
                </Label>
                <Input
                  id="crm-contract-ends"
                  type="date"
                  value={endsAt}
                  onChange={(event) => setEndsAt(event.target.value)}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isPending}
            >
              {t("common:actions.cancel")}
            </Button>
            <Button type="submit" disabled={isPending || !canSubmit}>
              {t("common:actions.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default CreateContractModal;
