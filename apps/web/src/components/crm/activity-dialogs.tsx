import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ACTIVITY_TYPES,
  ActivityIcon,
  type CrmActivityType,
} from "@/components/crm/timeline/activity-icon";
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
import {
  useCompleteActivity,
  useCreateActivity,
  useUpdateActivity,
} from "@/hooks/mutations/crm/use-crm-contact-mutations";
import { useCrmCompanies } from "@/hooks/queries/crm/use-crm-companies";
import { useWorkspaceMembers } from "@/hooks/queries/workspace/use-workspace-members";
import { toast } from "@/lib/toast";
import type { CrmActivity } from "@/types/crm";

const NONE = "__none__";

/** Vínculos que uma atividade nova herda (ex.: a próxima de uma concluída). */
export type ActivityDefaults = {
  type?: CrmActivityType;
  dealId?: string | null;
  contactId?: string | null;
  companyId?: string | null;
  ownerUserId?: string | null;
  subject?: string;
};

const pad = (n: number) => String(n).padStart(2, "0");
export const dateInput = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const addDays = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
};

const OUTCOMES: [string, string][] = [
  ["connected", "Deu certo / atendeu"],
  ["no_answer", "Sem resposta"],
  ["rescheduled", "Reagendou"],
  ["other", "Outro"],
];

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "Não foi possível salvar.";

export function ActivityFormDialog({
  workspaceId,
  defaults,
  onClose,
}: {
  workspaceId: string;
  defaults?: ActivityDefaults;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { mutateAsync, isPending } = useCreateActivity();
  const { data: companies } = useCrmCompanies({ workspaceId, limit: "200" });
  const { data: members = [] } = useWorkspaceMembers(workspaceId);
  const [type, setType] = useState<CrmActivityType>(defaults?.type ?? "call");
  const [subject, setSubject] = useState(defaults?.subject ?? "");
  const [body, setBody] = useState("");
  const [date, setDate] = useState(dateInput(addDays(1)));
  const [time, setTime] = useState("09:00");
  const [companyId, setCompanyId] = useState(defaults?.companyId ?? "");
  const [ownerUserId, setOwnerUserId] = useState(defaults?.ownerUserId ?? "");
  const company = companies?.items.find((entry) => entry.id === companyId);
  const owner = members.find((member) => member.id === ownerUserId);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!subject.trim()) {
      toast.error("Informe o assunto da atividade.");
      return;
    }
    try {
      await mutateAsync({
        workspaceId,
        type,
        subject: subject.trim(),
        ...(body.trim() ? { body: body.trim() } : {}),
        ...(defaults?.dealId ? { dealId: defaults.dealId } : {}),
        ...(defaults?.contactId ? { contactId: defaults.contactId } : {}),
        ...(companyId ? { companyId } : {}),
        ...(ownerUserId ? { ownerUserId } : {}),
        ...(date
          ? { dueAt: new Date(`${date}T${time || "09:00"}:00`).toISOString() }
          : {}),
      });
      toast.success("Atividade agendada.");
      onClose();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Nova atividade</DialogTitle>
          <DialogDescription>
            Agende o próximo passo com o cliente.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4 px-6 pb-2">
          <div className="flex flex-wrap gap-1">
            {ACTIVITY_TYPES.map((activityType) => (
              <Button
                key={activityType}
                type="button"
                size="sm"
                variant={type === activityType ? "secondary" : "ghost"}
                aria-pressed={type === activityType}
                onClick={() => setType(activityType)}
              >
                <ActivityIcon type={activityType} className="size-3.5" />
                {t(`crm:timeline.types.${activityType}`)}
              </Button>
            ))}
          </div>
          <div className="space-y-2">
            <Label htmlFor="activity-subject">Assunto</Label>
            <Input
              id="activity-subject"
              value={subject}
              maxLength={200}
              placeholder="Ex.: Ligar para fechar a proposta"
              onChange={(event) => setSubject(event.target.value)}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="activity-date">Data</Label>
              <Input
                id="activity-date"
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="activity-time">Hora</Label>
              <Input
                id="activity-time"
                type="time"
                value={time}
                onChange={(event) => setTime(event.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Empresa</Label>
              <Select
                value={companyId || NONE}
                onValueChange={(value) => {
                  if (typeof value === "string")
                    setCompanyId(value === NONE ? "" : value);
                }}
              >
                <SelectTrigger>
                  <SelectValue>{company?.name ?? "Sem empresa"}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Sem empresa</SelectItem>
                  {(companies?.items ?? []).map((entry) => (
                    <SelectItem key={entry.id} value={entry.id}>
                      {entry.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Responsável</Label>
              <Select
                value={ownerUserId || NONE}
                onValueChange={(value) => {
                  if (typeof value === "string")
                    setOwnerUserId(value === NONE ? "" : value);
                }}
              >
                <SelectTrigger>
                  <SelectValue>{owner?.name ?? "Eu"}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Eu</SelectItem>
                  {members.map((member) => (
                    <SelectItem key={member.id} value={member.id}>
                      {member.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {defaults?.dealId ? (
            <p className="text-xs text-muted-foreground">
              Vinculada ao mesmo negócio da atividade anterior.
            </p>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="activity-body">Observação</Label>
            <Textarea
              id="activity-body"
              rows={3}
              value={body}
              onChange={(event) => setBody(event.target.value)}
            />
          </div>
          <DialogFooter className="px-0">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending}>
              Agendar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function CompleteActivityDialog({
  workspaceId,
  activity,
  onClose,
  onScheduleNext,
}: {
  workspaceId: string;
  activity: CrmActivity;
  onClose: () => void;
  onScheduleNext: (defaults: ActivityDefaults) => void;
}) {
  const { mutateAsync: complete, isPending } = useCompleteActivity();
  const { mutateAsync: update } = useUpdateActivity();
  const [outcome, setOutcome] = useState("");
  const [minutes, setMinutes] = useState("");
  const [note, setNote] = useState("");

  async function finish(mode: "plain" | "record" | "next") {
    try {
      if (mode !== "plain" && note.trim()) {
        const previous = activity.body?.trim();
        await update({
          activityId: activity.id,
          workspaceId,
          body: previous ? `${previous}\n\n${note.trim()}` : note.trim(),
        });
      }
      const duration = Number(minutes);
      await complete({
        activityId: activity.id,
        workspaceId,
        ...(mode !== "plain" && outcome ? { outcome } : {}),
        ...(mode !== "plain" && duration > 0
          ? { durationMinutes: Math.round(duration) }
          : {}),
      });
      toast.success("Atividade concluída.");
      onClose();
      if (mode === "next") {
        onScheduleNext({
          type: activity.type as CrmActivityType,
          dealId: activity.dealId,
          contactId: activity.contactId,
          companyId: activity.companyId,
          ownerUserId: activity.ownerUserId,
        });
      }
    } catch (error) {
      toast.error(errorMessage(error));
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
          <DialogTitle>Concluir atividade</DialogTitle>
          <DialogDescription>{activity.subject}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 px-6 pb-2">
          <div className="space-y-2">
            <Label>Resultado (opcional)</Label>
            <div className="flex flex-wrap gap-1">
              {OUTCOMES.map(([key, label]) => (
                <Button
                  key={key}
                  type="button"
                  size="sm"
                  variant={outcome === key ? "secondary" : "outline"}
                  aria-pressed={outcome === key}
                  onClick={() => setOutcome(outcome === key ? "" : key)}
                >
                  {label}
                </Button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="activity-minutes">Duração em minutos</Label>
            <Input
              id="activity-minutes"
              type="number"
              min={0}
              className="w-40"
              value={minutes}
              onChange={(event) => setMinutes(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="activity-note">Observação</Label>
            <Textarea
              id="activity-note"
              rows={3}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            disabled={isPending}
            onClick={() => finish("plain")}
          >
            Concluir sem registrar
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={isPending}
            onClick={() => finish("next")}
          >
            Concluir e agendar a próxima
          </Button>
          <Button
            type="button"
            disabled={isPending}
            onClick={() => finish("record")}
          >
            Concluir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Mantém a hora marcada e muda só o dia. */
export function rescheduledAt(activity: CrmActivity, day: string) {
  const base = activity.dueAt ? new Date(activity.dueAt) : null;
  const hour = base
    ? `${pad(base.getHours())}:${pad(base.getMinutes())}`
    : "09:00";
  return new Date(`${day}T${hour}:00`).toISOString();
}
