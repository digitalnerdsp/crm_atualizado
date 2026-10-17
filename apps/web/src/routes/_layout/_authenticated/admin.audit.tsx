import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import {
  ArrowLeft,
  CalendarDays,
  FileClock,
  Filter,
  Globe2,
  Search,
  ShieldCheck,
  User,
} from "lucide-react";
import type { SelectHTMLAttributes } from "react";
import { useMemo, useState } from "react";
import Layout from "@/components/common/layout";
import PageTitle from "@/components/page-title";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardPanel,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import type { AdminAuditEvent } from "@/fetchers/admin/get-admin-audit-events";
import { getAdminAuditEvents } from "@/fetchers/admin/get-admin-audit-events";
import { useAdminAuditEvents } from "@/hooks/queries/admin/use-admin-audit-events";
import { useAdminUsers } from "@/hooks/queries/admin/use-admin-users";

export const Route = createFileRoute("/_layout/_authenticated/admin/audit")({
  beforeLoad: async () => {
    try {
      await getAdminAuditEvents({ limit: "1" });
    } catch {
      throw redirect({ to: "/admin" });
    }
  },
  component: AdminAuditPage,
});

type SelectProps = SelectHTMLAttributes<HTMLSelectElement>;
type RangePreset = "today" | "7d" | "30d" | "custom";

const macroActions = [
  "user.created",
  "user.updated",
  "user.deleted",
  "user.password_reset",
  "user.sessions_revoked",
  "role.created",
  "role.updated",
  "role.deleted",
  "workspace.created",
  "workspace.updated",
  "workspace.archived",
  "workspace.restored",
  "workspace.deleted",
  "project.created",
  "project.updated",
  "project.archived",
  "project.restored",
  "project.duplicated",
  "project.deleted",
  "invitation.created",
];

const entityTypes = ["user", "role", "workspace", "project", "invitation"];

function SelectInput({ className = "", ...props }: SelectProps) {
  return (
    <select
      className={`h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring ${className}`}
      {...props}
    />
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatJson(value: unknown) {
  if (!value || (typeof value === "object" && !Object.keys(value).length)) {
    return null;
  }

  return JSON.stringify(value, null, 2);
}

function DetailBlock({
  title,
  value,
}: {
  title: string;
  value: string | null;
}) {
  if (!value) return null;

  return (
    <div className="min-w-0 space-y-1">
      <div className="font-medium text-muted-foreground text-xs uppercase">
        {title}
      </div>
      <pre className="max-h-72 overflow-auto rounded-md border border-border bg-muted/30 p-3 text-xs leading-relaxed">
        {value}
      </pre>
    </div>
  );
}

function AuditDetails({ event }: { event: AdminAuditEvent }) {
  const before = formatJson(event.before);
  const after = formatJson(event.after);
  const metadata = formatJson(event.metadata);

  if (!before && !after && !metadata) return null;

  return (
    <details className="rounded-md border border-border bg-background p-3">
      <summary className="cursor-pointer font-medium text-sm">
        Ver detalhes
      </summary>
      <div className="mt-3 grid gap-3 xl:grid-cols-3">
        <DetailBlock title="Antes" value={before} />
        <DetailBlock title="Depois" value={after} />
        <DetailBlock title="Metadados" value={metadata} />
      </div>
    </details>
  );
}

function EntityBadge({ event }: { event: AdminAuditEvent }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant="outline">{event.entityType}</Badge>
      {event.entityName && (
        <span className="text-muted-foreground text-xs">
          {event.entityName}
        </span>
      )}
    </div>
  );
}

function AdminAuditPage() {
  const [query, setQuery] = useState("");
  const [action, setAction] = useState("");
  const [entityType, setEntityType] = useState("");
  const [actorUserId, setActorUserId] = useState("");
  const [rangePreset, setRangePreset] = useState<RangePreset>("7d");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const auditQuery = useMemo(() => {
    const now = new Date();
    let from: string | undefined;
    let to: string | undefined = now.toISOString();

    if (rangePreset === "today") {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      from = start.toISOString();
    }

    if (rangePreset === "7d") {
      const start = new Date(now);
      start.setDate(start.getDate() - 7);
      from = start.toISOString();
    }

    if (rangePreset === "30d") {
      const start = new Date(now);
      start.setDate(start.getDate() - 30);
      from = start.toISOString();
    }

    if (rangePreset === "custom") {
      from = customFrom
        ? new Date(`${customFrom}T00:00:00`).toISOString()
        : undefined;
      to = customTo
        ? new Date(`${customTo}T23:59:59`).toISOString()
        : undefined;
    }

    return {
      q: query || undefined,
      action: action || undefined,
      entityType: entityType || undefined,
      actorUserId: actorUserId || undefined,
      from,
      to,
      limit: "150",
    };
  }, [
    action,
    actorUserId,
    customFrom,
    customTo,
    entityType,
    query,
    rangePreset,
  ]);
  const { data, isLoading } = useAdminAuditEvents(auditQuery);
  const { data: usersData } = useAdminUsers({ status: "all", limit: "100" });
  const events = data?.events ?? [];
  const actionOptions = Array.from(
    new Set([...macroActions, ...events.map((event) => event.action)]),
  );
  const entityOptions = Array.from(
    new Set([...entityTypes, ...events.map((event) => event.entityType)]),
  );

  return (
    <Layout>
      <PageTitle title="Auditoria" />
      <Layout.Header className="h-12 items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <FileClock className="size-4 text-muted-foreground" />
          <h1 className="font-semibold text-sm">Auditoria</h1>
        </div>
        <Button size="sm" variant="outline" render={<Link to="/admin" />}>
          <ArrowLeft />
          Administração
        </Button>
      </Layout.Header>
      <Layout.Content className="overflow-auto bg-sidebar">
        <main className="mx-auto flex w-full max-w-7xl flex-col gap-4 p-4">
          <section className="grid gap-3 md:grid-cols-3">
            <Card className="rounded-lg">
              <CardHeader className="grid grid-cols-[1fr_auto] items-center gap-3 p-4">
                <div>
                  <CardDescription>Eventos carregados</CardDescription>
                  <CardTitle className="text-2xl">{events.length}</CardTitle>
                </div>
                <FileClock className="size-4 text-muted-foreground" />
              </CardHeader>
            </Card>
            <Card className="rounded-lg">
              <CardHeader className="grid grid-cols-[1fr_auto] items-center gap-3 p-4">
                <div>
                  <CardDescription>Ações</CardDescription>
                  <CardTitle className="text-2xl">
                    {actionOptions.length}
                  </CardTitle>
                </div>
                <ShieldCheck className="size-4 text-muted-foreground" />
              </CardHeader>
            </Card>
            <Card className="rounded-lg">
              <CardHeader className="grid grid-cols-[1fr_auto] items-center gap-3 p-4">
                <div>
                  <CardDescription>Entidades</CardDescription>
                  <CardTitle className="text-2xl">
                    {entityOptions.length}
                  </CardTitle>
                </div>
                <Filter className="size-4 text-muted-foreground" />
              </CardHeader>
            </Card>
          </section>

          <Card className="rounded-lg">
            <CardHeader className="gap-3 p-4">
              <div>
                <CardTitle>Histórico administrativo</CardTitle>
                <CardDescription>
                  Ações sensíveis executadas por administradores.
                </CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                {[
                  ["today", "Hoje"],
                  ["7d", "7 dias"],
                  ["30d", "30 dias"],
                  ["custom", "Personalizado"],
                ].map(([value, label]) => (
                  <Button
                    key={value}
                    size="sm"
                    type="button"
                    variant={rangePreset === value ? "default" : "outline"}
                    onClick={() => setRangePreset(value as RangePreset)}
                  >
                    {label}
                  </Button>
                ))}
              </div>
              <div className="grid gap-2 lg:grid-cols-[minmax(240px,1fr)_180px_160px_190px_150px_150px]">
                <div className="relative">
                  <Search className="-translate-y-1/2 pointer-events-none absolute left-2.5 top-1/2 size-4 text-muted-foreground" />
                  <Input
                    className="pl-8"
                    placeholder="Buscar ação, entidade ou ator"
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                  />
                </div>
                <SelectInput
                  value={action}
                  onChange={(event) => setAction(event.target.value)}
                >
                  <option value="">Todas as ações</option>
                  {actionOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </SelectInput>
                <SelectInput
                  value={entityType}
                  onChange={(event) => setEntityType(event.target.value)}
                >
                  <option value="">Entidades</option>
                  {entityOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </SelectInput>
                <SelectInput
                  value={actorUserId}
                  onChange={(event) => setActorUserId(event.target.value)}
                >
                  <option value="">Todos os atores</option>
                  {(usersData?.users ?? []).map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name}
                    </option>
                  ))}
                </SelectInput>
                <div className="relative">
                  <CalendarDays className="-translate-y-1/2 pointer-events-none absolute left-2.5 top-1/2 size-4 text-muted-foreground" />
                  <Input
                    className="pl-8"
                    disabled={rangePreset !== "custom"}
                    type="date"
                    value={customFrom}
                    onChange={(event) => setCustomFrom(event.target.value)}
                  />
                </div>
                <div className="relative">
                  <CalendarDays className="-translate-y-1/2 pointer-events-none absolute left-2.5 top-1/2 size-4 text-muted-foreground" />
                  <Input
                    className="pl-8"
                    disabled={rangePreset !== "custom"}
                    type="date"
                    value={customTo}
                    onChange={(event) => setCustomTo(event.target.value)}
                  />
                </div>
              </div>
            </CardHeader>
            <CardPanel className="space-y-3 p-4 pt-0">
              {isLoading
                ? Array.from({ length: 6 }).map((_, index) => (
                    <Skeleton
                      key={index.toString()}
                      className="h-36 rounded-md"
                    />
                  ))
                : events.map((event) => (
                    <article
                      className="space-y-4 rounded-md border border-border bg-background p-4"
                      key={event.id}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="secondary">{event.action}</Badge>
                            <EntityBadge event={event} />
                          </div>
                          <h2 className="font-medium text-base">
                            {event.summary}
                          </h2>
                        </div>
                        <div className="rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-sm">
                          <div className="flex items-center gap-2 font-medium">
                            <Globe2 className="size-4" />
                            IP
                          </div>
                          <div className="mt-1 font-mono text-foreground">
                            {event.ipAddress || "Não capturado"}
                          </div>
                        </div>
                      </div>

                      <div className="grid gap-3 text-sm md:grid-cols-3">
                        <div className="rounded-md border border-border p-3">
                          <div className="text-muted-foreground text-xs">
                            Quando
                          </div>
                          <div className="mt-1 font-medium">
                            {formatDate(event.createdAt)}
                          </div>
                        </div>
                        <div className="rounded-md border border-border p-3">
                          <div className="text-muted-foreground text-xs">
                            Ator
                          </div>
                          <div className="mt-1 flex items-start gap-2">
                            <User className="mt-0.5 size-4 text-muted-foreground" />
                            <div>
                              <div className="font-medium">
                                {event.actor?.name ?? "Sistema"}
                              </div>
                              {event.actor?.email && (
                                <div className="text-muted-foreground text-xs">
                                  {event.actor.email}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="rounded-md border border-border p-3">
                          <div className="text-muted-foreground text-xs">
                            Navegador
                          </div>
                          <div className="mt-1 line-clamp-2 text-muted-foreground text-xs">
                            {event.userAgent || "Não capturado"}
                          </div>
                        </div>
                      </div>

                      <AuditDetails event={event} />
                    </article>
                  ))}
              {!isLoading && events.length === 0 && (
                <div className="rounded-md border border-dashed border-border py-10 text-center text-muted-foreground">
                  Nenhum evento de auditoria encontrado.
                </div>
              )}
            </CardPanel>
          </Card>
        </main>
      </Layout.Content>
    </Layout>
  );
}
