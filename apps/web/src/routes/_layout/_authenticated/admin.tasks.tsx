import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import {
  ArrowLeft,
  CheckSquare,
  Pencil,
  Search,
  Trash2,
  Users,
} from "lucide-react";
import type { FormEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import PageTitle from "@/components/page-title";
import Layout from "@/components/settings/embedded-layout";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardPanel,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { AdminTask } from "@/fetchers/admin/get-admin-tasks";
import { getAdminTasks } from "@/fetchers/admin/get-admin-tasks";
import {
  useBulkAdminTasks,
  useDeleteAdminTask,
  useUpdateAdminTask,
} from "@/hooks/mutations/admin/use-admin-task-mutations";
import { useAdminMe } from "@/hooks/queries/admin/use-admin-me";
import { useAdminProjects } from "@/hooks/queries/admin/use-admin-projects";
import { useAdminTasks } from "@/hooks/queries/admin/use-admin-tasks";
import { useAdminUsers } from "@/hooks/queries/admin/use-admin-users";
import { useAdminWorkspaces } from "@/hooks/queries/admin/use-admin-workspaces";
import { getInitials } from "@/lib/get-initials";

export const Route = createFileRoute("/_layout/_authenticated/admin/tasks")({
  beforeLoad: async () => {
    try {
      await getAdminTasks();
    } catch {
      throw redirect({ to: "/admin" });
    }
  },
  component: AdminTasksPage,
});

const STATUS_OPTIONS = [
  "to-do",
  "in-progress",
  "in-review",
  "done",
  "planned",
  "archived",
];
const PRIORITY_OPTIONS = ["no-priority", "low", "medium", "high", "urgent"];
const SKELETON_ROWS = [
  "task-skeleton-1",
  "task-skeleton-2",
  "task-skeleton-3",
  "task-skeleton-4",
  "task-skeleton-5",
];

function hasPermission(permissions: string[] | undefined, permission: string) {
  return Boolean(
    permissions?.includes("*") || permissions?.includes(permission),
  );
}

function formatDate(value?: string | null) {
  if (!value) return "Nunca";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function toDateInput(value?: string | null) {
  if (!value) return "";
  return new Date(value).toISOString().slice(0, 10);
}

function fromDateInput(value: string) {
  return value ? new Date(`${value}T12:00:00.000Z`).toISOString() : null;
}

function TaskDialog({
  open,
  task,
  onOpenChange,
}: {
  open: boolean;
  task?: AdminTask | null;
  onOpenChange: (open: boolean) => void;
}) {
  const updateTask = useUpdateAdminTask();
  const { data: usersData } = useAdminUsers({ status: "all", limit: "200" });
  const initializedTaskIdRef = useRef<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: "",
    description: "",
    status: "to-do",
    priority: "no-priority",
    startDate: "",
    dueDate: "",
    assigneeIds: [] as string[],
  });
  const taskId = task?.id ?? null;
  const taskTitle = task?.title ?? "";
  const taskDescription = task?.description ?? "";
  const taskStatus = task?.status ?? "to-do";
  const taskPriority = task?.priority ?? "no-priority";
  const taskStartDate = task?.startDate ?? null;
  const taskDueDate = task?.dueDate ?? null;
  const taskAssignees = task?.assignees ?? [];

  useEffect(() => {
    if (!open || !taskId) {
      if (!open) initializedTaskIdRef.current = null;
      return;
    }

    if (initializedTaskIdRef.current === taskId) return;

    initializedTaskIdRef.current = taskId;
    setError(null);
    setForm({
      title: taskTitle,
      description: taskDescription,
      status: taskStatus,
      priority: taskPriority,
      startDate: toDateInput(taskStartDate),
      dueDate: toDateInput(taskDueDate),
      assigneeIds: taskAssignees.map((assignee) => assignee.id),
    });
  }, [
    open,
    taskAssignees,
    taskDescription,
    taskDueDate,
    taskId,
    taskPriority,
    taskStartDate,
    taskStatus,
    taskTitle,
  ]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!task) return;
    setError(null);

    try {
      await updateTask.mutateAsync({
        taskId: task.id,
        title: form.title,
        description: form.description || null,
        status: form.status,
        priority: form.priority,
        startDate: fromDateInput(form.startDate),
        dueDate: fromDateInput(form.dueDate),
        assigneeIds: form.assigneeIds,
      });
      onOpenChange(false);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Falha ao salvar tarefa.",
      );
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar tarefa</DialogTitle>
          <DialogDescription>
            Ajuste campos operacionais sem entrar no workspace do projeto.
          </DialogDescription>
        </DialogHeader>
        <DialogPanel>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-1.5">
              <Label>Titulo</Label>
              <Input
                required
                value={form.title}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    title: event.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>Descricao</Label>
              <Input
                value={form.description}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Input
                  list="admin-task-status-options"
                  value={form.status}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      status: event.target.value,
                    }))
                  }
                />
                <datalist id="admin-task-status-options">
                  {STATUS_OPTIONS.map((status) => (
                    <option key={status} value={status} />
                  ))}
                </datalist>
              </div>
              <div className="space-y-1.5">
                <Label>Prioridade</Label>
                <select
                  className="h-8 w-full rounded-lg border border-input bg-background px-2.5 text-sm"
                  value={form.priority}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      priority: event.target.value,
                    }))
                  }
                >
                  {PRIORITY_OPTIONS.map((priority) => (
                    <option key={priority} value={priority}>
                      {priority}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Inicio</Label>
                <Input
                  type="date"
                  value={form.startDate}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      startDate: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label>Prazo</Label>
                <Input
                  type="date"
                  value={form.dueDate}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      dueDate: event.target.value,
                    }))
                  }
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Responsaveis</Label>
              <select
                className="min-h-28 w-full rounded-lg border border-input bg-background px-2.5 py-2 text-sm"
                multiple
                value={form.assigneeIds}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    assigneeIds: Array.from(event.target.selectedOptions).map(
                      (option) => option.value,
                    ),
                  }))
                }
              >
                {(usersData?.users ?? []).map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name} ({user.email})
                  </option>
                ))}
              </select>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={updateTask.isPending}>
                Salvar
              </Button>
            </DialogFooter>
          </form>
        </DialogPanel>
      </DialogContent>
    </Dialog>
  );
}

function AssigneeStack({ task }: { task: AdminTask }) {
  if (!task.assignees.length) {
    return <span className="text-muted-foreground">Sem responsavel</span>;
  }

  return (
    <div className="flex items-center gap-2">
      <div className="flex -space-x-1">
        {task.assignees.slice(0, 3).map((assignee) => (
          <Avatar
            className="h-6 w-6 border border-background"
            key={assignee.id}
          >
            <AvatarImage src={assignee.image ?? ""} alt={assignee.name} />
            <AvatarFallback className="text-[10px]">
              {getInitials(assignee.name)}
            </AvatarFallback>
          </Avatar>
        ))}
      </div>
      <span className="max-w-48 truncate text-sm">
        {task.assignees.map((assignee) => assignee.name).join(", ")}
      </span>
      {task.assignees.length > 3 && (
        <Badge variant="secondary">+{task.assignees.length - 3}</Badge>
      )}
    </div>
  );
}

function AdminTasksPage() {
  const { data: adminMe } = useAdminMe();
  const permissions = adminMe?.permissions;
  const canUpdate = hasPermission(permissions, "admin.tasks.update");
  const canDelete = hasPermission(permissions, "admin.tasks.delete");
  const [filters, setFilters] = useState({
    q: "",
    workspaceId: "",
    projectId: "",
    status: "",
    priority: "",
    assigneeId: "",
    overdue: "" as "" | "true" | "false",
    limit: "100",
  });
  const [editingTask, setEditingTask] = useState<AdminTask | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkOperation, setBulkOperation] = useState("updateStatus");
  const [bulkValue, setBulkValue] = useState("done");
  const [bulkAssigneeIds, setBulkAssigneeIds] = useState<string[]>([]);
  const { data: workspacesData } = useAdminWorkspaces({
    status: "all",
    limit: "200",
  });
  const { data: projectsData } = useAdminProjects({
    status: "all",
    limit: "200",
  });
  const { data: usersData } = useAdminUsers({ status: "all", limit: "200" });
  const { data, isLoading } = useAdminTasks({
    q: filters.q || undefined,
    workspaceId: filters.workspaceId || undefined,
    projectId: filters.projectId || undefined,
    status: filters.status || undefined,
    priority: filters.priority || undefined,
    assigneeId: filters.assigneeId || undefined,
    overdue: filters.overdue || undefined,
    limit: filters.limit,
  });
  const deleteTask = useDeleteAdminTask();
  const bulkTasks = useBulkAdminTasks();
  const tasks = data?.tasks ?? [];

  const filteredProjects = useMemo(() => {
    const projects = projectsData?.projects ?? [];
    if (!filters.workspaceId) return projects;
    return projects.filter(
      (project) => project.workspaceId === filters.workspaceId,
    );
  }, [filters.workspaceId, projectsData?.projects]);

  function toggleSelected(taskId: string) {
    setSelectedIds((current) =>
      current.includes(taskId)
        ? current.filter((id) => id !== taskId)
        : [...current, taskId],
    );
  }

  async function handleDelete(task: AdminTask) {
    if (!window.confirm(`Excluir a tarefa "${task.title}"?`)) return;
    await deleteTask.mutateAsync(task.id);
    setSelectedIds((current) => current.filter((id) => id !== task.id));
  }

  async function handleBulkSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedIds.length) return;

    if (
      bulkOperation === "delete" &&
      !window.confirm(`Excluir ${selectedIds.length} tarefa(s)?`)
    ) {
      return;
    }

    await bulkTasks.mutateAsync({
      taskIds: selectedIds,
      operation: bulkOperation as
        | "updateStatus"
        | "updatePriority"
        | "updateDueDate"
        | "updateAssignee"
        | "addAssignees"
        | "removeAssignees"
        | "delete",
      value:
        bulkOperation === "delete" ||
        bulkOperation === "updateAssignee" ||
        bulkOperation === "addAssignees" ||
        bulkOperation === "removeAssignees"
          ? undefined
          : bulkValue,
      assigneeIds:
        bulkOperation === "updateAssignee" ||
        bulkOperation === "addAssignees" ||
        bulkOperation === "removeAssignees"
          ? bulkAssigneeIds
          : undefined,
    });
    setSelectedIds([]);
  }

  return (
    <Layout>
      <PageTitle title="Administração de tarefas" />
      <Layout.Header className="h-12 items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <CheckSquare className="size-4 text-muted-foreground" />
          <h1 className="font-semibold text-sm">Tarefas</h1>
        </div>
        <Button size="sm" variant="outline" render={<Link to="/admin" />}>
          <ArrowLeft />
          Voltar
        </Button>
      </Layout.Header>
      <Layout.Content className="overflow-auto bg-sidebar">
        <main className="mx-auto flex w-full max-w-7xl flex-col gap-4 p-4">
          <Card>
            <CardHeader>
              <CardTitle>Gestão global de tarefas</CardTitle>
              <CardDescription>
                Filtre, edite, exclua e aplique ações em massa sem alternar de
                workspace.
              </CardDescription>
            </CardHeader>
            <CardPanel className="grid gap-3 md:grid-cols-4">
              <div className="relative md:col-span-2">
                <Search className="-translate-y-1/2 absolute top-1/2 left-2.5 size-4 text-muted-foreground" />
                <Input
                  className="pl-8"
                  placeholder="Buscar por tarefa, projeto ou workspace"
                  value={filters.q}
                  onChange={(event) =>
                    setFilters((current) => ({
                      ...current,
                      q: event.target.value,
                    }))
                  }
                />
              </div>
              <select
                className="h-8 rounded-lg border border-input bg-background px-2.5 text-sm"
                value={filters.workspaceId}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    workspaceId: event.target.value,
                    projectId: "",
                  }))
                }
              >
                <option value="">Todos os workspaces</option>
                {(workspacesData?.workspaces ?? []).map((workspace) => (
                  <option key={workspace.id} value={workspace.id}>
                    {workspace.name}
                  </option>
                ))}
              </select>
              <select
                className="h-8 rounded-lg border border-input bg-background px-2.5 text-sm"
                value={filters.projectId}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    projectId: event.target.value,
                  }))
                }
              >
                <option value="">Todos os projetos</option>
                {filteredProjects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
              <select
                className="h-8 rounded-lg border border-input bg-background px-2.5 text-sm"
                value={filters.status}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    status: event.target.value,
                  }))
                }
              >
                <option value="">Todos os status</option>
                {STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
              <select
                className="h-8 rounded-lg border border-input bg-background px-2.5 text-sm"
                value={filters.priority}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    priority: event.target.value,
                  }))
                }
              >
                <option value="">Todas as prioridades</option>
                {PRIORITY_OPTIONS.map((priority) => (
                  <option key={priority} value={priority}>
                    {priority}
                  </option>
                ))}
              </select>
              <select
                className="h-8 rounded-lg border border-input bg-background px-2.5 text-sm"
                value={filters.assigneeId}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    assigneeId: event.target.value,
                  }))
                }
              >
                <option value="">Todos os responsáveis</option>
                {(usersData?.users ?? []).map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name}
                  </option>
                ))}
              </select>
              <select
                className="h-8 rounded-lg border border-input bg-background px-2.5 text-sm"
                value={filters.overdue}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    overdue: event.target.value as "" | "true" | "false",
                  }))
                }
              >
                <option value="">Todos os prazos</option>
                <option value="true">Atrasadas</option>
                <option value="false">Sem atraso</option>
              </select>
            </CardPanel>
          </Card>

          {(canUpdate || canDelete) && (
            <Card>
              <CardPanel>
                <form
                  className="grid items-end gap-3 md:grid-cols-[1fr_1fr_1fr_auto]"
                  onSubmit={handleBulkSubmit}
                >
                  <div className="space-y-1.5">
                    <Label>Ação em massa</Label>
                    <select
                      className="h-8 w-full rounded-lg border border-input bg-background px-2.5 text-sm"
                      value={bulkOperation}
                      onChange={(event) => setBulkOperation(event.target.value)}
                    >
                      {canUpdate && (
                        <>
                          <option value="updateStatus">Alterar status</option>
                          <option value="updatePriority">
                            Alterar prioridade
                          </option>
                          <option value="updateDueDate">Alterar prazo</option>
                          <option value="updateAssignee">
                            Substituir responsáveis
                          </option>
                          <option value="addAssignees">
                            Adicionar responsáveis
                          </option>
                          <option value="removeAssignees">
                            Remover responsáveis
                          </option>
                        </>
                      )}
                      {canDelete && <option value="delete">Excluir</option>}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Valor</Label>
                    {bulkOperation.includes("Assignee") ? (
                      <select
                        className="h-8 w-full rounded-lg border border-input bg-background px-2.5 text-sm"
                        multiple
                        value={bulkAssigneeIds}
                        onChange={(event) =>
                          setBulkAssigneeIds(
                            Array.from(event.target.selectedOptions).map(
                              (option) => option.value,
                            ),
                          )
                        }
                      >
                        {(usersData?.users ?? []).map((user) => (
                          <option key={user.id} value={user.id}>
                            {user.name}
                          </option>
                        ))}
                      </select>
                    ) : bulkOperation === "updatePriority" ? (
                      <select
                        className="h-8 w-full rounded-lg border border-input bg-background px-2.5 text-sm"
                        value={bulkValue}
                        onChange={(event) => setBulkValue(event.target.value)}
                      >
                        {PRIORITY_OPTIONS.map((priority) => (
                          <option key={priority} value={priority}>
                            {priority}
                          </option>
                        ))}
                      </select>
                    ) : bulkOperation === "updateDueDate" ? (
                      <Input
                        type="date"
                        value={bulkValue}
                        onChange={(event) => setBulkValue(event.target.value)}
                      />
                    ) : (
                      <Input
                        list="admin-task-bulk-status-options"
                        value={bulkValue}
                        onChange={(event) => setBulkValue(event.target.value)}
                      />
                    )}
                    <datalist id="admin-task-bulk-status-options">
                      {STATUS_OPTIONS.map((status) => (
                        <option key={status} value={status} />
                      ))}
                    </datalist>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Users className="size-4" />
                    {selectedIds.length} selecionada(s)
                  </div>
                  <Button
                    disabled={
                      !selectedIds.length ||
                      bulkTasks.isPending ||
                      (!canUpdate && bulkOperation !== "delete")
                    }
                    type="submit"
                  >
                    Aplicar
                  </Button>
                </form>
              </CardPanel>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>{tasks.length} tarefas encontradas</CardTitle>
              <CardDescription>
                Auditoria mostra atividades registradas na tarefa.
              </CardDescription>
            </CardHeader>
            <CardPanel className="overflow-x-auto p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10" />
                    <TableHead>Tarefa</TableHead>
                    <TableHead>Projeto</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Prioridade</TableHead>
                    <TableHead>Responsáveis</TableHead>
                    <TableHead>Prazo</TableHead>
                    <TableHead>Auditoria</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading
                    ? SKELETON_ROWS.map((key) => (
                        <TableRow key={key}>
                          <TableCell colSpan={9}>
                            <Skeleton className="h-9 w-full" />
                          </TableCell>
                        </TableRow>
                      ))
                    : tasks.map((task) => (
                        <TableRow key={task.id}>
                          <TableCell>
                            <input
                              checked={selectedIds.includes(task.id)}
                              type="checkbox"
                              onChange={() => toggleSelected(task.id)}
                            />
                          </TableCell>
                          <TableCell>
                            <div className="font-medium">{task.title}</div>
                            <div className="text-muted-foreground text-xs">
                              #{task.number ?? "-"} · {task.id}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div>{task.projectName}</div>
                            <div className="text-muted-foreground text-xs">
                              {task.workspaceName}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary">{task.status}</Badge>
                          </TableCell>
                          <TableCell>
                            {task.priority ?? "no-priority"}
                          </TableCell>
                          <TableCell>
                            <AssigneeStack task={task} />
                          </TableCell>
                          <TableCell>{formatDate(task.dueDate)}</TableCell>
                          <TableCell>
                            <div>{task.auditEventCount} eventos</div>
                            <div className="text-muted-foreground text-xs">
                              {formatDate(task.lastAuditAt)}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex justify-end gap-2">
                              {canUpdate && (
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => setEditingTask(task)}
                                >
                                  <Pencil />
                                </Button>
                              )}
                              {canDelete && (
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => handleDelete(task)}
                                >
                                  <Trash2 />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                </TableBody>
              </Table>
            </CardPanel>
          </Card>
        </main>
      </Layout.Content>
      <TaskDialog
        open={Boolean(editingTask)}
        task={editingTask}
        onOpenChange={(open) => {
          if (!open) setEditingTask(null);
        }}
      />
    </Layout>
  );
}
