import { useQuery } from "@tanstack/react-query";
import {
  type ContractListQuery,
  getCrmContract,
  getCrmContracts,
} from "@/fetchers/crm/contract";

export function useCrmContracts(query: ContractListQuery | undefined) {
  return useQuery({
    queryKey: ["crm", "contracts", query],
    queryFn: () => getCrmContracts(query as ContractListQuery),
    enabled: Boolean(query?.workspaceId),
  });
}

export function useCrmContract(
  contractId: string | undefined,
  workspaceId: string | undefined,
) {
  return useQuery({
    queryKey: ["crm", "contract", contractId],
    queryFn: () =>
      getCrmContract({
        contractId: contractId as string,
        workspaceId: workspaceId as string,
      }),
    enabled: Boolean(contractId && workspaceId),
  });
}
