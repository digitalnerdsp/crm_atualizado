import { createBundledHighlighter, type HighlighterGeneric } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";

export const SHIKI_LANGUAGES = [
  "bash",
  "css",
  "diff",
  "html",
  "json",
  "javascript",
  "markdown",
  "php",
  "text",
  "python",
  "sql",
  "typescript",
  "xml",
  "yaml",
] as const;

type SupportedShikiLanguage = (typeof SHIKI_LANGUAGES)[number];
type SupportedShikiTheme = "github-dark" | "github-light";

export type AppShikiHighlighter = HighlighterGeneric<
  SupportedShikiLanguage,
  SupportedShikiTheme
>;

let shikiHighlighterPromise: Promise<AppShikiHighlighter> | null = null;

const SUPPORTED_SHIKI_LANGUAGES = new Set<string>([...SHIKI_LANGUAGES, "text"]);
const shikiLanguagePromises = new Map<SupportedShikiLanguage, Promise<void>>();

export function isSupportedShikiLanguage(language: string) {
  return SUPPORTED_SHIKI_LANGUAGES.has(language);
}

const createAppHighlighter = createBundledHighlighter<
  SupportedShikiLanguage,
  SupportedShikiTheme
>({
  engine: () => createJavaScriptRegexEngine({ forgiving: true }),
  langs: {
    bash: () => import("shiki/dist/langs/bash.mjs"),
    css: () => import("shiki/dist/langs/css.mjs"),
    diff: () => import("shiki/dist/langs/diff.mjs"),
    html: () => import("shiki/dist/langs/html.mjs"),
    javascript: () => import("shiki/dist/langs/javascript.mjs"),
    json: () => import("shiki/dist/langs/json.mjs"),
    markdown: () => import("shiki/dist/langs/markdown.mjs"),
    php: () => import("shiki/dist/langs/php.mjs"),
    python: () => import("shiki/dist/langs/python.mjs"),
    sql: () => import("shiki/dist/langs/sql.mjs"),
    text: [],
    typescript: () => import("shiki/dist/langs/typescript.mjs"),
    xml: () => import("shiki/dist/langs/xml.mjs"),
    yaml: () => import("shiki/dist/langs/yaml.mjs"),
  },
  themes: {
    "github-dark": () => import("shiki/dist/themes/github-dark.mjs"),
    "github-light": () => import("shiki/dist/themes/github-light.mjs"),
  },
});

export function getSharedShikiHighlighter() {
  if (!shikiHighlighterPromise) {
    shikiHighlighterPromise = createAppHighlighter({
      themes: ["github-dark", "github-light"],
      langs: ["text"],
    });
  }

  return shikiHighlighterPromise;
}

export async function loadShikiLanguage(language: string) {
  if (language === "text" || !isSupportedShikiLanguage(language)) return;

  const supportedLanguage = language as SupportedShikiLanguage;
  let languagePromise = shikiLanguagePromises.get(supportedLanguage);

  if (!languagePromise) {
    languagePromise = getSharedShikiHighlighter()
      .then((highlighter) => highlighter.loadLanguage(supportedLanguage))
      .catch((error) => {
        shikiLanguagePromises.delete(supportedLanguage);
        throw error;
      });
    shikiLanguagePromises.set(supportedLanguage, languagePromise);
  }

  await languagePromise;
}
