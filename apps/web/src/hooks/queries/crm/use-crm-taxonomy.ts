import { useQuery } from "@tanstack/react-query";
import {
  type CompanyCitiesQuery,
  getCrmCompanyCities,
  getCrmSegments,
  getCrmSources,
} from "@/fetchers/crm/taxonomy";

/** Formulários pedem só as ativas; a tela de configuração pede todas, senão
 * uma origem desativada some e não há de onde reativá-la. */
export function useCrmSources(
  workspaceId: string | undefined,
  includeInactive = false,
) {
  return useQuery({
    queryKey: ["crm", "sources", workspaceId, includeInactive],
    queryFn: () => getCrmSources(workspaceId as string, includeInactive),
    enabled: Boolean(workspaceId),
  });
}

export function useCrmSegments(
  workspaceId: string | undefined,
  includeInactive = false,
) {
  return useQuery({
    queryKey: ["crm", "segments", workspaceId, includeInactive],
    queryFn: () => getCrmSegments(workspaceId as string, includeInactive),
    enabled: Boolean(workspaceId),
  });
}

/** Cidades já digitadas no workspace, para o autocomplete do cadastro. */
export function useCrmCompanyCities(
  workspaceId: string | undefined,
  state?: CompanyCitiesQuery["state"],
) {
  return useQuery({
    queryKey: ["crm", "cities", workspaceId, state ?? null],
    queryFn: () =>
      getCrmCompanyCities({ workspaceId: workspaceId as string, state }),
    enabled: Boolean(workspaceId),
  });
}
