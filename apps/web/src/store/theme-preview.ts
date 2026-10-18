import { create } from "zustand";

/** CSS de um tema em pré-visualização (não salvo). */
type ThemePreviewState = {
  name: string | null;
  css: string | null;
  start: (name: string, css: string) => void;
  stop: () => void;
};
export const useThemePreviewStore = create<ThemePreviewState>((set) => ({
  name: null,
  css: null,
  start: (name, css) => set({ name, css }),
  stop: () => set({ name: null, css: null }),
}));
