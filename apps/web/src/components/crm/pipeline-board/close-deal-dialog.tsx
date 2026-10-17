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
import { Textarea } from "@/components/ui/textarea";
import type { CrmLostReason } from "@/types/crm";

export type CloseDealIntent = {
  dealId: string;
  dealTitle: string;
  stageId: string;
  outcome: "won" | "lost";
  valueCents: number;
  currency: string;
};

type CloseDealDialogProps = {
  intent: CloseDealIntent | null;
  lostReasons: CrmLostReason[];
  isSubmitting: boolean;
  onCancel: () => void;
  onConfirm: (result: {
    lostReasonId?: string;
    lostReasonNote?: string;
  }) => void;
};

/**
 * Dropping a card on Won or Lost is a decision, not a drag. Losing without a
 * reason is what makes the loss-reason report useless six months later, so the
 * confirm button stays disabled until one is picked.
 *
 * The caller keys this on the deal id, so each drop mounts a fresh dialog and
 * the reason picked for the previous deal never carries over.
 */
export function CloseDealDialog({
  intent,
  lostReasons,
  isSubmitting,
  onCancel,
  onConfirm,
}: CloseDealDialogProps) {
  const { t } = useTranslation();
  const [lostReasonId, setLostReasonId] = useState<string>("");
  const [note, setNote] = useState("");

  if (!intent) return null;

  const isLost = intent.outcome === "lost";
  const canConfirm = !isLost || lostReasonId.length > 0;

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isLost ? t("crm:close.lostTitle") : t("crm:close.wonTitle")}
          </DialogTitle>
          <DialogDescription>
            {t("crm:close.description", { title: intent.dealTitle })}
          </DialogDescription>
        </DialogHeader>

        {isLost ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="crm-lost-reason">
                {t("crm:close.reasonLabel")}
              </Label>
              <Select
                value={lostReasonId}
                onValueChange={(value) => {
                  if (typeof value === "string") setLostReasonId(value);
                }}
              >
                <SelectTrigger id="crm-lost-reason">
                  {/* Without explicit children this renders the raw id, not
                      the reason's name. */}
                  <SelectValue>
                    {lostReasons.find((reason) => reason.id === lostReasonId)
                      ?.name ?? t("crm:close.reasonPlaceholder")}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {lostReasons.map((reason) => (
                    <SelectItem key={reason.id} value={reason.id}>
                      {reason.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {lostReasons.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  {t("crm:close.noReasons")}
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="crm-lost-note">{t("crm:close.noteLabel")}</Label>
              <Textarea
                id="crm-lost-note"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder={t("crm:close.notePlaceholder")}
                rows={3}
              />
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <Label htmlFor="crm-won-value">{t("crm:close.valueLabel")}</Label>
            <Input
              id="crm-won-value"
              readOnly
              value={new Intl.NumberFormat("pt-BR", {
                style: "currency",
                currency: intent.currency,
              }).format(intent.valueCents / 100)}
            />
            <p className="text-xs text-muted-foreground">
              {t("crm:close.valueHint")}
            </p>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={isSubmitting}>
            {t("common:actions.cancel")}
          </Button>
          <Button
            onClick={() =>
              onConfirm({
                ...(isLost ? { lostReasonId } : {}),
                ...(isLost && note ? { lostReasonNote: note } : {}),
              })
            }
            disabled={!canConfirm || isSubmitting}
          >
            {isLost ? t("crm:close.confirmLost") : t("crm:close.confirmWon")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default CloseDealDialog;
