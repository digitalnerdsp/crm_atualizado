import { useMutation } from "@tanstack/react-query";
import createProject from "@/fetchers/project/create-project";

function useCreateProject({
  name,
  slug,
  workspaceId,
  icon,
  templateIds,
}: {
  name: string;
  slug: string;
  workspaceId: string;
  icon: string;
  templateIds?: string[];
}) {
  return useMutation({
    mutationFn: () =>
      createProject({ name, slug, workspaceId, icon, templateIds }),
  });
}

export default useCreateProject;
