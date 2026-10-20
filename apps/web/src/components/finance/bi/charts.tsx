import { useId } from "react";
import { money } from "../shared";
export type Series = { key: string; label: string; color: string };
export function BiChart({
  title,
  rows,
  series,
  onPeriod,
}: {
  title: string;
  rows: { key: string; label: string; values: Record<string, number | null> }[];
  series: Series[];
  onPeriod?: (key: string) => void;
}) {
  const id = useId();
  const max = Math.max(
    1,
    ...rows.flatMap((r) => series.map((s) => Math.abs(r.values[s.key] ?? 0))),
  );
  const negative = rows.some((r) =>
    series.some((s) => (r.values[s.key] ?? 0) < 0),
  );
  const zero = negative ? 150 : 250;
  const h = negative ? 110 : 210;
  const w = Math.max(650, rows.length * 60);
  const step = (w - 115) / Math.max(1, rows.length);
  const bw = Math.min(20, step / (series.length + 1));
  return (
    <section className="min-w-0 rounded-xl border bg-card p-5">
      <h2 id={id} className="font-semibold">
        {title}
      </h2>
      <div className="my-4 flex flex-wrap gap-4 text-xs text-muted-foreground">
        {series.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5">
            <i
              className="size-2 rounded-full"
              style={{ background: s.color }}
            />
            {s.label}
          </span>
        ))}
      </div>
      {!rows.length ? (
        <p className="py-12 text-sm text-muted-foreground">
          Sem dados para o período.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <svg
            role="img"
            aria-labelledby={id}
            viewBox={`0 0 ${w} 295`}
            style={{ minWidth: w }}
            className="h-64 w-full"
          >
            <title>{title}</title>
            {[0, 0.5, 1].map((n) => (
              <g key={n}>
                <line
                  x1="110"
                  x2={w}
                  y1={zero - n * h}
                  y2={zero - n * h}
                  stroke="currentColor"
                  opacity=".12"
                />
                <text
                  x="0"
                  y={zero - n * h - 5}
                  fill="currentColor"
                  fontSize="9"
                  opacity=".6"
                >
                  {money(n * max)}
                </text>
              </g>
            ))}
            {rows.map((r, i) => (
              <g key={r.key}>
                {series.map((s, j) => {
                  const value = r.values[s.key];
                  const height = (Math.abs(value ?? 0) / max) * h;
                  return (
                    <rect
                      key={s.key}
                      x={115 + i * step + j * bw}
                      y={(value ?? 0) >= 0 ? zero - height : zero}
                      width={Math.max(2, bw - 3)}
                      height={height}
                      rx="2"
                      fill={s.color}
                    >
                      <title>
                        {r.label} · {s.label}:{" "}
                        {value === null
                          ? "Sem histórico / futuro"
                          : money(value ?? 0)}
                      </title>
                    </rect>
                  );
                })}
                <text
                  x={115 + i * step}
                  y="282"
                  fill="currentColor"
                  fontSize="9"
                  opacity=".7"
                >
                  {r.label}
                </text>
              </g>
            ))}
          </svg>
        </div>
      )}
      {onPeriod && (
        <fieldset
          className="mt-3 flex max-h-20 flex-wrap gap-1 overflow-y-auto"
          aria-label="Investigar período"
        >
          {rows.map((r) => (
            <button
              type="button"
              key={r.key}
              onClick={() => onPeriod(r.key)}
              className="rounded border px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
            >
              {r.label}
            </button>
          ))}
        </fieldset>
      )}
    </section>
  );
}
export function Breakdown({
  title,
  rows,
  onSelect,
}: {
  title: string;
  rows: { label: string; value: number; id?: string }[];
  onSelect?: (id: string) => void;
}) {
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.value)));
  return (
    <section className="min-w-0 rounded-xl border bg-card p-5">
      <h2 className="mb-5 font-semibold">{title}</h2>
      <div className="space-y-4">
        {rows.map((r) => (
          <div key={r.id ?? r.label}>
            <div className="mb-1.5 flex items-start justify-between gap-3 text-sm">
              <span className="min-w-0 break-words">
                {onSelect && r.id ? (
                  <button
                    type="button"
                    className="text-left underline-offset-4 hover:underline"
                    onClick={() => onSelect(r.id ?? "")}
                  >
                    {r.label}
                  </button>
                ) : (
                  r.label
                )}
              </span>
              <span
                className={`shrink-0 tabular-nums ${r.value < 0 ? "text-destructive" : ""}`}
              >
                {money(r.value)}
              </span>
            </div>
            <div className="h-2 rounded-full bg-muted">
              <div
                className="h-2 rounded-full"
                style={{
                  width: `${(Math.abs(r.value) / max) * 100}%`,
                  background: r.value < 0 ? "#e65c6f" : "#3b82f6",
                }}
                title={money(r.value)}
              />
            </div>
          </div>
        ))}
        {!rows.length && (
          <p className="text-sm text-muted-foreground">
            Sem registros no recorte.
          </p>
        )}
      </div>
    </section>
  );
}
