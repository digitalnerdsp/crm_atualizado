import { useQuery } from "@tanstack/react-query";
import { getAdminOverview } from "@/fetchers/admin/get-admin-overview";

export function useAdminOverview() {
  return useQuery({
    queryKey: ["admin", "overview"],
    queryFn: getAdminOverview,
    retry: false,
    staleTime: 30_000,
  });
}
