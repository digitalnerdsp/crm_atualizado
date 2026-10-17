import { useQuery } from "@tanstack/react-query";
import {
  type AdminUsersQuery,
  getAdminUsers,
} from "@/fetchers/admin/get-admin-users";

export function useAdminUsers(query: AdminUsersQuery = {}) {
  return useQuery({
    queryKey: ["admin", "users", query],
    queryFn: () => getAdminUsers(query),
    retry: false,
    staleTime: 15_000,
  });
}
