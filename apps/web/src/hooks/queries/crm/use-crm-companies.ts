import { useQuery } from "@tanstack/react-query";
import {
  type GetCompaniesQuery,
  getCompanies,
  getCompany,
} from "@/fetchers/crm/company";

export function useCrmCompanies(query: GetCompaniesQuery | undefined) {
  return useQuery({
    queryKey: ["crm", "companies", query],
    queryFn: () => getCompanies(query as GetCompaniesQuery),
    enabled: Boolean(query?.workspaceId),
  });
}

export function useCrmCompany(
  companyId: string | undefined,
  workspaceId: string | undefined,
) {
  return useQuery({
    queryKey: ["crm", "company", companyId],
    queryFn: () =>
      getCompany({
        companyId: companyId as string,
        workspaceId: workspaceId as string,
      }),
    enabled: Boolean(companyId && workspaceId),
  });
}
