import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ACTIVITY_TYPES,
  ActivityIcon,
  type CrmActivityType,
} from "@/components/crm/timeline/activity-icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useCreateActivity } from "@/hooks/mutations/crm/use-crm-contact-mutations";
import { toast } from "@/lib/toast";

type ActivityComposerProps = {
  workspaceId: string;
  dealId?: string;
  contactId?: string;
  companyId?: string;
};

/**
 * One line to log what happened, or to schedule what comes next. A due date
 * with no completion is a pending activity; without one it is history.
 */
export function ActivityComposer({
  workspaceId,
  dealId,
  contactId,
  companyId,
}: ActivityComposerProps) {
  const { t } = useTranslation();
  const { mutateAsync, isPending } = useCreateActivity();

  const [type, setType] = useState<CrmActivityType>("note");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [dueAt, setDueAt] = useState("");

  const isScheduling = type === "task" || type === "meeting" || dueAt !== "";

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!subject.trim()) return;

    try {
      await mutateAsync({
        workspaceId,
        type,
        subject: subject.trim(),
        ...(body.trim() ? { body: body.trim() } : {}),
        ...(dealId ? { dealId } : {}),
        ...(contactId ? { contactId } : {}),
        ...(companyId ? { companyId } : {}),
        ...(dueAt
          ? { dueAt: new Date(`${dueAt}T12:00:00`).toISOString() }
          : { completedAt: new Date().toISOString() }),
      });
      setSubject("");
      setBody("");
      setDueAt("");
      toast.success(t("crm:timeline.logged"));
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("crm:timeline.logError"),
      );
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-3 rounded-lg border border-border bg-card p-3"
    >
      <div className="flex flex-wrap gap-1">
        {ACTIVITY_TYPES.map((activityType) => (
          <Button
            key={activityType}
            type="button"
            size="sm"
            variant={type === activityType ? "secondary" : "ghost"}
            className="h-7 px-2 text-xs"
            aria-pressed={type === activityType}
            onClick={() => setType(activityType)}
          >
            <ActivityIcon type={activityType} className="size-3.5" />
            <span className="hidden sm:inline">
              {t(`crm:timeline.types.${activityType}`)}
            </span>
          </Button>
        ))}
      </div>

      <Input
        value={subject}
        onChange={(event) => setSubject(event.target.value)}
        placeholder={t("crm:timeline.subjectPlaceholder")}
      />

      {subject.trim() ? (
        <>
          <Textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder={t("crm:timeline.bodyPlaceholder")}
            rows={3}
          />

          <div className="flex flex-wrap items-center justify-between gap-2">
            <label
              htmlFor="crm-activity-due"
              className="flex items-center gap-2 text-xs text-muted-foreground"
            >
              {t("crm:timeline.dueLabel")}
              <Input
                id="crm-activity-due"
                type="date"
                value={dueAt}
                onChange={(event) => setDueAt(event.target.value)}
                className="h-8 w-40"
              />
            </label>
            <Button type="submit" size="sm" disabled={isPending}>
              {isScheduling
                ? t("crm:timeline.schedule")
                : t("crm:timeline.log")}
            </Button>
          </div>
        </>
      ) : null}
    </form>
  );
}

export default ActivityComposer;
