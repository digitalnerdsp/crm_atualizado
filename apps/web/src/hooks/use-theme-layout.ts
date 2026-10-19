import useAuth from "@/components/providers/auth-provider/hooks/use-auth";
import { useActiveWorkspaceTheme } from "@/hooks/queries/theme/use-workspace-theme";
import { authClient } from "@/lib/auth-client";
import { useThemePreviewStore } from "@/store/theme-preview";

/** Layout em vigor: o da pré-visualização, senão o do tema ativo do workspace. */
export function useThemeLayout(): "default" | "qerza" {
  const { user } = useAuth();
  const { data: organization } = authClient.useActiveOrganization();
  const workspaceId = user ? organization?.id : undefined;
  const { data } = useActiveWorkspaceTheme(workspaceId);
  const previewCss = useThemePreviewStore((s) => s.css);
  const previewLayout = useThemePreviewStore((s) => s.layout);
  const layout = previewCss
    ? previewLayout
    : workspaceId
      ? data?.theme?.layout
      : undefined;
  return layout === "qerza" ? "qerza" : "default";
}
