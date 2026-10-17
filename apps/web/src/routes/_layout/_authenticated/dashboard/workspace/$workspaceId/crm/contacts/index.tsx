import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Contact, Download, Plus, Search } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import WorkspaceLayout from "@/components/common/workspace-layout";
import CreateContactModal from "@/components/crm/forms/create-contact-modal";
import PageTitle from "@/components/page-title";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { exportContacts } from "@/fetchers/crm/contact";
import { useCrmContacts } from "@/hooks/queries/crm/use-crm-contacts";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import { toast } from "@/lib/toast";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/workspace/$workspaceId/crm/contacts/",
)({
  component: RouteComponent,
});

function RouteComponent() {
  const { t } = useTranslation();
  const { workspaceId } = Route.useParams();
  const navigate = useNavigate();
  const { canManageContacts, canExportContacts } = useWorkspacePermission();

  const [search, setSearch] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const { data, isLoading } = useCrmContacts({
    workspaceId,
    ...(search.trim() ? { search: search.trim() } : {}),
  });

  async function handleExport() {
    try {
      const blob = await exportContacts(workspaceId);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `contatos-${workspaceId}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("crm:contact.exportError"),
      );
    }
  }

  const headerActions = (
    <>
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t("crm:contact.searchPlaceholder")}
          className="h-8 w-56 pl-8"
        />
      </div>

      {canExportContacts() ? (
        <Button
          size="sm"
          variant="outline"
          className="h-8"
          onClick={handleExport}
        >
          <Download className="size-4" />
          {t("crm:contact.exportCsv")}
        </Button>
      ) : null}

      {canManageContacts() ? (
        <Button size="sm" className="h-8" onClick={() => setIsCreateOpen(true)}>
          <Plus className="size-4" />
          {t("crm:contact.new")}
        </Button>
      ) : null}
    </>
  );

  return (
    <WorkspaceLayout
      title={t("crm:contact.title")}
      headerActions={headerActions}
    >
      <PageTitle title={t("crm:contact.title")} />

      <div className="mx-auto w-full max-w-6xl px-5 py-6">
        {isLoading ? (
          <div className="space-y-2">
            {[0, 1, 2, 3, 4].map((index) => (
              <Skeleton key={`crm-contact-${index}`} className="h-11 w-full" />
            ))}
          </div>
        ) : !data || data.items.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Contact className="size-5" />
              </EmptyMedia>
              <EmptyTitle>{t("crm:contact.empty")}</EmptyTitle>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("crm:contact.firstName")}</TableHead>
                  <TableHead>{t("crm:contact.company")}</TableHead>
                  <TableHead>{t("crm:contact.email")}</TableHead>
                  <TableHead>{t("crm:contact.phone")}</TableHead>
                  <TableHead>{t("crm:contact.jobTitle")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((contact) => (
                  <TableRow
                    key={contact.id}
                    className="cursor-pointer"
                    onClick={() =>
                      navigate({
                        to: "/dashboard/workspace/$workspaceId/crm/contacts/$contactId",
                        params: { workspaceId, contactId: contact.id },
                      })
                    }
                  >
                    <TableCell>
                      {[contact.firstName, contact.lastName]
                        .filter(Boolean)
                        .join(" ")}
                      {contact.isPrimary ? (
                        <Badge variant="secondary" className="ml-2">
                          {t("crm:contact.primary")}
                        </Badge>
                      ) : null}
                      {contact.emailOptOut ? (
                        <Badge variant="outline" className="ml-2">
                          {t("crm:lgpd.optOut")}
                        </Badge>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {contact.company?.name ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {contact.email ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {contact.phone ?? contact.mobile ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {contact.jobTitle ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {isCreateOpen ? (
        <CreateContactModal
          workspaceId={workspaceId}
          onClose={() => setIsCreateOpen(false)}
        />
      ) : null}
    </WorkspaceLayout>
  );
}
