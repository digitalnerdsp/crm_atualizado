import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type CreateSalePayload, createSale } from "@/fetchers/crm/sale";

export function useCreateSale() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateSalePayload) => createSale(payload),
    // A venda mexe em negócios, contratos e empresa (vira cliente ativo).
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["crm"] }),
  });
}
