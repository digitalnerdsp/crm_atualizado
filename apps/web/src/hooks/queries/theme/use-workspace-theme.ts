import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  activateTheme,
  createTheme,
  deleteTheme,
  getActiveTheme,
  listThemes,
  resetTheme,
  type ThemePackageInput,
} from "@/fetchers/theme";

export const themeKeys = {
  active: (workspaceId?: string) => ["theme", "active", workspaceId] as const,
  list: (workspaceId?: string) => ["theme", "list", workspaceId] as const,
};
export function useActiveWorkspaceTheme(workspaceId: string | undefined) {
  return useQuery({
    queryKey: themeKeys.active(workspaceId),
    queryFn: () => getActiveTheme(workspaceId as string),
    enabled: Boolean(workspaceId),
    staleTime: 5 * 60_000,
  });
}
export function useWorkspaceThemes(workspaceId: string | undefined) {
  return useQuery({
    queryKey: themeKeys.list(workspaceId),
    queryFn: () => listThemes(workspaceId as string),
    enabled: Boolean(workspaceId),
  });
}
export function useThemeMutations(workspaceId: string) {
  const qc = useQueryClient();
  const done = () => qc.invalidateQueries({ queryKey: ["theme"] });
  return {
    create: useMutation({
      mutationFn: (json: ThemePackageInput) => createTheme(workspaceId, json),
      onSuccess: done,
    }),
    activate: useMutation({
      mutationFn: (id: string) => activateTheme(workspaceId, id),
      onSuccess: done,
    }),
    reset: useMutation({
      mutationFn: () => resetTheme(workspaceId),
      onSuccess: done,
    }),
    remove: useMutation({
      mutationFn: (id: string) => deleteTheme(workspaceId, id),
      onSuccess: done,
    }),
  };
}
