import { client } from "@kaneo/libs";
import type { InferResponseType } from "hono/client";

export type AdminAuditResponse = InferResponseType<
  (typeof client)["admin"]["audit"]["$get"]
>;

export type AdminAuditEvent = AdminAuditResponse["events"][number];

export type AdminAuditQuery = {
  q?: string;
  action?: string;
  entityType?: string;
  actorUserId?: string;
  from?: string;
  to?: string;
  limit?: string;
};

export async function getAdminAuditEvents(query: AdminAuditQuery = {}) {
  const response = await client.admin.audit.$get({ query });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }

  return response.json();
}
