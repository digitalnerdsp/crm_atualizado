import { render } from "@react-email/components";
import { config } from "dotenv-mono";
import * as nodemailer from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";
import type { MagicLinkEmailProps } from "./templates/magic-link";
import MagicLinkEmail from "./templates/magic-link";
import NotificationEmail, {
  type NotificationEmailProps,
} from "./templates/notification";
import type { OtpEmailProps } from "./templates/otp";
import OtpEmail from "./templates/otp";
import PasswordResetEmail, {
  type PasswordResetEmailProps,
} from "./templates/password-reset";
import WorkspaceInvitationEmail, {
  type WorkspaceInvitationEmailProps,
} from "./templates/workspace-invitation";

config();

export type SmtpEmailConfig = {
  host?: string | null;
  port?: number | null;
  secure?: boolean | null;
  user?: string | null;
  password?: string | null;
  from?: string | null;
  requireTLS?: boolean | null;
  ignoreTLS?: boolean | null;
};

function getEnvSmtpConfig(): SmtpEmailConfig {
  return {
    host: process.env.SMTP_HOST,
    secure: process.env.SMTP_SECURE !== "false",
    port: Number(process.env.SMTP_PORT),
    user: process.env.SMTP_USER,
    password: process.env.SMTP_PASSWORD,
    from: process.env.SMTP_FROM,
    requireTLS: process.env.SMTP_REQUIRE_TLS === "true",
    ignoreTLS: process.env.SMTP_IGNORE_TLS === "true",
  };
}

function createTransporter(config?: SmtpEmailConfig) {
  const smtpConfig = config ?? getEnvSmtpConfig();
  const transportOptions: SMTPTransport.Options = {
    host: smtpConfig.host ?? undefined,
    secure: smtpConfig.secure ?? undefined,
    port: smtpConfig.port ?? undefined,
    auth:
      smtpConfig.user || smtpConfig.password
        ? {
            user: smtpConfig.user ?? undefined,
            pass: smtpConfig.password ?? undefined,
          }
        : undefined,
    requireTLS: smtpConfig.requireTLS ?? undefined,
    ignoreTLS: smtpConfig.ignoreTLS ?? undefined,
  };

  return nodemailer.createTransport(transportOptions);
}

function resolveSmtpConfig(config?: SmtpEmailConfig) {
  return config ?? getEnvSmtpConfig();
}

function hasRequiredSmtpConfig(config?: SmtpEmailConfig) {
  const smtpConfig = resolveSmtpConfig(config);
  return Boolean(smtpConfig.host && smtpConfig.port && smtpConfig.from);
}

export const sendMagicLinkEmail = async (
  to: string,
  subject: string,
  data: MagicLinkEmailProps,
  config?: SmtpEmailConfig,
) => {
  const emailTemplate = await render(MagicLinkEmail(data));
  try {
    const smtpConfig = resolveSmtpConfig(config);
    await createTransporter(smtpConfig).sendMail({
      from: smtpConfig.from ?? undefined,
      to,
      subject,
      html: emailTemplate,
    });
  } catch (error) {
    console.error("Error sending magic link email", error);
  }
};

export const sendOtpEmail = async (
  to: string,
  subject: string,
  data: OtpEmailProps,
  config?: SmtpEmailConfig,
) => {
  const emailTemplate = await render(OtpEmail(data));
  try {
    const smtpConfig = resolveSmtpConfig(config);
    await createTransporter(smtpConfig).sendMail({
      from: smtpConfig.from ?? undefined,
      to,
      subject,
      html: emailTemplate,
    });
  } catch (error) {
    console.error("Error sending OTP email", error);
  }
};

export const sendPasswordResetEmail = async (
  to: string,
  subject: string,
  data: PasswordResetEmailProps,
  config?: SmtpEmailConfig,
) => {
  const emailTemplate = await render(PasswordResetEmail(data));
  try {
    const smtpConfig = resolveSmtpConfig(config);
    await createTransporter(smtpConfig).sendMail({
      from: smtpConfig.from ?? undefined,
      to,
      subject,
      html: emailTemplate,
    });
  } catch (error) {
    console.error("Error sending password reset email", error);
  }
};

export type EmailResult = {
  success: boolean;
  reason?: "SMTP_NOT_CONFIGURED";
};

export const sendWorkspaceInvitationEmail = async (
  to: string,
  subject: string,
  data: WorkspaceInvitationEmailProps,
  config?: SmtpEmailConfig,
): Promise<EmailResult> => {
  if (!hasRequiredSmtpConfig(config)) {
    return { success: false, reason: "SMTP_NOT_CONFIGURED" };
  }

  try {
    const smtpConfig = resolveSmtpConfig(config);
    const emailTemplate = await render(
      WorkspaceInvitationEmail({ ...data, to }),
    );
    await createTransporter(smtpConfig).sendMail({
      from: smtpConfig.from ?? undefined,
      to,
      subject,
      html: emailTemplate,
    });
    return { success: true };
  } catch (error) {
    console.error("Error sending workspace invitation email", error);
    throw error;
  }
};

export const sendNotificationEmail = async (
  to: string,
  subject: string,
  data: NotificationEmailProps,
  config?: SmtpEmailConfig,
): Promise<EmailResult> => {
  if (!hasRequiredSmtpConfig(config)) {
    return { success: false, reason: "SMTP_NOT_CONFIGURED" };
  }

  try {
    const smtpConfig = resolveSmtpConfig(config);
    const emailTemplate = await render(NotificationEmail(data));
    await createTransporter(smtpConfig).sendMail({
      from: smtpConfig.from ?? undefined,
      to,
      subject,
      html: emailTemplate,
    });
    return { success: true };
  } catch (error) {
    console.error("Error sending notification email", error);
    throw error;
  }
};

export const sendTestEmail = async (
  to: string,
  subject: string,
  html: string,
  config?: SmtpEmailConfig,
): Promise<EmailResult> => {
  if (!hasRequiredSmtpConfig(config)) {
    return { success: false, reason: "SMTP_NOT_CONFIGURED" };
  }

  const smtpConfig = resolveSmtpConfig(config);
  await createTransporter(smtpConfig).sendMail({
    from: smtpConfig.from ?? undefined,
    to,
    subject,
    html,
  });

  return { success: true };
};
