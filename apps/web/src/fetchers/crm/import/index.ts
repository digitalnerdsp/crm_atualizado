import { client } from "@kaneo/libs";
import type { InferRequestType } from "hono/client";

export type ImportBatchPayload = InferRequestType<
  (typeof client)["crm"]["import"]["$post"]
>["json"];

export type ImportEntity = ImportBatchPayload["entity"];
export type DuplicatePolicy = NonNullable<ImportBatchPayload["policy"]>;

export type ImportRowOutcome = {
  line: number;
  status: "created" | "updated" | "skipped" | "error";
  message?: string;
  warnings?: string[];
  id?: string;
};

async function unwrap<T>(response: {
  ok: boolean;
  text: () => Promise<string>;
  json: () => Promise<T>;
}) {
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

export async function getCrmImportFields(workspaceId: string) {
  return unwrap(
    await client.crm.import.fields.$get({ query: { workspaceId } }),
  );
}

export async function previewCrmImport(json: ImportBatchPayload) {
  const result = await unwrap(await client.crm.import.preview.$post({ json }));
  return result as { rows: ImportRowOutcome[] };
}

export async function runCrmImport(json: ImportBatchPayload) {
  const result = await unwrap(await client.crm.import.$post({ json }));
  return result as { rows: ImportRowOutcome[] };
}
