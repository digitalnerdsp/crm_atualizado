import { useQuery } from "@tanstack/react-query";
import { getAdminRoles } from "@/fetchers/admin/get-admin-roles";

export function useAdminRoles() {
  return useQuery({
    queryKey: ["admin", "roles"],
    queryFn: getAdminRoles,
    retry: false,
    staleTime: 15_000,
  });
}
