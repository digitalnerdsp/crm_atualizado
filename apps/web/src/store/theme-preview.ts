import { create } from "zustand";

/** CSS de um tema em pré-visualização (não salvo). */
type ThemePreviewState = {
  name: string | null;
  css: string | null;
  layout: string;
  start: (name: string, css: string, layout?: string) => void;
  stop: () => void;
};
export const useThemePreviewStore = create<ThemePreviewState>((set) => ({
  name: null,
  css: null,
  layout: "default",
  start: (name, css, layout = "default") => set({ name, css, layout }),
  stop: () => set({ name: null, css: null, layout: "default" }),
}));
