import { config } from "dotenv-mono";
import { getRuntimeSetting } from "../settings/runtime-settings";
import { isGithubSsoConfigured } from "./github-sso-env";

config();

async function getSettings() {
  const [
    appName,
    appDescription,
    publicRegistration,
    passwordRegistration,
    emailOtpSignIn,
    guestAccess,
    loginForm,
    smtpHost,
    smtpPort,
    smtpFromEmail,
    workspaceCreationPolicy,
  ] = await Promise.all([
    getRuntimeSetting("branding.appName"),
    getRuntimeSetting("branding.appDescription"),
    getRuntimeSetting("auth.publicRegistration"),
    getRuntimeSetting("auth.passwordRegistration"),
    getRuntimeSetting("auth.emailOtpSignIn"),
    getRuntimeSetting("auth.guestAccess"),
    getRuntimeSetting("auth.loginForm"),
    getRuntimeSetting("email.smtpHost"),
    getRuntimeSetting("email.smtpPort"),
    getRuntimeSetting("email.smtpFromEmail"),
    getRuntimeSetting("workspace.creationPolicy"),
  ]);

  return {
    appName,
    appDescription,
    disableRegistration: !publicRegistration,
    disablePasswordRegistration: !passwordRegistration,
    disableEmailOtpSignIn: !emailOtpSignIn,
    isDemoMode: process.env.DEMO_MODE === "true",
    hasSmtp: Boolean(smtpHost && smtpPort && smtpFromEmail),
    hasGithubSignIn: isGithubSsoConfigured(),
    hasGoogleSignIn:
      Boolean(process.env.GOOGLE_CLIENT_ID) &&
      Boolean(process.env.GOOGLE_CLIENT_SECRET),
    hasCustomOAuth:
      Boolean(process.env.CUSTOM_OAUTH_CLIENT_ID) &&
      Boolean(process.env.CUSTOM_OAUTH_CLIENT_SECRET),
    hasGuestAccess: guestAccess,
    disableLoginForm: !loginForm,
    customOAuthAutoLogin: process.env.CUSTOM_OAUTH_AUTO_LOGIN === "true",
    customOAuthLogoutUrl: process.env.CUSTOM_OAUTH_LOGOUT_URL || null,
    workspaceCreationPolicy,
  };
}

export default getSettings;
