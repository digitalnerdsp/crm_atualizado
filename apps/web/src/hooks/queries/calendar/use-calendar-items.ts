import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  type CalendarItemsQuery,
  getCalendarItems,
} from "@/fetchers/calendar/get-calendar-items";

export function useCalendarItems(query: CalendarItemsQuery, enabled = true) {
  return useQuery({
    queryKey: ["calendar", query],
    queryFn: () => getCalendarItems(query),
    enabled,
    placeholderData: keepPreviousData,
    retry: false,
    staleTime: 15_000,
  });
}
