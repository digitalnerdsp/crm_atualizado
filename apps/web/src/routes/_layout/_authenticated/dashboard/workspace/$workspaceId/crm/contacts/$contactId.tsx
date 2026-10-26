import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  Building2,
  Download,
  Mail,
  Phone,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import WorkspaceLayout from "@/components/common/workspace-layout";
import CrmTimeline from "@/components/crm/timeline";
import PageTitle from "@/components/page-title";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  useDeleteContact,
  useUpdateContact,
} from "@/hooks/mutations/crm/use-crm-contact-mutations";
import { useCrmContact } from "@/hooks/queries/crm/use-crm-contacts";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import { formatDateMedium } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { toast } from "@/lib/toast";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/workspace/$workspaceId/crm/contacts/$contactId",
)({
  component: RouteComponent,
});

function RouteComponent() {
  const { t } = useTranslation();
  const { workspaceId, contactId } = Route.useParams();
  const navigate = Route.useNavigate();
  const { data: contact, isLoading } = useCrmContact(contactId, workspaceId);
  const { canManageContacts } = useWorkspacePermission();
  const { mutateAsync: updateContact } = useUpdateContact();
  const { mutateAsync: deleteContact, isPending: isDeleting } =
    useDeleteContact();
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

  if (isLoading) {
    return (
      <WorkspaceLayout title={t("crm:contact.title")}>
        <div className="mx-auto w-full max-w-4xl space-y-4 px-5 py-6">
          <Skeleton className="h-8 w-1/2" />
          <Skeleton className="h-40 w-full" />
        </div>
      </WorkspaceLayout>
    );
  }

  if (!contact) {
    return (
      <WorkspaceLayout title={t("crm:contact.title")}>
        <p className="px-5 py-6 text-sm text-muted-foreground">
          {t("crm:contact.notFound")}
        </p>
      </WorkspaceLayout>
    );
  }

  const fullName = [contact.firstName, contact.lastName]
    .filter(Boolean)
    .join(" ");

  /**
   * A data-subject access request answered from what the CRM actually holds:
   * the record, its consent trail and the deals the person takes part in.
   */
  function handleExportOwnData() {
    if (!contact) return;
    const blob = new Blob([JSON.stringify(contact, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `contato-${contact.id}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <WorkspaceLayout title={fullName}>
      <PageTitle title={fullName} />

      <div className="mx-auto w-full max-w-4xl px-5 py-6">
        <Link
          to="/dashboard/workspace/$workspaceId/crm/companies"
          params={{ workspaceId }}
          className="mb-4 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          {t("crm:nav.companies")}
        </Link>

        <header className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">{fullName}</h1>
          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            {contact.jobTitle ? <span>{contact.jobTitle}</span> : null}
            {contact.company?.name ? (
              <Link
                to="/dashboard/workspace/$workspaceId/crm/companies/$companyId"
                params={{ workspaceId, companyId: contact.company.id }}
                className="inline-flex items-center gap-1.5 hover:text-foreground hover:underline"
              >
                <Building2 className="size-3.5" />
                {contact.company.name}
              </Link>
            ) : null}
            {contact.email ? (
              <span className="inline-flex items-center gap-1.5">
                <Mail className="size-3.5" />
                {contact.email}
              </span>
            ) : null}
            {contact.phone || contact.mobile ? (
              <span className="inline-flex items-center gap-1.5">
                <Phone className="size-3.5" />
                {contact.phone ?? contact.mobile}
              </span>
            ) : null}
          </div>
        </header>

        <Separator className="my-6" />

        <section className="space-y-3">
          <h2 className="text-sm font-medium">{t("crm:contact.deals")}</h2>
          {contact.deals.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("crm:contact.noDeals")}
            </p>
          ) : (
            <ul className="space-y-1.5">
              {contact.deals.map((deal) => (
                <li key={deal.id}>
                  <Link
                    to="/dashboard/workspace/$workspaceId/crm/deals/$dealId"
                    params={{ workspaceId, dealId: deal.id }}
                    className="flex items-center gap-3 text-sm hover:underline"
                  >
                    <span className="font-mono text-[10px] text-muted-foreground">
                      #{deal.number}
                    </span>
                    <span className="flex-1">{deal.title}</span>
                    {deal.role ? (
                      <Badge variant="outline">{deal.role}</Badge>
                    ) : null}
                    <span className="tabular-nums text-muted-foreground">
                      {formatMoney(deal.valueCents, deal.currency)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <Separator className="my-6" />

        <section className="space-y-3">
          <h2 className="text-sm font-medium">{t("crm:timeline.title")}</h2>
          <CrmTimeline workspaceId={workspaceId} contactId={contactId} />
        </section>

        <Separator className="my-6" />

        <section className="space-y-4 rounded-lg border border-border p-4">
          <h2 className="text-sm font-medium">{t("crm:lgpd.title")}</h2>

          <dl className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">
                {t("crm:lgpd.consentSource")}
              </dt>
              <dd>{contact.consentSource ?? t("crm:lgpd.noConsent")}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">
                {t("crm:lgpd.consentAt")}
              </dt>
              <dd>
                {contact.consentAt
                  ? formatDateMedium(new Date(contact.consentAt))
                  : t("crm:lgpd.noConsent")}
              </dd>
            </div>
          </dl>

          <div className="flex items-center justify-between gap-3">
            <label
              htmlFor="crm-contact-optout"
              className="text-sm text-muted-foreground"
            >
              {t("crm:lgpd.optOut")}
            </label>
            <Switch
              id="crm-contact-optout"
              checked={contact.emailOptOut}
              disabled={!canManageContacts()}
              onCheckedChange={async (checked) => {
                try {
                  await updateContact({
                    contactId,
                    payload: { workspaceId, emailOptOut: checked === true },
                  });
                  toast.success(t("crm:contact.updated"));
                } catch (error) {
                  toast.error(
                    error instanceof Error
                      ? error.message
                      : t("crm:contact.createError"),
                  );
                }
              }}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={handleExportOwnData}>
              <Download className="size-4" />
              {t("crm:lgpd.exportData")}
            </Button>
            {canManageContacts() ? (
              <Button
                size="sm"
                variant="destructive"
                onClick={() => setIsConfirmingDelete(true)}
              >
                <Trash2 className="size-4" />
                {t("crm:lgpd.deleteContact")}
              </Button>
            ) : null}
          </div>
        </section>
      </div>

      <AlertDialog
        open={isConfirmingDelete}
        onOpenChange={setIsConfirmingDelete}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("crm:lgpd.deleteConfirmTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("crm:lgpd.deleteConfirmDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsConfirmingDelete(false)}
              disabled={isDeleting}
            >
              {t("common:actions.cancel")}
            </Button>
            <Button
              variant="destructive"
              disabled={isDeleting}
              onClick={async () => {
                try {
                  await deleteContact({ contactId, workspaceId });
                  toast.success(t("crm:lgpd.deleted"));
                  navigate({
                    to: "/dashboard/workspace/$workspaceId/crm/companies",
                    params: { workspaceId },
                  });
                } catch (error) {
                  toast.error(
                    error instanceof Error
                      ? error.message
                      : t("crm:lgpd.deleteError"),
                  );
                }
              }}
            >
              {t("common:actions.delete")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </WorkspaceLayout>
  );
}
