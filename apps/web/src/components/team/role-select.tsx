import { useTranslation } from "react-i18next";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  buildRoleOptions,
  capitalizeRole,
  roleHintKey,
  roleLabelKey,
} from "@/constants/workspace-roles";
import useWorkspaceRoles from "@/hooks/queries/workspace/use-workspace-roles";

/**
 * Escolher o papel é escolher o que a pessoa enxerga, então cada opção diz o
 * que dá acesso. Sem isso, "member" e "sales" são duas palavras e ninguém
 * sabe qual delas deixa o vendedor ver o funil dos outros.
 *
 * Lista os papéis semeados do workspace e, na cauda, os personalizados que a
 * equipe criou nas configurações.
 */
export function RoleSelect({
  workspaceId,
  value,
  onChange,
  disabled,
  id,
  size,
  className,
}: {
  workspaceId: string | undefined;
  value: string;
  onChange: (role: string) => void;
  disabled?: boolean;
  id?: string;
  size?: "sm" | "default" | "lg";
  className?: string;
}) {
  const { t } = useTranslation();
  const { data: workspaceRoles = [] } = useWorkspaceRoles(workspaceId);

  const options = buildRoleOptions(workspaceRoles);

  const label = (role: string) =>
    t(roleLabelKey(role), { defaultValue: capitalizeRole(role) });

  return (
    <Select
      value={value}
      disabled={disabled}
      onValueChange={(next) => {
        if (typeof next === "string" && next) onChange(next);
      }}
    >
      <SelectTrigger id={id} size={size} className={className}>
        <SelectValue>{label(value)}</SelectValue>
      </SelectTrigger>
      <SelectContent className="max-w-80">
        {options.map((option) => (
          <SelectItem
            key={option.value}
            value={option.value}
            className="items-start"
          >
            {/* Largura fixa e quebra de linha: a descrição é mais longa que o
                gatilho, e o popup segue a largura dele — sem isto o texto sai
                cortado na lateral. */}
            <span className="flex w-64 flex-col gap-0.5 py-0.5 whitespace-normal">
              <span>
                {option.isDefault
                  ? label(option.value)
                  : capitalizeRole(option.value)}
              </span>
              <span className="text-xs leading-snug text-muted-foreground">
                {option.isDefault
                  ? t(roleHintKey(option.value))
                  : t("team:customRole")}
              </span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export default RoleSelect;
