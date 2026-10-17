import { Plus, X } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import GenerateContractPrompt from "@/components/crm/generate-contract-prompt";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCreateDeliveryTasks } from "@/hooks/mutations/crm/use-crm-mutations";
import useGetProjects from "@/hooks/queries/project/use-get-projects";
import { toast } from "@/lib/toast";

type DeliveryTasksDialogProps = {
  workspaceId: string;
  dealId: string;
  dealTitle: string;
  onClose: () => void;
};

type Line = { id: number; projectId: string; title: string };

/**
 * Turns a won deal into work. Projects here are per discipline, so each line
 * picks which discipline the task lands in — a rebranding puts tasks in Design
 * and in Dev at once. Every task is created already linked to the client.
 */
export function DeliveryTasksDialog({
  workspaceId,
  dealId,
  dealTitle,
  onClose,
}: DeliveryTasksDialogProps) {
  const { t } = useTranslation();
  const { data: projects = [] } = useGetProjects({ workspaceId });
  const { mutateAsync, isPending } = useCreateDeliveryTasks();

  const [nextId, setNextId] = useState(1);
  const [lines, setLines] = useState<Line[]>([
    { id: 0, projectId: "", title: dealTitle },
  ]);

  const usableLines = lines.filter(
    (line) => line.projectId && line.title.trim(),
  );

  function updateLine(id: number, patch: Partial<Line>) {
    setLines((current) =>
      current.map((line) => (line.id === id ? { ...line, ...patch } : line)),
    );
  }

  async function handleSubmit() {
    if (usableLines.length === 0) return;

    try {
      const result = await mutateAsync({
        dealId,
        payload: {
          workspaceId,
          items: usableLines.map((line) => ({
            projectId: line.projectId,
            title: line.title.trim(),
          })),
        },
      });
      toast.success(
        t("crm:deal.deliveryTasksCreated", { count: result.tasks.length }),
      );
      onClose();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("crm:deal.deliveryTasksError"),
      );
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("crm:deal.createDeliveryTasks")}</DialogTitle>
          <DialogDescription>
            {t("crm:close.description", { title: dealTitle })}
          </DialogDescription>
        </DialogHeader>

        {/* Logo após o ganho é quando se decide a assinatura: o aviso só
            aparece se o negócio tiver serviço recorrente. */}
        <div className="px-6">
          <GenerateContractPrompt
            workspaceId={workspaceId}
            dealId={dealId}
            compact
          />
        </div>

        <div className="space-y-2 px-6 pb-2">
          {lines.map((line) => {
            const projectName =
              projects.find((project) => project.id === line.projectId)?.name ??
              t("crm:deal.pickProject");

            return (
              <div key={line.id} className="flex items-center gap-2">
                <Select
                  value={line.projectId}
                  onValueChange={(value) => {
                    if (typeof value === "string") {
                      updateLine(line.id, { projectId: value });
                    }
                  }}
                >
                  <SelectTrigger size="sm" className="h-8 w-40 shrink-0">
                    <SelectValue>{projectName}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map((project) => (
                      <SelectItem key={project.id} value={project.id}>
                        {project.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Input
                  value={line.title}
                  onChange={(event) =>
                    updateLine(line.id, { title: event.target.value })
                  }
                  placeholder={t("crm:deal.taskTitle")}
                  className="h-8"
                />

                {lines.length > 1 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 shrink-0 p-0"
                    onClick={() =>
                      setLines((current) =>
                        current.filter((item) => item.id !== line.id),
                      )
                    }
                  >
                    <X className="size-3.5" />
                  </Button>
                ) : null}
              </div>
            );
          })}

          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8"
            onClick={() => {
              setLines((current) => [
                ...current,
                { id: nextId, projectId: "", title: "" },
              ]);
              setNextId((value) => value + 1);
            }}
          >
            <Plus className="size-3.5" />
            {t("crm:deal.addTaskLine")}
          </Button>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            {t("crm:deal.skipForNow")}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isPending || usableLines.length === 0}
          >
            {t("common:actions.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default DeliveryTasksDialog;
