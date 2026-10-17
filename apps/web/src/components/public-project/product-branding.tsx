import { useTranslation } from "react-i18next";
import { useAppBranding } from "@/lib/branding";

export function ProductBranding() {
  const { t } = useTranslation();
  const { appName } = useAppBranding();

  return (
    <span className="transition-colors">
      {t("publicProject:branding.poweredBy")}{" "}
      <span className="font-medium">{appName}</span>
    </span>
  );
}
