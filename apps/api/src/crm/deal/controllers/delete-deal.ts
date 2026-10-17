import { and, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../../database";
import { crmDealTable } from "../../../database/schema";
import { publishEvent } from "../../../events";

async function deleteDeal({
  workspaceId,
  dealId,
}: {
  workspaceId: string;
  dealId: string;
}) {
  // Cascades to the deal's activities, stage history and project links; the
  // projects themselves survive.
  const [deleted] = await db
    .delete(crmDealTable)
    .where(
      and(
        eq(crmDealTable.id, dealId),
        eq(crmDealTable.workspaceId, workspaceId),
      ),
    )
    .returning();

  if (!deleted) {
    throw new HTTPException(404, { message: "Deal not found" });
  }

  await publishEvent("crm.deal.deleted", {
    dealId: deleted.id,
    workspaceId,
    pipelineId: deleted.pipelineId,
  });

  return deleted;
}

export default deleteDeal;
