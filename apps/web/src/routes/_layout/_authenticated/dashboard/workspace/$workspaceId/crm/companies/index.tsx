import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  ArrowDown,
  ArrowUp,
  Building2,
  FileSpreadsheet,
  Plus,
  Search,
  Server,
  Target,
  UserCheck,
  UserMinus,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import WorkspaceLayout from "@/components/common/workspace-layout";
import CompanyStatusBadge from "@/components/crm/company-status-badge";
import CreateCompanyModal from "@/components/crm/forms/create-company-modal";
import { hostingModes } from "@/components/crm/hosting/shared";
import { Field } from "@/components/finance/shared";
import PageTitle from "@/components/page-title";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { FilterPanel } from "@/components/ui/filter-panel";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/status-badge";
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
import { downloadCsv } from "@/lib/download-csv";
import { formatTaxId } from "@/lib/format";
import { getInitials } from "@/lib/get-initials";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/workspace/$workspaceId/crm/companies/",
)({
  component: RouteComponent,
});

type Company = NonNullable<
  ReturnType<typeof useCrmCompanies>["data"]
>["items"][number];
type StatusFilter = "all" | "active" | "prospect" | "inactive" | "churned";
type SortKey = "name" | "status" | "city";

const STATUS_ORDER = {
  active: 0,
  prospect: 1,
  inactive: 2,
  churned: 3,
} as const;
const STATUS_TABS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "Todas" },
  { key: "active", label: "Clientes" },
  { key: "prospect", label: "Prospects" },
  { key: "inactive", label: "Inativos" },
  { key: "churned", label: "Churn" },
];

const cityOf = (company: Company) =>
  company.city
    ? `${company.city}${company.state ? ` / ${company.state}` : ""}`
    : "";

function distinct(values: (string | null | undefined)[]) {
  return [...new Set(values.filter((v): v is string => Boolean(v)))].sort(
    (a, b) => a.localeCompare(b, "pt-BR"),
  );
}

function RouteComponent() {
  const { t } = useTranslation();
  const { workspaceId } = Route.useParams();
  const navigate = useNavigate();
  const { canManageCompanies } = useWorkspacePermission();

  const [search, setSearch] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [status, setStatus] = useState<StatusFilter>("all");
  const [segment, setSegment] = useState("");
  const [source, setSource] = useState("");
  const [hosting, setHosting] = useState("");
  const [city, setCity] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({
    key: "name",
    desc: false,
  });
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const { data, isLoading } = useCrmCompanies({
    workspaceId,
    limit: "200",
    ...(search.trim() ? { search: search.trim() } : {}),
  });
  const items = data?.items ?? [];

  const counts = useMemo(
    () => ({
      all: items.length,
      active: items.filter((c) => c.status === "active").length,
      prospect: items.filter((c) => c.status === "prospect").length,
      inactive: items.filter((c) => c.status === "inactive").length,
      churned: items.filter((c) => c.status === "churned").length,
      ownHosting: items.filter((c) => c.hostingMode === "own").length,
    }),
    [items],
  );

  const visible = useMemo(() => {
    const filtered = items.filter(
      (c) =>
        (status === "all" || c.status === status) &&
        (!segment || c.segment?.name === segment) &&
        (!source || c.source?.name === source) &&
        (!hosting || c.hostingMode === hosting) &&
        (!city || cityOf(c) === city),
    );
    const direction = sort.desc ? -1 : 1;
    return [...filtered].sort((a, b) => {
      if (sort.key === "status") {
        const diff =
          (STATUS_ORDER[a.status as keyof typeof STATUS_ORDER] ?? 9) -
          (STATUS_ORDER[b.status as keyof typeof STATUS_ORDER] ?? 9);
        if (diff !== 0) return diff * direction;
      }
      const left = sort.key === "city" ? cityOf(a) : a.name;
      const right = sort.key === "city" ? cityOf(b) : b.name;
      return left.localeCompare(right, "pt-BR") * direction;
    });
  }, [items, status, segment, source, hosting, city, sort]);

  const selectedItems = visible.filter((c) => selected.has(c.id));
  const allSelected =
    visible.length > 0 && visible.every((c) => selected.has(c.id));
  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(visible.map((c) => c.id)));
  const toggleOne = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const sortBy = (key: SortKey) =>
    setSort((current) => ({
      key,
      desc: current.key === key ? !current.desc : false,
    }));

  const exportCsv = (list: Company[], fileName: string) =>
    downloadCsv(
      [
        [
          "Empresa",
          "CNPJ/CPF",
          "Situação",
          "Contato principal",
          "Telefone/E-mail",
          "Hospedagem",
          "Segmento",
          "Origem",
          "Cidade",
        ],
        ...list.map((c) => [
          c.name,
          formatTaxId(c.taxId) ?? "",
          c.status,
          c.primaryContact?.name ?? "",
          c.primaryContact?.phone ?? c.primaryContact?.email ?? "",
          hostingModes[c.hostingMode],
          c.segment?.name ?? "",
          c.source?.name ?? "",
          cityOf(c),
        ]),
      ],
      fileName,
    );

  const activeFilters = {
    segment,
    source,
    hosting,
    city,
  };
  const SortHead = ({ label, id }: { label: string; id: SortKey }) => (
    <button
      type="button"
      className="inline-flex items-center gap-1 hover:text-foreground"
      onClick={() => sortBy(id)}
    >
      {label}
      {sort.key === id ? (
        sort.desc ? (
          <ArrowDown className="size-3" />
        ) : (
          <ArrowUp className="size-3" />
        )
      ) : null}
    </button>
  );

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

      <div className="mx-auto w-full max-w-7xl space-y-5 p-4 md:p-6">
        <PageHeader
          title={t("crm:company.title")}
          description="Clientes, prospects e as pessoas de contato de cada empresa."
        />

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <StatCard
            label="Empresas"
            value={counts.all}
            icon={Building2}
            tone="primary"
            onClick={() => setStatus("all")}
          />
          <StatCard
            label="Clientes ativos"
            value={counts.active}
            icon={UserCheck}
            tone="success"
            onClick={() => setStatus("active")}
          />
          <StatCard
            label="Prospects"
            value={counts.prospect}
            icon={Target}
            tone="info"
            onClick={() => setStatus("prospect")}
          />
          <StatCard
            label="Em churn"
            value={counts.churned}
            icon={UserMinus}
            tone="danger"
            onClick={() => setStatus("churned")}
          />
          <StatCard
            label="Hospedagem nossa"
            value={counts.ownHosting}
            icon={Server}
            tone="warning"
            onClick={() => setHosting(hosting === "own" ? "" : "own")}
          />
        </div>

        <section className="space-y-4 rounded-xl border bg-card p-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap gap-1.5" role="tablist">
              {STATUS_TABS.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  role="tab"
                  aria-selected={status === tab.key}
                  onClick={() => setStatus(tab.key)}
                  className={`rounded-full border px-3 py-1 text-sm font-semibold transition-colors ${
                    status === tab.key
                      ? "border-primary bg-primary text-primary-foreground"
                      : "bg-background hover:bg-muted"
                  }`}
                >
                  {tab.label}{" "}
                  <span className="tabular-nums opacity-80">
                    {counts[tab.key]}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <FilterPanel values={activeFilters}>
            <div className="grid gap-3 rounded-lg border bg-muted/30 p-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Segmento">
                <NativeSelect
                  value={segment}
                  onChange={(e) => setSegment(e.target.value)}
                >
                  <option value="">Todos</option>
                  {distinct(items.map((c) => c.segment?.name)).map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="Origem">
                <NativeSelect
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                >
                  <option value="">Todas</option>
                  {distinct(items.map((c) => c.source?.name)).map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="Hospedagem">
                <NativeSelect
                  value={hosting}
                  onChange={(e) => setHosting(e.target.value)}
                >
                  <option value="">Todas</option>
                  {Object.entries(hostingModes).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="Cidade">
                <NativeSelect
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                >
                  <option value="">Todas</option>
                  {distinct(items.map(cityOf)).map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            </div>
          </FilterPanel>

          {selectedItems.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/50 px-3 py-2 text-sm">
              <span className="font-semibold">
                {selectedItems.length} selecionada
                {selectedItems.length > 1 ? "s" : ""}
              </span>
              <div className="ml-auto flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    exportCsv(selectedItems, "empresas-selecionadas.csv")
                  }
                >
                  <FileSpreadsheet className="size-4" />
                  Exportar selecionadas (CSV)
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setSelected(new Set())}
                >
                  <X className="size-4" />
                  Limpar
                </Button>
              </div>
            </div>
          ) : null}

          {isLoading ? (
            <div className="space-y-2">
              {[0, 1, 2, 3, 4].map((index) => (
                <Skeleton
                  key={`crm-company-${index}`}
                  className="h-11 w-full"
                />
              ))}
            </div>
          ) : visible.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Building2 className="size-5" />
                </EmptyMedia>
                <EmptyTitle>{t("crm:company.empty")}</EmptyTitle>
              </EmptyHeader>
            </Empty>
          ) : (
            <Table containerClassName="max-h-[65vh] overflow-auto">
              <TableHeader>
                <TableRow>
                  <TableHead className="sticky top-0 z-10 w-10 bg-card">
                    <Checkbox
                      aria-label="Selecionar todas"
                      checked={allSelected}
                      onCheckedChange={toggleAll}
                    />
                  </TableHead>
                  <TableHead className="sticky top-0 z-10 bg-card">
                    <SortHead label="Empresa" id="name" />
                  </TableHead>
                  <TableHead className="sticky top-0 z-10 bg-card">
                    Contato principal
                  </TableHead>
                  <TableHead className="sticky top-0 z-10 bg-card">
                    <SortHead label="Situação" id="status" />
                  </TableHead>
                  <TableHead className="sticky top-0 z-10 bg-card">
                    Hospedagem
                  </TableHead>
                  <TableHead className="sticky top-0 z-10 bg-card">
                    Segmento · Origem
                  </TableHead>
                  <TableHead className="sticky top-0 z-10 bg-card">
                    <SortHead label="Cidade" id="city" />
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((company) => (
                  <TableRow
                    key={company.id}
                    className="cursor-pointer"
                    data-state={
                      selected.has(company.id) ? "selected" : undefined
                    }
                    onClick={() =>
                      navigate({
                        to: "/dashboard/workspace/$workspaceId/crm/companies/$companyId",
                        params: { workspaceId, companyId: company.id },
                      })
                    }
                  >
                    <TableCell onClick={(event) => event.stopPropagation()}>
                      <Checkbox
                        aria-label={`Selecionar ${company.name}`}
                        checked={selected.has(company.id)}
                        onCheckedChange={() => toggleOne(company.id)}
                      />
                    </TableCell>
                    <TableCell className="min-w-56">
                      <div className="flex items-center gap-3">
                        <Avatar className="size-9 rounded-lg">
                          <AvatarFallback className="rounded-lg bg-primary/15 text-xs font-bold text-primary">
                            {getInitials(company.name)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 leading-tight">
                          <div className="truncate font-semibold">
                            {company.name}
                          </div>
                          <div className="truncate text-xs font-normal text-muted-foreground">
                            {formatTaxId(company.taxId) ?? "Sem CNPJ/CPF"}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {company.primaryContact ? (
                        <div className="leading-tight">
                          <div className="font-medium">
                            {company.primaryContact.name}
                            {company.contactCount > 1
                              ? ` +${company.contactCount - 1}`
                              : ""}
                          </div>
                          <div className="text-xs font-normal text-muted-foreground">
                            {company.primaryContact.phone ??
                              company.primaryContact.email ??
                              ""}
                          </div>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <CompanyStatusBadge status={company.status} />
                    </TableCell>
                    <TableCell>
                      {company.hostingMode === "unknown" ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <StatusBadge
                          tone={
                            company.hostingMode === "own"
                              ? "success"
                              : company.hostingMode === "third_party"
                                ? "info"
                                : "neutral"
                          }
                        >
                          {hostingModes[company.hostingMode]}
                        </StatusBadge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="leading-tight">
                        <div className="font-medium">
                          {company.segment?.name ?? "—"}
                        </div>
                        <div className="text-xs font-normal text-muted-foreground">
                          {company.source?.name ?? "—"}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="font-normal text-muted-foreground">
                      {cityOf(company) || "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
            <span>
              <strong className="text-foreground tabular-nums">
                {visible.length}
              </strong>{" "}
              {visible.length === 1 ? "empresa" : "empresas"}
              {visible.length !== items.length ? ` de ${items.length}` : ""}
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={visible.length === 0}
              onClick={() => exportCsv(visible, "empresas.csv")}
            >
              <FileSpreadsheet className="size-4" />
              Exportar lista (CSV)
            </Button>
          </div>
          {data && data.total > items.length ? (
            <p className="text-xs text-muted-foreground">
              Mostrando as primeiras {items.length} de {data.total}. Use a busca
              para encontrar as demais.
            </p>
          ) : null}
        </section>
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
