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
import { useUpdateCompany } from "@/hooks/mutations/crm/use-crm-contact-mutations";
import { toast } from "@/lib/toast";
import type { CrmCompanyDetail } from "@/types/crm";
import {
  type BrazilState,
  CompanyFields,
  type CompanyFormState,
  type CompanySize,
  type CompanyStatus,
  emptyCompanyForm,
  type PaymentMethod,
  type PaymentTerm,
  toCompanyPayload,
} from "./company-fields";

function toDateInput(value: string | Date | null | undefined) {
  if (!value) return "";
  return new Date(value).toISOString().slice(0, 10);
}

function toFormState(company: CrmCompanyDetail): CompanyFormState {
  return {
    ...emptyCompanyForm,
    name: company.name,
    personType: company.personType === "pf" ? "pf" : "pj",
    taxId: company.taxId ?? "",
    legalName: company.legalName ?? "",
    stateRegistration: company.stateRegistration ?? "",
    municipalRegistration: company.municipalRegistration ?? "",
    domain: company.domain ?? "",
    phone: company.phone ?? "",
    segmentId: company.segmentId ?? "",
    sourceId: company.sourceId ?? "",
    companySize: (company.companySize ?? "") as CompanySize | "",
    status: company.status as CompanyStatus,
    clientSince: toDateInput(company.clientSince),
    state: (company.state ?? "") as BrazilState | "",
    city: company.city ?? "",
    postalCode: company.postalCode ?? "",
    addressLine: company.addressLine ?? "",
    addressNumber: company.addressNumber ?? "",
    district: company.district ?? "",
    billingEmail: company.billingEmail ?? "",
    paymentTerms: (company.paymentTerms ?? "") as PaymentTerm | "",
    billingDay: company.billingDay ? String(company.billingDay) : "",
    paymentMethod: (company.paymentMethod ?? "") as PaymentMethod | "",
  };
}

export function EditCompanyModal({
  workspaceId,
  company,
  onClose,
}: {
  workspaceId: string;
  company: CrmCompanyDetail;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { mutateAsync, isPending } = useUpdateCompany();

  const [form, setForm] = useState<CompanyFormState>(() =>
    toFormState(company),
  );
  const [churnReason, setChurnReason] = useState(company.churnReason ?? "");

  function patch(next: Partial<CompanyFormState>) {
    setForm((current) => ({ ...current, ...next }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!form.name.trim()) return;

    try {
      await mutateAsync({
        companyId: company.id,
        payload: {
          workspaceId,
          ...toCompanyPayload(form),
          churnReason: churnReason.trim() ? churnReason.trim() : null,
        },
      });
      toast.success(t("crm:company.updated"));
      onClose();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("crm:company.updateError"),
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
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("crm:company.editTitle")}</DialogTitle>
          <DialogDescription className="sr-only">
            {t("crm:company.editTitle")}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="max-h-[65vh] space-y-5 overflow-y-auto px-6 pb-2">
            <CompanyFields
              workspaceId={workspaceId}
              form={form}
              onChange={patch}
              idPrefix="crm-company-edit"
            />

            {/* O motivo só aparece quando há o que explicar: pedir motivo de
                saída de um cliente ativo é ruído no formulário. */}
            {form.status === "churned" ? (
              <div className="space-y-2">
                <Label htmlFor="crm-company-churn-reason">
                  {t("crm:company.churnReason")}
                </Label>
                <Input
                  id="crm-company-churn-reason"
                  value={churnReason}
                  onChange={(event) => setChurnReason(event.target.value)}
                />
              </div>
            ) : null}
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
            <Button type="submit" disabled={isPending || !form.name.trim()}>
              {t("common:actions.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default EditCompanyModal;
