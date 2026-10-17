import { and, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { describeRoute, resolver, validator } from "hono-openapi";
import * as v from "valibot";
import db, { schema } from "../database";
import { hasWorkspacePermission } from "../utils/require-workspace-permission";
import { workspaceAccess } from "../utils/workspace-access-middleware";

const dashboardQuerySchema = v.object({
  workspaceId: v.string(),
  from: v.string(),
  to: v.string(),
});

const numberValue = v.number();
const nullableString = v.nullable(v.string());

const workspaceDashboardSchema = v.object({
  range: v.object({
    from: v.string(),
    to: v.string(),
  }),
  summary: v.object({
    activeProjects: numberValue,
    archivedProjects: numberValue,
    members: numberValue,
    activeMembers7d: numberValue,
    pendingInvites: numberValue,
    openTasks: numberValue,
    overdueTasks: numberValue,
    dueSoonTasks: numberValue,
    unassignedTasks: numberValue,
    riskProjects: numberValue,
  }),
  activity: v.array(
    v.object({
      date: v.string(),
      tasksCreated: numberValue,
      adminActions: numberValue,
      total: numberValue,
    }),
  ),
  tasksByStatus: v.array(
    v.object({
      label: v.string(),
      value: numberValue,
    }),
  ),
  tasksByPriority: v.array(
    v.object({
      label: v.string(),
      value: numberValue,
    }),
  ),
  projectRisks: v.array(
    v.object({
      id: v.string(),
      name: v.string(),
      icon: nullableString,
      openTasks: numberValue,
      overdueTasks: numberValue,
      totalTasks: numberValue,
      lastActivityAt: v.string(),
      riskLevel: v.picklist(["low", "medium", "high"]),
      riskScore: numberValue,
    }),
  ),
  memberWorkload: v.array(
    v.object({
      id: v.string(),
      name: v.string(),
      email: v.string(),
      image: nullableString,
      lastAccessAt: nullableString,
      assignedTasks: numberValue,
      overdueTasks: numberValue,
    }),
  ),
  dueTasks: v.array(
    v.object({
      id: v.string(),
      title: v.string(),
      number: numberValue,
      dueDate: v.string(),
      projectId: v.string(),
      projectName: v.string(),
      assigneeNames: v.array(v.string()),
      urgency: v.picklist(["overdue", "next_3_days", "this_week"]),
    }),
  ),
  auditHighlights: v.array(
    v.object({
      id: v.string(),
      action: v.string(),
      summary: v.string(),
      entityType: v.string(),
      entityName: nullableString,
      ipAddress: nullableString,
      createdAt: v.string(),
      actor: v.nullable(
        v.object({
          id: v.string(),
          name: v.string(),
          email: v.string(),
        }),
      ),
    }),
  ),
  alerts: v.array(
    v.object({
      id: v.string(),
      severity: v.picklist(["info", "warning", "critical"]),
      title: v.string(),
      detail: v.string(),
    }),
  ),
});

type SummaryRow = {
  active_projects: string | number | null;
  archived_projects: string | number | null;
  members: string | number | null;
  active_members_7d: string | number | null;
  pending_invites: string | number | null;
  open_tasks: string | number | null;
  overdue_tasks: string | number | null;
  due_soon_tasks: string | number | null;
  unassigned_tasks: string | number | null;
};

type ActivityRow = {
  date: string;
  tasks_created: string | number | null;
  admin_actions: string | number | null;
};

type DistributionRow = {
  label: string | null;
  value: string | number | null;
};

type ProjectRiskRow = {
  id: string;
  name: string;
  icon: string | null;
  open_tasks: string | number | null;
  overdue_tasks: string | number | null;
  total_tasks: string | number | null;
  last_activity_at: Date | string | null;
};

type MemberWorkloadRow = {
  id: string;
  name: string;
  email: string;
  image: string | null;
  last_access_at: Date | string | null;
  assigned_tasks: string | number | null;
  overdue_tasks: string | number | null;
};

type DueTaskRow = {
  id: string;
  title: string;
  number: string | number | null;
  due_date: Date | string;
  project_id: string;
  project_name: string;
  assignee_names: string[] | null;
  urgency: "overdue" | "next_3_days" | "this_week";
};

type AuditRow = {
  id: string;
  action: string;
  summary: string;
  entity_type: string;
  entity_name: string | null;
  ip_address: string | null;
  created_at: Date | string;
  actor_id: string | null;
  actor_name: string | null;
  actor_email: string | null;
};

function toNumber(value: string | number | null | undefined) {
  if (typeof value === "number") return value;
  if (!value) return 0;
  return Number(value);
}

function toIso(value: Date | string | null | undefined) {
  if (!value) return new Date(0).toISOString();
  return new Date(value).toISOString();
}

function parseDate(value: string, fallback: Date) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date;
}

function normalizeRange(fromValue: string, toValue: string) {
  const now = new Date();
  const fallbackFrom = new Date(now);
  fallbackFrom.setDate(now.getDate() - 29);
  fallbackFrom.setHours(0, 0, 0, 0);

  const from = parseDate(fromValue, fallbackFrom);
  const to = parseDate(toValue, now);
  from.setHours(0, 0, 0, 0);
  to.setHours(23, 59, 59, 999);

  if (from > to) {
    throw new HTTPException(400, {
      message: "The dashboard start date must be before the end date.",
    });
  }

  const maxRangeMs = 90 * 24 * 60 * 60 * 1000;
  if (to.getTime() - from.getTime() > maxRangeMs) {
    throw new HTTPException(400, {
      message: "The dashboard range can cover at most 90 days.",
    });
  }

  return { from, to };
}

function projectRiskLevel(
  openTasks: number,
  overdueTasks: number,
  lastActivityAt: string,
) {
  const inactiveDays = Math.floor(
    (Date.now() - new Date(lastActivityAt).getTime()) / (24 * 60 * 60 * 1000),
  );
  const riskScore =
    overdueTasks * 3 +
    Math.max(0, openTasks - 20) +
    (inactiveDays >= 21 ? 8 : inactiveDays >= 14 ? 4 : 0);

  if (riskScore >= 12) return { riskLevel: "high" as const, riskScore };
  if (riskScore >= 5) return { riskLevel: "medium" as const, riskScore };
  return { riskLevel: "low" as const, riskScore };
}

async function hasDashboardAccess(
  c: Parameters<typeof hasWorkspacePermission>[0],
) {
  if (await hasWorkspacePermission(c, { dashboard: ["read"] })) {
    return true;
  }

  const userId = c.get("userId");
  const workspaceId = c.get("workspaceId");
  if (!userId || !workspaceId) return false;

  const [member] = await db
    .select({ role: schema.workspaceUserTable.role })
    .from(schema.workspaceUserTable)
    .where(
      and(
        eq(schema.workspaceUserTable.workspaceId, workspaceId),
        eq(schema.workspaceUserTable.userId, userId),
      ),
    )
    .limit(1);

  return member?.role === "admin" || member?.role === "owner";
}

const dashboard = new Hono<{
  Variables: {
    userId: string;
    workspaceId: string;
  };
}>().get(
  "/",
  describeRoute({
    operationId: "getWorkspaceOperationalDashboard",
    tags: ["Dashboard"],
    description:
      "Return operational dashboard metrics for the active workspace.",
    responses: {
      200: {
        description: "Workspace operational dashboard",
        content: {
          "application/json": { schema: resolver(workspaceDashboardSchema) },
        },
      },
    },
  }),
  validator("query", dashboardQuerySchema),
  workspaceAccess.fromQuery(),
  async (c, next) => {
    if (!(await hasDashboardAccess(c))) {
      throw new HTTPException(403, { message: "Insufficient permissions" });
    }
    return next();
  },
  async (c) => {
    const input = c.req.valid("query");
    const workspaceId = c.get("workspaceId");
    const { from, to } = normalizeRange(input.from, input.to);

    const [
      summaryResult,
      activityResult,
      statusResult,
      priorityResult,
      projectResult,
      memberResult,
      dueTaskResult,
      auditResult,
    ] = await Promise.all([
      db.execute(sql`
        with project_scope as (
          select p.id, p.archived_at
          from "project" p
          where p.workspace_id = ${workspaceId}
        ),
        task_scope as (
          select
            t.id,
            t.due_date,
            t.assignee_id,
            coalesce(c.is_final, false) as is_final,
            t.status
          from "task" t
          inner join project_scope p on p.id = t.project_id
          left join "column" c on c.id = t.column_id
          where p.archived_at is null
        )
        select
          (select count(*) from project_scope where archived_at is null) as active_projects,
          (select count(*) from project_scope where archived_at is not null) as archived_projects,
          (select count(*) from "workspace_member" wm where wm.workspace_id = ${workspaceId}) as members,
          (
            select count(distinct s.user_id)
            from "session" s
            inner join "workspace_member" wm on wm.user_id = s.user_id
            where wm.workspace_id = ${workspaceId}
              and s.updated_at >= now() - interval '7 days'
          ) as active_members_7d,
          (
            select count(*)
            from "invitation" i
            where i.workspace_id = ${workspaceId}
              and i.status = 'pending'
              and i.expires_at > now()
          ) as pending_invites,
          (
            select count(*)
            from task_scope
            where status <> 'archived' and is_final = false
          ) as open_tasks,
          (
            select count(*)
            from task_scope
            where status <> 'archived'
              and is_final = false
              and due_date is not null
              and due_date < now()
          ) as overdue_tasks,
          (
            select count(*)
            from task_scope
            where status <> 'archived'
              and is_final = false
              and due_date is not null
              and due_date >= now()
              and due_date <= now() + interval '7 days'
          ) as due_soon_tasks,
          (
            select count(*)
            from task_scope
            where status <> 'archived'
              and is_final = false
              and assignee_id is null
              and not exists (
                select 1 from "task_assignee" ta where ta.task_id = task_scope.id
              )
          ) as unassigned_tasks
      `),
      db.execute(sql`
        with days as (
          select generate_series(
            date_trunc('day', ${from}::timestamp),
            date_trunc('day', ${to}::timestamp),
            interval '1 day'
          ) as day
        ),
        task_created as (
          select date_trunc('day', t.created_at) as day, count(*) as count
          from "task" t
          inner join "project" p on p.id = t.project_id
          where p.workspace_id = ${workspaceId}
            and t.created_at between ${from} and ${to}
          group by 1
        ),
        audit_actions as (
          select date_trunc('day', a.created_at) as day, count(*) as count
          from "audit_log" a
          where a.workspace_id = ${workspaceId}
            and a.created_at between ${from} and ${to}
            and a.action in (
              'workspace.created',
              'workspace.updated',
              'workspace.deleted',
              'project.created',
              'project.updated',
              'project.deleted',
              'project.archived',
              'project.unarchived',
              'invitation.created',
              'member.updated',
              'member.deleted'
            )
          group by 1
        )
        select
          to_char(days.day, 'YYYY-MM-DD') as date,
          coalesce(task_created.count, 0) as tasks_created,
          coalesce(audit_actions.count, 0) as admin_actions
        from days
        left join task_created on task_created.day = days.day
        left join audit_actions on audit_actions.day = days.day
        order by days.day asc
      `),
      db.execute(sql`
        select coalesce(nullif(c.name, ''), nullif(t.status, ''), 'sem status') as label, count(*) as value
        from "task" t
        inner join "project" p on p.id = t.project_id
        left join "column" c on c.id = t.column_id
        where p.workspace_id = ${workspaceId}
          and p.archived_at is null
        group by 1
        order by value desc
      `),
      db.execute(sql`
        select coalesce(nullif(t.priority, ''), 'sem prioridade') as label, count(*) as value
        from "task" t
        inner join "project" p on p.id = t.project_id
        where p.workspace_id = ${workspaceId}
          and p.archived_at is null
        group by 1
        order by value desc
      `),
      db.execute(sql`
        select
          p.id,
          p.name,
          p.icon,
          count(t.id) as total_tasks,
          count(t.id) filter (
            where t.status <> 'archived' and coalesce(c.is_final, false) = false
          ) as open_tasks,
          count(t.id) filter (
            where t.status <> 'archived'
              and coalesce(c.is_final, false) = false
              and t.due_date is not null
              and t.due_date < now()
          ) as overdue_tasks,
          coalesce(max(t.updated_at), p.created_at) as last_activity_at
        from "project" p
        left join "task" t on t.project_id = p.id
        left join "column" c on c.id = t.column_id
        where p.workspace_id = ${workspaceId}
          and p.archived_at is null
        group by p.id, p.name, p.icon, p.created_at
        order by overdue_tasks desc, open_tasks desc, last_activity_at asc
        limit 8
      `),
      db.execute(sql`
        select
          u.id,
          u.name,
          u.email,
          u.image,
          max(s.updated_at) as last_access_at,
          count(distinct t.id) filter (
            where p.id is not null
              and t.status <> 'archived'
              and coalesce(c.is_final, false) = false
          ) as assigned_tasks,
          count(distinct t.id) filter (
            where p.id is not null
              and t.status <> 'archived'
              and coalesce(c.is_final, false) = false
              and t.due_date is not null
              and t.due_date < now()
          ) as overdue_tasks
        from "workspace_member" wm
        inner join "user" u on u.id = wm.user_id
        left join "session" s on s.user_id = u.id
        left join "task_assignee" ta on ta.user_id = u.id
        left join "task" t on t.id = ta.task_id or t.assignee_id = u.id
        left join "project" p on p.id = t.project_id and p.workspace_id = ${workspaceId}
        left join "column" c on c.id = t.column_id
        where wm.workspace_id = ${workspaceId}
        group by u.id, u.name, u.email, u.image
        order by assigned_tasks desc, overdue_tasks desc, u.name asc
        limit 8
      `),
      db.execute(sql`
        select
          t.id,
          t.title,
          coalesce(t.number, 0) as number,
          t.due_date,
          p.id as project_id,
          p.name as project_name,
          coalesce(
            array_remove(array_agg(distinct u.name), null),
            array[]::text[]
          ) as assignee_names,
          case
            when t.due_date < now() then 'overdue'
            when t.due_date <= now() + interval '3 days' then 'next_3_days'
            else 'this_week'
          end as urgency
        from "task" t
        inner join "project" p on p.id = t.project_id
        left join "column" c on c.id = t.column_id
        left join "task_assignee" ta on ta.task_id = t.id
        left join "user" u on u.id = ta.user_id or u.id = t.assignee_id
        where p.workspace_id = ${workspaceId}
          and p.archived_at is null
          and t.status <> 'archived'
          and coalesce(c.is_final, false) = false
          and t.due_date is not null
          and t.due_date <= now() + interval '7 days'
        group by t.id, t.title, t.number, t.due_date, p.id, p.name
        order by
          case when t.due_date < now() then 0 else 1 end,
          t.due_date asc,
          p.name asc
        limit 12
      `),
      db.execute(sql`
        select
          a.id,
          a.action,
          a.summary,
          a.entity_type,
          a.entity_name,
          a.ip_address,
          a.created_at,
          u.id as actor_id,
          u.name as actor_name,
          u.email as actor_email
        from "audit_log" a
        left join "user" u on u.id = a.actor_user_id
        where a.workspace_id = ${workspaceId}
          and a.action in (
            'workspace.created',
            'workspace.updated',
            'workspace.deleted',
            'project.created',
            'project.updated',
            'project.deleted',
            'project.archived',
            'project.unarchived',
            'invitation.created',
            'member.updated',
            'member.deleted'
          )
        order by a.created_at desc
        limit 6
      `),
    ]);

    const summaryRow =
      (summaryResult.rows[0] as SummaryRow | undefined) ??
      ({
        active_projects: 0,
        archived_projects: 0,
        members: 0,
        active_members_7d: 0,
        pending_invites: 0,
        open_tasks: 0,
        overdue_tasks: 0,
        due_soon_tasks: 0,
        unassigned_tasks: 0,
      } satisfies SummaryRow);

    const projectRisks = (projectResult.rows as ProjectRiskRow[]).map((row) => {
      const openTasks = toNumber(row.open_tasks);
      const overdueTasks = toNumber(row.overdue_tasks);
      const totalTasks = toNumber(row.total_tasks);
      const lastActivityAt = toIso(row.last_activity_at);
      return {
        id: row.id,
        name: row.name,
        icon: row.icon,
        openTasks,
        overdueTasks,
        totalTasks,
        lastActivityAt,
        ...projectRiskLevel(openTasks, overdueTasks, lastActivityAt),
      };
    });

    const riskProjects = projectRisks.filter(
      (project) => project.riskLevel !== "low",
    ).length;

    const summary = {
      activeProjects: toNumber(summaryRow.active_projects),
      archivedProjects: toNumber(summaryRow.archived_projects),
      members: toNumber(summaryRow.members),
      activeMembers7d: toNumber(summaryRow.active_members_7d),
      pendingInvites: toNumber(summaryRow.pending_invites),
      openTasks: toNumber(summaryRow.open_tasks),
      overdueTasks: toNumber(summaryRow.overdue_tasks),
      dueSoonTasks: toNumber(summaryRow.due_soon_tasks),
      unassignedTasks: toNumber(summaryRow.unassigned_tasks),
      riskProjects,
    };

    const overloadedMembers = (memberResult.rows as MemberWorkloadRow[]).filter(
      (member) => toNumber(member.assigned_tasks) >= 20,
    ).length;

    const alerts = [
      ...(summary.overdueTasks > 0
        ? [
            {
              id: "overdue-tasks",
              severity: summary.overdueTasks >= 10 ? "critical" : "warning",
              title: "Tarefas atrasadas",
              detail: `${summary.overdueTasks} tarefa(s) aberta(s) passaram do prazo.`,
            } as const,
          ]
        : []),
      ...(summary.unassignedTasks > 0
        ? [
            {
              id: "unassigned-tasks",
              severity: "warning",
              title: "Tarefas sem responsavel",
              detail: `${summary.unassignedTasks} tarefa(s) aberta(s) ainda nao tem responsavel.`,
            } as const,
          ]
        : []),
      ...(riskProjects > 0
        ? [
            {
              id: "risk-projects",
              severity: riskProjects >= 3 ? "critical" : "warning",
              title: "Projetos em atencao",
              detail: `${riskProjects} projeto(s) mostram sinais de atraso ou baixa atividade.`,
            } as const,
          ]
        : []),
      ...(summary.pendingInvites > 0
        ? [
            {
              id: "pending-invites",
              severity: "info",
              title: "Convites pendentes",
              detail: `${summary.pendingInvites} convite(s) ainda aguardam aceite.`,
            } as const,
          ]
        : []),
      ...(overloadedMembers > 0
        ? [
            {
              id: "overloaded-members",
              severity: "warning",
              title: "Carga concentrada",
              detail: `${overloadedMembers} membro(s) acumulam 20 ou mais tarefas abertas.`,
            } as const,
          ]
        : []),
    ];

    return c.json({
      range: {
        from: from.toISOString(),
        to: to.toISOString(),
      },
      summary,
      activity: (activityResult.rows as ActivityRow[]).map((row) => {
        const tasksCreated = toNumber(row.tasks_created);
        const adminActions = toNumber(row.admin_actions);
        return {
          date: row.date,
          tasksCreated,
          adminActions,
          total: tasksCreated + adminActions,
        };
      }),
      tasksByStatus: (statusResult.rows as DistributionRow[]).map((row) => ({
        label: row.label ?? "sem status",
        value: toNumber(row.value),
      })),
      tasksByPriority: (priorityResult.rows as DistributionRow[]).map(
        (row) => ({
          label: row.label ?? "sem prioridade",
          value: toNumber(row.value),
        }),
      ),
      projectRisks,
      memberWorkload: (memberResult.rows as MemberWorkloadRow[]).map((row) => ({
        id: row.id,
        name: row.name,
        email: row.email,
        image: row.image,
        lastAccessAt: row.last_access_at ? toIso(row.last_access_at) : null,
        assignedTasks: toNumber(row.assigned_tasks),
        overdueTasks: toNumber(row.overdue_tasks),
      })),
      dueTasks: (dueTaskResult.rows as DueTaskRow[]).map((row) => ({
        id: row.id,
        title: row.title,
        number: toNumber(row.number),
        dueDate: toIso(row.due_date),
        projectId: row.project_id,
        projectName: row.project_name,
        assigneeNames: row.assignee_names ?? [],
        urgency: row.urgency,
      })),
      auditHighlights: (auditResult.rows as AuditRow[]).map((row) => ({
        id: row.id,
        action: row.action,
        summary: row.summary,
        entityType: row.entity_type,
        entityName: row.entity_name,
        ipAddress: row.ip_address,
        createdAt: toIso(row.created_at),
        actor:
          row.actor_id && row.actor_name && row.actor_email
            ? {
                id: row.actor_id,
                name: row.actor_name,
                email: row.actor_email,
              }
            : null,
      })),
      alerts,
    });
  },
);

export default dashboard;
