export type GroupedBarsSeries = {
  key: string;
  label: string;
  color: string;
};

export type GroupedBarsRow = {
  key: string;
  label: string;
  values: Record<string, number>;
};

/**
 * Two or three bars side by side per period — the shape a forecast needs:
 * weighted pipeline next to what actually closed.
 *
 * Values are formatted by the caller, so this stays unaware of currency.
 */
export function GroupedBars({
  rows,
  series,
  formatValue,
  emptyLabel,
}: {
  rows: GroupedBarsRow[];
  series: GroupedBarsSeries[];
  formatValue: (value: number) => string;
  emptyLabel: string;
}) {
  if (rows.length === 0) {
    return <p className="py-6 text-sm text-muted-foreground">{emptyLabel}</p>;
  }

  const max = Math.max(
    ...rows.flatMap((row) => series.map((item) => row.values[item.key] ?? 0)),
    1,
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-4">
        {series.map((item) => (
          <span
            key={item.key}
            className="flex items-center gap-1.5 text-xs text-muted-foreground"
          >
            <span
              className="size-2 rounded-full"
              style={{ backgroundColor: item.color }}
            />
            {item.label}
          </span>
        ))}
      </div>

      <div className="overflow-x-auto">
        <div className="flex min-w-fit items-end gap-4">
          {rows.map((row) => (
            <div key={row.key} className="flex w-20 shrink-0 flex-col gap-1.5">
              <div className="flex h-32 items-end justify-center gap-1">
                {series.map((item) => {
                  const value = row.values[item.key] ?? 0;
                  return (
                    <div
                      key={item.key}
                      className="group relative flex h-full w-5 items-end"
                      title={`${item.label}: ${formatValue(value)}`}
                    >
                      <div
                        className="w-full rounded-t transition-[height] duration-300 ease-out"
                        style={{
                          // A 2px floor keeps a real-but-tiny value visible
                          // instead of reading as zero.
                          height: `${value === 0 ? 0 : Math.max(2, (value / max) * 100)}%`,
                          backgroundColor: item.color,
                        }}
                      />
                    </div>
                  );
                })}
              </div>
              <span className="text-center text-[11px] tabular-nums text-muted-foreground">
                {row.label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default GroupedBars;
