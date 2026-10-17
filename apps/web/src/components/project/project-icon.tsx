import icons from "@/constants/project-icons";
import { cn } from "@/lib/cn";

type ProjectIconProps = {
  icon?: string | null;
  className?: string;
};

export function ProjectIcon({ icon, className }: ProjectIconProps) {
  const iconName = icon || "Layout";
  const LegacyIcon = icons[iconName as keyof typeof icons];

  if (LegacyIcon) {
    return <LegacyIcon className={cn("size-4", className)} />;
  }

  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex size-4 shrink-0 items-center justify-center text-base leading-none",
        className,
      )}
    >
      {iconName}
    </span>
  );
}
