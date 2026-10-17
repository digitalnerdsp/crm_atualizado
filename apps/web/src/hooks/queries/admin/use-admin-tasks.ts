import { useQuery } from "@tanstack/react-query";
import {
  type AdminTasksQuery,
  getAdminTasks,
} from "@/fetchers/admin/get-admin-tasks";

export function useAdminTasks(query: AdminTasksQuery = {}) {
  return useQuery({
    queryKey: ["admin", "tasks", query],
    queryFn: () => getAdminTasks(query),
    retry: false,
    staleTime: 15_000,
  });
}
