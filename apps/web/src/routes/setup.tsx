import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Eye, EyeOff } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod/v4";
import { AuthLayout } from "@/components/auth/layout";
import PageTitle from "@/components/page-title";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useCreateInitialSetup } from "@/hooks/mutations/setup/use-create-initial-setup";
import useInstanceStatus from "@/hooks/queries/instance/use-instance-status";
import { authClient } from "@/lib/auth-client";
import { DEFAULT_APP_NAME } from "@/lib/branding";
import { toast } from "@/lib/toast";

type SetupFormValues = {
  appName: string;
  appDescription: string;
  workspaceName: string;
  workspaceDescription: string;
  adminName: string;
  adminEmail: string;
  adminPassword: string;
  confirmPassword: string;
  locale: string;
  timezone: string;
};

const localeOptions = [
  { value: "pt-BR", label: "Português (Brasil)" },
  { value: "en-US", label: "English (US)" },
];

const timezoneOptions = [
  "America/Sao_Paulo",
  "America/New_York",
  "Europe/Lisbon",
  "Europe/London",
  "UTC",
];

export const Route = createFileRoute("/setup")({
  component: Setup,
});

function Setup() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showPassword, setShowPassword] = useState(false);
  const { data: instanceStatus, isLoading: isInstanceStatusLoading } =
    useInstanceStatus();
  const { mutateAsync: createSetup, isPending } = useCreateInitialSetup();

  useEffect(() => {
    if (instanceStatus?.hasUsers) {
      navigate({ to: "/auth/sign-in", replace: true });
    }
  }, [instanceStatus, navigate]);

  const setupSchema = useMemo(
    () =>
      z
        .object({
          appName: z.string().min(1, {
            message: t("auth:setup.validation.appNameRequired", {
              defaultValue: "Application name is required.",
            }),
          }),
          appDescription: z.string(),
          workspaceName: z.string().min(1, {
            message: t("auth:setup.validation.workspaceNameRequired", {
              defaultValue: "Workspace name is required.",
            }),
          }),
          workspaceDescription: z.string(),
          adminName: z.string().min(1, {
            message: t("auth:setup.validation.adminNameRequired", {
              defaultValue: "Your name is required.",
            }),
          }),
          adminEmail: z.email(),
          adminPassword: z.string().min(8, {
            message: t("auth:signUpForm.passwordTooShort"),
          }),
          confirmPassword: z.string().min(8, {
            message: t("auth:signUpForm.passwordTooShort"),
          }),
          locale: z.string().min(2),
          timezone: z.string().min(1),
        })
        .refine((value) => value.adminPassword === value.confirmPassword, {
          path: ["confirmPassword"],
          message: "As senhas não conferem.",
        }),
    [t],
  );

  const form = useForm<SetupFormValues>({
    resolver: standardSchemaResolver(setupSchema),
    defaultValues: {
      appName: DEFAULT_APP_NAME,
      appDescription: "",
      workspaceName: "",
      workspaceDescription: "",
      adminName: "",
      adminEmail: "",
      adminPassword: "",
      confirmPassword: "",
      locale: navigator.language || "pt-BR",
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    },
  });

  const onSubmit = async (data: SetupFormValues) => {
    try {
      const result = await createSetup({
        appName: data.appName.trim(),
        appDescription: data.appDescription.trim() || undefined,
        adminName: data.adminName.trim(),
        adminEmail: data.adminEmail.trim(),
        adminPassword: data.adminPassword,
        workspaceName: data.workspaceName.trim(),
        workspaceDescription: data.workspaceDescription.trim() || undefined,
        locale: data.locale,
        timezone: data.timezone,
      });

      const signInResult = await authClient.signIn.email({
        email: data.adminEmail.trim(),
        password: data.adminPassword,
      });

      if (signInResult.error) {
        throw new Error(signInResult.error.message);
      }

      await authClient.organization.setActive({
        organizationId: result.workspaceId,
      });
      await queryClient.invalidateQueries();
      toast.success(
        t("auth:setup.toast.success", {
          defaultValue: "Initial setup completed.",
        }),
      );
      navigate({
        to: "/admin",
        replace: true,
      });
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("auth:setup.toast.failed", {
              defaultValue: "Initial setup failed.",
            }),
      );
    }
  };

  return (
    <>
      <PageTitle
        title={t("auth:setup.pageTitle", {
          defaultValue: "Set up your instance",
        })}
      />
      <AuthLayout
        title={t("auth:setup.title", {
          defaultValue: "Set up your instance",
        })}
        subtitle={t("auth:setup.subtitle", {
          defaultValue:
            "Create the first superadmin account and initial workspace.",
        })}
      >
        <div className="space-y-4 mt-6">
          {isInstanceStatusLoading ? (
            <Alert>
              <AlertDescription>
                {t("auth:setup.checkingStatus", {
                  defaultValue: "Checking instance status...",
                })}
              </AlertDescription>
            </Alert>
          ) : null}

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
              <FormField
                control={form.control}
                name="appName"
                render={({ field, fieldState }) => (
                  <FormItem>
                    <FormLabel>
                      {t("auth:setup.appName", {
                        defaultValue: "Application name",
                      })}
                    </FormLabel>
                    <FormControl>
                      <Input autoComplete="organization" {...field} />
                    </FormControl>
                    <FormMessage>{fieldState.error?.message}</FormMessage>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="appDescription"
                render={({ field, fieldState }) => (
                  <FormItem>
                    <FormLabel>Descrição da aplicação</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage>{fieldState.error?.message}</FormMessage>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="workspaceName"
                render={({ field, fieldState }) => (
                  <FormItem>
                    <FormLabel>
                      {t("auth:setup.workspaceName", {
                        defaultValue: "Initial workspace",
                      })}
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder={t("auth:setup.workspacePlaceholder", {
                          defaultValue: "Company workspace",
                        })}
                        autoComplete="organization"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage>{fieldState.error?.message}</FormMessage>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="workspaceDescription"
                render={({ field, fieldState }) => (
                  <FormItem>
                    <FormLabel>Descrição do workspace</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage>{fieldState.error?.message}</FormMessage>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="adminName"
                render={({ field, fieldState }) => (
                  <FormItem>
                    <FormLabel>
                      {t("auth:setup.adminName", {
                        defaultValue: "Your name",
                      })}
                    </FormLabel>
                    <FormControl>
                      <Input autoComplete="name" {...field} />
                    </FormControl>
                    <FormMessage>{fieldState.error?.message}</FormMessage>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="adminEmail"
                render={({ field, fieldState }) => (
                  <FormItem>
                    <FormLabel>{t("auth:forms.email")}</FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        autoComplete="email"
                        placeholder={t("auth:forms.emailPlaceholder")}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage>{fieldState.error?.message}</FormMessage>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="adminPassword"
                render={({ field, fieldState }) => (
                  <FormItem>
                    <FormLabel>{t("auth:forms.password")}</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input
                          type={showPassword ? "text" : "password"}
                          autoComplete="new-password"
                          placeholder={t("auth:forms.passwordPlaceholder")}
                          {...field}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                          aria-label={
                            showPassword
                              ? t("auth:forms.hidePassword")
                              : t("auth:forms.showPassword")
                          }
                          aria-pressed={showPassword}
                        >
                          {showPassword ? (
                            <EyeOff size={16} />
                          ) : (
                            <Eye size={16} />
                          )}
                        </button>
                      </div>
                    </FormControl>
                    <FormMessage>{fieldState.error?.message}</FormMessage>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="confirmPassword"
                render={({ field, fieldState }) => (
                  <FormItem>
                    <FormLabel>Confirmar senha</FormLabel>
                    <FormControl>
                      <Input
                        type={showPassword ? "text" : "password"}
                        autoComplete="new-password"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage>{fieldState.error?.message}</FormMessage>
                  </FormItem>
                )}
              />

              <div className="grid gap-3 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="locale"
                  render={({ field, fieldState }) => (
                    <FormItem>
                      <FormLabel>Idioma</FormLabel>
                      <FormControl>
                        <select
                          className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          {...field}
                        >
                          {localeOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </FormControl>
                      <FormMessage>{fieldState.error?.message}</FormMessage>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="timezone"
                  render={({ field, fieldState }) => (
                    <FormItem>
                      <FormLabel>Fuso horário</FormLabel>
                      <FormControl>
                        <select
                          className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          {...field}
                        >
                          {timezoneOptions.map((timezone) => (
                            <option key={timezone} value={timezone}>
                              {timezone}
                            </option>
                          ))}
                        </select>
                      </FormControl>
                      <FormMessage>{fieldState.error?.message}</FormMessage>
                    </FormItem>
                  )}
                />
              </div>

              <Button
                type="submit"
                disabled={isPending || isInstanceStatusLoading}
                className="w-full mt-4"
              >
                {isPending
                  ? t("auth:setup.submitting", {
                      defaultValue: "Creating instance...",
                    })
                  : t("auth:setup.submit", {
                      defaultValue: "Create instance",
                    })}
              </Button>
            </form>
          </Form>
        </div>
      </AuthLayout>
    </>
  );
}
