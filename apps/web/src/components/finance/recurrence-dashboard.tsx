import { GroupedBars } from "@/components/crm/charts/grouped-bars";
import type { RecurrenceReport } from "@/fetchers/finance/recurrence";
import { dateLabel, money } from "./shared";
export function RecurrenceDashboard({
  data,
  onList,
}: {
  data: RecurrenceReport;
  onList: () => void;
}) {
  const metrics: [keyof RecurrenceReport["current"], string, boolean][] = [
    ["mrrCents", "Receita recorrente mensal", true],
    ["activeContracts", "Contratos ativos", false],
    ["expiringContracts", "Contratos a vencer", false],
    ["projectedCents", "Previsto para o período", true],
    ["billedCents", "Cobrado no período", true],
    ["receivedCents", "Recebido no período", true],
    ["outstandingCents", "Saldo em aberto", true],
  ];
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map(([key, label, isMoney]) => {
          const value = data.current[key];
          const prior = data.previous[key];
          const unavailable =
            key === "mrrCents" && data.previous.historyUnavailable > 0;
          const delta =
            !prior || unavailable
              ? null
              : ((value - prior) / Math.abs(prior)) * 100;
          return (
            <button
              type="button"
              key={key}
              onClick={onList}
              className="rounded-xl border bg-card p-5 text-left hover:bg-muted/40"
            >
              <span className="block text-sm text-muted-foreground">
                {label}
              </span>
              <strong className="mt-3 block text-2xl tabular-nums">
                {isMoney ? money(value) : value}
              </strong>
              <span className="mt-2 block text-xs text-muted-foreground">
                {delta === null
                  ? "Comparação não aplicável"
                  : `${delta > 0 ? "+" : ""}${delta.toFixed(1)}%`}{" "}
                · anterior{" "}
                {unavailable
                  ? "Não disponível"
                  : isMoney
                    ? money(prior)
                    : prior}
              </span>
            </button>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        Referência {dateLabel(data.referenceDate)}. Comparação com{" "}
        {dateLabel(data.previousPeriod.from)} a{" "}
        {dateLabel(data.previousPeriod.to)}. Valores cobrados usam a competência
        do ciclo; recebidos usam a data efetiva da baixa.
      </p>
      {(data.current.historyUnavailable > 0 ||
        data.previous.historyUnavailable > 0) && (
        <p className="rounded-lg border p-3 text-sm">
          Há contratos sem versões históricas de serviços para esta comparação.
          O sistema sinaliza a ausência dessa informação e não estima preços
          antigos.
        </p>
      )}
      <div className="grid gap-4 xl:grid-cols-2">
        <section className="rounded-xl border p-5">
          <h2 className="mb-4 font-semibold">Previsto × cobrado × recebido</h2>
          <GroupedBars
            rows={data.months.map((m) => ({
              key: m.month,
              label: m.month.split("-").reverse().join("/"),
              values: {
                projected: m.projectedCents,
                billed: m.billedCents,
                received: m.receivedCents,
              },
            }))}
            series={[
              { key: "projected", label: "Previsto", color: "#94a3b8" },
              { key: "billed", label: "Cobrado", color: "#2563eb" },
              { key: "received", label: "Recebido", color: "#16a34a" },
            ]}
            formatValue={money}
            emptyLabel="Sem movimentação no período."
          />
        </section>
        <section className="rounded-xl border p-5">
          <h2 className="mb-4 font-semibold">Evolução da receita recorrente</h2>
          <GroupedBars
            rows={data.months.map((m) => ({
              key: m.month,
              label: m.month.split("-").reverse().join("/"),
              values: { mrr: m.mrrCents },
            }))}
            series={[
              { key: "mrr", label: "Equivalente mensal", color: "#8b5cf6" },
            ]}
            formatValue={money}
            emptyLabel="Sem histórico disponível."
          />
        </section>
        <section className="rounded-xl border p-5 xl:col-span-2">
          <h2 className="mb-4 font-semibold">Prazos de contratos ativos</h2>
          <GroupedBars
            rows={data.expiry.map((r, i) => ({
              key: String(i),
              label: r.label,
              values: { contracts: r.count },
            }))}
            series={[
              { key: "contracts", label: "Contratos", color: "#f59e0b" },
            ]}
            formatValue={(v) => `${v} contratos`}
            emptyLabel="Sem contratos próximos do término."
          />
        </section>
      </div>
      <p className="text-xs text-muted-foreground">{data.historyNote}</p>
      {data.excludedCurrencies > 0 && (
        <p className="text-sm">
          {data.excludedCurrencies} contratos em outra moeda foram excluídos dos
          totais em BRL.
        </p>
      )}
    </div>
  );
}
