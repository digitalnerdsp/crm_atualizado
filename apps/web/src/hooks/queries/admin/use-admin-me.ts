import { useQuery } from "@tanstack/react-query";
import { getAdminMe } from "@/fetchers/admin/get-admin-me";

export function useAdminMe() {
  return useQuery({
    queryKey: ["admin", "me"],
    queryFn: getAdminMe,
    retry: false,
    staleTime: 60_000,
  });
}
