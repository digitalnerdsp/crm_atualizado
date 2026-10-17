import type { ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * One report per card, with its own loading state — seven endpoints resolve at
 * their own pace and the page should not wait for the slowest.
 */
export function ReportCard({
  title,
  hint,
  action,
  isLoading,
  children,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
  isLoading?: boolean;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <header className="mb-4 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-sm font-medium">{title}</h2>
          {hint ? (
            <p className="mt-0.5 max-w-prose text-xs text-muted-foreground">
              {hint}
            </p>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </header>

      {isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((index) => (
            <Skeleton key={`report-row-${index}`} className="h-6 w-full" />
          ))}
        </div>
      ) : (
        children
      )}
    </section>
  );
}

export default ReportCard;
