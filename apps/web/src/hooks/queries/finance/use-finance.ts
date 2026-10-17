import { useQuery } from "@tanstack/react-query";
import {
  type FinanceFilters,
  getDashboard,
  getEntries,
  getMetadata,
} from "@/fetchers/finance";
export function useFinance(
  workspaceId: string,
  filters: FinanceFilters,
  page: number,
  enabled: boolean,
) {
  const metadata = useQuery({
    queryKey: ["finance", workspaceId, "metadata"],
    queryFn: () => getMetadata(workspaceId),
    enabled,
  });
  const entries = useQuery({
    queryKey: ["finance", workspaceId, "entries", filters, page],
    queryFn: () => getEntries(workspaceId, filters, page),
    enabled,
  });
  const dashboard = useQuery({
    queryKey: ["finance", workspaceId, "dashboard", filters],
    queryFn: () => getDashboard(workspaceId, filters),
    enabled,
  });
  return { metadata, entries, dashboard };
}
