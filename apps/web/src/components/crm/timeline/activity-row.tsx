import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Check, Clock, FileText, ImageIcon, Paperclip } from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import ContractDocumentViewer from "@/components/crm/contract-document-viewer";
import { ActivityIcon } from "@/components/crm/timeline/activity-icon";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  fetchActivityAttachmentBlob,
  uploadActivityFiles,
} from "@/fetchers/crm/activity-attachments";
import { useCompleteActivity } from "@/hooks/mutations/crm/use-crm-contact-mutations";
import { getInitials } from "@/lib/get-initials";
import { toast } from "@/lib/toast";
import type { CrmActivity } from "@/types/crm";

type ActivityRowProps = {
  activity: CrmActivity;
  workspaceId: string;
  readOnly?: boolean;
};

export function ActivityRow({
  activity,
  workspaceId,
  readOnly = false,
}: ActivityRowProps) {
  const { t } = useTranslation();
  const { mutateAsync: complete, isPending } = useCompleteActivity();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [viewing, setViewing] = useState<
    CrmActivity["attachments"][number] | null
  >(null);

  async function addFiles(list: FileList | null) {
    const files = Array.from(list ?? []);
    if (inputRef.current) inputRef.current.value = "";
    if (files.length === 0) return;
    const failed = await uploadActivityFiles(workspaceId, activity.id, files);
    await queryClient.invalidateQueries({ queryKey: ["crm"] });
    if (failed.length > 0)
      toast.error(`Não foi possível anexar: ${failed.join(", ")}`);
  }

  const isPendingActivity = activity.completedAt === null;
  const isOverdue =
    isPendingActivity &&
    activity.dueAt !== null &&
    new Date(activity.dueAt) < new Date();

  return (
    <li className="flex gap-3 rounded-lg border border-border bg-card p-3">
      <span
        className={`mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full ${
          isPendingActivity
            ? "bg-primary/10 text-primary"
            : "bg-muted text-muted-foreground"
        }`}
      >
        <ActivityIcon type={activity.type} className="size-3.5" />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-sm font-medium">{activity.subject}</span>
          {isPendingActivity && activity.dueAt ? (
            <span
              className={`inline-flex items-center gap-1 text-xs ${
                isOverdue ? "text-destructive" : "text-warning-foreground"
              }`}
            >
              <Clock className="size-3" />
              {format(new Date(activity.dueAt), "dd/MM")}
            </span>
          ) : null}
        </div>

        {activity.body ? (
          <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
            {activity.body}
          </p>
        ) : null}

        {activity.attachments.length > 0 || !readOnly ? (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {activity.attachments.map((file) => (
              <button
                key={file.id}
                type="button"
                onClick={() => setViewing(file)}
                className="inline-flex max-w-52 items-center gap-1.5 rounded-md border bg-muted/40 px-2 py-1 text-xs font-medium hover:bg-muted"
              >
                {file.contentType === "application/pdf" ? (
                  <FileText className="size-3.5 shrink-0" />
                ) : (
                  <ImageIcon className="size-3.5 shrink-0" />
                )}
                <span className="truncate">{file.filename}</span>
              </button>
            ))}
            {readOnly ? null : (
              <>
                <input
                  ref={inputRef}
                  type="file"
                  multiple
                  hidden
                  accept="application/pdf,image/*"
                  onChange={(event) => addFiles(event.target.files)}
                />
                <button
                  type="button"
                  title={t("crm:timeline.attach")}
                  aria-label={t("crm:timeline.attach")}
                  onClick={() => inputRef.current?.click()}
                  className="inline-flex items-center rounded-md border border-dashed px-1.5 py-1 text-muted-foreground hover:bg-muted"
                >
                  <Paperclip className="size-3.5" />
                </button>
              </>
            )}
          </div>
        ) : null}

        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {activity.owner?.name ? (
            <span className="inline-flex items-center gap-1.5">
              <Avatar className="size-4">
                <AvatarImage src={activity.owner.image ?? undefined} />
                <AvatarFallback className="text-[8px]">
                  {getInitials(activity.owner.name)}
                </AvatarFallback>
              </Avatar>
              {activity.owner.name}
            </span>
          ) : null}
          {activity.outcome ? <span>· {activity.outcome}</span> : null}
          {activity.durationMinutes ? (
            <span>· {activity.durationMinutes}min</span>
          ) : null}
        </div>
      </div>

      {isPendingActivity && !readOnly ? (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 shrink-0 px-2"
          disabled={isPending}
          onClick={async () => {
            try {
              await complete({ activityId: activity.id, workspaceId });
              toast.success(t("crm:timeline.completed"));
            } catch (error) {
              toast.error(
                error instanceof Error
                  ? error.message
                  : t("crm:timeline.logError"),
              );
            }
          }}
        >
          <Check className="size-3.5" />
          <span className="hidden sm:inline">{t("crm:timeline.complete")}</span>
        </Button>
      ) : null}
      <ContractDocumentViewer
        workspaceId={workspaceId}
        document={viewing ? { ...viewing, title: viewing.filename } : null}
        load={fetchActivityAttachmentBlob}
        onClose={() => setViewing(null)}
      />
    </li>
  );
}

export default ActivityRow;
