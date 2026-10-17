import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/lib/toast";
export function useFinanceMutation<T = void>(
  workspaceId: string,
  mutationFn: (input: T) => Promise<unknown>,
  onSuccess?: () => void,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["finance", workspaceId] });
      toast.success("Operação concluída.");
      onSuccess?.();
    },
    onError: (error: Error) => toast.error(error.message),
  });
}
