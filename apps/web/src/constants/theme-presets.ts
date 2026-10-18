/**
 * Tema de exemplo com as cores do template Qerza (Jobie). Só entram valores
 * conferidos no CSS do template; o restante segue o padrão do sistema.
 */
export const qerzaTheme = {
  schema: 1 as const,
  name: "Qerza",
  description:
    "Cores e formato do template Qerza: menu claro com ícones em blocos, conteúdo cinza-claro, cards arredondados e roxo #8743DF.",
  layout: "qerza" as "default" | "qerza",
  radius: "0.875rem",
  fonts: { sans: "Roboto, ui-sans-serif, system-ui, sans-serif" },
  light: {
    background: "#f7f7f7",
    card: "#ffffff",
    popover: "#ffffff",
    sidebar: "#ffffff",
    sidebarAccent: "#f7f7f7",
    muted: "#eeeeee",
    mutedForeground: "#6b6b7a",
    border: "#e8e8ef",
    primary: "#8743DF",
    primaryForeground: "#ffffff",
    ring: "#8743DF",
    sidebarPrimary: "#8743DF",
    sidebarPrimaryForeground: "#ffffff",
    destructive: "#EE3232",
    success: "#297F00",
    warning: "#ff9900",
    info: "#3065D0",
  },
  dark: {
    primary: "#8743DF",
    primaryForeground: "#ffffff",
    ring: "#8743DF",
    background: "#171717",
    card: "#202020",
    popover: "#202020",
    sidebar: "#202020",
    sidebarPrimary: "#8743DF",
    sidebarPrimaryForeground: "#ffffff",
    mutedForeground: "#828690",
    destructive: "#EE3232",
    info: "#3065D0",
  },
};
export const themeTemplate = {
  schema: 1 as const,
  name: "Meu tema",
  description: "Preencha só o que quiser mudar; o resto segue o padrão.",
  layout: "default" as "default" | "qerza",
  radius: "0.625rem",
  fonts: { sans: "Inter, ui-sans-serif, system-ui, sans-serif" },
  light: { primary: "#1d4ed8", primaryForeground: "#ffffff" },
  dark: { primary: "#60a5fa", primaryForeground: "#0b1220" },
};
