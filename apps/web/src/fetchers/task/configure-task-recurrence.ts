import { client } from "@kaneo/libs";
import type { InferRequestType } from "hono/client";

type ConfigureRecurrenceRequest = InferRequestType<
  (typeof client)["task"]["recurrence"][":id"]["$post"]
>;

export type ConfigureTaskRecurrenceInput =
  ConfigureRecurrenceRequest["json"] & {
    taskId: string;
  };

export async function configureTaskRecurrence({
  taskId,
  ...json
}: ConfigureTaskRecurrenceInput) {
  const response = await client.task.recurrence[":id"].$post({
    param: { id: taskId },
    json,
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
}
