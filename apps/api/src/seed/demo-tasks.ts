import createComment from "../comment/controllers/create-comment";
import assignLabelToTask from "../label/controllers/assign-label-to-task";
import createLabel from "../label/controllers/create-label";
import createProject from "../project/controllers/create-project";
import createTask from "../task/controllers/create-task";
import createTimeEntry from "../time-entry/controllers/create-time-entry";
import { type Ctx, daysFromNow } from "./demo-context";
import type { DemoCrm } from "./demo-crm";

const PROJECTS = [
  {
    name: "[Demo] Operação de clientes",
    slug: "demo-operacao",
    icon: "Layout",
  },
  { name: "[Demo] Marketing interno", slug: "demo-marketing", icon: "Layout" },
];

const TASKS: {
  title: string;
  status: string;
  priority: string;
  due: number | null;
  company?: number;
  label?: string;
  hours?: number;
  comment?: string;
}[] = [
  {
    title: "Configurar campanhas do mês",
    status: "to-do",
    priority: "high",
    due: 2,
    company: 0,
    label: "Tráfego",
  },
  {
    title: "Relatório mensal de resultados",
    status: "to-do",
    priority: "medium",
    due: -2,
    company: 1,
    label: "Relatório",
  },
  {
    title: "Briefing do novo site",
    status: "in-progress",
    priority: "urgent",
    due: 1,
    company: 2,
    label: "Site",
    hours: 3,
    comment: "Cliente enviou o material, falta o logo em vetor.",
  },
  {
    title: "Calendário de posts",
    status: "in-progress",
    priority: "medium",
    due: 5,
    company: 3,
    label: "Social",
    hours: 2,
  },
  {
    title: "Ajustes da landing page",
    status: "in-review",
    priority: "high",
    due: 0,
    company: 4,
    label: "Site",
    hours: 4,
    comment: "Aguardando aprovação do cliente.",
  },
  {
    title: "Auditoria de SEO",
    status: "in-review",
    priority: "low",
    due: 7,
    company: 5,
    label: "SEO",
    hours: 1,
  },
  {
    title: "Publicar artigos do blog",
    status: "done",
    priority: "medium",
    due: -5,
    company: 6,
    label: "SEO",
    hours: 5,
    comment: "Entregue e publicado.",
  },
  {
    title: "Migração de hospedagem",
    status: "done",
    priority: "high",
    due: -9,
    company: 7,
    label: "Site",
    hours: 6,
  },
  {
    title: "Reunião de alinhamento semanal",
    status: "to-do",
    priority: "no-priority",
    due: null,
  },
  {
    title: "Atualizar apresentação comercial",
    status: "in-progress",
    priority: "low",
    due: 10,
    label: "Relatório",
    hours: 1,
  },
];

/** Projetos com colunas padrão, tarefas em todos os status, etiquetas, tempo e comentários. */
export async function seedTasks(ctx: Ctx, crm: DemoCrm) {
  const projects = [] as { id: string }[];
  for (const p of PROJECTS) {
    const created = await createProject(
      ctx.workspaceId,
      p.name,
      p.icon,
      p.slug,
    );
    if (created) projects.push(created);
  }
  const labelColors: Record<string, string> = {
    Tráfego: "#3B82F6",
    Social: "#EC4899",
    SEO: "#22C55E",
    Site: "#8B5CF6",
    Relatório: "#F59E0B",
  };
  const labels: Record<string, string> = {};
  for (const [name, color] of Object.entries(labelColors)) {
    const label = await createLabel(
      name,
      color,
      undefined,
      ctx.workspaceId,
      ctx.userId,
    );
    labels[name] = (label as { id: string }).id;
  }

  let count = 0;
  for (const [index, item] of TASKS.entries()) {
    const project = projects[index % projects.length];
    if (!project) continue;
    const company =
      item.company !== undefined ? crm.companies[item.company] : undefined;
    const task = await createTask({
      projectId: project.id,
      currentUserId: ctx.userId,
      userId: ctx.userId,
      title: item.title,
      status: item.status,
      priority: item.priority,
      description: "Tarefa de demonstração.",
      startDate: daysFromNow(-3),
      dueDate: item.due === null ? undefined : daysFromNow(item.due),
      crmCompanyId: company?.id ?? null,
    });
    count++;
    const taskId = (task as { id: string }).id;
    if (item.label && labels[item.label]) {
      await assignLabelToTask(labels[item.label] as string, taskId, ctx.userId);
    }
    if (item.hours) {
      const start = daysFromNow(-1);
      start.setHours(9, 0, 0, 0);
      const end = new Date(start.getTime() + item.hours * 3600 * 1000);
      await createTimeEntry({
        taskId,
        userId: ctx.userId,
        description: "Trabalho de demonstração",
        startTime: start,
        endTime: end,
      });
    }
    if (item.comment) await createComment(taskId, ctx.userId, item.comment);
  }
  return count;
}
