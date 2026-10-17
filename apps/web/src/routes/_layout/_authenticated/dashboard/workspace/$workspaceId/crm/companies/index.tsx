import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Building2, Plus, Search } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import WorkspaceLayout from "@/components/common/workspace-layout";
import CompanyStatusBadge from "@/components/crm/company-status-badge";
import CreateCompanyModal from "@/components/crm/forms/create-company-modal";
import PageTitle from "@/components/page-title";
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
import { useCrmCompanies } from "@/hooks/queries/crm/use-crm-companies";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import { formatTaxId } from "@/lib/format";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/workspace/$workspaceId/crm/companies/",
)({
  component: RouteComponent,
});

function RouteComponent() {
  const { t } = useTranslation();
  const { workspaceId } = Route.useParams();
  const navigate = useNavigate();
  const { canManageCompanies } = useWorkspacePermission();

  const [search, setSearch] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const { data, isLoading } = useCrmCompanies({
    workspaceId,
    ...(search.trim() ? { search: search.trim() } : {}),
  });

  const headerActions = (
    <>
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t("crm:company.searchPlaceholder")}
          className="h-8 w-56 pl-8"
        />
      </div>
      {canManageCompanies() ? (
        <Button size="sm" className="h-8" onClick={() => setIsCreateOpen(true)}>
          <Plus className="size-4" />
          {t("crm:company.new")}
        </Button>
      ) : null}
    </>
  );

  return (
    <WorkspaceLayout
      title={t("crm:company.title")}
      headerActions={headerActions}
    >
      <PageTitle title={t("crm:company.title")} />

      <div className="mx-auto w-full max-w-6xl px-5 py-6">
        {isLoading ? (
          <div className="space-y-2">
            {[0, 1, 2, 3, 4].map((index) => (
              <Skeleton key={`crm-company-${index}`} className="h-11 w-full" />
            ))}
          </div>
        ) : !data || data.items.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Building2 className="size-5" />
              </EmptyMedia>
              <EmptyTitle>{t("crm:company.empty")}</EmptyTitle>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("crm:company.name")}</TableHead>
                  <TableHead>{t("crm:company.status")}</TableHead>
                  <TableHead>{t("crm:company.taxId")}</TableHead>
                  <TableHead>{t("crm:company.segment")}</TableHead>
                  <TableHead>{t("crm:company.source")}</TableHead>
                  <TableHead>{t("crm:company.city")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((company) => (
                  <TableRow
                    key={company.id}
                    className="cursor-pointer"
                    onClick={() =>
                      navigate({
                        to: "/dashboard/workspace/$workspaceId/crm/companies/$companyId",
                        params: { workspaceId, companyId: company.id },
                      })
                    }
                  >
                    <TableCell>{company.name}</TableCell>
                    <TableCell>
                      <CompanyStatusBadge status={company.status} />
                    </TableCell>
                    <TableCell className="tabular-nums text-muted-foreground">
                      {formatTaxId(company.taxId) ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {company.segment?.name ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {company.source?.name ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {company.city
                        ? `${company.city}${company.state ? ` / ${company.state}` : ""}`
                        : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {isCreateOpen ? (
        <CreateCompanyModal
          workspaceId={workspaceId}
          onClose={() => setIsCreateOpen(false)}
        />
      ) : null}
    </WorkspaceLayout>
  );
}
