import { client } from "@kaneo/libs";
import type { InferRequestType } from "hono/client";

export type CreateCalendarEventRequest = InferRequestType<
  (typeof client)["calendar"]["events"]["$post"]
>["json"];

export type UpdateCalendarEventRequest = InferRequestType<
  (typeof client)["calendar"]["events"][":eventId"]["$patch"]
>["json"] & { eventId: string };

export type UpdateCalendarTaskDatesRequest = InferRequestType<
  (typeof client)["calendar"]["tasks"][":taskId"]["dates"]["$patch"]
>["json"] & { taskId: string };

async function assertOk(response: Response) {
  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }
}

export async function createCalendarEvent(input: CreateCalendarEventRequest) {
  const response = await client.calendar.events.$post({ json: input });
  await assertOk(response);
  return response.json();
}

export async function updateCalendarEvent(input: UpdateCalendarEventRequest) {
  const { eventId, ...json } = input;
  const response = await client.calendar.events[":eventId"].$patch({
    param: { eventId },
    json,
  });
  await assertOk(response);
  return response.json();
}

export async function deleteCalendarEvent(eventId: string) {
  const response = await client.calendar.events[":eventId"].$delete({
    param: { eventId },
  });
  await assertOk(response);
  return response.json();
}

export async function updateCalendarTaskDates(
  input: UpdateCalendarTaskDatesRequest,
) {
  const { taskId, ...json } = input;
  const response = await client.calendar.tasks[":taskId"].dates.$patch({
    param: { taskId },
    json,
  });
  await assertOk(response);
  return response.json();
}
