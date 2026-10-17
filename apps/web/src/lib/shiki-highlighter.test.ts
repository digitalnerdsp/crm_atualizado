import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getSharedShikiHighlighter,
  loadShikiLanguage,
} from "./shiki-highlighter";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("shiki highlighter", () => {
  it("starts without loading optional language grammars", async () => {
    const highlighter = await getSharedShikiHighlighter();

    expect(highlighter.getLoadedLanguages()).toEqual([]);
  });

  it("deduplicates concurrent language loads", async () => {
    const highlighter = await getSharedShikiHighlighter();
    const loadLanguage = vi.spyOn(highlighter, "loadLanguage");

    await Promise.all([
      loadShikiLanguage("yaml"),
      loadShikiLanguage("yaml"),
      loadShikiLanguage("yaml"),
    ]);

    expect(loadLanguage).toHaveBeenCalledTimes(1);
    expect(highlighter.getLoadedLanguages()).toContain("yaml");
  });

  it("ignores unsupported languages", async () => {
    const highlighter = await getSharedShikiHighlighter();
    const loadLanguage = vi.spyOn(highlighter, "loadLanguage");

    await loadShikiLanguage("unsupported");

    expect(loadLanguage).not.toHaveBeenCalled();
  });
});
