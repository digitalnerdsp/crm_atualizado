import { Github, KeyRound } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import type { GetConfigResponse } from "@/fetchers/config/get-config";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/cn";
import { toast } from "@/lib/toast";

type Props = {
  config: GetConfigResponse | undefined;
  callbackURL: string;
  errorCallbackURL: string;
  lastLoginMethod?: string | null;
  disabled?: boolean;
};

export function SSOProviders({
  config,
  callbackURL,
  errorCallbackURL,
  lastLoginMethod,
  disabled = false,
}: Props) {
  const { t } = useTranslation();
  const [loadingProvider, setLoadingProvider] = useState<string | null>(null);

  const handleSocial = async (
    provider: "google" | "github",
    errorKey: string,
  ) => {
    setLoadingProvider(provider);
    try {
      const result = await authClient.signIn.social({
        provider,
        callbackURL,
        errorCallbackURL,
      });
      if (result.error) throw new Error(result.error.message);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t(errorKey));
    } finally {
      setLoadingProvider(null);
    }
  };

  const handleCustomOAuth = async () => {
    setLoadingProvider("custom");
    try {
      const result = await authClient.signIn.oauth2({
        providerId: "custom",
        callbackURL,
        errorCallbackURL,
      });
      if (result.error) throw new Error(result.error.message);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("auth:signIn.oidcError"),
      );
    } finally {
      setLoadingProvider(null);
    }
  };

  const hasAny =
    config?.hasGoogleSignIn ||
    config?.hasGithubSignIn ||
    config?.hasCustomOAuth;

  if (!hasAny) return null;

  return (
    <div className="space-y-3">
      {config?.hasGoogleSignIn && (
        <ProviderButton
          providerId="google"
          disabled={disabled}
          isLoading={loadingProvider === "google"}
          isLastUsed={lastLoginMethod === "google"}
          onClick={() => handleSocial("google", "auth:signIn.googleError")}
          label={t("auth:signIn.continueWithGoogle")}
          loadingLabel={t("auth:signIn.signingIn")}
          icon={
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              className="w-5 h-5 mr-2"
              aria-label={t("auth:providers.google")}
            >
              <title>Google</title>
              <path
                d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z"
                fill="currentColor"
              />
            </svg>
          }
        />
      )}
      {config?.hasGithubSignIn && (
        <ProviderButton
          providerId="github"
          disabled={disabled}
          isLoading={loadingProvider === "github"}
          isLastUsed={lastLoginMethod === "github"}
          onClick={() => handleSocial("github", "auth:signIn.githubError")}
          label={t("auth:signIn.continueWithGithub")}
          loadingLabel={t("auth:signIn.signingIn")}
          icon={<Github className="w-5 h-5 mr-2" />}
        />
      )}
      {config?.hasCustomOAuth && (
        <ProviderButton
          providerId="custom"
          disabled={disabled}
          isLoading={loadingProvider === "custom"}
          isLastUsed={lastLoginMethod === "custom"}
          onClick={handleCustomOAuth}
          label={t("auth:signIn.continueWithOidc")}
          loadingLabel={t("auth:signIn.signingIn")}
          icon={<KeyRound className="w-5 h-5 mr-2" />}
        />
      )}
    </div>
  );
}

function ProviderButton({
  providerId,
  icon,
  label,
  loadingLabel,
  isLoading,
  isLastUsed,
  onClick,
  disabled = false,
}: {
  providerId: string;
  icon: React.ReactNode;
  label: string;
  loadingLabel: string;
  isLoading: boolean;
  isLastUsed: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="relative">
      <Button
        variant="outline"
        onClick={onClick}
        disabled={isLoading || disabled}
        className={cn("w-full", isLastUsed && "border-primary/50!")}
        data-provider={providerId}
      >
        {icon}
        {isLoading ? loadingLabel : label}
      </Button>
      {isLastUsed && (
        <span className="absolute rounded-md -top-3 right-1 px-1.5 text-xs text-primary font-medium bg-sidebar border border-primary/50">
          {t("auth:signIn.lastUsed")}
        </span>
      )}
    </div>
  );
}
