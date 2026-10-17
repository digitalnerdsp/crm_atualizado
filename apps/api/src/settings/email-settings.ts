import type { SmtpEmailConfig } from "@kaneo/email";
import { getRuntimeSetting } from "./runtime-settings";

function formatFromAddress(email: string, name: string) {
  if (!email) return "";
  if (!name) return email;
  return `${name.replace(/[<>]/g, "").trim()} <${email}>`;
}

export async function getRuntimeSmtpEmailConfig(): Promise<SmtpEmailConfig> {
  const [
    host,
    port,
    secure,
    user,
    password,
    fromEmail,
    fromName,
    requireTLS,
    ignoreTLS,
  ] = await Promise.all([
    getRuntimeSetting("email.smtpHost"),
    getRuntimeSetting("email.smtpPort"),
    getRuntimeSetting("email.smtpSecure"),
    getRuntimeSetting("email.smtpUser"),
    getRuntimeSetting("email.smtpPassword"),
    getRuntimeSetting("email.smtpFromEmail"),
    getRuntimeSetting("email.smtpFromName"),
    getRuntimeSetting("email.smtpRequireTls"),
    getRuntimeSetting("email.smtpIgnoreTls"),
  ]);

  return {
    host,
    port,
    secure,
    user,
    password,
    from: formatFromAddress(fromEmail, fromName),
    requireTLS,
    ignoreTLS,
  };
}
