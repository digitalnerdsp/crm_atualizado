import * as v from "valibot";
import type { ThemeColors, ThemeTokens } from "../database/schema";

/**
 * Pacote de tema: um JSON com cores por modo, raio, fontes e nome.
 * Tudo o que entra aqui vira variável CSS; por isso cada valor é validado
 * por expressão estrita (sem `;`, `}`, `url(`, `@import`).
 */
export const THEME_COLOR_KEYS = [
  "background",
  "foreground",
  "card",
  "cardForeground",
  "popover",
  "popoverForeground",
  "primary",
  "primaryForeground",
  "secondary",
  "secondaryForeground",
  "muted",
  "mutedForeground",
  "accent",
  "accentForeground",
  "border",
  "input",
  "ring",
  "destructive",
  "success",
  "warning",
  "info",
  "sidebar",
  "sidebarForeground",
  "sidebarPrimary",
  "sidebarPrimaryForeground",
  "sidebarAccent",
  "sidebarAccentForeground",
  "sidebarBorder",
] as const;
export type ThemeColorKey = (typeof THEME_COLOR_KEYS)[number];
export const MAX_THEMES_PER_WORKSPACE = 20;
export const MAX_PACKAGE_BYTES = 20_000;

const HEX = /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const FUNC =
  /^(?:rgb|rgba|hsl|hsla)\(\s*[0-9.]+(?:deg)?\s*[, ]\s*[0-9.]+%?\s*[, ]\s*[0-9.]+%?\s*(?:[,/]\s*[0-9.]+%?\s*)?\)$/;
export const isSafeColor = (value: string) =>
  HEX.test(value) || FUNC.test(value);
const RADIUS = /^(?:\d{1,2}(?:\.\d{1,3})?|\.\d{1,3})(?:rem|px)$/;
export const isSafeRadius = (value: string) => {
  if (!RADIUS.test(value)) return false;
  const n = Number.parseFloat(value);
  return value.endsWith("px") ? n <= 32 : n <= 2;
};
// Nomes de família, aspas e vírgulas; nada que feche a declaração.
const FONT = /^[A-Za-z0-9 ,'"_-]{1,200}$/;

const color = v.pipe(
  v.string(),
  v.trim(),
  v.check(
    isSafeColor,
    "Cor inválida. Use #hex, rgb(), rgba(), hsl() ou hsla().",
  ),
);
// strictObject: uma chave desconhecida (erro de digitação) é recusada.
const palette = v.strictObject(
  Object.fromEntries(
    THEME_COLOR_KEYS.map((k) => [k, v.optional(color)]),
  ) as Record<ThemeColorKey, v.OptionalSchema<typeof color, undefined>>,
);
const font = v.pipe(
  v.string(),
  v.trim(),
  v.check((s) => FONT.test(s), "Fonte inválida. Use somente nomes de família."),
);
export const themePackageSchema = v.object({
  schema: v.literal(1),
  name: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(80)),
  description: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(300)), ""),
  radius: v.optional(
    v.pipe(v.string(), v.trim(), v.check(isSafeRadius, "Raio inválido.")),
  ),
  fonts: v.optional(
    v.object({ sans: v.optional(font), heading: v.optional(font) }),
    {},
  ),
  light: v.optional(palette, {}),
  dark: v.optional(palette, {}),
});
export type ThemePackage = v.InferOutput<typeof themePackageSchema>;

export function toTokens(pkg: ThemePackage): ThemeTokens {
  const clean = (p: ThemeColors): ThemeColors =>
    Object.fromEntries(
      Object.entries(p).filter(
        (e): e is [string, string] => typeof e[1] === "string",
      ),
    );
  return {
    radius: pkg.radius ?? null,
    fontSans: pkg.fonts?.sans ?? null,
    fontHeading: pkg.fonts?.heading ?? null,
    light: clean(pkg.light ?? {}),
    dark: clean(pkg.dark ?? {}),
  };
}
const kebab = (k: string) => k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
/** CSS do tema; só chaves conhecidas e valores já validados. */
export function themeCss(t: ThemeTokens) {
  const known = new Set<string>(THEME_COLOR_KEYS);
  const block = (c: ThemeColors) =>
    Object.entries(c)
      .filter(([k, val]) => known.has(k) && val && isSafeColor(val))
      .map(([k, val]) => `--${kebab(k)}:${val};`)
      .join("");
  const shared = [
    t.radius && isSafeRadius(t.radius) ? `--radius:${t.radius};` : "",
    t.fontSans && FONT.test(t.fontSans) ? `--font-sans:${t.fontSans};` : "",
    t.fontHeading && FONT.test(t.fontHeading)
      ? `--font-heading:${t.fontHeading};`
      : "",
  ].join("");
  // `:not(.dark)` evita que a cor do modo claro vaze para o escuro.
  return `:root{${shared}}:root:not(.dark){${block(t.light)}}.dark{${block(t.dark)}}`;
}
