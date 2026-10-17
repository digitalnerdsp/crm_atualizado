import { sendTestEmail } from "@kaneo/email";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { describeRoute, resolver, validator } from "hono-openapi";
import * as v from "valibot";
import { getRuntimeSmtpEmailConfig } from "../settings/email-settings";
import {
  getRuntimeSetting,
  listRuntimeSettings,
  RUNTIME_SETTING_CATEGORIES,
  RUNTIME_SETTING_DEFINITIONS,
  SECRET_UNCHANGED_VALUE,
  updateRuntimeSettings,
} from "../settings/runtime-settings";
import { recordAuditLog } from "./audit-log";
import { requireAdminPermission } from "./require-admin-permission";

const settingValueSchema = v.union([v.boolean(), v.number(), v.string()]);

const adminSettingSchema = v.object({
  key: v.string(),
  label: v.string(),
  description: v.string(),
  category: v.string(),
  valueType: v.picklist(["boolean", "number", "string"]),
  value: settingValueSchema,
  defaultValue: settingValueSchema,
  options: v.array(settingValueSchema),
  isSecret: v.boolean(),
  runtimeApplied: v.boolean(),
  isDefault: v.boolean(),
});

const adminSettingsResponseSchema = v.object({
  categories: v.array(
    v.object({
      key: v.string(),
      label: v.string(),
    }),
  ),
  settings: v.array(adminSettingSchema),
});

const updateSettingsSchema = v.object({
  settings: v.array(
    v.object({
      key: v.string(),
      value: v.unknown(),
    }),
  ),
});

const testEmailSchema = v.object({
  to: v.pipe(v.string(), v.trim(), v.email()),
});

const testEmailResponseSchema = v.object({
  success: v.boolean(),
  message: v.string(),
});

type AdminSettingsVariables = {
  Variables: {
    userId: string;
    adminRole?: string;
    adminPermissions?: string[];
  };
};

const settings = new Hono<AdminSettingsVariables>()
  .get(
    "/",
    describeRoute({
      operationId: "listAdminSettings",
      tags: ["Admin"],
      description: "List runtime settings available to administrators.",
      responses: {
        200: {
          description: "Runtime settings",
          content: {
            "application/json": {
              schema: resolver(adminSettingsResponseSchema),
            },
          },
        },
      },
    }),
    requireAdminPermission("system.settings.view"),
    async (c) => {
      return c.json({
        categories: RUNTIME_SETTING_CATEGORIES,
        settings: await listRuntimeSettings(),
      });
    },
  )
  .patch(
    "/",
    describeRoute({
      operationId: "updateAdminSettings",
      tags: ["Admin"],
      description: "Update runtime settings and invalidate local cache.",
      responses: {
        200: {
          description: "Updated runtime settings",
          content: {
            "application/json": {
              schema: resolver(adminSettingsResponseSchema),
            },
          },
        },
      },
    }),
    validator("json", updateSettingsSchema),
    requireAdminPermission("system.settings.update"),
    async (c) => {
      const updates = c.req.valid("json").settings;
      try {
        await updateRuntimeSettings(updates, c.get("userId"));
      } catch (error) {
        throw new HTTPException(400, {
          message:
            error instanceof Error
              ? error.message
              : "Invalid settings payload.",
        });
      }

      const changedSettings = updates
        .filter((update) => {
          const definition = RUNTIME_SETTING_DEFINITIONS[
            update.key as keyof typeof RUNTIME_SETTING_DEFINITIONS
          ] as { isSecret?: boolean } | undefined;
          return !(
            definition?.isSecret &&
            (update.value === "" || update.value === SECRET_UNCHANGED_VALUE)
          );
        })
        .map((update) => ({
          key: update.key,
          isSecret: Boolean(
            (
              RUNTIME_SETTING_DEFINITIONS[
                update.key as keyof typeof RUNTIME_SETTING_DEFINITIONS
              ] as { isSecret?: boolean } | undefined
            )?.isSecret,
          ),
        }));

      if (changedSettings.length > 0) {
        await recordAuditLog(c, {
          action: "settings.updated",
          entityType: "system_setting",
          entityId: "runtime",
          entityName: "Configuracoes da instancia",
          summary: "Atualizou configuracoes administrativas da instancia.",
          metadata: { settings: changedSettings },
        });
      }

      return c.json({
        categories: RUNTIME_SETTING_CATEGORIES,
        settings: await listRuntimeSettings(),
      });
    },
  )
  .post(
    "/email/test",
    describeRoute({
      operationId: "testAdminEmailSettings",
      tags: ["Admin"],
      description: "Send a test email using runtime SMTP settings.",
      responses: {
        200: {
          description: "Test email result",
          content: {
            "application/json": {
              schema: resolver(testEmailResponseSchema),
            },
          },
        },
      },
    }),
    validator("json", testEmailSchema),
    requireAdminPermission("system.smtp.update"),
    async (c) => {
      const { to } = c.req.valid("json");
      const smtpConfig = await getRuntimeSmtpEmailConfig();

      try {
        const appName = await getRuntimeSetting("branding.appName");
        const result = await sendTestEmail(
          to,
          `Teste SMTP - ${appName}`,
          `<p>O envio SMTP de ${appName} foi configurado com sucesso.</p>`,
          smtpConfig,
        );

        if (!result.success && result.reason === "SMTP_NOT_CONFIGURED") {
          throw new HTTPException(400, {
            message:
              "Configure host, porta e remetente SMTP antes de enviar o teste.",
          });
        }
      } catch (error) {
        if (error instanceof HTTPException) throw error;
        throw new HTTPException(400, {
          message:
            error instanceof Error ? error.message : "Falha ao enviar e-mail.",
        });
      }

      return c.json({
        success: true,
        message: `E-mail de teste enviado para ${to}.`,
      });
    },
  );

export default settings;
