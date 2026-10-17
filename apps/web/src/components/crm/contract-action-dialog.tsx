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
import {
  useCancelCrmContract,
  useChangeCrmContractValue,
  useTransitionCrmContract,
} from "@/hooks/mutations/crm/use-crm-contract-mutations";
import { useCrmLostReasons } from "@/hooks/queries/crm/use-crm-lost-reasons";
import { parseMoneyToCents } from "@/lib/money";
import { toast } from "@/lib/toast";

export type ContractActionKind =
  | "pause"
  | "resume"
  | "finish"
  | "cancel"
  | "value";

const TITLE_KEY = {
  pause: "crm:contracts.pause",
  resume: "crm:contracts.resume",
  finish: "crm:contracts.finish",
  cancel: "crm:contracts.cancel",
  value: "crm:contracts.changeValue",
} as const;

const HINT_KEY = {
  pause: "crm:contracts.pauseHint",
  resume: null,
  finish: "crm:contracts.finishHint",
  cancel: "crm:contracts.cancelHint",
  value: "crm:contracts.valueHint",
} as const;

const NO_REASON = "__none__";

function todayInput() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

function centsToInput(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Uma caixa para as cinco mudanças que escrevem histórico. A data vem
 * preenchida com hoje e é editável: o cliente avisou do cancelamento no dia 31
 * e a equipe só registrou no dia 3, e o MRR de agosto precisa refletir isso.
 */
export function ContractActionDialog({
  kind,
  workspaceId,
  contractId,
  monthlyValueCents,
  onClose,
}: {
  kind: ContractActionKind;
  workspaceId: string;
  contractId: string;
  monthlyValueCents: number;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [date, setDate] = useState(todayInput);
  const [note, setNote] = useState("");
  const [value, setValue] = useState(() => centsToInput(monthlyValueCents));
  const [reasonId, setReasonId] = useState("");

  const { data: reasons = [] } = useCrmLostReasons(
    kind === "cancel" ? workspaceId : undefined,
  );
  const transition = useTransitionCrmContract();
  const cancel = useCancelCrmContract();
  const changeValue = useChangeCrmContractValue();
  const isPending =
    transition.isPending || cancel.isPending || changeValue.isPending;

  async function handleConfirm() {
    // Meio-dia local: meia-noite viraria o dia anterior em UTC-3.
    const occurredAt = new Date(`${date}T12:00:00`).toISOString();
    const trimmedNote = note.trim() ? note.trim() : null;

    try {
      if (kind === "value") {
        await changeValue.mutateAsync({
          contractId,
          payload: {
            workspaceId,
            monthlyValueCents: parseMoneyToCents(value),
            occurredAt,
            note: trimmedNote,
          },
        });
      } else if (kind === "cancel") {
        await cancel.mutateAsync({
          contractId,
          payload: {
            workspaceId,
            occurredAt,
            note: trimmedNote,
            cancelReasonId: reasonId || null,
          },
        });
      } else {
        await transition.mutateAsync({
          contractId,
          action: kind,
          payload: { workspaceId, occurredAt, note: trimmedNote },
        });
      }
      toast.success(t("crm:contracts.saved"));
      onClose();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("crm:contracts.saveError"),
      );
    }
  }

  const hint = HINT_KEY[kind];
  const selectedReason = reasons.find((reason) => reason.id === reasonId);

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t(TITLE_KEY[kind])}</DialogTitle>
          <DialogDescription>{hint ? t(hint) : null}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 px-6 pb-2">
          {kind === "value" ? (
            <div className="space-y-2">
              <Label htmlFor="crm-contract-value">
                {t("crm:contracts.newValue")}
              </Label>
              <Input
                id="crm-contract-value"
                inputMode="decimal"
                value={value}
                onChange={(event) => setValue(event.target.value)}
                autoFocus
              />
            </div>
          ) : null}

          {kind === "cancel" ? (
            <div className="space-y-2">
              <Label htmlFor="crm-contract-reason">
                {t("crm:contracts.reason")}
              </Label>
              <Select
                value={reasonId || NO_REASON}
                onValueChange={(next) => {
                  if (typeof next === "string") {
                    setReasonId(next === NO_REASON ? "" : next);
                  }
                }}
              >
                <SelectTrigger id="crm-contract-reason">
                  <SelectValue>
                    {selectedReason?.name ?? t("crm:contracts.noReason")}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_REASON}>
                    {t("crm:contracts.noReason")}
                  </SelectItem>
                  {reasons.map((reason) => (
                    <SelectItem key={reason.id} value={reason.id}>
                      {reason.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="crm-contract-date">
              {t("crm:contracts.effectiveDate")}
            </Label>
            <Input
              id="crm-contract-date"
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="crm-contract-note">{t("crm:contracts.note")}</Label>
            <Input
              id="crm-contract-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            {t("common:actions.cancel")}
          </Button>
          <Button
            variant={kind === "cancel" ? "destructive" : "default"}
            onClick={handleConfirm}
            disabled={isPending || !date}
          >
            {t("crm:contracts.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default ContractActionDialog;
