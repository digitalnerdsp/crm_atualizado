import { createId } from "@paralleldrive/cuid2";
import { inArray } from "drizzle-orm";
import { DEFAULT_APP_DESCRIPTION, DEFAULT_APP_NAME } from "../branding";
import db, { schema } from "../database";
import { decryptSettingSecret, encryptSettingSecret } from "./secrets";

type SettingValueType = "boolean" | "number" | "string";
type SettingValue = boolean | number | string;

type SettingDefinition<TValue extends SettingValue = SettingValue> = {
  key: string;
  label: string;
  description: string;
  category: string;
  valueType: SettingValueType;
  defaultValue: TValue;
  options?: readonly TValue[];
  min?: number;
  max?: number;
  isSecret?: boolean;
  runtimeApplied: boolean;
};

export const SECRET_CONFIGURED_VALUE = "__SECRET_CONFIGURED__";
export const SECRET_UNCHANGED_VALUE = "__SECRET_UNCHANGED__";

export const RUNTIME_SETTING_DEFINITIONS = {
  "branding.appName": {
    key: "branding.appName",
    label: "Nome da aplicacao",
    description: "Nome publico exibido no produto e nas telas de autenticacao.",
    category: "branding",
    valueType: "string",
    defaultValue: process.env.APP_NAME?.trim() || DEFAULT_APP_NAME,
    min: 1,
    max: 80,
    runtimeApplied: true,
  },
  "branding.appDescription": {
    key: "branding.appDescription",
    label: "Descricao",
    description: "Descricao curta usada em pontos publicos da interface.",
    category: "branding",
    valueType: "string",
    defaultValue:
      process.env.APP_DESCRIPTION?.trim() || DEFAULT_APP_DESCRIPTION,
    max: 240,
    runtimeApplied: true,
  },
  "branding.primaryColor": {
    key: "branding.primaryColor",
    label: "Cor primaria",
    description: "Cor principal da identidade visual em formato hexadecimal.",
    category: "branding",
    valueType: "string",
    defaultValue: "#3b82f6",
    min: 4,
    max: 16,
    runtimeApplied: false,
  },
  "branding.secondaryColor": {
    key: "branding.secondaryColor",
    label: "Cor secundaria",
    description: "Cor de apoio para superficies e destaques.",
    category: "branding",
    valueType: "string",
    defaultValue: "#22c55e",
    min: 4,
    max: 16,
    runtimeApplied: false,
  },
  "branding.logoUrl": {
    key: "branding.logoUrl",
    label: "Logo",
    description: "Imagem principal usada no cabecalho e telas administrativas.",
    category: "branding",
    valueType: "string",
    defaultValue: "",
    max: 2_500_000,
    runtimeApplied: false,
  },
  "branding.compactLogoUrl": {
    key: "branding.compactLogoUrl",
    label: "Logo compacto",
    description: "Versao reduzida para barras laterais e contextos estreitos.",
    category: "branding",
    valueType: "string",
    defaultValue: "",
    max: 2_500_000,
    runtimeApplied: false,
  },
  "branding.faviconUrl": {
    key: "branding.faviconUrl",
    label: "Favicon",
    description: "Icone exibido na aba do navegador.",
    category: "branding",
    valueType: "string",
    defaultValue: "",
    max: 2_500_000,
    runtimeApplied: false,
  },
  "branding.loginText": {
    key: "branding.loginText",
    label: "Texto da tela de login",
    description: "Mensagem curta exibida no acesso inicial.",
    category: "branding",
    valueType: "string",
    defaultValue: "",
    max: 240,
    runtimeApplied: false,
  },
  "branding.loginImageUrl": {
    key: "branding.loginImageUrl",
    label: "Imagem da tela de login",
    description: "Imagem institucional para a experiencia de login.",
    category: "branding",
    valueType: "string",
    defaultValue: "",
    max: 2_500_000,
    runtimeApplied: false,
  },
  "branding.footerText": {
    key: "branding.footerText",
    label: "Texto de rodape",
    description: "Assinatura discreta para rodapes administrativos.",
    category: "branding",
    valueType: "string",
    defaultValue: "",
    max: 240,
    runtimeApplied: false,
  },
  "branding.supportUrl": {
    key: "branding.supportUrl",
    label: "URL de suporte",
    description: "Link para central de ajuda, documentacao ou atendimento.",
    category: "branding",
    valueType: "string",
    defaultValue: "",
    max: 500,
    runtimeApplied: false,
  },
  "instance.publicUrl": {
    key: "instance.publicUrl",
    label: "URL publica",
    description: "Endereco publico preferencial da aplicacao.",
    category: "general",
    valueType: "string",
    defaultValue: process.env.KANEO_CLIENT_URL || "",
    max: 240,
    runtimeApplied: false,
  },
  "instance.locale": {
    key: "instance.locale",
    label: "Idioma padrao",
    description: "Locale padrao para novos fluxos da instancia.",
    category: "general",
    valueType: "string",
    defaultValue: "pt-BR",
    min: 2,
    max: 16,
    runtimeApplied: true,
  },
  "instance.timezone": {
    key: "instance.timezone",
    label: "Fuso horario",
    description: "Timezone padrao da instancia.",
    category: "general",
    valueType: "string",
    defaultValue: "UTC",
    min: 1,
    max: 80,
    runtimeApplied: true,
  },
  "instance.supportEmail": {
    key: "instance.supportEmail",
    label: "E-mail de suporte",
    description: "Contato exibido para suporte e operacao.",
    category: "general",
    valueType: "string",
    defaultValue: process.env.SUPPORT_EMAIL || "",
    max: 160,
    runtimeApplied: true,
  },
  "email.smtpHost": {
    key: "email.smtpHost",
    label: "Host SMTP",
    description: "Servidor responsavel pelo envio de e-mails transacionais.",
    category: "email",
    valueType: "string",
    defaultValue: process.env.SMTP_HOST || "",
    max: 240,
    runtimeApplied: true,
  },
  "email.smtpPort": {
    key: "email.smtpPort",
    label: "Porta SMTP",
    description: "Porta do servidor SMTP, normalmente 465, 587 ou 1025.",
    category: "email",
    valueType: "number",
    defaultValue: Number(process.env.SMTP_PORT) || 587,
    min: 1,
    max: 65_535,
    runtimeApplied: true,
  },
  "email.smtpSecure": {
    key: "email.smtpSecure",
    label: "Conexao segura",
    description: "Usa TLS direto na conexao SMTP.",
    category: "email",
    valueType: "boolean",
    defaultValue: process.env.SMTP_SECURE !== "false",
    runtimeApplied: true,
  },
  "email.smtpUser": {
    key: "email.smtpUser",
    label: "Usuario SMTP",
    description: "Usuario de autenticacao do provedor SMTP.",
    category: "email",
    valueType: "string",
    defaultValue: process.env.SMTP_USER || "",
    max: 240,
    runtimeApplied: true,
  },
  "email.smtpPassword": {
    key: "email.smtpPassword",
    label: "Senha SMTP",
    description: "Senha ou token de aplicacao do provedor SMTP.",
    category: "email",
    valueType: "string",
    defaultValue: process.env.SMTP_PASSWORD || "",
    max: 500,
    isSecret: true,
    runtimeApplied: true,
  },
  "email.smtpFromEmail": {
    key: "email.smtpFromEmail",
    label: "E-mail remetente",
    description: "Endereco usado como remetente das mensagens.",
    category: "email",
    valueType: "string",
    defaultValue: process.env.SMTP_FROM || "",
    max: 240,
    runtimeApplied: true,
  },
  "email.smtpFromName": {
    key: "email.smtpFromName",
    label: "Nome remetente",
    description: "Nome exibido junto ao e-mail remetente.",
    category: "email",
    valueType: "string",
    defaultValue: process.env.SMTP_FROM_NAME || "",
    max: 120,
    runtimeApplied: true,
  },
  "email.smtpRequireTls": {
    key: "email.smtpRequireTls",
    label: "Exigir STARTTLS",
    description: "Forca upgrade TLS quando o provedor exige STARTTLS.",
    category: "email",
    valueType: "boolean",
    defaultValue: process.env.SMTP_REQUIRE_TLS === "true",
    runtimeApplied: true,
  },
  "email.smtpIgnoreTls": {
    key: "email.smtpIgnoreTls",
    label: "Ignorar STARTTLS",
    description:
      "Evita STARTTLS em ambientes locais ou provedores especificos.",
    category: "email",
    valueType: "boolean",
    defaultValue: process.env.SMTP_IGNORE_TLS === "true",
    runtimeApplied: true,
  },
  "notifications.emailEnabled": {
    key: "notifications.emailEnabled",
    label: "Notificacoes por e-mail",
    description:
      "Permite envio de notificacoes por e-mail quando SMTP esta ativo.",
    category: "notifications",
    valueType: "boolean",
    defaultValue: true,
    runtimeApplied: false,
  },
  "notifications.inAppEnabled": {
    key: "notifications.inAppEnabled",
    label: "Notificacoes internas",
    description: "Mantem notificacoes dentro do produto habilitadas.",
    category: "notifications",
    valueType: "boolean",
    defaultValue: true,
    runtimeApplied: false,
  },
  "auth.publicRegistration": {
    key: "auth.publicRegistration",
    label: "Cadastro publico",
    description: "Permite cadastro sem convite depois do setup inicial.",
    category: "users",
    valueType: "boolean",
    defaultValue: process.env.DISABLE_REGISTRATION !== "true",
    runtimeApplied: true,
  },
  "auth.passwordRegistration": {
    key: "auth.passwordRegistration",
    label: "Cadastro com senha",
    description: "Permite criar conta usando e-mail e senha.",
    category: "users",
    valueType: "boolean",
    defaultValue: process.env.DISABLE_PASSWORD_REGISTRATION !== "true",
    runtimeApplied: true,
  },
  "auth.emailOtpSignIn": {
    key: "auth.emailOtpSignIn",
    label: "Login por codigo",
    description: "Exibe o login por codigo quando SMTP esta configurado.",
    category: "users",
    valueType: "boolean",
    defaultValue: process.env.DISABLE_EMAIL_OTP_SIGN_IN !== "true",
    runtimeApplied: true,
  },
  "auth.guestAccess": {
    key: "auth.guestAccess",
    label: "Acesso convidado",
    description: "Exibe o acesso convidado quando o provedor esta habilitado.",
    category: "users",
    valueType: "boolean",
    defaultValue: process.env.DISABLE_GUEST_ACCESS !== "true",
    runtimeApplied: true,
  },
  "auth.loginForm": {
    key: "auth.loginForm",
    label: "Formulario de login local",
    description: "Permite usar os fluxos locais de autenticacao.",
    category: "users",
    valueType: "boolean",
    defaultValue: process.env.DISABLE_LOGIN_FORM !== "true",
    runtimeApplied: true,
  },
  "workspace.creationPolicy": {
    key: "workspace.creationPolicy",
    label: "Quem pode criar workspace",
    description: "Politica administrativa para criacao de workspaces.",
    category: "workspaces",
    valueType: "string",
    defaultValue: "any_user",
    options: ["superadmin", "admin", "any_user"],
    runtimeApplied: true,
  },
  "workspace.deleteEnabled": {
    key: "workspace.deleteEnabled",
    label: "Exclusao de workspace",
    description: "Controla a disponibilidade operacional de exclusao.",
    category: "workspaces",
    valueType: "boolean",
    defaultValue: true,
    runtimeApplied: false,
  },
  "project.defaultStatus": {
    key: "project.defaultStatus",
    label: "Status padrao",
    description: "Status padrao para novas tarefas.",
    category: "projects",
    valueType: "string",
    defaultValue: "to-do",
    min: 1,
    max: 80,
    runtimeApplied: false,
  },
  "project.defaultPriority": {
    key: "project.defaultPriority",
    label: "Prioridade padrao",
    description: "Prioridade padrao para novas tarefas.",
    category: "projects",
    valueType: "string",
    defaultValue: "low",
    options: ["no-priority", "low", "medium", "high", "urgent"],
    runtimeApplied: false,
  },
  "project.permanentDeleteEnabled": {
    key: "project.permanentDeleteEnabled",
    label: "Exclusao permanente",
    description: "Controla a disponibilidade futura de exclusao permanente.",
    category: "projects",
    valueType: "boolean",
    defaultValue: true,
    runtimeApplied: false,
  },
  "calendar.defaultView": {
    key: "calendar.defaultView",
    label: "Visualizacao padrao",
    description: "Modo inicial usado na agenda da instancia.",
    category: "calendar",
    valueType: "string",
    defaultValue: "month",
    options: ["month", "week", "day", "agenda"],
    runtimeApplied: false,
  },
  "calendar.firstDayOfWeek": {
    key: "calendar.firstDayOfWeek",
    label: "Primeiro dia da semana",
    description: "Dia usado como inicio da semana no calendario.",
    category: "calendar",
    valueType: "number",
    defaultValue: 1,
    min: 0,
    max: 6,
    runtimeApplied: false,
  },
  "calendar.workdayStart": {
    key: "calendar.workdayStart",
    label: "Inicio do expediente",
    description: "Horario inicial exibido em visoes de agenda.",
    category: "calendar",
    valueType: "string",
    defaultValue: "08:00",
    min: 4,
    max: 5,
    runtimeApplied: false,
  },
  "calendar.workdayEnd": {
    key: "calendar.workdayEnd",
    label: "Fim do expediente",
    description: "Horario final exibido em visoes de agenda.",
    category: "calendar",
    valueType: "string",
    defaultValue: "18:00",
    min: 4,
    max: 5,
    runtimeApplied: false,
  },
  "calendar.defaultEventDurationMinutes": {
    key: "calendar.defaultEventDurationMinutes",
    label: "Duracao padrao",
    description: "Duracao sugerida para novos compromissos.",
    category: "calendar",
    valueType: "number",
    defaultValue: 60,
    min: 5,
    max: 1440,
    runtimeApplied: false,
  },
  "calendar.remindersEnabled": {
    key: "calendar.remindersEnabled",
    label: "Lembretes",
    description:
      "Permite lembretes de compromissos quando a entrega esta ativa.",
    category: "calendar",
    valueType: "boolean",
    defaultValue: true,
    runtimeApplied: false,
  },
  "calendar.defaultReminderMinutes": {
    key: "calendar.defaultReminderMinutes",
    label: "Lembrete padrao",
    description: "Antecedencia sugerida para lembretes de compromissos.",
    category: "calendar",
    valueType: "number",
    defaultValue: 30,
    min: 0,
    max: 10_080,
    runtimeApplied: false,
  },
  "calendar.privateEventsEnabled": {
    key: "calendar.privateEventsEnabled",
    label: "Eventos privados",
    description: "Permite compromissos com visibilidade privada.",
    category: "calendar",
    valueType: "boolean",
    defaultValue: true,
    runtimeApplied: false,
  },
  "security.sessionDurationDays": {
    key: "security.sessionDurationDays",
    label: "Duracao da sessao",
    description: "Dias sugeridos para validade operacional de sessoes.",
    category: "security",
    valueType: "number",
    defaultValue: 7,
    min: 1,
    max: 90,
    runtimeApplied: false,
  },
  "security.loginRateLimitPerMinute": {
    key: "security.loginRateLimitPerMinute",
    label: "Limite de login por minuto",
    description: "Referencia administrativa para tentativas de login.",
    category: "security",
    valueType: "number",
    defaultValue: 10,
    min: 1,
    max: 500,
    runtimeApplied: false,
  },
  "security.criticalActionConfirmation": {
    key: "security.criticalActionConfirmation",
    label: "Confirmacao em acoes criticas",
    description: "Exige confirmacao extra em exclusoes e alteracoes sensiveis.",
    category: "security",
    valueType: "boolean",
    defaultValue: true,
    runtimeApplied: false,
  },
  "security.auditRetentionDays": {
    key: "security.auditRetentionDays",
    label: "Retencao da auditoria",
    description: "Dias desejados para manter logs administrativos macro.",
    category: "security",
    valueType: "number",
    defaultValue: 365,
    min: 30,
    max: 3650,
    runtimeApplied: false,
  },
  "files.maxUploadSizeMb": {
    key: "files.maxUploadSizeMb",
    label: "Upload maximo",
    description: "Tamanho maximo permitido por arquivo em MB.",
    category: "files",
    valueType: "number",
    defaultValue: 25,
    min: 1,
    max: 1024,
    runtimeApplied: false,
  },
  "files.allowedMimeTypes": {
    key: "files.allowedMimeTypes",
    label: "Tipos permitidos",
    description: "Lista separada por virgulas. Vazio permite a politica atual.",
    category: "files",
    valueType: "string",
    defaultValue: "",
    max: 1000,
    runtimeApplied: false,
  },
  "files.storageMode": {
    key: "files.storageMode",
    label: "Armazenamento",
    description: "Destino operacional previsto para arquivos enviados.",
    category: "files",
    valueType: "string",
    defaultValue: "local",
    options: ["local", "s3"],
    runtimeApplied: false,
  },
  "maintenance.readOnlyMode": {
    key: "maintenance.readOnlyMode",
    label: "Modo somente leitura",
    description:
      "Bloqueio planejado para operacoes de escrita durante manutencao.",
    category: "maintenance",
    valueType: "boolean",
    defaultValue: false,
    runtimeApplied: false,
  },
  "maintenance.bannerEnabled": {
    key: "maintenance.bannerEnabled",
    label: "Banner de manutencao",
    description: "Exibe um aviso global quando a interface suportar banner.",
    category: "maintenance",
    valueType: "boolean",
    defaultValue: false,
    runtimeApplied: false,
  },
  "maintenance.bannerText": {
    key: "maintenance.bannerText",
    label: "Texto do banner",
    description: "Mensagem curta para avisos administrativos globais.",
    category: "maintenance",
    valueType: "string",
    defaultValue: "",
    max: 240,
    runtimeApplied: false,
  },
} as const satisfies Record<string, SettingDefinition>;

export type RuntimeSettingKey = keyof typeof RUNTIME_SETTING_DEFINITIONS;
type RuntimeSettingValue<TKey extends RuntimeSettingKey> =
  (typeof RUNTIME_SETTING_DEFINITIONS)[TKey]["defaultValue"];

export const RUNTIME_SETTING_CATEGORIES = [
  { key: "general", label: "Geral" },
  { key: "branding", label: "Identidade visual" },
  { key: "email", label: "SMTP e e-mail" },
  { key: "notifications", label: "Notificacoes" },
  { key: "users", label: "Usuarios e cadastro" },
  { key: "workspaces", label: "Workspaces" },
  { key: "projects", label: "Projetos e tarefas" },
  { key: "calendar", label: "Agenda" },
  { key: "security", label: "Seguranca" },
  { key: "files", label: "Arquivos" },
  { key: "maintenance", label: "Manutencao" },
] as const;

let settingsCache: Map<string, string> | null = null;

function isRuntimeSettingKey(key: string): key is RuntimeSettingKey {
  return key in RUNTIME_SETTING_DEFINITIONS;
}

function getSettingDefinition(key: RuntimeSettingKey): SettingDefinition {
  return RUNTIME_SETTING_DEFINITIONS[key] as SettingDefinition;
}

function serializeSettingValue(
  value: SettingValue,
  valueType: SettingValueType,
) {
  if (valueType === "boolean") return value ? "true" : "false";
  return String(value);
}

function parseStoredValue(
  value: string | undefined,
  definition: SettingDefinition,
) {
  if (value === undefined) return definition.defaultValue;

  if (definition.isSecret) {
    return decryptSettingSecret(value);
  }

  if (definition.valueType === "boolean") {
    return value === "true";
  }

  if (definition.valueType === "number") {
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue : definition.defaultValue;
  }

  return value;
}

function normalizeSettingValue(
  definition: SettingDefinition,
  value: unknown,
): SettingValue {
  let normalized: SettingValue;

  if (definition.valueType === "boolean") {
    if (typeof value !== "boolean") {
      throw new Error(`${definition.label} must be a boolean.`);
    }
    normalized = value;
  } else if (definition.valueType === "number") {
    const numberValue = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(numberValue)) {
      throw new Error(`${definition.label} must be a valid number.`);
    }
    normalized = numberValue;
  } else {
    if (typeof value !== "string") {
      throw new Error(`${definition.label} must be a string.`);
    }
    normalized = definition.isSecret ? value : value.trim();
  }

  if (definition.options?.length && !definition.options.includes(normalized)) {
    throw new Error(`${definition.label} has an invalid option.`);
  }

  if (
    typeof normalized === "string" &&
    definition.min !== undefined &&
    normalized.length < definition.min
  ) {
    throw new Error(`${definition.label} is too short.`);
  }

  if (
    typeof normalized === "string" &&
    definition.max !== undefined &&
    normalized.length > definition.max
  ) {
    throw new Error(`${definition.label} is too long.`);
  }

  if (
    typeof normalized === "number" &&
    definition.min !== undefined &&
    normalized < definition.min
  ) {
    throw new Error(`${definition.label} is below the minimum value.`);
  }

  if (
    typeof normalized === "number" &&
    definition.max !== undefined &&
    normalized > definition.max
  ) {
    throw new Error(`${definition.label} is above the maximum value.`);
  }

  return normalized;
}

async function loadSettingsCache() {
  if (settingsCache) return settingsCache;

  const keys = Object.keys(RUNTIME_SETTING_DEFINITIONS);
  const rows = await db
    .select({
      key: schema.systemSettingTable.key,
      value: schema.systemSettingTable.value,
    })
    .from(schema.systemSettingTable)
    .where(inArray(schema.systemSettingTable.key, keys));

  settingsCache = new Map(rows.map((row) => [row.key, row.value]));
  return settingsCache;
}

export function invalidateRuntimeSettingsCache() {
  settingsCache = null;
}

export async function getRuntimeSetting<TKey extends RuntimeSettingKey>(
  key: TKey,
): Promise<RuntimeSettingValue<TKey>> {
  const definition = getSettingDefinition(key);
  const cache = await loadSettingsCache();

  return parseStoredValue(
    cache.get(key),
    definition,
  ) as RuntimeSettingValue<TKey>;
}

export async function listRuntimeSettings() {
  const cache = await loadSettingsCache();

  return (
    Object.values(RUNTIME_SETTING_DEFINITIONS) as SettingDefinition[]
  ).map((definition) => {
    const storedValue = cache.get(definition.key);
    const value = definition.isSecret
      ? storedValue || definition.defaultValue
        ? SECRET_CONFIGURED_VALUE
        : ""
      : parseStoredValue(storedValue, definition);
    const defaultValue = definition.isSecret
      ? definition.defaultValue
        ? SECRET_CONFIGURED_VALUE
        : ""
      : definition.defaultValue;

    return {
      key: definition.key,
      label: definition.label,
      description: definition.description,
      category: definition.category,
      valueType: definition.valueType,
      value,
      defaultValue,
      options: definition.options ?? [],
      isSecret: Boolean(definition.isSecret),
      runtimeApplied: definition.runtimeApplied,
      isDefault: storedValue === undefined,
    };
  });
}

export async function updateRuntimeSettings(
  updates: Array<{ key: string; value: unknown }>,
  updatedByUserId: string,
) {
  const now = new Date();
  const rows = updates.flatMap((update) => {
    if (!isRuntimeSettingKey(update.key)) {
      throw new Error(`Unknown setting: ${update.key}`);
    }

    const definition = getSettingDefinition(update.key);

    if (
      definition.isSecret &&
      (update.value === "" || update.value === SECRET_UNCHANGED_VALUE)
    ) {
      return [];
    }

    const value = normalizeSettingValue(definition, update.value);
    const serializedValue = serializeSettingValue(value, definition.valueType);

    return [
      {
        id: createId(),
        key: update.key,
        value: definition.isSecret
          ? encryptSettingSecret(serializedValue)
          : serializedValue,
        valueType: definition.valueType,
        category: definition.category,
        isSecret: Boolean(definition.isSecret),
        updatedByUserId,
        createdAt: now,
        updatedAt: now,
      },
    ];
  });

  if (!rows.length) return;

  await db.transaction(async (tx) => {
    for (const row of rows) {
      await tx
        .insert(schema.systemSettingTable)
        .values(row)
        .onConflictDoUpdate({
          target: schema.systemSettingTable.key,
          set: {
            value: row.value,
            valueType: row.valueType,
            category: row.category,
            isSecret: row.isSecret,
            updatedByUserId,
            updatedAt: now,
          },
        });
    }
  });

  invalidateRuntimeSettingsCache();
}
