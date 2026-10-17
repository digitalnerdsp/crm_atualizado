import { useQuery } from "@tanstack/react-query";
import { getAdminSettings } from "@/fetchers/admin/get-admin-settings";

export function useAdminSettings() {
  return useQuery({
    queryKey: ["admin", "settings"],
    queryFn: getAdminSettings,
    retry: false,
    staleTime: 15_000,
  });
}
