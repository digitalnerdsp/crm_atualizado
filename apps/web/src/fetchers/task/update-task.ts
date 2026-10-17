import { client } from "@kaneo/libs";
import type Task from "@/types/task";
import { getTaskApiErrorMessage } from "./task-api-error";

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

async function updateTask(taskId: string, task: Task) {
  const response = await client.task[":id"].$put({
    param: { id: taskId },
    json: {
      userId: task.userId || "",
      assigneeIds: task.assignees?.map((assignee) => assignee.id),
      title: task.title,
      description: task.description || "",
      status: task.status,
      priority: normalizePriority(task.priority),
      startDate: task.startDate?.toString(),
      dueDate: task.dueDate?.toString(),
      position: task.position ?? 0,
      projectId: task.projectId,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(getTaskApiErrorMessage(error));
  }

  const data = await response.json();

  return data;
}

export default updateTask;
