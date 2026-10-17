import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/lib/toast";
export function useHostingMutation<T = void, R = unknown>(
  mutationFn: (input: T) => Promise<R>,
  onSuccess?: (result: R) => void,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: async (result) => {
      await qc.invalidateQueries({ queryKey: ["crm"] });
      onSuccess?.(result);
    },
    onError: (error: Error) => toast.error(error.message),
  });
}
