import { client } from "@kaneo/libs";
import type Task from "@/types/task";

const taskPriorities = [
  "no-priority",
  "low",
  "medium",
  "high",
  "urgent",
] as const;

type TaskPriority = (typeof taskPriorities)[number];

function normalizePriority(value: string | null): TaskPriority {
  return taskPriorities.includes(value as TaskPriority)
    ? (value as TaskPriority)
    : "no-priority";
}

async function updateTaskPriority(taskId: string, task: Task) {
  const response = await client.task.priority[":id"].$put({
    param: { id: taskId },
    json: {
      priority: normalizePriority(task.priority),
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }

  const data = await response.json();

  return data;
}

export default updateTaskPriority;
