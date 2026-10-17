import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import {
  ArrowLeft,
  Bell,
  Building2,
  CalendarDays,
  FolderCog,
  HardDrive,
  Image,
  MailCheck,
  Save,
  Settings,
  Shield,
  TestTube2,
  Upload,
  Users,
  Wrench,
  X,
} from "lucide-react";
import type { FormEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
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
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  type AdminSetting,
  getAdminSettings,
} from "@/fetchers/admin/get-admin-settings";
import {
  useTestAdminEmailSettings,
  useUpdateAdminSettings,
} from "@/hooks/mutations/admin/use-admin-settings-mutations";
import { useAdminMe } from "@/hooks/queries/admin/use-admin-me";
import { useAdminSettings } from "@/hooks/queries/admin/use-admin-settings";

export const Route = createFileRoute("/_layout/_authenticated/admin/settings")({
  beforeLoad: async () => {
    try {
      await getAdminSettings();
    } catch {
      throw redirect({ to: "/admin" });
    }
  },
  component: AdminSettingsPage,
});

type SettingValue = AdminSetting["value"];

const SECRET_CONFIGURED_VALUE = "__SECRET_CONFIGURED__";
const SECRET_UNCHANGED_VALUE = "__SECRET_UNCHANGED__";
const MAX_BRANDING_IMAGE_BYTES = 1.5 * 1024 * 1024;
const BRANDING_IMAGE_SETTING_KEYS = new Set([
  "branding.logoUrl",
  "branding.compactLogoUrl",
  "branding.faviconUrl",
  "branding.loginImageUrl",
]);
const SUPPORTED_BRANDING_IMAGE_TYPES = new Set([
  "image/apng",
  "image/avif",
  "image/gif",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/svg+xml",
  "image/webp",
]);

function hasPermission(permissions: string[] | undefined, permission: string) {
  return Boolean(
    permissions?.includes("*") || permissions?.includes(permission),
  );
}

function optionLabel(value: SettingValue) {
  const labels: Record<string, string> = {
    admin: "Superadmins e admins",
    agenda: "Agenda",
    any_user: "Qualquer usuario",
    day: "Dia",
    high: "Alta",
    local: "Local",
    low: "Baixa",
    medium: "Media",
    month: "Mes",
    "no-priority": "Sem prioridade",
    s3: "S3",
    superadmin: "Somente superadmins",
    urgent: "Urgente",
    week: "Semana",
  };

  return labels[String(value)] ?? String(value);
}

function CategoryIcon({ category }: { category: string }) {
  const icons: Record<string, typeof Settings> = {
    branding: Image,
    calendar: CalendarDays,
    email: MailCheck,
    files: HardDrive,
    general: Settings,
    maintenance: Wrench,
    notifications: Bell,
    projects: FolderCog,
    security: Shield,
    users: Users,
    workspaces: Building2,
  };
  const Icon = icons[category] ?? Settings;

  return <Icon className="size-4 text-muted-foreground" />;
}

function SettingControl({
  setting,
  value,
  disabled,
  onChange,
}: {
  setting: AdminSetting;
  value: SettingValue;
  disabled: boolean;
  onChange: (value: SettingValue) => void;
}) {
  async function handleImageUpload(file: File | undefined) {
    if (!file) return;

    if (!SUPPORTED_BRANDING_IMAGE_TYPES.has(file.type.toLowerCase())) {
      toast.error("Use uma imagem PNG, JPG, SVG, GIF, AVIF ou WebP.");
      return;
    }

    if (file.size <= 0 || file.size > MAX_BRANDING_IMAGE_BYTES) {
      toast.error("A imagem deve ter ate 1,5 MB.");
      return;
    }

    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () =>
        typeof reader.result === "string"
          ? resolve(reader.result)
          : reject(new Error("Arquivo invalido."));
      reader.onerror = () =>
        reject(reader.error ?? new Error("Upload falhou."));
      reader.readAsDataURL(file);
    });

    onChange(dataUrl);
  }

  if (setting.valueType === "boolean") {
    return (
      <Switch
        checked={Boolean(value)}
        disabled={disabled}
        onCheckedChange={onChange}
      />
    );
  }

  if (setting.options.length > 0) {
    return (
      <select
        className="h-8 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        disabled={disabled}
        value={String(value)}
        onChange={(event) => onChange(event.target.value)}
      >
        {setting.options.map((option: SettingValue) => (
          <option key={String(option)} value={String(option)}>
            {optionLabel(option)}
          </option>
        ))}
      </select>
    );
  }

  if (setting.key === "files.allowedMimeTypes") {
    return (
      <Textarea
        disabled={disabled}
        rows={3}
        size="sm"
        value={String(value ?? "")}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  }

  if (BRANDING_IMAGE_SETTING_KEYS.has(setting.key)) {
    const imageValue = typeof value === "string" ? value : "";

    return (
      <div className="space-y-2">
        {imageValue && (
          <div className="flex items-center gap-3 rounded-md border border-border bg-background p-2">
            <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted">
              <img
                alt={setting.label}
                className="max-h-full max-w-full object-contain"
                src={imageValue}
              />
            </div>
            <div className="min-w-0 flex-1 text-muted-foreground text-xs">
              Imagem carregada
            </div>
            <Button
              aria-label="Remover imagem"
              disabled={disabled}
              size="icon-sm"
              type="button"
              variant="ghost"
              onClick={() => onChange("")}
            >
              <X />
            </Button>
          </div>
        )}
        <label className="flex h-8 cursor-pointer items-center justify-center gap-2 rounded-lg border border-input bg-background px-2.5 text-sm hover:bg-accent has-[:disabled]:pointer-events-none has-[:disabled]:opacity-64">
          <Upload className="size-4 text-muted-foreground" />
          Enviar imagem
          <input
            accept={Array.from(SUPPORTED_BRANDING_IMAGE_TYPES).join(",")}
            className="sr-only"
            disabled={disabled}
            type="file"
            onChange={(event) => {
              handleImageUpload(event.target.files?.[0]).catch((cause) =>
                toast.error(
                  cause instanceof Error
                    ? cause.message
                    : "Falha ao carregar imagem.",
                ),
              );
              event.target.value = "";
            }}
          />
        </label>
      </div>
    );
  }

  return (
    <Input
      disabled={disabled}
      placeholder={
        setting.isSecret && value === SECRET_CONFIGURED_VALUE
          ? "Senha configurada"
          : undefined
      }
      type={
        setting.isSecret
          ? "password"
          : setting.valueType === "number"
            ? "number"
            : setting.key.toLowerCase().includes("color")
              ? "color"
              : "text"
      }
      value={
        setting.isSecret && value === SECRET_CONFIGURED_VALUE
          ? ""
          : String(value ?? "")
      }
      onChange={(event) =>
        onChange(
          setting.valueType === "number"
            ? Number(event.target.value)
            : event.target.value,
        )
      }
    />
  );
}

function EmailTestPanel({ canTest }: { canTest: boolean }) {
  const testEmail = useTestAdminEmailSettings();
  const [to, setTo] = useState("");

  async function handleTestEmail() {
    try {
      const result = await testEmail.mutateAsync({ to });
      toast.success(result.message);
    } catch (cause) {
      toast.error(
        cause instanceof Error ? cause.message : "Falha ao enviar e-mail.",
      );
    }
  }

  return (
    <Card className="rounded-lg">
      <CardHeader className="grid gap-3 p-4 md:grid-cols-[1fr_minmax(280px,420px)] md:items-end">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <TestTube2 className="size-4 text-muted-foreground" />
            <CardTitle>Teste SMTP</CardTitle>
          </div>
          <CardDescription>
            Envie uma mensagem simples usando as configuracoes salvas.
          </CardDescription>
        </div>
        <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
          <Input
            disabled={!canTest}
            placeholder="email@empresa.com"
            type="email"
            value={to}
            onChange={(event) => setTo(event.target.value)}
          />
          <Button
            disabled={!canTest || !to.trim()}
            loading={testEmail.isPending}
            type="button"
            variant="outline"
            onClick={handleTestEmail}
          >
            <MailCheck />
            Enviar teste
          </Button>
        </div>
      </CardHeader>
    </Card>
  );
}

function AdminSettingsPage() {
  const { data: adminMe } = useAdminMe();
  const { data, isLoading } = useAdminSettings();
  const updateSettings = useUpdateAdminSettings();
  const [values, setValues] = useState<Record<string, SettingValue>>({});
  const [error, setError] = useState<string | null>(null);
  const isDirtyRef = useRef(false);

  useEffect(() => {
    if (!data || isDirtyRef.current) return;
    setValues(
      Object.fromEntries(
        data.settings.map((setting: AdminSetting) => [
          setting.key,
          setting.isSecret && setting.value === SECRET_CONFIGURED_VALUE
            ? SECRET_CONFIGURED_VALUE
            : setting.value,
        ]),
      ),
    );
  }, [data]);

  function updateSettingValue(key: string, value: SettingValue) {
    isDirtyRef.current = true;
    setValues((current) => ({
      ...current,
      [key]: value,
    }));
  }

  const settingsByCategory = useMemo(() => {
    const grouped = new Map<string, AdminSetting[]>();
    for (const setting of data?.settings ?? []) {
      grouped.set(setting.category, [
        ...(grouped.get(setting.category) ?? []),
        setting,
      ]);
    }
    return grouped;
  }, [data]);

  const canUpdate = hasPermission(
    adminMe?.permissions,
    "system.settings.update",
  );
  const canTestEmail = hasPermission(
    adminMe?.permissions,
    "system.smtp.update",
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!data) return;

    setError(null);
    try {
      await updateSettings.mutateAsync({
        settings: data.settings.map((setting: AdminSetting) => {
          const value = values[setting.key] ?? setting.value;

          return {
            key: setting.key,
            value:
              setting.isSecret &&
              (value === "" || value === SECRET_CONFIGURED_VALUE)
                ? SECRET_UNCHANGED_VALUE
                : value,
          };
        }),
      });
      isDirtyRef.current = false;
      toast.success("Configuracoes atualizadas.");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Falha ao atualizar configuracoes.",
      );
    }
  }

  return (
    <Layout>
      <PageTitle title="Configurações administrativas" />
      <Layout.Header className="h-12 items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <Settings className="size-4 text-muted-foreground" />
          <h1 className="font-semibold text-sm">Configurações</h1>
        </div>
        <Button size="sm" variant="outline" render={<Link to="/admin" />}>
          <ArrowLeft />
          Admin
        </Button>
      </Layout.Header>
      <Layout.Content className="overflow-auto bg-sidebar">
        <form
          className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-4"
          onSubmit={handleSubmit}
        >
          <Card className="rounded-lg">
            <CardHeader className="grid gap-3 p-4 sm:grid-cols-[1fr_auto] sm:items-center">
              <div>
                <CardTitle>Configurações da instância</CardTitle>
                <CardDescription>
                  Valores persistidos em banco e editáveis sem alterar `.env`.
                </CardDescription>
              </div>
              <Button
                disabled={!canUpdate || isLoading}
                loading={updateSettings.isPending}
                type="submit"
              >
                <Save />
                Salvar alterações
              </Button>
            </CardHeader>
          </Card>

          {!isLoading && settingsByCategory.has("email") && (
            <EmailTestPanel canTest={canTestEmail} />
          )}

          {error && (
            <div className="rounded-md border border-destructive/40 bg-destructive/8 p-3 text-destructive text-sm">
              {error}
            </div>
          )}

          {isLoading
            ? Array.from({ length: 3 }).map((_, index) => (
                <Skeleton key={index.toString()} className="h-48 rounded-lg" />
              ))
            : data?.categories.map((category) => {
                const settings = settingsByCategory.get(category.key) ?? [];
                if (!settings.length) return null;

                return (
                  <Card className="rounded-lg" key={category.key}>
                    <CardHeader className="p-4">
                      <div className="flex items-center gap-2">
                        <CategoryIcon category={category.key} />
                        <CardTitle>{category.label}</CardTitle>
                      </div>
                    </CardHeader>
                    <CardPanel className="divide-y p-0">
                      {settings.map((setting) => (
                        <div
                          className="grid gap-3 p-4 md:grid-cols-[minmax(0,1fr)_minmax(220px,320px)] md:items-center"
                          key={setting.key}
                        >
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <Label>{setting.label}</Label>
                              {setting.isDefault && (
                                <Badge variant="outline">padrão</Badge>
                              )}
                              {!setting.runtimeApplied && (
                                <Badge variant="warning">catalogada</Badge>
                              )}
                            </div>
                            <p className="text-muted-foreground text-sm">
                              {setting.description}
                            </p>
                          </div>
                          <SettingControl
                            disabled={!canUpdate}
                            setting={setting}
                            value={values[setting.key] ?? setting.value}
                            onChange={(value) =>
                              updateSettingValue(setting.key, value)
                            }
                          />
                        </div>
                      ))}
                    </CardPanel>
                  </Card>
                );
              })}
        </form>
      </Layout.Content>
    </Layout>
  );
}
