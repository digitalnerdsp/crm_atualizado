import enUS from "../../../../i18n/en-US.json";
import ptBR from "../../../../i18n/pt-BR.json";

const messages = {
  en: enUS.invitations.email,
  pt: ptBR.invitations.email,
} as const;

export function getWorkspaceInvitationEmailCopy(locale?: string | null) {
  const normalizedLocale = locale?.toLowerCase();

  if (normalizedLocale?.startsWith("pt")) return messages.pt;

  return messages.en;
}
