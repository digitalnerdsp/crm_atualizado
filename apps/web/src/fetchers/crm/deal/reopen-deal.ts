import { client } from "@kaneo/libs";

async function reopenDeal({
  dealId,
  workspaceId,
  stageId,
}: {
  dealId: string;
  workspaceId: string;
  stageId?: string;
}) {
  const response = await client.crm.deal[":dealId"].reopen.$post({
    param: { dealId },
    json: { workspaceId, ...(stageId ? { stageId } : {}) },
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
}

export default reopenDeal;
