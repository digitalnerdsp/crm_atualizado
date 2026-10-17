import enUS from "./en-US.json";
import ptBR from "./pt-BR.json";

export const supportedLocales = ["pt-BR", "en-US"] as const;

export type AppLocale = (typeof supportedLocales)[number];

export const defaultLocale: AppLocale = "pt-BR";

export const resources = {
  "pt-BR": ptBR,
  "en-US": enUS,
} as const;
