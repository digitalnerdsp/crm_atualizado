import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  AlertTriangle,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  Clock3,
  FolderKanban,
  Gauge,
  ListChecks,
  ShieldAlert,
  Sparkles,
  TrendingUp,
  UserCheck,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import Layout from "@/components/common/layout";
import PageTitle from "@/components/page-title";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/ui/stat-card";
import { useWorkspaceDashboard } from "@/hooks/queries/dashboard/use-workspace-dashboard";
import useActiveWorkspace from "@/hooks/queries/workspace/use-active-workspace";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import { cn } from "@/lib/cn";
import { getInitials } from "@/lib/get-initials";

export const Route = createFileRoute("/_layout/_authenticated/overview")({
  component: OperationalDashboardPage,
});

type Period = "today" | "7d" | "30d" | "custom";

const PERIODS: Array<{ value: Period; label: string }> = [
  { value: "today", label: "Hoje" },
  { value: "7d", label: "7 dias" },
  { value: "30d", label: "30 dias" },
  { value: "custom", label: "Personalizado" },
];

const STATUS_COLORS = [
  "var(--color-primary)",
  "var(--color-info)",
  "var(--color-warning)",
  "var(--color-success)",
  "var(--color-muted-foreground)",
];

function dateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function defaultRange(period: Period) {
  const to = new Date();
  const from = new Date();

  if (period === "today") {
    from.setHours(0, 0, 0, 0);
    return { from: dateInputValue(from), to: dateInputValue(to) };
  }

  if (period === "7d") {
    from.setDate(to.getDate() - 6);
    return { from: dateInputValue(from), to: dateInputValue(to) };
  }

  from.setDate(to.getDate() - 29);
  return { from: dateInputValue(from), to: dateInputValue(to) };
}

function formatCompactDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
  }).format(new Date(`${value}T00:00:00`));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function formatRelativeDays(value: string) {
  const days = Math.max(
    0,
    Math.floor(
      (Date.now() - new Date(value).getTime()) / (24 * 60 * 60 * 1000),
    ),
  );
  if (days === 0) return "hoje";
  if (days === 1) return "1 dia";
  return `${days} dias`;
}

function formatLastAccess(value: string | null) {
  if (!value) return "Sem acesso";
  return formatDateTime(value);
}

function dueTaskLabel(value: string) {
  const dueDate = new Date(value);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dueDay = new Date(dueDate);
  dueDay.setHours(0, 0, 0, 0);
  const diffDays = Math.ceil(
    (dueDay.getTime() - today.getTime()) / (24 * 60 * 60 * 1000),
  );

  if (diffDays < 0) {
    const days = Math.abs(diffDays);
    return days === 1 ? "Vencida ha 1 dia" : `Vencida ha ${days} dias`;
  }
  if (diffDays === 0) return "Vence hoje";
  if (diffDays === 1) return "Vence amanha";
  return `Vence em ${diffDays} dias`;
}

function dueTaskVariant(urgency: "overdue" | "next_3_days" | "this_week") {
  if (urgency === "overdue") return "error" as const;
  if (urgency === "next_3_days") return "warning" as const;
  return "info" as const;
}

function dueTaskGroupLabel(urgency: "overdue" | "next_3_days" | "this_week") {
  if (urgency === "overdue") return "Vencida";
  if (urgency === "next_3_days") return "3 dias";
  return "Semana";
}

function riskLabel(level: "low" | "medium" | "high") {
  if (level === "high") return "Alto";
  if (level === "medium") return "Medio";
  return "Baixo";
}

function riskVariant(level: "low" | "medium" | "high") {
  if (level === "high") return "error" as const;
  if (level === "medium") return "warning" as const;
  return "success" as const;
}

function severityVariant(severity: "info" | "warning" | "critical") {
  if (severity === "critical") return "error" as const;
  if (severity === "warning") return "warning" as const;
  return "info" as const;
}

function MetricCard({
  title,
  value,
  detail,
  icon: Icon,
  tone = "neutral",
}: {
  title: string;
  value: number;
  detail: string;
  icon: typeof Gauge;
  tone?: "neutral" | "good" | "warning" | "critical";
}) {
  const toneClass = {
    neutral: "text-muted-foreground",
    good: "text-success-foreground",
    warning: "text-warning-foreground",
    critical: "text-destructive",
  }[tone];

  return (
    <StatCard
      label={title}
      value={value}
      detail={detail}
      icon={Icon}
      iconClassName={toneClass}
    />
  );
}

function ActivityLineChart({
  data,
}: {
  data: Array<{ date: string; total: number; tasksCreated: number }>;
}) {
  const width = 640;
  const height = 190;
  const padding = 20;
  const maxValue = Math.max(1, ...data.map((item) => item.total));
  const points = data.map((item, index) => {
    const x =
      data.length === 1
        ? width / 2
        : padding +
          (index * (width - padding * 2)) / Math.max(1, data.length - 1);
    const y =
      height - padding - (item.total / maxValue) * (height - padding * 2);
    return { x, y, item };
  });
  const line = points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ");
  const lastPoint = points[points.length - 1];
  const area = `${line} L ${lastPoint?.x ?? padding} ${height - padding} L ${
    points[0]?.x ?? padding
  } ${height - padding} Z`;

  return (
    <div className="h-[220px] w-full overflow-hidden">
      <svg
        role="img"
        aria-label="Atividade do workspace no periodo"
        className="h-full w-full"
        viewBox={`0 0 ${width} ${height}`}
      >
        <defs>
          <linearGradient id="activity-area" x1="0" x2="0" y1="0" y2="1">
            <stop
              offset="0%"
              stopColor="var(--color-primary)"
              stopOpacity="0.32"
            />
            <stop
              offset="100%"
              stopColor="var(--color-primary)"
              stopOpacity="0"
            />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#activity-area)" />
        <path
          d={line}
          fill="none"
          stroke="var(--color-primary)"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="3"
        />
        {points.map((point) => (
          <circle
            key={point.item.date}
            cx={point.x}
            cy={point.y}
            fill="var(--color-background)"
            r="4"
            stroke="var(--color-primary)"
            strokeWidth="2"
          />
        ))}
      </svg>
      <div className="grid grid-cols-3 text-muted-foreground text-xs">
        <span>{data[0] ? formatCompactDate(data[0].date) : ""}</span>
        <span className="text-center">
          {data[Math.floor(data.length / 2)]
            ? formatCompactDate(data[Math.floor(data.length / 2)].date)
            : ""}
        </span>
        <span className="text-right">
          {data[data.length - 1]
            ? formatCompactDate(data[data.length - 1]?.date ?? "")
            : ""}
        </span>
      </div>
    </div>
  );
}

function DonutChart({
  data,
}: {
  data: Array<{ label: string; value: number }>;
}) {
  const total = data.reduce((sum, item) => sum + item.value, 0);
  let offset = 0;

  if (total === 0) {
    return (
      <div className="flex h-52 items-center justify-center text-muted-foreground text-sm">
        Sem tarefas no workspace
      </div>
    );
  }

  return (
    <div className="grid gap-5 md:grid-cols-[180px_1fr] md:items-center">
      <svg
        role="img"
        aria-label="Distribuicao de tarefas por status"
        className="mx-auto size-40"
        viewBox="0 0 120 120"
      >
        <circle
          cx="60"
          cy="60"
          fill="none"
          r="42"
          stroke="var(--color-muted)"
          strokeWidth="18"
        />
        {data.map((item, index) => {
          const length = (item.value / total) * 263.89;
          const segment = (
            <circle
              key={item.label}
              cx="60"
              cy="60"
              fill="none"
              r="42"
              stroke={STATUS_COLORS[index % STATUS_COLORS.length]}
              strokeDasharray={`${length} ${263.89 - length}`}
              strokeDashoffset={-offset}
              strokeLinecap="round"
              strokeWidth="18"
              transform="rotate(-90 60 60)"
            />
          );
          offset += length;
          return segment;
        })}
        <text
          fill="var(--color-foreground)"
          fontSize="18"
          fontWeight="700"
          textAnchor="middle"
          x="60"
          y="58"
        >
          {total}
        </text>
        <text
          fill="var(--color-muted-foreground)"
          fontSize="9"
          textAnchor="middle"
          x="60"
          y="72"
        >
          tarefas
        </text>
      </svg>
      <div className="space-y-3">
        {data.slice(0, 5).map((item, index) => (
          <div className="flex items-center gap-3" key={item.label}>
            <span
              className="size-2.5 rounded-sm"
              style={{
                backgroundColor: STATUS_COLORS[index % STATUS_COLORS.length],
              }}
            />
            <span className="flex-1 truncate text-sm">{item.label}</span>
            <span className="font-medium text-sm tabular-nums">
              {item.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function HorizontalBars({
  data,
}: {
  data: Array<{ label: string; value: number }>;
}) {
  const maxValue = Math.max(1, ...data.map((item) => item.value));

  if (data.length === 0 || data.every((item) => item.value === 0)) {
    return (
      <div className="flex h-52 items-center justify-center text-muted-foreground text-sm">
        Sem dados de prioridade
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {data.slice(0, 6).map((item) => (
        <div className="space-y-1.5" key={item.label}>
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm">{item.label}</span>
            <span className="font-medium text-sm tabular-nums">
              {item.value}
            </span>
          </div>
          <div className="h-2 rounded-sm bg-muted">
            <div
              className="h-2 rounded-sm bg-primary"
              style={{
                width: `${Math.max(4, (item.value / maxValue) * 100)}%`,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="grid gap-3 md:grid-cols-4">
        {["projects", "tasks", "members", "risks"].map((item) => (
          <Skeleton className="h-28" key={item} />
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-[1.4fr_.8fr]">
        <Skeleton className="h-80" />
        <Skeleton className="h-80" />
      </div>
    </div>
  );
}

function OperationalDashboardPage() {
  const { data: workspace } = useActiveWorkspace();
  const navigate = useNavigate();
  const permissions = useWorkspacePermission();
  useEffect(() => {
    if (
      workspace &&
      !permissions.isCheckingPermissions &&
      !permissions.canViewDashboard() &&
      permissions.canViewFinance()
    )
      navigate({
        to: "/dashboard/workspace/$workspaceId/portfolio",
        params: { workspaceId: workspace.id },
        replace: true,
      });
  }, [workspace, permissions, navigate]);
  const { canViewDashboard, isAdmin, isCheckingPermissions } =
    useWorkspacePermission();
  const [period, setPeriod] = useState<Period>("30d");
  const [customRange, setCustomRange] = useState(defaultRange("30d"));

  const range = useMemo(
    () => (period === "custom" ? customRange : defaultRange(period)),
    [customRange, period],
  );

  const hasAccess = isAdmin || canViewDashboard();
  const dashboard = useWorkspaceDashboard(
    {
      workspaceId: workspace?.id ?? "",
      from: range.from,
      to: range.to,
    },
    Boolean(workspace?.id && hasAccess),
  );

  if (
    isCheckingPermissions ||
    (workspace && hasAccess && dashboard.isLoading)
  ) {
    return (
      <Layout>
        <PageTitle title="Dashboard" />
        <DashboardSkeleton />
      </Layout>
    );
  }

  if (!workspace) {
    return (
      <Layout>
        <PageTitle title="Dashboard" />
        <div className="flex h-full items-center justify-center p-6 text-muted-foreground">
          Selecione um workspace para abrir o dashboard.
        </div>
      </Layout>
    );
  }

  if (!hasAccess) {
    return (
      <Layout>
        <PageTitle title="Dashboard" />
        <div className="flex h-full items-center justify-center p-6">
          <Card className="max-w-md rounded-lg">
            <CardContent className="space-y-3 p-6 text-center">
              <ShieldAlert className="mx-auto size-8 text-muted-foreground" />
              <h1 className="font-semibold text-lg">Acesso restrito</h1>
              <p className="text-muted-foreground text-sm">
                Seu papel neste workspace nao possui permissao para visualizar o
                dashboard operacional.
              </p>
            </CardContent>
          </Card>
        </div>
      </Layout>
    );
  }

  const data = dashboard.data;

  return (
    <Layout>
      <PageTitle title="Dashboard" />
      <Layout.Header className="h-auto min-h-12 flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <h1 className="truncate font-semibold text-lg">Dashboard</h1>
          <p className="truncate text-muted-foreground text-xs">
            {workspace.name}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-md border border-border bg-muted/40 p-0.5">
            {PERIODS.map((item) => (
              <Button
                className="h-7 px-2.5 text-xs"
                key={item.value}
                onClick={() => setPeriod(item.value)}
                size="sm"
                variant={period === item.value ? "secondary" : "ghost"}
              >
                {item.label}
              </Button>
            ))}
          </div>
          {period === "custom" && (
            <div className="flex items-center gap-2">
              <Input
                className="h-8 w-[140px]"
                onChange={(event) =>
                  setCustomRange((current) => ({
                    ...current,
                    from: event.target.value,
                  }))
                }
                type="date"
                value={customRange.from}
              />
              <Input
                className="h-8 w-[140px]"
                onChange={(event) =>
                  setCustomRange((current) => ({
                    ...current,
                    to: event.target.value,
                  }))
                }
                type="date"
                value={customRange.to}
              />
            </div>
          )}
        </div>
      </Layout.Header>

      <Layout.Content className="overflow-auto">
        {!data ? (
          <div className="p-4 md:p-6">
            <Card className="rounded-lg">
              <CardContent className="p-6 text-destructive text-sm">
                {dashboard.error instanceof Error
                  ? dashboard.error.message
                  : "Nao foi possivel carregar o dashboard."}
              </CardContent>
            </Card>
          </div>
        ) : (
          <div className="space-y-4 p-4 md:p-6">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                detail={`${data.summary.archivedProjects} arquivados`}
                icon={FolderKanban}
                title="Projetos ativos"
                value={data.summary.activeProjects}
              />
              <MetricCard
                detail={`${data.summary.overdueTasks} vencidas, ${data.summary.dueSoonTasks} em ate 7 dias`}
                icon={ListChecks}
                title="Tarefas abertas"
                tone={data.summary.overdueTasks > 0 ? "warning" : "good"}
                value={data.summary.openTasks}
              />
              <MetricCard
                detail={`${data.summary.activeMembers7d} ativos nos ultimos 7 dias`}
                icon={Users}
                title="Membros"
                value={data.summary.members}
              />
              <MetricCard
                detail={`${data.summary.pendingInvites} convites pendentes`}
                icon={Gauge}
                title="Projetos em risco"
                tone={data.summary.riskProjects > 0 ? "critical" : "good"}
                value={data.summary.riskProjects}
              />
            </div>

            {data.alerts.length > 0 && (
              <Card className="rounded-lg">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <AlertTriangle className="size-4 text-warning-foreground" />
                    Atencao necessaria
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid gap-3 pt-0 md:grid-cols-2 xl:grid-cols-3">
                  {data.alerts.map((alert) => (
                    <div
                      className="rounded-md border border-border bg-muted/30 p-3"
                      key={alert.id}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-medium text-sm">{alert.title}</p>
                        <Badge variant={severityVariant(alert.severity)}>
                          {alert.severity === "critical"
                            ? "Critico"
                            : alert.severity === "warning"
                              ? "Atencao"
                              : "Info"}
                        </Badge>
                      </div>
                      <p className="mt-2 text-muted-foreground text-xs">
                        {alert.detail}
                      </p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            <Card className="rounded-lg">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <CalendarDays className="size-4 text-primary" />
                  Prazos criticos
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                {data.dueTasks.length === 0 ? (
                  <div className="flex h-36 items-center justify-center gap-2 text-muted-foreground text-sm">
                    <CheckCircle2 className="size-4" />
                    Nenhuma tarefa vencida ou com vencimento em ate 7 dias
                  </div>
                ) : (
                  <div className="grid gap-3 xl:grid-cols-2">
                    {data.dueTasks.map((task) => (
                      <div
                        className="grid gap-3 rounded-md border border-border bg-muted/20 p-3 md:grid-cols-[1fr_auto]"
                        key={task.id}
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <Badge variant={dueTaskVariant(task.urgency)}>
                              {dueTaskGroupLabel(task.urgency)}
                            </Badge>
                            <span className="truncate text-muted-foreground text-xs">
                              {task.projectName}
                            </span>
                          </div>
                          <Link
                            className="mt-2 block truncate font-medium text-sm hover:underline"
                            params={{
                              projectId: task.projectId,
                              taskId: task.id,
                              workspaceId: workspace.id,
                            }}
                            to="/dashboard/workspace/$workspaceId/project/$projectId/task/$taskId"
                          >
                            #{task.number} {task.title}
                          </Link>
                          <p className="mt-1 truncate text-muted-foreground text-xs">
                            {task.assigneeNames.length > 0
                              ? task.assigneeNames.join(", ")
                              : "Sem responsavel"}
                          </p>
                        </div>
                        <div className="text-left md:text-right">
                          <p
                            className={cn(
                              "font-medium text-sm",
                              task.urgency === "overdue" && "text-destructive",
                              task.urgency === "next_3_days" &&
                                "text-warning-foreground",
                            )}
                          >
                            {dueTaskLabel(task.dueDate)}
                          </p>
                          <p className="mt-1 text-muted-foreground text-xs">
                            {formatDate(task.dueDate)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="grid gap-4 xl:grid-cols-[1.35fr_.75fr]">
              <Card className="rounded-lg">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <TrendingUp className="size-4 text-primary" />
                    Atividade operacional
                  </CardTitle>
                  <CardDescription>
                    Tarefas criadas e acoes administrativas no periodo
                    selecionado.
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                  <ActivityLineChart data={data.activity} />
                </CardContent>
              </Card>

              <Card className="rounded-lg">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <BarChart3 className="size-4 text-primary" />
                    Tarefas por status
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <DonutChart data={data.tasksByStatus} />
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-4 xl:grid-cols-[.8fr_1.2fr]">
              <Card className="rounded-lg">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Sparkles className="size-4 text-primary" />
                    Prioridade
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <HorizontalBars data={data.tasksByPriority} />
                </CardContent>
              </Card>

              <Card className="rounded-lg">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Clock3 className="size-4 text-primary" />
                    Projetos em observacao
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="space-y-3">
                    {data.projectRisks.length === 0 ? (
                      <div className="flex h-44 items-center justify-center text-muted-foreground text-sm">
                        Nenhum projeto ativo neste workspace
                      </div>
                    ) : (
                      data.projectRisks.map((project) => (
                        <div
                          className="grid gap-3 rounded-md border border-border bg-muted/20 p-3 md:grid-cols-[1fr_auto]"
                          key={project.id}
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="flex size-7 items-center justify-center rounded-md border border-border bg-background text-sm">
                                {project.icon ?? "P"}
                              </span>
                              <Link
                                className="truncate font-medium text-sm hover:underline"
                                params={{
                                  projectId: project.id,
                                  workspaceId: workspace.id,
                                }}
                                to="/dashboard/workspace/$workspaceId/project/$projectId/board"
                              >
                                {project.name}
                              </Link>
                            </div>
                            <p className="mt-2 text-muted-foreground text-xs">
                              Ultima atividade:{" "}
                              {formatRelativeDays(project.lastActivityAt)}
                            </p>
                          </div>
                          <div className="flex items-center gap-4 text-sm">
                            <div className="text-right">
                              <p className="font-medium tabular-nums">
                                {project.openTasks}
                              </p>
                              <p className="text-muted-foreground text-xs">
                                abertas
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="font-medium tabular-nums">
                                {project.overdueTasks}
                              </p>
                              <p className="text-muted-foreground text-xs">
                                atrasadas
                              </p>
                            </div>
                            <Badge variant={riskVariant(project.riskLevel)}>
                              {riskLabel(project.riskLevel)}
                            </Badge>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <Card className="rounded-lg">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <UserCheck className="size-4 text-primary" />
                    Carga por membro
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="space-y-3">
                    {data.memberWorkload.map((member) => (
                      <div
                        className="flex items-center gap-3 rounded-md border border-border bg-muted/20 p-3"
                        key={member.id}
                      >
                        <Avatar className="size-8">
                          <AvatarImage src={member.image ?? undefined} />
                          <AvatarFallback>
                            {getInitials(member.name)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium text-sm">
                            {member.name}
                          </p>
                          <p className="truncate text-muted-foreground text-xs">
                            {member.email}
                          </p>
                          <p className="mt-0.5 truncate text-muted-foreground text-xs">
                            Ultimo acesso:{" "}
                            {formatLastAccess(member.lastAccessAt)}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-medium text-sm tabular-nums">
                            {member.assignedTasks}
                          </p>
                          <p className="text-muted-foreground text-xs">
                            abertas
                          </p>
                        </div>
                        <div className="text-right">
                          <p
                            className={cn(
                              "font-medium text-sm tabular-nums",
                              member.overdueTasks > 0 && "text-destructive",
                            )}
                          >
                            {member.overdueTasks}
                          </p>
                          <p className="text-muted-foreground text-xs">
                            atraso
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card className="rounded-lg">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <CalendarDays className="size-4 text-primary" />
                    Auditoria macro
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="space-y-3">
                    {data.auditHighlights.length === 0 ? (
                      <div className="flex h-44 items-center justify-center gap-2 text-muted-foreground text-sm">
                        <CheckCircle2 className="size-4" />
                        Nenhuma acao administrativa recente
                      </div>
                    ) : (
                      data.auditHighlights.map((item) => (
                        <div
                          className="rounded-md border border-border bg-muted/20 p-3"
                          key={item.id}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate font-medium text-sm">
                                {item.summary}
                              </p>
                              <p className="mt-1 text-muted-foreground text-xs">
                                {item.actor?.name ?? "Sistema"} em{" "}
                                {formatDateTime(item.createdAt)}
                              </p>
                            </div>
                            {item.ipAddress && (
                              <Badge variant="outline">{item.ipAddress}</Badge>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </Layout.Content>
    </Layout>
  );
}
