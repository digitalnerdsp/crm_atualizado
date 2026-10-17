import { useQuery } from "@tanstack/react-query";
import {
  type GetContactsQuery,
  getContact,
  getContacts,
} from "@/fetchers/crm/contact";

export function useCrmContacts(query: GetContactsQuery | undefined) {
  return useQuery({
    queryKey: ["crm", "contacts", query],
    queryFn: () => getContacts(query as GetContactsQuery),
    enabled: Boolean(query?.workspaceId),
  });
}

export function useCrmContact(
  contactId: string | undefined,
  workspaceId: string | undefined,
) {
  return useQuery({
    queryKey: ["crm", "contact", contactId],
    queryFn: () =>
      getContact({
        contactId: contactId as string,
        workspaceId: workspaceId as string,
      }),
    enabled: Boolean(contactId && workspaceId),
  });
}
