import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import {
  Archive,
  ArrowLeft,
  Pencil,
  RotateCcw,
  Search,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";
import type { FormEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import PageTitle from "@/components/page-title";
import Layout from "@/components/settings/embedded-layout";
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
import type { AdminWorkspace } from "@/fetchers/admin/get-admin-workspaces";
import { getAdminWorkspaces } from "@/fetchers/admin/get-admin-workspaces";
import {
  useAddAdminWorkspaceMember,
  useArchiveAdminWorkspace,
  useCreateAdminWorkspace,
  useDeleteAdminWorkspace,
  useRemoveAdminWorkspaceMember,
  useRestoreAdminWorkspace,
  useUpdateAdminWorkspace,
  useUpdateAdminWorkspaceMember,
} from "@/hooks/mutations/admin/use-admin-workspace-mutations";
import { useAdminMe } from "@/hooks/queries/admin/use-admin-me";
import { useAdminUsers } from "@/hooks/queries/admin/use-admin-users";
import { useAdminWorkspaceMembers } from "@/hooks/queries/admin/use-admin-workspace-members";
import { useAdminWorkspaces } from "@/hooks/queries/admin/use-admin-workspaces";

export const Route = createFileRoute(
  "/_layout/_authenticated/admin/workspaces",
)({
  beforeLoad: async () => {
    try {
      await getAdminWorkspaces();
    } catch {
      throw redirect({ to: "/admin" });
    }
  },
  component: AdminWorkspacesPage,
});

/* Papel de membro é o nome de uma linha de `workspace_role`, não uma lista de
 * quatro: além dos semeados, valem os papéis que a equipe criou. */
type WorkspaceRole = string;

/** Papéis semeados em todo workspace, com o dono à frente porque o painel é o
 * único lugar que atribui propriedade. O painel de administração é escrito em
 * português direto, sem i18n, como o resto desta tela. */
const ADMIN_ROLE_OPTIONS = [
  { value: "owner", label: "Dono" },
  { value: "admin", label: "Admin" },
  { value: "sales_manager", label: "Gestor comercial" },
  { value: "finance_legal", label: "Financeiro/Jurídico" },
  { value: "sales", label: "Vendedor" },
  { value: "member", label: "Membro" },
  { value: "viewer", label: "Visualizador" },
] as const;

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

function WorkspaceDialog({
  open,
  workspace,
  onOpenChange,
}: {
  open: boolean;
  workspace?: AdminWorkspace | null;
  onOpenChange: (open: boolean) => void;
}) {
  const createWorkspace = useCreateAdminWorkspace();
  const updateWorkspace = useUpdateAdminWorkspace();
  const { data: usersData } = useAdminUsers({ status: "all", limit: "100" });
  const initializedWorkspaceKeyRef = useRef<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    slug: "",
    description: "",
    ownerUserId: "",
  });
  const workspaceKey = workspace?.id ?? "create";
  const workspaceName = workspace?.name ?? "";
  const workspaceSlug = workspace?.slug ?? "";
  const workspaceDescription = workspace?.description ?? "";
  const workspaceOwnerUserId = workspace?.owner?.id ?? "";

  useEffect(() => {
    if (!open) {
      initializedWorkspaceKeyRef.current = null;
      return;
    }

    if (initializedWorkspaceKeyRef.current === workspaceKey) return;

    initializedWorkspaceKeyRef.current = workspaceKey;
    setError(null);
    setForm({
      name: workspaceName,
      slug: workspaceSlug,
      description: workspaceDescription,
      ownerUserId: workspaceOwnerUserId,
    });
  }, [
    open,
    workspaceDescription,
    workspaceKey,
    workspaceName,
    workspaceOwnerUserId,
    workspaceSlug,
  ]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    try {
      if (workspace) {
        await updateWorkspace.mutateAsync({
          workspaceId: workspace.id,
          name: form.name,
          slug: form.slug,
          description: form.description,
        });
      } else {
        await createWorkspace.mutateAsync({
          name: form.name,
          slug: form.slug || undefined,
          description: form.description || undefined,
          ownerUserId: form.ownerUserId || undefined,
        });
      }
      onOpenChange(false);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Falha ao salvar workspace.",
      );
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {workspace ? "Editar workspace" : "Novo workspace"}
          </DialogTitle>
          <DialogDescription>
            Workspaces criados aqui nascem com papéis padrão e owner definido.
          </DialogDescription>
        </DialogHeader>
        <DialogPanel>
          <form className="space-y-4" onSubmit={handleSubmit}>
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
            {!workspace && (
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
                  <option value="">Usuário atual</option>
                  {(usersData?.users ?? []).map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name} - {user.email}
                    </option>
                  ))}
                </select>
              </div>
            )}
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
                loading={createWorkspace.isPending || updateWorkspace.isPending}
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

function MembersDialog({
  workspace,
  onOpenChange,
}: {
  workspace?: AdminWorkspace | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: membersData } = useAdminWorkspaceMembers(workspace?.id);
  const { data: usersData } = useAdminUsers({ status: "all", limit: "100" });
  const addMember = useAddAdminWorkspaceMember();
  const updateMember = useUpdateAdminWorkspaceMember();
  const removeMember = useRemoveAdminWorkspaceMember();
  const [userId, setUserId] = useState("");
  const [role, setRole] = useState<WorkspaceRole>("member");
  const [error, setError] = useState<string | null>(null);

  const availableUsers = useMemo(() => {
    const memberIds = new Set(
      (membersData?.members ?? []).map((member) => member.userId),
    );
    return (usersData?.users ?? []).filter((user) => !memberIds.has(user.id));
  }, [membersData, usersData]);

  useEffect(() => {
    if (!availableUsers.length) {
      if (userId) setUserId("");
      return;
    }

    if (!userId || !availableUsers.some((user) => user.id === userId)) {
      setUserId(availableUsers[0]?.id ?? "");
    }
  }, [availableUsers, userId]);

  if (!workspace) return null;
  const workspaceId = workspace.id;

  async function handleAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    try {
      await addMember.mutateAsync({ workspaceId, userId, role });
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Falha ao adicionar membro.",
      );
    }
  }

  async function handleRoleChange(
    memberUserId: string,
    nextRole: WorkspaceRole,
  ) {
    setError(null);
    try {
      await updateMember.mutateAsync({
        workspaceId,
        userId: memberUserId,
        role: nextRole,
      });
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Falha ao alterar papel.",
      );
    }
  }

  async function handleRemove(memberUserId: string) {
    setError(null);
    try {
      await removeMember.mutateAsync({
        workspaceId,
        userId: memberUserId,
      });
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Falha ao remover membro.",
      );
    }
  }

  return (
    <Dialog open={Boolean(workspace)} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Membros</DialogTitle>
          <DialogDescription>{workspace.name}</DialogDescription>
        </DialogHeader>
        <DialogPanel className="space-y-4">
          <form
            className="grid gap-2 sm:grid-cols-[1fr_120px_auto]"
            onSubmit={handleAdd}
          >
            <select
              className="h-8 rounded-lg border border-input bg-background px-2.5 text-sm"
              disabled={!availableUsers.length}
              value={userId}
              onChange={(event) => setUserId(event.target.value)}
            >
              {availableUsers.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name} - {user.email}
                </option>
              ))}
            </select>
            <select
              className="h-8 rounded-lg border border-input bg-background px-2.5 text-sm"
              value={role}
              onChange={(event) => setRole(event.target.value as WorkspaceRole)}
            >
              {ADMIN_ROLE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <Button disabled={!userId} loading={addMember.isPending} size="sm">
              <UserPlus />
              Adicionar
            </Button>
          </form>
          {error && <p className="text-destructive text-sm">{error}</p>}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Usuário</TableHead>
                <TableHead>Papel</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(membersData?.members ?? []).map((member) => (
                <TableRow key={member.id}>
                  <TableCell>
                    <div className="min-w-56 space-y-1">
                      <div className="font-medium">{member.name}</div>
                      <div className="text-muted-foreground text-xs">
                        {member.email}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <select
                      className="h-8 rounded-lg border border-input bg-background px-2.5 text-sm"
                      value={member.role}
                      onChange={(event) =>
                        handleRoleChange(
                          member.userId,
                          event.target.value as WorkspaceRole,
                        )
                      }
                    >
                      {ADMIN_ROLE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      aria-label="Remover membro"
                      size="icon-sm"
                      variant="destructive-outline"
                      onClick={() => handleRemove(member.userId)}
                    >
                      <Trash2 />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DialogPanel>
      </DialogContent>
    </Dialog>
  );
}

function DeleteWorkspaceDialog({
  workspace,
  onOpenChange,
}: {
  workspace: AdminWorkspace | null;
  onOpenChange: (open: boolean) => void;
}) {
  const deleteWorkspace = useDeleteAdminWorkspace();
  const initializedWorkspaceIdRef = useRef<string | null>(null);
  const [confirmSlug, setConfirmSlug] = useState("");
  const [error, setError] = useState<string | null>(null);
  const workspaceId = workspace?.id ?? null;

  useEffect(() => {
    if (!workspaceId) {
      initializedWorkspaceIdRef.current = null;
      return;
    }

    if (initializedWorkspaceIdRef.current === workspaceId) return;

    initializedWorkspaceIdRef.current = workspaceId;
    setConfirmSlug("");
    setError(null);
  }, [workspaceId]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!workspace) return;

    setError(null);
    try {
      await deleteWorkspace.mutateAsync({
        workspaceId: workspace.id,
        confirmSlug,
      });
      onOpenChange(false);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Falha ao excluir workspace.",
      );
    }
  }

  return (
    <Dialog open={Boolean(workspace)} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Excluir workspace</DialogTitle>
            <DialogDescription>
              Esta ação remove o workspace e os registros dependentes.
            </DialogDescription>
          </DialogHeader>
          <DialogPanel className="grid gap-4">
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
              <div className="font-medium text-sm">{workspace?.name}</div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                <span>{workspace?.memberCount ?? 0} membros</span>
                <span>{workspace?.projectCount ?? 0} projetos</span>
                <span>
                  {workspace?.archivedProjectCount ?? 0} projetos arquivados
                </span>
                <span>{workspace?.taskCount ?? 0} tarefas</span>
              </div>
            </div>
            <p className="text-muted-foreground text-sm">
              Digite{" "}
              <span className="font-medium text-foreground">
                {workspace?.slug}
              </span>{" "}
              para confirmar.
            </p>
            <div className="space-y-1.5">
              <Label>Slug de confirmação</Label>
              <Input
                required
                value={confirmSlug}
                onChange={(event) => setConfirmSlug(event.target.value)}
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
              disabled={confirmSlug !== workspace?.slug}
              loading={deleteWorkspace.isPending}
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

function AdminWorkspacesPage() {
  const { data: adminMe } = useAdminMe();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"active" | "archived" | "all">("active");
  const { data, isLoading } = useAdminWorkspaces({
    q: query || undefined,
    status,
  });
  const archiveWorkspace = useArchiveAdminWorkspace();
  const restoreWorkspace = useRestoreAdminWorkspace();
  const [editingWorkspace, setEditingWorkspace] =
    useState<AdminWorkspace | null>(null);
  const [membersWorkspace, setMembersWorkspace] =
    useState<AdminWorkspace | null>(null);
  const [deletingWorkspace, setDeletingWorkspace] =
    useState<AdminWorkspace | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const canCreate = hasPermission(
    adminMe?.permissions,
    "admin.workspaces.create",
  );
  const canUpdate = hasPermission(
    adminMe?.permissions,
    "admin.workspaces.update",
  );
  const canDelete = hasPermission(
    adminMe?.permissions,
    "admin.workspaces.delete",
  );

  return (
    <Layout>
      <PageTitle title="Workspaces administrativos" />
      <Layout.Header className="h-12 items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <Users className="size-4 text-muted-foreground" />
          <h1 className="font-semibold text-sm">Workspaces</h1>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" render={<Link to="/admin" />}>
            <ArrowLeft />
            Admin
          </Button>
          {canCreate && (
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <UserPlus />
              Novo
            </Button>
          )}
        </div>
      </Layout.Header>
      <Layout.Content className="overflow-auto bg-sidebar">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-4">
          <Card className="rounded-lg">
            <CardHeader className="grid gap-3 p-4 md:grid-cols-[1fr_180px]">
              <div>
                <CardTitle>Gestão global de workspaces</CardTitle>
                <CardDescription>
                  Arquive, restaure, exclua e gerencie membros sem acessar o
                  banco.
                </CardDescription>
              </div>
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
              <div className="relative md:col-span-2">
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
                    <TableHead>Workspace</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Owner</TableHead>
                    <TableHead>Membros</TableHead>
                    <TableHead>Projetos</TableHead>
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
                    : data?.workspaces.map((workspace) => (
                        <TableRow key={workspace.id}>
                          <TableCell>
                            <div className="min-w-56 space-y-1">
                              <div className="font-medium">
                                {workspace.name}
                              </div>
                              <div className="text-muted-foreground text-xs">
                                {workspace.slug}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            {workspace.archivedAt ? (
                              <Badge variant="warning">Arquivado</Badge>
                            ) : (
                              <Badge variant="success">Ativo</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            {workspace.owner?.email ?? "Sem owner"}
                          </TableCell>
                          <TableCell>{workspace.memberCount}</TableCell>
                          <TableCell>
                            {workspace.projectCount}
                            {workspace.archivedProjectCount > 0 &&
                              ` (${workspace.archivedProjectCount} arq.)`}
                          </TableCell>
                          <TableCell>
                            {formatDate(workspace.createdAt)}
                          </TableCell>
                          <TableCell>
                            <div className="flex justify-end gap-1">
                              <Button
                                aria-label="Membros"
                                size="icon-sm"
                                variant="ghost"
                                onClick={() => setMembersWorkspace(workspace)}
                              >
                                <Users />
                              </Button>
                              {canUpdate && (
                                <>
                                  <Button
                                    aria-label="Editar workspace"
                                    size="icon-sm"
                                    variant="ghost"
                                    onClick={() =>
                                      setEditingWorkspace(workspace)
                                    }
                                  >
                                    <Pencil />
                                  </Button>
                                  {workspace.archivedAt ? (
                                    <Button
                                      aria-label="Restaurar workspace"
                                      size="icon-sm"
                                      variant="ghost"
                                      onClick={() =>
                                        restoreWorkspace.mutateAsync(
                                          workspace.id,
                                        )
                                      }
                                    >
                                      <RotateCcw />
                                    </Button>
                                  ) : (
                                    <Button
                                      aria-label="Arquivar workspace"
                                      size="icon-sm"
                                      variant="ghost"
                                      onClick={() =>
                                        archiveWorkspace.mutateAsync(
                                          workspace.id,
                                        )
                                      }
                                    >
                                      <Archive />
                                    </Button>
                                  )}
                                </>
                              )}
                              {canDelete && (
                                <Button
                                  aria-label="Excluir workspace"
                                  size="icon-sm"
                                  variant="destructive-outline"
                                  onClick={() =>
                                    setDeletingWorkspace(workspace)
                                  }
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
      <WorkspaceDialog open={createOpen} onOpenChange={setCreateOpen} />
      <WorkspaceDialog
        open={Boolean(editingWorkspace)}
        workspace={editingWorkspace}
        onOpenChange={(open) => !open && setEditingWorkspace(null)}
      />
      <MembersDialog
        workspace={membersWorkspace}
        onOpenChange={(open) => !open && setMembersWorkspace(null)}
      />
      <DeleteWorkspaceDialog
        workspace={deletingWorkspace}
        onOpenChange={(open) => !open && setDeletingWorkspace(null)}
      />
    </Layout>
  );
}
