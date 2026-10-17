import { client } from "@kaneo/libs";

export async function setTaskRecurrenceActive(
  taskId: string,
  isActive: boolean,
) {
  const response = await client.task.recurrence[":id"].active.$patch({
    param: { id: taskId },
    json: { isActive },
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
}
