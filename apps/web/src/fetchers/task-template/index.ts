import { client } from "@kaneo/libs";

export async function getTaskTemplates(workspaceId: string) {
  const response = await client["task-template"].$get({
    query: { workspaceId },
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

export async function saveTaskAsTemplate(taskId: string, name: string) {
  const response = await client["task-template"]["from-task"][":id"].$post({
    param: { id: taskId },
    json: { name },
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

export async function instantiateTaskTemplate(
  templateId: string,
  projectId: string,
) {
  const response = await client["task-template"][":id"].instantiate[
    ":projectId"
  ].$post({
    param: { id: templateId, projectId },
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

export async function deleteTaskTemplate(
  templateId: string,
  workspaceId: string,
) {
  const response = await client["task-template"][":id"].$delete({
    param: { id: templateId },
    query: { workspaceId },
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}
