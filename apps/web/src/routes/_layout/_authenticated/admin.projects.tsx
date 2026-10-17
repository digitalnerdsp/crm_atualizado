import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import {
  Archive,
  ArrowLeft,
  Copy,
  FolderPlus,
  Pencil,
  RotateCcw,
  Search,
  Trash2,
} from "lucide-react";
import type { FormEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import Layout from "@/components/common/layout";
import PageTitle from "@/components/page-title";
import { ProjectIcon } from "@/components/project/project-icon";
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
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { filterProjectEmojis } from "@/constants/project-emojis";
import type { AdminProject } from "@/fetchers/admin/get-admin-projects";
import { getAdminProjects } from "@/fetchers/admin/get-admin-projects";
import {
  useArchiveAdminProject,
  useCreateAdminProject,
  useDeleteAdminProject,
  useDuplicateAdminProject,
  useRestoreAdminProject,
  useUpdateAdminProject,
} from "@/hooks/mutations/admin/use-admin-project-mutations";
import { useAdminMe } from "@/hooks/queries/admin/use-admin-me";
import { useAdminProjects } from "@/hooks/queries/admin/use-admin-projects";
import { useAdminUsers } from "@/hooks/queries/admin/use-admin-users";
import { useAdminWorkspaces } from "@/hooks/queries/admin/use-admin-workspaces";

export const Route = createFileRoute("/_layout/_authenticated/admin/projects")({
  beforeLoad: async () => {
    try {
      await getAdminProjects();
    } catch {
      throw redirect({ to: "/admin" });
    }
  },
  component: AdminProjectsPage,
});

function hasPermission(permissions: string[] | undefined, permission: string) {
  return Boolean(
    permissions?.includes("*") || permissions?.includes(permission),
  );
}

function formatDate(value?: string | null) {
  if (!value) return "Nunca";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(
    new Date(value),
  );
}

function ProjectDialog({
  open,
  project,
  onOpenChange,
}: {
  open: boolean;
  project?: AdminProject | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: workspacesData } = useAdminWorkspaces({
    status: "all",
    limit: "100",
  });
  const { data: usersData } = useAdminUsers({ status: "all", limit: "100" });
  const createProject = useCreateAdminProject();
  const updateProject = useUpdateAdminProject();
  const initializedProjectKeyRef = useRef<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [iconSearch, setIconSearch] = useState("");
  const [form, setForm] = useState({
    workspaceId: "",
    name: "",
    slug: "",
    icon: "Layout",
    description: "",
    ownerUserId: "",
    isPublic: false,
  });

  const users = usersData?.users ?? [];
  const filteredEmojis = filterProjectEmojis(iconSearch);
  const firstWorkspaceId = workspacesData?.workspaces[0]?.id ?? "";
  const projectKey = project?.id ?? `create:${firstWorkspaceId}`;
  const projectWorkspaceId = project?.workspaceId ?? firstWorkspaceId;
  const projectName = project?.name ?? "";
  const projectSlug = project?.slug ?? "";
  const projectIcon = project?.icon ?? "Layout";
  const projectDescription = project?.description ?? "";
  const projectOwnerUserId = project?.owner?.id ?? "";
  const projectIsPublic = project?.isPublic ?? false;

  useEffect(() => {
    if (!open) {
      initializedProjectKeyRef.current = null;
      return;
    }

    if (initializedProjectKeyRef.current === projectKey) return;

    initializedProjectKeyRef.current = projectKey;
    setError(null);
    setIconSearch("");
    setForm({
      workspaceId: projectWorkspaceId,
      name: projectName,
      slug: projectSlug,
      icon: projectIcon,
      description: projectDescription,
      ownerUserId: projectOwnerUserId,
      isPublic: projectIsPublic,
    });
  }, [
    open,
    projectDescription,
    projectIcon,
    projectIsPublic,
    projectKey,
    projectName,
    projectOwnerUserId,
    projectSlug,
    projectWorkspaceId,
  ]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    try {
      if (project) {
        await updateProject.mutateAsync({
          projectId: project.id,
          workspaceId: form.workspaceId,
          name: form.name,
          slug: form.slug,
          icon: form.icon,
          description: form.description,
          ownerUserId: form.ownerUserId || null,
          isPublic: form.isPublic,
        });
      } else {
        await createProject.mutateAsync({
          workspaceId: form.workspaceId,
          name: form.name,
          slug: form.slug || undefined,
          icon: form.icon || undefined,
          description: form.description || undefined,
          ownerUserId: form.ownerUserId || null,
          isPublic: form.isPublic,
        });
      }
      onOpenChange(false);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Falha ao salvar projeto.",
      );
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {project ? "Editar projeto" : "Novo projeto"}
          </DialogTitle>
          <DialogDescription>
            Mova projetos entre workspaces e ajuste ownership pela
            administração.
          </DialogDescription>
        </DialogHeader>
        <DialogPanel>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-1.5">
              <Label>Workspace</Label>
              <select
                className="h-8 w-full rounded-lg border border-input bg-background px-2.5 text-sm"
                required
                value={form.workspaceId}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    workspaceId: event.target.value,
                  }))
                }
              >
                {(workspacesData?.workspaces ?? []).map((workspace) => (
                  <option key={workspace.id} value={workspace.id}>
                    {workspace.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Nome</Label>
                <Input
                  required
                  value={form.name}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label>Slug</Label>
                <Input
                  value={form.slug}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      slug: event.target.value,
                    }))
                  }
                />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Ícone</Label>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="flex size-8 items-center justify-center rounded-lg border border-border bg-muted">
                      <ProjectIcon
                        className="size-4 text-base text-muted-foreground"
                        icon={form.icon}
                      />
                    </div>
                    <Input
                      value={iconSearch}
                      onChange={(event) => setIconSearch(event.target.value)}
                      placeholder="Buscar emoji"
                    />
                  </div>
                  <div className="grid grid-cols-8 gap-1.5">
                    {filteredEmojis.slice(0, 16).map((item) => (
                      <Button
                        className="h-8 p-0 text-base"
                        key={item.emoji}
                        onClick={() =>
                          setForm((current) => ({
                            ...current,
                            icon: item.emoji,
                          }))
                        }
                        title={item.label}
                        type="button"
                        variant={
                          form.icon === item.emoji ? "secondary" : "ghost"
                        }
                      >
                        {item.emoji}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Owner</Label>
                <select
                  className="h-8 w-full rounded-lg border border-input bg-background px-2.5 text-sm"
                  value={form.ownerUserId}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      ownerUserId: event.target.value,
                    }))
                  }
                >
                  <option value="">Sem owner</option>
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name} - {user.email}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Descrição</Label>
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
            <div className="flex items-center justify-between rounded-md border border-border p-3">
              <Label>Projeto público</Label>
              <Switch
                checked={form.isPublic}
                onCheckedChange={(isPublic) =>
                  setForm((current) => ({ ...current, isPublic }))
                }
              />
            </div>
            {error && <p className="text-destructive text-sm">{error}</p>}
            <DialogFooter className="px-0 pb-0" variant="bare">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancelar
              </Button>
              <Button
                loading={createProject.isPending || updateProject.isPending}
                type="submit"
              >
                Salvar
              </Button>
            </DialogFooter>
          </form>
        </DialogPanel>
      </DialogContent>
    </Dialog>
  );
}

function DeleteProjectDialog({
  project,
  onOpenChange,
}: {
  project: AdminProject | null;
  onOpenChange: (open: boolean) => void;
}) {
  const deleteProject = useDeleteAdminProject();
  const initializedProjectIdRef = useRef<string | null>(null);
  const [confirmName, setConfirmName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const projectId = project?.id ?? null;

  useEffect(() => {
    if (!projectId) {
      initializedProjectIdRef.current = null;
      return;
    }

    if (initializedProjectIdRef.current === projectId) return;

    initializedProjectIdRef.current = projectId;
    setConfirmName("");
    setError(null);
  }, [projectId]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!project) return;

    setError(null);
    try {
      await deleteProject.mutateAsync({ projectId: project.id, confirmName });
      onOpenChange(false);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Falha ao excluir projeto.",
      );
    }
  }

  return (
    <Dialog open={Boolean(project)} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Excluir projeto</DialogTitle>
            <DialogDescription>
              Esta ação remove tarefas, colunas e vínculos do projeto.
            </DialogDescription>
          </DialogHeader>
          <DialogPanel className="grid gap-4">
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
              <div className="font-medium text-sm">{project?.name}</div>
              <div className="text-muted-foreground text-xs">
                {project?.workspaceName}
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2 text-sm">
                <span>{project?.taskCount ?? 0} tarefas</span>
                <span>{project?.openTaskCount ?? 0} abertas</span>
                <span>{project?.overdueTaskCount ?? 0} vencidas</span>
              </div>
            </div>
            <p className="text-muted-foreground text-sm">
              Digite{" "}
              <span className="font-medium text-foreground">
                {project?.name}
              </span>{" "}
              para confirmar.
            </p>
            <div className="space-y-1.5">
              <Label>Nome de confirmação</Label>
              <Input
                required
                value={confirmName}
                onChange={(event) => setConfirmName(event.target.value)}
              />
            </div>
            {error && <p className="text-destructive text-sm">{error}</p>}
          </DialogPanel>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button
              disabled={confirmName !== project?.name}
              loading={deleteProject.isPending}
              type="submit"
              variant="destructive"
            >
              Excluir
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AdminProjectsPage() {
  const { data: adminMe } = useAdminMe();
  const { data: workspacesData } = useAdminWorkspaces({
    status: "all",
    limit: "100",
  });
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"active" | "archived" | "all">("active");
  const [workspaceId, setWorkspaceId] = useState("all");
  const { data, isLoading } = useAdminProjects({
    q: query || undefined,
    status,
    workspaceId: workspaceId === "all" ? undefined : workspaceId,
  });
  const archiveProject = useArchiveAdminProject();
  const restoreProject = useRestoreAdminProject();
  const duplicateProject = useDuplicateAdminProject();
  const [createOpen, setCreateOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<AdminProject | null>(
    null,
  );
  const [deletingProject, setDeletingProject] = useState<AdminProject | null>(
    null,
  );
  const canUpdate = hasPermission(
    adminMe?.permissions,
    "admin.projects.update",
  );
  const canDelete = hasPermission(
    adminMe?.permissions,
    "admin.projects.delete",
  );

  const workspaces = useMemo(
    () => workspacesData?.workspaces ?? [],
    [workspacesData],
  );

  return (
    <Layout>
      <PageTitle title="Projetos administrativos" />
      <Layout.Header className="h-12 items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <FolderPlus className="size-4 text-muted-foreground" />
          <h1 className="font-semibold text-sm">Projetos</h1>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" render={<Link to="/admin" />}>
            <ArrowLeft />
            Admin
          </Button>
          {canUpdate && (
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <FolderPlus />
              Novo
            </Button>
          )}
        </div>
      </Layout.Header>
      <Layout.Content className="overflow-auto bg-sidebar">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-4">
          <Card className="rounded-lg">
            <CardHeader className="grid gap-3 p-4 md:grid-cols-[1fr_180px_180px]">
              <div>
                <CardTitle>Gestão global de projetos</CardTitle>
                <CardDescription>
                  Crie, mova, arquive, duplique e execute exclusões
                  administrativas.
                </CardDescription>
              </div>
              <select
                className="h-8 rounded-lg border border-input bg-background px-2.5 text-sm"
                value={workspaceId}
                onChange={(event) => setWorkspaceId(event.target.value)}
              >
                <option value="all">Todos os workspaces</option>
                {workspaces.map((workspace) => (
                  <option key={workspace.id} value={workspace.id}>
                    {workspace.name}
                  </option>
                ))}
              </select>
              <select
                className="h-8 rounded-lg border border-input bg-background px-2.5 text-sm"
                value={status}
                onChange={(event) =>
                  setStatus(event.target.value as "active" | "archived" | "all")
                }
              >
                <option value="active">Ativos</option>
                <option value="archived">Arquivados</option>
                <option value="all">Todos</option>
              </select>
              <div className="relative md:col-span-3">
                <Search className="-translate-y-1/2 pointer-events-none absolute left-2.5 top-1/2 size-4 text-muted-foreground" />
                <Input
                  className="pl-8"
                  placeholder="Buscar por nome ou slug"
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </div>
            </CardHeader>
            <CardPanel className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Projeto</TableHead>
                    <TableHead>Workspace</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Owner</TableHead>
                    <TableHead>Tarefas</TableHead>
                    <TableHead>Criado</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading
                    ? Array.from({ length: 5 }).map((_, index) => (
                        <TableRow key={index.toString()}>
                          <TableCell colSpan={7}>
                            <Skeleton className="h-8 w-full" />
                          </TableCell>
                        </TableRow>
                      ))
                    : data?.projects.map((project) => (
                        <TableRow key={project.id}>
                          <TableCell>
                            <div className="min-w-56 space-y-1">
                              <div className="font-medium">{project.name}</div>
                              <div className="text-muted-foreground text-xs">
                                {project.slug}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>{project.workspaceName}</TableCell>
                          <TableCell>
                            {project.archivedAt ? (
                              <Badge variant="warning">Arquivado</Badge>
                            ) : (
                              <Badge variant="success">Ativo</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            {project.owner?.email ?? "Sem owner"}
                          </TableCell>
                          <TableCell>
                            {project.openTaskCount}/{project.taskCount}
                            {project.overdueTaskCount > 0 && (
                              <span className="ml-1 text-destructive text-xs">
                                {project.overdueTaskCount} venc.
                              </span>
                            )}
                          </TableCell>
                          <TableCell>{formatDate(project.createdAt)}</TableCell>
                          <TableCell>
                            <div className="flex justify-end gap-1">
                              {canUpdate && (
                                <>
                                  <Button
                                    aria-label="Editar projeto"
                                    size="icon-sm"
                                    variant="ghost"
                                    onClick={() => setEditingProject(project)}
                                  >
                                    <Pencil />
                                  </Button>
                                  {project.archivedAt ? (
                                    <Button
                                      aria-label="Restaurar projeto"
                                      size="icon-sm"
                                      variant="ghost"
                                      onClick={() =>
                                        restoreProject.mutateAsync(project.id)
                                      }
                                    >
                                      <RotateCcw />
                                    </Button>
                                  ) : (
                                    <Button
                                      aria-label="Arquivar projeto"
                                      size="icon-sm"
                                      variant="ghost"
                                      onClick={() =>
                                        archiveProject.mutateAsync(project.id)
                                      }
                                    >
                                      <Archive />
                                    </Button>
                                  )}
                                  <Button
                                    aria-label="Duplicar projeto"
                                    size="icon-sm"
                                    variant="ghost"
                                    onClick={() =>
                                      duplicateProject.mutateAsync(project.id)
                                    }
                                  >
                                    <Copy />
                                  </Button>
                                </>
                              )}
                              {canDelete && (
                                <Button
                                  aria-label="Excluir projeto"
                                  size="icon-sm"
                                  variant="destructive-outline"
                                  onClick={() => setDeletingProject(project)}
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
        </div>
      </Layout.Content>
      <ProjectDialog open={createOpen} onOpenChange={setCreateOpen} />
      <ProjectDialog
        open={Boolean(editingProject)}
        project={editingProject}
        onOpenChange={(open) => !open && setEditingProject(null)}
      />
      <DeleteProjectDialog
        project={deletingProject}
        onOpenChange={(open) => !open && setDeletingProject(null)}
      />
    </Layout>
  );
}
