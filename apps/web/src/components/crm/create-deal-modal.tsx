import { useState } from "react";
import { useTranslation } from "react-i18next";
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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCreateDeal } from "@/hooks/mutations/crm/use-crm-mutations";
import { useCrmSources } from "@/hooks/queries/crm/use-crm-taxonomy";
import { parseMoneyToCents } from "@/lib/money";
import { toast } from "@/lib/toast";
import type { CrmBoardStage } from "@/types/crm";

/** O Select do coss não aceita valor vazio; um item explícito é o que permite
 * deixar o negócio sem origem. */
const NONE_SOURCE = "__none__";

type CreateDealModalProps = {
  workspaceId: string;
  pipelineId: string;
  stages: CrmBoardStage[];
  onClose: () => void;
};

export function CreateDealModal({
  workspaceId,
  pipelineId,
  stages,
  onClose,
}: CreateDealModalProps) {
  const { t } = useTranslation();
  const { mutateAsync, isPending } = useCreateDeal();
  const { data: sources = [] } = useCrmSources(workspaceId);

  const openStages = stages.filter((stage) => stage.outcome === "open");
  const [title, setTitle] = useState("");
  const [value, setValue] = useState("");
  const [stageId, setStageId] = useState(openStages[0]?.id ?? "");
  const [expectedCloseDate, setExpectedCloseDate] = useState("");
  const [sourceId, setSourceId] = useState("");

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!title.trim()) return;

    try {
      await mutateAsync({
        workspaceId,
        pipelineId,
        title: title.trim(),
        ...(stageId ? { stageId } : {}),
        valueCents: parseMoneyToCents(value),
        ...(expectedCloseDate
          ? {
              expectedCloseDate: new Date(
                `${expectedCloseDate}T12:00:00`,
              ).toISOString(),
            }
          : {}),
        ...(sourceId ? { sourceId } : {}),
      });
      toast.success(t("crm:deal.created"));
      onClose();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("crm:deal.createError"),
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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("crm:deal.createTitle")}</DialogTitle>
          <DialogDescription className="sr-only">
            {t("crm:deal.createTitle")}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 px-6 pb-2">
          <div className="space-y-2">
            <Label htmlFor="crm-deal-title">{t("crm:deal.titleLabel")}</Label>
            <Input
              id="crm-deal-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={t("crm:deal.titlePlaceholder")}
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="crm-deal-value">{t("crm:deal.valueLabel")}</Label>
              <Input
                id="crm-deal-value"
                inputMode="decimal"
                value={value}
                onChange={(event) => setValue(event.target.value)}
                placeholder="0,00"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="crm-deal-close">
                {t("crm:deal.expectedCloseLabel")}
              </Label>
              <Input
                id="crm-deal-close"
                type="date"
                value={expectedCloseDate}
                onChange={(event) => setExpectedCloseDate(event.target.value)}
              />
            </div>
          </div>

          {/* Origem no negócio responde de onde veio ESTA oportunidade — o
              cliente veio de Meta Ads uma vez, o terceiro projeto dele veio
              de indicação. */}
          <div className="space-y-2">
            <Label htmlFor="crm-deal-source">{t("crm:deal.sourceLabel")}</Label>
            <Select
              value={sourceId === "" ? NONE_SOURCE : sourceId}
              onValueChange={(next) => {
                if (typeof next === "string") {
                  setSourceId(next === NONE_SOURCE ? "" : next);
                }
              }}
            >
              <SelectTrigger id="crm-deal-source">
                <SelectValue>
                  {sources.find((source) => source.id === sourceId)?.name ??
                    t("crm:company.noneSelected")}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE_SOURCE}>
                  {t("crm:company.noneSelected")}
                </SelectItem>
                {sources.map((source) => (
                  <SelectItem key={source.id} value={source.id}>
                    {source.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {openStages.length > 1 ? (
            <div className="space-y-2">
              <Label htmlFor="crm-deal-stage">{t("crm:deal.stageLabel")}</Label>
              <Select
                value={stageId}
                onValueChange={(next) => {
                  if (typeof next === "string") setStageId(next);
                }}
              >
                <SelectTrigger id="crm-deal-stage">
                  <SelectValue>
                    {openStages.find((stage) => stage.id === stageId)?.name ??
                      ""}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {openStages.map((stage) => (
                    <SelectItem key={stage.id} value={stage.id}>
                      {stage.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isPending}
            >
              {t("common:actions.cancel")}
            </Button>
            <Button type="submit" disabled={isPending || !title.trim()}>
              {t("common:actions.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default CreateDealModal;
