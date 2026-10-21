import { eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { financeSiteTaskTable, timeEntryTable } from "../../database/schema";
import { audit } from "../../finance/portfolio/controller";
import { guardSiteTime, validTimes } from "../site-guard";

type UpdateTimeEntryParams = {
  actorUserId?: string;
  canManage?: boolean;
  timeEntryId: string;
  startTime: Date;
  endTime?: Date;
  description?: string;
};

async function updateTimeEntry(params: UpdateTimeEntryParams) {
  const { timeEntryId, startTime, endTime, description } = params;

  const [existingTimeEntry] = await db
    .select()
    .from(timeEntryTable)
    .where(eq(timeEntryTable.id, timeEntryId));

  if (!existingTimeEntry) {
    throw new HTTPException(404, {
      message: "Time entry not found",
    });
  }

  // Calculate duration if both startTime and endTime are provided
  let duration: number | null = null;
  if (endTime) {
    duration = Math.floor((endTime.getTime() - startTime.getTime()) / 1000); // duration in seconds
  }

  validTimes(startTime, endTime);
  const updatedTimeEntry = await db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(timeEntryTable)
      .where(eq(timeEntryTable.id, timeEntryId))
      .for("update");
    if (!current)
      throw new HTTPException(404, { message: "Apontamento não encontrado." });
    const [link] = await tx
      .select()
      .from(financeSiteTaskTable)
      .where(eq(financeSiteTaskTable.taskId, current.taskId));
    if (
      link &&
      params.actorUserId &&
      params.actorUserId !== current.userId &&
      !params.canManage
    )
      throw new HTTPException(403, {
        message: "Você só pode alterar suas próprias horas de sites.",
      });
    const workspaceId = await guardSiteTime(
      tx,
      current.taskId,
      current.userId,
      startTime,
      endTime,
      timeEntryId,
    );
    const [row] = await tx
      .update(timeEntryTable)
      .set({
        startTime,
        endTime: endTime || null,
        duration,
        ...(description !== undefined ? { description } : {}),
      })
      .where(eq(timeEntryTable.id, timeEntryId))
      .returning();
    if (row && workspaceId && params.actorUserId)
      await audit(
        tx,
        workspaceId,
        params.actorUserId,
        row.id,
        "time-updated",
        current,
        row,
      );
    return row;
  });

  return updatedTimeEntry;
}

export default updateTimeEntry;
