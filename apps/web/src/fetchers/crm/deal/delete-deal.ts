import { client } from "@kaneo/libs";

async function deleteDeal({
  dealId,
  workspaceId,
}: {
  dealId: string;
  workspaceId: string;
}) {
  const response = await client.crm.deal[":dealId"].$delete({
    param: { dealId },
    query: { workspaceId },
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
}

export default deleteDeal;
