import { useEffect } from "react";
import { useAppBranding } from "@/lib/branding";

type PageTitleProps = {
  title: string;
  suffix?: string;
  hideAppName?: boolean;
};

export default function PageTitle({
  title,
  suffix,
  hideAppName = false,
}: PageTitleProps) {
  const { appName } = useAppBranding();
  const resolvedSuffix = suffix ?? appName;

  useEffect(() => {
    const formattedTitle = hideAppName
      ? title
      : resolvedSuffix
        ? `${title} — ${resolvedSuffix}`
        : title;
    document.title = formattedTitle;
  }, [title, resolvedSuffix, hideAppName]);

  return null;
}
