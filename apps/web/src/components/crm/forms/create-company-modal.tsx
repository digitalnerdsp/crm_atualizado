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
import { useCreateCompany } from "@/hooks/mutations/crm/use-crm-contact-mutations";
import { toast } from "@/lib/toast";
import {
  CompanyFields,
  type CompanyFormState,
  emptyCompanyForm,
  toCompanyPayload,
} from "./company-fields";

export function CreateCompanyModal({
  workspaceId,
  onClose,
}: {
  workspaceId: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { mutateAsync, isPending } = useCreateCompany();

  const [form, setForm] = useState<CompanyFormState>(emptyCompanyForm);
  const [contactFirstName, setContactFirstName] = useState("");
  const [contactLastName, setContactLastName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactJobTitle, setContactJobTitle] = useState("");

  const canSubmit = form.name.trim() !== "" && contactFirstName.trim() !== "";

  function patch(next: Partial<CompanyFormState>) {
    setForm((current) => ({ ...current, ...next }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;

    const text = (value: string) => (value.trim() ? value.trim() : null);

    try {
      const created = await mutateAsync({
        workspaceId,
        ...toCompanyPayload(form),
        primaryContact: {
          firstName: contactFirstName.trim(),
          lastName: text(contactLastName),
          email: text(contactEmail),
          phone: text(contactPhone),
          jobTitle: text(contactJobTitle),
        },
      });

      if ((created.possibleDuplicates ?? []).length > 0) {
        toast.warning(t("crm:company.duplicateWarning"));
      } else {
        toast.success(t("crm:company.created"));
      }
      onClose();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("crm:company.createError"),
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
          <DialogTitle>{t("crm:company.new")}</DialogTitle>
          <DialogDescription className="sr-only">
            {t("crm:company.new")}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="max-h-[65vh] space-y-5 overflow-y-auto px-6 pb-2">
            <CompanyFields
              workspaceId={workspaceId}
              form={form}
              onChange={patch}
              idPrefix="crm-company-new"
            />

            <section className="space-y-3">
              <div>
                <h3 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  {t("crm:company.sectionPrimaryContact")}
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("crm:company.primaryContactHint")}
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="crm-company-contact-first">
                    {t("crm:company.contactFirstName")}
                  </Label>
                  <Input
                    id="crm-company-contact-first"
                    value={contactFirstName}
                    onChange={(event) =>
                      setContactFirstName(event.target.value)
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="crm-company-contact-last">
                    {t("crm:company.contactLastName")}
                  </Label>
                  <Input
                    id="crm-company-contact-last"
                    value={contactLastName}
                    onChange={(event) => setContactLastName(event.target.value)}
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="crm-company-contact-email">
                    {t("crm:company.contactEmail")}
                  </Label>
                  <Input
                    id="crm-company-contact-email"
                    type="email"
                    value={contactEmail}
                    onChange={(event) => setContactEmail(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="crm-company-contact-phone">
                    {t("crm:company.contactPhone")}
                  </Label>
                  <Input
                    id="crm-company-contact-phone"
                    value={contactPhone}
                    onChange={(event) => setContactPhone(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="crm-company-contact-role">
                    {t("crm:company.contactJobTitle")}
                  </Label>
                  <Input
                    id="crm-company-contact-role"
                    value={contactJobTitle}
                    onChange={(event) => setContactJobTitle(event.target.value)}
                  />
                </div>
              </div>
            </section>
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

export default CreateCompanyModal;
