import rrule from "rrule";

const { RRule } = rrule;

export type CalendarRecurrenceFrequency = "daily" | "weekly" | "monthly";

const FREQUENCY_MAP: Record<CalendarRecurrenceFrequency, number> = {
  daily: RRule.DAILY,
  weekly: RRule.WEEKLY,
  monthly: RRule.MONTHLY,
};

export function calendarOccurrenceStarts(input: {
  frequency: CalendarRecurrenceFrequency;
  startsAt: Date;
  durationMs: number;
  recurrenceUntil: Date | null;
  rangeStart: Date;
  rangeEnd: Date;
}) {
  const rule = new RRule({
    freq: FREQUENCY_MAP[input.frequency],
    dtstart: input.startsAt,
    until: input.recurrenceUntil ?? undefined,
    bymonthday:
      input.frequency === "monthly" ? input.startsAt.getUTCDate() : undefined,
  });
  const earliestOverlappingStart = new Date(
    input.rangeStart.getTime() - input.durationMs,
  );

  return rule.between(earliestOverlappingStart, input.rangeEnd, true);
}
