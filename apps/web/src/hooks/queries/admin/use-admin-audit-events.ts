import { useQuery } from "@tanstack/react-query";
import {
  type AdminAuditQuery,
  getAdminAuditEvents,
} from "@/fetchers/admin/get-admin-audit-events";

export function useAdminAuditEvents(query: AdminAuditQuery = {}) {
  return useQuery({
    queryKey: ["admin", "audit", query],
    queryFn: () => getAdminAuditEvents(query),
    retry: false,
    staleTime: 10_000,
  });
}
