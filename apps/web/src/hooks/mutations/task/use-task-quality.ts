import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  createChecklistItem,
  createCustomField,
  deleteChecklistItem,
  deleteCustomField,
  updateChecklistItem,
  updateCustomField,
} from "@/fetchers/task/task-quality";

export function useTaskQuality(taskId: string, projectId: string) {
  const queryClient = useQueryClient();
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["task", taskId] });
    void queryClient.invalidateQueries({ queryKey: ["tasks", projectId] });
  };

  return {
    createField: useMutation({
      mutationFn: (input: Parameters<typeof createCustomField>[1]) =>
        createCustomField(taskId, input),
      onSuccess: refresh,
    }),
    updateField: useMutation({
      mutationFn: ({
        fieldId,
        input,
      }: {
        fieldId: string;
        input: Parameters<typeof updateCustomField>[2];
      }) => updateCustomField(taskId, fieldId, input),
      onSuccess: refresh,
    }),
    deleteField: useMutation({
      mutationFn: (fieldId: string) => deleteCustomField(taskId, fieldId),
      onSuccess: refresh,
    }),
    createItem: useMutation({
      mutationFn: (input: Parameters<typeof createChecklistItem>[1]) =>
        createChecklistItem(taskId, input),
      onSuccess: refresh,
    }),
    updateItem: useMutation({
      mutationFn: ({
        itemId,
        input,
      }: {
        itemId: string;
        input: Parameters<typeof updateChecklistItem>[2];
      }) => updateChecklistItem(taskId, itemId, input),
      onSuccess: refresh,
    }),
    deleteItem: useMutation({
      mutationFn: (itemId: string) => deleteChecklistItem(taskId, itemId),
      onSuccess: refresh,
    }),
  };
}
