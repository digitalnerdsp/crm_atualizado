import useGetConfig from "@/hooks/queries/config/use-get-config";

export const DEFAULT_APP_NAME = "Nortys";
export const DEFAULT_APP_DESCRIPTION =
  "Private workspace, project, and task management.";

export function useAppBranding() {
  const { data: config } = useGetConfig();

  return {
    appName: config?.appName || DEFAULT_APP_NAME,
    appDescription: config?.appDescription || DEFAULT_APP_DESCRIPTION,
  };
}
