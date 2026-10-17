import { eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { taskTable } from "../../database/schema";
import {
  listTaskAssignees,
  normalizeAssigneeIds,
  setTaskAssignees,
} from "../assignees";

async function updateTaskAssignee({
  id,
  userId,
  assigneeIds,
  currentUserId,
}: {
  id: string;
  userId?: string | null;
  assigneeIds?: string[];
  currentUserId: string;
}) {
  const existingTask = await db.query.taskTable.findFirst({
    where: eq(taskTable.id, id),
  });

  if (!existingTask) {
    throw new HTTPException(404, {
      message: "Task not found",
    });
  }

  const normalizedAssigneeIds = normalizeAssigneeIds(
    assigneeIds ?? (userId ? [userId] : []),
  );

  await setTaskAssignees({
    taskId: id,
    assigneeIds: normalizedAssigneeIds,
    currentUserId,
  });

  const [updatedTask] = await db
    .select()
    .from(taskTable)
    .where(eq(taskTable.id, id))
    .limit(1);

  const assigneesByTask = await listTaskAssignees([id]);

  return {
    ...(updatedTask ?? existingTask),
    assignees: assigneesByTask.get(id) ?? [],
  };
}

export default updateTaskAssignee;
