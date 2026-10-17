import { client } from "@kaneo/libs";
import type { InferRequestType } from "hono/client";

export type GetContactsQuery = InferRequestType<
  (typeof client)["crm"]["contact"]["$get"]
>["query"];

export type CreateContactPayload = InferRequestType<
  (typeof client)["crm"]["contact"]["$post"]
>["json"];

export type UpdateContactPayload = InferRequestType<
  (typeof client)["crm"]["contact"][":contactId"]["$patch"]
>["json"];

async function unwrap<T>(response: {
  ok: boolean;
  text: () => Promise<string>;
  json: () => Promise<T>;
}) {
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

export async function getContacts(query: GetContactsQuery) {
  return unwrap(await client.crm.contact.$get({ query }));
}

export async function getContact({
  contactId,
  workspaceId,
}: {
  contactId: string;
  workspaceId: string;
}) {
  return unwrap(
    await client.crm.contact[":contactId"].$get({
      param: { contactId },
      query: { workspaceId },
    }),
  );
}

export async function createContact(json: CreateContactPayload) {
  return unwrap(await client.crm.contact.$post({ json }));
}

export async function updateContact(
  contactId: string,
  json: UpdateContactPayload,
) {
  return unwrap(
    await client.crm.contact[":contactId"].$patch({
      param: { contactId },
      json,
    }),
  );
}

export async function deleteContact({
  contactId,
  workspaceId,
}: {
  contactId: string;
  workspaceId: string;
}) {
  return unwrap(
    await client.crm.contact[":contactId"].$delete({
      param: { contactId },
      query: { workspaceId },
    }),
  );
}

/**
 * Streams the CSV straight to a download. The endpoint is cookie-authenticated,
 * so the browser can fetch it without the RPC client.
 */
export async function exportContacts(workspaceId: string) {
  const response = await client.crm.contact.export.$get({
    query: { workspaceId },
  });

  if (!response.ok) throw new Error(await response.text());

  return response.blob();
}
