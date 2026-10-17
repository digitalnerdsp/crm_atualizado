import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { useCreateContact } from "@/hooks/mutations/crm/use-crm-contact-mutations";
import { useCrmCompanies } from "@/hooks/queries/crm/use-crm-companies";
import { toast } from "@/lib/toast";

type CreateContactModalProps = {
  workspaceId: string;
  companyId?: string;
  onClose: () => void;
};

export function CreateContactModal({
  workspaceId,
  companyId,
  onClose,
}: CreateContactModalProps) {
  const { t } = useTranslation();
  const { mutateAsync, isPending } = useCreateContact();
  const { data: companies } = useCrmCompanies({ workspaceId, limit: "200" });

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [selectedCompanyId, setSelectedCompanyId] = useState(companyId ?? "");
  const [duplicates, setDuplicates] = useState<string[]>([]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!firstName.trim()) return;

    try {
      const created = await mutateAsync({
        workspaceId,
        firstName: firstName.trim(),
        ...(lastName.trim() ? { lastName: lastName.trim() } : {}),
        ...(email.trim() ? { email: email.trim() } : {}),
        ...(phone.trim() ? { phone: phone.trim() } : {}),
        ...(jobTitle.trim() ? { jobTitle: jobTitle.trim() } : {}),
        ...(selectedCompanyId ? { companyId: selectedCompanyId } : {}),
      });

      // The API returns look-alikes instead of refusing the write, so the
      // person entering the contact is warned but never blocked.
      const possible = created.possibleDuplicates ?? [];
      if (possible.length > 0) {
        setDuplicates(
          possible.map((item) =>
            [item.firstName, item.lastName].filter(Boolean).join(" "),
          ),
        );
        toast.warning(t("crm:contact.duplicateWarning"));
      } else {
        toast.success(t("crm:contact.created"));
      }
      onClose();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("crm:contact.createError"),
      );
    }
  }

  const selectedCompanyName =
    companies?.items.find((company) => company.id === selectedCompanyId)
      ?.name ?? t("crm:contact.noCompany");

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("crm:contact.new")}</DialogTitle>
          <DialogDescription className="sr-only">
            {t("crm:contact.new")}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 px-6 pb-2">
          {duplicates.length > 0 ? (
            <Alert>
              <AlertDescription>
                {t("crm:contact.duplicateWarning")} ({duplicates.join(", ")})
              </AlertDescription>
            </Alert>
          ) : null}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="crm-contact-first">
                {t("crm:contact.firstName")}
              </Label>
              <Input
                id="crm-contact-first"
                value={firstName}
                onChange={(event) => setFirstName(event.target.value)}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="crm-contact-last">
                {t("crm:contact.lastName")}
              </Label>
              <Input
                id="crm-contact-last"
                value={lastName}
                onChange={(event) => setLastName(event.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="crm-contact-email">{t("crm:contact.email")}</Label>
            <Input
              id="crm-contact-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="crm-contact-phone">
                {t("crm:contact.phone")}
              </Label>
              <Input
                id="crm-contact-phone"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="crm-contact-job">
                {t("crm:contact.jobTitle")}
              </Label>
              <Input
                id="crm-contact-job"
                value={jobTitle}
                onChange={(event) => setJobTitle(event.target.value)}
              />
            </div>
          </div>

          {companyId ? null : (
            <div className="space-y-2">
              <Label htmlFor="crm-contact-company">
                {t("crm:contact.company")}
              </Label>
              <Select
                value={selectedCompanyId}
                onValueChange={(value) => {
                  if (typeof value === "string") setSelectedCompanyId(value);
                }}
              >
                <SelectTrigger id="crm-contact-company">
                  <SelectValue>{selectedCompanyName}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {(companies?.items ?? []).map((company) => (
                    <SelectItem key={company.id} value={company.id}>
                      {company.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isPending}
            >
              {t("common:actions.cancel")}
            </Button>
            <Button type="submit" disabled={isPending || !firstName.trim()}>
              {t("common:actions.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default CreateContactModal;
