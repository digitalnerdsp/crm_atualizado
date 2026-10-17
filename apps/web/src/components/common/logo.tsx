import { Link } from "@tanstack/react-router";
import { useAppBranding } from "@/lib/branding";
import useProjectStore from "@/store/project";

type LogoProps = {
  className?: string;
};

export function Logo({ className = "" }: LogoProps) {
  const { setProject } = useProjectStore();
  const { appName } = useAppBranding();

  return (
    <Link
      onClick={() => {
        setProject(undefined);
      }}
      to="/dashboard"
      className={`w-auto text-foreground no-underline ${className}`}
      aria-label={appName}
    >
      <span className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className="flex size-7 items-center justify-center rounded-md bg-foreground font-semibold text-background text-sm"
        >
          {appName.slice(0, 1).toUpperCase()}
        </span>
        <span className="font-semibold text-lg leading-none tracking-normal">
          {appName}
        </span>
      </span>
    </Link>
  );
}
