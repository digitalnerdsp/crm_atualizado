import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Search } from "lucide-react";
import type { FormEvent, ReactNode, SelectHTMLAttributes } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import PageTitle from "@/components/page-title";
import Layout from "@/components/settings/embedded-layout";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardPanel, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { AdminUser } from "@/fetchers/admin/get-admin-users";
import {
  useCreateAdminUser,
  useUpdateAdminUser,
} from "@/hooks/mutations/admin/use-admin-user-mutations";
import { useAdminProjects } from "@/hooks/queries/admin/use-admin-projects";
import { useAdminWorkspaces } from "@/hooks/queries/admin/use-admin-workspaces";

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

type WorkspaceMembershipForm = { workspaceId: string; role: WorkspaceRole };

export function SelectInput({
  className = "",
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={`h-8 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring ${className}`}
      {...props}
    />
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

export function ErrorText({ message }: { message?: string | null }) {
  if (!message) return null;
  return <p className="text-destructive text-sm">{message}</p>;
}

function SearchBox({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <div className="relative">
      <Search className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-2.5 size-4 text-muted-foreground" />
      <Input
        className="pl-8"
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

function AccessFields({
  workspaceMemberships,
  ownedProjectIds,
  onWorkspaceMembershipsChange,
  onOwnedProjectIdsChange,
}: {
  workspaceMemberships: WorkspaceMembershipForm[];
  ownedProjectIds: string[];
  onWorkspaceMembershipsChange: (m: WorkspaceMembershipForm[]) => void;
  onOwnedProjectIdsChange: (ids: string[]) => void;
}) {
  const { data: workspacesData } = useAdminWorkspaces({
    status: "all",
    limit: "100",
  });
  const { data: projectsData } = useAdminProjects({
    status: "all",
    limit: "100",
  });
  const [wsSearch, setWsSearch] = useState("");
  const [projSearch, setProjSearch] = useState("");
  const selectedWorkspaceIds = new Set(
    workspaceMemberships.map((m) => m.workspaceId),
  );
  const selectedProjectIds = new Set(ownedProjectIds);
  const match = (text: string, term: string) =>
    text.toLowerCase().includes(term.trim().toLowerCase());
  const workspaces = (workspacesData?.workspaces ?? []).filter((w) =>
    match(w.name, wsSearch),
  );
  const projects = (projectsData?.projects ?? []).filter(
    (p) =>
      match(p.name, projSearch) || match(p.workspaceName ?? "", projSearch),
  );

  function toggleWorkspace(workspaceId: string, checked: boolean) {
    if (checked) {
      onWorkspaceMembershipsChange([
        ...workspaceMemberships,
        { workspaceId, role: "member" },
      ]);
      return;
    }
    onWorkspaceMembershipsChange(
      workspaceMemberships.filter((m) => m.workspaceId !== workspaceId),
    );
    onOwnedProjectIdsChange(
      ownedProjectIds.filter((projectId) => {
        const project = projectsData?.projects.find((p) => p.id === projectId);
        return project ? project.workspaceId !== workspaceId : true;
      }),
    );
  }

  return (
    <div className="grid gap-6">
      <div className="space-y-2">
        <Label>
          Workspaces{" "}
          <span className="font-normal text-muted-foreground">
            ({workspaceMemberships.length} selecionado
            {workspaceMemberships.length === 1 ? "" : "s"})
          </span>
        </Label>
        <SearchBox
          value={wsSearch}
          onChange={setWsSearch}
          placeholder="Buscar workspace"
        />
        <div className="max-h-[32vh] space-y-2 overflow-auto rounded-md border border-border p-2">
          {workspaces.length === 0 && (
            <p className="p-2 text-muted-foreground text-sm">
              Nenhum workspace encontrado.
            </p>
          )}
          {workspaces.map((workspace) => {
            const membership = workspaceMemberships.find(
              (m) => m.workspaceId === workspace.id,
            );
            return (
              <div
                className="grid items-center gap-2 rounded-md bg-muted/30 p-2 sm:grid-cols-[1fr_170px]"
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
                  aria-label={`Papel em ${workspace.name}`}
                  disabled={!membership}
                  value={membership?.role ?? "member"}
                  onChange={(event) =>
                    onWorkspaceMembershipsChange(
                      workspaceMemberships.map((m) =>
                        m.workspaceId === workspace.id
                          ? { ...m, role: event.target.value }
                          : m,
                      ),
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
        <Label>
          Projetos como owner{" "}
          <span className="font-normal text-muted-foreground">
            ({ownedProjectIds.length} selecionado
            {ownedProjectIds.length === 1 ? "" : "s"})
          </span>
        </Label>
        <SearchBox
          value={projSearch}
          onChange={setProjSearch}
          placeholder="Buscar projeto ou workspace"
        />
        <div className="max-h-[32vh] space-y-2 overflow-auto rounded-md border border-border p-2">
          {projects.length === 0 && (
            <p className="p-2 text-muted-foreground text-sm">
              Nenhum projeto encontrado.
            </p>
          )}
          {projects.map((project) => {
            const enabled = selectedWorkspaceIds.has(project.workspaceId);
            return (
              <label
                className="flex min-w-0 items-start gap-2 rounded-md bg-muted/30 p-2 text-sm"
                key={project.id}
              >
                <input
                  checked={selectedProjectIds.has(project.id)}
                  disabled={!enabled}
                  type="checkbox"
                  onChange={(event) =>
                    onOwnedProjectIdsChange(
                      event.target.checked
                        ? Array.from(new Set([...ownedProjectIds, project.id]))
                        : ownedProjectIds.filter((id) => id !== project.id),
                    )
                  }
                />
                <span className="min-w-0">
                  <span className="block truncate">{project.name}</span>
                  <span className="block truncate text-muted-foreground text-xs">
                    {project.workspaceName}
                    {enabled ? "" : " · adicione o workspace para habilitar"}
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

type FormState = {
  name: string;
  email: string;
  password: string;
  role: string;
  emailVerified: boolean;
  banned: boolean;
  workspaceMemberships: WorkspaceMembershipForm[];
  ownedProjectIds: string[];
};

const emptyForm: FormState = {
  name: "",
  email: "",
  password: "",
  role: "user",
  emailVerified: true,
  banned: false,
  workspaceMemberships: [],
  ownedProjectIds: [],
};

/**
 * Tela de cadastro e edição de usuário: dados da conta de um lado, acessos do
 * outro, e a barra de ações sempre visível no rodapé.
 */
export function UserFormPage({
  user,
  roles,
  canManageRoles,
}: {
  /** Ausente = novo usuário. */
  user?: AdminUser;
  roles: string[];
  canManageRoles: boolean;
}) {
  const navigate = useNavigate();
  const createUser = useCreateAdminUser();
  const updateUser = useUpdateAdminUser();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const initializedFor = useRef<string | null>(null);
  const editing = Boolean(user);
  const pending = createUser.isPending || updateUser.isPending;
  const patch = (next: Partial<FormState>) =>
    setForm((current) => ({ ...current, ...next }));

  useEffect(() => {
    if (!user || initializedFor.current === user.id) return;
    initializedFor.current = user.id;
    setForm({
      name: user.name,
      email: user.email,
      password: "",
      role: user.role ?? "user",
      emailVerified: user.emailVerified ?? false,
      banned: user.banned ?? false,
      workspaceMemberships: (user.workspaces ?? []).map((w) => ({
        workspaceId: w.id,
        role: w.role as WorkspaceRole,
      })),
      ownedProjectIds: (user.ownedProjects ?? []).map((p) => p.id),
    });
  }, [user]);

  const back = () => navigate({ to: "/admin", search: {} });
  const title = editing ? "Editar usuário" : "Novo usuário";
  const roleOptions = useMemo(
    () => (roles.includes(form.role) ? roles : [...roles, form.role]),
    [roles, form.role],
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const base = {
      name: form.name,
      email: form.email,
      role: form.role,
      emailVerified: form.emailVerified,
      banned: form.banned,
      workspaceMemberships: form.workspaceMemberships,
      ownedProjectIds: form.ownedProjectIds,
    };
    try {
      if (user) await updateUser.mutateAsync({ userId: user.id, ...base });
      else await createUser.mutateAsync({ ...base, password: form.password });
      back();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : editing
            ? "Falha ao atualizar usuário."
            : "Falha ao criar usuário.",
      );
    }
  }

  return (
    <Layout>
      <PageTitle title={title} />
      <Layout.Header className="h-12 items-center gap-2 px-4">
        <Button size="sm" variant="ghost" onClick={back}>
          <ArrowLeft className="size-4" />
          Usuários
        </Button>
        <h1 className="font-semibold text-sm">{title}</h1>
        {user && (
          <span className="truncate text-muted-foreground text-sm">
            {user.email}
          </span>
        )}
      </Layout.Header>
      <Layout.Content className="overflow-hidden bg-sidebar">
        <form className="flex h-full min-h-0 flex-col" onSubmit={handleSubmit}>
          <div className="min-h-0 flex-1 overflow-auto">
            <div className="mx-auto grid w-full max-w-6xl gap-4 p-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
              <Card className="h-fit rounded-lg">
                <CardHeader className="p-4">
                  <CardTitle>Conta</CardTitle>
                </CardHeader>
                <CardPanel className="grid gap-4 p-4 pt-0">
                  <Field label="Nome">
                    <Input
                      required
                      value={form.name}
                      onChange={(e) => patch({ name: e.target.value })}
                    />
                  </Field>
                  <Field label="Email">
                    <Input
                      required
                      type="email"
                      value={form.email}
                      onChange={(e) => patch({ email: e.target.value })}
                    />
                  </Field>
                  {!editing && (
                    <Field label="Senha inicial">
                      <Input
                        required
                        minLength={8}
                        type="password"
                        value={form.password}
                        onChange={(e) => patch({ password: e.target.value })}
                      />
                    </Field>
                  )}
                  <Field label="Papel global">
                    <SelectInput
                      disabled={!canManageRoles}
                      value={form.role}
                      onChange={(e) => patch({ role: e.target.value })}
                    >
                      {roleOptions.map((role) => (
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
                        patch({ emailVerified: checked })
                      }
                    />
                  </div>
                  <div className="flex items-center justify-between gap-4 rounded-md border border-border p-3">
                    <Label>
                      {editing ? "Bloqueado" : "Bloquear no cadastro"}
                    </Label>
                    <Switch
                      checked={form.banned}
                      onCheckedChange={(checked) => patch({ banned: checked })}
                    />
                  </div>
                </CardPanel>
              </Card>
              <Card className="h-fit rounded-lg">
                <CardHeader className="p-4">
                  <CardTitle>Acessos</CardTitle>
                </CardHeader>
                <CardPanel className="p-4 pt-0">
                  <AccessFields
                    ownedProjectIds={form.ownedProjectIds}
                    workspaceMemberships={form.workspaceMemberships}
                    onOwnedProjectIdsChange={(ownedProjectIds) =>
                      patch({ ownedProjectIds })
                    }
                    onWorkspaceMembershipsChange={(workspaceMemberships) =>
                      patch({ workspaceMemberships })
                    }
                  />
                </CardPanel>
              </Card>
            </div>
          </div>
          <div className="shrink-0 border-t bg-card px-4 py-3">
            <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-end gap-3">
              <ErrorText message={error} />
              <Button type="button" variant="outline" onClick={back}>
                Cancelar
              </Button>
              <Button loading={pending} type="submit">
                {editing ? "Salvar" : "Criar usuário"}
              </Button>
            </div>
          </div>
        </form>
      </Layout.Content>
    </Layout>
  );
}
