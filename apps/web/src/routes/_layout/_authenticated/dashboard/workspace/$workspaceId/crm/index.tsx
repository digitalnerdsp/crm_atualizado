import { createFileRoute } from "@tanstack/react-router";
import { Handshake, Plus, Search } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import WorkspaceLayout from "@/components/common/workspace-layout";
import CreateDealModal from "@/components/crm/create-deal-modal";
import PipelineBoard from "@/components/crm/pipeline-board";
import PageTitle from "@/components/page-title";
import useAuth from "@/components/providers/auth-provider/hooks/use-auth";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useCrmBoard } from "@/hooks/queries/crm/use-crm-board";
import { useCrmPipelineSocket } from "@/hooks/use-crm-pipeline-socket";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/workspace/$workspaceId/crm/",
)({
  component: RouteComponent,
});

function RouteComponent() {
  const { t } = useTranslation();
  const { workspaceId } = Route.useParams();
  const { user } = useAuth();
  const { canCreateDeals, canChangeDealStage, canViewAllDeals } =
    useWorkspacePermission();

  const [search, setSearch] = useState("");
  const [pipelineId, setPipelineId] = useState<string | undefined>();
  const [onlyMine, setOnlyMine] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const { data: board, isLoading } = useCrmBoard({
    workspaceId,
    pipelineId,
    search: search.trim() || undefined,
    ownerUserId: onlyMine ? (user?.id ?? undefined) : undefined,
  });

  // Two reps working the same funnel would otherwise overwrite each other's
  // view until a manual refresh.
  useCrmPipelineSocket(board?.pipeline.id);

  const headerActions = (
    <>
      {board && board.pipelines.length > 1 ? (
        <Select
          value={board.pipeline.id}
          onValueChange={(value) => {
            if (typeof value === "string") setPipelineId(value);
          }}
        >
          <SelectTrigger size="sm" className="h-8 w-44">
            <SelectValue>{board.pipeline.name}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {board.pipelines.map((pipeline) => (
              <SelectItem key={pipeline.id} value={pipeline.id}>
                {pipeline.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}

      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t("crm:board.searchPlaceholder")}
          className="h-8 w-48 pl-8"
        />
      </div>

      {canViewAllDeals() ? (
        <Button
          variant={onlyMine ? "secondary" : "outline"}
          size="sm"
          className="h-8"
          onClick={() => setOnlyMine((value) => !value)}
        >
          {onlyMine ? t("crm:board.onlyMine") : t("crm:board.allOwners")}
        </Button>
      ) : null}

      {canCreateDeals() ? (
        <Button size="sm" className="h-8" onClick={() => setIsCreateOpen(true)}>
          <Plus className="size-4" />
          {t("crm:board.newDeal")}
        </Button>
      ) : null}
    </>
  );

  return (
    <WorkspaceLayout
      title={board?.pipeline.name ?? t("crm:board.title")}
      headerActions={headerActions}
    >
      <PageTitle title={t("crm:board.title")} />

      {isLoading ? (
        <div className="flex h-full gap-4 px-5 py-4">
          {[0, 1, 2, 3].map((index) => (
            <Skeleton
              key={`crm-stage-skeleton-${index}`}
              className="h-full w-72 rounded-xl"
            />
          ))}
        </div>
      ) : !board ? (
        <Empty className="h-full">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Handshake className="size-5" />
            </EmptyMedia>
            <EmptyTitle>{t("crm:board.noPipeline")}</EmptyTitle>
            <EmptyDescription>
              {t("crm:board.noPipelineDescription")}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="h-full pt-3">
          <PipelineBoard
            board={board}
            workspaceId={workspaceId}
            disableDragDrop={!canChangeDealStage()}
          />
        </div>
      )}

      {isCreateOpen && board ? (
        <CreateDealModal
          workspaceId={workspaceId}
          pipelineId={board.pipeline.id}
          stages={board.stages}
          onClose={() => setIsCreateOpen(false)}
        />
      ) : null}
    </WorkspaceLayout>
  );
}
