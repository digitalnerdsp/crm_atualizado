import { describe, expect, it } from "vitest";
import { calendarOccurrenceStarts } from "../../apps/api/src/calendar/recurrence";

describe("calendarOccurrenceStarts", () => {
  it("finds occurrences beyond the former one-thousand item limit", () => {
    const occurrences = calendarOccurrenceStarts({
      frequency: "daily",
      startsAt: new Date("2020-01-01T12:00:00.000Z"),
      durationMs: 60 * 60 * 1000,
      recurrenceUntil: null,
      rangeStart: new Date("2026-07-01T00:00:00.000Z"),
      rangeEnd: new Date("2026-07-03T23:59:59.999Z"),
    });

    expect(occurrences.map((date) => date.toISOString())).toEqual([
      "2026-07-01T12:00:00.000Z",
      "2026-07-02T12:00:00.000Z",
      "2026-07-03T12:00:00.000Z",
    ]);
  });

  it("includes an occurrence that starts before and overlaps the range", () => {
    const occurrences = calendarOccurrenceStarts({
      frequency: "weekly",
      startsAt: new Date("2026-07-01T12:00:00.000Z"),
      durationMs: 2 * 24 * 60 * 60 * 1000,
      recurrenceUntil: null,
      rangeStart: new Date("2026-07-02T00:00:00.000Z"),
      rangeEnd: new Date("2026-07-02T23:59:59.999Z"),
    });

    expect(occurrences.map((date) => date.toISOString())).toEqual([
      "2026-07-01T12:00:00.000Z",
    ]);
  });

  it("honors the recurrence end date", () => {
    const occurrences = calendarOccurrenceStarts({
      frequency: "daily",
      startsAt: new Date("2026-07-01T12:00:00.000Z"),
      durationMs: 60 * 60 * 1000,
      recurrenceUntil: new Date("2026-07-02T12:00:00.000Z"),
      rangeStart: new Date("2026-07-01T00:00:00.000Z"),
      rangeEnd: new Date("2026-07-05T23:59:59.999Z"),
    });

    expect(occurrences).toHaveLength(2);
  });
});
