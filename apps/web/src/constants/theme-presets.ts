/**
 * Tema de exemplo com as cores do template Qerza (Jobie). Só entram valores
 * conferidos no CSS do template; o restante segue o padrão do sistema.
 */
export const qerzaTheme = {
  schema: 1 as const,
  name: "Qerza",
  description:
    "Roxo #8743DF do template Qerza, com sidebar escura no modo escuro.",
  fonts: { sans: "Roboto, ui-sans-serif, system-ui, sans-serif" },
  light: {
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
  radius: "0.625rem",
  fonts: { sans: "Inter, ui-sans-serif, system-ui, sans-serif" },
  light: { primary: "#1d4ed8", primaryForeground: "#ffffff" },
  dark: { primary: "#60a5fa", primaryForeground: "#0b1220" },
};
