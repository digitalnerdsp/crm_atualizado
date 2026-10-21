/**
 * Os papéis semeados em todo workspace, na ordem em que fazem sentido escolher:
 * do mais amplo ao mais restrito.
 *
 * `owner` fica de fora da lista de atribuição comum — transferir a propriedade
 * é outro fluxo, e um workspace tem exatamente um dono.
 */
export const ASSIGNABLE_DEFAULT_ROLES = [
  "admin",
  "sales_manager",
  "finance_legal",
  "sales",
  "member",
  "viewer",
] as const;

export type AssignableDefaultRole = (typeof ASSIGNABLE_DEFAULT_ROLES)[number];

/** Nomes reservados: já aparecem como padrão e não devem repetir na cauda de
 * papéis personalizados. */
export const RESERVED_ROLE_NAMES = new Set<string>([
  ...ASSIGNABLE_DEFAULT_ROLES,
  "owner",
]);

export function roleLabelKey(role: string) {
  return `team:roles.${role}`;
}

export function roleHintKey(role: string) {
  return `team:roleHints.${role}`;
}

export function capitalizeRole(value: string) {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export type RoleOption = {
  value: string;
  /** Papel semeado tem rótulo e descrição traduzidos; personalizado só o nome. */
  isDefault: boolean;
};

/**
 * A lista que o seletor mostra: os semeados na ordem do mais amplo ao mais
 * restrito, e depois os que a equipe criou. A API devolve as duas coisas na
 * mesma lista, então sem o filtro os semeados apareceriam duas vezes.
 */
export function buildRoleOptions(
  workspaceRoles: ReadonlyArray<{ role: string }>,
): RoleOption[] {
  const custom = workspaceRoles
    .map((role) => role.role)
    .filter((role) => !RESERVED_ROLE_NAMES.has(role));

  return [
    ...ASSIGNABLE_DEFAULT_ROLES.map((value) => ({ value, isDefault: true })),
    ...[...new Set(custom)].map((value) => ({ value, isDefault: false })),
  ];
}
