import { client } from "@kaneo/libs";

async function readError(response: Response) {
  throw new Error(await response.text());
}

export async function createCustomField(
  taskId: string,
  input: {
    name: string;
    type: "text" | "number" | "date" | "url" | "checkbox";
    value?: string;
    showOnCard?: boolean;
  },
) {
  const response = await client.task["custom-fields"][":id"].$post({
    param: { id: taskId },
    json: input,
  });
  if (!response.ok) return readError(response);
  return response.json();
}

export async function updateCustomField(
  taskId: string,
  fieldId: string,
  input: {
    name?: string;
    type?: "text" | "number" | "date" | "url" | "checkbox";
    value?: string;
    showOnCard?: boolean;
    position?: number;
  },
) {
  const response = await client.task["custom-fields"][":id"][":fieldId"].$patch(
    {
      param: { id: taskId, fieldId },
      json: input,
    },
  );
  if (!response.ok) return readError(response);
  return response.json();
}

export async function deleteCustomField(taskId: string, fieldId: string) {
  const response = await client.task["custom-fields"][":id"][
    ":fieldId"
  ].$delete({
    param: { id: taskId, fieldId },
  });
  if (!response.ok) return readError(response);
  return response.json();
}

export async function createChecklistItem(
  taskId: string,
  input: {
    title: string;
    isRequired?: boolean;
    requiredBeforeColumnId?: string | null;
  },
) {
  const response = await client.task.checklist[":id"].$post({
    param: { id: taskId },
    json: input,
  });
  if (!response.ok) return readError(response);
  return response.json();
}

export async function updateChecklistItem(
  taskId: string,
  itemId: string,
  input: {
    title?: string;
    isCompleted?: boolean;
    isRequired?: boolean;
    requiredBeforeColumnId?: string | null;
    position?: number;
  },
) {
  const response = await client.task.checklist[":id"][":itemId"].$patch({
    param: { id: taskId, itemId },
    json: input,
  });
  if (!response.ok) return readError(response);
  return response.json();
}

export async function deleteChecklistItem(taskId: string, itemId: string) {
  const response = await client.task.checklist[":id"][":itemId"].$delete({
    param: { id: taskId, itemId },
  });
  if (!response.ok) return readError(response);
  return response.json();
}
