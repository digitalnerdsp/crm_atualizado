import { client } from "@kaneo/libs";

async function updateTaskClient({
  taskId,
  crmCompanyId,
  crmDealId,
}: {
  taskId: string;
  crmCompanyId: string | null;
  crmDealId?: string | null;
}) {
  const response = await client.task.client[":id"].$put({
    param: { id: taskId },
    json: { crmCompanyId, crmDealId },
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
}

export default updateTaskClient;
