type CalendarDateItem = {
  start: string;
  end: string;
};

export function calendarDayKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function groupCalendarItemsByDay<T extends CalendarDateItem>(
  items: T[],
  rangeStart: Date,
  rangeEnd: Date,
) {
  const groupedItems = new Map<string, T[]>();
  const minimumTime = rangeStart.getTime();
  const maximumTime = rangeEnd.getTime();

  for (const item of items) {
    const itemStart = new Date(item.start).getTime();
    const itemEnd = new Date(item.end).getTime();
    if (
      !Number.isFinite(itemStart) ||
      !Number.isFinite(itemEnd) ||
      itemEnd < minimumTime ||
      itemStart > maximumTime
    ) {
      continue;
    }

    const cursor = new Date(Math.max(itemStart, minimumTime));
    cursor.setHours(0, 0, 0, 0);
    const lastDay = new Date(Math.min(itemEnd, maximumTime));
    lastDay.setHours(0, 0, 0, 0);

    while (cursor <= lastDay) {
      const key = calendarDayKey(cursor);
      const dayItems = groupedItems.get(key);
      if (dayItems) {
        dayItems.push(item);
      } else {
        groupedItems.set(key, [item]);
      }
      cursor.setDate(cursor.getDate() + 1);
    }
  }

  return groupedItems;
}
