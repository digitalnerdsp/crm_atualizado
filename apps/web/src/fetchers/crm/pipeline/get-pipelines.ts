import { client } from "@kaneo/libs";

async function getCrmPipelines(workspaceId: string) {
  const response = await client.crm.pipeline.$get({ query: { workspaceId } });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
}

export default getCrmPipelines;
