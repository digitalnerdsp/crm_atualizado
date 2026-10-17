import { describe, expect, it } from "vitest";
import { calendarDayKey, groupCalendarItemsByDay } from "./calendar-items";

describe("groupCalendarItemsByDay", () => {
  it("indexes an item on every day it overlaps", () => {
    const item = {
      id: "item-1",
      start: "2026-07-10T12:00:00.000Z",
      end: "2026-07-12T12:00:00.000Z",
    };

    const result = groupCalendarItemsByDay(
      [item],
      new Date("2026-07-01T00:00:00.000Z"),
      new Date("2026-07-31T23:59:59.999Z"),
    );

    expect(result.get("2026-07-10")).toEqual([item]);
    expect(result.get("2026-07-11")).toEqual([item]);
    expect(result.get("2026-07-12")).toEqual([item]);
  });

  it("limits long items to the visible range", () => {
    const item = {
      id: "item-1",
      start: "2020-01-01T00:00:00.000Z",
      end: "2030-01-01T00:00:00.000Z",
    };

    const result = groupCalendarItemsByDay(
      [item],
      new Date(2026, 6, 10, 0, 0, 0, 0),
      new Date(2026, 6, 12, 23, 59, 59, 999),
    );

    expect([...result.keys()]).toEqual([
      "2026-07-10",
      "2026-07-11",
      "2026-07-12",
    ]);
  });
});

describe("calendarDayKey", () => {
  it("uses the local calendar date", () => {
    expect(calendarDayKey(new Date(2026, 6, 8))).toBe("2026-07-08");
  });
});
