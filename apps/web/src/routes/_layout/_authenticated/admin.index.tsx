import { createFileRoute, redirect } from "@tanstack/react-router";
import {
  Activity,
  BriefcaseBusiness,
  CheckSquare,
  Database,
  KeyRound,
  LogOut,
  Mail,
  Pencil,
  Search,
  Server,
  Shield,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";
import type { FormEvent, ReactNode, SelectHTMLAttributes } from "react";
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
import { StatCard } from "@/components/ui/stat-card";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getAdminMe } from "@/fetchers/admin/get-admin-me";
import type { AdminUser } from "@/fetchers/admin/get-admin-users";
import {
  useCreateAdminUser,
  useDeleteAdminUser,
  useResetAdminUserPassword,
  useRevokeAdminUserSessions,
  useUpdateAdminUser,
} from "@/hooks/mutations/admin/use-admin-user-mutations";
import { useAdminMe } from "@/hooks/queries/admin/use-admin-me";
import { useAdminOverview } from "@/hooks/queries/admin/use-admin-overview";
import { useAdminProjects } from "@/hooks/queries/admin/use-admin-projects";
import { useAdminRoles } from "@/hooks/queries/admin/use-admin-roles";
import { useAdminUsers } from "@/hooks/queries/admin/use-admin-users";
import { useAdminWorkspaces } from "@/hooks/queries/admin/use-admin-workspaces";

export const Route = createFileRoute("/_layout/_authenticated/admin/")({
  beforeLoad: async () => {
    try {
      await getAdminMe();
    } catch {
      throw redirect({ to: "/dashboard" });
    }
  },
  component: AdminPage,
});

const metricIcons = {
  users: Users,
  activeUsers: Users,
  admins: Shield,
  workspaces: BriefcaseBusiness,
  projects: BriefcaseBusiness,
  tasks: CheckSquare,
};

type GlobalRole = string;
/* O papel é o nome de uma linha de `workspace_role`: além dos semeados, valem
 * os papéis que a equipe criou nas configurações do workspace. */
type WorkspaceRole = string;

/** Semeados em todo workspace. Definir isto no cadastro do usuário é o que
 * evita alguém entrar como "membro" e só descobrir depois que não enxerga o
 * funil. Painel de administração é escrito em português direto, sem i18n. */
const WORKSPACE_ROLE_OPTIONS = [
  { value: "owner", label: "Dono" },
  { value: "admin", label: "Admin" },
  { value: "sales_manager", label: "Gestor comercial" },
  { value: "finance_legal", label: "Financeiro/Jurídico" },
  { value: "sales", label: "Vendedor" },
  { value: "member", label: "Membro" },
  { value: "viewer", label: "Visualizador" },
] as const;
type WorkspaceMembershipForm = {
  workspaceId: string;
  role: WorkspaceRole;
};

type SelectProps = SelectHTMLAttributes<HTMLSelectElement>;

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

function SelectInput({ className = "", ...props }: SelectProps) {
  return (
    <select
      className={`h-8 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring ${className}`}
      {...props}
    />
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function ErrorText({ message }: { message?: string | null }) {
  if (!message) return null;

  return <p className="text-destructive text-sm">{message}</p>;
}

function WorkspaceProjectFields({
  workspaceMemberships,
  ownedProjectIds,
  onWorkspaceMembershipsChange,
  onOwnedProjectIdsChange,
}: {
  workspaceMemberships: WorkspaceMembershipForm[];
  ownedProjectIds: string[];
  onWorkspaceMembershipsChange: (
    memberships: WorkspaceMembershipForm[],
  ) => void;
  onOwnedProjectIdsChange: (projectIds: string[]) => void;
}) {
  const { data: workspacesData } = useAdminWorkspaces({
    status: "all",
    limit: "100",
  });
  const { data: projectsData } = useAdminProjects({
    status: "all",
    limit: "100",
  });
  const selectedWorkspaceIds = new Set(
    workspaceMemberships.map((membership) => membership.workspaceId),
  );
  const selectedProjectIds = new Set(ownedProjectIds);

  function toggleWorkspace(workspaceId: string, checked: boolean) {
    if (checked) {
      onWorkspaceMembershipsChange([
        ...workspaceMemberships,
        { workspaceId, role: "member" },
      ]);
      return;
    }

    onWorkspaceMembershipsChange(
      workspaceMemberships.filter(
        (membership) => membership.workspaceId !== workspaceId,
      ),
    );
    onOwnedProjectIdsChange(
      ownedProjectIds.filter((projectId) => {
        const project = projectsData?.projects.find(
          (item) => item.id === projectId,
        );
        return project ? project.workspaceId !== workspaceId : true;
      }),
    );
  }

  function updateWorkspaceRole(workspaceId: string, role: WorkspaceRole) {
    onWorkspaceMembershipsChange(
      workspaceMemberships.map((membership) =>
        membership.workspaceId === workspaceId
          ? { ...membership, role }
          : membership,
      ),
    );
  }

  function toggleProject(projectId: string, checked: boolean) {
    onOwnedProjectIdsChange(
      checked
        ? Array.from(new Set([...ownedProjectIds, projectId]))
        : ownedProjectIds.filter((id) => id !== projectId),
    );
  }

  return (
    <div className="grid gap-4">
      <div className="space-y-2">
        <Label>Workspaces</Label>
        <div className="max-h-44 space-y-2 overflow-auto rounded-md border border-border p-2">
          {(workspacesData?.workspaces ?? []).map((workspace) => {
            const membership = workspaceMemberships.find(
              (item) => item.workspaceId === workspace.id,
            );

            return (
              <div
                className="grid gap-2 rounded-md bg-muted/20 p-2 sm:grid-cols-[1fr_120px]"
                key={workspace.id}
              >
                <label className="flex min-w-0 items-center gap-2 text-sm">
                  <input
                    checked={Boolean(membership)}
                    type="checkbox"
                    onChange={(event) =>
                      toggleWorkspace(workspace.id, event.target.checked)
                    }
                  />
                  <span className="truncate">{workspace.name}</span>
                </label>
                <SelectInput
                  disabled={!membership}
                  value={membership?.role ?? "member"}
                  onChange={(event) =>
                    updateWorkspaceRole(
                      workspace.id,
                      event.target.value as WorkspaceRole,
                    )
                  }
                >
                  {WORKSPACE_ROLE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </SelectInput>
              </div>
            );
          })}
        </div>
      </div>

      <div className="space-y-2">
        <Label>Projetos como owner</Label>
        <div className="max-h-44 space-y-2 overflow-auto rounded-md border border-border p-2">
          {(projectsData?.projects ?? []).map((project) => {
            const enabled = selectedWorkspaceIds.has(project.workspaceId);

            return (
              <label
                className="flex min-w-0 items-start gap-2 rounded-md bg-muted/20 p-2 text-sm"
                key={project.id}
              >
                <input
                  checked={selectedProjectIds.has(project.id)}
                  disabled={!enabled}
                  type="checkbox"
                  onChange={(event) =>
                    toggleProject(project.id, event.target.checked)
                  }
                />
                <span className="min-w-0">
                  <span className="block truncate">{project.name}</span>
                  <span className="block truncate text-muted-foreground text-xs">
                    {project.workspaceName}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  type,
}: {
  label: string;
  value?: number;
  type: keyof typeof metricIcons;
}) {
  return (
    <StatCard
      label={label}
      value={value === undefined ? <Skeleton className="h-7 w-16" /> : value}
      icon={metricIcons[type]}
      iconClassName="text-muted-foreground"
    />
  );
}

function RoleBadge({ role }: { role: GlobalRole }) {
  const variant = role === "superadmin" ? "default" : "outline";

  return (
    <Badge variant={variant} className="uppercase">
      {role}
    </Badge>
  );
}

function StatusBadge({ user }: { user: AdminUser }) {
  return user.status === "blocked" ? (
    <Badge variant="warning">Bloqueado</Badge>
  ) : (
    <Badge variant="success">Ativo</Badge>
  );
}

function HealthBadge({
  status,
  okLabel,
  badLabel,
}: {
  status?: boolean;
  okLabel: string;
  badLabel: string;
}) {
  if (status === undefined) return <Skeleton className="h-5 w-20" />;

  return (
    <Badge variant={status ? "success" : "warning"}>
      {status ? okLabel : badLabel}
    </Badge>
  );
}

function CreateUserDialog({
  open,
  onOpenChange,
  canManageRoles,
  roles,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canManageRoles: boolean;
  roles: string[];
}) {
  const createUser = useCreateAdminUser();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "user" as GlobalRole,
    emailVerified: true,
    banned: false,
    workspaceMemberships: [] as WorkspaceMembershipForm[],
    ownedProjectIds: [] as string[],
  });

  useEffect(() => {
    if (open) {
      setError(null);
      setForm({
        name: "",
        email: "",
        password: "",
        role: "user",
        emailVerified: true,
        banned: false,
        workspaceMemberships: [],
        ownedProjectIds: [],
      });
    }
  }, [open]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    try {
      await createUser.mutateAsync({
        name: form.name,
        email: form.email,
        password: form.password,
        role: form.role,
        emailVerified: form.emailVerified,
        banned: form.banned,
        workspaceMemberships: form.workspaceMemberships,
        ownedProjectIds: form.ownedProjectIds,
      });
      onOpenChange(false);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Falha ao criar usuário.",
      );
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Novo usuário</DialogTitle>
            <DialogDescription>
              Crie uma conta com senha inicial e papel global.
            </DialogDescription>
          </DialogHeader>
          <DialogPanel className="grid gap-4">
            <Field label="Nome">
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
            </Field>
            <Field label="Email">
              <Input
                required
                type="email"
                value={form.email}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    email: event.target.value,
                  }))
                }
              />
            </Field>
            <Field label="Senha inicial">
              <Input
                required
                minLength={8}
                type="password"
                value={form.password}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    password: event.target.value,
                  }))
                }
              />
            </Field>
            <Field label="Papel global">
              <SelectInput
                disabled={!canManageRoles}
                value={form.role}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    role: event.target.value as GlobalRole,
                  }))
                }
              >
                {roles.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </SelectInput>
            </Field>
            <div className="flex items-center justify-between gap-4 rounded-md border border-border p-3">
              <Label>Email verificado</Label>
              <Switch
                checked={form.emailVerified}
                onCheckedChange={(checked) =>
                  setForm((current) => ({
                    ...current,
                    emailVerified: checked,
                  }))
                }
              />
            </div>
            <div className="flex items-center justify-between gap-4 rounded-md border border-border p-3">
              <Label>Bloquear no cadastro</Label>
              <Switch
                checked={form.banned}
                onCheckedChange={(checked) =>
                  setForm((current) => ({ ...current, banned: checked }))
                }
              />
            </div>
            <WorkspaceProjectFields
              ownedProjectIds={form.ownedProjectIds}
              workspaceMemberships={form.workspaceMemberships}
              onOwnedProjectIdsChange={(ownedProjectIds) =>
                setForm((current) => ({ ...current, ownedProjectIds }))
              }
              onWorkspaceMembershipsChange={(workspaceMemberships) =>
                setForm((current) => ({ ...current, workspaceMemberships }))
              }
            />
            <ErrorText message={error} />
          </DialogPanel>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button loading={createUser.isPending} type="submit">
              Criar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditUserDialog({
  user,
  onOpenChange,
  canManageRoles,
  roles,
}: {
  user: AdminUser | null;
  onOpenChange: (open: boolean) => void;
  canManageRoles: boolean;
  roles: string[];
}) {
  const updateUser = useUpdateAdminUser();
  const initializedUserIdRef = useRef<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    email: "",
    role: "user" as GlobalRole,
    emailVerified: false,
    banned: false,
    workspaceMemberships: [] as WorkspaceMembershipForm[],
    ownedProjectIds: [] as string[],
  });
  const userId = user?.id ?? null;
  const userName = user?.name ?? "";
  const userEmail = user?.email ?? "";
  const userRole = user?.role ?? "user";
  const userEmailVerified = user?.emailVerified ?? false;
  const userBanned = user?.banned ?? false;
  const userWorkspaces = user?.workspaces ?? [];
  const userOwnedProjects = user?.ownedProjects ?? [];

  useEffect(() => {
    if (!userId) {
      initializedUserIdRef.current = null;
      return;
    }

    if (initializedUserIdRef.current === userId) return;

    initializedUserIdRef.current = userId;
    setError(null);
    setForm({
      name: userName,
      email: userEmail,
      role: userRole,
      emailVerified: userEmailVerified,
      banned: userBanned,
      workspaceMemberships: userWorkspaces.map((workspace) => ({
        workspaceId: workspace.id,
        role: workspace.role as WorkspaceRole,
      })),
      ownedProjectIds: userOwnedProjects.map((project) => project.id),
    });
  }, [
    userBanned,
    userEmail,
    userEmailVerified,
    userId,
    userName,
    userOwnedProjects,
    userRole,
    userWorkspaces,
  ]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return;

    setError(null);
    try {
      await updateUser.mutateAsync({
        userId: user.id,
        name: form.name,
        email: form.email,
        role: form.role,
        emailVerified: form.emailVerified,
        banned: form.banned,
        workspaceMemberships: form.workspaceMemberships,
        ownedProjectIds: form.ownedProjectIds,
      });
      onOpenChange(false);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Falha ao atualizar usuário.",
      );
    }
  }

  return (
    <Dialog open={Boolean(user)} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Editar usuário</DialogTitle>
            <DialogDescription>{user?.email}</DialogDescription>
          </DialogHeader>
          <DialogPanel className="grid gap-4">
            <Field label="Nome">
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
            </Field>
            <Field label="Email">
              <Input
                required
                type="email"
                value={form.email}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    email: event.target.value,
                  }))
                }
              />
            </Field>
            <Field label="Papel global">
              <SelectInput
                disabled={!canManageRoles}
                value={form.role}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    role: event.target.value as GlobalRole,
                  }))
                }
              >
                {roles.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </SelectInput>
            </Field>
            <div className="flex items-center justify-between gap-4 rounded-md border border-border p-3">
              <Label>Email verificado</Label>
              <Switch
                checked={form.emailVerified}
                onCheckedChange={(checked) =>
                  setForm((current) => ({
                    ...current,
                    emailVerified: checked,
                  }))
                }
              />
            </div>
            <div className="flex items-center justify-between gap-4 rounded-md border border-border p-3">
              <Label>Bloqueado</Label>
              <Switch
                checked={form.banned}
                onCheckedChange={(checked) =>
                  setForm((current) => ({ ...current, banned: checked }))
                }
              />
            </div>
            <WorkspaceProjectFields
              ownedProjectIds={form.ownedProjectIds}
              workspaceMemberships={form.workspaceMemberships}
              onOwnedProjectIdsChange={(ownedProjectIds) =>
                setForm((current) => ({ ...current, ownedProjectIds }))
              }
              onWorkspaceMembershipsChange={(workspaceMemberships) =>
                setForm((current) => ({ ...current, workspaceMemberships }))
              }
            />
            <ErrorText message={error} />
          </DialogPanel>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button loading={updateUser.isPending} type="submit">
              Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ResetPasswordDialog({
  user,
  onOpenChange,
}: {
  user: AdminUser | null;
  onOpenChange: (open: boolean) => void;
}) {
  const resetPassword = useResetAdminUserPassword();
  const initializedUserIdRef = useRef<string | null>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const userId = user?.id ?? null;

  useEffect(() => {
    if (!userId) {
      initializedUserIdRef.current = null;
      return;
    }

    if (initializedUserIdRef.current === userId) return;

    initializedUserIdRef.current = userId;
    setPassword("");
    setError(null);
  }, [userId]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return;

    setError(null);
    try {
      await resetPassword.mutateAsync({ userId: user.id, password });
      onOpenChange(false);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Falha ao redefinir senha.",
      );
    }
  }

  return (
    <Dialog open={Boolean(user)} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Redefinir senha</DialogTitle>
            <DialogDescription>{user?.email}</DialogDescription>
          </DialogHeader>
          <DialogPanel className="grid gap-4">
            <Field label="Nova senha">
              <Input
                required
                minLength={8}
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </Field>
            <ErrorText message={error} />
          </DialogPanel>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button loading={resetPassword.isPending} type="submit">
              Redefinir
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteUserDialog({
  user,
  onOpenChange,
}: {
  user: AdminUser | null;
  onOpenChange: (open: boolean) => void;
}) {
  const deleteUser = useDeleteAdminUser();
  const { data: usersData } = useAdminUsers({ status: "active", limit: "100" });
  const initializedUserIdRef = useRef<string | null>(null);
  const [confirmEmail, setConfirmEmail] = useState("");
  const [mode, setMode] = useState<"unlink" | "transfer">("unlink");
  const [transferUserId, setTransferUserId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const transferUsers = (usersData?.users ?? []).filter(
    (item) => item.id !== user?.id,
  );
  const userId = user?.id ?? null;

  useEffect(() => {
    if (!userId) {
      initializedUserIdRef.current = null;
      return;
    }

    if (initializedUserIdRef.current === userId) return;

    initializedUserIdRef.current = userId;
    setConfirmEmail("");
    setMode("unlink");
    setTransferUserId("");
    setError(null);
  }, [userId]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return;

    setError(null);
    try {
      await deleteUser.mutateAsync({
        userId: user.id,
        confirmEmail,
        mode,
        transferUserId: mode === "transfer" ? transferUserId : undefined,
      });
      onOpenChange(false);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Falha ao excluir usuário.",
      );
    }
  }

  return (
    <Dialog open={Boolean(user)} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Excluir usuário</DialogTitle>
            <DialogDescription>
              Escolha se os registros operacionais serão desvinculados ou
              transferidos para outro usuário.
            </DialogDescription>
          </DialogHeader>
          <DialogPanel className="grid gap-4">
            <Field label="Política">
              <SelectInput
                value={mode}
                onChange={(event) =>
                  setMode(event.target.value as "unlink" | "transfer")
                }
              >
                <option value="unlink">Desvincular quando possível</option>
                <option value="transfer">Transferir registros</option>
              </SelectInput>
            </Field>
            {mode === "transfer" && (
              <Field label="Transferir para">
                <SelectInput
                  required
                  value={transferUserId}
                  onChange={(event) => setTransferUserId(event.target.value)}
                >
                  <option value="">Selecione um usuário</option>
                  {transferUsers.map((transferUser) => (
                    <option key={transferUser.id} value={transferUser.id}>
                      {transferUser.name} - {transferUser.email}
                    </option>
                  ))}
                </SelectInput>
              </Field>
            )}
            <p className="text-muted-foreground text-sm">
              Digite{" "}
              <span className="font-medium text-foreground">{user?.email}</span>{" "}
              para confirmar.
            </p>
            <Field label="Email de confirmação">
              <Input
                required
                type="email"
                value={confirmEmail}
                onChange={(event) => setConfirmEmail(event.target.value)}
              />
            </Field>
            <ErrorText message={error} />
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
              loading={deleteUser.isPending}
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

function AdminPage() {
  const { data: adminMe } = useAdminMe();
  const { data: overview, isLoading: overviewLoading } = useAdminOverview();
  const { data: rolesData } = useAdminRoles();
  const [query, setQuery] = useState("");
  const [role, setRole] = useState<GlobalRole | "all">("all");
  const [status, setStatus] = useState<"active" | "blocked" | "all">("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [passwordUser, setPasswordUser] = useState<AdminUser | null>(null);
  const [deletingUser, setDeletingUser] = useState<AdminUser | null>(null);
  const revokeSessions = useRevokeAdminUserSessions();

  const usersQuery = useMemo(
    () => ({
      q: query || undefined,
      role: role === "all" ? undefined : role,
      status,
      limit: "100",
    }),
    [query, role, status],
  );

  const { data: usersData, isLoading: usersLoading } =
    useAdminUsers(usersQuery);
  const permissions = adminMe?.permissions;
  const canCreate = hasPermission(permissions, "admin.users.create");
  const canUpdate = hasPermission(permissions, "admin.users.update");
  const canDelete = hasPermission(permissions, "admin.users.delete");
  const canManageRoles = hasPermission(permissions, "admin.users.manage_roles");
  const roleOptions = useMemo(
    () =>
      rolesData?.roles.map((roleDefinition) => roleDefinition.role) ?? [
        "user",
        "admin",
        "superadmin",
      ],
    [rolesData?.roles],
  );

  async function handleRevokeSessions(user: AdminUser) {
    await revokeSessions.mutateAsync(user.id);
  }

  return (
    <Layout>
      <PageTitle title="Administração" />
      <Layout.Header className="h-12 items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <Shield className="size-4 text-muted-foreground" />
          <h1 className="font-semibold text-sm">Administração</h1>
        </div>
        <div className="flex items-center gap-2">
          {adminMe?.role && <RoleBadge role={adminMe.role as GlobalRole} />}
        </div>
      </Layout.Header>
      <Layout.Content className="overflow-auto bg-sidebar">
        <main className="mx-auto flex w-full max-w-7xl flex-col gap-4 p-4">
          <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Usuários" value={overview?.users} type="users" />
            <MetricCard
              label="Ativos"
              value={overview?.activeUsers}
              type="activeUsers"
            />
            <MetricCard
              label="Administradores"
              value={overview?.admins}
              type="admins"
            />
            <MetricCard label="Tarefas" value={overview?.tasks} type="tasks" />
          </section>

          <section className="grid gap-4 lg:grid-cols-[minmax(280px,0.8fr)_minmax(0,1.2fr)]">
            <Card className="rounded-lg">
              <CardHeader className="p-4">
                <CardTitle>Operação</CardTitle>
                <CardDescription>
                  Saúde básica da instância e serviços principais.
                </CardDescription>
              </CardHeader>
              <CardPanel className="grid gap-3 p-4 pt-0 sm:grid-cols-2">
                <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-background p-3">
                  <div className="flex items-center gap-2 text-sm">
                    <Database className="size-4 text-muted-foreground" />
                    Banco
                  </div>
                  <HealthBadge
                    badLabel="Atenção"
                    okLabel="OK"
                    status={overview?.system.database === "ok"}
                  />
                </div>
                <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-background p-3">
                  <div className="flex items-center gap-2 text-sm">
                    <Activity className="size-4 text-muted-foreground" />
                    Scheduler
                  </div>
                  <HealthBadge
                    badLabel="Parado"
                    okLabel="Rodando"
                    status={overview?.system.scheduler === "running"}
                  />
                </div>
                <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-background p-3">
                  <div className="flex items-center gap-2 text-sm">
                    <Mail className="size-4 text-muted-foreground" />
                    E-mail
                  </div>
                  <HealthBadge
                    badLabel="Pendente"
                    okLabel="Configurado"
                    status={overview?.system.email === "configured"}
                  />
                </div>
                <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-background p-3">
                  <div className="flex items-center gap-2 text-sm">
                    <Server className="size-4 text-muted-foreground" />
                    Sessões
                  </div>
                  <span className="font-medium text-sm">
                    {overview?.system.activeSessions ?? "-"}
                  </span>
                </div>
              </CardPanel>
            </Card>

            <Card className="rounded-lg">
              <CardHeader className="p-4">
                <CardTitle>Últimos eventos</CardTitle>
                <CardDescription>
                  Acessos recentes e ações administrativas macro.
                </CardDescription>
              </CardHeader>
              <CardPanel className="grid gap-4 p-4 pt-0 md:grid-cols-2">
                <div className="space-y-2">
                  <div className="font-medium text-sm">Acessos</div>
                  {(overview?.recentAccesses ?? []).map((access) => (
                    <div
                      className="rounded-md border border-border bg-background p-3"
                      key={`${access.userId}-${access.lastAccessAt}`}
                    >
                      <div className="truncate font-medium text-sm">
                        {access.name}
                      </div>
                      <div className="truncate text-muted-foreground text-xs">
                        {access.email}
                      </div>
                      <div className="mt-1 text-muted-foreground text-xs">
                        {formatDate(access.lastAccessAt)}
                      </div>
                    </div>
                  ))}
                  {!overviewLoading &&
                    overview?.recentAccesses.length === 0 && (
                      <p className="text-muted-foreground text-sm">
                        Sem acessos registrados.
                      </p>
                    )}
                </div>
                <div className="space-y-2">
                  <div className="font-medium text-sm">Ações</div>
                  {(overview?.recentActions ?? []).map((action) => (
                    <div
                      className="rounded-md border border-border bg-background p-3"
                      key={action.id}
                    >
                      <div className="line-clamp-2 text-sm">
                        {action.summary}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-2 text-muted-foreground text-xs">
                        <span>{action.actor?.name ?? "Sistema"}</span>
                        <span>{formatDate(action.createdAt)}</span>
                        {action.ipAddress && <span>IP {action.ipAddress}</span>}
                      </div>
                    </div>
                  ))}
                  {!overviewLoading && overview?.recentActions.length === 0 && (
                    <p className="text-muted-foreground text-sm">
                      Sem ações registradas.
                    </p>
                  )}
                </div>
              </CardPanel>
            </Card>
          </section>

          <Card className="rounded-lg">
            <CardHeader className="gap-3 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <CardTitle>Usuários</CardTitle>
                  <CardDescription>
                    Contas, papéis globais, status e atividade.
                  </CardDescription>
                </div>
                {canCreate && (
                  <Button onClick={() => setCreateOpen(true)}>
                    <UserPlus />
                    Novo usuário
                  </Button>
                )}
              </div>
              <div className="grid gap-2 md:grid-cols-[minmax(240px,1fr)_160px_160px]">
                <div className="relative">
                  <Search className="-translate-y-1/2 pointer-events-none absolute left-2.5 top-1/2 size-4 text-muted-foreground" />
                  <Input
                    className="pl-8"
                    placeholder="Buscar por nome ou email"
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                  />
                </div>
                <SelectInput
                  value={role}
                  onChange={(event) =>
                    setRole(event.target.value as GlobalRole | "all")
                  }
                >
                  <option value="all">Todos os papéis</option>
                  {roleOptions.map((roleOption) => (
                    <option key={roleOption} value={roleOption}>
                      {roleOption}
                    </option>
                  ))}
                </SelectInput>
                <SelectInput
                  value={status}
                  onChange={(event) =>
                    setStatus(
                      event.target.value as "active" | "blocked" | "all",
                    )
                  }
                >
                  <option value="all">Todos os status</option>
                  <option value="active">Ativos</option>
                  <option value="blocked">Bloqueados</option>
                </SelectInput>
              </div>
            </CardHeader>
            <CardPanel className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Usuário</TableHead>
                    <TableHead>Papel</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Workspaces</TableHead>
                    <TableHead>Projetos</TableHead>
                    <TableHead>Tarefas</TableHead>
                    <TableHead>Sessões</TableHead>
                    <TableHead>Último acesso</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {usersLoading || overviewLoading
                    ? Array.from({ length: 5 }).map((_, index) => (
                        <TableRow key={index.toString()}>
                          <TableCell colSpan={9}>
                            <Skeleton className="h-8 w-full" />
                          </TableCell>
                        </TableRow>
                      ))
                    : usersData?.users.map((user) => (
                        <TableRow key={user.id}>
                          <TableCell>
                            <div className="min-w-52 space-y-1">
                              <div className="font-medium">{user.name}</div>
                              <div className="text-muted-foreground text-xs">
                                {user.email}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <RoleBadge role={user.role} />
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-1">
                              <StatusBadge user={user} />
                              {!user.emailVerified && (
                                <span className="text-muted-foreground text-xs">
                                  email não verificado
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>{user.workspaceCount}</TableCell>
                          <TableCell>{user.projectCount}</TableCell>
                          <TableCell>
                            {user.openTaskCount}/{user.taskCount}
                          </TableCell>
                          <TableCell>{user.activeSessionCount}</TableCell>
                          <TableCell>{formatDate(user.lastAccessAt)}</TableCell>
                          <TableCell>
                            <div className="flex justify-end gap-1">
                              {canUpdate && (
                                <>
                                  <Button
                                    aria-label="Editar usuário"
                                    size="icon-sm"
                                    variant="ghost"
                                    onClick={() => setEditingUser(user)}
                                  >
                                    <Pencil />
                                  </Button>
                                  <Button
                                    aria-label="Redefinir senha"
                                    size="icon-sm"
                                    variant="ghost"
                                    onClick={() => setPasswordUser(user)}
                                  >
                                    <KeyRound />
                                  </Button>
                                  <Button
                                    aria-label="Revogar sessões"
                                    loading={
                                      revokeSessions.isPending &&
                                      revokeSessions.variables === user.id
                                    }
                                    size="icon-sm"
                                    variant="ghost"
                                    onClick={() => handleRevokeSessions(user)}
                                  >
                                    <LogOut />
                                  </Button>
                                </>
                              )}
                              {canDelete && (
                                <Button
                                  aria-label="Excluir usuário"
                                  size="icon-sm"
                                  variant="destructive-outline"
                                  onClick={() => setDeletingUser(user)}
                                >
                                  <Trash2 />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                  {!usersLoading && usersData?.users.length === 0 && (
                    <TableRow>
                      <TableCell
                        className="py-10 text-center text-muted-foreground"
                        colSpan={9}
                      >
                        Nenhum usuário encontrado.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardPanel>
          </Card>

          <section className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)]">
            <Card className="rounded-lg">
              <CardHeader className="p-4">
                <CardTitle>Papéis globais</CardTitle>
                <CardDescription>superadmin, admin e user</CardDescription>
              </CardHeader>
              <CardPanel className="space-y-3 p-4 pt-0">
                {overviewLoading
                  ? Array.from({ length: 3 }).map((_, index) => (
                      <Skeleton
                        key={index.toString()}
                        className="h-20 rounded-md"
                      />
                    ))
                  : overview?.roles.map((roleDefinition) => (
                      <div
                        key={roleDefinition.role}
                        className="rounded-md border border-border bg-background p-3"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-sm">
                            {roleDefinition.name}
                          </span>
                          <Badge variant="outline">{roleDefinition.role}</Badge>
                        </div>
                        <p className="mt-2 text-muted-foreground text-sm">
                          {roleDefinition.description}
                        </p>
                      </div>
                    ))}
              </CardPanel>
            </Card>

            <Card className="rounded-lg">
              <CardHeader className="p-4">
                <CardTitle>Permissões</CardTitle>
                <CardDescription>
                  {adminMe?.permissions.includes("*")
                    ? "Acesso total"
                    : `${adminMe?.permissions.length ?? 0} concedidas`}
                </CardDescription>
              </CardHeader>
              <CardPanel className="flex flex-wrap gap-2 p-4 pt-0">
                {(adminMe?.permissions ?? []).map((permission) => (
                  <Badge key={permission} variant="secondary">
                    {permission}
                  </Badge>
                ))}
              </CardPanel>
            </Card>
          </section>
        </main>
      </Layout.Content>
      <CreateUserDialog
        canManageRoles={canManageRoles}
        open={createOpen}
        roles={roleOptions}
        onOpenChange={setCreateOpen}
      />
      <EditUserDialog
        canManageRoles={canManageRoles}
        roles={roleOptions}
        user={editingUser}
        onOpenChange={(open) => !open && setEditingUser(null)}
      />
      <ResetPasswordDialog
        user={passwordUser}
        onOpenChange={(open) => !open && setPasswordUser(null)}
      />
      <DeleteUserDialog
        user={deletingUser}
        onOpenChange={(open) => !open && setDeletingUser(null)}
      />
    </Layout>
  );
}
