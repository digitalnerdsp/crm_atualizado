import { createFileRoute } from "@tanstack/react-router";
import WorkspaceLayout from "@/components/common/workspace-layout";
import { SellerPanelView } from "@/components/crm/seller-panel";
import PageTitle from "@/components/page-title";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/workspace/$workspaceId/crm/dashboard",
)({ component: MyPanel });

function MyPanel() {
  const { workspaceId } = Route.useParams();
  const { canViewCrm, isCheckingPermissions } = useWorkspacePermission();
  return (
    <WorkspaceLayout title="Meu painel">
      <PageTitle title="Meu painel" />
      {isCheckingPermissions ? (
        <p className="p-6 text-sm text-muted-foreground">Carregando acesso…</p>
      ) : canViewCrm() ? (
        <SellerPanelView workspaceId={workspaceId} />
      ) : (
        <p className="p-6 text-sm text-muted-foreground">
          Você não tem acesso ao comercial.
        </p>
      )}
    </WorkspaceLayout>
  );
}
