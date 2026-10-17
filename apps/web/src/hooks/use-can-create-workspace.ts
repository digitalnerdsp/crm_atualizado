import useAuth from "@/components/providers/auth-provider/hooks/use-auth";
import useGetConfig from "@/hooks/queries/config/use-get-config";

export function useCanCreateWorkspace() {
  const { user } = useAuth();
  const { data: config, isLoading } = useGetConfig();
  const role = user?.role;
  const policy = config?.workspaceCreationPolicy;

  return {
    canCreateWorkspace:
      policy === "any_user" ||
      role === "superadmin" ||
      (policy === "admin" && role === "admin"),
    isLoading,
  };
}
