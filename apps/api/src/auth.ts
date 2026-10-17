import { apiKey } from "@better-auth/api-key";
import {
  sendMagicLinkEmail,
  sendOtpEmail,
  sendWorkspaceInvitationEmail,
} from "@kaneo/email";
import {
  ac,
  DEFAULT_ROLE_NAMES,
  defaultRolePayloads,
  owner,
} from "@kaneo/permissions";
import bcrypt from "bcryptjs";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import {
  APIError,
  createAuthMiddleware,
  getSessionFromCtx,
} from "better-auth/api";
import {
  admin as adminPlugin,
  anonymous,
  bearer,
  deviceAuthorization,
  emailOTP,
  genericOAuth,
  lastLoginMethod,
  magicLink,
  openAPI,
  organization,
} from "better-auth/plugins";
import type { AccessControl } from "better-auth/plugins/access";
import { adminAc, userAc } from "better-auth/plugins/admin/access";
import type { UserWithAnonymous } from "better-auth/plugins/anonymous";
import { config } from "dotenv-mono";
import { count, eq } from "drizzle-orm";
import { recordAuditLogEntry } from "./admin/audit-log";
import { getPublicBranding } from "./branding";
import { seedCrmDefaults } from "./crm/shared/seed-workspace";
import db, { schema } from "./database";
import { publishEvent } from "./events";
import { getRuntimeSmtpEmailConfig } from "./settings/email-settings";
import { getRuntimeSetting } from "./settings/runtime-settings";
import { checkRegistrationAllowed } from "./utils/check-registration-allowed";
import { checkWorkspaceName } from "./utils/check-workspace-name";
import { mapCustomOAuthProfileToUser } from "./utils/custom-oauth-profile";
import { generateDemoName } from "./utils/generate-demo-name";
import { getInvitationEmailSubject } from "./utils/get-invitation-email-subject";
import { getWorkspaceInvitationEmailCopy } from "./utils/get-workspace-invitation-email-copy";
import { getGithubSsoOAuthCredentials } from "./utils/github-sso-env";
import { isCloud } from "./utils/is-cloud";
import { isDisposableEmail } from "./utils/is-disposable-email";
import { isLocalSignInPath } from "./utils/is-local-sign-in-path";
import { verifyTurnstile } from "./utils/verify-turnstile";

config();

const githubSso = getGithubSsoOAuthCredentials();
const googleSso = {
  clientId: process.env.GOOGLE_CLIENT_ID?.trim() || "",
  clientSecret: process.env.GOOGLE_CLIENT_SECRET?.trim() || "",
};

const isEmailOtpSignInDisabled =
  process.env.DISABLE_EMAIL_OTP_SIGN_IN === "true";

function normalizeInvitationId(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  if (!/^[a-z0-9_-]{1,128}$/i.test(normalized)) return undefined;
  return normalized;
}

const apiUrl = process.env.KANEO_API_URL || "http://localhost:1337";
const clientUrl = process.env.KANEO_CLIENT_URL || "http://localhost:5173";
const isHttps = apiUrl.startsWith("https://");
const isCrossSubdomain = (() => {
  try {
    const apiHost = new URL(apiUrl).hostname;
    const clientHost = new URL(clientUrl).hostname;
    return (
      apiHost !== clientHost &&
      apiHost !== "localhost" &&
      clientHost !== "localhost"
    );
  } catch {
    return false;
  }
})();

const trustedOrigins = [clientUrl];
try {
  const apiOrigin = new URL(apiUrl);
  const apiOriginString = `${apiOrigin.protocol}//${apiOrigin.host}`;
  if (!trustedOrigins.includes(apiOriginString)) {
    trustedOrigins.push(apiOriginString);
  }
} catch {}

const baseURLWithoutPath = (() => {
  try {
    const url = new URL(apiUrl);
    return `${url.protocol}//${url.host}`;
  } catch {
    return apiUrl.split("/").slice(0, 3).join("/"); // Get protocol://host
  }
})();

const authSecret = process.env.AUTH_SECRET?.trim() || "";
const trustedProxyCidrs = (process.env.TRUSTED_PROXY_CIDRS || "")
  .split(",")
  .map((cidr) => cidr.trim())
  .filter(Boolean);
if (process.env.NODE_ENV === "production" && authSecret.length < 32) {
  throw new Error(
    "AUTH_SECRET must be configured with at least 32 characters in production.",
  );
}
if (authSecret && authSecret.length < 32) {
  console.warn(
    "AUTH_SECRET is less than 32 characters. Use a stronger secret before deploying.",
  );
}

async function getUserLocale(email: string) {
  const [user] = await db
    .select({ locale: schema.userTable.locale })
    .from(schema.userTable)
    .where(eq(schema.userTable.email, email))
    .limit(1);

  return user?.locale ?? null;
}

function getLocaleKey(locale?: string | null) {
  return locale?.toLowerCase().startsWith("de") ? "de" : "en";
}

function getAuthEmailCopy(locale?: string | null) {
  const { appName } = getPublicBranding();

  return getLocaleKey(locale) === "de"
    ? {
        magicLinkSubject: `Anmeldelink fuer ${appName}`,
        otpSubject: `Bestaetigungscode fuer ${appName}`,
      }
    : {
        magicLinkSubject: `Login for ${appName}`,
        otpSubject: `Authentication code for ${appName}`,
      };
}

function getDeviceAuthClientIds(): Set<string> {
  const raw = process.env.DEVICE_AUTH_CLIENT_IDS?.trim();
  if (raw) {
    return new Set(
      raw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    );
  }
  return new Set(["kaneo-cli", "kaneo-mcp"]);
}

function getDeviceAuthVerificationUri(): string {
  const base = clientUrl.replace(/\/$/, "");
  return `${base}/device`;
}

export const auth = betterAuth({
  baseURL: baseURLWithoutPath,
  trustedOrigins,
  secret: authSecret,
  basePath: "/api/auth",
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      ...schema,
      user: schema.userTable,
      account: schema.accountTable,
      session: schema.sessionTable,
      verification: schema.verificationTable,
      workspace: schema.workspaceTable,
      workspace_member: schema.workspaceUserTable,
      invitation: schema.invitationTable,
      workspace_role: schema.workspaceRoleTable,
      team: schema.teamTable,
      teamMember: schema.teamMemberTable,
      apikey: schema.apikeyTable,
      deviceCode: schema.deviceCodeTable,
    },
  }),
  user: {
    additionalFields: {
      locale: {
        type: "string",
        input: true,
        required: false,
      },
      avatarColor: {
        type: "string",
        input: true,
        required: false,
      },
    },
  },
  account: {
    accountLinking: {
      // Link an OAuth/OIDC sign-in to an existing account that shares the same
      // email instead of failing with error=account_not_linked. The listed
      // providers verify the email on their side, so they are trusted to link.
      enabled: true,
      trustedProviders: ["github", "google", "custom"],
      // Only link to an existing local account after its email has been
      // verified. Without this check, an attacker could pre-register a victim's
      // email with a password account and retain access after the victim signs
      // in through a trusted OAuth/OIDC provider.
      requireLocalEmailVerified: true,
    },
  },
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
    password: {
      hash: async (password) => {
        return await bcrypt.hash(password, 10);
      },
      verify: async ({ hash, password }) => {
        return await bcrypt.compare(password, hash);
      },
    },
  },
  socialProviders: {
    ...(githubSso.clientId && githubSso.clientSecret
      ? {
          github: {
            clientId: githubSso.clientId,
            clientSecret: githubSso.clientSecret,
            scope: ["user:email"],
          },
        }
      : {}),
    ...(googleSso.clientId && googleSso.clientSecret
      ? {
          google: {
            clientId: googleSso.clientId,
            clientSecret: googleSso.clientSecret,
          },
        }
      : {}),
  },
  plugins: [
    ...(process.env.DISABLE_GUEST_ACCESS !== "true"
      ? [
          anonymous({
            generateName: async () => generateDemoName(),
            emailDomainName: "nortys.local",
          }),
        ]
      : []),
    lastLoginMethod(),
    magicLink({
      sendMagicLink: async ({ email, url }) => {
        try {
          const locale = await getUserLocale(email);
          const copy = getAuthEmailCopy(locale);
          const smtpConfig = await getRuntimeSmtpEmailConfig();
          await sendMagicLinkEmail(
            email,
            copy.magicLinkSubject,
            {
              magicLink: url,
              locale,
            },
            smtpConfig,
          );
        } catch (error) {
          console.error(error);
        }
      },
    }),
    ...(isEmailOtpSignInDisabled
      ? []
      : [
          emailOTP({
            async sendVerificationOTP({ email, otp, type }) {
              if (type === "sign-in") {
                const locale = await getUserLocale(email);
                const copy = getAuthEmailCopy(locale);
                const smtpConfig = await getRuntimeSmtpEmailConfig();
                await sendOtpEmail(
                  email,
                  copy.otpSubject,
                  {
                    otp,
                    locale,
                  },
                  smtpConfig,
                );
              }
            },
          }),
        ]),
    organization({
      // `ac` is created with a narrow `statement` shape (project/task/label/
      // workspace + the default org statements), which makes its inferred
      // `newRole` generic incompatible with better-auth's looser
      // `AccessControl` type. Widen via an explicit cast so the plugin
      // accepts our custom statement.
      ac: ac as unknown as AccessControl,
      // Only `owner` stays static so its permissions can never be edited away
      // from the workspace creator. `viewer`, `member`, and `admin` are
      // seeded into `workspace_role` per workspace and resolved via
      // dynamic access control, so admins can fully override (replace) their
      // permissions per workspace. See the afterCreateOrganization hook.
      roles: { owner },
      dynamicAccessControl: {
        enabled: true,
        maximumRolesPerOrganization: 25,
      },
      teams: {
        enabled: true,
        maximumTeams: 10,
        allowRemovingAllTeams: false,
      },
      schema: {
        organization: {
          modelName: "workspace",
          additionalFields: {
            // in metadata
            description: {
              type: "string",
              input: true,
              required: false,
            },
          },
        },
        member: {
          modelName: "workspace_member",
          fields: {
            organizationId: "workspaceId",
            createdAt: "joinedAt",
          },
        },
        invitation: {
          modelName: "invitation",
          fields: {
            organizationId: "workspaceId",
          },
        },
        organizationRole: {
          modelName: "workspace_role",
          fields: {
            organizationId: "workspaceId",
          },
        },
        team: {
          modelName: "team",
          fields: {
            organizationId: "workspaceId",
          },
        },
      },
      allowUserToCreateOrganization: true,
      // Better Auth defaults this to `true`, which blocks any user whose email
      // is not verified from accepting/rejecting an invitation. This app does not
      // verify emails on signup (and guest/anonymous users are unverified by
      // design), so leaving the default on breaks invitation acceptance for
      // everyone. The invitation link id is the actual secret here, so gate on
      // that rather than on email verification.
      requireEmailVerificationOnInvitation: false,
      organizationHooks: {
        beforeCreateOrganization: async ({ organization, user }) => {
          const check = checkWorkspaceName(organization.name ?? "");
          if (!check.ok) {
            throw new APIError("BAD_REQUEST", { message: check.reason });
          }

          const creationPolicy = await getRuntimeSetting(
            "workspace.creationPolicy",
          );
          if (creationPolicy !== "any_user") {
            const [actor] = await db
              .select({ role: schema.userTable.role })
              .from(schema.userTable)
              .where(eq(schema.userTable.id, user.id))
              .limit(1);
            const allowed =
              actor?.role === "superadmin" ||
              (creationPolicy === "admin" && actor?.role === "admin");

            if (!allowed) {
              throw new APIError("FORBIDDEN", {
                message:
                  "Voce nao tem permissao para criar workspaces nesta instancia.",
              });
            }
          }
        },
        afterCreateOrganization: async ({ organization, user }) => {
          // Seed the editable default roles for this workspace. Each role's
          // permissions comes from the defaults in `@kaneo/permissions`.
          // Existing names are skipped so hook retries remain idempotent.
          try {
            const existing = await db
              .select({ role: schema.workspaceRoleTable.role })
              .from(schema.workspaceRoleTable)
              .where(
                eq(schema.workspaceRoleTable.workspaceId, organization.id),
              );
            const taken = new Set(existing.map((r) => r.role));
            const now = new Date();
            const rows = DEFAULT_ROLE_NAMES.filter(
              (name) => !taken.has(name),
            ).map((name) => ({
              workspaceId: organization.id,
              role: name,
              permission: JSON.stringify(defaultRolePayloads[name]),
              createdAt: now,
              updatedAt: now,
            }));
            if (rows.length > 0) {
              await db.insert(schema.workspaceRoleTable).values(rows);
            }
          } catch (error) {
            console.error(
              "Failed to seed default workspace roles for workspace",
              organization.id,
              error,
            );
          }

          // Funil, origens e razões de perda padrão: sem eles o CRM de um
          // workspace novo não abre o board nem consegue perder negócio.
          try {
            await seedCrmDefaults(organization.id);
          } catch (error) {
            console.error(
              "Failed to seed CRM defaults for workspace",
              organization.id,
              error,
            );
          }

          publishEvent("workspace.created", {
            workspaceId: organization.id,
            workspaceName: organization.name,
            ownerEmail: user.name,
            ownerId: user.id,
          });

          await recordAuditLogEntry({
            actorUserId: user.id,
            action: "workspace.created",
            entityType: "workspace",
            entityId: organization.id,
            entityName: organization.name,
            workspaceId: organization.id,
            summary: `Criou o workspace ${organization.name}.`,
            after: {
              id: organization.id,
              name: organization.name,
              ownerId: user.id,
              ownerName: user.name,
              ownerEmail: user.email,
            },
            metadata: { source: "organization_hook" },
          });
        },
      },
      async sendInvitationEmail(data) {
        const publicUrl =
          (await getRuntimeSetting("instance.publicUrl")) ||
          process.env.KANEO_CLIENT_URL ||
          "http://localhost:5173";
        const inviteLink = `${publicUrl.replace(/\/$/, "")}/invitation/accept/${data.id}`;
        const locale = await getUserLocale(data.email);
        const copy = getWorkspaceInvitationEmailCopy(locale);
        const smtpConfig = await getRuntimeSmtpEmailConfig();

        const result = await sendWorkspaceInvitationEmail(
          data.email,
          getInvitationEmailSubject(
            locale,
            data.inviter.user.name,
            data.organization.name,
          ),
          {
            inviterEmail: data.inviter.user.email,
            inviterName: data.inviter.user.name,
            workspaceName: data.organization.name,
            invitationLink: inviteLink,
            to: data.email,
            copy,
          },
          smtpConfig,
        );

        if (
          result?.success === false &&
          result.reason === "SMTP_NOT_CONFIGURED"
        ) {
          console.warn(
            "Invitation created but email not sent due to SMTP not being configured",
          );
        }

        await recordAuditLogEntry({
          actorUserId: data.inviter.user.id,
          action: "invitation.created",
          entityType: "invitation",
          entityId: data.id,
          entityName: data.email,
          workspaceId: data.organization.id,
          summary: `${data.inviter.user.name} convidou ${data.email} para ${data.organization.name}.`,
          after: {
            id: data.id,
            email: data.email,
            workspaceId: data.organization.id,
            workspaceName: data.organization.name,
            inviterId: data.inviter.user.id,
            inviterName: data.inviter.user.name,
          },
          metadata: {
            emailSent: result?.success !== false,
            smtpNotConfigured:
              result?.success === false &&
              result.reason === "SMTP_NOT_CONFIGURED",
          },
        });
      },
    }),
    genericOAuth({
      config: [
        {
          providerId: "custom",
          clientId: process.env.CUSTOM_OAUTH_CLIENT_ID || "",
          clientSecret: process.env.CUSTOM_OAUTH_CLIENT_SECRET,
          authorizationUrl: process.env.CUSTOM_OAUTH_AUTHORIZATION_URL || "",
          tokenUrl: process.env.CUSTOM_OAUTH_TOKEN_URL || "",
          userInfoUrl: process.env.CUSTOM_OAUTH_USER_INFO_URL || "",
          scopes: process.env.CUSTOM_OAUTH_SCOPES?.split(",")
            .map((s) => s.trim())
            .filter(Boolean) || ["profile", "email"],
          responseType: process.env.CUSTOM_OAUTH_RESPONSE_TYPE || "code",
          discoveryUrl: process.env.CUSTOM_OAUTH_DISCOVERY_URL || "",
          pkce: process.env.CUSTOM_AUTH_PKCE !== "false",
          mapProfileToUser: mapCustomOAuthProfileToUser,
        },
      ],
    }),
    bearer(),
    apiKey({
      enableSessionForAPIKeys: true,
      apiKeyHeaders: "x-api-key",
      rateLimit: {
        enabled: true,
        maxRequests: 100,
        timeWindow: 60 * 1000,
      },
    }),
    deviceAuthorization({
      verificationUri: getDeviceAuthVerificationUri(),
      validateClient: async (clientId) =>
        getDeviceAuthClientIds().has(clientId),
    }),
    adminPlugin({
      defaultRole: "user",
      adminRoles: ["superadmin", "admin"],
      roles: {
        admin: adminAc,
        superadmin: adminAc,
        user: userAc,
      },
    }),
    openAPI(),
  ],
  session: {
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60,
    },
  },
  rateLimit: {
    // Coolify runs a single API process, so memory storage is sufficient and
    // avoids requiring Redis. Multi-replica deployments should move this to a
    // shared atomic store.
    enabled: true,
    storage: "memory",
    window: 10,
    max: 100,
    customRules: {
      "/sign-in/email": { window: 60, max: 5 },
      "/sign-up/email": { window: 60, max: 3 },
      "/organization/invite-member": { window: 60, max: 5 },
    },
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user, ctx) => {
          // The anonymous() plugin creates ephemeral users for guest
          // access; registration limits don't apply to them (guest
          // availability is governed by DISABLE_GUEST_ACCESS instead).
          // `isAnonymous` is `input: false` in the plugin schema, so a
          // regular signup request cannot spoof it.
          const userWithAnonymous = user as Partial<UserWithAnonymous>;
          if (userWithAnonymous.isAnonymous) {
            return;
          }

          const [{ value: existingUserCount }] = await db
            .select({ value: count() })
            .from(schema.userTable);
          if (existingUserCount === 0) {
            throw new APIError("FORBIDDEN", {
              message:
                "Initial setup must be completed from the setup page before sign-up is available.",
            });
          }

          const invitationId = normalizeInvitationId(
            ctx?.body?.invitationId ||
              ctx?.query?.invitationId ||
              ctx?.headers?.get("x-invitation-id"),
          );
          const result = await checkRegistrationAllowed(
            user.email,
            invitationId,
          );
          if (!result.allowed) {
            throw new APIError("FORBIDDEN", {
              message: result.reason,
            });
          }
        },
      },
    },
  },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      const [loginFormEnabled, passwordRegistrationEnabled] = await Promise.all(
        [
          getRuntimeSetting("auth.loginForm"),
          getRuntimeSetting("auth.passwordRegistration"),
        ],
      );

      if (!loginFormEnabled && isLocalSignInPath(ctx.path)) {
        throw new APIError("FORBIDDEN", {
          message:
            "Local sign-in is disabled. Please use a configured social or OIDC sign-in method.",
        });
      }

      // Block invite-member calls on cloud from anonymous users or to
      // disposable-email addresses. The 2026-05-28 incident saw ~14k phishing
      // invites sent from throwaway disposable-email signups; gating here
      // shuts that path off without affecting self-hosted instances.
      if (ctx.path === "/organization/invite-member" && isCloud()) {
        // `before` hooks don't auto-populate ctx.context.session; load it
        // explicitly. `disableRefresh` keeps this gate cheap — we only need
        // the user record, not a session refresh side-effect.
        const session = await getSessionFromCtx(ctx, {
          disableRefresh: true,
        }).catch(() => null);
        const sessionUser = session?.user as
          | { isAnonymous?: boolean | null }
          | undefined;
        if (sessionUser?.isAnonymous) {
          throw new APIError("FORBIDDEN", {
            message: "Guest accounts may not send workspace invitations.",
          });
        }
        const inviteeEmail = (ctx.body?.email as string | undefined) ?? "";
        if (inviteeEmail && isDisposableEmail(inviteeEmail)) {
          throw new APIError("BAD_REQUEST", {
            message:
              "Invitations to disposable-email addresses are not allowed.",
          });
        }
      }

      const isSignUpPath =
        ctx.path === "/sign-up/email" ||
        ctx.path.startsWith("/callback/") ||
        ctx.path.startsWith("/sign-in/social");

      if (!isSignUpPath) {
        return;
      }

      const userCountRows = await db
        .select({ value: count() })
        .from(schema.userTable);
      const existingUserCount = userCountRows[0]?.value ?? 0;

      if (ctx.path === "/sign-up/email") {
        if (existingUserCount === 0) {
          throw new APIError("FORBIDDEN", {
            message:
              "Initial setup must be completed from the setup page before sign-up is available.",
          });
        }

        if (!passwordRegistrationEnabled) {
          throw new APIError("FORBIDDEN", {
            message:
              "Password registration is currently disabled. Please use a configured social or OIDC sign-in method.",
          });
        }

        // Cloud-only abuse gates on password signup. Self-hosted instances
        // leave KANEO_CLOUD/TURNSTILE_SECRET_KEY unset and skip both.
        if (isCloud()) {
          const signupEmail = (ctx.body?.email as string | undefined) ?? "";
          if (signupEmail && isDisposableEmail(signupEmail)) {
            throw new APIError("BAD_REQUEST", {
              message:
                "Sign-up with disposable email addresses is not allowed.",
            });
          }

          const turnstileToken =
            (ctx.body?.turnstileToken as string | undefined) ??
            ctx.headers?.get("x-turnstile-token") ??
            null;
          const remoteIp =
            ctx.headers?.get("cf-connecting-ip") ??
            ctx.headers?.get("x-forwarded-for")?.split(",")[0]?.trim() ??
            null;
          const verdict = await verifyTurnstile(turnstileToken, remoteIp);
          if (!verdict.ok) {
            throw new APIError("FORBIDDEN", { message: verdict.reason });
          }
        }
      }

      const publicRegistration = await getRuntimeSetting(
        "auth.publicRegistration",
      );

      if (publicRegistration) {
        return;
      }

      const email =
        ctx.body?.email ||
        ctx.query?.email ||
        ctx.headers?.get("x-invitation-email");
      const invitationId = normalizeInvitationId(
        ctx.body?.invitationId ||
          ctx.query?.invitationId ||
          ctx.headers?.get("x-invitation-id"),
      );

      if (ctx.path === "/sign-up/email") {
        const result = await checkRegistrationAllowed(email, invitationId);
        if (!result.allowed) {
          throw new APIError("FORBIDDEN", {
            message: result.reason,
          });
        }
      }
    }),
    after: createAuthMiddleware(async (ctx) => {
      if (ctx.path.startsWith("/sign-up") || ctx.path.startsWith("/sign-in")) {
        const newSession = ctx.context.newSession;
        if (newSession) {
          const workspaceMember = await db
            .select({ workspaceId: schema.workspaceUserTable.workspaceId })
            .from(schema.workspaceUserTable)
            .where(eq(schema.workspaceUserTable.userId, newSession.user.id))
            .limit(1);

          const activeWorkspaceId = workspaceMember[0]?.workspaceId || null;

          if (activeWorkspaceId) {
            await db
              .update(schema.sessionTable)
              .set({ activeOrganizationId: activeWorkspaceId })
              .where(eq(schema.sessionTable.id, newSession.session.id));
          }
        }
      }
    }),
  },
  advanced: {
    ipAddress:
      trustedProxyCidrs.length > 0
        ? { trustedProxies: trustedProxyCidrs }
        : undefined,
    defaultCookieAttributes: {
      // For cross-subdomain auth with HTTPS, use sameSite: "none" with secure: true
      // For same-domain or HTTP deployments, use sameSite: "lax" with secure: false
      sameSite: isCrossSubdomain && isHttps ? "none" : "lax",
      secure: isCrossSubdomain && isHttps, // must be true when sameSite is "none"
      partitioned: isCrossSubdomain && isHttps,
      domain: process.env.COOKIE_DOMAIN || undefined, // Optional: e.g., ".andrej.com" for explicit cross-subdomain cookies
    },
  },
});
