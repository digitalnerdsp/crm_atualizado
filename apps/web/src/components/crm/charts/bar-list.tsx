import type { ReactNode } from "react";

export type BarListItem = {
  key: string;
  label: ReactNode;
  value: number;
  /** Shown at the right of the row; falls back to the raw value. */
  display?: ReactNode;
  color?: string;
};

/**
 * A horizontal bar per row, sized against the largest value.
 *
 * Hand-built rather than pulled from a charting library: these reports need
 * bars and grouped bars, and the repo has been actively shrinking its bundle
 * (see the `perf: reduce frontend bundle footprint` commits). A ~100KB
 * dependency for this would pull in the opposite direction.
 */
export function BarList({
  items,
  emptyLabel,
}: {
  items: BarListItem[];
  emptyLabel: string;
}) {
  if (items.length === 0) {
    return <p className="py-6 text-sm text-muted-foreground">{emptyLabel}</p>;
  }

  const max = Math.max(...items.map((item) => item.value), 1);

  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li key={item.key} className="space-y-1">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate">{item.label}</span>
            <span className="shrink-0 tabular-nums text-muted-foreground">
              {item.display ?? item.value}
            </span>
          </div>
          <div
            className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
            role="presentation"
          >
            <div
              className="h-full rounded-full transition-[width] duration-300 ease-out"
              style={{
                width: `${Math.max(2, (item.value / max) * 100)}%`,
                backgroundColor: item.color ?? "var(--primary)",
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

export default BarList;
