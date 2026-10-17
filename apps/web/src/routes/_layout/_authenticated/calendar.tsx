import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  List,
  MapPin,
  Monitor,
  Plus,
  RefreshCw,
  Repeat2,
  Trash2,
} from "lucide-react";
import type { FormEvent, ReactNode, SelectHTMLAttributes } from "react";
import { useEffect, useMemo, useState } from "react";
import Layout from "@/components/common/layout";
import PageTitle from "@/components/page-title";
import TaskDetailsSheet from "@/components/task/task-details-sheet";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardPanel,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type {
  CreateCalendarEventRequest,
  UpdateCalendarEventRequest,
  UpdateCalendarTaskDatesRequest,
} from "@/fetchers/calendar/calendar-actions";
import type {
  CalendarItem,
  CalendarItemsResponse,
} from "@/fetchers/calendar/get-calendar-items";
import {
  useCreateCalendarEvent,
  useDeleteCalendarEvent,
  useUpdateCalendarEvent,
  useUpdateCalendarTaskDates,
} from "@/hooks/mutations/calendar/use-calendar-mutations";
import { useCalendarItems } from "@/hooks/queries/calendar/use-calendar-items";
import useGetProjects from "@/hooks/queries/project/use-get-projects";
import useActiveWorkspace from "@/hooks/queries/workspace/use-active-workspace";
import { useWorkspaceMembers } from "@/hooks/queries/workspace/use-workspace-members";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import { calendarDayKey, groupCalendarItemsByDay } from "@/lib/calendar-items";
import { cn } from "@/lib/cn";
import { getInitials } from "@/lib/get-initials";

export const Route = createFileRoute("/_layout/_authenticated/calendar")({
  component: CalendarPage,
});

type CalendarView = "month" | "week" | "day" | "list";

type EventFormState = {
  workspaceId: string;
  projectId: string;
  taskId: string;
  title: string;
  description: string;
  startAt: string;
  endAt: string;
  allDay: boolean;
  meetingType: "online" | "in_person" | "external";
  location: string;
  visibility: "workspace" | "private";
  status: "confirmed" | "tentative" | "cancelled";
  recurrenceFrequency: "none" | "daily" | "weekly" | "monthly";
  recurrenceUntil: string;
  attendeeIds: string[];
  reminderEnabled: boolean;
  reminderChannel: "in_app" | "email";
  reminderMinutesBefore: number;
};

type SelectProps = SelectHTMLAttributes<HTMLSelectElement>;

const WEEKDAYS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sab", "Dom"];
const VIEW_LABELS: Record<CalendarView, string> = {
  month: "Mes",
  week: "Semana",
  day: "Dia",
  list: "Lista",
};
const PRIORITIES = ["no-priority", "low", "medium", "high", "urgent"];
const TASK_STATUSES = ["to-do", "in-progress", "in-review", "done", "planned"];
const EVENT_STATUSES = ["confirmed", "tentative", "cancelled"];
const MEETING_TYPE_LABELS: Record<EventFormState["meetingType"], string> = {
  online: "Online",
  in_person: "Presencial",
  external: "Externo",
};
const EMPTY_CALENDAR_ITEMS: CalendarItem[] = [];
const SHORT_DATE_FORMATTER = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
});
const LONG_DATE_FORMATTER = new Intl.DateTimeFormat("pt-BR", {
  weekday: "long",
  day: "2-digit",
  month: "long",
  year: "numeric",
});
const TIME_FORMATTER = new Intl.DateTimeFormat("pt-BR", {
  hour: "2-digit",
  minute: "2-digit",
});
const RECURRENCE_LABELS: Record<EventFormState["recurrenceFrequency"], string> =
  {
    none: "Nao repetir",
    daily: "Diariamente",
    weekly: "Semanalmente",
    monthly: "Mensalmente",
  };

function SelectInput({ className = "", ...props }: SelectProps) {
  return (
    <select
      className={cn(
        "h-8 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
      {...props}
    />
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function endOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function startOfWeek(date: Date) {
  const day = date.getDay() || 7;
  return startOfDay(addDays(date, 1 - day));
}

function startOfMonthGrid(date: Date) {
  const first = new Date(date.getFullYear(), date.getMonth(), 1);
  return startOfWeek(first);
}

function monthRange(date: Date) {
  const start = startOfMonthGrid(date);
  return {
    from: start,
    to: endOfDay(addDays(start, 41)),
  };
}

function viewRange(view: CalendarView, date: Date) {
  if (view === "month") return monthRange(date);
  if (view === "week") {
    const from = startOfWeek(date);
    return { from, to: endOfDay(addDays(from, 6)) };
  }
  if (view === "day") {
    return { from: startOfDay(date), to: endOfDay(date) };
  }
  const from = startOfDay(addDays(date, -14));
  return { from, to: endOfDay(addDays(date, 45)) };
}

function formatTitle(view: CalendarView, date: Date) {
  if (view === "month") {
    return new Intl.DateTimeFormat("pt-BR", {
      month: "long",
      year: "numeric",
    }).format(date);
  }
  if (view === "week") {
    const start = startOfWeek(date);
    const end = addDays(start, 6);
    return `${formatShortDate(start)} - ${formatShortDate(end)}`;
  }
  return formatLongDate(date);
}

function formatShortDate(value: Date | string) {
  return SHORT_DATE_FORMATTER.format(new Date(value));
}

function formatLongDate(value: Date | string) {
  return LONG_DATE_FORMATTER.format(new Date(value));
}

function formatTime(value: string) {
  return TIME_FORMATTER.format(new Date(value));
}

function toDateTimeLocal(value: Date | string) {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

function localInputToIso(value: string) {
  return new Date(value).toISOString();
}

function combineDayAndTime(day: string, source: string) {
  const next = new Date(`${day}T00:00:00`);
  const time = new Date(source);
  next.setHours(time.getHours(), time.getMinutes(), time.getSeconds(), 0);
  return next;
}

function defaultEventForm(workspaceId = "", date = new Date()): EventFormState {
  const start = new Date(date);
  start.setMinutes(0, 0, 0);
  const end = new Date(start);
  end.setHours(start.getHours() + 1);

  return {
    workspaceId,
    projectId: "",
    taskId: "",
    title: "",
    description: "",
    startAt: toDateTimeLocal(start),
    endAt: toDateTimeLocal(end),
    allDay: false,
    meetingType: "online",
    location: "",
    visibility: "workspace",
    status: "confirmed",
    recurrenceFrequency: "none",
    recurrenceUntil: "",
    attendeeIds: [],
    reminderEnabled: false,
    reminderChannel: "in_app",
    reminderMinutesBefore: 30,
  };
}

function eventFormFromItem(item: CalendarItem): EventFormState {
  return {
    workspaceId: item.workspaceId,
    projectId: item.projectId ?? "",
    taskId: item.taskId ?? "",
    title: item.title,
    description: item.description ?? "",
    startAt: toDateTimeLocal(item.seriesStart ?? item.start),
    endAt: toDateTimeLocal(item.seriesEnd ?? item.end),
    allDay: item.allDay,
    meetingType:
      item.meetingType === "in_person" || item.meetingType === "external"
        ? item.meetingType
        : "online",
    location: item.location ?? "",
    visibility: item.visibility === "private" ? "private" : "workspace",
    status:
      item.status === "tentative" || item.status === "cancelled"
        ? item.status
        : "confirmed",
    recurrenceFrequency:
      item.recurrenceFrequency === "daily" ||
      item.recurrenceFrequency === "weekly" ||
      item.recurrenceFrequency === "monthly"
        ? item.recurrenceFrequency
        : "none",
    recurrenceUntil: item.recurrenceUntil
      ? toDateTimeLocal(item.recurrenceUntil)
      : "",
    attendeeIds: item.attendees.map((attendee) => attendee.id),
    reminderEnabled: item.reminders.length > 0,
    reminderChannel:
      item.reminders[0]?.channel === "email" ? "email" : "in_app",
    reminderMinutesBefore: item.reminders[0]?.minutesBefore ?? 30,
  };
}

function createPayloadFromForm(
  form: EventFormState,
): CreateCalendarEventRequest {
  const payload = basePayloadFromForm(form);
  return {
    workspaceId: form.workspaceId,
    ...payload,
  };
}

function updatePayloadFromForm(
  form: EventFormState,
): UpdateCalendarEventRequest {
  return basePayloadFromForm(form) as UpdateCalendarEventRequest;
}

function basePayloadFromForm(form: EventFormState) {
  return {
    projectId: form.projectId || null,
    taskId: form.taskId || null,
    title: form.title,
    description: form.description || null,
    startAt: localInputToIso(form.startAt),
    endAt: localInputToIso(form.endAt),
    allDay: form.allDay,
    meetingType: form.meetingType,
    location: form.location || null,
    visibility: form.visibility,
    status: form.status,
    recurrenceFrequency: form.recurrenceFrequency,
    recurrenceUntil:
      form.recurrenceFrequency === "none" || !form.recurrenceUntil
        ? null
        : localInputToIso(form.recurrenceUntil),
    attendeeIds: form.attendeeIds,
    reminders: form.reminderEnabled
      ? [
          {
            channel: form.reminderChannel,
            minutesBefore: form.reminderMinutesBefore,
          },
        ]
      : [],
  };
}

type MovedCalendarItem =
  | {
      start: string;
      end: string;
      patch: UpdateCalendarEventRequest;
      type: "event";
    }
  | {
      start: string;
      end: string;
      patch: UpdateCalendarTaskDatesRequest;
      type: "task";
    };

function moveItemToDay(item: CalendarItem, day: string): MovedCalendarItem {
  if (item.type === "event") {
    const eventItem = item as CalendarItem & {
      eventId?: string | null;
      id: string;
    };
    const oldStart = new Date(item.start);
    const oldEnd = new Date(item.end);
    const nextStart = item.allDay
      ? startOfDay(new Date(`${day}T00:00:00`))
      : combineDayAndTime(day, item.start);
    const nextEnd = new Date(
      nextStart.getTime() + Math.max(0, oldEnd.getTime() - oldStart.getTime()),
    );
    return {
      start: nextStart.toISOString(),
      end: nextEnd.toISOString(),
      patch: {
        eventId: eventItem.eventId ?? eventItem.id,
        startAt: nextStart.toISOString(),
        endAt: nextEnd.toISOString(),
      },
      type: "event",
    };
  }

  const hasStart = Boolean(item.taskStartDate);
  const hasDue = Boolean(item.taskDueDate);
  const oldStart = new Date(item.taskStartDate ?? item.start);
  const oldEnd = new Date(item.taskDueDate ?? item.end);
  const nextStart = startOfDay(new Date(`${day}T00:00:00`));
  const span = Math.max(
    0,
    startOfDay(oldEnd).getTime() - startOfDay(oldStart).getTime(),
  );
  const nextDue = new Date(nextStart.getTime() + span);

  return {
    start: (hasStart ? nextStart : nextDue).toISOString(),
    end: (hasDue ? nextDue : nextStart).toISOString(),
    patch: {
      taskId: item.id,
      startDate: hasStart ? nextStart.toISOString() : null,
      dueDate: hasDue ? nextDue.toISOString() : null,
    },
    type: "task",
  };
}

function MeetingTypeIcon({
  type,
  className,
}: {
  type?: string | null;
  className?: string;
}) {
  if (type === "in_person" || type === "external") {
    return <MapPin className={className} />;
  }
  return <Monitor className={className} />;
}

function CalendarEventChip({
  item,
  canMove,
  onOpen,
}: {
  item: CalendarItem;
  canMove: boolean;
  onOpen: (item: CalendarItem) => void;
}) {
  const isRecurringEvent =
    item.type === "event" && item.recurrenceFrequency !== "none";
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: item.id,
      data: { item },
      disabled: !canMove || isRecurringEvent,
    });

  return (
    <button
      ref={setNodeRef}
      type="button"
      className={cn(
        "group flex min-h-7 w-full cursor-grab items-center gap-1.5 rounded-md border px-2 py-1 text-left text-xs shadow-sm/5 transition active:cursor-grabbing",
        (!canMove || isRecurringEvent) &&
          "cursor-pointer active:cursor-pointer",
        item.type === "task"
          ? "border-blue-200 bg-blue-50 text-blue-950 dark:border-blue-900/70 dark:bg-blue-950/30 dark:text-blue-100"
          : "border-emerald-200 bg-emerald-50 text-emerald-950 dark:border-emerald-900/70 dark:bg-emerald-950/30 dark:text-emerald-100",
        isDragging && "opacity-60",
      )}
      style={{ transform: CSS.Translate.toString(transform) }}
      onClick={() => onOpen(item)}
      {...attributes}
      {...listeners}
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" />
      <span className="min-w-0 flex-1 truncate font-medium">
        {item.type === "task" && item.taskNumber ? `#${item.taskNumber} ` : ""}
        {item.title}
      </span>
      {item.type === "event" && (
        <span
          className="inline-flex shrink-0 items-center gap-1 text-[11px] opacity-70"
          title={
            item.meetingType
              ? MEETING_TYPE_LABELS[
                  item.meetingType as EventFormState["meetingType"]
                ]
              : "Online"
          }
        >
          <MeetingTypeIcon className="size-3" type={item.meetingType} />
          {item.recurrenceFrequency && item.recurrenceFrequency !== "none" && (
            <Repeat2 className="size-3" />
          )}
        </span>
      )}
      {!item.allDay && (
        <span className="shrink-0 text-[11px] opacity-70">
          {formatTime(item.start)}
        </span>
      )}
    </button>
  );
}

function CalendarCell({
  day,
  items,
  canMoveItem,
  currentMonth,
  onOpen,
}: {
  day: Date;
  items: CalendarItem[];
  canMoveItem: (item: CalendarItem) => boolean;
  currentMonth?: number;
  onOpen: (item: CalendarItem) => void;
}) {
  const dayKey = calendarDayKey(day);
  const { setNodeRef, isOver } = useDroppable({ id: `day:${dayKey}` });
  const isToday = dayKey === calendarDayKey(new Date());
  const muted = currentMonth !== undefined && day.getMonth() !== currentMonth;

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex min-h-32 flex-col gap-1 border-r border-b border-border/70 p-2 transition-colors",
        muted && "bg-muted/25 text-muted-foreground",
        isOver && "bg-primary/10",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className={cn(
            "flex size-6 items-center justify-center rounded-md text-xs font-semibold",
            isToday && "bg-primary text-primary-foreground",
          )}
        >
          {day.getDate()}
        </span>
        <span className="text-[11px] text-muted-foreground">
          {items.length || ""}
        </span>
      </div>
      <div className="flex min-h-0 flex-col gap-1">
        {items.slice(0, 4).map((item) => (
          <CalendarEventChip
            canMove={canMoveItem(item)}
            item={item}
            key={item.id}
            onOpen={onOpen}
          />
        ))}
        {items.length > 4 && (
          <div className="px-2 text-[11px] text-muted-foreground">
            +{items.length - 4} itens
          </div>
        )}
      </div>
    </div>
  );
}

function EventDialog({
  open,
  form,
  editing,
  members,
  projects,
  isPending,
  canDelete,
  canSave,
  onOpenChange,
  onChange,
  onSubmit,
  onDelete,
}: {
  open: boolean;
  form: EventFormState;
  editing?: CalendarItem | null;
  members: Array<{
    id: string;
    name: string;
    email: string;
    image?: string | null;
  }>;
  projects: Array<{ id: string; name: string }>;
  isPending: boolean;
  canDelete: boolean;
  canSave: boolean;
  onOpenChange: (open: boolean) => void;
  onChange: (form: EventFormState) => void;
  onSubmit: (event: FormEvent) => void;
  onDelete: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <form className="flex min-h-0 flex-col" onSubmit={onSubmit}>
          <DialogHeader>
            <DialogTitle>
              {editing ? "Editar compromisso" : "Novo compromisso"}
            </DialogTitle>
            <DialogDescription>
              Crie eventos independentes ou vinculados a um projeto.
            </DialogDescription>
          </DialogHeader>
          <DialogPanel>
            <fieldset
              className="grid gap-4 disabled:opacity-70 sm:grid-cols-2"
              disabled={!canSave || isPending}
            >
              <Field label="Titulo">
                <Input
                  required
                  value={form.title}
                  onChange={(event) =>
                    onChange({ ...form, title: event.target.value })
                  }
                />
              </Field>
              <Field label="Projeto">
                <SelectInput
                  value={form.projectId}
                  onChange={(event) =>
                    onChange({ ...form, projectId: event.target.value })
                  }
                >
                  <option value="">Sem projeto</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </SelectInput>
              </Field>
              <Field label="Inicio">
                <Input
                  required
                  type="datetime-local"
                  value={form.startAt}
                  onChange={(event) =>
                    onChange({ ...form, startAt: event.target.value })
                  }
                />
              </Field>
              <Field label="Fim">
                <Input
                  required
                  type="datetime-local"
                  value={form.endAt}
                  onChange={(event) =>
                    onChange({ ...form, endAt: event.target.value })
                  }
                />
              </Field>
              <Field label="Status">
                <SelectInput
                  value={form.status}
                  onChange={(event) =>
                    onChange({
                      ...form,
                      status: event.target.value as EventFormState["status"],
                    })
                  }
                >
                  <option value="confirmed">Confirmado</option>
                  <option value="tentative">Tentativo</option>
                  <option value="cancelled">Cancelado</option>
                </SelectInput>
              </Field>
              <Field label="Tipo">
                <SelectInput
                  value={form.meetingType}
                  onChange={(event) =>
                    onChange({
                      ...form,
                      meetingType: event.target
                        .value as EventFormState["meetingType"],
                      location:
                        event.target.value === "online" ? "" : form.location,
                    })
                  }
                >
                  {Object.entries(MEETING_TYPE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </SelectInput>
              </Field>
              <Field label="Visibilidade">
                <SelectInput
                  value={form.visibility}
                  onChange={(event) =>
                    onChange({
                      ...form,
                      visibility: event.target
                        .value as EventFormState["visibility"],
                    })
                  }
                >
                  <option value="workspace">Workspace</option>
                  <option value="private">Privado</option>
                </SelectInput>
              </Field>
              {form.meetingType !== "online" && (
                <Field
                  label={
                    form.meetingType === "external"
                      ? "Endereco externo"
                      : "Endereco"
                  }
                >
                  <Input
                    value={form.location}
                    onChange={(event) =>
                      onChange({ ...form, location: event.target.value })
                    }
                  />
                </Field>
              )}
              <div className="flex items-end gap-2">
                <Checkbox
                  id="calendar-event-all-day"
                  checked={form.allDay}
                  onCheckedChange={(checked) =>
                    onChange({ ...form, allDay: checked === true })
                  }
                />
                <Label htmlFor="calendar-event-all-day">Dia inteiro</Label>
              </div>
              <Field label="Recorrencia">
                <SelectInput
                  value={form.recurrenceFrequency}
                  onChange={(event) =>
                    onChange({
                      ...form,
                      recurrenceFrequency: event.target
                        .value as EventFormState["recurrenceFrequency"],
                      recurrenceUntil:
                        event.target.value === "none"
                          ? ""
                          : form.recurrenceUntil,
                    })
                  }
                >
                  {Object.entries(RECURRENCE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </SelectInput>
              </Field>
              {form.recurrenceFrequency !== "none" && (
                <Field label="Repetir ate">
                  <Input
                    type="datetime-local"
                    value={form.recurrenceUntil}
                    onChange={(event) =>
                      onChange({
                        ...form,
                        recurrenceUntil: event.target.value,
                      })
                    }
                  />
                </Field>
              )}
              <Field label="Participantes">
                <div className="max-h-36 overflow-y-auto rounded-lg border border-input bg-background p-1.5">
                  {members.length === 0 ? (
                    <p className="px-2 py-3 text-muted-foreground text-sm">
                      Nenhum membro no workspace.
                    </p>
                  ) : (
                    members.map((member) => {
                      const checked = form.attendeeIds.includes(member.id);
                      const checkboxId = `calendar-attendee-${member.id}`;
                      return (
                        <div
                          className={cn(
                            "flex min-h-10 cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm transition hover:bg-muted/70",
                            checked && "bg-primary/10 text-primary",
                          )}
                          key={member.id}
                        >
                          <Checkbox
                            id={checkboxId}
                            checked={checked}
                            onCheckedChange={(isChecked) =>
                              onChange({
                                ...form,
                                attendeeIds:
                                  isChecked === true
                                    ? [...form.attendeeIds, member.id]
                                    : form.attendeeIds.filter(
                                        (id) => id !== member.id,
                                      ),
                              })
                            }
                          />
                          <Label
                            className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 font-normal"
                            htmlFor={checkboxId}
                          >
                            <Avatar className="size-6">
                              <AvatarImage src={member.image ?? undefined} />
                              <AvatarFallback className="text-[10px]">
                                {getInitials(member.name)}
                              </AvatarFallback>
                            </Avatar>
                            <span className="min-w-0 flex-1 truncate">
                              {member.name}
                            </span>
                          </Label>
                          {checked && <Check className="size-4" />}
                        </div>
                      );
                    })
                  )}
                </div>
              </Field>
              <Field label="Descricao">
                <textarea
                  className="min-h-24 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={form.description}
                  onChange={(event) =>
                    onChange({ ...form, description: event.target.value })
                  }
                />
              </Field>
              <div className="space-y-3 sm:col-span-2">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="calendar-event-reminder"
                    checked={form.reminderEnabled}
                    onCheckedChange={(checked) =>
                      onChange({ ...form, reminderEnabled: checked === true })
                    }
                  />
                  <Label htmlFor="calendar-event-reminder">Lembrete</Label>
                </div>
                {form.reminderEnabled && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Canal">
                      <SelectInput
                        value={form.reminderChannel}
                        onChange={(event) =>
                          onChange({
                            ...form,
                            reminderChannel: event.target
                              .value as EventFormState["reminderChannel"],
                          })
                        }
                      >
                        <option value="in_app">In-app</option>
                        <option value="email">Email</option>
                      </SelectInput>
                    </Field>
                    <Field label="Minutos antes">
                      <Input
                        min={0}
                        type="number"
                        value={form.reminderMinutesBefore}
                        onChange={(event) =>
                          onChange({
                            ...form,
                            reminderMinutesBefore: Number(event.target.value),
                          })
                        }
                      />
                    </Field>
                  </div>
                )}
              </div>
            </fieldset>
          </DialogPanel>
          <DialogFooter className="gap-2 sm:justify-between" variant="bare">
            {editing && canDelete ? (
              <Button
                type="button"
                variant="destructive"
                onClick={onDelete}
                disabled={isPending}
              >
                <Trash2 />
                Excluir
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancelar
              </Button>
              <Button disabled={!canSave || isPending} type="submit">
                {editing ? "Salvar" : "Criar"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CalendarPage() {
  const queryClient = useQueryClient();
  const activeWorkspace = useActiveWorkspace();
  const {
    canCreateCalendar,
    canDeleteCalendar,
    canUpdateTasks,
    canUpdateCalendar,
    canViewCalendar,
    isCheckingPermissions,
  } = useWorkspacePermission();
  const [view, setView] = useState<CalendarView>("month");
  const [date, setDate] = useState(() => new Date());
  const workspaceId = activeWorkspace.data?.id ?? "";
  const [projectId, setProjectId] = useState("");
  const [personId, setPersonId] = useState("");
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [type, setType] = useState<"" | "task" | "event">("");
  const [mine, setMine] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarItem | null>(null);
  const [eventForm, setEventForm] = useState<EventFormState>(() =>
    defaultEventForm(""),
  );
  const [selectedTask, setSelectedTask] = useState<CalendarItem | null>(null);

  useEffect(() => {
    if (!workspaceId) return;
    setProjectId("");
    setPersonId("");
  }, [workspaceId]);

  const range = useMemo(() => viewRange(view, date), [date, view]);
  const calendarQuery = useMemo(
    () => ({
      from: range.from.toISOString(),
      to: range.to.toISOString(),
      workspaceId,
      ...(projectId ? { projectId } : {}),
      ...(personId && type === "event" ? { attendeeId: personId } : {}),
      ...(personId && type !== "event" ? { assigneeId: personId } : {}),
      ...(status ? { status } : {}),
      ...(priority ? { priority } : {}),
      ...(type ? { type } : {}),
      ...(mine ? { mine: "true" as const } : {}),
    }),
    [
      range.from,
      range.to,
      workspaceId,
      projectId,
      personId,
      status,
      priority,
      type,
      mine,
    ],
  );
  const { data, isLoading, refetch } = useCalendarItems(
    calendarQuery,
    Boolean(workspaceId),
  );
  const { data: projects = [] } = useGetProjects({ workspaceId });
  const { data: members = [] } = useWorkspaceMembers(workspaceId);
  const createEvent = useCreateCalendarEvent();
  const updateEvent = useUpdateCalendarEvent();
  const deleteEvent = useDeleteCalendarEvent();
  const updateTaskDates = useUpdateCalendarTaskDates();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );
  const items = data?.items ?? [];
  const itemsByDay = useMemo(
    () => groupCalendarItemsByDay(items, range.from, range.to),
    [items, range.from, range.to],
  );
  const todayItems =
    itemsByDay.get(calendarDayKey(new Date())) ?? EMPTY_CALENDAR_ITEMS;
  const hasCalendarAccess = canViewCalendar();
  const canCreateEvents = canCreateCalendar();
  const canUpdateItems = canUpdateCalendar();
  const canMoveTaskItems = canUpdateItems && canUpdateTasks();
  const canDeleteEvents = canDeleteCalendar();

  function canMoveItem(item: CalendarItem) {
    if (item.type === "task") return canMoveTaskItems;
    return canUpdateItems;
  }

  const days = useMemo(() => {
    if (view === "month") {
      return Array.from({ length: 42 }, (_, index) =>
        addDays(range.from, index),
      );
    }
    if (view === "week") {
      return Array.from({ length: 7 }, (_, index) =>
        addDays(range.from, index),
      );
    }
    return [date];
  }, [date, range.from, view]);

  function openCreateEvent(day = date) {
    if (!workspaceId || !canCreateEvents) return;
    setEditingEvent(null);
    setEventForm(defaultEventForm(workspaceId, day));
    setDialogOpen(true);
  }

  function openItem(item: CalendarItem) {
    if (item.type === "task") {
      setSelectedTask(item);
      return;
    }
    setEditingEvent(item);
    setEventForm(eventFormFromItem(item));
    setDialogOpen(true);
  }

  async function handleEventSubmit(event: FormEvent) {
    event.preventDefault();
    if (editingEvent) {
      if (!canUpdateItems) return;
      await updateEvent.mutateAsync({
        ...updatePayloadFromForm(eventForm),
        eventId: editingEvent.eventId ?? editingEvent.id,
      });
    } else {
      if (!canCreateEvents) return;
      await createEvent.mutateAsync(createPayloadFromForm(eventForm));
    }
    setDialogOpen(false);
  }

  async function handleDeleteEvent() {
    if (!editingEvent || !canDeleteEvents) return;
    await deleteEvent.mutateAsync(editingEvent.eventId ?? editingEvent.id);
    setDialogOpen(false);
  }

  async function handleDragEnd(event: DragEndEvent) {
    const item = event.active.data.current?.item as CalendarItem | undefined;
    const overId = String(event.over?.id ?? "");
    if (!item || !overId.startsWith("day:")) return;
    if (!canMoveItem(item)) return;
    const day = overId.slice(4);
    const moved = moveItemToDay(item, day);
    const previous = queryClient.getQueryData<CalendarItemsResponse>([
      "calendar",
      calendarQuery,
    ]);

    queryClient.setQueryData<CalendarItemsResponse>(
      ["calendar", calendarQuery],
      (current) =>
        current
          ? {
              items: current.items.map((currentItem) =>
                currentItem.id === item.id
                  ? { ...currentItem, start: moved.start, end: moved.end }
                  : currentItem,
              ),
            }
          : current,
    );

    try {
      if (moved.type === "event") {
        await updateEvent.mutateAsync(moved.patch);
      } else {
        await updateTaskDates.mutateAsync(moved.patch);
      }
    } catch (error) {
      queryClient.setQueryData(["calendar", calendarQuery], previous);
      throw error;
    }
  }

  function shiftDate(direction: -1 | 1) {
    if (view === "month") {
      setDate(new Date(date.getFullYear(), date.getMonth() + direction, 1));
      return;
    }
    setDate(addDays(date, direction * (view === "week" ? 7 : 1)));
  }

  if (isCheckingPermissions || activeWorkspace.isLoading) {
    return (
      <Layout>
        <PageTitle title="Agenda" />
        <Layout.Content className="overflow-auto">
          <div className="grid gap-3 p-3 md:grid-cols-2 xl:grid-cols-4">
            {Array.from(
              { length: 8 },
              (_, index) => `calendar-permission-skeleton-${index}`,
            ).map((key) => (
              <Skeleton className="h-36 rounded-lg" key={key} />
            ))}
          </div>
        </Layout.Content>
      </Layout>
    );
  }

  if (!workspaceId) {
    return (
      <Layout>
        <PageTitle title="Agenda" />
        <div className="flex h-full items-center justify-center p-6 text-muted-foreground">
          Selecione um workspace para abrir a agenda.
        </div>
      </Layout>
    );
  }

  if (!hasCalendarAccess) {
    return (
      <Layout>
        <PageTitle title="Agenda" />
        <div className="flex h-full items-center justify-center p-6">
          <Card className="max-w-md rounded-lg">
            <CardContent className="space-y-3 p-6 text-center">
              <CalendarDays className="mx-auto size-8 text-muted-foreground" />
              <h1 className="font-semibold text-lg">Acesso restrito</h1>
              <p className="text-muted-foreground text-sm">
                Seu papel neste workspace nao possui permissao para visualizar a
                agenda.
              </p>
            </CardContent>
          </Card>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <PageTitle title="Agenda" />
      <Layout.Header className="h-auto flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <CalendarDays className="size-4 text-muted-foreground" />
          <div>
            <h1 className="font-semibold text-sm">Agenda</h1>
            <p className="text-muted-foreground text-xs">
              {formatTitle(view, date)}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => shiftDate(-1)}>
            <ChevronLeft />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDate(new Date())}
          >
            Hoje
          </Button>
          <Button variant="outline" size="sm" onClick={() => shiftDate(1)}>
            <ChevronRight />
          </Button>
          <Button
            disabled={!workspaceId}
            variant="outline"
            size="sm"
            onClick={() => refetch()}
          >
            <RefreshCw />
          </Button>
          <Button
            disabled={!workspaceId || !canCreateEvents}
            size="sm"
            onClick={() => openCreateEvent()}
          >
            <Plus />
            Compromisso
          </Button>
        </div>
      </Layout.Header>
      <Layout.Content className="overflow-auto">
        <div className="flex min-h-full flex-col gap-3 p-3">
          <div className="grid gap-2 lg:grid-cols-[1fr_auto]">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
              <SelectInput
                disabled={!workspaceId}
                value={projectId}
                onChange={(event) => setProjectId(event.target.value)}
              >
                <option value="">Todos os projetos</option>
                {projects?.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </SelectInput>
              <SelectInput
                disabled={!workspaceId}
                value={personId}
                onChange={(event) => setPersonId(event.target.value)}
              >
                <option value="">Pessoas</option>
                {members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name}
                  </option>
                ))}
              </SelectInput>
              <SelectInput
                value={type}
                onChange={(event) => {
                  setType(event.target.value as "" | "task" | "event");
                  setPriority("");
                }}
              >
                <option value="">Tudo</option>
                <option value="task">Tarefas</option>
                <option value="event">Compromissos</option>
              </SelectInput>
              <SelectInput
                value={status}
                onChange={(event) => setStatus(event.target.value)}
              >
                <option value="">Status</option>
                {(type === "event" ? EVENT_STATUSES : TASK_STATUSES).map(
                  (value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ),
                )}
              </SelectInput>
              <SelectInput
                disabled={type === "event"}
                value={priority}
                onChange={(event) => setPriority(event.target.value)}
              >
                <option value="">Prioridade</option>
                {PRIORITIES.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </SelectInput>
            </div>
            <div className="flex items-center justify-between gap-2">
              <div className="flex h-8 items-center gap-2 rounded-lg border border-border px-2.5 text-sm">
                <Checkbox
                  id="calendar-mine"
                  checked={mine}
                  onCheckedChange={(checked) => setMine(checked === true)}
                />
                <Label htmlFor="calendar-mine">Meus itens</Label>
              </div>
              <Tabs
                value={view}
                onValueChange={(value) => setView(value as CalendarView)}
              >
                <TabsList>
                  {Object.entries(VIEW_LABELS).map(([value, label]) => (
                    <TabsTrigger key={value} value={value}>
                      {value === "list" ? <List /> : <CalendarDays />}
                      {label}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            </div>
          </div>

          {isLoading ? (
            <div className="grid flex-1 gap-2 md:grid-cols-2 xl:grid-cols-4">
              {Array.from(
                { length: 8 },
                (_, index) => `calendar-skeleton-${index}`,
              ).map((key) => (
                <Skeleton className="h-36 rounded-lg" key={key} />
              ))}
            </div>
          ) : view === "list" ? (
            <div className="space-y-2">
              {items.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  onClick={() => openItem(item)}
                  className="flex w-full items-center gap-3 rounded-lg border border-border bg-card p-3 text-left hover:bg-muted/40"
                >
                  <Badge
                    variant={item.type === "task" ? "secondary" : "default"}
                  >
                    {item.type === "task" ? "Tarefa" : "Compromisso"}
                  </Badge>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">
                      {item.title}
                    </div>
                    <div className="text-muted-foreground text-xs">
                      {formatLongDate(item.start)} ·{" "}
                      {item.projectName ?? item.workspaceName}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    {item.type === "event" && (
                      <>
                        <MeetingTypeIcon
                          className="size-4"
                          type={item.meetingType}
                        />
                        {item.recurrenceFrequency &&
                          item.recurrenceFrequency !== "none" && (
                            <Repeat2 className="size-4" />
                          )}
                      </>
                    )}
                    <Clock className="size-4" />
                  </div>
                </button>
              ))}
              {items.length === 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Nenhum item no periodo</CardTitle>
                  </CardHeader>
                </Card>
              )}
            </div>
          ) : (
            <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
              <Card className="overflow-hidden">
                <CardPanel className="p-0">
                  <div className="grid grid-cols-7 border-t border-l border-border/70 bg-muted/30">
                    {WEEKDAYS.map((weekday) => (
                      <div
                        className="border-r border-b border-border/70 px-2 py-1.5 text-xs font-medium text-muted-foreground"
                        key={weekday}
                      >
                        {weekday}
                      </div>
                    ))}
                    {days.map((day) => (
                      <CalendarCell
                        canMoveItem={canMoveItem}
                        key={calendarDayKey(day)}
                        day={day}
                        items={
                          itemsByDay.get(calendarDayKey(day)) ??
                          EMPTY_CALENDAR_ITEMS
                        }
                        currentMonth={
                          view === "month" ? date.getMonth() : undefined
                        }
                        onOpen={openItem}
                      />
                    ))}
                  </div>
                </CardPanel>
              </Card>
            </DndContext>
          )}

          <div className="grid gap-3 lg:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Hoje</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {todayItems.slice(0, 5).map((item) => (
                  <button
                    className="flex w-full items-center justify-between gap-2 rounded-md border border-border px-2 py-1.5 text-left text-xs"
                    key={item.id}
                    type="button"
                    onClick={() => openItem(item)}
                  >
                    <span className="truncate">{item.title}</span>
                    <Badge variant="outline">{item.type}</Badge>
                  </button>
                ))}
                {todayItems.length === 0 && (
                  <p className="text-muted-foreground text-sm">
                    Sem itens hoje.
                  </p>
                )}
              </CardContent>
            </Card>
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-sm">Pessoas no periodo</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {Array.from(
                  new Map(
                    items
                      .flatMap((item) => [...item.assignees, ...item.attendees])
                      .map((person) => [person.id, person]),
                  ).values(),
                ).map((person) => (
                  <div
                    className="flex items-center gap-2 rounded-full border border-border px-2 py-1 text-xs"
                    key={person.id}
                  >
                    <Avatar className="size-5">
                      <AvatarImage src={person.image ?? undefined} />
                      <AvatarFallback>
                        {getInitials(person.name)}
                      </AvatarFallback>
                    </Avatar>
                    {person.name}
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      </Layout.Content>

      <EventDialog
        open={dialogOpen}
        editing={editingEvent}
        form={eventForm}
        members={members}
        projects={projects ?? []}
        isPending={
          createEvent.isPending ||
          updateEvent.isPending ||
          deleteEvent.isPending
        }
        canDelete={canDeleteEvents}
        canSave={editingEvent ? canUpdateItems : canCreateEvents}
        onOpenChange={setDialogOpen}
        onChange={setEventForm}
        onSubmit={handleEventSubmit}
        onDelete={handleDeleteEvent}
      />

      {selectedTask?.projectId && selectedTask.taskId && (
        <TaskDetailsSheet
          taskId={selectedTask.taskId}
          projectId={selectedTask.projectId}
          workspaceId={selectedTask.workspaceId}
          onClose={() => setSelectedTask(null)}
        />
      )}
    </Layout>
  );
}
