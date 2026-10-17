import { createFileRoute } from "@tanstack/react-router";
import { UserPlus } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import WorkspaceLayout from "@/components/common/workspace-layout";
import PageTitle from "@/components/page-title";
import InviteTeamMemberModal from "@/components/team/invite-team-member-modal";
import MembersTable from "@/components/team/members-table";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import useGetFullWorkspace from "@/hooks/queries/workspace/use-get-full-workspace";
import { useWorkspaceMembers } from "@/hooks/queries/workspace/use-workspace-members";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/workspace/$workspaceId/members",
)({
  component: RouteComponent,
});

function RouteComponent() {
  const { t } = useTranslation();
  const { workspaceId } = Route.useParams();
  const { canInviteUsers, canViewWorkspace, isCheckingPermissions } =
    useWorkspacePermission();
  const canView = canViewWorkspace();
  const { data: workspace } = useGetFullWorkspace({
    workspaceId,
    enabled: canView,
  });
  const { data: workspaceMembers = [] } = useWorkspaceMembers(
    canView ? workspaceId : undefined,
  );
  const canInvite = Boolean(canInviteUsers());
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const lastAccessByUserId = Object.fromEntries(
    workspaceMembers.map((member) => [member.id, member.lastAccessAt]),
  );

  if (!isCheckingPermissions && !canView) {
    return (
      <>
        <PageTitle title={t("team:members.pageTitle")} />
        <WorkspaceLayout title={t("team:members.pageTitle")}>
          <Empty className="min-h-[60vh]">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <UserPlus />
              </EmptyMedia>
              <EmptyTitle>Acesso restrito</EmptyTitle>
              <EmptyDescription>
                Sua role atual não tem permissão para visualizar membros deste
                workspace.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </WorkspaceLayout>
      </>
    );
  }

  return (
    <>
      <PageTitle title={t("team:members.pageTitle")} />
      <WorkspaceLayout
        title={t("team:members.pageTitle")}
        headerActions={
          canInvite ? (
            <Button
              variant="outline"
              size="xs"
              onClick={() => setIsInviteOpen(true)}
              className="gap-1"
            >
              <UserPlus className="w-3 h-3" />
              {t("team:members.inviteMember")}
            </Button>
          ) : null
        }
      >
        <MembersTable
          workspaceId={workspaceId}
          users={workspace?.members ?? []}
          invitations={workspace?.invitations ?? []}
          lastAccessByUserId={lastAccessByUserId}
        />

        <InviteTeamMemberModal
          open={isInviteOpen}
          onClose={() => setIsInviteOpen(false)}
        />
      </WorkspaceLayout>
    </>
  );
}
