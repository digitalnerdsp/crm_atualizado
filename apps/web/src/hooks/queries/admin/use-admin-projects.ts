import { useQuery } from "@tanstack/react-query";
import {
  type AdminProjectsQuery,
  getAdminProjects,
} from "@/fetchers/admin/get-admin-projects";

export function useAdminProjects(query: AdminProjectsQuery = {}) {
  return useQuery({
    queryKey: ["admin", "projects", query],
    queryFn: () => getAdminProjects(query),
    retry: false,
    staleTime: 15_000,
  });
}
