import { createAccessControl } from "better-auth/plugins/access";
import {
  adminAc,
  defaultStatements,
  memberAc,
  ownerAc,
} from "better-auth/plugins/organization/access";

export const statement = {
  ...defaultStatements,
  project: ["create", "read", "update", "delete", "share"],
  task: ["create", "read", "update", "delete", "assign"],
  label: ["create", "read", "update", "delete"],
  calendar: ["create", "read", "update", "delete"],
  dashboard: ["read"],
  finance: [
    "read",
    "create",
    "update",
    "settle",
    "export",
    "manage",
    "reverse",
    "cancel",
  ],
  portfolio: ["update", "notify", "costs", "draft", "approve"],
  // Hospedagem de terceiros: `notify` configura o aviso interno de renovação.
  hosting: ["read", "update", "notify"],
  template: ["read", "use", "manage"],
  workspace: ["read", "update", "delete", "manage_settings"],
  // CRM. `read` = apenas os registros de que sou dono; `read_all` = todos os do
  // workspace. É essa distincao que separa vendedor de gestor, e o filtro por
  // dono é aplicado no controller — middleware só consegue negar a rota
  // inteira, não filtrar linhas.
  crmDeal: [
    "create",
    "read",
    "read_all",
    "update",
    "delete",
    "assign",
    "change_stage",
  ],
  // `export` é separado de `read` de propósito: exportar a base de contatos é a
  // acao de maior risco de LGPD do módulo.
  crmContact: ["create", "read", "read_all", "update", "delete", "export"],
  crmCompany: ["create", "read", "read_all", "update", "delete", "notify"],
  crmPipeline: ["read", "manage"],
  crmField: ["manage"],
  crmReport: ["read", "read_all"],
} as const;

export const ac = createAccessControl(statement);

export const viewer = ac.newRole({
  ...memberAc.statements,
  project: ["read"],
  task: ["read"],
  label: ["read"],
  calendar: ["read"],
  workspace: ["read"],
});

export const member = ac.newRole({
  ...memberAc.statements,
  project: ["create", "read"],
  task: ["create", "read", "update"],
  label: ["create", "read", "update", "delete"],
  calendar: ["create", "read", "update", "delete"],
  workspace: ["read"],
  // Sem escrita: quem trabalha comercial recebe o papel `sales`.
  crmDeal: ["read"],
  crmContact: ["read"],
  crmCompany: ["read"],
});

export const admin = ac.newRole({
  ...adminAc.statements,
  project: ["create", "read", "update", "delete", "share"],
  task: ["create", "read", "update", "delete", "assign"],
  label: ["create", "read", "update", "delete"],
  calendar: ["create", "read", "update", "delete"],
  dashboard: ["read"],
  finance: [
    "read",
    "create",
    "update",
    "settle",
    "export",
    "manage",
    "reverse",
    "cancel",
  ],
  portfolio: ["update", "notify", "costs", "draft", "approve"],
  hosting: ["read", "update", "notify"],
  template: ["read", "use", "manage"],
  workspace: ["read", "update", "manage_settings"],
  crmDeal: [
    "create",
    "read",
    "read_all",
    "update",
    "delete",
    "assign",
    "change_stage",
  ],
  crmContact: ["create", "read", "read_all", "update", "delete", "export"],
  crmCompany: ["create", "read", "read_all", "update", "delete", "notify"],
  crmPipeline: ["read", "manage"],
  crmField: ["manage"],
  crmReport: ["read", "read_all"],
});

export const owner = ac.newRole({
  ...ownerAc.statements,
  project: ["create", "read", "update", "delete", "share"],
  task: ["create", "read", "update", "delete", "assign"],
  label: ["create", "read", "update", "delete"],
  calendar: ["create", "read", "update", "delete"],
  dashboard: ["read"],
  finance: [
    "read",
    "create",
    "update",
    "settle",
    "export",
    "manage",
    "reverse",
    "cancel",
  ],
  portfolio: ["update", "notify", "costs", "draft", "approve"],
  hosting: ["read", "update", "notify"],
  template: ["read", "use", "manage"],
  workspace: ["read", "update", "delete", "manage_settings"],
  crmDeal: [
    "create",
    "read",
    "read_all",
    "update",
    "delete",
    "assign",
    "change_stage",
  ],
  crmContact: ["create", "read", "read_all", "update", "delete", "export"],
  crmCompany: ["create", "read", "read_all", "update", "delete", "notify"],
  crmPipeline: ["read", "manage"],
  crmField: ["manage"],
  crmReport: ["read", "read_all"],
});

// Vendedor: trabalha o próprio funil. Sem `read_all` — enxerga apenas os
// negócios, contatos e empresas de que é dono.
export const sales = ac.newRole({
  ...memberAc.statements,
  project: ["read"],
  task: ["read"],
  calendar: ["create", "read", "update", "delete"],
  workspace: ["read"],
  hosting: ["read", "update"],
  crmDeal: ["create", "read", "update", "change_stage"],
  crmContact: ["create", "read", "update"],
  crmCompany: ["create", "read", "update", "notify"],
  crmPipeline: ["read"],
  crmReport: ["read"],
});

// Gestor comercial: enxerga e redistribui o funil do time inteiro, e configura
// funis, etapas e campos.
export const salesManager = ac.newRole({
  ...adminAc.statements,
  project: ["create", "read"],
  task: ["create", "read", "update"],
  calendar: ["create", "read", "update", "delete"],
  dashboard: ["read"],
  workspace: ["read"],
  hosting: ["read", "update", "notify"],
  crmDeal: [
    "create",
    "read",
    "read_all",
    "update",
    "delete",
    "assign",
    "change_stage",
  ],
  crmContact: ["create", "read", "read_all", "update", "delete", "export"],
  crmCompany: ["create", "read", "read_all", "update", "delete", "notify"],
  crmPipeline: ["read", "manage"],
  crmField: ["manage"],
  crmReport: ["read", "read_all"],
});

export const financeLegal = ac.newRole({
  finance: ["read", "create", "update", "settle", "export"],
  portfolio: ["update", "notify", "costs", "draft"],
  hosting: ["read", "update", "notify"],
  crmDeal: ["read", "read_all"],
  crmPipeline: ["read"],
  crmCompany: ["read", "read_all", "update", "notify"],
  crmContact: ["read", "read_all", "update"],
  crmReport: ["read", "read_all"],
});
export const builtInRoles = {
  viewer,
  member,
  admin,
  owner,
  sales,
  sales_manager: salesManager,
  finance_legal: financeLegal,
} as const;

export type BuiltInRoleName = keyof typeof builtInRoles;

// Default-role names that the API seeds per workspace. These ARE editable in
// the UI (their permissions live as rows in `workspace_role`), but their names
// are reserved and the rows are auto-created on workspace creation /
// backfilled at boot. `owner` is intentionally NOT in this list because it
// stays a true static role on the better-auth side.
export const DEFAULT_ROLE_NAMES = [
  "viewer",
  "member",
  "admin",
  "sales",
  "sales_manager",
  "finance_legal",
] as const;
export type DefaultRoleName = (typeof DEFAULT_ROLE_NAMES)[number];

function toMutablePayload(
  statements: Record<string, readonly string[]>,
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [resource, actions] of Object.entries(statements)) {
    out[resource] = [...actions];
  }
  return out;
}

// Plain JSON-serializable permission payloads for the seeded default roles.
// Mirrors each role's `.statements` (including better-auth's organization/
// member/team/invitation/ac defaults) so a workspace_role row that uses one
// of these has parity with the prior static definition.
export const defaultRolePayloads: Record<
  DefaultRoleName,
  Record<string, string[]>
> = {
  viewer: toMutablePayload(viewer.statements),
  member: toMutablePayload(member.statements),
  admin: toMutablePayload(admin.statements),
  sales: toMutablePayload(sales.statements),
  sales_manager: toMutablePayload(salesManager.statements),
  finance_legal: toMutablePayload(financeLegal.statements),
};
