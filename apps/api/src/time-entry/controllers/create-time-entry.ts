import { createId } from "@paralleldrive/cuid2";
import { eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { taskTable, timeEntryTable } from "../../database/schema";
import { publishEvent } from "../../events";
import { audit } from "../../finance/portfolio/controller";
import { guardSiteTime, validTimes } from "../site-guard";

async function createTimeEntry({
  taskId,
  userId,
  description,
  startTime,
  endTime,
}: {
  taskId: string;
  userId: string;
  description?: string;
  startTime: Date;
  endTime?: Date;
  duration?: number;
}) {
  validTimes(startTime, endTime);
  const createdTimeEntry = await db.transaction(async (tx) => {
    const workspaceId = await guardSiteTime(
      tx,
      taskId,
      userId,
      startTime,
      endTime,
    );
    const [entry] = await tx
      .insert(timeEntryTable)
      .values({
        id: createId(),
        taskId,
        userId,
        description: description || "",
        startTime,
        endTime: endTime || null,
        duration: endTime
          ? Math.floor((endTime.getTime() - startTime.getTime()) / 1000)
          : 0,
      })
      .returning();
    if (entry && workspaceId)
      await audit(
        tx,
        workspaceId,
        userId,
        entry.id,
        "time-created",
        null,
        entry,
      );
    return entry;
  });

  if (!createdTimeEntry) {
    throw new HTTPException(500, {
      message: "Failed to create time entry",
    });
  }

  const [task] = await db
    .select({ userId: taskTable.userId, title: taskTable.title })
    .from(taskTable)
    .where(eq(taskTable.id, taskId));

  await publishEvent("time-entry.created", {
    timeEntryId: createdTimeEntry.id,
    taskId: createdTimeEntry.taskId,
    userId,
    type: "create",
    content: "started time tracking",
    taskOwnerId: task?.userId,
    taskTitle: task?.title,
  });

  return createdTimeEntry;
}

export default createTimeEntry;
