import { client } from "@kaneo/libs";
import type { InferRequestType } from "hono/client";

export type CreateTaskRequest = InferRequestType<
  (typeof client)["task"][":projectId"]["$post"]
>["json"] &
  InferRequestType<(typeof client)["task"][":projectId"]["$post"]>["param"];
type TaskPriority = CreateTaskRequest["priority"];

const taskPriorities = [
  "no-priority",
  "low",
  "medium",
  "high",
  "urgent",
] as const;

function normalizePriority(value: string): TaskPriority {
  return taskPriorities.includes(value as TaskPriority)
    ? (value as TaskPriority)
    : "no-priority";
}

async function createTask(
  title: string,
  description: string,
  projectId: string,
  userId: string,
  assigneeIds: string[] | undefined,
  status: string,
  startDate: Date | undefined,
  dueDate: Date | undefined,
  priority: string,
  recurrence: CreateTaskRequest["recurrence"],
) {
  if (!projectId) {
    throw new Error("No project selected for task creation");
  }

  const response = await client.task[":projectId"].$post({
    json: {
      title,
      description,
      userId,
      assigneeIds,
      status,
      startDate: startDate?.toISOString() || undefined,
      dueDate: dueDate?.toISOString() || undefined,
      priority: normalizePriority(priority),
      recurrence,
    },
    param: { projectId },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }

  const data = await response.json();

  return data;
}

export default createTask;
