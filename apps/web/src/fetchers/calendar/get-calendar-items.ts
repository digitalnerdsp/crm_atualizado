import { client } from "@kaneo/libs";
import type { InferResponseType } from "hono/client";

export type CalendarItemsResponse = InferResponseType<
  (typeof client)["calendar"]["$get"]
>;

export type CalendarItem = CalendarItemsResponse["items"][number];

export type CalendarItemsQuery = {
  from: string;
  to: string;
  workspaceId?: string;
  projectId?: string;
  assigneeId?: string;
  attendeeId?: string;
  status?: string;
  priority?: string;
  type?: "task" | "event";
  mine?: "true" | "false";
};

export async function getCalendarItems(query: CalendarItemsQuery) {
  const response = await client.calendar.$get({ query });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }

  return response.json();
}
