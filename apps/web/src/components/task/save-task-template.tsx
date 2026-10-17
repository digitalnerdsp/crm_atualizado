import { Save } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { saveTaskAsTemplate } from "@/fetchers/task-template";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import { toast } from "@/lib/toast";
import queryClient from "@/query-client";

export default function SaveTaskTemplate({ taskId }: { taskId: string }) {
  const { t } = useTranslation();
  const { canManageTemplates } = useWorkspacePermission();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  if (!canManageTemplates()) return null;

  async function save() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await saveTaskAsTemplate(taskId, name.trim());
      await queryClient.invalidateQueries({ queryKey: ["task-templates"] });
      toast.success(t("tasks:templates.saved"));
      setName("");
      setOpen(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("tasks:templates.saveError"),
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="w-fit"
        onClick={() => setOpen(true)}
      >
        <Save className="size-4" />
        {t("tasks:templates.saveAsTemplate")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("tasks:templates.saveAsTemplate")}</DialogTitle>
          </DialogHeader>
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t("tasks:templates.namePlaceholder")}
            autoFocus
            onKeyDown={(event) => {
              if (event.key === "Enter") void save();
            }}
          />
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              {t("common:actions.cancel")}
            </Button>
            <Button
              type="button"
              disabled={!name.trim() || saving}
              onClick={save}
            >
              {t("common:actions.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
