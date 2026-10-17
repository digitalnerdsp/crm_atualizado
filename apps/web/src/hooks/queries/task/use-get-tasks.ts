import { useQuery } from "@tanstack/react-query";
import getTasks from "@/fetchers/task/get-tasks";

export function useGetTasks(projectId: string) {
  return useQuery({
    queryKey: ["tasks", projectId],
    queryFn: () => getTasks(projectId),
    staleTime: 15_000,
    refetchOnWindowFocus: true,
    enabled: !!projectId,
  });
}
