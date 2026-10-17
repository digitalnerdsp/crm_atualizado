import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import {
  ArrowLeft,
  Copy,
  KeyRound,
  Plus,
  Save,
  ShieldCheck,
  Trash2,
  Users,
} from "lucide-react";
import type { FormEvent, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
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
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import type { AdminRole } from "@/fetchers/admin/get-admin-roles";
import { getAdminRoles } from "@/fetchers/admin/get-admin-roles";
import {
  useCreateAdminRole,
  useDeleteAdminRole,
  useDuplicateAdminRole,
  useUpdateAdminRole,
} from "@/hooks/mutations/admin/use-admin-role-mutations";
import { useAdminMe } from "@/hooks/queries/admin/use-admin-me";
import { useAdminRoles } from "@/hooks/queries/admin/use-admin-roles";

export const Route = createFileRoute("/_layout/_authenticated/admin/roles")({
  beforeLoad: async () => {
    try {
      await getAdminRoles();
    } catch {
      throw redirect({ to: "/admin" });
    }
  },
  component: AdminRolesPage,
});

const groupLabels: Record<string, string> = {
  admin: "Administração",
  calendar: "Agenda",
  system: "Sistema",
};

function hasPermission(permissions: string[] | undefined, permission: string) {
  return Boolean(
    permissions?.includes("*") || permissions?.includes(permission),
  );
}

function slugifyRole(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
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

function RoleBadge({ role }: { role: AdminRole }) {
  if (role.role === "superadmin") {
    return <Badge>Acesso total</Badge>;
  }

  return role.isSystem ? (
    <Badge variant="outline">Sistema</Badge>
  ) : (
    <Badge variant="secondary">Personalizado</Badge>
  );
}

function RoleDialog({
  open,
  duplicateSource,
  onOpenChange,
}: {
  open: boolean;
  duplicateSource?: AdminRole | null;
  onOpenChange: (open: boolean) => void;
}) {
  const createRole = useCreateAdminRole();
  const duplicateRole = useDuplicateAdminRole();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    role: "",
    name: "",
    description: "",
    permissions: [] as string[],
  });

  useEffect(() => {
    if (!open) return;

    setError(null);
    if (duplicateSource) {
      setForm({
        role: slugifyRole(`${duplicateSource.role}-copy`),
        name: `${duplicateSource.name} copy`,
        description: duplicateSource.description,
        permissions: duplicateSource.permissions.includes("*")
          ? []
          : duplicateSource.permissions,
      });
      return;
    }

    setForm({
      role: "",
      name: "",
      description: "",
      permissions: ["admin.access"],
    });
  }, [duplicateSource, open]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    try {
      if (duplicateSource) {
        await duplicateRole.mutateAsync({
          sourceRole: duplicateSource.role,
          role: form.role,
          name: form.name,
          description: form.description,
        });
      } else {
        await createRole.mutateAsync(form);
      }
      onOpenChange(false);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Falha ao salvar papel.",
      );
    }
  }

  const isPending = createRole.isPending || duplicateRole.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>
              {duplicateSource ? "Duplicar papel" : "Novo papel"}
            </DialogTitle>
            <DialogDescription>
              Use um identificador curto, em letras minúsculas.
            </DialogDescription>
          </DialogHeader>
          <DialogPanel className="grid gap-4">
            <Field label="Identificador">
              <Input
                required
                pattern="[a-z][a-z0-9_-]*"
                value={form.role}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    role: slugifyRole(event.target.value),
                  }))
                }
              />
            </Field>
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
            <Field label="Descrição">
              <Textarea
                required
                value={form.description}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
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
            <Button loading={isPending} type="submit">
              Criar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteRoleDialog({
  role,
  roles,
  onOpenChange,
}: {
  role: AdminRole | null;
  roles: AdminRole[];
  onOpenChange: (open: boolean) => void;
}) {
  const deleteRole = useDeleteAdminRole();
  const [replacementRole, setReplacementRole] = useState("user");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (role) {
      setReplacementRole("user");
      setError(null);
    }
  }, [role]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!role) return;

    setError(null);
    try {
      await deleteRole.mutateAsync({
        role: role.role,
        replacementRole: role.userCount ? replacementRole : undefined,
      });
      onOpenChange(false);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Falha ao excluir papel.",
      );
    }
  }

  const replacementOptions = roles.filter(
    (roleOption) => roleOption.role !== role?.role,
  );

  return (
    <Dialog open={Boolean(role)} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Excluir papel</DialogTitle>
            <DialogDescription>{role?.name}</DialogDescription>
          </DialogHeader>
          <DialogPanel className="grid gap-4">
            {Boolean(role?.userCount) && (
              <Field label="Substituir usuários por">
                <select
                  className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={replacementRole}
                  onChange={(event) => setReplacementRole(event.target.value)}
                >
                  {replacementOptions.map((roleOption) => (
                    <option key={roleOption.role} value={roleOption.role}>
                      {roleOption.name}
                    </option>
                  ))}
                </select>
              </Field>
            )}
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
              loading={deleteRole.isPending}
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

function AdminRolesPage() {
  const { data: adminMe } = useAdminMe();
  const { data, isLoading } = useAdminRoles();
  const updateRole = useUpdateAdminRole();
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [duplicateSource, setDuplicateSource] = useState<AdminRole | null>(
    null,
  );
  const [deletingRole, setDeletingRole] = useState<AdminRole | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    description: "",
    permissions: [] as string[],
  });

  const roles = data?.roles ?? [];
  const selectedRole =
    roles.find((role) => role.role === selectedRoleId) ?? roles[0] ?? null;
  const canManageRoles = hasPermission(
    adminMe?.permissions,
    "admin.users.manage_roles",
  );
  const canEdit = canManageRoles && selectedRole?.role !== "superadmin";

  const permissionGroups = useMemo(() => {
    const groups = new Map<string, NonNullable<typeof data>["permissions"]>();
    for (const permission of data?.permissions ?? []) {
      const group = permission.key.split(".")[0] ?? "admin";
      groups.set(group, [...(groups.get(group) ?? []), permission]);
    }
    return Array.from(groups.entries());
  }, [data]);

  useEffect(() => {
    if (!selectedRoleId && roles.length) {
      setSelectedRoleId(roles[0].role);
    }
  }, [roles, selectedRoleId]);

  useEffect(() => {
    if (!selectedRole) return;

    setError(null);
    setForm({
      name: selectedRole.name,
      description: selectedRole.description,
      permissions: selectedRole.permissions.includes("*")
        ? []
        : selectedRole.permissions,
    });
  }, [selectedRole]);

  function togglePermission(permission: string, checked: boolean) {
    setForm((current) => {
      const permissions = new Set(current.permissions);
      if (checked) {
        permissions.add(permission);
      } else {
        permissions.delete(permission);
      }

      return { ...current, permissions: Array.from(permissions).sort() };
    });
  }

  async function handleSave() {
    if (!selectedRole || !canEdit) return;

    setError(null);
    try {
      await updateRole.mutateAsync({
        role: selectedRole.role,
        name: form.name,
        description: form.description,
        permissions: form.permissions,
      });
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Falha ao atualizar papel.",
      );
    }
  }

  return (
    <Layout>
      <PageTitle title="Papéis e permissões" />
      <Layout.Header className="h-12 items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <ShieldCheck className="size-4 text-muted-foreground" />
          <h1 className="font-semibold text-sm">Papéis e permissões</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" render={<Link to="/admin" />}>
            <ArrowLeft />
            Administração
          </Button>
          {canManageRoles && (
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus />
              Novo papel
            </Button>
          )}
        </div>
      </Layout.Header>
      <Layout.Content className="overflow-auto bg-sidebar">
        <main className="mx-auto grid w-full max-w-7xl gap-4 p-4 lg:grid-cols-[320px_minmax(0,1fr)]">
          <Card className="rounded-lg">
            <CardHeader className="p-4">
              <CardTitle>Papéis</CardTitle>
              <CardDescription>
                Sistema e papéis personalizados cadastrados.
              </CardDescription>
            </CardHeader>
            <CardPanel className="space-y-2 p-3 pt-0">
              {isLoading
                ? Array.from({ length: 4 }).map((_, index) => (
                    <Skeleton
                      key={index.toString()}
                      className="h-16 rounded-md"
                    />
                  ))
                : roles.map((role) => (
                    <button
                      className={`w-full rounded-md border p-3 text-left transition-colors ${
                        selectedRole?.role === role.role
                          ? "border-primary bg-primary/10"
                          : "border-border bg-background hover:bg-muted"
                      }`}
                      key={role.role}
                      type="button"
                      onClick={() => setSelectedRoleId(role.role)}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-sm">{role.name}</span>
                        <RoleBadge role={role} />
                      </div>
                      <div className="mt-2 flex items-center gap-2 text-muted-foreground text-xs">
                        <KeyRound className="size-3.5" />
                        <span>{role.role}</span>
                        <Users className="ml-auto size-3.5" />
                        <span>{role.userCount ?? 0}</span>
                      </div>
                    </button>
                  ))}
            </CardPanel>
          </Card>

          <Card className="rounded-lg">
            <CardHeader className="gap-3 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <CardTitle>{selectedRole?.name ?? "Papel"}</CardTitle>
                  <CardDescription>
                    {selectedRole?.role === "superadmin"
                      ? "Papel protegido com acesso total."
                      : "Edite permissões e metadados do papel selecionado."}
                  </CardDescription>
                </div>
                {selectedRole && (
                  <div className="flex flex-wrap gap-2">
                    {canManageRoles && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setDuplicateSource(selectedRole);
                          setCreateOpen(true);
                        }}
                      >
                        <Copy />
                        Duplicar
                      </Button>
                    )}
                    {canManageRoles && !selectedRole.isSystem && (
                      <Button
                        size="sm"
                        variant="destructive-outline"
                        onClick={() => setDeletingRole(selectedRole)}
                      >
                        <Trash2 />
                        Excluir
                      </Button>
                    )}
                    {canEdit && (
                      <Button
                        loading={updateRole.isPending}
                        size="sm"
                        onClick={handleSave}
                      >
                        <Save />
                        Salvar
                      </Button>
                    )}
                  </div>
                )}
              </div>
              <ErrorText message={error} />
            </CardHeader>
            <CardPanel className="space-y-5 p-4 pt-0">
              {selectedRole ? (
                <>
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field label="Nome">
                      <Input
                        disabled={!canEdit}
                        value={form.name}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            name: event.target.value,
                          }))
                        }
                      />
                    </Field>
                    <Field label="Identificador">
                      <Input disabled value={selectedRole.role} />
                    </Field>
                    <div className="md:col-span-2">
                      <Field label="Descrição">
                        <Textarea
                          disabled={!canEdit}
                          value={form.description}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              description: event.target.value,
                            }))
                          }
                        />
                      </Field>
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-4">
                    <div>
                      <h2 className="font-medium text-sm">Permissões</h2>
                      <p className="text-muted-foreground text-sm">
                        Marque as capacidades administrativas deste papel.
                      </p>
                    </div>
                    <div className="grid gap-4 xl:grid-cols-2">
                      {permissionGroups.map(([group, permissions]) => (
                        <div
                          className="rounded-md border border-border bg-background p-3"
                          key={group}
                        >
                          <div className="mb-3 font-medium text-sm">
                            {groupLabels[group] ?? group}
                          </div>
                          <div className="space-y-3">
                            {permissions.map((permission) => {
                              const checked =
                                selectedRole.permissions.includes("*") ||
                                form.permissions.includes(permission.key);
                              const permissionId = `role-permission-${permission.key.replace(
                                /[^a-zA-Z0-9_-]/g,
                                "-",
                              )}`;

                              return (
                                <div
                                  className="grid grid-cols-[auto_1fr] gap-3 rounded-md p-2 hover:bg-muted"
                                  key={permission.key}
                                >
                                  <Checkbox
                                    aria-describedby={`${permissionId}-description`}
                                    checked={checked}
                                    disabled={!canEdit}
                                    id={permissionId}
                                    onCheckedChange={(value) =>
                                      togglePermission(
                                        permission.key,
                                        value === true,
                                      )
                                    }
                                  />
                                  <div className="space-y-1">
                                    <label
                                      className="block cursor-pointer font-medium text-sm"
                                      htmlFor={permissionId}
                                    >
                                      {permission.key}
                                    </label>
                                    <p
                                      className="text-muted-foreground text-xs"
                                      id={`${permissionId}-description`}
                                    >
                                      {permission.description}
                                    </p>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <Skeleton className="h-96 rounded-md" />
              )}
            </CardPanel>
          </Card>
        </main>
      </Layout.Content>
      <RoleDialog
        duplicateSource={duplicateSource}
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) setDuplicateSource(null);
        }}
      />
      <DeleteRoleDialog
        role={deletingRole}
        roles={roles}
        onOpenChange={(open) => !open && setDeletingRole(null)}
      />
    </Layout>
  );
}
