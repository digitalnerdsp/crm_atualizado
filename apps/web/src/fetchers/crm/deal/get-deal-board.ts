import { client } from "@kaneo/libs";

export type GetDealBoardParams = {
  workspaceId: string;
  pipelineId?: string;
  ownerUserId?: string;
  search?: string;
};

async function getDealBoard({
  workspaceId,
  pipelineId,
  ownerUserId,
  search,
}: GetDealBoardParams) {
  const response = await client.crm.deal.board.$get({
    query: {
      workspaceId,
      ...(pipelineId ? { pipelineId } : {}),
      ...(ownerUserId ? { ownerUserId } : {}),
      ...(search ? { search } : {}),
    },
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
}

export default getDealBoard;
