import { createFileRoute } from "@tanstack/react-router";
import { Pencil, Plus, Tags } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import PageTitle from "@/components/page-title";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useCreateCrmLostReason,
  useCreateCrmSegment,
  useCreateCrmSource,
  useUpdateCrmLostReason,
  useUpdateCrmSegment,
  useUpdateCrmSource,
} from "@/hooks/mutations/crm/use-crm-taxonomy-mutations";
import { useCrmLostReasons } from "@/hooks/queries/crm/use-crm-lost-reasons";
import {
  useCrmSegments,
  useCrmSources,
} from "@/hooks/queries/crm/use-crm-taxonomy";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import { toast } from "@/lib/toast";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/settings/workspace/crm-lists",
)({
  component: RouteComponent,
});

const CHANNELS = [
  "referral",
  "paid",
  "organic",
  "outbound",
  "event",
  "other",
] as const;

type Channel = (typeof CHANNELS)[number];

const CHANNEL_KEY = {
  referral: "channelReferral",
  paid: "channelPaid",
  organic: "channelOrganic",
  outbound: "channelOutbound",
  event: "channelEvent",
  other: "channelOther",
} as const;

type ListKind = "source" | "segment" | "lostReason";

const NEW_LABEL_KEY = {
  source: "crm:taxonomy.newSource",
  segment: "crm:taxonomy.newSegment",
  lostReason: "crm:taxonomy.newLostReason",
} as const;

type ListRow = {
  id: string;
  name: string;
  isActive: boolean;
  channel?: Channel;
};

function ListSection({
  title,
  description,
  rows,
  canEdit,
  addLabel,
  emptyLabel,
  onAdd,
  onEdit,
  onToggle,
}: {
  title: string;
  description: string;
  rows: ListRow[];
  canEdit: boolean;
  addLabel: string;
  emptyLabel: string;
  onAdd: () => void;
  onEdit: (row: ListRow) => void;
  onToggle: (row: ListRow) => void;
}) {
  const { t } = useTranslation();

  return (
    <Card className="p-0">
      <CardHeader className="flex-row items-start justify-between gap-3 p-4">
        <div className="space-y-1">
          <CardTitle className="text-sm">{title}</CardTitle>
          <CardDescription className="text-xs">{description}</CardDescription>
        </div>
        {canEdit ? (
          <Button size="sm" variant="outline" className="h-8" onClick={onAdd}>
            <Plus className="size-3.5" />
            {addLabel}
          </Button>
        ) : null}
      </CardHeader>

      {rows.length === 0 ? (
        <p className="border-t border-border px-4 py-6 text-center text-xs text-muted-foreground">
          {emptyLabel}
        </p>
      ) : (
        <ul className="border-t border-border">
          {rows.map((row) => (
            <li
              key={row.id}
              className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-2.5 last:border-b-0"
            >
              <div className="flex items-center gap-2">
                <span
                  className={
                    row.isActive ? "text-sm" : "text-sm text-muted-foreground"
                  }
                >
                  {row.name}
                </span>
                {row.channel ? (
                  <Badge variant="outline" size="sm">
                    {t(`crm:taxonomy.${CHANNEL_KEY[row.channel]}`)}
                  </Badge>
                ) : null}
                {row.isActive ? null : (
                  <Badge variant="secondary" size="sm">
                    {t("crm:taxonomy.inactive")}
                  </Badge>
                )}
              </div>

              {canEdit ? (
                <div className="flex items-center gap-1">
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={t("crm:taxonomy.edit")}
                    onClick={() => onEdit(row)}
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs"
                    onClick={() => onToggle(row)}
                  >
                    {t(
                      row.isActive
                        ? "crm:taxonomy.deactivate"
                        : "crm:taxonomy.reactivate",
                    )}
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function RouteComponent() {
  const { t } = useTranslation();
  const { workspace, canManagePipelines } = useWorkspacePermission();
  const workspaceId = workspace?.id ?? "";
  const canEdit = canManagePipelines();

  // Esta é a única tela que pede as desativadas: sem elas, "reativar" não
  // teria de onde partir.
  const { data: sources = [] } = useCrmSources(workspaceId, true);
  const { data: segments = [] } = useCrmSegments(workspaceId, true);
  const { data: lostReasons = [] } = useCrmLostReasons(workspaceId, true);

  const createSource = useCreateCrmSource();
  const updateSource = useUpdateCrmSource();
  const createSegment = useCreateCrmSegment();
  const updateSegment = useUpdateCrmSegment();
  const createLostReason = useCreateCrmLostReason();
  const updateLostReason = useUpdateCrmLostReason();

  const [dialog, setDialog] = useState<ListKind | null>(null);
  // null = criando; preenchido = editando esta linha
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [channel, setChannel] = useState<Channel>("other");

  function openDialog(kind: ListKind, row?: ListRow) {
    setEditingId(row?.id ?? null);
    setName(row?.name ?? "");
    setChannel(row?.channel ?? "other");
    setDialog(kind);
  }

  async function handleSave() {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error(t("crm:taxonomy.nameRequired"));
      return;
    }

    try {
      if (dialog === "source") {
        if (editingId) {
          await updateSource.mutateAsync({
            sourceId: editingId,
            payload: { workspaceId, name: trimmed, channel },
          });
        } else {
          await createSource.mutateAsync({
            workspaceId,
            name: trimmed,
            channel,
          });
        }
      } else if (dialog === "lostReason") {
        if (editingId) {
          await updateLostReason.mutateAsync({
            lostReasonId: editingId,
            payload: { workspaceId, name: trimmed },
          });
        } else {
          await createLostReason.mutateAsync({ workspaceId, name: trimmed });
        }
      } else if (editingId) {
        await updateSegment.mutateAsync({
          segmentId: editingId,
          payload: { workspaceId, name: trimmed },
        });
      } else {
        await createSegment.mutateAsync({ workspaceId, name: trimmed });
      }
      toast.success(
        t(editingId ? "crm:taxonomy.updated" : "crm:taxonomy.created"),
      );
      setDialog(null);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t(
              editingId
                ? "crm:taxonomy.updateError"
                : "crm:taxonomy.createError",
            ),
      );
    }
  }

  async function toggleSource(row: ListRow) {
    try {
      await updateSource.mutateAsync({
        sourceId: row.id,
        payload: { workspaceId, isActive: !row.isActive },
      });
      toast.success(t("crm:taxonomy.updated"));
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("crm:taxonomy.updateError"),
      );
    }
  }

  async function toggleSegment(row: ListRow) {
    try {
      await updateSegment.mutateAsync({
        segmentId: row.id,
        payload: { workspaceId, isActive: !row.isActive },
      });
      toast.success(t("crm:taxonomy.updated"));
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("crm:taxonomy.updateError"),
      );
    }
  }

  async function toggleLostReason(row: ListRow) {
    try {
      await updateLostReason.mutateAsync({
        lostReasonId: row.id,
        payload: { workspaceId, isActive: !row.isActive },
      });
      toast.success(t("crm:taxonomy.updated"));
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("crm:taxonomy.updateError"),
      );
    }
  }

  const isPending =
    createLostReason.isPending ||
    updateLostReason.isPending ||
    createSource.isPending ||
    createSegment.isPending ||
    updateSource.isPending ||
    updateSegment.isPending;

  return (
    <div className="space-y-4 p-2">
      <PageTitle title={t("crm:taxonomy.title")} />

      <header className="space-y-1">
        <h1 className="flex items-center gap-2 text-base font-medium">
          <Tags className="size-4" />
          {t("crm:taxonomy.title")}
        </h1>
        <p className="max-w-prose text-xs text-muted-foreground">
          {t("crm:taxonomy.description")}
        </p>
      </header>

      <ListSection
        title={t("crm:taxonomy.sources")}
        description={t("crm:taxonomy.sourcesDescription")}
        rows={sources}
        canEdit={canEdit}
        addLabel={t("crm:taxonomy.newSource")}
        emptyLabel={t("crm:taxonomy.emptySources")}
        onAdd={() => openDialog("source")}
        onEdit={(row) => openDialog("source", row)}
        onToggle={toggleSource}
      />

      <ListSection
        title={t("crm:taxonomy.segments")}
        description={t("crm:taxonomy.segmentsDescription")}
        rows={segments}
        canEdit={canEdit}
        addLabel={t("crm:taxonomy.newSegment")}
        emptyLabel={t("crm:taxonomy.emptySegments")}
        onAdd={() => openDialog("segment")}
        onEdit={(row) => openDialog("segment", row)}
        onToggle={toggleSegment}
      />

      <ListSection
        title={t("crm:taxonomy.lostReasons")}
        description={t("crm:taxonomy.lostReasonsDescription")}
        rows={lostReasons}
        canEdit={canEdit}
        addLabel={t("crm:taxonomy.newLostReason")}
        emptyLabel={t("crm:taxonomy.emptyLostReasons")}
        onAdd={() => openDialog("lostReason")}
        onEdit={(row) => openDialog("lostReason", row)}
        onToggle={toggleLostReason}
      />

      <p className="text-xs text-muted-foreground">
        {t("crm:taxonomy.deactivateHint")}
      </p>

      <Dialog
        open={dialog !== null}
        onOpenChange={(open) => {
          if (!open) setDialog(null);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {editingId
                ? t("crm:taxonomy.edit")
                : t(NEW_LABEL_KEY[dialog ?? "source"])}
            </DialogTitle>
            <DialogDescription className="sr-only">
              {t("crm:taxonomy.title")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 px-6 pb-2">
            <div className="space-y-2">
              <Label htmlFor="crm-taxonomy-name">
                {t("crm:taxonomy.nameLabel")}
              </Label>
              <Input
                id="crm-taxonomy-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                autoFocus
              />
            </div>

            {dialog === "source" ? (
              <div className="space-y-2">
                <Label htmlFor="crm-taxonomy-channel">
                  {t("crm:taxonomy.channelLabel")}
                </Label>
                <Select
                  value={channel}
                  onValueChange={(value) => {
                    if (typeof value === "string") setChannel(value as Channel);
                  }}
                >
                  <SelectTrigger id="crm-taxonomy-channel">
                    <SelectValue>
                      {t(`crm:taxonomy.${CHANNEL_KEY[channel]}`)}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {CHANNELS.map((item) => (
                      <SelectItem key={item} value={item}>
                        {t(`crm:taxonomy.${CHANNEL_KEY[item]}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialog(null)}
              disabled={isPending}
            >
              {t("common:actions.cancel")}
            </Button>
            <Button onClick={handleSave} disabled={isPending || !name.trim()}>
              {t("common:actions.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
