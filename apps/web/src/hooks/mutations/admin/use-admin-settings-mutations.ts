import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  type TestAdminEmailSettingsRequest,
  testAdminEmailSettings,
} from "@/fetchers/admin/test-admin-email-settings";
import {
  type UpdateAdminSettingsRequest,
  updateAdminSettings,
} from "@/fetchers/admin/update-admin-settings";

export function useUpdateAdminSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdateAdminSettingsRequest) =>
      updateAdminSettings(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "settings"] });
      queryClient.invalidateQueries({ queryKey: ["config"] });
    },
  });
}

export function useTestAdminEmailSettings() {
  return useMutation({
    mutationFn: (input: TestAdminEmailSettingsRequest) =>
      testAdminEmailSettings(input),
  });
}
