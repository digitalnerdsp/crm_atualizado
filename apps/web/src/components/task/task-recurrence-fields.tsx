import { CalendarDays, Repeat2 } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/cn";
import { formatDateMedium } from "@/lib/format";

export type TaskRecurrenceDraft = {
  frequency: "daily" | "weekly" | "monthly";
  interval: number;
  weekdays: number[];
  endMode: "never" | "date" | "count";
  endsAt?: Date;
  maxOccurrences: number;
};

type TaskRecurrenceFieldsProps = {
  dueDate?: Date;
  value: TaskRecurrenceDraft | null;
  onChange: (value: TaskRecurrenceDraft | null) => void;
};

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 0];

function getDefaultValue(dueDate?: Date): TaskRecurrenceDraft {
  return {
    frequency: "weekly",
    interval: 1,
    weekdays: [dueDate?.getDay() ?? 1],
    endMode: "never",
    maxOccurrences: 10,
  };
}

export function recurrenceDraftToRequest(value: TaskRecurrenceDraft | null) {
  if (!value) return undefined;

  return {
    frequency: value.frequency,
    interval: value.interval,
    weekdays: value.frequency === "weekly" ? value.weekdays : undefined,
    endsAt: value.endMode === "date" ? value.endsAt?.toISOString() : undefined,
    maxOccurrences:
      value.endMode === "count" ? value.maxOccurrences : undefined,
  };
}

export default function TaskRecurrenceFields({
  dueDate,
  value,
  onChange,
}: TaskRecurrenceFieldsProps) {
  const { t } = useTranslation();
  const summary = useMemo(() => {
    if (!value) return t("common:modals.createTask.recurrence.label");

    if (value.frequency === "weekly" && value.weekdays.length > 0) {
      const days = WEEKDAYS.filter((day) => value.weekdays.includes(day))
        .map((day) => t(`common:modals.createTask.recurrence.weekdays.${day}`))
        .join(", ");
      return value.interval === 1
        ? days
        : t("common:modals.createTask.recurrence.everyWeeks", {
            count: value.interval,
          });
    }

    return t(`common:modals.createTask.recurrence.summary.${value.frequency}`, {
      count: value.interval,
    });
  }, [t, value]);

  function update(patch: Partial<TaskRecurrenceDraft>) {
    if (!value) return;
    onChange({ ...value, ...patch });
  }

  function toggleWeekday(day: number) {
    if (!value) return;
    const selected = value.weekdays.includes(day);
    if (selected && value.weekdays.length === 1) return;
    update({
      weekdays: selected
        ? value.weekdays.filter((current) => current !== day)
        : [...value.weekdays, day].sort(),
    });
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-accent/50",
            value ? "bg-accent/30 text-foreground" : "text-muted-foreground",
          )}
        >
          <Repeat2 className="size-3.5" />
          <span className="max-w-40 truncate">{summary}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[min(360px,calc(100vw-2rem))] p-4"
        align="start"
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label>
                {t("common:modals.createTask.recurrence.repeatTask")}
              </Label>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("common:modals.createTask.recurrence.firstDueDate")}
              </p>
            </div>
            <Switch
              checked={value !== null}
              onCheckedChange={(checked) =>
                onChange(checked ? getDefaultValue(dueDate) : null)
              }
            />
          </div>

          {value && (
            <>
              <div className="grid grid-cols-[1fr_88px] gap-3">
                <div className="space-y-1.5">
                  <Label>
                    {t("common:modals.createTask.recurrence.frequency")}
                  </Label>
                  <Select
                    value={value.frequency}
                    onValueChange={(frequency) =>
                      update({
                        frequency:
                          frequency as TaskRecurrenceDraft["frequency"],
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(["daily", "weekly", "monthly"] as const).map(
                        (frequency) => (
                          <SelectItem key={frequency} value={frequency}>
                            {t(
                              `common:modals.createTask.recurrence.frequencies.${frequency}`,
                            )}
                          </SelectItem>
                        ),
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>
                    {t("common:modals.createTask.recurrence.interval")}
                  </Label>
                  <Input
                    min={1}
                    max={30}
                    type="number"
                    value={value.interval}
                    onChange={(event) =>
                      update({
                        interval: Math.max(
                          1,
                          Math.min(30, Number(event.target.value) || 1),
                        ),
                      })
                    }
                  />
                </div>
              </div>

              {value.frequency === "weekly" && (
                <div className="space-y-1.5">
                  <Label>
                    {t("common:modals.createTask.recurrence.weekdaysLabel")}
                  </Label>
                  <div className="grid grid-cols-7 gap-1">
                    {WEEKDAYS.map((day) => {
                      const selected = value.weekdays.includes(day);
                      return (
                        <button
                          key={day}
                          type="button"
                          aria-pressed={selected}
                          className={cn(
                            "h-9 rounded-md border text-xs font-medium transition-colors",
                            selected
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border text-muted-foreground hover:bg-accent",
                          )}
                          onClick={() => toggleWeekday(day)}
                        >
                          {t(
                            `common:modals.createTask.recurrence.weekdaysShort.${day}`,
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <Label>{t("common:modals.createTask.recurrence.ends")}</Label>
                <Select
                  value={value.endMode}
                  onValueChange={(endMode) =>
                    update({
                      endMode: endMode as TaskRecurrenceDraft["endMode"],
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(["never", "date", "count"] as const).map((mode) => (
                      <SelectItem key={mode} value={mode}>
                        {t(
                          `common:modals.createTask.recurrence.endModes.${mode}`,
                        )}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {value.endMode === "date" && (
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full justify-start"
                    >
                      <CalendarDays className="size-4" />
                      {value.endsAt
                        ? formatDateMedium(value.endsAt)
                        : t(
                            "common:modals.createTask.recurrence.selectEndDate",
                          )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={value.endsAt}
                      disabled={dueDate ? { before: dueDate } : undefined}
                      onSelect={(endsAt) => update({ endsAt })}
                    />
                  </PopoverContent>
                </Popover>
              )}

              {value.endMode === "count" && (
                <div className="space-y-1.5">
                  <Label>
                    {t("common:modals.createTask.recurrence.occurrences")}
                  </Label>
                  <Input
                    min={2}
                    max={1000}
                    type="number"
                    value={value.maxOccurrences}
                    onChange={(event) =>
                      update({
                        maxOccurrences: Math.max(
                          2,
                          Math.min(1000, Number(event.target.value) || 2),
                        ),
                      })
                    }
                  />
                </div>
              )}

              {!dueDate && (
                <p className="text-xs text-destructive">
                  {t("common:modals.createTask.recurrence.dueDateRequired")}
                </p>
              )}
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
