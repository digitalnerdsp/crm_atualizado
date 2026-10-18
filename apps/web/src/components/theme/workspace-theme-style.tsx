import { useEffect } from "react";
import useAuth from "@/components/providers/auth-provider/hooks/use-auth";
import { useActiveWorkspaceTheme } from "@/hooks/queries/theme/use-workspace-theme";
import { authClient } from "@/lib/auth-client";
import { useThemePreviewStore } from "@/store/theme-preview";

const STYLE_ID = "workspace-theme";
/**
 * Aplica o tema do workspace ativo (ou a prévia em andamento).
 * O CSS vem do servidor já filtrado: só variáveis de cor, raio e fonte.
 */
export function WorkspaceThemeStyle() {
  const { user } = useAuth();
  const { data: organization } = authClient.useActiveOrganization();
  const workspaceId = user ? organization?.id : undefined;
  const { data } = useActiveWorkspaceTheme(workspaceId);
  const preview = useThemePreviewStore((s) => s.css);
  const css = preview ?? (workspaceId ? (data?.theme?.css ?? null) : null);

  useEffect(() => {
    let el = document.getElementById(STYLE_ID);
    if (!css) {
      el?.remove();
      return;
    }
    if (!el) {
      el = document.createElement("style");
      el.id = STYLE_ID;
      document.head.appendChild(el);
    }
    el.textContent = css;
    return () => {
      document.getElementById(STYLE_ID)?.remove();
    };
  }, [css]);
  return null;
}
