import { client } from "@kaneo/libs";

type BulkOperationType =
  | "updateStatus"
  | "updatePriority"
  | "updateAssignee"
  | "addAssignees"
  | "removeAssignees"
  | "delete"
  | "addLabel"
  | "removeLabel"
  | "updateDueDate";

async function bulkOperation({
  taskIds,
  operation,
  value,
  assigneeIds,
}: {
  taskIds: string[];
  operation: BulkOperationType;
  value?: string | null;
  assigneeIds?: string[];
}) {
  const response = await client.task.bulk.$patch({
    json: { taskIds, operation, value, assigneeIds },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }

  return response.json();
}

export default bulkOperation;
