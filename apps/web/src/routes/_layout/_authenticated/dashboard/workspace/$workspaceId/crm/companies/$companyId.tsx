import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, FolderKanban, Globe, Pencil, UserPlus } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import WorkspaceLayout from "@/components/common/workspace-layout";
import CompanyStatusBadge from "@/components/crm/company-status-badge";
import ContractStatusBadge from "@/components/crm/contract-status-badge";
import CreateContactModal from "@/components/crm/forms/create-contact-modal";
import EditCompanyModal from "@/components/crm/forms/edit-company-modal";
import CrmTimeline from "@/components/crm/timeline";
import PageTitle from "@/components/page-title";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { useCrmCompany } from "@/hooks/queries/crm/use-crm-companies";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import { formatTaxId } from "@/lib/format";
import { formatMoney } from "@/lib/money";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/workspace/$workspaceId/crm/companies/$companyId",
)({
  component: RouteComponent,
});

const SIZE_KEY = {
  mei: "sizeMei",
  me: "sizeMe",
  epp: "sizeEpp",
  medium: "sizeMedium",
  large: "sizeLarge",
} as const;

const TERMS_KEY = {
  cash: "termsCash",
  "15": "terms15",
  "30": "terms30",
  "30_60": "terms3060",
  custom: "termsCustom",
} as const;

const METHOD_KEY = {
  pix: "methodPix",
  boleto: "methodBoleto",
  card: "methodCard",
  transfer: "methodTransfer",
} as const;

function formatDate(value: string | Date | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString();
}

function Fact({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function RouteComponent() {
  const { t } = useTranslation();
  const { workspaceId, companyId } = Route.useParams();
  const { data: company, isLoading } = useCrmCompany(companyId, workspaceId);
  const { canManageContacts } = useWorkspacePermission();
  const [isAddingContact, setIsAddingContact] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  if (isLoading) {
    return (
      <WorkspaceLayout title={t("crm:company.title")}>
        <div className="mx-auto w-full max-w-4xl space-y-4 px-5 py-6">
          <Skeleton className="h-8 w-1/2" />
          <Skeleton className="h-40 w-full" />
        </div>
      </WorkspaceLayout>
    );
  }

  if (!company) {
    return (
      <WorkspaceLayout title={t("crm:company.title")}>
        <p className="px-5 py-6 text-sm text-muted-foreground">
          {t("crm:company.notFound")}
        </p>
      </WorkspaceLayout>
    );
  }

  const byStatus = new Map(company.deals.map((stat) => [stat.status, stat]));
  const won = byStatus.get("won");
  const lost = byStatus.get("lost");
  const open = byStatus.get("open");
  const closed = (won?.count ?? 0) + (lost?.count ?? 0);
  // Only closed deals can produce a win rate; counting open ones would report a
  // falling rate every time a new deal is created.
  const winRate =
    closed > 0 ? Math.round(((won?.count ?? 0) / closed) * 100) : null;

  return (
    <WorkspaceLayout title={company.name}>
      <PageTitle title={company.name} />

      <div className="mx-auto w-full max-w-4xl px-5 py-6">
        <Link
          to="/dashboard/workspace/$workspaceId/crm/companies"
          params={{ workspaceId }}
          className="mb-4 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          {t("crm:company.title")}
        </Link>

        <header className="space-y-2">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl font-semibold tracking-tight">
                {company.name}
              </h1>
              <CompanyStatusBadge status={company.status} size="default" />
            </div>
            {canManageContacts() ? (
              <Button
                variant="outline"
                size="sm"
                className="h-8"
                onClick={() => setIsEditing(true)}
              >
                <Pencil className="size-3.5" />
                {t("crm:company.edit")}
              </Button>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            {company.legalName ? <span>{company.legalName}</span> : null}
            {company.taxId ? (
              <span className="tabular-nums">{formatTaxId(company.taxId)}</span>
            ) : null}
            {company.domain ? (
              <span className="inline-flex items-center gap-1.5">
                <Globe className="size-3.5" />
                {company.domain}
              </span>
            ) : null}
            {company.segment ? <span>{company.segment.name}</span> : null}
          </div>
        </header>

        <Separator className="my-6" />

        {/* O cadastro em si: é o que responde de onde o cliente veio, há
            quanto tempo é cliente e como ele é faturado. */}
        <section className="space-y-3 rounded-xl border bg-card p-4">
          <h2 className="text-sm font-medium">
            {t("crm:company.sectionClassification")}
          </h2>
          <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
            <Fact label={t("crm:company.source")}>
              {company.source?.name ?? "—"}
            </Fact>
            <Fact label={t("crm:company.segment")}>
              {company.segment?.name ?? "—"}
            </Fact>
            <Fact label={t("crm:company.companySize")}>
              {company.companySize
                ? t(`crm:company.${SIZE_KEY[company.companySize]}`)
                : "—"}
            </Fact>
            <Fact label={t("crm:company.clientSince")}>
              {formatDate(company.clientSince)}
            </Fact>
            <Fact label={t("crm:company.city")}>
              {company.city
                ? `${company.city}${company.state ? ` / ${company.state}` : ""}`
                : "—"}
            </Fact>
            <Fact label={t("crm:company.paymentTerms")}>
              {company.paymentTerms
                ? t(`crm:company.${TERMS_KEY[company.paymentTerms]}`)
                : "—"}
            </Fact>
            <Fact label={t("crm:company.billingDay")}>
              {company.billingDay ?? "—"}
            </Fact>
            <Fact label={t("crm:company.paymentMethod")}>
              {company.paymentMethod
                ? t(`crm:company.${METHOD_KEY[company.paymentMethod]}`)
                : "—"}
            </Fact>
            {company.churnedAt ? (
              <Fact label={t("crm:company.churnedAt")}>
                {formatDate(company.churnedAt)}
                {company.churnReason ? ` — ${company.churnReason}` : ""}
              </Fact>
            ) : null}
          </dl>
        </section>

        <Separator className="my-6" />

        {/* Contratos antes do comercial: o que o cliente paga todo mês é a
            primeira coisa que se quer saber de um cliente ativo. */}
        <section className="space-y-3 rounded-xl border bg-card p-4">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-medium">
              {t("crm:contracts.blockTitle")}
            </h2>
            {company.activeMrrCents > 0 ? (
              <span className="text-sm tabular-nums">
                {t("crm:contracts.perMonth", {
                  value: formatMoney(company.activeMrrCents),
                })}
              </span>
            ) : null}
          </div>
          {company.contracts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("crm:contracts.noContracts")}
            </p>
          ) : (
            <ul className="divide-y divide-border/60 rounded-lg border border-border">
              {company.contracts.map((contract) => (
                <li key={contract.id}>
                  <Link
                    to="/dashboard/workspace/$workspaceId/crm/contracts/$contractId"
                    params={{ workspaceId, contractId: contract.id }}
                    className="flex items-center justify-between gap-3 px-3 py-2 text-sm hover:bg-muted/40"
                  >
                    <span className="flex items-center gap-2">
                      <span className="font-mono text-xs text-muted-foreground">
                        #{contract.number}
                      </span>
                      {contract.title}
                      <ContractStatusBadge status={contract.status} />
                    </span>
                    <span className="tabular-nums">
                      {formatMoney(contract.monthlyValueCents)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <Separator className="my-6" />

        <section className="space-y-3 rounded-xl border bg-card p-4">
          <h2 className="text-sm font-medium">{t("crm:company.commercial")}</h2>
          <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-xs text-muted-foreground">
                {t("crm:company.openDeals")}
              </dt>
              <dd className="tabular-nums">
                {open?.count ?? 0}
                <span className="ml-1.5 text-xs text-muted-foreground">
                  {formatMoney(open?.valueCents ?? 0)}
                </span>
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">
                {t("crm:company.wonDeals")}
              </dt>
              <dd className="tabular-nums">
                {won?.count ?? 0}
                <span className="ml-1.5 text-xs text-muted-foreground">
                  {formatMoney(won?.valueCents ?? 0)}
                </span>
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">
                {t("crm:company.lostDeals")}
              </dt>
              <dd className="tabular-nums">{lost?.count ?? 0}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">
                {t("crm:company.conversionRate")}
              </dt>
              <dd className="tabular-nums">
                {winRate === null ? "—" : `${winRate}%`}
              </dd>
            </div>
          </dl>
        </section>

        <Separator className="my-6" />

        <section className="space-y-3 rounded-xl border bg-card p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium">{t("crm:company.people")}</h2>
            {canManageContacts() ? (
              <Button
                size="sm"
                variant="outline"
                className="h-7"
                onClick={() => setIsAddingContact(true)}
              >
                <UserPlus className="size-3.5" />
                {t("crm:contact.new")}
              </Button>
            ) : null}
          </div>
          {company.contacts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("crm:company.noPeople")}
            </p>
          ) : (
            <ul className="space-y-1.5">
              {company.contacts.map((contact) => (
                <li key={contact.id}>
                  <Link
                    to="/dashboard/workspace/$workspaceId/crm/contacts/$contactId"
                    params={{ workspaceId, contactId: contact.id }}
                    className="flex flex-wrap items-center gap-2 text-sm hover:underline"
                  >
                    <span>
                      {[contact.firstName, contact.lastName]
                        .filter(Boolean)
                        .join(" ")}
                    </span>
                    {contact.jobTitle ? (
                      <span className="text-xs text-muted-foreground">
                        {contact.jobTitle}
                      </span>
                    ) : null}
                    {contact.isPrimary ? (
                      <Badge variant="secondary">
                        {t("crm:contact.primary")}
                      </Badge>
                    ) : null}
                    {contact.email ? (
                      <span className="text-xs text-muted-foreground">
                        {contact.email}
                      </span>
                    ) : null}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <Separator className="my-6" />

        <section className="space-y-3 rounded-xl border bg-card p-4">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-medium">{t("crm:company.delivery")}</h2>
            {company.openTaskCount > 0 ? (
              <span className="text-xs text-muted-foreground">
                {t("crm:company.openTasks", { count: company.openTaskCount })}
              </span>
            ) : null}
          </div>

          {company.tasksByProject.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("crm:company.noTasks")}
            </p>
          ) : (
            /* Grouped by project only so the list is readable — the work of one
               client is spread across every discipline project. */
            <div className="space-y-4">
              {company.tasksByProject.map((group) => (
                <div key={group.projectId} className="space-y-1.5">
                  <Link
                    to="/dashboard/workspace/$workspaceId/project/$projectId/board"
                    params={{ workspaceId, projectId: group.projectId }}
                    className="inline-flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground"
                  >
                    <FolderKanban className="size-3.5" />
                    {group.projectName}
                    <span className="tabular-nums">
                      ({group.openCount}/{group.tasks.length})
                    </span>
                  </Link>

                  <ul className="space-y-1 border-l border-border pl-3">
                    {group.tasks.map((task) => (
                      <li key={task.id}>
                        <Link
                          to="/dashboard/workspace/$workspaceId/project/$projectId/task/$taskId"
                          params={{
                            workspaceId,
                            projectId: group.projectId,
                            taskId: task.id,
                          }}
                          className="flex items-center gap-2 text-sm hover:underline"
                        >
                          <span
                            className={
                              task.isDone
                                ? "text-muted-foreground line-through"
                                : ""
                            }
                          >
                            {task.title}
                          </span>
                          {task.crmDealId ? (
                            <Badge variant="outline" className="shrink-0">
                              {t("crm:task.fromDeal")}
                            </Badge>
                          ) : null}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </section>

        <Separator className="my-6" />

        <section className="space-y-3 rounded-xl border bg-card p-4">
          <h2 className="text-sm font-medium">{t("crm:timeline.title")}</h2>
          <CrmTimeline workspaceId={workspaceId} companyId={companyId} />
        </section>
      </div>

      {isEditing ? (
        <EditCompanyModal
          workspaceId={workspaceId}
          company={company}
          onClose={() => setIsEditing(false)}
        />
      ) : null}

      {isAddingContact ? (
        <CreateContactModal
          workspaceId={workspaceId}
          companyId={companyId}
          onClose={() => setIsAddingContact(false)}
        />
      ) : null}
    </WorkspaceLayout>
  );
}
