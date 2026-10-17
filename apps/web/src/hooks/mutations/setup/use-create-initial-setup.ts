import { useMutation } from "@tanstack/react-query";
import {
  createInitialSetup,
  type InitialSetupRequest,
} from "@/fetchers/setup/create-initial-setup";

export function useCreateInitialSetup() {
  return useMutation({
    mutationFn: (input: InitialSetupRequest) => createInitialSetup(input),
  });
}
